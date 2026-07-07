// Magnetism Stage — orchestrator. Owns the worker, the render stack, the UI
// state, and the interactive/record loops.

import { createGL } from './render/gl.js';
import { SceneLayers } from './render/scene.js';
import { FilingRenderer, FLOATS_PER } from './render/filings.js';
import { Overlays } from './render/overlays.js';
import { Homography, loadCalibration, saveCalibration } from './render/homography.js';
import { CalibrationUI } from './ui/calibration.js';
import { buildPanel, diagnosticsHTML } from './ui/panel.js';
import { TimelineUI } from './ui/timelineui.js';
import { PRESETS } from './ui/presets.js';
import { Recorder } from './record/recorder.js';
import { DEFAULT_PARAMS } from './sim/units.js';

const app = {
  params: { ...DEFAULT_PARAMS },
  cal: loadCalibration(),
  timeline: [],
  takeDuration: 9,
  takeHash: '—',
  paused: false,
  recording: false,
  ui: {
    currentOn: false,
    showIndicator: true,
    showFieldLines: false,
    clipToCardboard: true,
    calibrationMode: false,
    renderStyle: 'line',
    filingVisibility: 1.25,
    filingThickness: 0.68,
    previewStride: 1,
    previewShadows: false,
    liftScale: 4,
    tapVibration: true,
    recFormat: 'mp4',
    recFps: 24,
    recDuration: 9,
    recScale: 1,
    recSubsteps: 1,
    recRenderStyle: 'line',
    recStride: 1,
    recShadows: false,
    recIncludeIndicator: false,
    logLive: false,
  },
  stats: { time: 0, current: 0, count: 0, rendered: 0, awake: 0, fps: 0, stepMs: 0 },
  el: {},
};
window.app = app; // console access for debugging

// ---------- boot ----------

async function boot() {
  app.canvas = document.getElementById('gl-canvas');
  const gl = createGL(app.canvas);
  app.gl = gl;

  app.scene = new SceneLayers(gl);
  await app.scene.load();
  app.filings = new FilingRenderer(gl, app.params.maxParticles);
  app.overlays = new Overlays(gl);
  app.overlays.buildGrid(app.cal.sheetW, app.cal.sheetH);

  rebuildHomography();

  // worker
  app.worker = new Worker(new URL('./sim/worker.js', import.meta.url), { type: 'module' });
  app.worker.onmessage = onWorkerMessage;
  await workerReady();
  pushRenderOptions();

  // ui
  buildPanel(document.getElementById('panel'), app);
  app.timelineUI = new TimelineUI(app);
  app.calUI = new CalibrationUI(app.canvas, document.getElementById('pin-layer'), app.cal,
    () => calibrationChanged(false));
  app.recorder = new Recorder(app);
  bindTopbar();

  // default take
  loadPreset(PRESETS[0]);

  requestAnimationFrame(tick);
}

function workerReady() {
  return new Promise((res) => {
    pendingReady = res;
    app.worker.postMessage({ type: 'init', params: simParams(), timeline: app.timeline });
  });
}

let pendingReady = null;
let pendingReset = null;
let pendingFrame = null;   // resolver for stepFrame during recording
let tickInFlight = false;
let lastFrameData = null;
let lastTickTime = performance.now();
let fpsSmooth = 0;
let stepStart = 0;

function onWorkerMessage(e) {
  const m = e.data;
  switch (m.type) {
    case 'ready': pendingReady?.(); pendingReady = null; break;
    case 'resetDone': pendingReset?.(); pendingReset = null; break;
    case 'frame': {
      tickInFlight = false;
      app.stats.stepMs = performance.now() - stepStart;
      handleFrame(m);
      if (!app.recording) {
        drawFrame(m, {});
        updateStats(m);
      }
      break;
    }
    case 'frameStepped': {
      handleFrame(m);
      updateStats(m);
      pendingFrame?.(m);
      pendingFrame = null;
      break;
    }
  }
}

function handleFrame(m) {
  const f32 = new Float32Array(m.buffer, 0, m.count * FLOATS_PER);
  app.filings.upload(f32, m.count);
  app.worker.postMessage({ type: 'returnBuffer', buffer: m.buffer }, [m.buffer]);
  app.stats.time = m.time;
  app.stats.current = m.current;
  app.stats.count = m.total ?? m.count;
  app.stats.rendered = m.count;
  app.stats.awake = m.awake;
  lastFrameData = m;
}

// ---------- interactive loop ----------

function tick(now) {
  requestAnimationFrame(tick);
  if (app.recording) return;
  const dt = Math.min(0.1, (now - lastTickTime) / 1000);
  if (!tickInFlight) {
    lastTickTime = now;
    tickInFlight = true;
    stepStart = performance.now();
    app.worker.postMessage({ type: 'tick', dt, paused: app.paused });
    const inst = 1000 / Math.max(1, now - (tick._last ?? now - 16));
    fpsSmooth = fpsSmooth * 0.95 + inst * 0.05;
    tick._last = now;
  }
}

// ---------- rendering ----------

function rebuildHomography() {
  const c = app.cal;
  app.homog = new Homography(
    { tl: c.corners.tl, tr: c.corners.tr, br: c.corners.br, bl: c.corners.bl },
    c.sheetW, c.sheetH);
  app.glH = app.homog.glMat3();
  // hole position in plane coords (physics origin for the wire)
  const hp = app.homog.toPlane(c.hole[0], c.hole[1]);
  app.holePlane = hp;
  // vertical scale: px per meter of height at the hole
  const dx = c.wireTop[0] - c.hole[0], dy = c.wireTop[1] - c.hole[1];
  const wireLenPx = Math.hypot(dx, dy) || 1;
  app.kUp = wireLenPx / (c.wireHeight || 0.3);
  app.upDir = [dx / wireLenPx, dy / wireLenPx];
  app.detJHole = app.homog.jacobianDet(hp[0], hp[1]);
  app.overlays.buildFieldLines(hp[0], hp[1], Math.min(c.sheetW, c.sheetH) * 0.42);
}

function drawOpts(m, { alphaOnly = false, renderStyle = app.ui.renderStyle, shadows = app.ui.previewShadows } = {}) {
  const jitterPx = alphaOnly ? [0, 0] : tapJitterPx(m);
  return {
    H: app.glH,
    res: [app.canvas.width, app.canvas.height],
    upDir: app.upDir,
    kUp: app.kUp,
    detJHole: app.detJHole,
    lightDir: [0.55, -0.62, 0.56],
    lightColor: [1.0, 0.85, 0.63],
    baseColor: [0.17, 0.165, 0.17],
    cardboardTex: app.scene.cardboard.tex,
    clip: app.ui.clipToCardboard,
    jitterPx,
    liftScale: app.ui.liftScale,
    filingVisibility: app.ui.filingVisibility,
    filingThickness: app.ui.filingThickness,
    shadowDir: [-0.66, 0.75],
    shadowStrength: 0.28,
    renderStyle,
    shadows,
  };
}

function tapJitterPx(m) {
  if (!app.ui.tapVibration || !m || m.tapAge == null) return [0, 0];
  const age = m.tapAge;
  if (age < 0 || age > 0.28) return [0, 0];
  const env = Math.exp(-age * 10) * (1 - age / 0.28);
  const amp = Math.min(7, 0.58 * (m.tapStrength || app.params.tapStrength)) * env;
  const x = Math.sin(age * Math.PI * 2 * 37) * amp * 0.34 +
    Math.sin(age * Math.PI * 2 * 71) * amp * 0.12;
  const y = Math.sin(age * Math.PI * 2 * 46) * amp;
  return [x, y];
}

function drawFrame(m, {
  recording = false,
  indicator = null,
  alphaOnly = false,
  renderStyle = recording ? app.ui.recRenderStyle : app.ui.renderStyle,
  shadows = recording ? app.ui.recShadows : app.ui.previewShadows,
} = {}) {
  const gl = app.gl;
  gl.viewport(0, 0, app.canvas.width, app.canvas.height);
  const o = drawOpts(m, { alphaOnly, renderStyle, shadows });
  app.scene.setJitter(o.jitterPx);
  const drawFilings = () => {
    if (o.renderStyle === 'line') app.filings.drawLines(o);
    else app.filings.drawFilings(o);
  };

  if (alphaOnly) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (o.shadows) app.filings.drawShadows(o);
    drawFilings();
    app.scene.drawOccluderEraser();
    return;
  }

  app.scene.drawScene();
  if (o.shadows) app.filings.drawShadows(o);
  drawFilings();
  app.scene.drawOccluder();

  const showInd = indicator !== null ? indicator : (app.ui.showIndicator && !recording);
  if (showInd) {
    app.overlays.drawCurrentDashes({
      res: o.res,
      time: m?.time ?? 0,
      dir: m?.current ?? 0,
      currentFrac: (m?.current ?? 0) / 20,
      cardboardTex: app.scene.cardboard.tex,
    });
  }
  if (!recording && app.ui.showFieldLines && Math.abs(m?.current ?? 0) > 0.5) {
    app.overlays.drawFieldLines({ H: o.H, res: o.res, intensity: Math.min(1, Math.abs(m.current) / 20) });
  }
  if (!recording && app.ui.calibrationMode) {
    app.overlays.drawGrid({ H: o.H, res: o.res });
  }
}
app.drawFrame = (snap, opts) => drawFrame(snap, opts);

// ---------- stats / diagnostics ----------

function updateStats(m) {
  app.stats.fps = fpsSmooth;
  setText('stat-time', `t = ${m.time.toFixed(2)} s`);
  setText('stat-current', `I = ${m.current.toFixed(1)} A`);
  const total = m.total ?? m.count;
  const stride = m.renderStride ?? 1;
  setText('stat-count', stride > 1
    ? `${total.toLocaleString()} filings · 1/${stride} preview`
    : `${total.toLocaleString()} filings`);
  setText('stat-awake', `${m.awake.toLocaleString()} awake`);
  setText('stat-fps', `${fpsSmooth.toFixed(0)} fps`);
  if ((updateStats._n = (updateStats._n || 0) + 1) % 15 === 0) refreshDiagnostics();
}

function refreshDiagnostics() {
  if (app.el.diag) app.el.diag.innerHTML = diagnosticsHTML(app, app.stats);
}
app.refreshDiagnostics = refreshDiagnostics;

function setText(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; }

// ---------- worker actions (live + take control) ----------

function simParams() {
  return {
    ...app.params,
    holeX: app.holePlane[0],
    holeY: app.holePlane[1],
    sheetW: app.cal.sheetW,
    sheetH: app.cal.sheetH,
    holeWallR: app.cal.holeWallR,
  };
}

app.pushParams = (patch) => app.worker.postMessage({ type: 'params', patch });

function pushRenderOptions() {
  if (!app.worker) return;
  app.worker.postMessage({ type: 'renderOptions', previewStride: app.ui.previewStride });
}
app.pushRenderOptions = pushRenderOptions;

app.liveCurrent = () => {
  const p = app.params;
  const opts = app.ui.currentOn
    ? { on: true, amp: p.currentA, mode: p.currentMode, freq: p.acFreq, rampDur: p.rampDur }
    : { on: false, rampDur: p.rampDur };
  app.worker.postMessage({ type: 'current', opts });
  logLive({ type: 'current', ...opts });
};

app.liveTap = () => {
  app.worker.postMessage({ type: 'tap', opts: { strength: app.params.tapStrength } });
  logLive({ type: 'tap', strength: app.params.tapStrength });
};

app.liveTapBurst = (n) => {
  let k = 0;
  const iv = setInterval(() => {
    app.worker.postMessage({ type: 'tap', opts: { strength: app.params.tapStrength } });
    if (++k >= n) clearInterval(iv);
  }, 450);
  logLive({ type: 'tapBurst', n, interval: 0.45, strength: app.params.tapStrength });
};

app.liveSprinkle = () => {
  const p = app.params;
  const opts = { count: p.sprinkleCount, pattern: p.sprinklePattern, radius: p.sprinkleR, clump: p.sprinkleClump };
  app.worker.postMessage({ type: 'sprinkle', opts });
  logLive({ type: 'sprinkle', ...opts });
};

app.liveClear = () => {
  app.worker.postMessage({ type: 'clearFilings' });
  logLive({ type: 'clear' });
};

function logLive(ev) {
  if (!app.ui.logLive || app.recording) return;
  app.timeline.push({ t: Math.round(app.stats.time * 10) / 10, ...ev });
  timelineChanged(false);
}

// ---------- take control ----------

app.resetTake = () => new Promise((res) => {
  pendingReset = res;
  app.worker.postMessage({
    type: 'reset', seed: app.params.seed, params: simParams(), timeline: app.timeline,
  });
});

app.stepFrame = (frameDt, nSub, renderStride = 1) => new Promise((res) => {
  pendingFrame = res;
  app.worker.postMessage({ type: 'stepFrame', frameDt, nSub, renderStride });
});

function restartTake() {
  app.ui.currentOn = false;
  syncCurrentSwitch();
  app.resetTake();
}

function loadPreset(p) {
  app.timeline = structuredClone(p.timeline);
  if (p.params) Object.assign(app.params, p.params);
  app.takeDuration = p.duration;
  app.ui.recDuration = p.duration;
  app.ui.currentOn = false;
  syncCurrentSwitch();
  buildPanel(document.getElementById('panel'), app); // reflect new params
  timelineChanged(true);
}
app.loadPreset = loadPreset;

function syncCurrentSwitch() {
  const sw = app.el.currentSwitch;
  if (!sw) return;
  sw.classList.toggle('on', app.ui.currentOn);
  sw.querySelector('.sw-label').textContent = app.ui.currentOn ? 'CURRENT ON' : 'CURRENT OFF';
}

function timelineChanged(restart = true) {
  app.timelineUI.render();
  refreshTakeHash();
  if (restart) restartTake();
  else app.worker.postMessage({ type: 'timeline', events: app.timeline });
}
app.timelineChanged = timelineChanged;

function refreshTakeHash() {
  const s = JSON.stringify({ seed: app.params.seed, p: app.params, tl: app.timeline, cal: app.cal });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  app.takeHash = h.toString(16).padStart(8, '0');
  setText('take-hash', `take #${app.takeHash}`);
}
app.refreshTakeHash = refreshTakeHash;

// ---------- calibration ----------

function calibrationChanged(rebuildPanelToo = true) {
  rebuildHomography();
  saveCalibration(app.cal);
  app.overlays.buildGrid(app.cal.sheetW, app.cal.sheetH);
  app.pushParams({
    holeX: app.holePlane[0], holeY: app.holePlane[1],
    sheetW: app.cal.sheetW, sheetH: app.cal.sheetH, holeWallR: app.cal.holeWallR,
  });
  refreshTakeHash();
}
app.calibrationChanged = calibrationChanged;

app.setCalibrationMode = (on) => {
  app.ui.calibrationMode = on;
  app.calUI.setActive(on);
};

// ---------- recording ----------

async function startRecording() {
  if (app.recording) return;
  app.recording = true;
  app.paused = false;
  const overlay = document.getElementById('record-overlay');
  const bar = document.getElementById('rec-progress');
  const status = document.getElementById('rec-status');
  overlay.classList.remove('hidden');
  const cfg = {
    format: app.ui.recFormat,
    fps: app.ui.recFps,
    duration: app.ui.recDuration,
    scale: app.ui.recScale,
    substeps: app.ui.recSubsteps,
    renderStyle: app.ui.recRenderStyle,
    renderStride: app.ui.recStride,
    shadows: app.ui.recShadows,
    includeIndicator: app.ui.recIncludeIndicator,
  };
  try {
    const result = await app.recorder.record(cfg, (f, total) => {
      bar.style.width = `${(100 * f / total).toFixed(1)}%`;
      status.textContent = `frame ${f} / ${total}`;
    });
    status.textContent = result.cancelled ? 'cancelled' : 'done';
  } catch (err) {
    console.error(err);
    alert('Recording failed: ' + err.message);
  } finally {
    app.recording = false;
    overlay.classList.add('hidden');
    restartTake();
  }
}
app.startRecording = startRecording;

// ---------- topbar ----------

function bindTopbar() {
  document.getElementById('btn-restart').onclick = restartTake;
  const pp = document.getElementById('btn-playpause');
  pp.onclick = () => {
    app.paused = !app.paused;
    pp.textContent = app.paused ? '▶ Play' : '⏸ Pause';
  };
  document.getElementById('btn-record').onclick = startRecording;
  document.getElementById('btn-cancel-record').onclick = () => app.recorder.cancel();
  document.getElementById('chk-log-live').onchange = (e) => { app.ui.logLive = e.target.checked; };
  // spacebar = tap (feels like tapping the board)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
      e.preventDefault();
      app.liveTap();
    }
  });
}

boot().catch((err) => {
  console.error(err);
  alert('Failed to start: ' + err.message);
});
