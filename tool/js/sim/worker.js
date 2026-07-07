// Simulation worker. Owns the Engine; the main thread talks to it with a
// small message protocol and receives render snapshots as transferable
// Float32Array buffers (zero copy, double buffered).
//
// Render buffer layout, 8 floats per filing:
//   [x, y, z, cos(ang), sin(ang), len, wid, shade]
// shade packs glintSeed in [0, 0.5) plus 0.5 if the filing is awake.

import { Engine } from './engine.js';
import { TimelineRunner } from './timeline.js';
import { ASLEEP } from './particles.js';
import { DEFAULT_PARAMS } from './units.js';

const FLOATS_PER = 8;

let engine = null;
let timeline = null;
let buffers = [];         // returned transfer buffers available for reuse
let simAccum = 0;         // interactive: leftover wall time not yet simulated
let previewStride = 4;    // interactive snapshots draw every Nth filing

function ensureBuffer(n) {
  const need = Math.max(1, n) * FLOATS_PER * 4;
  for (let k = 0; k < buffers.length; k++) {
    if (buffers[k].byteLength >= need) return buffers.splice(k, 1)[0];
  }
  return new ArrayBuffer(Math.ceil(need * 1.5));
}

function snapshot(stride = 1) {
  const st = engine.st, n = st.n;
  const safeStride = Math.max(1, stride | 0);
  const drawn = Math.ceil(n / safeStride);
  const buf = ensureBuffer(drawn);
  const f = new Float32Array(buf, 0, drawn * FLOATS_PER);
  for (let i = 0, o = 0; i < n; i += safeStride, o += FLOATS_PER) {
    f[o] = st.px[i];
    f[o + 1] = st.py[i];
    f[o + 2] = st.pz[i];
    f[o + 3] = Math.cos(st.ang[i]);
    f[o + 4] = Math.sin(st.ang[i]);
    f[o + 5] = st.len[i];
    f[o + 6] = st.wid[i];
    f[o + 7] = st.glint[i] * 0.499 + (st.state[i] === ASLEEP ? 0 : 0.5);
  }
  return { buf, n: drawn, total: n, stride: safeStride };
}

function stepAndReply(dt, nSub, kind, stride = 1) {
  // dispatch timeline events at substep boundaries for determinism;
  // neighbor cache rebuilt at frame start, on dirty, and every 8 substeps
  let tNb = 0, tSub = 0, t0;
  if (nSub > 0) {
    t0 = performance.now();
    engine.buildNeighbors();
    tNb += performance.now() - t0;
  }
  for (let s = 0; s < nSub; s++) {
    timeline.dispatchUpTo(engine.time);
    if (engine.nbDirty || (s > 0 && s % 8 === 0)) {
      t0 = performance.now();
      engine.buildNeighbors();
      tNb += performance.now() - t0;
    }
    t0 = performance.now();
    engine.substep(dt);
    tSub += performance.now() - t0;
  }
  timeline.dispatchUpTo(engine.time);
  const { buf, n, total, stride: renderStride } = snapshot(stride);
  postMessage({
    type: kind,
    buffer: buf,
    count: n,
    total,
    renderStride,
    time: engine.time,
    current: engine.field.Iz,
    awake: engine.awakeCount,
    tapAge: engine.time - engine.lastTapTime,
    tapStrength: engine.lastTapStrength,
    tapSerial: engine.tapSerial,
    nSub,
    tNb: +tNb.toFixed(1),
    tSub: +tSub.toFixed(1),
  }, [buf]);
}

onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      engine = new Engine({ ...DEFAULT_PARAMS, ...m.params });
      timeline = new TimelineRunner(engine);
      if (m.timeline) timeline.load(m.timeline);
      engine.reset(m.params?.seed ?? DEFAULT_PARAMS.seed);
      simAccum = 0;
      postMessage({ type: 'ready' });
      break;

    case 'reset':
      if (m.params) engine.setParams(m.params);
      engine.reset(m.seed ?? engine.p.seed);
      timeline.reset();
      if (m.timeline) timeline.load(m.timeline);
      simAccum = 0;
      postMessage({ type: 'resetDone' });
      break;

    case 'params':
      engine.setParams(m.patch);
      break;

    case 'timeline':
      timeline.load(m.events);
      break;

    case 'renderOptions':
      previewStride = Math.max(1, Math.min(16, m.previewStride | 0));
      break;

    // interactive: advance by wall dt quantized into fixed substeps
    case 'tick': {
      const dt = engine.p.dtInteractive;
      simAccum = Math.min(simAccum + Math.min(m.dt, 0.1), 0.035); // bounded lag
      let nSub = Math.floor(simAccum / dt);
      if (m.paused) nSub = 0;
      const maxSub = 24; // keep the UI responsive; sim time lags under load
      nSub = Math.min(nSub, maxSub);
      simAccum -= nSub * dt;
      stepAndReply(dt, nSub, 'frame', previewStride);
      break;
    }

    // offline recording: advance EXACTLY frameDt seconds in nSub fixed steps
    case 'stepFrame': {
      const dt = m.frameDt / m.nSub;
      stepAndReply(dt, m.nSub, 'frameStepped', m.renderStride ?? 1);
      break;
    }

    // live one-off actions (also mirrored into the UI's timeline when logging)
    case 'sprinkle': engine.doSprinkle(m.opts); break;
    case 'clearFilings': engine.doClear(); break;
    case 'current': engine.doCurrent(m.opts); break;
    case 'tap': engine.doTap(m.opts); break;

    case 'returnBuffer':
      buffers.push(m.buffer);
      if (buffers.length > 4) buffers.length = 4;
      break;

    // physics verification: tangential-alignment statistics by radius
    case 'probe': {
      const st = engine.st, p = engine.p;
      const bins = 12, rMax = 0.14;
      const sum = new Float64Array(bins), cnt = new Int32Array(bins);
      for (let i = 0; i < st.n; i++) {
        const dx = st.px[i] - p.holeX, dy = st.py[i] - p.holeY;
        const r = Math.hypot(dx, dy);
        const b = Math.floor(r / rMax * bins);
        if (b >= bins) continue;
        // tangent direction = (-dy, dx)/r ; alignment = |û · t̂|
        const tx = -dy / r, ty = dx / r;
        sum[b] += Math.abs(st.ux[i] * tx + st.uy[i] * ty);
        cnt[b]++;
      }
      const out = [];
      for (let b = 0; b < bins; b++) {
        out.push({
          rMm: Math.round((b + 0.5) / bins * rMax * 1000),
          n: cnt[b],
          align: cnt[b] ? +(sum[b] / cnt[b]).toFixed(3) : null,
        });
      }
      postMessage({ type: 'probeResult', bins: out, time: engine.time });
      break;
    }
  }
};
