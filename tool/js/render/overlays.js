// Overlays: animated current-direction indicator along the wire, plus
// preview-only field-line circles. The wire polyline comes from the path the
// film team drew INTO BASE.svg (traced from the right edge, along the crossbar
// wire, down through the hole, out the bottom of frame).

import { compileProgram } from './gl.js';

// Cubic bezier control points lifted verbatim from the <path> in BASE.svg.
const WIRE_PATH = [
  // M 2751.5 385.5 then cubic segments [c1, c2, end]
  [[2751.5, 385.5]],
  [[2743.17, 385.5], [2718.9, 385.5], [2688.5, 385.5]],
  [[2604, 385.5], [2360, 423], [2289.5, 423]],
  [[2219, 423], [2034, 399.5], [1961, 404.5]],
  [[1888, 409.5], [1783, 395], [1700.5, 385.5]],
  [[1618, 376], [1592.5, 371.499], [1492, 368.999]],
  [[1391.5, 366.499], [1367.5, 458.499], [1367.5, 481.999]],
  [[1367.5, 505.499], [1367.5, 629.499], [1367.5, 673.999]],
  [[1367.5, 709.599], [1376.83, 773.499], [1381.5, 800.999]],
  [[1382.5, 806.833], [1384.7, 819.6], [1385.5, 824]],
  [[1386.3, 828.4], [1420.5, 1300.83], [1437.5, 1536.5]],
];

// Flatten the beziers to an arc-length-parameterized polyline.
// Points past the hole (roughly y > 800) run under the cardboard → tagged so
// the shader can hide them behind the sheet via the cardboard alpha.
export function buildWirePolyline(holeY = 790) {
  const pts = [];
  let prev = WIRE_PATH[0][0];
  pts.push([...prev]);
  for (let s = 1; s < WIRE_PATH.length; s++) {
    const [c1, c2, p3] = WIRE_PATH[s];
    const N = 24;
    for (let k = 1; k <= N; k++) {
      const t = k / N, mt = 1 - t;
      const x = mt * mt * mt * prev[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * p3[0];
      const y = mt * mt * mt * prev[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * p3[1];
      pts.push([x, y]);
    }
    prev = p3;
  }
  // arc length + under-cardboard tag
  let s = 0;
  const out = [{ x: pts[0][0], y: pts[0][1], s: 0, under: 0 }];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
    s += Math.hypot(dx, dy);
    const under = pts[i][1] > holeY ? 1 : 0;
    out.push({ x: pts[i][0], y: pts[i][1], s, under });
  }
  return out;
}

const DASH_VS = `#version 300 es
layout(location=0) in vec2 aPos;      // image px
layout(location=1) in float aArc;     // arc length px
layout(location=2) in float aSide;    // -1 / +1 across the wire
layout(location=3) in float aUnder;   // 1 = under the cardboard
uniform vec2 uRes;
out float vArc;
out float vSide;
out float vUnder;
void main() {
  vArc = aArc; vSide = aSide; vUnder = aUnder;
  vec2 ndc = vec2(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const DASH_FS = `#version 300 es
precision highp float;
in float vArc;
in float vSide;
in float vUnder;
uniform float uTime;
uniform float uSpeed;        // px/s, signed by current direction
uniform float uIntensity;    // 0..1 with current magnitude
uniform vec3 uColor;
uniform sampler2D uCardboard;
uniform vec2 uRes;
out vec4 fragColor;
void main() {
  if (uIntensity < 0.003) discard;
  // hide the under-cardboard stretch where the sheet covers it
  if (vUnder > 0.5) {
    vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
    if (texture(uCardboard, uv).a > 0.5) discard;
  }
  // comet-shaped moving dashes: sharp head, fading tail ⇒ readable direction
  float lambda = 140.0;
  float phase = fract((vArc - uTime * uSpeed) / lambda);
  float comet = pow(1.0 - phase, 3.0);
  float across = 1.0 - abs(vSide);
  float glow = across * across;
  float a = comet * glow * uIntensity * 0.85;
  fragColor = vec4(uColor * a, 0.0);   // additive
}`;

const LINES_VS = `#version 300 es
layout(location=0) in vec2 aPlane;    // plane meters
uniform mat3 uH;
uniform vec2 uRes;
void main() {
  vec3 q = uH * vec3(aPlane, 1.0);
  vec2 px = q.xy / q.z;
  vec2 ndc = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const LINES_FS = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() { fragColor = vec4(uColor.rgb * uColor.a, uColor.a); }`;

export class Overlays {
  constructor(gl) {
    this.gl = gl;
    this.dashProg = compileProgram(gl, DASH_VS, DASH_FS);
    this.linesProg = compileProgram(gl, LINES_VS, LINES_FS);
    this.du = {};
    for (const n of ['uRes', 'uTime', 'uSpeed', 'uIntensity', 'uColor', 'uCardboard'])
      this.du[n] = gl.getUniformLocation(this.dashProg, n);
    this.lu = {
      uH: gl.getUniformLocation(this.linesProg, 'uH'),
      uRes: gl.getUniformLocation(this.linesProg, 'uRes'),
      uColor: gl.getUniformLocation(this.linesProg, 'uColor'),
    };
    this.buildDashGeometry();
    this.fieldVAO = null;
    this.fieldCount = 0;
  }

  buildDashGeometry() {
    const gl = this.gl;
    const line = buildWirePolyline();
    const width = 7.0;
    const verts = [];  // x, y, arc, side, under
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      let tx = b.x - a.x, ty = b.y - a.y;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len; ty /= len;
      const nx = -ty * width, ny = tx * width;
      // two triangles per segment
      verts.push(
        a.x + nx, a.y + ny, a.s, 1, a.under,
        a.x - nx, a.y - ny, a.s, -1, a.under,
        b.x + nx, b.y + ny, b.s, 1, b.under,
        a.x - nx, a.y - ny, a.s, -1, a.under,
        b.x - nx, b.y - ny, b.s, -1, b.under,
        b.x + nx, b.y + ny, b.s, 1, b.under,
      );
    }
    this.dashCount = verts.length / 5;
    this.dashVAO = gl.createVertexArray();
    gl.bindVertexArray(this.dashVAO);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const stride = 20;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 16);
    gl.bindVertexArray(null);
  }

  // Current flows from the right edge, along the crossbar, DOWN through the
  // hole (dir = -1). Dash motion follows increasing arc length in that case.
  drawCurrentDashes(o) {
    const gl = this.gl;
    gl.useProgram(this.dashProg);
    gl.bindVertexArray(this.dashVAO);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);            // additive glow
    gl.uniform2f(this.du.uRes, o.res[0], o.res[1]);
    gl.uniform1f(this.du.uTime, o.time);
    gl.uniform1f(this.du.uSpeed, 420.0 * (o.dir < 0 ? 1 : -1));
    gl.uniform1f(this.du.uIntensity, Math.min(1, Math.abs(o.currentFrac)));
    gl.uniform3f(this.du.uColor, 1.0, 0.72, 0.35);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, o.cardboardTex);
    gl.uniform1i(this.du.uCardboard, 2);
    gl.drawArrays(gl.TRIANGLES, 0, this.dashCount);
    gl.bindVertexArray(null);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  // Concentric field circles around the hole (preview only).
  buildFieldLines(holeX, holeY, rMax) {
    const gl = this.gl;
    const verts = [];
    const nRings = 9, seg = 120;
    for (let k = 1; k <= nRings; k++) {
      const r = (rMax * k) / nRings;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
        verts.push(holeX + r * Math.cos(a0), holeY + r * Math.sin(a0));
        verts.push(holeX + r * Math.cos(a1), holeY + r * Math.sin(a1));
      }
    }
    this.fieldCount = verts.length / 2;
    if (!this.fieldVAO) this.fieldVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fieldVAO);
    if (!this.fieldBuf) this.fieldBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  // Reprojection grid for calibration mode: 2 cm grid over the sheet plane.
  buildGrid(sheetW, sheetH, step = 0.02) {
    const gl = this.gl;
    const verts = [];
    for (let x = 0; x <= sheetW + 1e-9; x += step) verts.push(x, 0, x, sheetH);
    for (let y = 0; y <= sheetH + 1e-9; y += step) verts.push(0, y, sheetW, y);
    this.gridCount = verts.length / 2;
    if (!this.gridVAO) this.gridVAO = gl.createVertexArray();
    gl.bindVertexArray(this.gridVAO);
    if (!this.gridBuf) this.gridBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  drawGrid(o) {
    if (!this.gridCount) return;
    const gl = this.gl;
    gl.useProgram(this.linesProg);
    gl.bindVertexArray(this.gridVAO);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix3fv(this.lu.uH, false, o.H);
    gl.uniform2f(this.lu.uRes, o.res[0], o.res[1]);
    gl.uniform4f(this.lu.uColor, 1.0, 0.65, 0.3, 0.45);
    gl.drawArrays(gl.LINES, 0, this.gridCount);
    gl.bindVertexArray(null);
  }

  drawFieldLines(o) {
    if (!this.fieldCount) return;
    const gl = this.gl;
    gl.useProgram(this.linesProg);
    gl.bindVertexArray(this.fieldVAO);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix3fv(this.lu.uH, false, o.H);
    gl.uniform2f(this.lu.uRes, o.res[0], o.res[1]);
    gl.uniform4f(this.lu.uColor, 0.55, 0.85, 1.0, 0.35 * o.intensity);
    gl.drawArrays(gl.LINES, 0, this.fieldCount);
    gl.bindVertexArray(null);
  }
}
