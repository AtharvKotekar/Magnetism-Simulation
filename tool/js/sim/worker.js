// Lightweight visual simulation worker.
//
// This intentionally cheats. The project needs controllable film output, not a
// granular physics solver. We keep the old render-buffer contract so the WebGL
// renderer and recorder still work, but the worker now drives a simple,
// deterministic stage animation:
//   center-weighted sprinkle -> local 1/r field response -> broken circular chains.

import { TimelineRunner } from './timeline.js';
import { DEFAULT_PARAMS } from './units.js';
import { RNG } from './rng.js';

const FLOATS_PER = 8;
const ASLEEP = 0;
const AWAKE = 1;
const PI2 = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const RADIAL_STEP = 0.7548776662466927;

let engine = null;
let timeline = null;
let buffers = [];
let previewStride = 1;
let simAccum = 0;

function ensureBuffer(n) {
  const need = Math.max(1, n) * FLOATS_PER * 4;
  for (let k = 0; k < buffers.length; k++) {
    if (buffers[k].byteLength >= need) return buffers.splice(k, 1)[0];
  }
  return new ArrayBuffer(Math.ceil(need * 1.25));
}

function snapshot(stride = 1) {
  const st = engine.st, n = st.n;
  const safeStride = Math.max(1, stride | 0);
  const drawn = Math.ceil(n / safeStride);
  const buf = ensureBuffer(drawn);
  const f = new Float32Array(buf, 0, drawn * FLOATS_PER);
  for (let i = 0, o = 0; i < n; i += safeStride, o += FLOATS_PER) {
    f[o] = st.px[i];
    f[o + 1] = st.py[i];
    f[o + 2] = st.pz[i];
    f[o + 3] = Math.cos(st.ang[i]);
    f[o + 4] = Math.sin(st.ang[i]);
    f[o + 5] = st.len[i];
    f[o + 6] = st.wid[i];
    f[o + 7] = st.glint[i] * 0.499 + (st.state[i] === ASLEEP ? 0 : 0.5);
  }
  return { buf, n: drawn, total: n, stride: safeStride };
}

function stepAndReply(dt, kind, stride = 1, steps = 1) {
  const t0 = performance.now();
  const nSteps = Math.max(1, steps | 0);
  const subDt = dt / nSteps;
  for (let s = 0; s < nSteps; s++) {
    timeline.dispatchUpTo(engine.time);
    engine.advance(subDt);
    timeline.dispatchUpTo(engine.time);
  }
  const { buf, n, total, stride: renderStride } = snapshot(stride);
  postMessage({
    type: kind,
    buffer: buf,
    count: n,
    total,
    renderStride,
    time: engine.time,
    current: engine.currentValue(),
    awake: engine.awakeCount,
    tapAge: engine.time - engine.lastTapTime,
    tapStrength: engine.lastTapStrength,
    tapSerial: engine.tapSerial,
    nSub: 1,
    tNb: 0,
    tSub: +(performance.now() - t0).toFixed(1),
  }, [buf]);
}

class VisualEngine {
  constructor(params) {
    this.p = { ...params };
    this.maxN = Math.min(this.p.maxParticles || 120000, this.p.maxVisualParticles || 8000);
    this.st = new VisualState(this.maxN);
    this.rng = new RNG(this.p.seed);
    this.time = 0;
    this.awakeCount = 0;
    this.hasTapped = false;
    this.tapWasLive = false;
    this.nextAutoTap = Infinity;
    this.lastTapTime = -Infinity;
    this.lastTapStrength = 0;
    this.tapSerial = 0;
    this.current = {
      mode: this.p.currentMode || 'dc',
      freq: this.p.acFreq || 5,
      from: 0,
      target: 0,
      start: 0,
      rampDur: this.p.rampDur || 0.4,
      value: 0,
    };
  }

  reset(seed) {
    this.st.clear();
    this.rng = new RNG(seed >>> 0);
    this.time = 0;
    this.awakeCount = 0;
    this.hasTapped = false;
    this.tapWasLive = false;
    this.nextAutoTap = Infinity;
    this.lastTapTime = -Infinity;
    this.lastTapStrength = 0;
    this.tapSerial = 0;
    this.current = {
      mode: this.p.currentMode || 'dc',
      freq: this.p.acFreq || 5,
      from: 0,
      target: 0,
      start: 0,
      rampDur: this.p.rampDur || 0.4,
      value: 0,
    };
  }

  setParams(patch) {
    const oldMedian = this.p.filingMedianL || DEFAULT_PARAMS.filingMedianL;
    Object.assign(this.p, patch);
    if ('currentMode' in patch) this.current.mode = patch.currentMode;
    if ('acFreq' in patch) this.current.freq = patch.acFreq;
    if ('autoTapRate' in patch) this.scheduleAutoTap();
    if ('filingMedianL' in patch) this.rescaleFilings(oldMedian);
    if ('holeWallR' in patch || 'holeX' in patch || 'holeY' in patch ||
        'poleAX' in patch || 'poleAY' in patch || 'poleBX' in patch || 'poleBY' in patch) {
      this.enforceHoleWall();
    }
  }

  rescaleFilings(oldMedian) {
    const st = this.st;
    const scale = clamp((this.p.filingMedianL || oldMedian) / Math.max(oldMedian, 1e-6), 0.2, 5);
    for (let i = 0; i < st.n; i++) {
      const aspect = st.len[i] / Math.max(st.wid[i], 1e-8);
      const L = clamp(st.len[i] * scale, this.p.filingMinL, this.p.filingMaxL);
      st.len[i] = L;
      st.wid[i] = L / aspect;
    }
  }

  enforceHoleWall() {
    const st = this.st, p = this.p;
    for (let i = 0; i < st.n; i++) {
      if (st.stray[i]) continue;
      let x = st.baseX[i], y = st.baseY[i];
      const moved = pushOutOfNoGo(x, y, p, this.rng);
      if (!moved) continue;
      st.baseX[i] = st.px[i] = st.targetX[i] = moved[0];
      st.baseY[i] = st.py[i] = st.targetY[i] = moved[1];
      st.pz[i] = 0;
    }
  }

  scheduleAutoTap() {
    const rate = this.p.autoTapRate || 0;
    this.nextAutoTap = rate > 0 ? this.time + expInterval(this.rng, rate) : Infinity;
  }

  doClear() {
    this.st.clear();
    this.awakeCount = 0;
    this.hasTapped = false;
    this.tapWasLive = false;
  }

  doSprinkle(opts = {}) {
    const p = this.p, st = this.st, rng = this.rng;
    const requested = opts.count ?? p.sprinkleCount;
    const responsiveCap = Math.min(this.maxN, p.maxResponsiveFilings ?? p.maxVisualParticles ?? this.maxN);
    const requestedStray = opts.strayCount ?? p.strayCount ?? 0;
    const strayCount = Math.min(9000, Math.max(0, requestedStray | 0), this.maxN - 1);
    const count = Math.min(this.maxN - strayCount, responsiveCap, Math.max(1, requested | 0));
    const pattern = opts.pattern ?? p.sprinklePattern;
    const radius = opts.radius ?? p.sprinkleR;
    const centerBias = clamp01(opts.clump ?? p.sprinkleClump);
    st.clear();
    this.hasTapped = false;
    this.tapWasLive = false;

    const edgeMargin = p.sprinkleEdgeMargin ?? 0.004;
    let placed = 0, attempts = 0;
    while (placed < count && attempts < count * 12) {
      const [x, y] = sampleGradientPoint(rng, pattern, p, radius, placed, count, centerBias, attempts);
      attempts++;
      if (!insideSheet(x, y, p, edgeMargin)) continue;
      if (insideNoGo(x, y, p)) continue;
      st.spawn(rng, p, placed++, x, y);
    }
    const responsivePlaced = placed;
    attempts = 0;
    while (placed < responsivePlaced + strayCount && placed < this.maxN && attempts < strayCount * 80) {
      attempts++;
      const [x, y] = sampleStrayPoint(rng, p, placed - responsivePlaced, strayCount, attempts);
      if (!insideSheet(x, y, p, edgeMargin)) continue;
      if (insideNoGo(x, y, p)) continue;
      st.spawn(rng, p, placed++, x, y, true);
    }
    st.n = placed;
    return placed;
  }

  doCurrent(opts = {}) {
    if (opts.mode) this.current.mode = opts.mode;
    if (opts.freq != null) this.current.freq = opts.freq;
    const oldAbs = Math.abs(this.current.target);
    const amp = opts.on === false ? 0 : (opts.amp ?? this.p.currentA);
    this.current.from = this.currentValue();
    this.current.target = amp;
    this.current.start = this.time;
    this.current.rampDur = opts.rampDur ?? this.p.rampDur ?? 0.4;

    const newAbs = Math.abs(amp);
    const increase = Math.max(0, newAbs - oldAbs);
    if (newAbs <= 0.1) {
      this.relaxPattern(0.65);
    } else if (this.hasTapped || this.p.currentAutoAlign) {
      const impulse = clamp(0.20 + increase / 70, 0.20, 0.75) * (this.p.currentMotion ?? 0.7);
      this.updateTargets(impulse);
      this.wakeFor(1.1 + impulse);
    }
  }

  doTap(opts = {}) {
    this.lastTapTime = this.time;
    this.lastTapStrength = opts.strength ?? this.p.tapStrength ?? 8;
    this.tapSerial = (this.tapSerial + 1) >>> 0;
    const currentAbs = Math.max(Math.abs(this.currentValue()), Math.abs(this.current.target));
    const currentFactor = clamp(currentAbs / 35, 0, 1.4);
    const tapFactor = clamp(this.lastTapStrength / 8, 0.35, 2.2);
    const fieldActive = currentAbs > 0.1 || this.p.currentAutoAlign;
    if (fieldActive) {
      this.hasTapped = true;
      const impulse = clamp((0.28 + 0.68 * currentFactor) * tapFactor, 0.18, 1.0);
      this.updateTargets(impulse);
    }

    const st = this.st;
    const until = this.time + 0.92 + 0.22 * tapFactor;
    for (let i = 0; i < st.n; i++) {
      if (st.stray[i]) {
        st.tapMask[i] = 0;
        st.liftMask[i] = 0;
        st.hop[i] = 0;
        continue;
      }
      const response = fieldActive ? responseMask(st.fieldResponse[i], this.p) : 0;
      const lift = clamp(this.p.tapLiftAll ?? 1, 0, 1.5);
      st.tapMask[i] = response;
      st.liftMask[i] = lift;
      st.hop[i] = (0.0018 + 0.0012 * this.rng.f()) * tapFactor * lift;
      st.tapPhase[i] = this.rng.range(0, PI2);
      if (lift > 0.02 || response > 0.02) st.awakeUntil[i] = Math.max(st.awakeUntil[i], until);
    }
  }

  currentValue(t = this.time) {
    const c = this.current;
    const u = c.rampDur > 1e-6 ? clamp01((t - c.start) / c.rampDur) : 1;
    const amp = c.from + (c.target - c.from) * (u * u * (3 - 2 * u));
    if (c.mode === 'ac') return amp * Math.sin(PI2 * c.freq * t);
    return amp;
  }

  currentReach() {
    const a = Math.max(Math.abs(this.currentValue()), Math.abs(this.current.target));
    const base = this.p.fieldReach30A ?? 0.12;
    const scale = Math.sqrt(Math.max(0, a) / 30);
    const maxReach = Math.max(this.p.sheetW, this.p.sheetH) * 1.2;
    return clamp(base * scale, 0, maxReach);
  }

  updateTargets(impulse) {
    if (this.p.fieldModel === 'coilDipole') {
      this.updateCoilTargets(impulse);
      return;
    }
    const st = this.st, p = this.p;
    const reach = this.currentReach();
    const currentAbs = Math.max(Math.abs(this.currentValue()), Math.abs(this.current.target));
    const currentScale = Math.sqrt(Math.max(0.08, currentAbs / 30));
    const ringSpacing = clamp((p.chainSpacing ?? 0.0065) * (1.03 - 0.08 * currentScale), 0.0038, 0.010);
    const direction = p.currentDir < 0 ? -1 : 1;
    const friction = clamp01(p.visualFriction ?? 0.48);
    const slide = clamp01((1 - friction) * (p.slideAmount ?? 1.0));
    const slideGain = slide * clamp(0.30 + impulse * 0.78, 0.30, 1.05);
    const rim = p.holeWallR + (p.rimClearance ?? 0.0004);
    for (let i = 0; i < st.n; i++) {
      if (st.stray[i]) continue;
      const bx = st.baseX[i], by = st.baseY[i];
      const dx = bx - p.holeX, dy = by - p.holeY;
      const r = Math.max(Math.hypot(dx, dy), rim);
      const theta = Math.atan2(dy, dx);
      const field = fieldInfluence(r, currentAbs, reach, p);
      const desired = responseMask(field, p) * st.chainGain[i];
      st.fieldResponse[i] = field;
      if (desired <= 0.001) {
        st.targetX[i] = st.baseX[i];
        st.targetY[i] = st.baseY[i];
        st.targetAng[i] = st.ang[i];
        st.targetAlign[i] *= 0.92;
        continue;
      }

      const ringNoise = st.ringNoise[i] * 0.34 + Math.sin(theta * 5.0 + st.chainPhase[i]) * 0.10;
      const ringIndex = Math.round((r + ringNoise * ringSpacing) / ringSpacing);
      const ring = ringIndex * ringSpacing;
      const maze = 0.72 + 0.28 * Math.sin(ringIndex * 1.73 + theta * 11.0 + st.chainPhase[i]);
      const chain = clamp01(desired * (p.chainStrength ?? 1.0) * maze);
      const radialToBand = (ring - r) * (p.chainCapture ?? 0.85) * chain * (1.16 + 0.42 * slideGain);
      const inwardLimit = Math.max(0, r - rim);
      const inward = -Math.min(inwardLimit, (p.inwardPull ?? 0.003) * currentScale * chain * impulse);
      const grain = st.ringNoise[i] * ringSpacing * 0.22 * (1 - chain);
      const radialNudge = radialToBand + inward + grain;
      const orbitNudge = (st.thetaDrift[i] * 0.070 + Math.sin(st.chainPhase[i] + ringIndex) * 0.016) *
        chain * slideGain;
      const rArc = clamp(r + radialNudge,
        rim, Math.min(p.sheetW, p.sheetH) * 0.5);
      const thetaArc = theta + orbitNudge;
      st.targetX[i] = p.holeX + Math.cos(thetaArc) * rArc;
      st.targetY[i] = p.holeY + Math.sin(thetaArc) * rArc;
      st.targetAng[i] = theta + direction * Math.PI / 2 +
        st.angleNoise[i] * (0.46 - 0.40 * chain);
      st.targetAlign[i] = Math.max(st.targetAlign[i] * 0.985, clamp01(chain * impulse * (0.90 + 0.35 * slideGain)));
      if (chain * impulse > 0.025) st.state[i] = AWAKE;
    }
  }

  updateCoilTargets(impulse) {
    // The loop's two legs pierce the board with opposite current, so the
    // in-plane field is that of two antiparallel line currents. Field lines
    // are the Apollonius circles of the two holes — level sets of
    // u = ln(da/db) — circling each hole and straightening into the coil-axis
    // line on the perpendicular bisector. Filings orient along H = rot90(∇u)
    // and chain onto discrete u-bands.
    const st = this.st, p = this.p;
    const reach = this.currentReach();
    const currentAbs = Math.max(Math.abs(this.currentValue()), Math.abs(this.current.target));
    const currentScale = Math.sqrt(Math.max(0.08, currentAbs / 30));
    const poles = coilPoles(p);
    const ax = poles.ax, ay = poles.ay, bx = poles.bx, by = poles.by;
    const direction = p.currentDir < 0 ? -1 : 1;
    const friction = clamp01(p.visualFriction ?? 0.48);
    const slide = clamp01((1 - friction) * (p.slideAmount ?? 1.0));
    const slideGain = slide * clamp(0.28 + impulse * 0.70, 0.22, 0.95);
    const spacing = p.chainSpacing ?? 0.0032;
    // Constant step in u spaces the rings proportionally to hole distance,
    // like the real crowding of filing rings near the wire.
    const du = clamp(spacing / Math.max(1e-4, p.fieldReferenceR ?? 0.050), 0.02, 0.30) *
      (1.03 - 0.08 * currentScale);
    const rim = p.holeWallR + (p.rimClearance ?? 0.0004);
    const margin = p.sprinkleEdgeMargin ?? 0.004;
    const snapCap = spacing * 3.5;
    const abx = bx - ax, aby = by - ay;
    const sep = Math.max(1e-6, Math.hypot(abx, aby));
    const ux = abx / sep, uy = aby / sep;
    const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;
    const half = sep * 0.5;
    const pullR = Math.max(0.005, p.pullRadius ?? 0.045);
    const axisPull = Math.max(0, p.axisPull ?? 0);

    for (let i = 0; i < st.n; i++) {
      if (st.stray[i]) continue;
      const x = st.baseX[i], y = st.baseY[i];
      const dax = x - ax, day = y - ay;
      const dbx = x - bx, dby = y - by;
      const da = Math.max(rim, Math.hypot(dax, day));
      const db = Math.max(rim, Math.hypot(dbx, dby));
      const invA = 1 / (da * da);
      const invB = 1 / (db * db);
      // g = ∇ln(da/db); |g| = 2π|H|/I, so 1/|g| acts as an effective
      // distance to the nearest leg (≈ sep/4 midway between the holes).
      const gx = dax * invA - dbx * invB;
      const gy = day * invA - dby * invB;
      const gLen = Math.max(1e-9, Math.hypot(gx, gy));
      const field = coilInfluence(gLen, currentAbs, reach, p);
      const desired = responseMask(field, p) * st.chainGain[i];
      st.fieldResponse[i] = field;
      if (desired <= 0.001) {
        st.targetX[i] = st.baseX[i];
        st.targetY[i] = st.baseY[i];
        st.targetAng[i] = st.ang[i];
        st.targetAlign[i] *= 0.92;
        continue;
      }

      const gxn = gx / gLen, gyn = gy / gLen;
      // H(dir = +1) = rot90(g): left leg carries current up out of the board.
      const fx = gyn * direction, fy = -gxn * direction;
      const u = Math.log(da / db);
      const bandIdx = Math.round(u / du + st.ringNoise[i] * 0.30);
      const nearB = u > 0;
      const around = Math.atan2(nearB ? dby : day, nearB ? dbx : dax);
      const maze = 0.74 + 0.26 * Math.sin(bandIdx * 1.93 + around * 7.0 + st.chainPhase[i]);
      const chain = clamp01(desired * (p.chainStrength ?? 1.0) * maze);
      // Newton step onto the band circle, along ∇u.
      const toBand = clamp((bandIdx * du - u) / gLen, -snapCap, snapCap) *
        (p.chainCapture ?? 0.85) * chain * (0.9 + 0.4 * slideGain);
      const minD = Math.min(da, db);
      const inwardLimit = Math.max(0, minD - rim);
      // Gradient attraction toward a leg fades beyond pullRadius. A constant
      // pull everywhere acts as a slow vacuum: its sign flips at the
      // bisector, so over many taps the center strip drains from both sides
      // (a visible bare gap between the conductors).
      const pullZone = clamp01(1 - minD / pullR);
      const inward = Math.min(inwardLimit,
        (p.inwardPull ?? 0.003) * currentScale * chain * impulse) *
        pullZone * pullZone * (nearB ? 1 : -1);
      // Middle-line pull: the dense flux bundle through the loop gathers
      // filings toward the bisector, band by band. Zoned to the loop
      // interior so it never fights the near-leg attraction.
      const along = (x - mx) * ux + (y - my) * uy;
      const crossD = -(x - mx) * uy + (y - my) * ux;
      const axisZone = clamp01(1 - Math.abs(along) / Math.max(1e-4, half * 0.92)) *
        clamp01(1.15 - Math.abs(crossD) / Math.max(1e-4, half));
      const axisStep = Math.min(Math.abs(along),
        axisPull * currentScale * chain * impulse * axisZone) * (along > 0 ? -1 : 1);
      const drift = st.thetaDrift[i] * spacing * 0.9 * chain * slideGain;
      let tx = x + gxn * (toBand + inward) + ux * axisStep + fx * drift;
      let ty = y + gyn * (toBand + inward) + uy * axisStep + fy * drift;
      const pushed = pushOutOfNoGo(tx, ty, p, this.rng);
      if (pushed) { tx = pushed[0]; ty = pushed[1]; }
      st.targetX[i] = clamp(tx, margin, p.sheetW - margin);
      st.targetY[i] = clamp(ty, margin, p.sheetH - margin);
      st.targetAng[i] = Math.atan2(fy, fx) + st.angleNoise[i] * (0.42 - 0.34 * chain);
      st.targetAlign[i] = Math.max(st.targetAlign[i] * 0.985, clamp01(chain * impulse * (0.88 + 0.30 * slideGain)));
      if (chain * impulse > 0.025) st.state[i] = AWAKE;
    }
  }

  relaxPattern(amount) {
    const st = this.st;
    for (let i = 0; i < st.n; i++) {
      if (st.stray[i]) continue;
      st.targetAlign[i] *= 1 - amount;
      st.state[i] = AWAKE;
    }
    this.wakeFor(0.6);
  }

  wakeFor(seconds) {
    const until = this.time + seconds;
    const st = this.st;
    for (let i = 0; i < st.n; i++) {
      if (!st.stray[i]) st.awakeUntil[i] = Math.max(st.awakeUntil[i], until);
    }
  }

  settleAfterTap() {
    const st = this.st;
    for (let i = 0; i < st.n; i++) {
      if (st.stray[i]) {
        st.px[i] = st.baseX[i];
        st.py[i] = st.baseY[i];
        st.pz[i] = 0;
        st.targetX[i] = st.baseX[i];
        st.targetY[i] = st.baseY[i];
        st.targetAng[i] = st.ang[i];
        st.align[i] = 0;
        st.targetAlign[i] = 0;
        st.tapMask[i] = 0;
        st.liftMask[i] = 0;
        st.state[i] = ASLEEP;
        continue;
      }
      const magnetic = st.tapMask[i] > 0.02 || st.align[i] > 0.01;
      if (magnetic) {
        st.baseX[i] = st.px[i];
        st.baseY[i] = st.py[i];
        st.targetX[i] = st.px[i];
        st.targetY[i] = st.py[i];
      } else {
        st.px[i] = st.baseX[i];
        st.py[i] = st.baseY[i];
        st.targetX[i] = st.baseX[i];
        st.targetY[i] = st.baseY[i];
      }
      st.pz[i] = 0;
      st.targetAng[i] = st.ang[i];
      st.align[i] = 0;
      st.targetAlign[i] = 0;
      st.hop[i] = 0;
      st.tapMask[i] = 0;
      st.liftMask[i] = 0;
      st.awakeUntil[i] = Math.min(st.awakeUntil[i], this.time + 0.04);
    }
  }

  advance(dt) {
    const p = this.p, st = this.st;
    this.time += dt;
    this.current.value = this.currentValue();
    const tapAge = this.time - this.lastTapTime;
    const tapDur = 0.62;
    const tapLive = tapAge >= 0 && tapAge < tapDur;
    const landedNow = this.tapWasLive && !tapLive;
    if (landedNow) this.settleAfterTap();

    if (this.time >= this.nextAutoTap) {
      this.doTap({});
      this.nextAutoTap = this.time + expInterval(this.rng, Math.max(1e-6, p.autoTapRate || 0));
    }

    if ((p.currentAutoAlign || this.hasTapped) && this.current.mode === 'ac' &&
        tapLive && Math.abs(this.current.value) > 0.1) {
      // AC can shimmer while filings are lifted; DC should settle after landing.
      const shimmer = 0.04;
      this.updateTargets(shimmer * (p.currentMotion ?? 0.7));
    }

    const followSpeed = tapLive ? (p.airborneAlignSpeed ?? 10) : (p.alignSpeed ?? 4.5);
    const rotateSpeed = tapLive ? (p.airborneRotateSpeed ?? 14) : (p.rotateSpeed ?? 7.5);
    const follow = 1 - Math.exp(-dt * followSpeed);
    const rotateFollow = 1 - Math.exp(-dt * rotateSpeed);
    const uTap = tapLive ? clamp01(tapAge / tapDur) : 1;
    const tapEnv = tapLive ? Math.sin(Math.PI * uTap) * Math.exp(-2.0 * uTap) : 0;
    let awake = 0;

    for (let i = 0; i < st.n; i++) {
      if (st.stray[i]) {
        st.px[i] = st.baseX[i];
        st.py[i] = st.baseY[i];
        st.pz[i] = 0;
        st.state[i] = ASLEEP;
        continue;
      }
      if (Math.abs(this.current.value) < 0.1 && !tapLive) st.targetAlign[i] *= 0.998;
      st.align[i] += (st.targetAlign[i] - st.align[i]) * follow;
      const a = clamp01(st.align[i]);
      const tapMask = st.tapMask[i];
      const liftMask = st.liftMask[i];
      const jitter = clamp01(this.p.tapJitterAmount ?? 0.28);
      const wob = tapEnv * (0.00022 + 0.000018 * this.lastTapStrength) * jitter *
        (0.18 + 0.82 * tapMask) * liftMask;
      const wobX = tapLive ? Math.sin(tapAge * 17 + st.tapPhase[i]) * wob * st.ringNoise[i] : 0;
      const wobY = tapLive ? Math.cos(tapAge * 15 + st.tapPhase[i]) * wob * st.thetaDrift[i] : 0;
      const magMove = tapMask > 0.02 ? a : 0;
      st.px[i] = lerp(st.baseX[i], st.targetX[i], magMove) + wobX;
      st.py[i] = lerp(st.baseY[i], st.targetY[i], magMove) + wobY;
      st.pz[i] = tapEnv * st.hop[i];
      st.ang[i] += wrapAngle(st.targetAng[i] - st.ang[i]) * rotateFollow * (0.25 + 0.75 * a);

      const moving = Math.abs(st.targetAlign[i] - st.align[i]) > 0.012 ||
        (tapLive && (tapMask > 0.02 || liftMask > 0.02)) || this.time < st.awakeUntil[i];
      st.state[i] = moving ? AWAKE : ASLEEP;
      if (moving) awake++;
    }
    this.awakeCount = awake;
    this.tapWasLive = tapLive;
  }
}

class VisualState {
  constructor(maxN) {
    const F = () => new Float32Array(maxN);
    this.n = 0;
    this.px = F(); this.py = F(); this.pz = F();
    this.baseX = F(); this.baseY = F();
    this.targetX = F(); this.targetY = F();
    this.ang = F(); this.targetAng = F();
    this.len = F(); this.wid = F(); this.glint = F();
    this.align = F(); this.targetAlign = F();
    this.hop = F(); this.tapPhase = F();
    this.ringNoise = F(); this.thetaDrift = F(); this.angleNoise = F();
    this.chainPhase = F(); this.chainGain = F(); this.fieldResponse = F(); this.tapMask = F();
    this.liftMask = F();
    this.awakeUntil = F();
    this.stray = new Uint8Array(maxN);
    this.state = new Uint8Array(maxN);
  }

  clear() {
    this.n = 0;
  }

  spawn(rng, p, i, x, y, stray = false) {
    const L = clamp(rng.lognormal(p.filingMedianL, p.filingSigmaLn), p.filingMinL, p.filingMaxL);
    const aspect = rng.range(p.aspectMin, p.aspectMax);
    this.baseX[i] = this.px[i] = this.targetX[i] = x;
    this.baseY[i] = this.py[i] = this.targetY[i] = y;
    this.pz[i] = 0;
    this.ang[i] = this.targetAng[i] = rng.range(0, PI2);
    this.len[i] = L;
    this.wid[i] = L / aspect;
    this.glint[i] = rng.f();
    this.align[i] = 0;
    this.targetAlign[i] = 0;
    this.hop[i] = 0.002 + 0.002 * rng.f();
    this.tapPhase[i] = rng.range(0, PI2);
    this.ringNoise[i] = rng.range(-1, 1);
    this.thetaDrift[i] = rng.range(-1, 1);
    this.angleNoise[i] = rng.normal() * 0.7;
    this.chainPhase[i] = rng.range(0, PI2);
    this.chainGain[i] = stray ? 0 : rng.range(0.82, 1.12);
    this.fieldResponse[i] = 0;
    this.tapMask[i] = 0;
    this.liftMask[i] = 0;
    this.awakeUntil[i] = 0;
    this.stray[i] = stray ? 1 : 0;
    this.state[i] = stray ? ASLEEP : AWAKE;
  }
}

function sampleGradientPoint(rng, pattern, p, R, i, n, centerBias, attempts = 0) {
  if (p.fieldModel === 'coilDipole' && pattern === 'sheet') {
    return sampleCoilSheetPoint(rng, p, i, n, centerBias, attempts);
  }
  const margin = p.sprinkleEdgeMargin ?? 0.004;
  const angleJitter = pattern === 'sheet' ? 0.045 : 0.09;
  const a = (i + attempts * 0.37) * GOLDEN_ANGLE + rng.range(-angleJitter, angleJitter);
  const minR = p.holeWallR + (p.rimClearance ?? 0.0004) + rng.range(0.0001, 0.0012);
  const sheetLimit = Math.max(minR + 1e-4, raySheetLimit(p, a, margin));
  const u = radialUnit(rng, i, n);

  if (pattern === 'sheet') {
    const exponent = 0.52 + 0.58 * centerBias;
    const r = minR + (sheetLimit - minR) * Math.pow(u, exponent);
    return [p.holeX + r * Math.cos(a), p.holeY + r * Math.sin(a)];
  }
  if (pattern === 'ring') {
    const outer = Math.min(R, sheetLimit);
    const inner = Math.min(outer - 1e-4, Math.max(minR, R * 0.58));
    const r = inner + (outer - inner) * u;
    return [p.holeX + r * Math.cos(a), p.holeY + r * Math.sin(a)];
  }
  const outer = Math.min(R, sheetLimit);
  const exponent = 0.52 + 0.50 * centerBias;
  const r = minR + (outer - minR) * Math.pow(u, exponent);
  return [p.holeX + r * Math.cos(a), p.holeY + r * Math.sin(a)];
}

function sampleCoilSheetPoint(rng, p, i, n, centerBias, attempts = 0) {
  const m = p.sprinkleEdgeMargin ?? 0.004;
  const cols = Math.ceil(Math.sqrt(Math.max(1, n) * p.sheetW / p.sheetH));
  const rows = Math.ceil(Math.max(1, n) / cols);
  const j = i + attempts * 11;
  const cx = j % cols, cy = Math.floor(j / cols) % rows;
  let x = m + (cx + 0.5 + rng.range(-0.46, 0.46)) / cols * (p.sheetW - 2 * m);
  let y = m + (cy + 0.5 + rng.range(-0.46, 0.46)) / rows * (p.sheetH - 2 * m);
  const bias = clamp01(centerBias) * rng.f() * rng.f() * 0.34;
  if (bias > 0.0001) {
    const { ax, ay, bx, by } = coilPoles(p);
    const towardA = rng.f() < 0.5;
    const tx = towardA ? ax : bx;
    const ty = towardA ? ay : by;
    x = lerp(x, tx, bias);
    y = lerp(y, ty, bias);
  }
  return [x, y];
}

function sampleStrayPoint(rng, p, i, n, attempts) {
  const m = p.sprinkleEdgeMargin ?? 0.004;
  const cols = Math.ceil(Math.sqrt(Math.max(1, n) * p.sheetW / p.sheetH));
  const rows = Math.ceil(Math.max(1, n) / cols);
  const j = i + attempts * 7;
  const cx = j % cols, cy = Math.floor(j / cols) % rows;
  const jx = rng.range(-0.48, 0.48), jy = rng.range(-0.48, 0.48);
  return [
    m + (cx + 0.5 + jx) / cols * (p.sheetW - 2 * m),
    m + (cy + 0.5 + jy) / rows * (p.sheetH - 2 * m),
  ];
}

function radialUnit(rng, i, n) {
  return clamp(fract((i + 0.5) * RADIAL_STEP) + rng.range(-0.35, 0.35) / Math.max(1, n), 0.0001, 0.9999);
}

function raySheetLimit(p, a, margin) {
  const ca = Math.cos(a), sa = Math.sin(a);
  let t = Infinity;
  if (ca > 1e-6) t = Math.min(t, (p.sheetW - margin - p.holeX) / ca);
  else if (ca < -1e-6) t = Math.min(t, (margin - p.holeX) / ca);
  if (sa > 1e-6) t = Math.min(t, (p.sheetH - margin - p.holeY) / sa);
  else if (sa < -1e-6) t = Math.min(t, (margin - p.holeY) / sa);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

function insideSheet(x, y, p, margin) {
  return x >= margin && y >= margin && x <= p.sheetW - margin && y <= p.sheetH - margin;
}

function coilPoles(p) {
  const sep = Math.max(0.04, p.sheetW * 0.46);
  const ax = Number.isFinite(p.poleAX) ? p.poleAX : (p.holeX - sep * 0.5);
  const ay = Number.isFinite(p.poleAY) ? p.poleAY : p.holeY;
  const bx = Number.isFinite(p.poleBX) ? p.poleBX : (p.holeX + sep * 0.5);
  const by = Number.isFinite(p.poleBY) ? p.poleBY : p.holeY;
  return { ax, ay, bx, by };
}

function insideNoGo(x, y, p) {
  const rim = p.holeWallR + (p.rimClearance ?? 0.0004);
  if (p.fieldModel === 'coilDipole') {
    const { ax, ay, bx, by } = coilPoles(p);
    const da2 = (x - ax) * (x - ax) + (y - ay) * (y - ay);
    const db2 = (x - bx) * (x - bx) + (y - by) * (y - by);
    return da2 < rim * rim || db2 < rim * rim;
  }
  const dx = x - p.holeX, dy = y - p.holeY;
  return dx * dx + dy * dy < rim * rim;
}

function pushOutOfNoGo(x, y, p, rng) {
  const rim = p.holeWallR + (p.rimClearance ?? 0.0004);
  const centers = p.fieldModel === 'coilDipole'
    ? (() => {
        const { ax, ay, bx, by } = coilPoles(p);
        return [[ax, ay], [bx, by]];
      })()
    : [[p.holeX, p.holeY]];
  let moved = false;
  let ox = x, oy = y;
  for (const [cx, cy] of centers) {
    const dx = ox - cx, dy = oy - cy;
    const r = Math.hypot(dx, dy);
    if (r >= rim) continue;
    const a = r > 1e-6 ? Math.atan2(dy, dx) : rng.range(0, PI2);
    ox = cx + Math.cos(a) * rim;
    oy = cy + Math.sin(a) * rim;
    moved = true;
  }
  return moved ? [ox, oy] : null;
}

function fieldInfluence(r, currentAbs, reach, p) {
  if (currentAbs <= 0.1 || r >= reach) return 0;
  const inner = p.holeWallR + (p.rimClearance ?? 0.0004);
  const edgeBand = Math.max(0.012, reach * 0.34);
  const edge = smooth01((reach - r) / edgeBand);
  const currentScale = Math.sqrt(Math.max(0.08, currentAbs / 30));
  const invR = clamp((p.fieldReferenceR ?? 0.058) * currentScale / Math.max(inner, r), 0, 1);
  return clamp01(edge * Math.pow(invR, p.fieldFalloffPower ?? 1.1));
}

// Field response from the local two-wire field strength. gLen = |∇ln(da/db)|
// is proportional to |H|, so 1/gLen behaves like distance to the nearest leg
// (and ≈ sep/4 midway between the legs) — the straight-wire falloff shape
// then applies directly to that effective radius.
function coilInfluence(gLen, currentAbs, reach, p) {
  if (currentAbs <= 0.1) return 0;
  const inner = p.holeWallR + (p.rimClearance ?? 0.0004);
  const rEff = Math.max(inner, 1 / Math.max(1e-9, gLen));
  if (rEff >= reach) return 0;
  const edgeBand = Math.max(0.012, reach * 0.34);
  const edge = smooth01((reach - rEff) / edgeBand);
  const currentScale = Math.sqrt(Math.max(0.08, currentAbs / 30));
  const invR = clamp((p.fieldReferenceR ?? 0.050) * currentScale / rEff, 0, 1);
  return clamp01(edge * Math.pow(invR, p.fieldFalloffPower ?? 1.15));
}

function responseMask(field, p) {
  const min = p.fieldMinResponse ?? 0.04;
  return field <= min ? 0 : smooth01((field - min) / Math.max(1e-5, 1 - min));
}

function expInterval(rng, rate) {
  return -Math.log(1 - rng.f()) / rate;
}

function smooth01(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
function lerp(a, b, t) { return a + (b - a) * t; }
function fract(x) { return x - Math.floor(x); }
function wrapAngle(a) {
  while (a > Math.PI) a -= PI2;
  while (a < -Math.PI) a += PI2;
  return a;
}

onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      engine = new VisualEngine({ ...DEFAULT_PARAMS, ...m.params });
      timeline = new TimelineRunner(engine);
      if (m.timeline) timeline.load(m.timeline);
      engine.reset(m.params?.seed ?? DEFAULT_PARAMS.seed);
      simAccum = 0;
      postMessage({ type: 'ready' });
      break;

    case 'reset':
      if (m.params) engine.setParams(m.params);
      engine.reset(m.seed ?? engine.p.seed);
      timeline.reset();
      if (m.timeline) timeline.load(m.timeline);
      simAccum = 0;
      postMessage({ type: 'resetDone' });
      break;

    case 'params':
      engine.setParams(m.patch);
      break;

    case 'timeline':
      timeline.load(m.events);
      break;

    case 'renderOptions':
      previewStride = Math.max(1, Math.min(16, m.previewStride | 0));
      break;

    case 'tick': {
      simAccum = Math.min(simAccum + Math.min(m.dt, 0.1), 0.1);
      const dt = m.paused ? 0 : simAccum;
      simAccum = 0;
      stepAndReply(dt, 'frame', previewStride);
      break;
    }

    case 'stepFrame':
      stepAndReply(m.frameDt, 'frameStepped', m.renderStride ?? 1, m.nSub ?? 1);
      break;

    case 'sprinkle': engine.doSprinkle(m.opts); break;
    case 'clearFilings': engine.doClear(); break;
    case 'current': engine.doCurrent(m.opts); break;
    case 'tap': engine.doTap(m.opts); break;

    case 'returnBuffer':
      buffers.push(m.buffer);
      if (buffers.length > 3) buffers.length = 3;
      break;

    case 'probe':
      postMessage({ type: 'probeResult', bins: [], time: engine.time });
      break;
  }
};
