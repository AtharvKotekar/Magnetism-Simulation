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
    // Optional alternate keyframe shown while the current runs the other
    // way (e.g. the coil scene with the cell physically flipped).
    this.reverseBase = opts.reverseBase || null;
    // Optional multi-turn conductor bundles: { 2: {src, rect}, 3: {src, rect} }.
    // Drawn instead of the base occluder; each bundle covers the arch baked
    // into the keyframe with its outermost tube.
    this.turnOverlays = opts.turnOverlays || null;
    // Optional static underlay {src, rect} drawn between the base scene and
    // the filings (e.g. the bar magnet's shadowed base plate on the paper).
    this.underlay = opts.underlay || null;
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
    this.sceneReverse = null;
    if (this.reverseBase) {
      try {
        this.sceneReverse = await loadTexture(gl, this.reverseBase);
      } catch {
        this.sceneReverse = null;   // optional — fall back to the base keyframe
      }
    }
    this.underTex = null;
    if (this.underlay) {
      try {
        this.underTex = await loadTexture(gl, this.underlay.src);
      } catch {
        this.underTex = null;
      }
    }
    this.turnTex = {};
    if (this.turnOverlays) {
      for (const k of Object.keys(this.turnOverlays)) {
        try {
          this.turnTex[k] = await loadTexture(gl, this.turnOverlays[k].src);
        } catch {
          // missing bundle — that turn count falls back to the single coil
        }
      }
    }
    this.W = this.scene.width;
    this.H = this.scene.height;
  }

  occluderFor(turns = 1) {
    const cfg = this.turnOverlays?.[turns];
    if (turns > 1 && cfg && this.turnTex[turns]) {
      return { tex: this.turnTex[turns].tex, rect: cfg.rect };
    }
    return { tex: this.occluder.tex, rect: this.occluderRect };
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

  drawScene(reverse = false) {
    const gl = this.gl;
    const tex = reverse && this.sceneReverse ? this.sceneReverse.tex : this.scene.tex;
    gl.disable(gl.BLEND);
    this.drawQuad(tex, [0, 0, this.W, this.H]);
    gl.enable(gl.BLEND);
    if (this.underTex && this.underlay?.rect) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.drawQuad(this.underTex.tex, this.underlay.rect);
    }
  }

  drawOccluder(turns = 1, opacity = 1) {
    if (opacity <= 0) return;
    const gl = this.gl;
    const { tex, rect } = this.occluderFor(turns);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.drawQuad(tex, rect, opacity);
  }

  // For the filings-only alpha pass: punch the occluder's silhouette OUT of
  // whatever is already drawn (dst *= 1 − occluder.α), so filings behind the
  // wire stay hidden when the film team composites the alpha sequence.
  drawOccluderEraser(turns = 1) {
    const gl = this.gl;
    const { tex, rect } = this.occluderFor(turns);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    this.drawQuad(tex, rect);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}
