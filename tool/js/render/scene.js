// Scene layers: the film keyframe (image0) and the crossbar+wire occluder
// (image2) drawn at its exact documented placement from BASE.svg.
// The cardboard cutout (image1) is bound as an alpha mask for the filing pass.

import { compileProgram, loadTexture, unitQuadVAO } from './gl.js';

const VS = `#version 300 es
layout(location=0) in vec2 aPos;      // unit quad [0,1]²
uniform vec4 uRect;                   // x, y, w, h in image px
uniform vec2 uRes;                    // canvas px
uniform vec2 uJitterPx;               // tap vibration offset in image px
out vec2 vUV;
void main() {
  vUV = aPos;
  vec2 px = uRect.xy + aPos * uRect.zw + uJitterPx;
  vec2 ndc = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uOpacity;
out vec4 fragColor;
void main() {
  vec4 c = texture(uTex, vUV);
  fragColor = c * uOpacity;           // premultiplied alpha
}`;

// image2 placement decoded from BASE.svg's pattern transform:
// scale 0.5 at pixel offset (1244, 313) → rect 1508×599.
export const OCCLUDER_RECT = [1243.998, 313.0, 3016 * 0.5, 1198 * 0.5];

export class SceneLayers {
  constructor(gl, opts = {}) {
    this.gl = gl;
    this.assetsBase = opts.assetsBase || 'assets/';
    this.occluderRect = opts.occluderRect || OCCLUDER_RECT;
    this.prog = compileProgram(gl, VS, FS);
    this.vao = unitQuadVAO(gl);
    this.uRect = gl.getUniformLocation(this.prog, 'uRect');
    this.uRes = gl.getUniformLocation(this.prog, 'uRes');
    this.uJitterPx = gl.getUniformLocation(this.prog, 'uJitterPx');
    this.uTex = gl.getUniformLocation(this.prog, 'uTex');
    this.uOpacity = gl.getUniformLocation(this.prog, 'uOpacity');
    this.jitterPx = [0, 0];
  }

  setJitter(jitterPx) {
    this.jitterPx = jitterPx || [0, 0];
  }

  async load() {
    const gl = this.gl;
    [this.scene, this.cardboard, this.occluder] = await Promise.all([
      loadTexture(gl, `${this.assetsBase}image0.png`),
      loadTexture(gl, `${this.assetsBase}image1.png`),
      loadTexture(gl, `${this.assetsBase}image2.png`),
    ]);
    this.W = this.scene.width;
    this.H = this.scene.height;
  }

  drawQuad(tex, rect, opacity = 1) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.uTex, 0);
    gl.uniform4f(this.uRect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform2f(this.uRes, this.W, this.H);
    gl.uniform2f(this.uJitterPx, this.jitterPx[0], this.jitterPx[1]);
    gl.uniform1f(this.uOpacity, opacity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  drawScene() {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    this.drawQuad(this.scene.tex, [0, 0, this.W, this.H]);
    gl.enable(gl.BLEND);
  }

  drawOccluder() {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.drawQuad(this.occluder.tex, this.occluderRect);
  }

  // For the filings-only alpha pass: punch the occluder's silhouette OUT of
  // whatever is already drawn (dst *= 1 − occluder.α), so filings behind the
  // wire stay hidden when the film team composites the alpha sequence.
  drawOccluderEraser() {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    this.drawQuad(this.occluder.tex, this.occluderRect);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}
