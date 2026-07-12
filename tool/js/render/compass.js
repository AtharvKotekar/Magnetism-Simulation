// Compass prop for the Oersted stage: an antique compass lying on the
// cardboard whose needle deflects with the net in-plane field. The body,
// needle and drop shadow are pre-baked top-down renders of the film's 3D
// models (tool/assets/compass-*.png), all dial-centered so the needle
// pivots exactly on the rose hub. Each layer is a homography-warped quad,
// so the prop sits in the board's perspective like set dressing.
import { compileProgram, loadTexture } from './gl.js?v=coil-v51';

const VS = `#version 300 es
layout(location=0) in vec2 aPos;   // keyframe image px
layout(location=1) in vec2 aUV;
uniform vec2 uRes;
out vec2 vUV;
void main() {
  vec2 ndc = (aPos / uRes) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  vUV = aUV;
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec4 uTint;                // rgb multiplier, alpha multiplier
out vec4 frag;
void main() {
  vec4 c = texture(uTex, vUV);     // premultiplied alpha
  frag = vec4(c.rgb * uTint.rgb, c.a) * uTint.a;
}`;

// All sprites come from the film's Compass.svg layers, composited on one
// shared canvas with the pivot at the center — so every layer draws at the
// SAME quad size and stays registered.
const NEEDLE_SCALE = 1.0;

export class CompassOverlay {
  constructor(gl, assetsBase = 'assets/') {
    this.gl = gl;
    this.base = assetsBase;
    this.prog = compileProgram(gl, VS, FS);
    this.uRes = gl.getUniformLocation(this.prog, 'uRes');
    this.uTex = gl.getUniformLocation(this.prog, 'uTex');
    this.uTint = gl.getUniformLocation(this.prog, 'uTint');
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, 16 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
    this.ready = false;
  }

  async load() {
    const gl = this.gl;
    // The ?v tag matters: sprite CONTENT changes between deploys while the
    // filenames stay the same, so without it browsers keep serving stale
    // cached PNGs long after the code updates (Pages caches for 10 min).
    const tag = '?v=coil-v51';
    const [body, needle, mount, shadow] = await Promise.all([
      loadTexture(gl, this.base + 'compass-body.png' + tag),     // case + dial
      loadTexture(gl, this.base + 'compass-needle.png' + tag),   // needle alone
      loadTexture(gl, this.base + 'compass-mount.png' + tag),    // pivot cap + glass
      loadTexture(gl, this.base + 'compass-shadow.png' + tag),
    ]);
    this.body = body; this.needle = needle; this.mount = mount; this.shadow = shadow;
    this.ready = true;
  }

  // one homography-warped quad: center/halfSize in plane meters, rot is the
  // clockwise needle angle (0 = sprite "up" = board north)
  drawQuad(tex, homog, res, cx, cy, half, rot, tint) {
    const gl = this.gl;
    const c = Math.cos(rot), s = Math.sin(rot);
    const data = new Float32Array(16);
    // TL, TR, BL, BR (triangle strip), uv y=0 at the sprite top
    const local = [[-half, -half, 0, 0], [half, -half, 1, 0],
                   [-half, half, 0, 1], [half, half, 1, 1]];
    for (let i = 0; i < 4; i++) {
      const [lx, ly, u, v] = local[i];
      const rx = c * lx - s * ly, ry = s * lx + c * ly;
      const p = homog.toImage(cx + rx, cy + ry);
      data[i * 4] = p[0]; data[i * 4 + 1] = p[1];
      data[i * 4 + 2] = u; data[i * 4 + 3] = v;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uRes, res[0], res[1]);
    gl.uniform4f(this.uTint, tint[0], tint[1], tint[2], tint[3]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex.tex);
    gl.uniform1i(this.uTex, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  // opts: { homog, res, center:[X,Y] m, size (body diameter, m), angle (rad) }
  draw(opts) {
    if (!this.ready) return;
    const { homog, res, center, size, angle } = opts;
    const half = size / 2;
    const nHalf = half * NEEDLE_SCALE;
    // drop shadow, cast down-right like the keyframe's light
    this.drawQuad(this.shadow, homog, res,
      center[0] + size * 0.045, center[1] + size * 0.075, half, 0, [1, 1, 1, 1]);
    // dial stays fixed; the needle (and its cast shadow) rotates; the pivot
    // cap and the glass sheen sit STATIC above everything.
    this.drawQuad(this.body, homog, res, center[0], center[1], half, 0, [1, 1, 1, 1]);
    this.drawQuad(this.needle, homog, res,
      center[0] + size * 0.010, center[1] + size * 0.016, nHalf, angle, [0, 0, 0, 0.30]);
    this.drawQuad(this.needle, homog, res, center[0], center[1], nHalf, angle, [1, 1, 1, 1]);
    this.drawQuad(this.mount, homog, res, center[0], center[1], nHalf, 0, [1, 1, 1, 1]);
  }
}
