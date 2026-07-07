// Physical constants and default parameters. The current app uses a lightweight
// visual animator for film output; the SI constants stay here for older helper
// modules and documentation.

export const MU0 = 4 * Math.PI * 1e-7;      // vacuum permeability
export const G = 9.81;                       // gravity
export const RHO_IRON = 7874;                // kg/m^3
export const MS_IRON = 1.71e6;               // saturation magnetization, A/m

// Prolate spheroid demagnetizing factor along the long axis, aspect a = L/d.
export function demagFactorParallel(a) {
  if (a <= 1.001) return 1 / 3;
  const e = Math.sqrt(1 - 1 / (a * a));
  return ((1 - e * e) / (2 * e * e * e)) * (Math.log((1 + e) / (1 - e)) - 2 * e);
}

// Default simulation parameters (the control panel edits a copy of this).
export const DEFAULT_PARAMS = {
  // --- geometry (plane coordinates, meters; origin at cardboard TL corner) ---
  sheetW: 0.40,
  sheetH: 0.30,
  holeX: 0.20,            // overwritten from calibration backprojection
  holeY: 0.15,
  holeWallR: 0.013,       // filings cannot enter this radius (hole rim)
  wireR: 0.002,           // wire radius, regularizes B near r=0

  // --- current ---
  currentA: 30,           // amplitude, A
  currentMode: 'dc',      // 'dc' | 'ac'
  acFreq: 5,              // Hz
  rampDur: 0.4,           // s, linear ramp between current targets
  currentDir: -1,         // -1: down through the hole (matches drawn wire path)
  currentOn: false,

  // --- ambient (Earth) field ---
  ambientOn: true,
  ambientB: 25e-6,        // T
  ambientAngle: 0.6,      // rad, in-plane direction

  // --- filings material/geometry ---
  filingMedianL: 0.50e-3, // m
  filingSigmaLn: 0.22,
  filingMinL: 0.16e-3,
  filingMaxL: 1.05e-3,
  aspectMin: 4,
  aspectMax: 9,
  remanenceFrac: 0.01,    // f_r · Ms remanent magnetization along axis
  coerciveH: 250,         // A/m, |H∥| above this re-sets remanence sign

  // --- visual animator cheats ---
  maxVisualParticles: 18000,
  currentAutoAlign: false,// first current-on waits for tap; later increases move
  currentMotion: 0.72,    // how strongly current changes push the pattern
  visualFriction: 0.42,   // 0 = slides freely, 1 = mostly rotates in place
  slideAmount: 1.1,       // artistic multiplier for visible translation
  fieldReach30A: 0.145,   // m, hard affected radius at 30 A
  fieldReferenceR: 0.058, // m, normalizes the 1/r response strength
  fieldFalloffPower: 0.95,
  fieldMinResponse: 0.006,
  chainSpacing: 0.0056,   // m, radial spacing between visible filing bands
  chainCapture: 0.96,     // how strongly filings snap toward chain bands
  chainStrength: 1.35,    // magnetized-neighbor chaining multiplier
  inwardPull: 0.0065,     // m, slight gradient drift toward stronger field
  alignSpeed: 3.8,        // position interpolation speed
  rotateSpeed: 6.8,       // angle interpolation speed
  airborneAlignSpeed: 11.0,
  airborneRotateSpeed: 15.0,

  // --- contact & friction ---
  muS: 0.5,
  muK: 0.35,
  restitution: 0.1,

  // --- taps ---
  tapStrength: 8,         // peak plate acceleration, in g's
  tapDur: 0.008,          // s, half-sine push
  autoTapRate: 0,         // Hz (Poisson); 0 = off

  // --- integration ---
  dtInteractive: 1.0e-3,
  dtOffline: 0.5e-3,
  maxParticles: 120000,
  neighborCutoff: 3.0e-3, // m, dipole interaction radius (= hash cell size)

  // --- sprinkle defaults ---
  sprinkleCount: 11000,
  sprinkleR: 0.17,        // m, disk radius around hole
  sprinklePattern: 'disk',// 'disk' | 'ring' | 'sheet'
  sprinkleClump: 0.03,    // 0 = uniform Poisson, 1 = heavily clustered

  seed: 1337,
};

// Numerical safety rails (not physics — stability clamps).
export const LIMITS = {
  vMax: 0.25,             // m/s translational clamp
  wMax: 300,              // rad/s angular clamp
  pairForceCapMG: 5,      // per-pair force cap, multiples of filing weight
  baumgarte: 0.15,        // contact position-correction factor per step
  vStick: 1.0e-3,         // m/s below which static friction can latch
  wStick: 0.15,           // rad/s
  sleepSteps: 24,         // consecutive still substeps before sleeping
  wakeCheckEvery: 16,     // substeps between torque-based wake scans
  zSettle: 0.01,          // m/s vertical speed treated as landed
};
