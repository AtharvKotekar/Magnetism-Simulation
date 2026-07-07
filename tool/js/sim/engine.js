// The physics hot loop: induced magnetization, field torque, gradient force,
// dipole–dipole chain interactions, steric contacts, Coulomb friction with
// stick/slip, tap launches, sleeping. One substep = one call to substep().
//
// Everything is SI. See units.js for the parameter set and plan notes for the
// scale analysis: at realistic currents magnetic torque < static friction, so
// filings reorganize mainly while airborne after taps — that asymmetry is the
// whole point of this simulator.

import { MU0, G } from './units.js';
import { ParticleState, ASLEEP, CONTACT, AIRBORNE, sprinkle } from './particles.js';
import { HashGrid } from './hashgrid.js';
import { FieldEval, CurrentDriver } from './field.js';
import { RNG } from './rng.js';
import { LIMITS } from './units.js';

const K_DIP = 1e-7; // μ0 / 4π

export class Engine {
  constructor(params) {
    this.p = { ...params };
    this.st = new ParticleState(this.p.maxParticles);
    this.grid = new HashGrid(this.p.sheetW, this.p.sheetH, this.p.neighborCutoff, this.p.maxParticles);
    this.rng = new RNG(this.p.seed);
    this.field = new FieldEval(this.p);
    this.current = new CurrentDriver(this.p);
    this.time = 0;
    this.substepId = 0;
    this.momentStamp = new Int32Array(this.p.maxParticles).fill(-1);
    this.Hout = new Float32Array(4);
    this.awakeCount = 0;
    this.nextAutoTap = Infinity;
    this.lastTapTime = -Infinity;
    this.lastTapStrength = 0;
    this.tapSerial = 0;
    // per-frame neighbor cache: up to NB_CAP partners per awake particle
    this.NB_CAP = 14;
    this.nbList = new Int32Array(this.p.maxParticles * this.NB_CAP);
    this.nbCount = new Uint8Array(this.p.maxParticles);
    this.nbDirty = true;
  }

  reset(seed) {
    this.st.clear();
    this.rng = new RNG(seed >>> 0);
    this.time = 0;
    this.substepId = 0;
    this.momentStamp.fill(-1);
    this.current = new CurrentDriver(this.p);
    this.nextAutoTap = Infinity;
    this.lastTapTime = -Infinity;
    this.lastTapStrength = 0;
    this.tapSerial = 0;
    this.field.update(this.p);
  }

  setParams(patch) {
    Object.assign(this.p, patch);
    this.field.update(this.p);
    if ('autoTapRate' in patch) this.scheduleAutoTap();
  }

  scheduleAutoTap() {
    const r = this.p.autoTapRate;
    this.nextAutoTap = r > 0 ? this.time + expInterval(this.rng, r) : Infinity;
  }

  // ---- actions (called by timeline / live UI, always at substep boundaries) ----

  doSprinkle(opts) {
    this.nbDirty = true;
    return sprinkle(this.st, this.rng, this.p, opts || {});
  }

  doClear() { this.st.clear(); this.nbDirty = true; }

  doCurrent(opts) {
    // opts: {on, amp, mode, freq, rampDur}
    if ('mode' in opts && opts.mode) this.current.set(this.time, { mode: opts.mode });
    if ('freq' in opts && opts.freq != null) this.current.set(this.time, { freq: opts.freq });
    const amp = opts.on === false ? 0 : (opts.amp ?? this.p.currentA);
    this.current.set(this.time, { amp, rampDur: opts.rampDur ?? this.p.rampDur });
    this.wakeAll(); // field change → re-evaluate everyone once; most fall asleep again
  }

  doTap(opts) {
    this.nbDirty = true;
    const strength = opts?.strength ?? this.p.tapStrength;        // in g's
    this.lastTapTime = this.time;
    this.lastTapStrength = strength;
    this.tapSerial = (this.tapSerial + 1) >>> 0;
    // launch ≈ 0.4 × plate peak velocity (A·T/π for a half-sine push)
    const vLaunch = 0.4 * strength * G * this.p.tapDur / Math.PI;
    const st = this.st, rng = this.rng, n = st.n;
    for (let i = 0; i < n; i++) {
      if (st.state[i] === AIRBORNE) continue;
      st.state[i] = AIRBORNE;
      st.still[i] = 0;
      st.vz[i] = vLaunch * (0.55 + 0.9 * rng.f());
      const roughKick = (0.006 + 0.0014 * strength) * (0.45 + rng.f());
      st.vx[i] += roughKick * rng.normal();
      st.vy[i] += roughKick * rng.normal();
      st.angV[i] += (18 + 2.2 * strength) * rng.normal();
    }
  }

  wakeAll() {
    const st = this.st;
    for (let i = 0; i < st.n; i++) {
      if (st.state[i] === ASLEEP) { st.state[i] = CONTACT; st.still[i] = 0; }
    }
    this.nbDirty = true;
  }

  // Build the per-frame neighbor cache: for each awake particle, up to NB_CAP
  // partners within the cutoff. Pair ownership rule baked at build time:
  // (awake, awake) pairs belong to the smaller index; (awake, sleeping) pairs
  // always belong to the awake side. Deterministic (ascending cell/index scan).
  buildNeighbors() {
    const st = this.st, n = st.n, grid = this.grid, p = this.p;
    if (n === 0) return;
    grid.build(st.px, st.py, n);
    const cutoff2 = p.neighborCutoff * p.neighborCutoff;
    const items = grid.items, start = grid.start, nx = grid.nx, ny = grid.ny, cell = grid.cell;
    const CAP = this.NB_CAP, list = this.nbList, cnt = this.nbCount;
    // A particle high above the board with dipoles inactive (no meaningful
    // current) interacts with nothing: skip it. This is what keeps the
    // sprinkle-fall phase (25k+ airborne in dense clusters) cheap.
    const dipoleOn = this.p.chainStrength > 0 &&
      Math.abs(this.current.value(this.time) * this.p.currentDir) > 0.5;
    const zFree = 0.004; // m — above this, no contacts possible either
    for (let i = 0; i < n; i++) {
      cnt[i] = 0;
      if (st.state[i] === ASLEEP) continue;
      if (!dipoleOn && st.pz[i] > zFree) continue;
      const xi = st.px[i], yi = st.py[i];
      const cx = Math.min(nx - 1, Math.max(0, (xi / cell) | 0));
      const cy = Math.min(ny - 1, Math.max(0, (yi / cell) | 0));
      const gx0 = Math.max(0, cx - 1), gx1 = Math.min(nx - 1, cx + 1);
      const gy0 = Math.max(0, cy - 1), gy1 = Math.min(ny - 1, cy + 1);
      let m = 0;
      const base = i * CAP;
      outer:
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const c = gy * nx + gx;
          for (let k = start[c], e = start[c + 1]; k < e; k++) {
            const j = items[k];
            if (j === i) continue;
            if (st.state[j] !== ASLEEP && j < i) continue;
            const sx = xi - st.px[j], sy = yi - st.py[j];
            if (sx * sx + sy * sy > cutoff2) continue;
            list[base + m] = j;
            if (++m >= CAP) break outer;
          }
        }
      }
      cnt[i] = m;
    }
    this.nbDirty = false;
  }

  // ---- moments (lazy for sleeping particles, stamped per substep) ----

  // Compute filing i's magnetic moment from the local external field.
  // H must already hold field.eval(px[i], py[i]) — pass it in to avoid
  // double evaluation in the hot loop.
  computeMomentFromH(i, Hx, Hy) {
    const st = this.st;
    const ux = Math.cos(st.ang[i]), uy = Math.sin(st.ang[i]);
    st.ux[i] = ux; st.uy[i] = uy;
    const Hpar = Hx * ux + Hy * uy;
    const Hperp = -Hx * uy + Hy * ux;
    // remanence sign flips when driven hard antiparallel (coercive threshold)
    if (Hpar > this.p.coerciveH) st.remSign[i] = 1;
    else if (Hpar < -this.p.coerciveH) st.remSign[i] = -1;
    const cap = st.mSat[i];
    let mPar = st.volChiPar[i] * Hpar;
    if (mPar > cap) mPar = cap; else if (mPar < -cap) mPar = -cap;
    mPar += st.remSign[i] * st.mSat[i] * this.p.remanenceFrac;
    let mPerp = st.volChiPerp[i] * Hperp;
    if (mPerp > cap) mPerp = cap; else if (mPerp < -cap) mPerp = -cap;
    st.mx[i] = mPar * ux - mPerp * uy;
    st.my[i] = mPar * uy + mPerp * ux;
    this.momentStamp[i] = this.substepId;
  }

  momentOf(i) {
    if (this.momentStamp[i] !== this.substepId) {
      const H = this.Hout;
      this.field.eval(this.st.px[i], this.st.py[i], H);
      this.computeMomentFromH(i, H[0], H[1]);
    }
  }

  // ---- one substep ----

  substep(dt) {
    const p = this.p, st = this.st, n = st.n, field = this.field, H = this.Hout;
    this.substepId++;
    field.setCurrent(this.current.value(this.time) * p.currentDir);

    // auto-tap (Poisson)
    if (this.time >= this.nextAutoTap) {
      this.doTap({});
      this.nextAutoTap = this.time + expInterval(this.rng, Math.max(1e-6, p.autoTapRate));
    }

    const chainK = p.chainStrength;
    const cutoff2 = p.neighborCutoff * p.neighborCutoff;
    const grid = this.grid;
    const capMG = LIMITS.pairForceCapMG;
    const beta = LIMITS.baumgarte;
    const invDt = 1 / dt, invDt2 = invDt * invDt;
    // dipole–dipole forces only matter once real current flows; from the
    // ambient field alone they are ~10⁻⁶ of friction (see plan scale table)
    const dipoleOn = chainK > 0 && Math.abs(field.Iz) > 0.5;

    let awake = 0;

    // Pass 1: field forces/torques + moments for awake particles
    st.fx.fill(0, 0, n); st.fy.fill(0, 0, n); st.tq.fill(0, 0, n);
    for (let i = 0; i < n; i++) {
      if (st.state[i] === ASLEEP) continue;
      awake++;
      field.eval(st.px[i], st.py[i], H);
      this.computeMomentFromH(i, H[0], H[1]);
      // torque from external field: τ = μ0 (m × H)_z
      st.tq[i] = MU0 * (st.mx[i] * H[1] - st.my[i] * H[0]);
      // gradient force toward the wire (wire term only; ambient is uniform)
      const Hw = H[2], r = H[3];
      if (Hw > 0 && r > 1e-6) {
        const Hmag2 = H[0] * H[0] + H[1] * H[1];
        let cPar2 = 0.5, cPerp2 = 0.5;
        if (Hmag2 > 1e-12) {
          const ux = Math.cos(st.ang[i]), uy = Math.sin(st.ang[i]);
          const hp = (H[0] * ux + H[1] * uy);
          cPar2 = (hp * hp) / Hmag2;
          cPerp2 = 1 - cPar2;
        }
        const Veff = st.volChiPar[i] * cPar2 + st.volChiPerp[i] * cPerp2;
        const Fg = MU0 * Veff * Hw * Hw / r;   // magnitude, toward wire
        const dx = st.px[i] - p.holeX, dy = st.py[i] - p.holeY;
        st.fx[i] -= Fg * dx / r;
        st.fy[i] -= Fg * dy / r;
      }
    }
    this.awakeCount = awake;

    // Pass 2: pair interactions (dipole + steric contact) over the per-frame
    // neighbor cache. Ownership rules are baked into the cache at build time.
    const CAP = this.NB_CAP, list = this.nbList, cnt = this.nbCount;
    for (let i = 0; i < n; i++) {
      if (st.state[i] === ASLEEP || cnt[i] === 0) continue;
      const xi = st.px[i], yi = st.py[i], zi = st.pz[i];
      const base = i * CAP, m = cnt[i];
      for (let k = 0; k < m; k++) {
        const j = list[base + k];
        const sx = xi - st.px[j], sy = yi - st.py[j];
        let s2 = sx * sx + sy * sy;
        if (s2 > cutoff2) continue;               // drifted apart since build
        const eps = 0.25 * (st.wid[i] + st.wid[j]);
        s2 += eps * eps;
        const s1 = Math.sqrt(s2);
        const inv1 = 1 / s1, inv2 = inv1 * inv1;
        const nxs = sx * inv1, nys = sy * inv1;
        const jAsleep = st.state[j] === ASLEEP;

        if (dipoleOn) {
          this.momentOf(j);
          const mix = st.mx[i], miy = st.my[i], mjx = st.mx[j], mjy = st.my[j];
          const miDs = mix * nxs + miy * nys;
          const mjDs = mjx * nxs + mjy * nys;
          const miDmj = mix * mjx + miy * mjy;
          const A = chainK * 3 * K_DIP * inv2 * inv2;
          let Fx = A * (miDs * mjx + mjDs * mix + miDmj * nxs - 5 * miDs * mjDs * nxs);
          let Fy = A * (miDs * mjy + mjDs * miy + miDmj * nys - 5 * miDs * mjDs * nys);
          // per-pair force cap (numerical safety, ~5× weight)
          const cap = capMG * Math.min(st.mg[i], st.mg[j]);
          const F2 = Fx * Fx + Fy * Fy;
          if (F2 > cap * cap) { const sc = cap / Math.sqrt(F2); Fx *= sc; Fy *= sc; }
          st.fx[i] += Fx; st.fy[i] += Fy;
          st.fx[j] -= Fx; st.fy[j] -= Fy;
          // torques from each other's dipole field
          const B0 = chainK * K_DIP * inv2 * inv1;
          const bjx = B0 * (3 * mjDs * nxs - mjx), bjy = B0 * (3 * mjDs * nys - mjy);
          st.tq[i] += mix * bjy - miy * bjx;
          const bix = B0 * (3 * miDs * (-nxs) - mix), biy = B0 * (3 * miDs * (-nys) - miy);
          st.tq[j] += mjx * biy - mjy * bix;
        }

        // steric contact: near enough for tips to touch AND at similar
        // height (falling particles at different z don't collide in 2.5D)
        const reach = 0.5 * (st.len[i] + st.len[j]);
        if (s1 < reach && Math.abs(zi - st.pz[j]) < st.wid[i] + st.wid[j]) {
          this.contactPair(i, j, dt, invDt2, beta);
        }

        // wake sleeping partner if pushed beyond its static friction
        if (jAsleep && (st.fx[j] !== 0 || st.fy[j] !== 0 || st.tq[j] !== 0)) {
          const fj2 = st.fx[j] * st.fx[j] + st.fy[j] * st.fy[j];
          const thr = 0.6 * p.muS * st.mg[j];
          const thrT = 0.6 * p.muS * st.mg[j] * st.lever[j];
          if (fj2 > thr * thr || Math.abs(st.tq[j]) > thrT) {
            st.state[j] = CONTACT; st.still[j] = 0;
          }
        }
      }
    }

    // Pass 3: integrate
    this.integrate(dt);

    // Periodic torque-based wake scan for sleeping particles (field may have grown)
    if ((this.substepId % LIMITS.wakeCheckEvery) === 0) this.wakeScan();

    this.time += dt;
  }

  // Capsule–capsule contact via closest points between the two core segments.
  contactPair(i, j, dt, invDt2, beta) {
    const st = this.st;
    // axis cache is refreshed whenever a moment is computed; sleeping
    // particles don't rotate so their cached axis stays valid
    const uxi = st.ux[i], uyi = st.uy[i];
    const uxj = st.ux[j], uyj = st.uy[j];
    const ri = 0.5 * st.wid[i], rj = 0.5 * st.wid[j];
    const hi = 0.5 * (st.len[i] - st.wid[i]), hj = 0.5 * (st.len[j] - st.wid[j]);
    // segments: center ± h·û ; find closest points (Ericson, clamped)
    const d1x = 2 * hi * uxi, d1y = 2 * hi * uyi;    // p1 = c - h·û
    const d2x = 2 * hj * uxj, d2y = 2 * hj * uyj;
    const p1x = st.px[i] - hi * uxi, p1y = st.py[i] - hi * uyi;
    const p2x = st.px[j] - hj * uxj, p2y = st.py[j] - hj * uyj;
    const rx = p1x - p2x, ry = p1y - p2y;
    const a = d1x * d1x + d1y * d1y;
    const e = d2x * d2x + d2y * d2y;
    const b = d1x * d2x + d1y * d2y;
    const c = d1x * rx + d1y * ry;
    const f = d2x * rx + d2y * ry;
    let s = 0, t = 0;
    const denom = a * e - b * b;
    if (denom > 1e-18) s = clamp01((b * f - c * e) / denom);
    if (e > 1e-18) {
      t = clamp01((b * s + f) / e);
      s = a > 1e-18 ? clamp01((b * t - c) / a) : 0;
    }
    const c1x = p1x + d1x * s, c1y = p1y + d1y * s;
    const c2x = p2x + d2x * t, c2y = p2y + d2y * t;
    let nx = c1x - c2x, ny = c1y - c2y;
    const rr = ri + rj;
    const d2v = nx * nx + ny * ny;
    if (d2v >= rr * rr || d2v < 1e-16) return;
    const dist = Math.sqrt(d2v);
    const overlap = rr - dist;
    nx /= dist; ny /= dist;
    // Baumgarte-style spring: push out a fraction of the overlap per step
    const mRed = 1 / (st.invMass[i] + st.invMass[j]);
    let Fn = beta * overlap * invDt2 * mRed;
    // normal relative-velocity damping (kills bounce jitter)
    const rvx = st.vx[i] - st.vx[j], rvy = st.vy[i] - st.vy[j];
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) Fn -= 0.5 * vn * mRed / dt;
    const Fx = Fn * nx, Fy = Fn * ny;
    st.fx[i] += Fx; st.fy[i] += Fy;
    st.fx[j] -= Fx; st.fy[j] -= Fy;
    // torque about each center from the contact-point lever arm
    st.tq[i] += (c1x - st.px[i]) * Fy - (c1y - st.py[i]) * Fx;
    st.tq[j] -= (c2x - st.px[j]) * Fy - (c2y - st.py[j]) * Fx;
    if (st.state[j] === ASLEEP) { st.state[j] = CONTACT; st.still[j] = 0; }
  }

  integrate(dt) {
    const p = this.p, st = this.st, n = st.n;
    const vMax = LIMITS.vMax, wMax = LIMITS.wMax;
    const margin = 0.004;
    const holeR2 = p.holeWallR * p.holeWallR;

    for (let i = 0; i < n; i++) {
      const s = st.state[i];
      if (s === ASLEEP) continue;

      if (s === AIRBORNE) {
        // ballistic: full magnetic response, no friction — this is where
        // alignment actually happens in the real experiment
        st.vx[i] += st.fx[i] * st.invMass[i] * dt;
        st.vy[i] += st.fy[i] * st.invMass[i] * dt;
        st.vz[i] -= G * dt;
        st.angV[i] += st.tq[i] * st.invI[i] * dt;
        st.angV[i] *= (1 - 2.0 * dt);        // air/eddy rotational damping
      } else {
        // CONTACT: Coulomb friction with static latch
        const N = st.mg[i];
        const Fx = st.fx[i], Fy = st.fy[i];
        const F2 = Fx * Fx + Fy * Fy;
        const v2 = st.vx[i] * st.vx[i] + st.vy[i] * st.vy[i];
        const fsMax = p.muS * N;
        let latchedT = false, latchedR = false;

        if (v2 < LIMITS.vStick * LIMITS.vStick && F2 <= fsMax * fsMax) {
          st.vx[i] = 0; st.vy[i] = 0; latchedT = true;
        } else {
          st.vx[i] += Fx * st.invMass[i] * dt;
          st.vy[i] += Fy * st.invMass[i] * dt;
          const sp = Math.sqrt(st.vx[i] * st.vx[i] + st.vy[i] * st.vy[i]);
          if (sp > 1e-12) {
            const dec = p.muK * N * st.invMass[i] * dt;
            const nsp = Math.max(0, sp - dec);
            const sc = nsp / sp;
            st.vx[i] *= sc; st.vy[i] *= sc;
            if (nsp === 0) latchedT = true;
          }
        }

        const tqMax = fsMax * st.lever[i];
        if (Math.abs(st.angV[i]) < LIMITS.wStick && Math.abs(st.tq[i]) <= tqMax) {
          st.angV[i] = 0; latchedR = true;
        } else {
          st.angV[i] += st.tq[i] * st.invI[i] * dt;
          const dec = p.muK * N * st.lever[i] * st.invI[i] * dt;
          const w = st.angV[i];
          const nw = Math.sign(w) * Math.max(0, Math.abs(w) - dec);
          st.angV[i] = nw;
          if (nw === 0) latchedR = true;
        }

        if (latchedT && latchedR) {
          if (++st.still[i] >= LIMITS.sleepSteps) {
            st.state[i] = ASLEEP; st.still[i] = 0;
          }
        } else {
          st.still[i] = 0;
        }
      }

      // clamps
      const sp2 = st.vx[i] * st.vx[i] + st.vy[i] * st.vy[i];
      if (sp2 > vMax * vMax) { const sc = vMax / Math.sqrt(sp2); st.vx[i] *= sc; st.vy[i] *= sc; }
      if (st.angV[i] > wMax) st.angV[i] = wMax; else if (st.angV[i] < -wMax) st.angV[i] = -wMax;

      // advance pose
      st.px[i] += st.vx[i] * dt;
      st.py[i] += st.vy[i] * dt;
      st.ang[i] += st.angV[i] * dt;

      if (s === AIRBORNE) {
        st.pz[i] += st.vz[i] * dt;
        if (st.pz[i] <= 0 && st.vz[i] < 0) {
          st.pz[i] = 0;
          if (-st.vz[i] < LIMITS.zSettle) {
            st.vz[i] = 0; st.state[i] = CONTACT;
          } else {
            st.vz[i] = -p.restitution * st.vz[i];
            st.vx[i] *= 0.6; st.vy[i] *= 0.6; st.angV[i] *= 0.6;
          }
        }
      }

      // sheet bounds
      if (st.px[i] < margin) { st.px[i] = margin; if (st.vx[i] < 0) st.vx[i] = 0; }
      else if (st.px[i] > p.sheetW - margin) { st.px[i] = p.sheetW - margin; if (st.vx[i] > 0) st.vx[i] = 0; }
      if (st.py[i] < margin) { st.py[i] = margin; if (st.vy[i] < 0) st.vy[i] = 0; }
      else if (st.py[i] > p.sheetH - margin) { st.py[i] = p.sheetH - margin; if (st.vy[i] > 0) st.vy[i] = 0; }

      // hole rim wall
      const dx = st.px[i] - p.holeX, dy = st.py[i] - p.holeY;
      const r2 = dx * dx + dy * dy;
      if (r2 < holeR2 && r2 > 1e-16) {
        const r1 = Math.sqrt(r2);
        st.px[i] = p.holeX + dx / r1 * p.holeWallR;
        st.py[i] = p.holeY + dy / r1 * p.holeWallR;
        const vr = (st.vx[i] * dx + st.vy[i] * dy) / r1;
        if (vr < 0) { st.vx[i] -= vr * dx / r1; st.vy[i] -= vr * dy / r1; }
      }
    }
  }

  // Wake sleeping filings whose field torque AT THEIR CURRENT ORIENTATION
  // now beats static friction (current ramped up, AC swing, reversal hitting
  // remanence). Aligned filings feel ~zero torque and stay asleep — that's
  // what lets the settled pattern rest between taps.
  wakeScan() {
    const p = this.p, st = this.st, H = this.Hout;
    const rem = p.remanenceFrac;
    for (let i = 0; i < st.n; i++) {
      if (st.state[i] !== ASLEEP) continue;
      this.field.eval(st.px[i], st.py[i], H);
      const ux = st.ux[i], uy = st.uy[i];
      const Hpar = H[0] * ux + H[1] * uy;
      const Hperp = -H[0] * uy + H[1] * ux;
      const dChiV = st.volChiPar[i] - st.volChiPerp[i];
      const tau = MU0 * (dChiV * Hpar * Hperp + st.remSign[i] * st.mSat[i] * rem * Hperp);
      const thrT = 0.9 * p.muS * st.mg[i] * st.lever[i];
      const Fg = MU0 * st.volChiPar[i] * H[2] * H[2] / Math.max(H[3], 1e-4);
      const thrF = 0.9 * p.muS * st.mg[i];
      if (Math.abs(tau) > thrT || Fg > thrF) { st.state[i] = CONTACT; st.still[i] = 0; }
    }
  }

  // Advance nSub substeps; neighbor cache rebuilt at frame start, after
  // sprinkles/taps (nbDirty), and every 8 substeps as a staleness bound.
  step(dt, nSub) {
    this.buildNeighbors();
    for (let s = 0; s < nSub; s++) {
      if (this.nbDirty || (s > 0 && s % 8 === 0)) this.buildNeighbors();
      this.substep(dt);
    }
  }
}

function expInterval(rng, rate) { return -Math.log(1 - rng.f()) / rate; }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
