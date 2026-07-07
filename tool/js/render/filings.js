// Instanced filing renderer. Each filing is a camera-facing quad built in
// PLANE METERS and mapped per-vertex through the cardboard homography, so
// perspective scale and foreshortening are exact. Shading is Kajiya–Kay
// (thin-fiber model): filings glint when their axis is perpendicular to the
// key light, which makes aligned arcs read as sweeping bright/dark bands.

import { compileProgram } from './gl.js';

export const FLOATS_PER = 8; // must match worker.js snapshot layout

const FILING_VS = `#version 300 es
layout(location=0) in vec2 aCorner;         // per-vertex, [-1,1]²
layout(location=1) in vec3 aPos;            // instance: x, y (plane m), z (m)
layout(location=2) in vec2 aDir;            // instance: cos, sin
layout(location=3) in vec2 aSize;           // instance: len, wid (m)
layout(location=4) in float aShade;         // instance: glint + awake*0.5

uniform mat3 uH;          // plane → image px homography
uniform vec2 uRes;        // image px
uniform vec2 uUpDir;      // image-space "up along the wire", normalized
uniform float uKUp;       // px per meter of height at the hole
uniform float uDetJHole;  // |det J| at the hole
uniform float uWidthPx;   // extra AA padding in px worth of meters (via detJ)
uniform vec2 uJitterPx;   // tap vibration offset in image px
uniform float uLiftScale; // visual-only lift multiplier for readability

out vec2 vLocal;          // meters in filing frame (along, across)
out vec2 vHalf;           // (capsule segment half-len, radius)
out vec2 vTangent;        // filing axis in image space
out float vShade;
out float vZ;

vec2 project(vec2 p, out float detJ) {
  vec3 q = uH * vec3(p, 1.0);
  vec2 px = q.xy / q.z;
  float w = q.z;
  float dudx = (uH[0][0] - px.x * uH[0][2]) / w;
  float dudy = (uH[1][0] - px.x * uH[1][2]) / w;
  float dvdx = (uH[0][1] - px.y * uH[0][2]) / w;
  float dvdy = (uH[1][1] - px.y * uH[1][2]) / w;
  detJ = abs(dudx * dvdy - dudy * dvdx);
  return px;
}

void main() {
  vec2 u = aDir;                       // axis
  vec2 nrm = vec2(-u.y, u.x);          // in-plane normal
  float r = aSize.y * 0.5;
  float hl = aSize.x * 0.5 + r;        // pad caps
  float hw = r * 2.0;                  // pad across for AA halo
  vec2 p = aPos.xy + u * (aCorner.x * hl) + nrm * (aCorner.y * hw);
  float detJ;
  vec2 px = project(p, detJ);
  // z bounce lift along image-up, scaled by local perspective depth
  float scale = sqrt(max(detJ, 1e-6) / uDetJHole);
  px += uUpDir * (aPos.z * uKUp * scale * uLiftScale) + uJitterPx;

  vLocal = vec2(aCorner.x * hl, aCorner.y * hw);
  vHalf = vec2(max(aSize.x * 0.5 - r, 1e-6), r);
  vShade = aShade;
  vZ = aPos.z;

  // axis direction in image space (for fiber lighting)
  float dj;
  vec2 px2 = project(aPos.xy + u * 0.001, dj);
  vec2 px0 = project(aPos.xy, dj);
  vTangent = normalize(px2 - px0);

  vec2 ndc = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const FILING_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vHalf;
in vec2 vTangent;
in float vShade;
in float vZ;

uniform vec3 uLightDir;      // screen space, +x right, +y DOWN, +z out
uniform vec3 uLightColor;
uniform vec3 uBaseColor;
uniform sampler2D uCardboard;
uniform vec2 uRes;
uniform float uClipToCardboard;
uniform float uLiftScale;

out vec4 fragColor;

void main() {
  // cardboard alpha clip (filings never draw past the sheet edge / off table)
  if (uClipToCardboard > 0.5) {
    vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
    if (texture(uCardboard, uv).a < 0.5) discard;
  }

  // capsule SDF in filing-local meters
  float lx = abs(vLocal.x) - vHalf.x;
  vec2 dq = vec2(max(lx, 0.0), vLocal.y);
  float d = length(dq) - vHalf.y;
  float aa = fwidth(d) + 1e-7;
  float alpha = clamp(0.5 - d / aa, 0.0, 1.0);
  if (alpha <= 0.003) discard;

  float awake = step(0.5, vShade);
  float glint = fract(vShade * 2.0) * 1.002; // decode glint seed, ~[0,1)

  // cylindrical cross-section normal
  float q = clamp(vLocal.y / vHalf.y, -1.0, 1.0);
  float nz = sqrt(max(1.0 - q * q, 0.0));

  // Kajiya–Kay: light vs fiber tangent (screen space, y down)
  vec3 T = vec3(vTangent, 0.0);
  vec3 L = normalize(uLightDir);
  float TdotL = dot(T, L);
  float sinTL = sqrt(max(1.0 - TdotL * TdotL, 0.0));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Hv = normalize(L + V);
  float TdotH = dot(T, Hv);
  float sinTH = sqrt(max(1.0 - TdotH * TdotH, 0.0));
  float shininess = mix(24.0, 90.0, glint);
  float spec = pow(sinTH, shininess) * mix(0.5, 1.6, glint);

  vec3 base = uBaseColor * mix(0.75, 1.15, glint);
  float diff = 0.25 + 0.75 * sinTL;
  vec3 col = base * diff * (0.35 + 0.65 * nz);
  col += uLightColor * spec * nz;
  col += uLightColor * 0.06 * awake;         // faint shimmer while moving
  // airborne filings catch slightly more light
  col *= 1.0 + clamp(vZ * 25.0 * uLiftScale, 0.0, 0.35);

  fragColor = vec4(col * alpha, alpha);      // premultiplied
}`;

const SHADOW_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aPos;
layout(location=2) in vec2 aDir;
layout(location=3) in vec2 aSize;
layout(location=4) in float aShade;

uniform mat3 uH;
uniform vec2 uRes;
uniform vec2 uShadowDir;     // image-space, normalized
uniform float uKUp;
uniform float uDetJHole;
uniform vec2 uJitterPx;
uniform float uLiftScale;

out vec2 vLocal;
out vec2 vHalf;
out float vSoft;

vec2 project(vec2 p, out float detJ) {
  vec3 q = uH * vec3(p, 1.0);
  vec2 px = q.xy / q.z;
  float w = q.z;
  float dudx = (uH[0][0] - px.x * uH[0][2]) / w;
  float dudy = (uH[1][0] - px.x * uH[1][2]) / w;
  float dvdx = (uH[0][1] - px.y * uH[0][2]) / w;
  float dvdy = (uH[1][1] - px.y * uH[1][2]) / w;
  detJ = abs(dudx * dvdy - dudy * dvdx);
  return px;
}

void main() {
  vec2 u = aDir;
  vec2 nrm = vec2(-u.y, u.x);
  float r = aSize.y * 0.5;
  float zLift = aPos.z * uLiftScale;
  float grow = 1.0 + clamp(zLift * 120.0, 0.0, 2.5);   // soften while airborne
  float hl = (aSize.x * 0.5 + r) * grow;
  float hw = r * 2.6 * grow;
  vec2 p = aPos.xy + u * (aCorner.x * hl) + nrm * (aCorner.y * hw);
  float detJ;
  vec2 px = project(p, detJ);
  float scale = sqrt(max(detJ, 1e-6) / uDetJHole);
  px += uShadowDir * ((0.4 + zLift * 900.0) * scale) + uJitterPx; // offset grows with z

  vLocal = vec2(aCorner.x * hl, aCorner.y * hw);
  vHalf = vec2(max(aSize.x * 0.5 - r, 1e-6) * grow, r * grow);
  vSoft = grow;

  vec2 ndc = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const SHADOW_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vHalf;
in float vSoft;
uniform sampler2D uCardboard;
uniform vec2 uRes;
uniform float uClipToCardboard;
uniform float uStrength;
out vec4 fragColor;

void main() {
  if (uClipToCardboard > 0.5) {
    vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
    if (texture(uCardboard, uv).a < 0.5) discard;
  }
  float lx = abs(vLocal.x) - vHalf.x;
  vec2 dq = vec2(max(lx, 0.0), vLocal.y);
  float d = length(dq) - vHalf.y;
  float aa = fwidth(d) * (1.0 + vSoft) + 1e-7;
  float alpha = clamp(0.5 - d / aa, 0.0, 1.0) * uStrength / vSoft;
  fragColor = vec4(0.0, 0.0, 0.0, alpha);   // premultiplied black
}`;

const LINE_VS = `#version 300 es
layout(location=0) in float aEnd;            // per-vertex, -1 or +1
layout(location=1) in vec3 aPos;             // instance: x, y (plane m), z (m)
layout(location=2) in vec2 aDir;             // instance: cos, sin
layout(location=3) in vec2 aSize;            // instance: len, wid (m)
layout(location=4) in float aShade;          // instance: glint + awake*0.5

uniform mat3 uH;
uniform vec2 uRes;
uniform vec2 uUpDir;
uniform float uKUp;
uniform float uDetJHole;
uniform vec2 uJitterPx;
uniform float uLiftScale;

out float vShade;
out float vZ;

vec2 project(vec2 p, out float detJ) {
  vec3 q = uH * vec3(p, 1.0);
  vec2 px = q.xy / q.z;
  float w = q.z;
  float dudx = (uH[0][0] - px.x * uH[0][2]) / w;
  float dudy = (uH[1][0] - px.x * uH[1][2]) / w;
  float dvdx = (uH[0][1] - px.y * uH[0][2]) / w;
  float dvdy = (uH[1][1] - px.y * uH[1][2]) / w;
  detJ = abs(dudx * dvdy - dudy * dvdx);
  return px;
}

void main() {
  float detJ;
  vec2 p = aPos.xy + aDir * (aEnd * aSize.x * 0.5);
  vec2 px = project(p, detJ);
  float scale = sqrt(max(detJ, 1e-6) / uDetJHole);
  px += uUpDir * (aPos.z * uKUp * scale * uLiftScale) + uJitterPx;

  vShade = aShade;
  vZ = aPos.z;

  vec2 ndc = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
in float vShade;
in float vZ;

uniform vec3 uLightColor;
uniform vec3 uBaseColor;
uniform sampler2D uCardboard;
uniform vec2 uRes;
uniform float uClipToCardboard;
uniform float uLiftScale;

out vec4 fragColor;

void main() {
  if (uClipToCardboard > 0.5) {
    vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
    if (texture(uCardboard, uv).a < 0.5) discard;
  }

  float awake = step(0.5, vShade);
  float glint = fract(vShade * 2.0) * 1.002;
  float lift = clamp(vZ * 40.0 * uLiftScale, 0.0, 0.32);
  vec3 col = uBaseColor * mix(0.72, 1.2, glint);
  col += uLightColor * (0.06 + 0.18 * glint + lift);
  col += uLightColor * 0.05 * awake;
  float alpha = mix(0.82, 1.0, awake);
  fragColor = vec4(col * alpha, alpha);
}`;

export class FilingRenderer {
  constructor(gl, maxN) {
    this.gl = gl;
    this.maxN = maxN;
    this.prog = compileProgram(gl, FILING_VS, FILING_FS);
    this.shadowProg = compileProgram(gl, SHADOW_VS, SHADOW_FS);
    this.lineProg = compileProgram(gl, LINE_VS, LINE_FS);
    this.count = 0;
    this.buildVAOs();
    this.u = uniformMap(gl, this.prog,
      ['uH', 'uRes', 'uUpDir', 'uKUp', 'uDetJHole', 'uLightDir', 'uLightColor',
       'uBaseColor', 'uCardboard', 'uClipToCardboard', 'uJitterPx', 'uLiftScale']);
    this.su = uniformMap(gl, this.shadowProg,
      ['uH', 'uRes', 'uShadowDir', 'uKUp', 'uDetJHole', 'uCardboard',
       'uClipToCardboard', 'uStrength', 'uJitterPx', 'uLiftScale']);
    this.lu = uniformMap(gl, this.lineProg,
      ['uH', 'uRes', 'uUpDir', 'uKUp', 'uDetJHole', 'uLightColor',
       'uBaseColor', 'uCardboard', 'uClipToCardboard', 'uJitterPx',
       'uLiftScale']);
  }

  buildVAOs() {
    const gl = this.gl;
    this.cornerBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.maxN * FLOATS_PER * 4, gl.DYNAMIC_DRAW);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    const stride = FLOATS_PER * 4;
    setupInst(gl, 1, 3, stride, 0);    // aPos: x, y, z
    setupInst(gl, 2, 2, stride, 12);   // aDir: cos, sin
    setupInst(gl, 3, 2, stride, 20);   // aSize: len, wid
    setupInst(gl, 4, 1, stride, 28);   // aShade
    gl.bindVertexArray(null);

    this.lineBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1]), gl.STATIC_DRAW);

    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    setupInst(gl, 1, 3, stride, 0);    // aPos: x, y, z
    setupInst(gl, 2, 2, stride, 12);   // aDir: cos, sin
    setupInst(gl, 3, 2, stride, 20);   // aSize: len, wid
    setupInst(gl, 4, 1, stride, 28);   // aShade
    gl.bindVertexArray(null);
  }

  upload(f32, count) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, f32, 0, count * FLOATS_PER);
    this.count = count;
  }

  // opts: {H, res, upDir, kUp, detJHole, lightDir, lightColor, baseColor,
  //        cardboardTex, clip, shadowDir, shadowStrength}
  drawShadows(o) {
    if (!this.count) return;
    const gl = this.gl;
    gl.useProgram(this.shadowProg);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix3fv(this.su.uH, false, o.H);
    gl.uniform2f(this.su.uRes, o.res[0], o.res[1]);
    gl.uniform2f(this.su.uShadowDir, o.shadowDir[0], o.shadowDir[1]);
    gl.uniform1f(this.su.uKUp, o.kUp);
    gl.uniform1f(this.su.uDetJHole, o.detJHole);
    gl.uniform1f(this.su.uStrength, o.shadowStrength ?? 0.28);
    gl.uniform1f(this.su.uClipToCardboard, o.clip ? 1 : 0);
    gl.uniform2f(this.su.uJitterPx, o.jitterPx[0], o.jitterPx[1]);
    gl.uniform1f(this.su.uLiftScale, o.liftScale ?? 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, o.cardboardTex);
    gl.uniform1i(this.su.uCardboard, 1);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.bindVertexArray(null);
  }

  drawFilings(o) {
    if (!this.count) return;
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix3fv(this.u.uH, false, o.H);
    gl.uniform2f(this.u.uRes, o.res[0], o.res[1]);
    gl.uniform2f(this.u.uUpDir, o.upDir[0], o.upDir[1]);
    gl.uniform1f(this.u.uKUp, o.kUp);
    gl.uniform1f(this.u.uDetJHole, o.detJHole);
    gl.uniform3fv(this.u.uLightDir, o.lightDir);
    gl.uniform3fv(this.u.uLightColor, o.lightColor);
    gl.uniform3fv(this.u.uBaseColor, o.baseColor);
    gl.uniform1f(this.u.uClipToCardboard, o.clip ? 1 : 0);
    gl.uniform2f(this.u.uJitterPx, o.jitterPx[0], o.jitterPx[1]);
    gl.uniform1f(this.u.uLiftScale, o.liftScale ?? 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, o.cardboardTex);
    gl.uniform1i(this.u.uCardboard, 1);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.bindVertexArray(null);
  }

  drawLines(o) {
    if (!this.count) return;
    const gl = this.gl;
    gl.useProgram(this.lineProg);
    gl.bindVertexArray(this.lineVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.lineWidth(1);
    gl.uniformMatrix3fv(this.lu.uH, false, o.H);
    gl.uniform2f(this.lu.uRes, o.res[0], o.res[1]);
    gl.uniform2f(this.lu.uUpDir, o.upDir[0], o.upDir[1]);
    gl.uniform1f(this.lu.uKUp, o.kUp);
    gl.uniform1f(this.lu.uDetJHole, o.detJHole);
    gl.uniform3fv(this.lu.uLightColor, o.lightColor);
    gl.uniform3fv(this.lu.uBaseColor, o.baseColor);
    gl.uniform1f(this.lu.uClipToCardboard, o.clip ? 1 : 0);
    gl.uniform2f(this.lu.uJitterPx, o.jitterPx[0], o.jitterPx[1]);
    gl.uniform1f(this.lu.uLiftScale, o.liftScale ?? 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, o.cardboardTex);
    gl.uniform1i(this.lu.uCardboard, 1);
    gl.drawArraysInstanced(gl.LINES, 0, 2, this.count);
    gl.bindVertexArray(null);
  }
}

function setupInst(gl, loc, size, stride, offset) {
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  gl.vertexAttribDivisor(loc, 1);
}

function uniformMap(gl, prog, names) {
  const m = {};
  for (const n of names) m[n] = gl.getUniformLocation(prog, n);
  return m;
}
