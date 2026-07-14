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
  fieldFirstRadiusPx: 350,  // inner loop bulge (~0.6x pole separation)
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
  if (name === 'solenoid') return SOLENOID_VARIANT;
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
  // Compass prop: draggable on the cardboard, needle deflects with the net
  // in-plane field (Earth north + wire tangent) — the Oersted demo.
  compass: { assetsBase: 'assets/' },
  // Continuous-shot surge move (panel ⚡ button): amplitude ramps to targetA
  // while each listed adjuster glides from its current value to its target.
  // The rings stay put — the story is told by the brighter/faster pulses
  // and the filing response strengthening (worker params glide too), with
  // the single tap blooming the pattern outward.
  surge: {
    label: '⚡ Surge to 100 A',
    title: 'Continuous-shot move: ramp 25 → 100 A — pulses brighten to 0.9× and speed to 2.5×, the filing response strengthens (chain 1.85×, pulls up) and ONE tap blooms the pattern. Rings stay put.',
    targetA: 100,
    dur: 2.6,
    ui: { currentIndicatorStrength: 0.90, currentPulseSpeed: 2.50 },
    params: { chainStrength: 1.85, inwardPull: 0.00725, pullRadius: 0.140, axisPull: 0.00575 },
  },
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
    // Continuous-shot surge take: load, tap once so the pattern settles at
    // 32 A, record, then hit the panel's ⚡ Surge button — amplitude ramps
    // 32 → 100 A while rings grow 10 → 13, the multiplier widens
    // 1.08 → 1.28, pulses speed to 2.35× and field motion to 1.7×, with
    // exactly ONE tap and no re-sprinkle.
    name: 'Coil surge stage 32→100 A',
    hint: 'Base look at 32 A — record, then ⚡ Surge: rings bloom 10→13 (fading in smoothly) wider apart, filings surge, one tap.',
    duration: 20,
    ui: {
      ...COIL_UI,
      currentOn: true,
      fieldLineCount: 10,
      fieldRadiusMultiplier: 1.08,
      fieldFirstRadiusPx: 64,
      fieldMaxRadiusPx: 1520,
      fieldFalloffCurve: 1.0,
      fieldLineStrength: 2.2,
      fieldLineOpacity: 0.35,
      fieldLineThickness: 1.45,
      fieldLineDetail: 88,
      fieldMotionStrength: 1.25,
      fieldMotionSpeed: 1.0,
      fieldMotionSpacing: 170,
      currentIndicatorStrength: 0.6,
      currentPulseSpeed: 1.0,
      currentPulseSpacing: 140,
      currentTrackWidth: 12,
      coilTurns: 1,
      boardShake: 0.72,
      liftScale: 2.0,
    },
    // holeWallR at its minimum: filings pack right up to the conductors,
    // so the surge visibly draws material toward the legs.
    cal: { ...COIL_CALIBRATION, holeWallR: 0.006 },
    params: {
      fieldModel: 'coilDipole',
      currentA: 32,
      currentMode: 'dc',
      acFreq: 5,
      rampDur: 0.4,
      currentDir: 1,
      currentAutoAlign: false,
      currentMotion: 0.58,
      // retuned live for this take so the surge tap MOVES the pattern:
      // reach covers 120% of the sheet, chains grab much harder, and the
      // pulls toward the legs / flux lines are stronger than the default
      // coil stage — the whole board reorganizes when the current jumps.
      fieldReach30A: 0.480,
      fieldReferenceR: 0.050,
      fieldFalloffPower: 1.05,
      fieldMinResponse: 0.004,
      chainSpacing: 0.0032,
      chainStrength: 1.50,
      chainCapture: 0.90,
      inwardPull: 0.0075,
      pullRadius: 0.140,
      axisPull: 0.0055,
      visualFriction: 0.32,
      slideAmount: 0.82,
      alignSpeed: 4.2,
      rotateSpeed: 5.7,
      tapStrength: 8.0,
      tapLiftAll: 0.0,
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
    // Bare-board turns take: NO sprinkle and NO taps — just the conductor
    // and its field lines. Load (1 coil, 9 rings, 80 A held), record, then
    // press ➕ Add coil: the 2-coil bundle appears and the rings bloom
    // 9 → 22; press again for 3 coils and 22 → 36. More turns = stronger
    // field, told purely with the overlay.
    name: 'Coil turns stage 1→3 coils',
    hint: 'Clear board, 80 A. Press ➕ Add coil to step 1→2→3 turns — rings bloom 10→22→36 (fading in smoothly), no sprinkle, no tap.',
    duration: 20,
    ui: {
      ...COIL_UI,
      currentOn: true,
      // 10 = 5 whole ring pairs (identical render to the old 9, which
      // rounded to 5 pairs); even counts keep the fade artefact-free
      fieldLineCount: 10,
      fieldRadiusMultiplier: 1.08,
      fieldFirstRadiusPx: 64,
      fieldMaxRadiusPx: 1520,
      fieldFalloffCurve: 1.0,
      fieldLineStrength: 2.2,
      fieldLineOpacity: 0.35,
      fieldLineThickness: 1.45,
      fieldLineDetail: 88,
      fieldMotionStrength: 1.25,
      fieldMotionSpeed: 1.0,
      fieldMotionSpacing: 170,
      currentIndicatorStrength: 0.6,
      currentPulseSpeed: 1.0,
      currentPulseSpacing: 140,
      currentTrackWidth: 12,
      coilTurns: 1,
      boardShake: 0.72,
      liftScale: 2.0,
    },
    cal: { ...COIL_CALIBRATION, holeWallR: 0.006 },
    params: {
      fieldModel: 'coilDipole',
      currentA: 80,
      currentMode: 'dc',
      acFreq: 5,
      rampDur: 0.4,
      currentDir: 1,
      currentAutoAlign: false,
      currentMotion: 0.58,
      fieldReach30A: 0.480,
      fieldReferenceR: 0.050,
      fieldFalloffPower: 1.05,
      fieldMinResponse: 0.004,
      chainSpacing: 0.0032,
      chainStrength: 2.0,
      chainCapture: 0.90,
      inwardPull: 0.008,
      pullRadius: 0.150,
      axisPull: 0.002,
      visualFriction: 0.32,
      slideAmount: 0.82,
      alignSpeed: 4.2,
      rotateSpeed: 5.7,
      tapStrength: 8.0,
      tapLiftAll: 0.0,
      tapJitterAmount: 0.22,
      filingMedianL: 0.68e-3,
      sprinkleCount: 18000,
      strayCount: 2500,
      sprinkleR: 0.190,
      sprinklePattern: 'sheet',
      sprinkleClump: 0.35,
    },
    timeline: [],   // clear board — the story is told by the overlay alone
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
  fieldMaxRadiusPx: 640,
  fieldFirstRadiusPx: 300,  // inner loop bulge
  fieldRadiusMultiplier: 1.35,
  fieldLineCount: 6,        // 3 pole-to-pole loops above + 3 below
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
  inwardPull: 0.0040,         // filings crowd and cling to the bar
  pullRadius: 0.055,
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
  sprinkleClump: 0.55,
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
      { t: 0.2, type: 'sprinkle', count: 18000, strayCount: 2500, pattern: 'sheet', radius: 0.19, clump: 0.55 },
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
      { t: 0.4, type: 'sprinkle', count: 17000, strayCount: 2600, pattern: 'sheet', radius: 0.19, clump: 0.55 },
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

const BAR_FIELD_PATHS = [[[243,755],[2519,755]],[[243,596],[379,627],[513,655],[644,680],[771,703],[888,721],[981,734],[1044,742],[1093,745],[1150,747],[1285,748],[1567,748],[1643,746],[1693,744],[1747,739],[1824,729],[1931,712],[2054,692],[2183,668],[2316,641],[2451,612],[2519,596]],[[243,344],[301,387],[363,428],[426,468],[493,506],[561,542],[631,576],[703,609],[775,639],[848,667],[918,692],[978,710],[1025,723],[1060,731],[1092,735],[1127,738],[1180,740],[1310,741],[1536,741],[1612,740],[1653,737],[1686,733],[1719,727],[1759,718],[1813,702],[1879,680],[1950,654],[2023,624],[2096,593],[2166,559],[2236,524],[2303,487],[2368,448],[2430,408],[2490,366],[2519,344]],[[662,87],[655,124],[651,162],[651,201],[654,240],[662,279],[673,319],[689,358],[708,397],[731,435],[758,473],[788,511],[822,547],[859,582],[899,616],[941,647],[983,675],[1019,696],[1047,710],[1071,719],[1093,725],[1118,729],[1154,732],[1216,733],[1381,734],[1545,733],[1608,732],[1643,729],[1669,725],[1691,719],[1714,710],[1743,696],[1779,675],[1820,647],[1862,616],[1903,582],[1940,547],[1974,511],[2004,473],[2031,435],[2054,397],[2073,358],[2088,319],[2100,279],[2107,240],[2111,201],[2111,162],[2107,124],[2099,87]],[[1381,728],[1535,727],[1598,725],[1633,723],[1656,719],[1673,715],[1686,709],[1700,699],[1719,683],[1740,660],[1760,632],[1778,603],[1791,574],[1801,545],[1806,516],[1808,488],[1806,460],[1800,433],[1790,407],[1777,383],[1761,359],[1741,337],[1719,316],[1694,297],[1666,280],[1636,264],[1605,251],[1572,239],[1537,229],[1501,221],[1465,216],[1428,212],[1390,210],[1353,211],[1316,214],[1279,218],[1243,225],[1208,234],[1174,244],[1141,257],[1111,272],[1082,288],[1056,306],[1032,326],[1011,348],[993,371],[978,395],[967,420],[959,447],[955,474],[954,502],[958,531],[965,560],[977,589],[992,618],[1012,646],[1033,672],[1053,692],[1069,705],[1083,712],[1097,717],[1116,721],[1144,724],[1190,726],[1285,728],[1381,728]],[[1381,721],[1527,720],[1591,718],[1627,716],[1649,713],[1662,709],[1666,707],[1667,707],[1668,705],[1670,704],[1671,703],[1671,702],[1673,699],[1674,698],[1679,681],[1683,655],[1683,628],[1680,603],[1673,579],[1662,556],[1649,535],[1633,516],[1613,498],[1592,483],[1568,469],[1542,456],[1515,446],[1487,438],[1457,432],[1427,428],[1396,426],[1366,426],[1335,428],[1305,432],[1275,438],[1247,446],[1220,456],[1194,469],[1170,483],[1149,499],[1130,516],[1113,535],[1100,556],[1089,579],[1082,603],[1079,628],[1079,655],[1083,681],[1088,698],[1089,699],[1091,702],[1091,703],[1093,704],[1094,705],[1095,707],[1096,707],[1100,709],[1113,713],[1135,716],[1171,718],[1235,720],[1381,721]],[[2513,755],[237,755]],[[2513,927],[2377,894],[2243,863],[2112,836],[1985,811],[1868,791],[1775,777],[1712,769],[1663,765],[1606,763],[1471,762],[1189,762],[1113,764],[1063,767],[1009,772],[932,783],[825,801],[702,823],[573,849],[440,878],[305,910],[237,927]],[[2513,1200],[2455,1153],[2393,1109],[2330,1066],[2263,1025],[2195,985],[2125,948],[2053,913],[1981,880],[1908,850],[1838,823],[1778,803],[1731,789],[1696,781],[1664,776],[1629,772],[1576,770],[1446,769],[1220,770],[1144,771],[1103,774],[1070,778],[1037,785],[997,795],[943,812],[877,836],[806,864],[733,896],[660,930],[590,966],[520,1005],[453,1045],[388,1087],[326,1131],[266,1176],[237,1200]],[[2094,1478],[2101,1438],[2105,1396],[2105,1355],[2102,1312],[2094,1270],[2083,1227],[2067,1185],[2048,1142],[2025,1101],[1998,1060],[1968,1019],[1934,980],[1897,942],[1857,905],[1815,871],[1773,841],[1737,818],[1709,803],[1685,794],[1663,787],[1638,783],[1602,780],[1540,778],[1375,777],[1211,778],[1148,780],[1113,783],[1087,787],[1065,794],[1042,803],[1013,818],[977,841],[936,871],[894,905],[853,942],[816,980],[782,1019],[752,1060],[725,1101],[702,1143],[683,1185],[668,1227],[656,1270],[649,1312],[645,1355],[645,1396],[649,1438],[657,1478]],[[1375,784],[1221,785],[1158,787],[1123,790],[1100,793],[1083,798],[1070,805],[1056,815],[1037,832],[1016,858],[996,887],[978,919],[965,950],[955,982],[950,1013],[948,1044],[950,1074],[956,1103],[966,1131],[979,1158],[995,1183],[1015,1207],[1037,1230],[1062,1250],[1090,1269],[1120,1286],[1151,1301],[1184,1314],[1219,1324],[1255,1332],[1291,1339],[1328,1343],[1366,1344],[1403,1344],[1440,1341],[1477,1336],[1513,1329],[1548,1319],[1582,1307],[1615,1294],[1645,1278],[1674,1260],[1700,1240],[1724,1219],[1745,1196],[1763,1171],[1778,1145],[1789,1117],[1797,1089],[1801,1059],[1802,1029],[1798,998],[1791,966],[1779,935],[1764,903],[1744,872],[1723,844],[1703,823],[1687,809],[1673,801],[1659,796],[1640,791],[1612,788],[1566,786],[1471,784],[1375,784]],[[1375,791],[1229,792],[1165,794],[1129,797],[1107,801],[1094,804],[1090,806],[1089,807],[1088,808],[1086,809],[1085,811],[1085,812],[1083,815],[1082,816],[1077,835],[1073,863],[1073,892],[1076,919],[1083,945],[1094,970],[1107,992],[1123,1013],[1143,1032],[1164,1050],[1188,1065],[1214,1078],[1241,1089],[1269,1098],[1299,1104],[1329,1109],[1360,1111],[1390,1111],[1421,1109],[1451,1104],[1481,1098],[1509,1089],[1536,1078],[1562,1065],[1586,1050],[1607,1032],[1626,1013],[1643,992],[1656,970],[1667,945],[1674,919],[1677,892],[1677,863],[1673,835],[1668,816],[1667,815],[1665,812],[1665,811],[1663,809],[1662,808],[1661,807],[1660,806],[1656,804],[1643,801],[1621,797],[1585,794],[1521,792],[1375,791]],[[555,-252],[547,-196],[542,-139],[542,-80],[545,-22],[555,36],[567,96],[586,155],[608,214],[634,270],[665,328],[700,384],[739,438],[781,491],[827,542],[875,588],[924,630],[965,662],[997,683],[1025,696],[1050,706],[1079,712],[1120,716],[1192,718],[1381,719],[1570,718],[1642,716],[1683,712],[1713,706],[1738,696],[1764,683],[1798,662],[1839,630],[1886,588],[1935,542],[1982,491],[2024,438],[2063,384],[2098,328],[2129,270],[2155,214],[2177,155],[2194,96],[2208,36],[2216,-22],[2221,-80],[2221,-139],[2216,-196],[2207,-252]],[[2201,1835],[2209,1775],[2214,1712],[2214,1650],[2211,1586],[2201,1523],[2189,1458],[2170,1396],[2148,1331],[2122,1270],[2091,1208],[2056,1146],[2017,1088],[1975,1031],[1929,976],[1881,924],[1832,880],[1791,845],[1759,822],[1731,809],[1706,798],[1677,792],[1636,788],[1564,785],[1375,784],[1186,785],[1114,788],[1073,792],[1043,798],[1018,809],[992,822],[958,845],[917,880],[870,924],[821,976],[774,1031],[732,1088],[693,1146],[658,1208],[627,1270],[601,1332],[579,1396],[562,1458],[548,1523],[540,1586],[535,1650],[535,1712],[540,1775],[549,1835]]];

const SOLENOID_PATH = [[1362,429,0],[1370,426,0],[1377,421,0],[1384,417,0],[1392,414,0],[1400,410,0],[1407,407,0],[1415,404,0],[1424,401,0],[1432,400,0],[1440,398,0],[1449,398,0],[1457,398,0],[1466,398,0],[1475,399,0],[1483,401,0],[1491,403,0],[1500,405,0],[1508,408,0],[1516,411,0],[1524,414,0],[1532,417,0],[1539,421,0],[1547,425,0],[1554,429,0],[1562,433,0],[1569,437,0],[1577,441,0],[1585,444,0],[1593,447,0],[1601,449,0],[1609,451,0],[1618,453,0],[1626,454,0],[1635,455,0],[1644,456,0],[1652,456,0],[1661,456,0],[1670,456,0],[1678,456,0],[1687,456,0],[1695,456,0],[1703,457,0],[1712,457,0],[1720,457,0],[1729,457,0],[1737,457,0],[1745,458,0],[1754,458,0],[1762,458,0],[1762,452,0],[1774,453,0],[1786,454,0],[1798,455,0],[1810,456,1],[1822,457,1],[1835,459,1],[1848,461,1],[1861,462,1],[1874,464,1],[1887,466,1],[1900,468,1],[1912,469,1],[1925,471,1],[1938,473,1],[1950,474,1],[1963,476,1],[1976,478,0],[1990,486,0],[1994,498,0],[2006,494,0],[2012,500,0],[2019,505,0],[2027,508,0],[2034,513,0],[2041,517,0],[2048,521,0],[2055,525,0],[2063,529,0],[2069,533,0],[2076,538,0],[2082,543,0],[2087,549,0],[2092,555,0],[2096,562,0],[2099,569,0],[2102,577,0],[2104,585,0],[2106,593,0],[2108,601,0],[2110,609,0],[2111,618,0],[2113,626,0],[2115,634,0],[2116,642,0],[2118,651,0],[2120,659,0],[2121,667,0],[2123,675,0],[2124,683,0],[2125,692,0],[2126,700,0],[2127,708,0],[2128,716,0],[2128,724,0],[2128,732,0],[2128,740,0],[2128,748,0],[2129,756,0],[2129,764,0],[2129,772,0],[2129,780,0],[2129,788,0],[2129,796,0],[2129,804,0],[2129,812,0],[2129,820,0],[2129,828,0],[2129,836,0],[2129,844,0],[2129,852,0],[2129,860,0],[2129,868,0],[2129,876,0],[2129,884,0],[2130,892,0],[2130,900,0],[2130,908,0],[2130,916,0],[2130,925,0],[2130,933,0],[2130,941,0],[2130,949,0],[2130,957,0],[2130,965,0],[2130,974,0],[2129,982,0],[2129,990,0],[2129,998,0],[2129,1006,0],[2129,1015,0],[2129,1023,0],[2129,1031,0],[2129,1039,0],[2128,1047,0],[2128,1055,0],[2127,1064,0],[2126,1072,0],[2125,1080,0],[2124,1088,0],[2122,1097,0],[2119,1105,0],[2117,1112,0],[2113,1119,0],[2109,1126,0],[2103,1131,0],[2097,1136,0],[2090,1140,0],[2083,1143,0],[2075,1145,0],[2067,1146,0],[2058,1148,0],[2049,1148,0],[2041,1149,0],[2032,1150,0],[2024,1150,0],[2016,1150,0],[2008,1150,0],[2000,1150,0],[1991,1150,0],[1983,1150,0],[1975,1150,0],[1967,1150,0],[1959,1150,0],[1951,1150,0],[1943,1150,0],[1935,1150,0],[1927,1150,0],[1919,1150,0],[1910,1150,0],[1902,1150,0],[1894,1150,0],[1886,1149,0],[1878,1149,0],[1870,1149,0],[1862,1149,0],[1854,1149,0],[1846,1149,0],[1838,1149,0],[1830,1149,0],[1821,1149,0],[1813,1148,0],[1805,1148,0],[1797,1148,0],[1789,1148,0],[1781,1148,0],[1773,1148,0],[1765,1148,0],[1757,1148,0],[1749,1148,0],[1740,1147,0],[1732,1147,0],[1724,1147,0],[1716,1147,0],[1708,1147,0],[1700,1147,0],[1692,1147,0],[1684,1147,0],[1676,1147,0],[1668,1147,0],[1660,1147,0],[1652,1147,0],[1644,1147,0],[1635,1147,0],[1627,1147,0],[1619,1147,0],[1611,1146,0],[1603,1146,0],[1595,1146,0],[1587,1146,0],[1579,1146,0],[1571,1146,0],[1563,1146,0],[1555,1146,0],[1547,1146,0],[1539,1146,0],[1531,1146,0],[1523,1146,0],[1515,1146,0],[1506,1146,0],[1498,1146,0],[1490,1146,0],[1482,1146,0],[1474,1146,0],[1466,1146,0],[1458,1146,0],[1450,1146,0],[1442,1146,0],[1434,1146,0],[1426,1146,0],[1418,1147,0],[1410,1147,0],[1402,1147,0],[1394,1147,0],[1385,1147,0],[1377,1147,0],[1369,1147,0],[1361,1147,0],[1353,1147,0],[1345,1147,0],[1337,1148,0],[1329,1148,0],[1321,1148,0],[1313,1148,0],[1305,1148,0],[1297,1148,0],[1289,1148,0],[1281,1148,0],[1273,1148,0],[1265,1148,0],[1256,1149,0],[1248,1149,0],[1240,1149,0],[1232,1149,0],[1224,1149,0],[1216,1149,0],[1208,1149,0],[1200,1149,0],[1192,1149,0],[1184,1149,0],[1176,1149,0],[1168,1149,0],[1160,1149,0],[1152,1149,0],[1144,1149,0],[1136,1149,0],[1128,1149,0],[1120,1149,0],[1112,1149,0],[1104,1149,0],[1096,1149,0],[1088,1149,0],[1080,1150,0],[1072,1150,0],[1064,1150,0],[1056,1150,0],[1048,1150,0],[1040,1150,0],[1032,1150,0],[1024,1150,0],[1016,1150,0],[1008,1150,0],[1000,1150,0],[992,1149,0],[984,1149,0],[976,1149,0],[968,1149,0],[960,1149,0],[952,1149,0],[944,1150,0],[936,1150,0],[928,1150,0],[920,1150,0],[912,1150,0],[904,1150,0],[896,1150,0],[888,1150,0],[880,1150,0],[872,1150,0],[864,1150,0],[856,1149,0],[848,1149,0],[840,1149,0],[832,1149,0],[824,1148,0],[816,1148,0],[808,1147,0],[800,1147,0],[792,1147,0],[784,1146,0],[776,1145,0],[768,1145,0],[760,1144,0],[752,1144,0],[744,1143,0],[736,1142,0],[728,1143,0],[722,1142,0],[712,1139,0],[704,1150,0],[708,1135,0],[698,1140,0],[668,1137,0],[641,1132,0],[620,1125,0],[606,1118,0],[601,1109,0],[606,1101,1],[620,1093,1],[641,1087,1],[668,1082,1],[698,1079,1],[728,1077,1],[755,1078,1],[776,1080,1],[790,1084,1],[795,1088,0],[790,1092,0],[776,1095,0],[755,1098,0],[728,1098,0],[698,1097,0],[668,1094,0],[641,1089,0],[620,1082,0],[606,1075,0],[601,1066,0],[606,1058,1],[620,1050,1],[641,1044,1],[668,1039,1],[698,1036,1],[728,1035,1],[755,1035,1],[776,1037,1],[790,1041,1],[795,1045,0],[790,1049,0],[776,1052,0],[755,1055,0],[728,1055,0],[698,1054,0],[668,1051,0],[641,1046,0],[620,1040,0],[606,1032,0],[601,1024,0],[606,1015,1],[620,1007,1],[641,1001,1],[668,996,1],[698,993,1],[728,992,1],[755,992,1],[776,995,1],[790,998,1],[795,1002,0],[790,1006,0],[776,1010,0],[755,1012,0],[728,1012,0],[698,1011,0],[668,1008,0],[641,1003,0],[620,997,0],[606,989,0],[601,981,0],[606,972,1],[620,965,1],[641,958,1],[668,953,1],[698,950,1],[728,949,1],[755,949,1],[776,952,1],[790,955,1],[795,959,0],[790,963,0],[776,967,0],[755,969,0],[728,970,0],[698,968,0],[668,965,0],[641,960,0],[620,954,0],[606,946,0],[601,938,0],[606,929,1],[620,922,1],[641,915,1],[668,910,1],[698,907,1],[728,906,1],[755,907,1],[776,909,1],[790,912,1],[795,916,0],[790,920,0],[776,924,0],[755,926,0],[728,927,0],[698,926,0],[668,922,0],[641,917,0],[620,911,0],[606,903,0],[601,895,0],[606,887,1],[620,879,1],[641,872,1],[668,867,1],[698,864,1],[728,863,1],[755,864,1],[776,866,1],[790,869,1],[795,873,0],[790,877,0],[776,881,0],[755,883,0],[728,884,0],[698,883,0],[668,880,0],[641,875,0],[620,868,0],[606,860,0],[601,852,0],[606,844,1],[620,836,1],[641,829,1],[668,824,1],[698,821,1],[728,820,1],[755,821,1],[776,823,1],[790,826,1],[795,830,0],[790,835,0],[776,838,0],[755,840,0],[728,841,0],[698,840,0],[668,837,0],[641,832,0],[620,825,0],[606,817,0],[601,809,0],[606,801,1],[620,793,1],[641,786,1],[668,781,1],[698,778,1],[728,777,1],[755,778,1],[776,780,1],[790,784,1],[795,788,0],[790,792,0],[776,795,0],[755,797,0],[728,798,0],[698,797,0],[668,794,0],[641,789,0],[620,782,0],[606,774,0],[601,766,0],[606,758,1],[620,750,1],[641,744,1],[668,739,1],[698,735,1],[728,734,1],[755,735,1],[776,737,1],[790,741,1],[795,745,0],[790,749,0],[776,752,0],[755,754,0],[728,755,0],[698,754,0],[668,751,0],[641,746,0],[620,739,0],[606,732,0],[601,723,0],[606,715,1],[620,707,1],[641,701,1],[668,696,1],[698,693,1],[728,691,1],[755,692,1],[776,694,1],[790,698,1],[795,702,0],[790,706,0],[776,709,0],[755,712,0],[728,712,0],[698,711,0],[668,708,0],[641,703,0],[620,696,0],[606,689,0],[601,680,0],[606,672,1],[620,664,1],[641,658,1],[668,653,1],[698,650,1],[728,649,1],[755,649,1],[776,651,1],[790,655,1],[795,659,0],[790,663,0],[776,666,0],[755,669,0],[728,669,0],[698,668,0],[668,665,0],[641,660,0],[620,654,0],[606,646,0],[601,638,0],[606,629,1],[620,621,1],[641,615,1],[668,610,1],[698,607,1],[728,606,1],[755,606,1],[776,609,1],[790,612,1],[795,616,0],[790,620,0],[776,624,0],[755,626,0],[728,626,0],[698,625,0],[668,622,0],[641,617,0],[620,611,0],[606,603,0],[601,595,0],[606,586,1],[620,579,1],[641,572,1],[668,567,1],[698,564,1],[728,563,1],[755,563,1],[776,566,1],[790,569,1],[795,573,0],[790,577,0],[776,581,0],[755,583,0],[728,584,0],[698,582,0],[668,579,0],[641,574,0],[620,568,0],[606,560,0],[601,552,0],[606,543,1],[620,536,1],[641,529,1],[668,524,1],[698,521,1],[728,520,1],[755,521,1],[776,523,1],[790,526,1],[795,530,0],[790,534,0],[776,538,0],[755,540,0],[728,541,0],[698,540,0],[668,536,0],[641,531,0],[620,525,0],[606,517,0],[601,509,0],[606,501,1],[620,493,1],[641,486,1],[668,481,1],[698,478,1],[728,477,1],[755,478,1],[776,480,1],[790,483,1],[795,487,0],[790,491,0],[776,495,0],[755,497,0],[728,498,0],[698,497,0],[668,494,0],[641,489,0],[620,482,0],[606,474,0],[601,466,0],[606,458,1],[620,450,1],[641,443,1],[668,438,1],[698,435,1],[728,434,1],[755,435,1],[776,437,1],[790,440,1],[795,444,0],[790,449,0],[776,452,0],[755,454,0],[728,455,0],[698,454,0],[668,451,0],[641,446,0],[620,439,0],[606,431,0],[601,423,0],[606,415,1],[620,407,1],[641,400,1],[668,395,1],[698,392,1],[728,391,1],[755,392,1],[776,394,1],[790,398,1],[795,402,0],[790,406,0],[776,409,0],[755,411,0],[728,412,0],[698,411,0],[668,408,0],[641,403,0],[620,396,0],[606,388,0],[601,380,0],[606,372,1],[620,364,1],[641,358,1],[668,353,1],[698,349,1],[728,348,1],[755,349,1],[776,351,1],[790,355,1],[795,359,0],[790,363,0],[776,366,0],[755,368,0],[728,369,0],[698,368,0],[701,364,0],[702,355,0],[704,347,0],[708,340,0],[711,333,0],[715,328,0],[719,323,0],[725,320,0],[731,318,0],[738,316,0],[745,316,0],[753,316,0],[761,316,0],[769,317,0],[777,317,0],[785,318,0],[793,319,0],[802,320,0],[810,321,0],[818,322,0],[826,323,0],[833,324,0],[841,326,0],[849,328,0],[857,330,0],[865,332,0],[873,334,0],[881,336,0],[888,338,0],[896,340,0],[904,343,0],[912,345,0],[919,348,0],[927,351,0],[935,353,0],[943,356,0],[951,359,0],[959,362,0],[966,365,0],[974,369,0],[982,372,0],[990,375,0],[998,378,0],[1006,381,0],[1014,385,0],[1022,388,0],[1029,391,0],[1037,394,0],[1045,397,0],[1053,400,0],[1060,402,0],[1068,405,0],[1076,408,0],[1084,410,0],[1091,412,0],[1099,414,0],[1107,416,0],[1115,418,0],[1124,420,0],[1132,422,0],[1141,423,0],[1150,424,0],[1158,426,0],[1168,427,0],[1178,426,0],[1177,431,0],[1189,430,0],[1202,430,0],[1214,430,0],[1227,430,0],[1240,430,1],[1253,430,1],[1266,430,1],[1280,430,1],[1293,430,1],[1306,430,1],[1320,431,1],[1334,431,1],[1348,432,1],[1363,433,0]];

const SOLENOID_CALIBRATION = {
  corners: { tl: [0, 0], tr: [2752, 0], br: [2752, 1536], bl: [0, 1536] },
  hole: [700, 725],         // bore center (scene px)
  coilLeft: [700, 330],     // top pole of the bore
  coilRight: [700, 1120],   // bottom pole
  wireTop: [700, 330],
  sheetW: 0.55,
  sheetH: 0.307,
  wireHeight: 0.06,
  holeWallR: 0.002,
};

const SOLENOID_UI = {
  ...DEFAULT_UI,
  showIndicator: true,
  showCurrentPulses: false,
  showCurrentComets: true,
  showCurrentCometHeads: true,
  showCurrentArrows: false,
  showFieldLines: true,
  showFieldPulses: false,
  showFieldComets: true,
  showFieldCometHeads: true,
  showFieldArrows: false,
  fieldLineColor: '#bfe3ff',
  fieldMotionColor: '#bfe3ff',
  fieldArrowColor: '#bfe3ff',
  fieldLineStrength: 2.2,
  fieldLineOpacity: 0.5,
  fieldLineCount: 10,        // straight bore lines + return ovals
  fieldLineThickness: 1.6,
  fieldMotionThickness: 0.65,
  currentIndicatorColor: '#ffc875',
  currentTrackWidth: 10,
  boardShake: 0,
};

const SOLENOID_PARAMS = {
  fieldModel: 'barMagnet',   // two poles at the bore ends; no filings here
  currentA: 30,
  currentMode: 'dc',
  currentDir: 1,
  currentAutoAlign: false,
  sprinkleCount: 1,
  strayCount: 0,
};

export const SOLENOID_PRESETS = [
  {
    name: 'Manual solenoid stage',
    hint: 'No filings — drive the current and watch the field-line flow.',
    duration: 20,
    ui: { ...SOLENOID_UI },
    cal: { ...SOLENOID_CALIBRATION },
    params: { ...SOLENOID_PARAMS },
    timeline: [],
  },
  {
    name: 'Solenoid energize',
    hint: 'Current ramps on; the field threads the bore and returns around the coil.',
    duration: 12,
    ui: { ...SOLENOID_UI },
    cal: { ...SOLENOID_CALIBRATION },
    params: { ...SOLENOID_PARAMS },
    timeline: [
      { t: 0.8, type: 'current', on: true, amp: 30, mode: 'dc', rampDur: 1.4 },
    ],
  },
];

const SOLENOID_VARIANT = {
  name: 'solenoid',
  brandHTML: 'MAGNETISM <span>SOLENOID</span>',
  scene: {
    assetsBase: 'assets/',
    occluderRect: [0, 0, 2752, 1536],   // circuit layer above the field lines
  },
  calibrationKey: 'solenoid',
  defaultCalibration: SOLENOID_CALIBRATION,
  fieldOverlay: 'solenoid',
  boreRadiusPx: 85,
  currentOverlay: { path: SOLENOID_PATH },
  currentDirectionText(dir) {
    return dir < 0 ? 'current reversed (field points down)' : 'current forward (field points up)';
  },
  params: SOLENOID_PARAMS,
  presets: SOLENOID_PRESETS,
};

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
  // Full painted silhouette (image2 alpha bbox mapped through occluderRect,
  // +1 px for antialiasing) — the field-line clip box. Unlike barBodyRect it
  // must COVER the paint, or loop edges dipping behind the bar leak out as
  // white slivers along the magnet's outline.
  barClipRect: [1085, 694, 1671, 834],
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
  // Turns stage (panel ➕ button + 'Coil turns stage' preset): each press
  // adds a conductor and the ring count blooms to the per-turns target —
  // more turns, stronger field. Board stays clear, no tap, 80 A held.
  turnsStage: {
    dur: 2.2,
    // EVEN counts (whole ring pairs) at each rest so the fractional-ring
    // fade never leaves an outermost ring sitting half-dim; the coil always
    // drew rings in pairs, so 10/22/36 render exactly as the old 9/22/36.
    linesByTurns: { 1: 10, 2: 22, 3: 36 },
  },
  // Coil surge (panel ⚡ button + 'Coil surge stage' preset): stronger
  // current reads as MORE rings spaced WIDER. The ring count glides
  // 10 → 13 as a FRACTIONAL value, so the coil builder fades the newest
  // ring in by the fractional part — the bloom is smooth, no ring pops in
  // from nowhere.
  surge: {
    label: '⚡ Surge to 100 A',
    title: 'Continuous-shot move: ramp amplitude to 100 A in ~1.3 s — rings bloom 10 → 14 (fading in smoothly) spaced wider (1.08 → 1.28), pulses to 2.35×, field motion to 1.7×, ONE tap, no re-sprinkle',
    targetA: 100,
    dur: 1.3,   // snappy: the whole field change lands within ~1.2 s
    ui: {
      // 14 = 7 whole ring pairs (identical render to the old 13, which
      // rounded to 7 pairs) so the settled field has no half-dim ring
      fieldLineCount: 14,
      fieldRadiusMultiplier: 1.28,
      currentPulseSpeed: 2.35,
      fieldMotionSpeed: 1.70,
    },
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
