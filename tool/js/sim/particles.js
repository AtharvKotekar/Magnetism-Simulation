// Particle state: structure-of-arrays over preallocated typed arrays.
// No objects in the hot path; per-filing physical coefficients precomputed at spawn.

import { MU0, G, RHO_IRON, MS_IRON, demagFactorParallel } from './units.js';

export const ASLEEP = 0, CONTACT = 1, AIRBORNE = 2;

export class ParticleState {
  constructor(maxN) {
    this.maxN = maxN;
    this.n = 0;
    const F = (k) => new Float32Array(maxN);
    // pose
    this.px = F(); this.py = F(); this.pz = F();
    this.vx = F(); this.vy = F(); this.vz = F();
    this.ang = F(); this.angV = F();
    // geometry / inertia
    this.len = F(); this.wid = F();
    this.mass = F(); this.invMass = F(); this.invI = F();
    this.mg = F();                    // weight, cached (friction normal N = mg)
    this.lever = F();                 // L/4 friction torque lever
    // magnetics (precomputed at spawn)
    this.volChiPar = F();             // V·χ∥
    this.volChiPerp = F();            // V·χ⊥
    this.mSat = F();                  // V·Ms moment cap (remanent moment = mSat·f_r, live)
    this.remSign = new Int8Array(maxN);
    // per-substep computed moment (needed as pair sources even when asleep)
    this.mx = F(); this.my = F();
    // axis direction cache (cos/sin of ang, refreshed with the moment —
    // valid while asleep since sleeping filings don't rotate)
    this.ux = F(); this.uy = F();
    // bookkeeping
    this.state = new Uint8Array(maxN);
    this.still = new Uint16Array(maxN); // consecutive still substeps
    this.glint = F();                   // static shading seed
    // force accumulators
    this.fx = F(); this.fy = F(); this.tq = F();
  }

  clear() { this.n = 0; }

  spawn(rng, p, x, y, z) {
    if (this.n >= this.maxN) return -1;
    const i = this.n++;
    const L = Math.min(p.filingMaxL, Math.max(p.filingMinL, rng.lognormal(p.filingMedianL, p.filingSigmaLn)));
    const aspect = rng.range(p.aspectMin, p.aspectMax);
    const d = L / aspect;
    const V = (Math.PI / 6) * d * d * L;       // prolate spheroid volume
    const m = RHO_IRON * V;
    const Irot = (m * L * L) / 12;             // thin rod about center
    const Npar = demagFactorParallel(aspect);
    const chiPar = 1 / Npar;                   // demag-limited apparent susceptibility
    const chiPerp = 2 / (1 - Npar);

    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
    this.ang[i] = rng.range(0, Math.PI * 2);
    this.ux[i] = Math.cos(this.ang[i]); this.uy[i] = Math.sin(this.ang[i]);
    this.angV[i] = 0;
    this.len[i] = L; this.wid[i] = d;
    this.mass[i] = m; this.invMass[i] = 1 / m; this.invI[i] = 1 / Irot;
    this.mg[i] = m * G;
    this.lever[i] = L / 4;
    this.volChiPar[i] = V * chiPar;
    this.volChiPerp[i] = V * chiPerp;
    this.mSat[i] = V * MS_IRON;
    this.remSign[i] = rng.f() < 0.5 ? -1 : 1;
    this.state[i] = z > 1e-6 ? AIRBORNE : CONTACT;
    this.still[i] = 0;
    this.glint[i] = rng.f();
    return i;
  }
}

// Sprinkle: clustered point process (Thomas-like) so filings land in the
// slightly clumpy way they leave a real shaker, then fall from a few cm up.
export function sprinkle(st, rng, p, opts = {}) {
  const count = opts.count ?? p.sprinkleCount;
  const pattern = opts.pattern ?? p.sprinklePattern;
  const R = opts.radius ?? p.sprinkleR;
  const clump = Math.max(0, Math.min(1, opts.clump ?? p.sprinkleClump));
  const cx = p.holeX, cy = p.holeY;
  const margin = 0.008;

  // cluster centers
  const nClusters = Math.max(1, Math.round(20 + 180 * (1 - clump)));
  const centers = [];
  for (let c = 0; c < nClusters; c++) centers.push(samplePoint(rng, pattern, cx, cy, R, p));
  const sigma = 0.006 + 0.02 * (1 - clump);

  let placed = 0, guard = 0;
  while (placed < count && guard++ < count * 20) {
    let x, y;
    if (rng.f() < 0.35 * (1 - clump) + 0.05) {
      [x, y] = samplePoint(rng, pattern, cx, cy, R, p);     // uniform background
    } else {
      const c = centers[(rng.u32() % nClusters) | 0];
      x = c[0] + sigma * rng.normal();
      y = c[1] + sigma * rng.normal();
    }
    // keep on sheet, out of the hole
    if (x < margin || x > p.sheetW - margin || y < margin || y > p.sheetH - margin) continue;
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < p.holeWallR * p.holeWallR) continue;
    const i = st.spawn(rng, p, x, y, rng.range(0.01, 0.05));
    if (i < 0) break;
    st.vx[i] = 0.01 * rng.normal();
    st.vy[i] = 0.01 * rng.normal();
    st.vz[i] = -rng.range(0, 0.1);
    st.angV[i] = 8 * rng.normal();
    placed++;
  }
  return placed;
}

function samplePoint(rng, pattern, cx, cy, R, p) {
  if (pattern === 'sheet') {
    return [rng.range(0.01, p.sheetW - 0.01), rng.range(0.01, p.sheetH - 0.01)];
  }
  if (pattern === 'ring') {
    const r = R * (0.55 + 0.45 * Math.sqrt(rng.f()));
    const a = rng.range(0, 2 * Math.PI);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  // disk (area-uniform)
  const r = R * Math.sqrt(rng.f());
  const a = rng.range(0, 2 * Math.PI);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
