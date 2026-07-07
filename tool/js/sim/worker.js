// Lightweight visual simulation worker.
//
// This intentionally cheats. The project needs controllable film output, not a
// granular physics solver. We keep the old render-buffer contract so the WebGL
// renderer and recorder still work, but the worker now drives a simple,
// deterministic stage animation:
//   uniform sprinkle -> local 1/r field response -> broken circular chains.

import { TimelineRunner } from './timeline.js';
import { DEFAULT_PARAMS } from './units.js';
import { RNG } from './rng.js';

const FLOATS_PER = 8;
const ASLEEP = 0;
const AWAKE = 1;
const PI2 = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

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
    Object.assign(this.p, patch);
    if ('currentMode' in patch) this.current.mode = patch.currentMode;
    if ('acFreq' in patch) this.current.freq = patch.acFreq;
    if ('autoTapRate' in patch) this.scheduleAutoTap();
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
    const count = Math.min(this.maxN, Math.max(1, requested | 0));
    const pattern = opts.pattern ?? p.sprinklePattern;
    const radius = opts.radius ?? p.sprinkleR;
    const clump = clamp01(opts.clump ?? p.sprinkleClump);
    st.clear();
    this.hasTapped = false;
    this.tapWasLive = false;

    const centers = [];
    const nCenters = Math.max(5, Math.round(6 + 24 * clump));
    for (let c = 0; c < nCenters; c++) centers.push(samplePoint(rng, pattern, p, radius));
    const spread = 0.010 + 0.016 * (1 - clump);

    let placed = 0;
    while (placed < count) {
      let x, y;
      if (rng.f() < clump * 0.45) {
        const c = centers[rng.u32() % centers.length];
        x = c[0] + rng.normal() * spread * clump;
        y = c[1] + rng.normal() * spread * clump;
      } else {
        [x, y] = sampleStratifiedPoint(rng, pattern, p, radius, placed, count, clump);
      }
      x = clamp(x, 0.008, p.sheetW - 0.008);
      y = clamp(y, 0.008, p.sheetH - 0.008);
      const dx = x - p.holeX, dy = y - p.holeY;
      if (dx * dx + dy * dy < p.holeWallR * p.holeWallR) continue;
      st.spawn(rng, p, placed++, x, y);
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
    const until = this.time + 1.15 + 0.35 * tapFactor;
    for (let i = 0; i < st.n; i++) {
      const response = fieldActive ? responseMask(st.fieldResponse[i], this.p) : 1;
      st.tapMask[i] = response;
      st.hop[i] = (0.0008 + 0.0028 * this.rng.f()) * tapFactor * Math.sqrt(response);
      st.tapPhase[i] = this.rng.range(0, PI2);
      if (response > 0.02) st.awakeUntil[i] = Math.max(st.awakeUntil[i], until);
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
    return clamp(base * scale, this.p.holeWallR + 0.018, Math.min(this.p.sheetW, this.p.sheetH) * 0.49);
  }

  updateTargets(impulse) {
    const st = this.st, p = this.p;
    const reach = this.currentReach();
    const currentAbs = Math.max(Math.abs(this.currentValue()), Math.abs(this.current.target));
    const currentScale = Math.sqrt(Math.max(0.08, currentAbs / 30));
    const ringSpacing = clamp((p.chainSpacing ?? 0.0065) * (1.03 - 0.08 * currentScale), 0.0038, 0.010);
    const direction = p.currentDir < 0 ? -1 : 1;
    const friction = clamp01(p.visualFriction ?? 0.48);
    const slide = clamp01((1 - friction) * (p.slideAmount ?? 1.0));
    const slideGain = slide * clamp(0.30 + impulse * 0.78, 0.30, 1.05);
    for (let i = 0; i < st.n; i++) {
      const bx = st.baseX[i], by = st.baseY[i];
      const dx = bx - p.holeX, dy = by - p.holeY;
      const r = Math.max(Math.hypot(dx, dy), p.holeWallR + 0.002);
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
      const inwardLimit = Math.max(0, r - (p.holeWallR + 0.006));
      const inward = -Math.min(inwardLimit, (p.inwardPull ?? 0.003) * currentScale * chain * impulse);
      const grain = st.ringNoise[i] * ringSpacing * 0.22 * (1 - chain);
      const radialNudge = radialToBand + inward + grain;
      const orbitNudge = (st.thetaDrift[i] * 0.070 + Math.sin(st.chainPhase[i] + ringIndex) * 0.016) *
        chain * slideGain;
      const rArc = clamp(r + radialNudge,
        p.holeWallR + 0.004, Math.min(p.sheetW, p.sheetH) * 0.5);
      const thetaArc = theta + orbitNudge;
      st.targetX[i] = p.holeX + Math.cos(thetaArc) * rArc;
      st.targetY[i] = p.holeY + Math.sin(thetaArc) * rArc;
      st.targetAng[i] = theta + direction * Math.PI / 2 +
        st.angleNoise[i] * (0.46 - 0.40 * chain);
      st.targetAlign[i] = Math.max(st.targetAlign[i] * 0.985, clamp01(chain * impulse * (0.90 + 0.35 * slideGain)));
      if (chain * impulse > 0.025) st.state[i] = AWAKE;
    }
  }

  relaxPattern(amount) {
    const st = this.st;
    for (let i = 0; i < st.n; i++) {
      st.targetAlign[i] *= 1 - amount;
      st.state[i] = AWAKE;
    }
    this.wakeFor(0.6);
  }

  wakeFor(seconds) {
    const until = this.time + seconds;
    const st = this.st;
    for (let i = 0; i < st.n; i++) st.awakeUntil[i] = Math.max(st.awakeUntil[i], until);
  }

  settleAfterTap() {
    const st = this.st;
    for (let i = 0; i < st.n; i++) {
      if (st.tapMask[i] <= 0.02 && st.align[i] <= 0.01) continue;
      st.baseX[i] = st.px[i];
      st.baseY[i] = st.py[i];
      st.targetX[i] = st.px[i];
      st.targetY[i] = st.py[i];
      st.pz[i] = 0;
      st.targetAng[i] = st.ang[i];
      st.align[i] = 0;
      st.targetAlign[i] = 0;
      st.hop[i] = 0;
      st.tapMask[i] = 0;
      st.awakeUntil[i] = Math.min(st.awakeUntil[i], this.time + 0.04);
    }
  }

  advance(dt) {
    const p = this.p, st = this.st;
    this.time += dt;
    this.current.value = this.currentValue();
    const tapAge = this.time - this.lastTapTime;
    const tapDur = 0.75;
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
    const tapEnv = tapLive ? Math.sin(Math.PI * tapAge / tapDur) * (1 - tapAge / tapDur) : 0;
    let awake = 0;

    for (let i = 0; i < st.n; i++) {
      if (Math.abs(this.current.value) < 0.1 && !tapLive) st.targetAlign[i] *= 0.998;
      st.align[i] += (st.targetAlign[i] - st.align[i]) * follow;
      const a = clamp01(st.align[i]);
      const tapMask = st.tapMask[i];
      const wob = tapEnv * (0.0010 + 0.00007 * this.lastTapStrength) * tapMask;
      const wobX = tapLive ? Math.sin(tapAge * 38 + st.tapPhase[i]) * wob * st.ringNoise[i] : 0;
      const wobY = tapLive ? Math.cos(tapAge * 31 + st.tapPhase[i]) * wob * st.thetaDrift[i] : 0;
      st.px[i] = lerp(st.baseX[i], st.targetX[i], a) + wobX;
      st.py[i] = lerp(st.baseY[i], st.targetY[i], a) + wobY;
      st.pz[i] = tapEnv * st.hop[i];
      st.ang[i] += wrapAngle(st.targetAng[i] - st.ang[i]) * rotateFollow * (0.25 + 0.75 * a);

      const moving = Math.abs(st.targetAlign[i] - st.align[i]) > 0.012 ||
        (tapLive && tapMask > 0.02) || this.time < st.awakeUntil[i];
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
    this.awakeUntil = F();
    this.state = new Uint8Array(maxN);
  }

  clear() {
    this.n = 0;
  }

  spawn(rng, p, i, x, y) {
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
    this.chainGain[i] = rng.range(0.82, 1.12);
    this.fieldResponse[i] = 0;
    this.tapMask[i] = 0;
    this.awakeUntil[i] = 0;
    this.state[i] = AWAKE;
  }
}

function sampleStratifiedPoint(rng, pattern, p, R, i, n, clump) {
  if (pattern === 'sheet') {
    const cols = Math.ceil(Math.sqrt(n * p.sheetW / p.sheetH));
    const rows = Math.ceil(n / cols);
    const cx = i % cols, cy = Math.floor(i / cols);
    const jx = rng.range(-0.38, 0.38), jy = rng.range(-0.38, 0.38);
    return [
      clamp((cx + 0.5 + jx) / cols * p.sheetW, 0.012, p.sheetW - 0.012),
      clamp((cy + 0.5 + jy) / rows * p.sheetH, 0.012, p.sheetH - 0.012),
    ];
  }
  if (pattern === 'ring') {
    const r = R * (0.58 + 0.42 * ((i + 0.5 + rng.range(-0.25, 0.25)) / n));
    const a = i * GOLDEN_ANGLE + rng.range(-0.10, 0.10);
    return [p.holeX + r * Math.cos(a), p.holeY + r * Math.sin(a)];
  }
  const jitter = rng.range(-0.30, 0.30) * (0.8 + clump);
  const u = clamp((i + 0.5 + jitter) / n, 0.0001, 0.9999);
  const r = R * Math.sqrt(u);
  const a = i * GOLDEN_ANGLE + rng.range(-0.16, 0.16);
  return [p.holeX + r * Math.cos(a), p.holeY + r * Math.sin(a)];
}

function samplePoint(rng, pattern, p, R) {
  const cx = p.holeX, cy = p.holeY;
  if (pattern === 'sheet') {
    return [rng.range(0.012, p.sheetW - 0.012), rng.range(0.012, p.sheetH - 0.012)];
  }
  if (pattern === 'ring') {
    const r = R * (0.55 + 0.45 * Math.sqrt(rng.f()));
    const a = rng.range(0, PI2);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  const r = R * Math.sqrt(rng.f());
  const a = rng.range(0, PI2);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function fieldInfluence(r, currentAbs, reach, p) {
  if (currentAbs <= 0.1 || r >= reach) return 0;
  const inner = p.holeWallR + 0.004;
  const edgeBand = Math.max(0.012, reach * 0.34);
  const edge = smooth01((reach - r) / edgeBand);
  const currentScale = Math.sqrt(Math.max(0.08, currentAbs / 30));
  const invR = clamp((p.fieldReferenceR ?? 0.058) * currentScale / Math.max(inner, r), 0, 1);
  return clamp01(edge * Math.pow(invR, p.fieldFalloffPower ?? 1.1));
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
