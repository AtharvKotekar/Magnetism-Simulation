// Seeded xoshiro128** — all simulation randomness flows through one instance
// in the worker so takes replay deterministically from (seed, params, timeline).

export class RNG {
  constructor(seed) {
    // splitmix32 to expand a single uint32 seed into 4 non-zero state words
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.s0 = next() | 1; this.s1 = next(); this.s2 = next(); this.s3 = next();
  }

  u32() {
    const { s0, s1, s2, s3 } = this;
    const r = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    this.s2 = (s2 ^ s0) >>> 0;
    this.s3 = (s3 ^ s1) >>> 0;
    this.s1 = (s1 ^ this.s2) >>> 0;
    this.s0 = (s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return r;
  }

  // uniform [0,1)
  f() { return this.u32() / 4294967296; }
  // uniform [a,b)
  range(a, b) { return a + (b - a) * this.f(); }
  // standard normal (Box–Muller; consumes exactly two draws)
  normal() {
    const u = 1 - this.f(), v = this.f();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  lognormal(median, sigmaLn) { return median * Math.exp(sigmaLn * this.normal()); }
}

function rotl(x, k) { return ((x << k) | (x >>> (32 - k))) >>> 0; }
