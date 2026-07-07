// Magnetic field of the vertical wire through the hole + ambient field,
// and the current driver (DC / AC / ramps / reversal), all in SI.
//
// On the cardboard plane the wire field is exactly tangential:
//   H(r) = I / (2π r) φ̂
// With current flowing DOWN through the hole (dir = -1, matching the film's
// drawn wire path) the field circulates so that, in plane coordinates
// (x right, y toward the viewer), H at a point east of the hole points +y.

import { MU0 } from './units.js';

export class CurrentDriver {
  constructor(params) {
    this.p = params;
    this.I0 = 0;          // value when the last target was set
    this.target = 0;      // target amplitude (signed by on/off, not direction)
    this.t0 = -1e9;       // time the target was set
    this.mode = 'dc';
    this.freq = 5;
    this.rampDur = 0.4;
  }

  // Set a new target amplitude at sim time t (ramps linearly from current value).
  set(t, { amp = null, mode = null, freq = null, rampDur = null } = {}) {
    this.I0 = this.envelope(t);
    this.t0 = t;
    if (amp !== null) this.target = amp;
    if (mode !== null) this.mode = mode;
    if (freq !== null) this.freq = freq;
    if (rampDur !== null) this.rampDur = rampDur;
  }

  // Ramped amplitude envelope (always ≥ 0 toward target).
  envelope(t) {
    const dt = t - this.t0;
    if (dt >= this.rampDur || this.rampDur <= 0) return this.target;
    return this.I0 + (this.target - this.I0) * (dt / this.rampDur);
  }

  // Signed instantaneous current (A). Positive = along +z (up); the direction
  // toggle multiplies in the worker via params.currentDir.
  value(t) {
    const env = this.envelope(t);
    if (this.mode === 'ac') return env * Math.sin(2 * Math.PI * this.freq * (t - this.t0));
    return env;
  }
}

// Field evaluator bound to hot-loop state. Returns H in A/m via out array.
export class FieldEval {
  constructor(params) {
    this.update(params);
    this.Iz = 0; // signed current along +z, set once per substep
  }

  update(p) {
    this.hx = p.holeX; this.hy = p.holeY;
    this.wireR = p.wireR;
    this.ambOn = p.ambientOn;
    this.ambHx = Math.cos(p.ambientAngle) * p.ambientB / MU0;
    this.ambHy = Math.sin(p.ambientAngle) * p.ambientB / MU0;
  }

  setCurrent(IzSigned) { this.Iz = IzSigned; }

  // H at plane point (x,y): out = [Hx, Hy, Hmag_wire, r]
  eval(x, y, out) {
    const dx = x - this.hx, dy = y - this.hy;
    let r2 = dx * dx + dy * dy;
    const rmin = this.wireR * 2;
    if (r2 < rmin * rmin) r2 = rmin * rmin;
    const r = Math.sqrt(r2);
    // +z current, right-handed: H = I/(2πr²) · (-dy, dx)
    const k = this.Iz / (2 * Math.PI * r2);
    let Hx = -dy * k, Hy = dx * k;
    const Hw = Math.abs(this.Iz) / (2 * Math.PI * r);
    if (this.ambOn) { Hx += this.ambHx; Hy += this.ambHy; }
    out[0] = Hx; out[1] = Hy; out[2] = Hw; out[3] = r;
    return out;
  }
}
