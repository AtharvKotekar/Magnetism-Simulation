import { DEFAULT_UI } from './ui/defaults.js';

const COIL_UI = {
  ...DEFAULT_UI,
  showCurrentPulses: false,
  showCurrentComets: true,
  showCurrentCometHeads: true,
  showFieldLines: true,
  showFieldPulses: false,
  showFieldComets: true,
  showFieldCometHeads: true,
  showFieldArrows: false,
  fieldLineColor: '#f8f5ec',
  fieldMotionColor: '#f8f5ec',
  fieldArrowColor: '#f8f5ec',
  fieldLineStrength: 2.2,
  fieldLineOpacity: 0.35,
  fieldMaxRadiusPx: 1520,
  fieldFirstRadiusPx: 64,   // just outside the 10.5 mm hole rim (~58 px)
  // Near-even crossing spacing along the loop diameter (gap ratio ~1) with
  // 11 circles per side + the axis line: the interior of the loop reads as a
  // dense parallel bundle, like the reference footage.
  fieldRadiusMultiplier: 1.08,
  fieldLineCount: 22,
  fieldLineThickness: 1.45,
  fieldMotionThickness: 0.65,
  boardShake: 0.72,
};

export function buildVariantConfig(name = 'straight') {
  if (name === 'coil') return COIL_VARIANT;
  if (name === 'bar') return BAR_VARIANT;
  return STRAIGHT_VARIANT;
}

const STRAIGHT_VARIANT = {
  name: 'straight',
  brandHTML: 'MAGNETISM <span>STAGE</span>',
  scene: {
    assetsBase: 'assets/',
  },
  calibrationKey: 'straight',
  fieldOverlay: 'wire',
  currentOverlay: {},
  currentDirectionText(dir) {
    return dir < 0 ? '⬇ current flows DOWN through hole' : '⬆ current flows UP through hole';
  },
  params: {
    fieldModel: 'wire',
  },
};

// Measured from the coil keyframe: corners fitted to the cardboard alpha
// edges (image1), holes from the dark blobs in image0, arch apex from the
// occluder alpha (image2). wireHeight ≈ loop radius (half the 0.236 m hole
// separation) so tap lift projects with a realistic vertical scale.
const COIL_CALIBRATION = {
  corners: {
    tl: [438, 227],
    tr: [2486, 231],
    br: [2749, 1428],   // bottom corners sit on the top-surface front edge
    bl: [120, 1399],    // (the darker board front face starts below it)
  },
  hole: [1464, 741],
  coilLeft: [857, 742],
  coilRight: [2071, 741],
  wireTop: [1448, 337],
  sheetW: 0.40,
  sheetH: 0.22,
  wireHeight: 0.118,
  holeWallR: 0.0105,
};

// Multi-turn overlays. Each PNG bundle is placed so its feet sit on the
// measured holes and its outermost tube lies exactly on the arch baked into
// image0 (X anchored feet→holes, Y anchored feet + outer apex → baked apex
// 337; ≤2.8% anisotropy). Paths are ray-traced tube centerlines ordered
// innermost→outermost, each running right hole → arch → left hole so dir=+1
// comet flow reads left-to-right on every conductor.
const COIL_TURNS = {
  2: {
    src: 'assets/coil-x2.png',
    rect: [711, 276, 1450.4, 520.6],
    paths: [
      [[2071, 741], [2037, 652], [2000, 592], [1951, 542], [1894, 503], [1838, 473], [1783, 449],
       [1731, 432], [1682, 419], [1636, 408], [1591, 401], [1548, 396], [1506, 392], [1464, 391],
       [1422, 391], [1380, 394], [1336, 398], [1291, 404], [1243, 414], [1192, 426], [1138, 443],
       [1083, 467], [1024, 497], [967, 538], [917, 589], [882, 650], [857, 742]],
      [[2071, 741], [2065, 647], [2033, 583], [1988, 527], [1935, 481], [1878, 443], [1821, 415],
       [1765, 392], [1711, 374], [1660, 361], [1610, 351], [1560, 344], [1513, 339], [1464, 337],
       [1416, 337], [1367, 341], [1317, 347], [1265, 356], [1213, 368], [1157, 385], [1099, 408],
       [1041, 437], [984, 475], [931, 522], [884, 579], [855, 646], [857, 742]],
    ],
  },
  3: {
    src: 'assets/coil-x3.png',
    rect: [709.7, 276.7, 1452.8, 514.4],
    paths: [
      [[2071, 741], [2025, 655], [1978, 600], [1920, 558], [1859, 526], [1801, 502], [1749, 485],
       [1701, 471], [1656, 461], [1614, 454], [1574, 450], [1537, 446], [1501, 443], [1464, 442],
       [1428, 442], [1391, 443], [1353, 446], [1313, 452], [1271, 458], [1224, 466], [1173, 479],
       [1120, 496], [1061, 521], [998, 553], [940, 597], [894, 653], [857, 742]],
      [[2071, 741], [2047, 651], [2008, 592], [1956, 542], [1899, 503], [1842, 473], [1786, 451],
       [1735, 432], [1686, 418], [1639, 407], [1593, 400], [1550, 394], [1507, 390], [1464, 390],
       [1422, 390], [1378, 392], [1334, 396], [1288, 403], [1240, 413], [1188, 426], [1135, 443],
       [1078, 467], [1021, 498], [962, 538], [910, 589], [872, 650], [857, 742]],
      [[2071, 741], [2069, 648], [2037, 583], [1992, 528], [1939, 482], [1882, 445], [1824, 416],
       [1768, 393], [1715, 375], [1663, 360], [1612, 351], [1563, 344], [1513, 339], [1464, 337],
       [1415, 337], [1365, 341], [1315, 346], [1263, 355], [1209, 368], [1154, 386], [1095, 408],
       [1037, 438], [980, 477], [927, 524], [880, 580], [850, 646], [857, 742]],
    ],
  },
};

export const COIL_PRESETS = [
  {
    name: 'Manual coil stage',
    hint: 'Current on, full-board sprinkle, tap when you want the dipole pattern to settle.',
    duration: 20,
    ui: { ...COIL_UI },
    cal: { ...COIL_CALIBRATION },
    params: {
      fieldModel: 'coilDipole',
      currentA: 32,
      currentMode: 'dc',
      acFreq: 5,
      rampDur: 0.4,
      currentDir: 1,
      currentAutoAlign: false,
      currentMotion: 0.58,
      // Reach covers the whole board (far corner rEff ≈ 0.145 m) so there is
      // no dead zone: the real demo shows chains everywhere, strongest near
      // the legs and along the center lines through the loop.
      fieldReach30A: 0.150,
      fieldReferenceR: 0.050,
      fieldFalloffPower: 1.05,
      fieldMinResponse: 0.004,
      chainSpacing: 0.0032,
      chainStrength: 0.55,
      chainCapture: 0.90,
      inwardPull: 0.0028,
      pullRadius: 0.045,
      axisPull: 0.0012,
      visualFriction: 0.32,
      slideAmount: 0.82,
      alignSpeed: 4.2,
      rotateSpeed: 5.7,
      tapStrength: 8.0,
      tapLiftAll: 1.0,
      tapJitterAmount: 0.22,
      filingMedianL: 0.68e-3,
      sprinkleCount: 18000,
      strayCount: 2500,
      sprinkleR: 0.190,
      sprinklePattern: 'sheet',
      sprinkleClump: 0.35,
    },
    timeline: [
      { t: 0.2, type: 'sprinkle', count: 18000, strayCount: 2500, pattern: 'sheet', radius: 0.190, clump: 0.35 },
    ],
  },
  {
    name: 'Dipole reveal',
    hint: 'A calm sprinkle, then taps reveal the two-pole field around the loop.',
    duration: 10,
    ui: { ...COIL_UI },
    cal: { ...COIL_CALIBRATION },
    params: { fieldModel: 'coilDipole', currentA: 35, currentMode: 'dc' },
    timeline: [
      { t: 0.2, type: 'sprinkle', count: 16000, strayCount: 2600, pattern: 'sheet', radius: 0.19, clump: 0.35 },
      { t: 1.2, type: 'current', on: true, amp: 35, mode: 'dc', rampDur: 0.5 },
      { t: 2.1, type: 'tapBurst', n: 5, interval: 0.55, strength: 8 },
    ],
  },
  {
    name: 'Reverse coil',
    hint: 'The current reverses after the first settle so the motion indicators and filings reorient.',
    duration: 14,
    ui: { ...COIL_UI },
    cal: { ...COIL_CALIBRATION },
    params: { fieldModel: 'coilDipole', currentA: 36, currentMode: 'dc' },
    timeline: [
      { t: 0.2, type: 'sprinkle', count: 16000, strayCount: 2600, pattern: 'sheet', radius: 0.19, clump: 0.35 },
      { t: 1.2, type: 'current', on: true, amp: 36, mode: 'dc', rampDur: 0.5 },
      { t: 2.0, type: 'tapBurst', n: 4, interval: 0.5, strength: 8 },
      { t: 6.8, type: 'current', on: true, amp: -36, mode: 'dc', rampDur: 0.6 },
      { t: 7.8, type: 'tapBurst', n: 4, interval: 0.5, strength: 8 },
    ],
  },
  {
    name: 'Bare coil stage',
    hint: 'Empty timeline — drive the coil live from the panel.',
    duration: 20,
    ui: { ...COIL_UI },
    cal: { ...COIL_CALIBRATION },
    params: { fieldModel: 'coilDipole' },
    timeline: [],
  },
];

// Bar magnet on TOP of the paper. Measured from the extracted SVG layers:
// paper corners from image0, magnet body box from the image2 alpha mapped
// through its SVG placement rect [1086,695,585,138]; poles at the body's end
// faces. coilLeft/coilRight double as the N/S pole pins.
const BAR_CALIBRATION = {
  corners: {
    tl: [246, 92],
    tr: [2520, 84],
    br: [2512, 1466],
    bl: [224, 1490],
  },
  hole: [1378, 764],        // magnet center (lift-scale origin)
  coilLeft: [1087, 764],    // N pole face
  coilRight: [1669, 764],   // S pole face
  wireTop: [1378, 690],     // top edge of the magnet body
  sheetW: 0.40,
  sheetH: 0.243,
  wireHeight: 0.012,        // magnet body height → vertical lift scale
  // Filings really do stick to the bar: keep the no-go rim hair-thin so
  // they press against the body outline instead of a visible offset band.
  holeWallR: 0.0006,
};

const BAR_UI = {
  ...DEFAULT_UI,
  showIndicator: false,       // no conductor — permanent magnet
  showCurrentPulses: false,
  showCurrentComets: false,
  showCurrentCometHeads: false,
  showCurrentArrows: false,
  showFieldLines: true,
  showFieldPulses: false,
  showFieldComets: true,
  showFieldCometHeads: true,
  showFieldArrows: false,
  fieldLineColor: '#f8f5ec',
  fieldMotionColor: '#f8f5ec',
  fieldArrowColor: '#f8f5ec',
  fieldLineStrength: 2.2,
  fieldLineOpacity: 0.35,
  fieldMaxRadiusPx: 1650,
  fieldFirstRadiusPx: 46,     // first arc bulge above/below the magnet
  fieldRadiusMultiplier: 1.22,
  fieldLineCount: 16,
  fieldLineThickness: 1.45,
  fieldMotionThickness: 0.65,
  boardShake: 0.72,
};

const BAR_PARAMS = {
  fieldModel: 'barMagnet',
  currentA: 30,               // acts as magnet strength
  currentMode: 'dc',
  currentDir: 1,              // 1 = N pole on the left
  currentAutoAlign: true,     // permanent magnet: the field is always live
  currentMotion: 0.58,
  inwardPull: 0.0032,         // filings crowd and cling to the bar
  pullRadius: 0.05,
  fieldReach30A: 0.200,       // whole paper responds, strongest at the poles
  fieldReferenceR: 0.045,
  fieldFalloffPower: 1.0,
  fieldMinResponse: 0.004,
  chainSpacing: 0.0030,
  chainStrength: 0.55,
  chainCapture: 0.90,
  axisPull: 0,
  visualFriction: 0.32,
  slideAmount: 0.82,
  alignSpeed: 4.2,
  rotateSpeed: 5.7,
  tapStrength: 8.0,
  tapLiftAll: 1.0,
  tapJitterAmount: 0.22,
  filingMedianL: 0.62e-3,
  sprinkleCount: 18000,
  strayCount: 2500,
  sprinkleR: 0.19,
  sprinklePattern: 'sheet',
  sprinkleClump: 0.35,
};

export const BAR_PRESETS = [
  {
    name: 'Manual bar stage',
    hint: 'Magnet on the paper, full sprinkle — tap to reveal the field.',
    duration: 20,
    ui: { ...BAR_UI },
    cal: { ...BAR_CALIBRATION },
    params: { ...BAR_PARAMS },
    timeline: [
      { t: 0.2, type: 'sprinkle', count: 18000, strayCount: 2500, pattern: 'sheet', radius: 0.19, clump: 0.35 },
    ],
  },
  {
    name: 'Bar magnet reveal',
    hint: 'Sprinkle, then taps arrange the filings along the magnet field.',
    duration: 10,
    ui: { ...BAR_UI },
    cal: { ...BAR_CALIBRATION },
    params: { ...BAR_PARAMS, currentA: 32 },
    timeline: [
      // The magnet is already there — its field is on before the sprinkle,
      // so nearby filings stick to the bar the moment they land.
      { t: 0.05, type: 'current', on: true, amp: 32, mode: 'dc', rampDur: 0.05 },
      { t: 0.4, type: 'sprinkle', count: 17000, strayCount: 2600, pattern: 'sheet', radius: 0.19, clump: 0.35 },
      { t: 1.6, type: 'tapBurst', n: 5, interval: 0.55, strength: 8 },
    ],
  },
  {
    name: 'Bare bar stage',
    hint: 'Empty timeline — drive the magnet stage live from the panel.',
    duration: 20,
    ui: { ...BAR_UI },
    cal: { ...BAR_CALIBRATION },
    params: { ...BAR_PARAMS },
    timeline: [],
  },
];

const BAR_VARIANT = {
  name: 'bar',
  brandHTML: 'MAGNETISM <span>BAR MAGNET</span>',
  scene: {
    assetsBase: 'assets/',
    // Magnet body+shadow plate drawn under the filings; the body-only layer
    // occludes filings above (the magnet rests ON the paper).
    underlay: { src: 'assets/magnet-under.png', rect: [1076, 690, 647, 194] },
    occluderRect: [1086, 695, 585, 138],
  },
  calibrationKey: 'bar',
  defaultCalibration: BAR_CALIBRATION,
  fieldOverlay: 'bar',
  // Magnet no-go box in image px — deliberately ~12 px INSIDE the body
  // silhouette so filings press into the outline and the occluder covers
  // their tips: they read as physically stuck to the bar, like real filings.
  barBodyRect: [1099, 708, 1657, 820],
  currentOverlay: {},
  currentDirectionText(dir) {
    return dir < 0 ? 'N pole on the RIGHT (field flipped)' : 'N pole on the LEFT';
  },
  params: BAR_PARAMS,
  presets: BAR_PRESETS,
};

const COIL_VARIANT = {
  name: 'coil',
  brandHTML: 'MAGNETISM <span>COIL</span>',
  scene: {
    assetsBase: 'assets/',
    // Keyframe with the cell physically flipped, shown while the current
    // runs right-to-left (dir = -1). image0.png (+ terminal wired for
    // left-to-right flow) stays the dir = +1 keyframe.
    reverseBase: 'assets/image0-rev.png',
    occluderRect: [0, 0, 2752, 1536],
    turnOverlays: COIL_TURNS,
  },
  calibrationKey: 'coil',
  defaultCalibration: COIL_CALIBRATION,
  fieldOverlay: 'coil',
  currentOverlay: {
    // Arch centerline ray-traced from the occluder alpha (image2), anchored
    // at the measured holes. Ordered right hole → arch → left hole: the dash
    // shader moves marks toward decreasing arc for dir = +1, so dir = +1
    // flows left-to-right over the arch, matching the direction label below.
    // Nudge live with the Path offset X/Y sliders in the Conductor Overlay
    // panel if the keyframe ever shifts.
    path: [
      [2071, 741], [2048, 643], [2013, 583], [1967, 533], [1914, 492],
      [1859, 459], [1805, 434], [1753, 414], [1704, 398], [1657, 386],
      [1611, 376], [1567, 370], [1523, 367], [1480, 364], [1438, 363],
      [1394, 364], [1350, 369], [1304, 374], [1257, 382], [1207, 394],
      [1155, 410], [1101, 431], [1045, 458], [989, 494], [935, 538],
      [890, 593], [861, 656], [857, 742],
    ],
    pathsByTurns: { 2: COIL_TURNS[2].paths, 3: COIL_TURNS[3].paths },
  },
  currentDirectionText(dir) {
    return dir < 0 ? '↺ current runs right-to-left around loop' : '↻ current runs left-to-right around loop';
  },
  params: {
    fieldModel: 'coilDipole',
    // Coil response tuning (see 'Manual coil stage' for the rationale) —
    // applied at boot so every preset inherits it.
    fieldReach30A: 0.150,
    fieldReferenceR: 0.050,
    fieldFalloffPower: 1.05,
    fieldMinResponse: 0.004,
    chainSpacing: 0.0032,
    chainStrength: 0.55,
    chainCapture: 0.90,
    inwardPull: 0.0028,
    pullRadius: 0.045,
    axisPull: 0.0012,
  },
  presets: COIL_PRESETS,
};
