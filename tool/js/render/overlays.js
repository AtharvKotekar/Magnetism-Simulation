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

function buildPolylineFromPoints(points = []) {
  const clean = points.map((p) => ({
    x: p[0],
    y: p[1],
    under: p[2] ?? 0,
  })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (clean.length < 2) return buildWirePolyline();
  let s = 0;
  const out = [{ x: clean[0].x, y: clean[0].y, s: 0, under: clean[0].under }];
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1], b = clean[i];
    s += Math.hypot(b.x - a.x, b.y - a.y);
    out.push({ x: b.x, y: b.y, s, under: b.under });
  }
  return out;
}

const DASH_VS = `#version 300 es
layout(location=0) in vec2 aPos;      // image px
layout(location=1) in float aArc;     // arc length px
layout(location=2) in float aSide;    // -1 / +1 across the wire
layout(location=3) in float aUnder;   // 1 = under the cardboard
uniform vec2 uRes;
uniform vec2 uJitterPx;
out float vArc;
out float vSide;
out float vUnder;
void main() {
  vArc = aArc; vSide = aSide; vUnder = aUnder;
  vec2 px = aPos + uJitterPx;
  vec2 ndc = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
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
uniform float uSpacing;      // px between moving marks
uniform float uTail;         // comet tail exponent
uniform float uPulseWidth;   // pulse width as a phase fraction
uniform float uWidthFrac;    // 0..1 visible width inside the strip
uniform float uMode;         // 0 = pulse, 1 = comet
uniform vec3 uColor;
uniform sampler2D uCardboard;
uniform vec2 uScreen;        // canvas px (may differ from image px at 4K)
out vec4 fragColor;
void main() {
  if (uIntensity < 0.003) discard;
  // hide the under-cardboard stretch where the sheet covers it
  if (vUnder > 0.5) {
    vec2 uv = vec2(gl_FragCoord.x / uScreen.x, 1.0 - gl_FragCoord.y / uScreen.y);
    if (texture(uCardboard, uv).a > 0.5) discard;
  }
  float spacing = max(24.0, uSpacing);
  float phase = fract((vArc - uTime * uSpeed) / spacing);
  // The tail must trail the motion: marks travel toward -arc when
  // uSpeed < 0 and toward +arc when uSpeed > 0.
  float trail = uSpeed > 0.0 ? phase : 1.0 - phase;
  float comet = pow(max(0.0, trail), max(0.35, uTail));
  float pulseD = min(phase, 1.0 - phase);
  float pulseW = clamp(uPulseWidth, 0.015, 0.35);
  float pulse = exp(-(pulseD * pulseD) / (2.0 * pulseW * pulseW));
  float mark = mix(pulse, comet, step(0.5, uMode));
  float widthFrac = clamp(uWidthFrac, 0.12, 1.0);
  float core = max(0.05, widthFrac * 0.76);
  float across = 1.0 - smoothstep(core, min(1.0, core + 0.22), abs(vSide));
  float glow = across * across;
  float a = min(0.95, mark * glow * uIntensity * 1.18);
  fragColor = vec4(uColor * a, a);
}`;

const LINES_VS = `#version 300 es
layout(location=0) in vec2 aPlane;    // plane meters
uniform mat3 uH;
uniform vec2 uRes;
uniform vec2 uJitterPx;
void main() {
  vec3 q = uH * vec3(aPlane, 1.0);
  vec2 px = q.xy / q.z + uJitterPx;
  vec2 ndc = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const LINES_FS = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() { fragColor = vec4(uColor.rgb * uColor.a, uColor.a); }`;

const FIELD_DASH_VS = `#version 300 es
layout(location=0) in vec2 aPlane;    // plane meters
layout(location=1) in float aArc;     // ring arc length in image px
layout(location=2) in float aSide;    // -1 / +1 across the ring stroke
uniform mat3 uH;
uniform vec2 uRes;
uniform vec2 uJitterPx;
out float vArc;
out float vSide;
void main() {
  vArc = aArc;
  vSide = aSide;
  vec3 q = uH * vec3(aPlane, 1.0);
  vec2 px = q.xy / q.z + uJitterPx;
  vec2 ndc = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const FIELD_DASH_FS = `#version 300 es
precision highp float;
in float vArc;
in float vSide;
uniform float uTime;
uniform float uSpeed;
uniform float uIntensity;
uniform float uSpacing;
uniform float uTail;
uniform float uPulseWidth;
uniform float uWidthFrac;
uniform float uMode;         // 0 = pulse, 1 = comet
uniform vec3 uColor;
out vec4 fragColor;
void main() {
  if (uIntensity < 0.003) discard;
  float spacing = max(12.0, uSpacing);
  float phase = fract((vArc - uTime * uSpeed) / spacing);
  // The tail must trail the motion: marks travel toward -arc when
  // uSpeed < 0 and toward +arc when uSpeed > 0.
  float trail = uSpeed > 0.0 ? phase : 1.0 - phase;
  float comet = pow(max(0.0, trail), max(0.35, uTail));
  float pulseD = min(phase, 1.0 - phase);
  float pulseW = clamp(uPulseWidth, 0.012, 0.35);
  float pulse = exp(-(pulseD * pulseD) / (2.0 * pulseW * pulseW));
  float mark = mix(pulse, comet, step(0.5, uMode));
  float widthFrac = clamp(uWidthFrac, 0.12, 1.0);
  float core = max(0.05, widthFrac * 0.75);
  float across = 1.0 - smoothstep(core, min(1.0, core + 0.24), abs(vSide));
  float a = min(0.95, mark * across * across * uIntensity);
  fragColor = vec4(uColor * a, a);
}`;

const FIELD_ARROW_VS = `#version 300 es
layout(location=0) in float aRadius;  // ring radius in plane meters
layout(location=1) in float aAngle;   // starting angle in radians
layout(location=2) in vec2 aLocal;    // local arrow coordinates, meters
uniform mat3 uH;
uniform vec2 uRes;
uniform vec2 uJitterPx;
uniform vec2 uHole;
uniform float uTime;
uniform float uSpeedPx;
uniform float uPxToM;
uniform float uDirSign;
void main() {
  float angularSpeed = uSpeedPx * uPxToM / max(0.0001, aRadius);
  float a = aAngle + uTime * angularSpeed * uDirSign;
  vec2 aNormal = vec2(cos(a), sin(a));
  vec2 aTangent = vec2(-sin(a), cos(a));
  vec2 aCenter = uHole + aNormal * aRadius;
  vec2 p = aCenter + aTangent * (aLocal.x * uDirSign) + aNormal * aLocal.y;
  vec3 q = uH * vec3(p, 1.0);
  vec2 px = q.xy / q.z + uJitterPx;
  vec2 ndc = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const FIELD_VECTOR_ARROW_VS = `#version 300 es
layout(location=0) in vec2 aCenter;   // plane meters
layout(location=1) in vec2 aTangent;  // plane direction
layout(location=2) in vec2 aLocal;    // local arrow coordinates, meters
uniform mat3 uH;
uniform vec2 uRes;
uniform vec2 uJitterPx;
uniform float uDirSign;
void main() {
  vec2 t = normalize(aTangent);
  vec2 n = vec2(-t.y, t.x);
  vec2 p = aCenter + t * (aLocal.x * uDirSign) + n * aLocal.y;
  vec3 q = uH * vec3(p, 1.0);
  vec2 px = q.xy / q.z + uJitterPx;
  vec2 ndc = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const CURRENT_ARROW_VS = `#version 300 es
layout(location=0) in vec2 aCenter;   // image px
layout(location=1) in vec2 aTangent;  // increasing-arc tangent in image px
layout(location=2) in vec2 aLocal;    // local arrow coordinates, image px
layout(location=3) in float aUnder;   // 1 = under the cardboard
uniform vec2 uRes;
uniform vec2 uJitterPx;
uniform float uDirSign;
out float vUnder;
void main() {
  vec2 t = normalize(aTangent);
  vec2 n = vec2(-t.y, t.x);
  vec2 px = aCenter + t * (aLocal.x * uDirSign) + n * aLocal.y + uJitterPx;
  vUnder = aUnder;
  vec2 ndc = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const CURRENT_ARROW_FS = `#version 300 es
precision highp float;
in float vUnder;
uniform sampler2D uCardboard;
uniform vec2 uScreen;
uniform vec4 uColor;
out vec4 fragColor;
void main() {
  if (vUnder > 0.5) {
    vec2 uv = vec2(gl_FragCoord.x / uScreen.x, 1.0 - gl_FragCoord.y / uScreen.y);
    if (texture(uCardboard, uv).a > 0.5) discard;
  }
  fragColor = vec4(uColor.rgb * uColor.a, uColor.a);
}`;

export class Overlays {
  constructor(gl) {
    this.gl = gl;
    this.dashProg = compileProgram(gl, DASH_VS, DASH_FS);
    this.linesProg = compileProgram(gl, LINES_VS, LINES_FS);
    this.fieldDashProg = compileProgram(gl, FIELD_DASH_VS, FIELD_DASH_FS);
    this.fieldArrowProg = compileProgram(gl, FIELD_ARROW_VS, LINES_FS);
    this.fieldVectorArrowProg = compileProgram(gl, FIELD_VECTOR_ARROW_VS, LINES_FS);
    this.currentArrowProg = compileProgram(gl, CURRENT_ARROW_VS, CURRENT_ARROW_FS);
    this.du = {};
    for (const n of [
      'uRes', 'uScreen', 'uJitterPx', 'uTime', 'uSpeed', 'uIntensity', 'uSpacing',
      'uTail', 'uPulseWidth', 'uWidthFrac', 'uMode', 'uColor', 'uCardboard',
    ])
      this.du[n] = gl.getUniformLocation(this.dashProg, n);
    this.lu = {
      uH: gl.getUniformLocation(this.linesProg, 'uH'),
      uRes: gl.getUniformLocation(this.linesProg, 'uRes'),
      uJitterPx: gl.getUniformLocation(this.linesProg, 'uJitterPx'),
      uColor: gl.getUniformLocation(this.linesProg, 'uColor'),
    };
    this.fdu = {};
    for (const n of [
      'uH', 'uRes', 'uJitterPx', 'uTime', 'uSpeed', 'uIntensity',
      'uSpacing', 'uTail', 'uPulseWidth', 'uWidthFrac', 'uMode', 'uColor',
    ])
      this.fdu[n] = gl.getUniformLocation(this.fieldDashProg, n);
    this.fau = {
      uH: gl.getUniformLocation(this.fieldArrowProg, 'uH'),
      uRes: gl.getUniformLocation(this.fieldArrowProg, 'uRes'),
      uJitterPx: gl.getUniformLocation(this.fieldArrowProg, 'uJitterPx'),
      uHole: gl.getUniformLocation(this.fieldArrowProg, 'uHole'),
      uTime: gl.getUniformLocation(this.fieldArrowProg, 'uTime'),
      uSpeedPx: gl.getUniformLocation(this.fieldArrowProg, 'uSpeedPx'),
      uPxToM: gl.getUniformLocation(this.fieldArrowProg, 'uPxToM'),
      uDirSign: gl.getUniformLocation(this.fieldArrowProg, 'uDirSign'),
      uColor: gl.getUniformLocation(this.fieldArrowProg, 'uColor'),
    };
    this.fvau = {
      uH: gl.getUniformLocation(this.fieldVectorArrowProg, 'uH'),
      uRes: gl.getUniformLocation(this.fieldVectorArrowProg, 'uRes'),
      uJitterPx: gl.getUniformLocation(this.fieldVectorArrowProg, 'uJitterPx'),
      uDirSign: gl.getUniformLocation(this.fieldVectorArrowProg, 'uDirSign'),
      uColor: gl.getUniformLocation(this.fieldVectorArrowProg, 'uColor'),
    };
    this.cau = {
      uRes: gl.getUniformLocation(this.currentArrowProg, 'uRes'),
      uScreen: gl.getUniformLocation(this.currentArrowProg, 'uScreen'),
      uJitterPx: gl.getUniformLocation(this.currentArrowProg, 'uJitterPx'),
      uDirSign: gl.getUniformLocation(this.currentArrowProg, 'uDirSign'),
      uColor: gl.getUniformLocation(this.currentArrowProg, 'uColor'),
      uCardboard: gl.getUniformLocation(this.currentArrowProg, 'uCardboard'),
    };
    this.buildCurrentOverlay();
    this.currentCometHeadVAO = null;
    this.currentCometHeadBuf = null;
    this.currentCometHeadCount = 0;
    this.fieldVAO = null;
    this.fieldCount = 0;
    this.fieldDashVAO = null;
    this.fieldDashCount = 0;
    this.fieldArrowVAO = null;
    this.fieldArrowCount = 0;
    this.fieldCometHeadVAO = null;
    this.fieldCometHeadCount = 0;
    this.fieldVectorArrowVAO = null;
    this.fieldVectorArrowBuf = null;
    this.fieldVectorArrowCount = 0;
    this.fieldVectorCometHeadVAO = null;
    this.fieldVectorCometHeadBuf = null;
    this.fieldVectorCometHeadCount = 0;
    this.fieldVectorLines = null;
    this.fieldPxToM = 1e-4;
  }

  // opts.paths (array of point lists) draws several conductors in series —
  // the multi-turn coil — each with its own dash arc, arrows, and comet
  // heads, all flowing the same way. opts.path stays the single-conductor
  // form; with neither, the straight variant's baked wire path is used.
  buildCurrentOverlay(opts = {}) {
    const paths = opts.paths?.length ? opts.paths : (opts.path ? [opts.path] : null);
    this.currentLines = paths ? paths.map((p) => buildPolylineFromPoints(p)) : [buildWirePolyline()];
    const [offX, offY] = opts.pathOffset ?? [0, 0];
    if (offX || offY) {
      this.currentLines = this.currentLines.map((line) =>
        line.map((p) => ({ ...p, x: p.x + offX, y: p.y + offY })));
    }
    this.currentLine = this.currentLines[0];
    this.buildDashGeometry(opts.trackWidth ?? 12.0);
    this.buildCurrentArrowGeometry({
      spacing: opts.arrowSpacing ?? 340,
      size: opts.arrowSize ?? 1,
    });
  }

  buildDashGeometry(widthPx = 12.0) {
    const gl = this.gl;
    const lines = this.currentLines || [this.currentLine || buildWirePolyline()];
    const width = Math.max(2.0, widthPx);
    const verts = [];  // x, y, arc, side, under
    for (const line of lines) {
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

  buildCurrentArrowGeometry(opts = {}) {
    const gl = this.gl;
    const lines = this.currentLines || [this.currentLine || buildWirePolyline()];
    const size = Math.max(0.25, opts.size ?? 1);
    const spacing = Math.max(80, opts.spacing ?? 340);
    const local = [
      [22 * size, 0],
      [-18 * size, -9 * size],
      [-18 * size, 9 * size],
    ];
    const verts = []; // center x/y, tangent x/y, local x/y, under
    for (const line of lines) {
      const total = line[line.length - 1].s;
      for (let s = 270; s < total - 180; s += spacing) {
        const p = samplePolyline(line, s);
        if (!p) continue;
        for (const l of local) {
          verts.push(p.x, p.y, p.tx, p.ty, l[0], l[1], p.under);
        }
      }
    }
    this.currentArrowCount = verts.length / 7;
    this.currentArrowVAO = gl.createVertexArray();
    gl.bindVertexArray(this.currentArrowVAO);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const stride = 28;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 24);
    gl.bindVertexArray(null);
  }

  // Current flows from the right edge, along the crossbar, DOWN through the
  // hole (dir = -1). Dash motion follows increasing arc length in that case.
  drawCurrentDashes(o) {
    const gl = this.gl;
    gl.useProgram(this.dashProg);
    gl.bindVertexArray(this.dashVAO);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(this.du.uRes, o.res[0], o.res[1]);
    gl.uniform2f(this.du.uScreen, o.screen?.[0] ?? o.res[0], o.screen?.[1] ?? o.res[1]);
    gl.uniform2f(this.du.uJitterPx, o.jitterPx?.[0] ?? 0, o.jitterPx?.[1] ?? 0);
    gl.uniform1f(this.du.uTime, o.time);
    gl.uniform1f(this.du.uSpeed, 420.0 * (o.speed ?? 1) * (o.dir < 0 ? 1 : -1));
    gl.uniform1f(this.du.uIntensity, Math.min(2, Math.abs(o.currentFrac)));
    gl.uniform1f(this.du.uSpacing, o.spacing ?? 140);
    gl.uniform1f(this.du.uTail, o.tail ?? 3);
    gl.uniform1f(this.du.uPulseWidth, o.pulseWidth ?? 0.055);
    gl.uniform1f(this.du.uWidthFrac, o.widthFrac ?? 1);
    gl.uniform1f(this.du.uMode, o.mode === 'pulse' ? 0 : 1);
    const c = o.color || [1.0, 0.72, 0.35];
    gl.uniform3f(this.du.uColor, c[0], c[1], c[2]);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, o.cardboardTex);
    gl.uniform1i(this.du.uCardboard, 2);
    gl.drawArrays(gl.TRIANGLES, 0, this.dashCount);
    gl.bindVertexArray(null);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  drawCurrentArrows(o) {
    if (!this.currentArrowCount) return;
    const gl = this.gl;
    gl.useProgram(this.currentArrowProg);
    gl.bindVertexArray(this.currentArrowVAO);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(this.cau.uRes, o.res[0], o.res[1]);
    gl.uniform2f(this.cau.uScreen, o.screen?.[0] ?? o.res[0], o.screen?.[1] ?? o.res[1]);
    gl.uniform2f(this.cau.uJitterPx, o.jitterPx?.[0] ?? 0, o.jitterPx?.[1] ?? 0);
    gl.uniform1f(this.cau.uDirSign, o.dir < 0 ? 1 : -1);
    const c = o.color || [1.0, 0.9, 0.35];
    const a = Math.min(0.92, Math.max(0, o.intensity ?? 1) * 0.42);
    gl.uniform4f(this.cau.uColor, c[0], c[1], c[2], a);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, o.cardboardTex);
    gl.uniform1i(this.cau.uCardboard, 2);
    gl.drawArrays(gl.TRIANGLES, 0, this.currentArrowCount);
    gl.bindVertexArray(null);
  }

  drawCurrentCometHeads(o) {
    const lines = this.currentLines || [this.currentLine || buildWirePolyline()];
    const gl = this.gl;
    const spacing = Math.max(60, o.spacing ?? 140);
    const speedPx = 420.0 * (o.speed ?? 1) * (o.dir < 0 ? 1 : -1);
    const size = Math.max(0.25, o.cometHeadSize ?? 0.8);
    const local = [
      [18 * size, 0],
      [-14 * size, -7 * size],
      [-14 * size, 7 * size],
    ];
    const verts = [];
    const start = positiveMod((o.time ?? 0) * speedPx, spacing);
    for (const line of lines) {
      const total = line[line.length - 1]?.s ?? 0;
      for (let s = start; s < total; s += spacing) {
        const p = samplePolyline(line, s);
        if (!p) continue;
        for (const l of local) {
          verts.push(p.x, p.y, p.tx, p.ty, l[0], l[1], p.under);
        }
      }
    }
    if (!verts.length) return;
    this.currentCometHeadCount = verts.length / 7;
    if (!this.currentCometHeadVAO) this.currentCometHeadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.currentCometHeadVAO);
    if (!this.currentCometHeadBuf) this.currentCometHeadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.currentCometHeadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    const stride = 28;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 24);

    gl.useProgram(this.currentArrowProg);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(this.cau.uRes, o.res[0], o.res[1]);
    gl.uniform2f(this.cau.uScreen, o.screen?.[0] ?? o.res[0], o.screen?.[1] ?? o.res[1]);
    gl.uniform2f(this.cau.uJitterPx, o.jitterPx?.[0] ?? 0, o.jitterPx?.[1] ?? 0);
    gl.uniform1f(this.cau.uDirSign, o.dir < 0 ? 1 : -1);
    const c = o.color || [1.0, 0.9, 0.35];
    const a = Math.min(0.94, Math.max(0, o.intensity ?? 1) * 0.52);
    gl.uniform4f(this.cau.uColor, c[0], c[1], c[2], a);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, o.cardboardTex);
    gl.uniform1i(this.cau.uCardboard, 2);
    gl.drawArrays(gl.TRIANGLES, 0, this.currentCometHeadCount);
    gl.bindVertexArray(null);
  }

  // Concentric field bands around the hole (preview only). WebGL line width is
  // implementation-dependent, so draw thin annular strips instead of GL_LINES.
  buildFieldLines(holeX, holeY, rMax, opts = {}) {
    const gl = this.gl;
    const verts = [];
    const dashVerts = [];
    const arrowVerts = [];
    const cometHeadVerts = [];
    this.fieldVectorLines = null;
    this.fieldVectorArrowCount = 0;
    this.fieldVectorCometHeadCount = 0;
    const nRings = Math.max(1, Math.round(opts.rings ?? 6));
    const seg = Math.max(36, Math.round(opts.segments ?? 112));
    const firstRadius = Math.max(0.0001, opts.firstRadius ?? (rMax / Math.max(1, nRings)));
    const radiusMultiplier = Math.max(1.01, opts.radiusMultiplier ?? 1.25);
    const falloffCurve = Math.max(0.45, opts.falloffCurve ?? 1);
    const pxToM = Math.max(1e-6, opts.pxToM ?? (rMax / 1200));
    const thickness = Math.max(0.15, opts.thickness ?? 1);
    const arrowDensity = Math.max(0, opts.arrowDensity ?? 1);
    const arrowSize = Math.max(0.25, opts.arrowSize ?? 1);
    const cometSpacing = Math.max(30, opts.cometSpacing ?? 170);
    const cometHeadSize = Math.max(0.25, opts.cometHeadSize ?? 0.75);
    const bandHalfWidth = Math.max(0.00008, pxToM * 1.8) * thickness;
    const arrowLen = Math.max(0.0024, pxToM * 30) * arrowSize;
    const arrowWid = arrowLen * 0.45;
    const cometArrowLen = Math.max(0.0014, pxToM * 20) * cometHeadSize;
    const cometArrowWid = cometArrowLen * 0.46;
    this.fieldPxToM = pxToM;
    let reachedMax = false;
    for (let k = 0; k < nRings; k++) {
      const exponent = Math.pow(k, falloffCurve);
      let r = firstRadius * Math.pow(radiusMultiplier, exponent);
      if (r > rMax) {
        if (reachedMax) break;
        r = rMax;
        reachedMax = true;
      }
      const r0 = Math.max(0.001, r - bandHalfWidth);
      const r1 = r + bandHalfWidth;
      const rPx = r / pxToM;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
        const p00 = [holeX + r0 * Math.cos(a0), holeY + r0 * Math.sin(a0)];
        const p01 = [holeX + r0 * Math.cos(a1), holeY + r0 * Math.sin(a1)];
        const p10 = [holeX + r1 * Math.cos(a0), holeY + r1 * Math.sin(a0)];
        const p11 = [holeX + r1 * Math.cos(a1), holeY + r1 * Math.sin(a1)];
        const arc0 = rPx * a0;
        const arc1 = rPx * a1;
        verts.push(
          p00[0], p00[1], p10[0], p10[1], p11[0], p11[1],
          p00[0], p00[1], p11[0], p11[1], p01[0], p01[1],
        );
        dashVerts.push(
          p00[0], p00[1], arc0, -1, p10[0], p10[1], arc0, 1, p11[0], p11[1], arc1, 1,
          p00[0], p00[1], arc0, -1, p11[0], p11[1], arc1, 1, p01[0], p01[1], arc1, -1,
        );
      }
      const cometCount = Math.max(1, Math.floor((Math.PI * 2 * rPx) / cometSpacing));
      const cometLocal = [
        [cometArrowLen * 0.72, 0],
        [-cometArrowLen * 0.56, -cometArrowWid],
        [-cometArrowLen * 0.56, cometArrowWid],
      ];
      for (let i = 0; i < cometCount; i++) {
        const a = (i * cometSpacing) / Math.max(1, rPx);
        for (const p of cometLocal) {
          cometHeadVerts.push(r, a, p[0], p[1]);
        }
      }
      if (k > 0 && k < nRings - 1 && arrowDensity > 0) {
        const count = Math.max(1, Math.round((k % 2 ? 3 : 4) * arrowDensity));
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + k * 0.37;
          const local = [
            [arrowLen * 0.7, 0],
            [-arrowLen * 0.55, -arrowWid],
            [-arrowLen * 0.55, arrowWid],
          ];
          for (const p of local) {
            arrowVerts.push(r, a, p[0], p[1]);
          }
        }
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

    this.fieldDashCount = dashVerts.length / 4;
    if (!this.fieldDashVAO) this.fieldDashVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fieldDashVAO);
    if (!this.fieldDashBuf) this.fieldDashBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldDashBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dashVerts), gl.STATIC_DRAW);
    const dashStride = 16;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, dashStride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, dashStride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, dashStride, 12);
    gl.bindVertexArray(null);

    this.fieldArrowCount = arrowVerts.length / 4;
    if (!this.fieldArrowVAO) this.fieldArrowVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fieldArrowVAO);
    if (!this.fieldArrowBuf) this.fieldArrowBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldArrowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arrowVerts), gl.STATIC_DRAW);
    const stride = 16;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 1, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 4);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 8);
    gl.bindVertexArray(null);

    this.fieldCometHeadCount = cometHeadVerts.length / 4;
    if (!this.fieldCometHeadVAO) this.fieldCometHeadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fieldCometHeadVAO);
    if (!this.fieldCometHeadBuf) this.fieldCometHeadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldCometHeadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cometHeadVerts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 1, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 4);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 8);
    gl.bindVertexArray(null);
  }

  // Coil variant: the loop's legs pierce the board with opposite current, so
  // the in-plane field lines are the Apollonius circles of the two holes
  // (level sets of ln(da/db)) plus the straight coil-axis line on the
  // perpendicular bisector. Circles never cross, crowd toward the holes, and
  // are clipped to the cardboard rectangle. Polylines are wound so increasing
  // arc runs along H(dir = -1); the dash shader moves comets toward
  // decreasing arc for dir = +1, which then follows H(dir = +1).
  buildCoilFieldLines(poleA, poleB, rMax, opts = {}) {
    const gl = this.gl;
    const verts = [];
    const dashVerts = [];
    const arrowVerts = [];
    const nLines = Math.max(2, Math.round(opts.rings ?? 12));
    const perSide = Math.max(1, Math.round(nLines / 2));
    const firstRadius = Math.max(0.0008, opts.firstRadius ?? 0.008);
    const gapRatio = Math.max(1.01, opts.radiusMultiplier ?? 1.25);
    const pxToM = Math.max(1e-6, opts.pxToM ?? (rMax / 1200));
    const thickness = Math.max(0.15, opts.thickness ?? 1);
    const arrowDensity = Math.max(0, opts.arrowDensity ?? 1);
    const arrowSize = Math.max(0.25, opts.arrowSize ?? 1);
    const bandHalfWidth = Math.max(0.00006, pxToM * 1.55) * thickness;
    const arrowSpacing = Math.max(32, 250 / Math.max(0.25, arrowDensity));
    const arrowLen = Math.max(0.0015, pxToM * 24) * arrowSize;
    const arrowWid = arrowLen * 0.46;
    this.fieldPxToM = pxToM;

    const ax = poleA[0], ay = poleA[1];
    const bx = poleB[0], by = poleB[1];
    const dx = bx - ax, dy = by - ay;
    const sep = Math.max(1e-6, Math.hypot(dx, dy));
    const ux = dx / sep, uy = dy / sep;
    const sheetW = opts.sheetW ?? Infinity;
    const sheetH = opts.sheetH ?? Infinity;
    const clipMargin = opts.clipMargin ?? 0.002;
    const inside = (px, py) => {
      if (px < clipMargin || py < clipMargin ||
          px > sheetW - clipMargin || py > sheetH - clipMargin) return false;
      const ra = Math.hypot(px - ax, py - ay);
      const rb = Math.hypot(px - bx, py - by);
      return Math.min(ra, rb) <= rMax;
    };
    // H direction for dir = -1 at a point (the winding reference).
    const windRef = (px, py) => {
      const dax = px - ax, day = py - ay, dbx = px - bx, dby = py - by;
      const ia = 1 / Math.max(1e-9, dax * dax + day * day);
      const ib = 1 / Math.max(1e-9, dbx * dbx + dby * dby);
      return [-(day * ia - dby * ib), dax * ia - dbx * ib];
    };
    const lines = [];
    const addClipped = (pts) => {
      let run = [];
      const flush = () => {
        if (run.length > 2) lines.push(arcLengthPlane(run, pxToM));
        run = [];
      };
      for (const p of pts) {
        if (inside(p.x, p.y)) run.push(p); else flush();
      }
      flush();
    };
    const local = [
      [arrowLen * 0.70, 0],
      [-arrowLen * 0.55, -arrowWid],
      [-arrowLen * 0.55, arrowWid],
    ];

    // Circle closest-approach distances along AB crowd toward the holes with
    // ratio gapRatio between consecutive gaps; the last circle hugs the
    // perpendicular bisector and reads as a near-straight center line.
    const xMax = sep * 0.47;
    const denom = Math.pow(gapRatio, Math.max(1, perSide - 1)) - 1;
    for (let k = 0; k < perSide; k++) {
      const frac = perSide === 1 ? 0
        : denom > 1e-6 ? (Math.pow(gapRatio, k) - 1) / denom : k / (perSide - 1);
      const near = Math.min(xMax, firstRadius + (xMax - firstRadius) * frac);
      const lam = Math.min(0.93, Math.max(0.001, near / Math.max(1e-6, sep - near)));
      const R = lam * sep / (1 - lam * lam);
      const centerOff = lam * lam * sep / (1 - lam * lam);
      const nSeg = Math.min(4096, Math.max(72, Math.ceil((Math.PI * 2 * R) / Math.max(0.0015, pxToM * 8))));
      for (const side of [0, 1]) {
        const cx = side === 0 ? ax - ux * centerOff : bx + ux * centerOff;
        const cy = side === 0 ? ay - uy * centerOff : by + uy * centerOff;
        const pts = [];
        for (let s = 0; s <= nSeg; s++) {
          const a = (s / nSeg) * Math.PI * 2;
          pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
        }
        // Compare the CCW tangent at the circle's crossing point on the AB
        // segment (distance `near` from its own hole) with the field there.
        const probe = side === 0
          ? { x: ax + ux * near, y: ay + uy * near }
          : { x: bx - ux * near, y: by - uy * near };
        const pr = Math.max(1e-9, Math.hypot(probe.x - cx, probe.y - cy));
        const tan = [-(probe.y - cy) / pr, (probe.x - cx) / pr];
        const ref = windRef(probe.x, probe.y);
        if (tan[0] * ref[0] + tan[1] * ref[1] < 0) pts.reverse();
        addClipped(pts);
      }
    }

    // The coil-axis line (the u = 0 level set), clipped like everything else.
    const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;
    const nx = -uy, ny = ux;
    const axisReach = Math.hypot(sheetW === Infinity ? rMax : sheetW, sheetH === Infinity ? rMax : sheetH);
    const axisSeg = 256;
    const axisPts = [];
    for (let s = 0; s <= axisSeg; s++) {
      const t = -axisReach + (2 * axisReach * s) / axisSeg;
      axisPts.push({ x: mx + nx * t, y: my + ny * t });
    }
    const axisRef = windRef(mx, my);
    if (nx * axisRef[0] + ny * axisRef[1] < 0) axisPts.reverse();
    addClipped(axisPts);

    for (const line of lines) {
      pushThickPlaneLine(line, bandHalfWidth, verts, dashVerts);
      if (arrowDensity > 0 && line.length > 1) {
        const total = line[line.length - 1].s;
        for (let s = arrowSpacing * 0.7; s < total - arrowSpacing * 0.35; s += arrowSpacing) {
          const p = samplePlanePolyline(line, s);
          if (!p) continue;
          for (const l of local) arrowVerts.push(p.x, p.y, p.tx, p.ty, l[0], l[1]);
        }
      }
    }

    this.fieldVectorLines = lines;
    this.fieldCount = verts.length / 2;
    if (!this.fieldVAO) this.fieldVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fieldVAO);
    if (!this.fieldBuf) this.fieldBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.fieldDashCount = dashVerts.length / 4;
    if (!this.fieldDashVAO) this.fieldDashVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fieldDashVAO);
    if (!this.fieldDashBuf) this.fieldDashBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldDashBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dashVerts), gl.STATIC_DRAW);
    const dashStride = 16;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, dashStride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, dashStride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, dashStride, 12);
    gl.bindVertexArray(null);

    this.fieldArrowCount = 0;
    this.fieldCometHeadCount = 0;
    this.fieldVectorArrowCount = arrowVerts.length / 6;
    if (!this.fieldVectorArrowVAO) this.fieldVectorArrowVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fieldVectorArrowVAO);
    if (!this.fieldVectorArrowBuf) this.fieldVectorArrowBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldVectorArrowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arrowVerts), gl.STATIC_DRAW);
    const stride = 24;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 16);
    gl.bindVertexArray(null);
  }

  // Bar magnet: field lines are the circular arcs through both poles (plus
  // the axis line beyond each pole). Each arc is wound S → N so the dash
  // shader's dir=+1 flow (toward decreasing arc) runs N → S along the line,
  // the way field lines leave N and enter S.
  buildBarFieldLines(poleN, poleS, rMax, opts = {}) {
    const gl = this.gl;
    const verts = [];
    const dashVerts = [];
    const arrowVerts = [];
    const nLines = Math.max(2, Math.round(opts.rings ?? 12));
    const perSide = Math.max(1, Math.round(nLines / 2));
    const firstBulge = Math.max(0.004, opts.firstRadius ?? 0.01);
    const gapRatio = Math.max(1.01, opts.radiusMultiplier ?? 1.2);
    const pxToM = Math.max(1e-6, opts.pxToM ?? (rMax / 1200));
    const thickness = Math.max(0.15, opts.thickness ?? 1);
    const arrowDensity = Math.max(0, opts.arrowDensity ?? 1);
    const arrowSize = Math.max(0.25, opts.arrowSize ?? 1);
    const bandHalfWidth = Math.max(0.00006, pxToM * 1.55) * thickness;
    const arrowSpacing = Math.max(32, 250 / Math.max(0.25, arrowDensity));
    const arrowLen = Math.max(0.0015, pxToM * 24) * arrowSize;
    const arrowWid = arrowLen * 0.46;
    this.fieldPxToM = pxToM;

    const ax = poleN[0], ay = poleN[1];
    const bx = poleS[0], by = poleS[1];
    const dx = bx - ax, dy = by - ay;
    const sep = Math.max(1e-6, Math.hypot(dx, dy));
    const ux = dx / sep, uy = dy / sep;
    const nx = -uy, ny = ux;
    const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;
    const sheetW = opts.sheetW ?? Infinity;
    const sheetH = opts.sheetH ?? Infinity;
    const clipMargin = opts.clipMargin ?? 0.002;
    const ex = opts.excludeRect;   // magnet body: lines pinch into the poles
    const inside = (px, py) => {
      if (px < clipMargin || py < clipMargin ||
          px > sheetW - clipMargin || py > sheetH - clipMargin) return false;
      if (ex && px > ex[0] && px < ex[2] && py > ex[1] && py < ex[3]) return false;
      const ra = Math.hypot(px - ax, py - ay);
      const rb = Math.hypot(px - bx, py - by);
      return Math.min(ra, rb) <= rMax;
    };
    const lines = [];
    const addClipped = (pts) => {
      let run = [];
      const flush = () => { if (run.length > 2) lines.push(arcLengthPlane(run, pxToM)); run = []; };
      for (const p of pts) { if (inside(p.x, p.y)) run.push(p); else flush(); }
      flush();
    };
    const local = [
      [arrowLen * 0.70, 0],
      [-arrowLen * 0.55, -arrowWid],
      [-arrowLen * 0.55, arrowWid],
    ];

    if (opts.paths?.length) {
      // The film's authored field-line art: wind each path against the
      // field so dash flow (dir=+1, toward decreasing arc) runs N -> S.
      for (const pts of opts.paths) {
        // Majority-vote the flow over points OUTSIDE the bar: the two-pole
        // model is only valid there (real interior flux runs S -> N, which a
        // continuous through-line then carries automatically). A single
        // midpoint sample can land inside/beside the bar and flip the line.
        let dot = 0;
        for (let i = 1; i < pts.length - 1; i++) {
          const P = pts[i];
          const t = ((P.x - ax) * (bx - ax) + (P.y - ay) * (by - ay)) / (sep * sep);
          if (t > -0.06 && t < 1.06) {
            const qx = ax + (bx - ax) * t, qy = ay + (by - ay) * t;
            if (Math.hypot(P.x - qx, P.y - qy) < sep * 0.16) continue;   // inside the bar zone
          }
          const da2 = Math.max(1e-9, (P.x - ax) ** 2 + (P.y - ay) ** 2);
          const db2 = Math.max(1e-9, (P.x - bx) ** 2 + (P.y - by) ** 2);
          const hx = (P.x - ax) / da2 - (P.x - bx) / db2;
          const hy = (P.y - ay) / da2 - (P.y - by) / db2;
          dot += (pts[i + 1].x - pts[i - 1].x) * hx + (pts[i + 1].y - pts[i - 1].y) * hy;
        }
        // heads travel toward the array start, so the array must run
        // anti-parallel to H for flow to follow N -> S outside.
        const ordered = dot > 0 ? [...pts].reverse() : pts;
        addClipped(ordered);
      }
      for (const line of lines) {
        pushThickPlaneLine(line, bandHalfWidth, verts, dashVerts);
        if (arrowDensity > 0 && line.length > 1) {
          const total = line[line.length - 1].s;
          for (let s = arrowSpacing * 0.7; s < total - arrowSpacing * 0.35; s += arrowSpacing) {
            const p = samplePlanePolyline(line, s);
            if (!p) continue;
            for (const l of local) arrowVerts.push(p.x, p.y, p.tx, p.ty, l[0], l[1]);
          }
        }
      }
      this.fieldVectorLines = lines;
      this.uploadFieldGeometry(verts, dashVerts, arrowVerts);
      return;
    }
    // Reference family: pinched ellipses through BOTH poles — flattened
    // ovals whose top (or bottom) arcs high while the far edge dips behind
    // the bar between the poles. Sampled theta-ascending, which winds them
    // so dir=+1 comet flow runs N -> S over the bulge.
    const denom = Math.pow(gapRatio, Math.max(1, perSide - 1)) - 1;
    const maxBulge = Math.max(firstBulge * 1.2, rMax);
    for (let k = 0; k < perSide; k++) {
      const frac = perSide === 1 ? 0
        : denom > 1e-6 ? (Math.pow(gapRatio, k) - 1) / denom : k / (perSide - 1);
      const T = firstBulge + (maxBulge - firstBulge) * frac;     // bulge height
      const Aell = sep / 2 + T * 0.30;                           // reaches past the poles
      const q = Math.sqrt(Math.max(0, 1 - (sep / 2 / Aell) ** 2));
      const Bell = T / (1 + q);
      const h = q * Bell;                                        // center offset off-axis
      const nSeg = Math.min(2048, Math.max(96, Math.ceil((2 * Math.PI * Math.max(Aell, Bell)) / Math.max(0.0015, pxToM * 8))));
      for (const side of [1, -1]) {
        const cx2 = mx + nx * side * h, cy2 = my + ny * side * h;
        const pts = [];
        for (let sI = 0; sI <= nSeg; sI++) {
          const th = (sI / nSeg) * Math.PI * 2;
          const du = Aell * Math.cos(th), dn = Bell * Math.sin(th);
          pts.push({ x: cx2 + ux * du + nx * side * dn, y: cy2 + uy * du + ny * side * dn });
        }
        addClipped(pts);
      }
    }
    // (No axis lines: the reference shows only the pole-anchored loops.)
    for (const line of lines) {
      pushThickPlaneLine(line, bandHalfWidth, verts, dashVerts);
      if (arrowDensity > 0 && line.length > 1) {
        const total = line[line.length - 1].s;
        for (let s = arrowSpacing * 0.7; s < total - arrowSpacing * 0.35; s += arrowSpacing) {
          const p = samplePlanePolyline(line, s);
          if (!p) continue;
          for (const l of local) arrowVerts.push(p.x, p.y, p.tx, p.ty, l[0], l[1]);
        }
      }
    }

    this.fieldVectorLines = lines;
    this.uploadFieldGeometry(verts, dashVerts, arrowVerts);
  }

  uploadFieldGeometry(verts, dashVerts, arrowVerts) {
    const gl = this.gl;
    this.fieldCount = verts.length / 2;
    if (!this.fieldVAO) this.fieldVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fieldVAO);
    if (!this.fieldBuf) this.fieldBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.fieldDashCount = dashVerts.length / 4;
    if (!this.fieldDashVAO) this.fieldDashVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fieldDashVAO);
    if (!this.fieldDashBuf) this.fieldDashBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldDashBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dashVerts), gl.STATIC_DRAW);
    const dashStride = 16;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, dashStride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, dashStride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, dashStride, 12);
    gl.bindVertexArray(null);

    this.fieldArrowCount = 0;
    this.fieldCometHeadCount = 0;
    this.fieldVectorArrowCount = arrowVerts.length / 6;
    if (!this.fieldVectorArrowVAO) this.fieldVectorArrowVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fieldVectorArrowVAO);
    if (!this.fieldVectorArrowBuf) this.fieldVectorArrowBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldVectorArrowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arrowVerts), gl.STATIC_DRAW);
    const stride = 24;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 16);
    gl.bindVertexArray(null);
  }


  // Solenoid: straight field lines threading the bore along the axis plus
  // nested return ovals on both sides of the coil (classic textbook family).
  // Winding: dir=+1 comet flow (toward decreasing arc) runs OUT of pole A
  // (coilLeft pin) through the bore and back around the outside.
  buildSolenoidFieldLines(poleA, poleB, rMax, opts = {}) {
    const gl = this.gl;
    const verts = [];
    const dashVerts = [];
    const arrowVerts = [];
    const pxToM = Math.max(1e-6, opts.pxToM ?? (rMax / 1200));
    const thickness = Math.max(0.15, opts.thickness ?? 1);
    const arrowDensity = Math.max(0, opts.arrowDensity ?? 1);
    const arrowSize = Math.max(0.25, opts.arrowSize ?? 1);
    const bandHalfWidth = Math.max(0.00006, pxToM * 1.55) * thickness;
    const arrowSpacing = Math.max(32, 250 / Math.max(0.25, arrowDensity));
    const arrowLen = Math.max(0.0015, pxToM * 24) * arrowSize;
    const arrowWid = arrowLen * 0.46;
    this.fieldPxToM = pxToM;

    const ax = poleA[0], ay = poleA[1];
    const bx = poleB[0], by = poleB[1];
    const dx = bx - ax, dy = by - ay;
    const L = Math.max(1e-6, Math.hypot(dx, dy));
    const ux = dx / L, uy = dy / L;          // axis, A -> B
    const nx = -uy, ny = ux;                  // perpendicular
    const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;
    const boreR = Math.max(1e-4, opts.boreR ?? L * 0.15);
    const sheetW = opts.sheetW ?? Infinity;
    const sheetH = opts.sheetH ?? Infinity;
    const clipMargin = opts.clipMargin ?? 0.002;
    const inside = (px, py) =>
      px >= clipMargin && py >= clipMargin &&
      px <= sheetW - clipMargin && py <= sheetH - clipMargin;
    const lines = [];
    const addClipped = (pts) => {
      let run = [];
      const flush = () => { if (run.length > 2) lines.push(arcLengthPlane(run, pxToM)); run = []; };
      for (const p of pts) { if (inside(p.x, p.y)) run.push(p); else flush(); }
      flush();
    };
    const local = [
      [arrowLen * 0.70, 0],
      [-arrowLen * 0.55, -arrowWid],
      [-arrowLen * 0.55, arrowWid],
    ];

    // Textbook solenoid family (see any physics reference): CLOSED loops
    // that run straight through the bore, exit an end, balloon around the
    // side, and re-enter the other end — plus a few OPEN lines fanning out
    // of the ends near the axis. Loops are nested and never cross.
    const Lh = L / 2;
    const nLoops = 2;                    // per side
    const nSegPer = Math.max(24, Math.round((opts.segments ?? 96) / 2));
    const halfEllipse = (cx2, cy2, semiA, semiB, a0, a1, ux2, uy2, nx2, ny2) => {
      const pts = [];
      for (let i = 0; i <= nSegPer; i++) {
        const th = a0 + (a1 - a0) * (i / nSegPer);
        const du = semiA * Math.cos(th), dn = semiB * Math.sin(th);
        pts.push({ x: cx2 + ux2 * du + nx2 * dn, y: cy2 + uy2 * du + ny2 * dn });
      }
      return pts;
    };
    for (let k = 0; k < nLoops; k++) {
      const dIn = boreR * (0.30 + 0.28 * k);        // interior offset
      const Rk = boreR * (2.3 + 1.7 * k);           // outer return distance
      const Ek = boreR * (0.9 + 0.5 * k);           // end-cap axial reach
      for (const side of [1, -1]) {
        const nS = { x: nx * side, y: ny * side };
        const pts = [];
        // interior: A end -> B end at n = dIn
        for (let i = 0; i <= nSegPer; i++) {
          const t = -Lh + (2 * Lh) * (i / nSegPer);
          pts.push({ x: mx + ux * t + nS.x * dIn, y: my + uy * t + nS.y * dIn });
        }
        // B-end cap: swing from dIn out to Rk (half ellipse, bulging past B)
        const capC = (dIn + Rk) / 2, capS = (Rk - dIn) / 2;
        pts.push(...halfEllipse(mx + ux * Lh, my + uy * Lh, Ek, capS,
          -Math.PI / 2, Math.PI / 2, ux, uy, nS.x, nS.y).map(p =>
          ({ x: p.x + nS.x * capC, y: p.y + nS.y * capC })));
        // outer return: B -> A at ~Rk with a gentle outward bulge
        for (let i = 1; i < nSegPer; i++) {
          const t = Lh - (2 * Lh) * (i / nSegPer);
          const bulge = Rk + boreR * 0.35 * Math.sin(Math.PI * (i / nSegPer));
          pts.push({ x: mx + ux * t + nS.x * bulge, y: my + uy * t + nS.y * bulge });
        }
        // A-end cap: back in from Rk to dIn
        pts.push(...halfEllipse(mx - ux * Lh, my - uy * Lh, Ek, capS,
          Math.PI / 2, (3 * Math.PI) / 2, ux, uy, nS.x, nS.y).map(p =>
          ({ x: p.x + nS.x * capC, y: p.y + nS.y * capC })));
        pts.push({ ...pts[0] });
        addClipped(pts);
      }
    }
    // open lines near the axis: through the bore, fanning out past the ends
    const reach = Math.hypot(sheetW === Infinity ? rMax : sheetW, sheetH === Infinity ? rMax : sheetH);
    const fans = [[0, 0], [boreR * 0.14, 0.20], [-boreR * 0.14, -0.20]];
    for (const [off, ang] of fans) {
      const pts = [];
      const dirA = { x: -ux * Math.cos(ang) + nx * Math.sin(ang), y: -uy * Math.cos(ang) + ny * Math.sin(ang) };
      const dirB = { x: ux * Math.cos(ang) + nx * Math.sin(ang), y: uy * Math.cos(ang) + ny * Math.sin(ang) };
      for (let i = nSegPer; i >= 1; i--) {   // beyond A, far tip first
        const t = (i / nSegPer) * reach;
        pts.push({ x: mx - ux * Lh + nx * off + dirA.x * t, y: my - uy * Lh + ny * off + dirA.y * t });
      }
      for (let i = 0; i <= nSegPer; i++) {   // through the bore
        const t = -Lh + (2 * Lh) * (i / nSegPer);
        pts.push({ x: mx + ux * t + nx * off, y: my + uy * t + ny * off });
      }
      for (let i = 1; i <= nSegPer; i++) {   // beyond B
        const t = (i / nSegPer) * reach;
        pts.push({ x: mx + ux * Lh + nx * off + dirB.x * t, y: my + uy * Lh + ny * off + dirB.y * t });
      }
      addClipped(pts);
    }
    for (const line of lines) {
      pushThickPlaneLine(line, bandHalfWidth, verts, dashVerts);
      if (arrowDensity > 0 && line.length > 1) {
        const tot = line[line.length - 1].s;
        for (let sA = arrowSpacing * 0.7; sA < tot - arrowSpacing * 0.35; sA += arrowSpacing) {
          const p = samplePlanePolyline(line, sA);
          if (!p) continue;
          for (const l of local) arrowVerts.push(p.x, p.y, p.tx, p.ty, l[0], l[1]);
        }
      }
    }
    this.fieldVectorLines = lines;
    this.uploadFieldGeometry(verts, dashVerts, arrowVerts);
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
    gl.uniform2f(this.lu.uJitterPx, o.jitterPx?.[0] ?? 0, o.jitterPx?.[1] ?? 0);
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
    gl.uniform2f(this.lu.uJitterPx, o.jitterPx?.[0] ?? 0, o.jitterPx?.[1] ?? 0);
    const c = o.color || [0.55, 0.85, 1.0];
    // o.opacity is the user's absolute line opacity (0..1); intensity only
    // gates it (current off / ramping in), so full opacity really is full.
    const presence = Math.max(0, Math.min(1, o.intensity ?? 1));
    const alpha = Math.min(0.98, Math.max(0, o.opacity ?? 0.32) * presence);
    gl.uniform4f(this.lu.uColor, c[0], c[1], c[2], alpha);
    gl.drawArrays(gl.TRIANGLES, 0, this.fieldCount);
    gl.bindVertexArray(null);
  }

  drawFieldDashes(o) {
    if (!this.fieldDashCount) return;
    const gl = this.gl;
    gl.useProgram(this.fieldDashProg);
    gl.bindVertexArray(this.fieldDashVAO);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix3fv(this.fdu.uH, false, o.H);
    gl.uniform2f(this.fdu.uRes, o.res[0], o.res[1]);
    gl.uniform2f(this.fdu.uJitterPx, o.jitterPx?.[0] ?? 0, o.jitterPx?.[1] ?? 0);
    gl.uniform1f(this.fdu.uTime, o.time ?? 0);
    gl.uniform1f(this.fdu.uSpeed, 180.0 * (o.speed ?? 1) * (o.dir < 0 ? 1 : -1));
    gl.uniform1f(this.fdu.uIntensity, Math.min(3, Math.max(0, o.intensity ?? 1)));
    gl.uniform1f(this.fdu.uSpacing, o.spacing ?? 160);
    gl.uniform1f(this.fdu.uTail, o.tail ?? 3);
    gl.uniform1f(this.fdu.uPulseWidth, o.pulseWidth ?? 0.055);
    gl.uniform1f(this.fdu.uWidthFrac, o.widthFrac ?? 0.8);
    gl.uniform1f(this.fdu.uMode, o.mode === 'pulse' ? 0 : 1);
    const c = o.color || [0.55, 0.85, 1.0];
    gl.uniform3f(this.fdu.uColor, c[0], c[1], c[2]);
    gl.drawArrays(gl.TRIANGLES, 0, this.fieldDashCount);
    gl.bindVertexArray(null);
  }

  drawFieldArrows(o) {
    if (this.fieldVectorArrowCount) {
      this.drawFieldVectorArrowSet(this.fieldVectorArrowVAO, this.fieldVectorArrowCount, o, 0.32);
      return;
    }
    this.drawFieldArrowSet(this.fieldArrowVAO, this.fieldArrowCount, o, 0.32, 180.0 * (o.speed ?? 0));
  }

  drawFieldCometHeads(o) {
    if (this.fieldVectorLines) {
      this.drawFieldVectorCometHeads(o);
      return;
    }
    this.drawFieldArrowSet(this.fieldCometHeadVAO, this.fieldCometHeadCount, o, 0.46, 180.0 * (o.speed ?? 1));
  }

  drawFieldVectorCometHeads(o) {
    const lines = this.fieldVectorLines;
    if (!lines?.length) return;
    const gl = this.gl;
    const spacing = Math.max(30, o.spacing ?? 170);
    // Same sign convention as the dash shader in drawFieldDashes, so the
    // head triangles travel with their comet tails.
    const speedPx = 180.0 * (o.speed ?? 1) * (o.dir < 0 ? 1 : -1);
    const size = Math.max(0.25, o.cometHeadSize ?? 0.75);
    const pxToM = this.fieldPxToM || 1e-4;
    const len = Math.max(0.0012, pxToM * 20) * size;
    const wid = len * 0.46;
    const local = [
      [len * 0.72, 0],
      [-len * 0.56, -wid],
      [-len * 0.56, wid],
    ];
    const verts = [];
    const start = positiveMod((o.time ?? 0) * speedPx, spacing);
    for (const line of lines) {
      const total = line[line.length - 1]?.s ?? 0;
      for (let s = start; s < total; s += spacing) {
        const p = samplePlanePolyline(line, s);
        if (!p) continue;
        for (const l of local) verts.push(p.x, p.y, p.tx, p.ty, l[0], l[1]);
      }
    }
    if (!verts.length) return;
    this.fieldVectorCometHeadCount = verts.length / 6;
    if (!this.fieldVectorCometHeadVAO) this.fieldVectorCometHeadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fieldVectorCometHeadVAO);
    if (!this.fieldVectorCometHeadBuf) this.fieldVectorCometHeadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldVectorCometHeadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    const stride = 24;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 16);
    gl.bindVertexArray(null);
    this.drawFieldVectorArrowSet(this.fieldVectorCometHeadVAO, this.fieldVectorCometHeadCount, o, 0.46);
  }

  drawFieldVectorArrowSet(vao, count, o, alphaScale) {
    if (!count || !vao) return;
    const gl = this.gl;
    gl.useProgram(this.fieldVectorArrowProg);
    gl.bindVertexArray(vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix3fv(this.fvau.uH, false, o.H);
    gl.uniform2f(this.fvau.uRes, o.res[0], o.res[1]);
    gl.uniform2f(this.fvau.uJitterPx, o.jitterPx?.[0] ?? 0, o.jitterPx?.[1] ?? 0);
    // Polylines are wound along H(dir = -1); flip the heads for dir = +1 so
    // they point the way the dashes travel.
    gl.uniform1f(this.fvau.uDirSign, o.dir < 0 ? 1 : -1);
    const c = o.color || [0.55, 0.85, 1.0];
    const intensity = Math.max(0, o.intensity ?? 1);
    gl.uniform4f(this.fvau.uColor, c[0], c[1], c[2], Math.min(0.90, alphaScale * intensity));
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.bindVertexArray(null);
  }

  drawFieldArrowSet(vao, count, o, alphaScale, speedPx) {
    if (!count || !vao) return;
    const gl = this.gl;
    gl.useProgram(this.fieldArrowProg);
    gl.bindVertexArray(vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix3fv(this.fau.uH, false, o.H);
    gl.uniform2f(this.fau.uRes, o.res[0], o.res[1]);
    gl.uniform2f(this.fau.uJitterPx, o.jitterPx?.[0] ?? 0, o.jitterPx?.[1] ?? 0);
    gl.uniform2f(this.fau.uHole, o.hole?.[0] ?? 0, o.hole?.[1] ?? 0);
    gl.uniform1f(this.fau.uTime, o.time ?? 0);
    gl.uniform1f(this.fau.uSpeedPx, speedPx);
    gl.uniform1f(this.fau.uPxToM, this.fieldPxToM || 1e-4);
    gl.uniform1f(this.fau.uDirSign, o.dir < 0 ? 1 : -1);
    const c = o.color || [0.55, 0.85, 1.0];
    const intensity = Math.max(0, o.intensity ?? 1);
    gl.uniform4f(this.fau.uColor, c[0], c[1], c[2], Math.min(0.90, alphaScale * intensity));
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.bindVertexArray(null);
  }
}

function samplePolyline(line, targetS) {
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    if (targetS < a.s || targetS > b.s) continue;
    const span = Math.max(1e-6, b.s - a.s);
    const t = (targetS - a.s) / span;
    let tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      tx,
      ty,
      under: a.under > 0.5 || b.under > 0.5 ? 1 : 0,
    };
  }
  return null;
}

function arcLengthPlane(points, pxToM) {
  if (!points.length) return points;
  let s = 0;
  const out = [{ x: points[0].x, y: points[0].y, s: 0 }];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    s += Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1e-6, pxToM);
    out.push({ x: b.x, y: b.y, s });
  }
  return out;
}

function pushThickPlaneLine(line, halfWidth, verts, dashVerts) {
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    let tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    const nx = -ty * halfWidth, ny = tx * halfWidth;
    const p00 = [a.x - nx, a.y - ny];
    const p10 = [a.x + nx, a.y + ny];
    const p01 = [b.x - nx, b.y - ny];
    const p11 = [b.x + nx, b.y + ny];
    verts.push(
      p00[0], p00[1], p10[0], p10[1], p11[0], p11[1],
      p00[0], p00[1], p11[0], p11[1], p01[0], p01[1],
    );
    dashVerts.push(
      p00[0], p00[1], a.s, -1, p10[0], p10[1], a.s, 1, p11[0], p11[1], b.s, 1,
      p00[0], p00[1], a.s, -1, p11[0], p11[1], b.s, 1, p01[0], p01[1], b.s, -1,
    );
  }
}

function samplePlanePolyline(line, targetS) {
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    if (targetS < a.s || targetS > b.s) continue;
    const span = Math.max(1e-6, b.s - a.s);
    const t = (targetS - a.s) / span;
    let tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      tx,
      ty,
    };
  }
  return null;
}

function positiveMod(x, m) {
  return ((x % m) + m) % m;
}
