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

const BAR_FIELD_PATHS = [[[243,755],[2519,755]],[[243,596],[379,627],[513,655],[644,680],[771,703],[888,721],[981,734],[1044,742],[1093,745],[1150,747],[1285,748],[1567,748],[1643,746],[1693,744],[1747,739],[1824,729],[1931,712],[2054,692],[2183,668],[2316,641],[2451,612],[2519,596]],[[243,344],[301,387],[363,428],[426,468],[493,506],[561,542],[631,576],[703,609],[775,639],[848,667],[918,692],[978,710],[1025,723],[1060,731],[1092,735],[1127,738],[1180,740],[1310,741],[1536,741],[1612,740],[1653,737],[1686,733],[1719,727],[1759,718],[1813,702],[1879,680],[1950,654],[2023,624],[2096,593],[2166,559],[2236,524],[2303,487],[2368,448],[2430,408],[2490,366],[2519,344]],[[662,87],[655,124],[651,162],[651,201],[654,240],[662,279],[673,319],[689,358],[708,397],[731,435],[758,473],[788,511],[822,547],[859,582],[899,616],[941,647],[983,675],[1019,696],[1047,710],[1071,719],[1093,725],[1118,729],[1154,732],[1216,733],[1381,734],[1545,733],[1608,732],[1643,729],[1669,725],[1691,719],[1714,710],[1743,696],[1779,675],[1820,647],[1862,616],[1903,582],[1940,547],[1974,511],[2004,473],[2031,435],[2054,397],[2073,358],[2088,319],[2100,279],[2107,240],[2111,201],[2111,162],[2107,124],[2099,87]],[[1381,728],[1535,727],[1598,725],[1633,723],[1656,719],[1673,715],[1686,709],[1700,699],[1719,683],[1740,660],[1760,632],[1778,603],[1791,574],[1801,545],[1806,516],[1808,488],[1806,460],[1800,433],[1790,407],[1777,383],[1761,359],[1741,337],[1719,316],[1694,297],[1666,280],[1636,264],[1605,251],[1572,239],[1537,229],[1501,221],[1465,216],[1428,212],[1390,210],[1353,211],[1316,214],[1279,218],[1243,225],[1208,234],[1174,244],[1141,257],[1111,272],[1082,288],[1056,306],[1032,326],[1011,348],[993,371],[978,395],[967,420],[959,447],[955,474],[954,502],[958,531],[965,560],[977,589],[992,618],[1012,646],[1033,672],[1053,692],[1069,705],[1083,712],[1097,717],[1116,721],[1144,724],[1190,726],[1285,728],[1381,728]],[[1381,721],[1527,720],[1591,718],[1627,716],[1649,713],[1662,709],[1666,707],[1667,707],[1668,705],[1670,704],[1671,703],[1671,702],[1673,699],[1674,698],[1679,681],[1683,655],[1683,628],[1680,603],[1673,579],[1662,556],[1649,535],[1633,516],[1613,498],[1592,483],[1568,469],[1542,456],[1515,446],[1487,438],[1457,432],[1427,428],[1396,426],[1366,426],[1335,428],[1305,432],[1275,438],[1247,446],[1220,456],[1194,469],[1170,483],[1149,499],[1130,516],[1113,535],[1100,556],[1089,579],[1082,603],[1079,628],[1079,655],[1083,681],[1088,698],[1089,699],[1091,702],[1091,703],[1093,704],[1094,705],[1095,707],[1096,707],[1100,709],[1113,713],[1135,716],[1171,718],[1235,720],[1381,721]],[[2513,755],[237,755]],[[2513,927],[2377,894],[2243,863],[2112,836],[1985,811],[1868,791],[1775,777],[1712,769],[1663,765],[1606,763],[1471,762],[1189,762],[1113,764],[1063,767],[1009,772],[932,783],[825,801],[702,823],[573,849],[440,878],[305,910],[237,927]],[[2513,1200],[2455,1153],[2393,1109],[2330,1066],[2263,1025],[2195,985],[2125,948],[2053,913],[1981,880],[1908,850],[1838,823],[1778,803],[1731,789],[1696,781],[1664,776],[1629,772],[1576,770],[1446,769],[1220,770],[1144,771],[1103,774],[1070,778],[1037,785],[997,795],[943,812],[877,836],[806,864],[733,896],[660,930],[590,966],[520,1005],[453,1045],[388,1087],[326,1131],[266,1176],[237,1200]],[[2094,1478],[2101,1438],[2105,1396],[2105,1355],[2102,1312],[2094,1270],[2083,1227],[2067,1185],[2048,1142],[2025,1101],[1998,1060],[1968,1019],[1934,980],[1897,942],[1857,905],[1815,871],[1773,841],[1737,818],[1709,803],[1685,794],[1663,787],[1638,783],[1602,780],[1540,778],[1375,777],[1211,778],[1148,780],[1113,783],[1087,787],[1065,794],[1042,803],[1013,818],[977,841],[936,871],[894,905],[853,942],[816,980],[782,1019],[752,1060],[725,1101],[702,1143],[683,1185],[668,1227],[656,1270],[649,1312],[645,1355],[645,1396],[649,1438],[657,1478]],[[1375,784],[1221,785],[1158,787],[1123,790],[1100,793],[1083,798],[1070,805],[1056,815],[1037,832],[1016,858],[996,887],[978,919],[965,950],[955,982],[950,1013],[948,1044],[950,1074],[956,1103],[966,1131],[979,1158],[995,1183],[1015,1207],[1037,1230],[1062,1250],[1090,1269],[1120,1286],[1151,1301],[1184,1314],[1219,1324],[1255,1332],[1291,1339],[1328,1343],[1366,1344],[1403,1344],[1440,1341],[1477,1336],[1513,1329],[1548,1319],[1582,1307],[1615,1294],[1645,1278],[1674,1260],[1700,1240],[1724,1219],[1745,1196],[1763,1171],[1778,1145],[1789,1117],[1797,1089],[1801,1059],[1802,1029],[1798,998],[1791,966],[1779,935],[1764,903],[1744,872],[1723,844],[1703,823],[1687,809],[1673,801],[1659,796],[1640,791],[1612,788],[1566,786],[1471,784],[1375,784]],[[1375,791],[1229,792],[1165,794],[1129,797],[1107,801],[1094,804],[1090,806],[1089,807],[1088,808],[1086,809],[1085,811],[1085,812],[1083,815],[1082,816],[1077,835],[1073,863],[1073,892],[1076,919],[1083,945],[1094,970],[1107,992],[1123,1013],[1143,1032],[1164,1050],[1188,1065],[1214,1078],[1241,1089],[1269,1098],[1299,1104],[1329,1109],[1360,1111],[1390,1111],[1421,1109],[1451,1104],[1481,1098],[1509,1089],[1536,1078],[1562,1065],[1586,1050],[1607,1032],[1626,1013],[1643,992],[1656,970],[1667,945],[1674,919],[1677,892],[1677,863],[1673,835],[1668,816],[1667,815],[1665,812],[1665,811],[1663,809],[1662,808],[1661,807],[1660,806],[1656,804],[1643,801],[1621,797],[1585,794],[1521,792],[1375,791]],[[983,605],[963,572],[943,535],[926,496],[913,453],[906,408],[906,363],[914,318],[929,277],[959,245],[992,215],[1026,189],[1061,165],[1098,143],[1136,125],[1176,109],[1216,96],[1256,86],[1298,78],[1339,74],[1381,72],[1423,74],[1464,78],[1506,86],[1546,96],[1586,109],[1626,125],[1664,144],[1701,165],[1736,189],[1770,216],[1803,245],[1833,277],[1848,318],[1856,363],[1856,408],[1849,453],[1836,496],[1819,536],[1799,572],[1778,605],[1757,634],[1736,661],[1714,685],[1691,706],[1657,719],[1615,724],[1581,727],[1550,728],[1528,731],[1513,737],[1498,742],[1483,746],[1469,748],[1454,749],[1440,748],[1427,746],[1414,743],[1402,739],[1391,734],[1381,728],[1371,734],[1360,739],[1348,743],[1335,746],[1322,748],[1308,749],[1293,748],[1279,746],[1264,742],[1249,737],[1234,731],[1212,728],[1181,727],[1147,724],[1105,719],[1071,706],[1048,685],[1026,661],[1005,634],[983,605]],[[978,917],[998,887],[1017,860],[1037,836],[1058,814],[1086,797],[1125,790],[1161,786],[1191,784],[1220,785],[1236,778],[1251,772],[1267,768],[1282,765],[1297,764],[1312,765],[1326,766],[1339,769],[1352,773],[1364,778],[1375,784],[1386,778],[1398,773],[1411,769],[1424,766],[1438,764],[1453,764],[1468,765],[1483,768],[1499,772],[1515,777],[1530,785],[1558,784],[1588,786],[1625,789],[1664,797],[1693,814],[1713,836],[1733,860],[1753,887],[1773,917],[1792,950],[1810,986],[1826,1025],[1840,1068],[1848,1113],[1851,1160],[1847,1206],[1836,1252],[1811,1289],[1778,1320],[1743,1348],[1706,1373],[1668,1396],[1629,1415],[1588,1432],[1547,1446],[1504,1456],[1462,1464],[1418,1468],[1375,1470],[1332,1468],[1288,1464],[1246,1456],[1203,1445],[1162,1431],[1121,1415],[1082,1395],[1044,1373],[1007,1348],[972,1320],[939,1289],[914,1252],[903,1206],[899,1159],[902,1113],[910,1068],[924,1025],[940,986],[958,950],[978,917]]];

const SOLENOID_PATH = [[1245,438,0],[1228,423,0],[1218,424,0],[1208,418,0],[1198,417,0],[1188,417,0],[1178,417,0],[1168,418,0],[1158,418,0],[1148,420,0],[1138,426,0],[1128,431,0],[1118,436,0],[1108,433,0],[1088,448,0],[1076,446,0],[1064,440,0],[1052,432,0],[1040,421,0],[1028,408,0],[1016,395,0],[1004,382,0],[992,371,0],[980,363,0],[968,356,0],[956,350,0],[944,346,0],[932,343,0],[920,341,0],[908,340,0],[896,337,0],[884,336,0],[872,335,0],[860,334,0],[848,333,0],[838,333,0],[828,332,0],[818,332,0],[808,332,0],[798,332,0],[788,332,0],[778,332,0],[768,332,0],[758,332,0],[748,332,0],[738,332,0],[728,332,0],[718,333,0],[708,333,0],[698,334,0],[688,334,0],[678,335,0],[668,336,0],[658,337,0],[648,339,0],[618,332,0],[606,345,0],[706,329,0],[806,328,0],[812,336,1],[600,371,1],[606,379,0],[706,373,0],[806,383,0],[812,391,1],[600,424,1],[606,432,0],[706,420,0],[806,426,0],[812,434,1],[600,469,1],[606,477,0],[706,467,0],[806,471,0],[812,479,1],[600,518,1],[606,526,0],[706,513,0],[806,517,0],[812,525,1],[600,565,1],[606,573,0],[706,561,0],[806,562,0],[812,570,1],[600,611,1],[606,619,0],[706,608,0],[806,609,0],[812,617,1],[600,659,1],[606,667,0],[706,655,0],[806,653,0],[812,661,1],[600,704,1],[606,712,0],[706,685,0],[806,702,0],[812,710,1],[600,754,1],[606,762,0],[706,732,0],[806,746,0],[812,754,1],[600,797,1],[606,805,0],[706,797,0],[806,790,0],[812,798,1],[600,844,1],[606,852,0],[706,843,0],[806,835,0],[812,843,1],[600,890,1],[606,898,0],[706,889,0],[806,884,0],[812,892,1],[600,937,1],[606,945,0],[706,935,0],[806,926,0],[812,934,1],[600,984,1],[606,992,0],[706,983,0],[806,971,0],[812,979,1],[600,1029,1],[606,1037,0],[706,1027,0],[806,1019,0],[812,1027,1],[600,1076,1],[606,1084,0],[706,1074,0],[806,1058,0],[812,1066,1],[600,1121,1],[606,1129,0],[706,1120,0],[806,1106,0],[818,1166,0],[850,1160,0],[875,1161,0],[900,1161,0],[925,1162,0],[950,1162,0],[975,1162,0],[1000,1161,0],[1025,1161,0],[1050,1161,0],[1075,1161,0],[1100,1161,0],[1125,1162,0],[1150,1162,0],[1175,1162,0],[1200,1162,0],[1225,1162,0],[1250,1163,0],[1275,1163,0],[1300,1163,0],[1325,1162,0],[1350,1163,0],[1425,1163,0],[1450,1162,0],[1475,1163,0],[1500,1163,0],[1525,1163,0],[1550,1163,0],[1575,1163,0],[1600,1163,0],[1625,1162,0],[1650,1162,0],[1675,1162,0],[1700,1162,0],[1725,1162,0],[1750,1162,0],[1775,1162,0],[1800,1162,0],[1825,1162,0],[1850,1162,0],[1875,1162,0],[1900,1162,0],[1925,1162,0],[1950,1161,0],[1975,1161,0],[2000,1161,0],[2025,1161,0],[2050,1161,0],[2075,1160,0],[2100,1160,0],[2150,1150,0],[2192,1115,0],[2188,1110,0],[2196,1085,0],[2198,1060,0],[2199,1035,0],[2198,1010,0],[2197,985,0],[2196,960,0],[2194,935,0],[2194,910,0],[2194,885,0],[2193,860,0],[2193,835,0],[2193,810,0],[2194,785,0],[2193,760,0],[2193,735,0],[2192,710,0],[2191,685,0],[2190,660,0],[2187,635,0],[2183,610,0],[2176,585,0],[2158,560,0],[2149,553,0],[2137,546,0],[2101,539,0],[2095,532,0],[2086,525,0],[2060,518,0],[2059,511,0],[2059,504,0],[2059,497,0],[2059,490,0],[2059,483,0],[2059,476,0],[2059,469,0],[2020,458,0],[2000,452,0],[1975,450,1],[1795,452,1],[1770,450,0],[1720,418,0],[1710,418,0],[1700,418,0],[1690,412,0],[1680,410,0],[1670,410,0],[1660,408,0],[1650,408,0],[1640,407,0],[1630,408,0],[1620,407,0],[1610,406,0],[1600,404,0],[1590,402,0],[1580,398,0],[1570,394,0],[1560,388,0],[1550,382,0],[1540,375,0],[1530,368,0],[1520,361,0],[1510,353,0],[1500,346,0],[1490,338,0],[1480,331,0],[1470,325,0],[1460,320,0],[1450,316,0],[1440,313,0],[1430,312,0],[1420,318,0],[1410,332,0],[1399,352,0],[1388,378,0],[1377,404,0],[1366,424,0],[1355,440,0]];

const SOLENOID_CALIBRATION = {
  corners: { tl: [0, 0], tr: [2752, 0], br: [2752, 1536], bl: [0, 1536] },
  hole: [708, 736],         // bore center (scene px)
  coilLeft: [708, 395],     // top pole of the bore
  coilRight: [708, 1080],   // bottom pole
  wireTop: [708, 395],
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
  boreRadiusPx: 100,
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
  // The film's own field-line art (extracted from the SVG), in image px.
  barFieldPaths: BAR_FIELD_PATHS,
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
