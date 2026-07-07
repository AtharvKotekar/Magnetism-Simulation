// Plane (cardboard, meters) → image (pixels) homography via DLT from the four
// calibration corner pins, plus inverse mapping and the Jacobian used for
// perspective-correct sizes and the z-bounce lift.

// Solve the 8×8 DLT system with Gaussian elimination (partial pivoting).
// src: 4 plane points [[X,Y]...], dst: 4 pixel points [[u,v]...].
// Returns h = [a,b,c,d,e,f,g,hh] with H = [[a,b,c],[d,e,f],[g,hh,1]].
export function solveHomography(src, dst) {
  const A = [];
  const b = [];
  for (let k = 0; k < 4; k++) {
    const [X, Y] = src[k], [u, v] = dst[k];
    A.push([X, Y, 1, 0, 0, 0, -u * X, -u * Y]); b.push(u);
    A.push([0, 0, 0, X, Y, 1, -v * X, -v * Y]); b.push(v);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) throw new Error('degenerate homography');
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    const d = A[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const h = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r][c] * h[c];
    h[r] = s / A[r][r];
  }
  return h;
}

export class Homography {
  // corners: {tl, tr, br, bl} in image px; sheetW/sheetH in meters.
  constructor(corners, sheetW, sheetH) {
    this.update(corners, sheetW, sheetH);
  }

  update(corners, sheetW, sheetH) {
    this.sheetW = sheetW; this.sheetH = sheetH;
    const src = [[0, 0], [sheetW, 0], [sheetW, sheetH], [0, sheetH]];
    const dst = [corners.tl, corners.tr, corners.br, corners.bl];
    this.h = solveHomography(src, dst);
    const [a, b, c, d, e, f, g, hh] = this.h;
    // inverse = adjugate of [[a,b,c],[d,e,f],[g,hh,1]]
    this.inv = [
      e - f * hh, c * hh - b, b * f - c * e,
      f * g - d, a - c * g, c * d - a * f,
      d * hh - e * g, b * g - a * hh, a * e - b * d,
    ];
  }

  // plane meters → image px
  toImage(X, Y, out = [0, 0]) {
    const [a, b, c, d, e, f, g, hh] = this.h;
    const w = g * X + hh * Y + 1;
    out[0] = (a * X + b * Y + c) / w;
    out[1] = (d * X + e * Y + f) / w;
    return out;
  }

  // image px → plane meters
  toPlane(u, v, out = [0, 0]) {
    const m = this.inv;
    const w = m[6] * u + m[7] * v + m[8];
    out[0] = (m[0] * u + m[1] * v + m[2]) / w;
    out[1] = (m[3] * u + m[4] * v + m[5]) / w;
    return out;
  }

  // |det J| at plane point (px² per m²) — local squared scale factor.
  jacobianDet(X, Y) {
    const [a, b, c, d, e, f, g, hh] = this.h;
    const w = g * X + hh * Y + 1;
    const u = (a * X + b * Y + c) / w;
    const v = (d * X + e * Y + f) / w;
    const dudx = (a - u * g) / w, dudy = (b - u * hh) / w;
    const dvdx = (d - v * g) / w, dvdy = (e - v * hh) / w;
    return Math.abs(dudx * dvdy - dudy * dvdx);
  }

  // 3×3 matrix as column-major mat3 for GLSL.
  glMat3() {
    const [a, b, c, d, e, f, g, hh] = this.h;
    return new Float32Array([a, d, g, b, e, hh, c, f, 1]);
  }
}

// Default calibration measured from the BASE.svg alpha layers.
export const DEFAULT_CALIBRATION = {
  corners: {
    tl: [390, 104],
    tr: [2352, 128],
    br: [2544, 1391],
    bl: [162, 1361],
  },
  hole: [1390, 750],       // wire base / hole center, image px
  wireTop: [1417, 436],    // where the wire meets the crossbar, image px
  sheetW: 0.40,            // meters
  sheetH: 0.30,
  wireHeight: 0.30,        // meters from cardboard to crossbar along the wire
  holeWallR: 0.013,        // meters, physical no-go radius around the wire
};

const LS_KEY = 'magnetism-stage-calibration-v1';

export function loadCalibration() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_CALIBRATION, ...JSON.parse(raw) };
  } catch (_) { /* fall through */ }
  return structuredClone(DEFAULT_CALIBRATION);
}

export function saveCalibration(cal) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cal)); } catch (_) { /* ignore */ }
}
