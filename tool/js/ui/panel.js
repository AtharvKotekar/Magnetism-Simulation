// Control panel: builds all parameter sections and wires them to app actions.
// `app` is the orchestrator from main.js (owns params, worker, renderer, ui prefs).

import { PRESETS } from './presets.js';
import { MU0, G, RHO_IRON } from '../sim/units.js';

export function buildPanel(root, app) {
  root.innerHTML = '';
  const S = (title, open = true) => section(root, title, open);

  // ---------- CURRENT ----------
  {
    const b = S('CURRENT');
    const sw = document.createElement('div');
    sw.className = 'bigswitch';
    sw.innerHTML = '<div class="knob"></div><div class="sw-label">CURRENT OFF</div>';
    sw.onclick = () => {
      app.ui.currentOn = !app.ui.currentOn;
      sw.classList.toggle('on', app.ui.currentOn);
      sw.querySelector('.sw-label').textContent = app.ui.currentOn ? 'CURRENT ON' : 'CURRENT OFF';
      app.liveCurrent();
    };
    b.appendChild(sw);
    app.el.currentSwitch = sw;

    slider(b, 'Amplitude', 1, 100, 1, app.params.currentA, ' A', (v) => {
      app.params.currentA = v;
      if (app.ui.currentOn) app.liveCurrent();
      app.refreshDiagnostics();
    });
    select(b, 'Waveform', [['dc', 'DC'], ['ac', 'AC (sine)']], app.params.currentMode, (v) => {
      app.params.currentMode = v;
      if (app.ui.currentOn) app.liveCurrent();
    });
    slider(b, 'AC frequency', 1, 60, 1, app.params.acFreq, ' Hz', (v) => {
      app.params.acFreq = v;
      if (app.ui.currentOn && app.params.currentMode === 'ac') app.liveCurrent();
    });
    slider(b, 'Ramp', 0, 2, 0.05, app.params.rampDur, ' s', (v) => { app.params.rampDur = v; });
    const dirRow = document.createElement('div');
    dirRow.className = 'ctl-row';
    const dirBtn = document.createElement('button');
    dirBtn.textContent = '⬇ current flows DOWN through hole';
    dirBtn.onclick = () => {
      app.params.currentDir *= -1;
      dirBtn.textContent = app.params.currentDir < 0
        ? '⬇ current flows DOWN through hole'
        : '⬆ current flows UP through hole';
      app.pushParams({ currentDir: app.params.currentDir });
      if (app.ui.currentOn) app.liveCurrent();
    };
    dirRow.appendChild(dirBtn);
    b.appendChild(dirRow);
    check(b, 'Flow indicator on wire', app.ui.showIndicator, (v) => { app.ui.showIndicator = v; });
  }

  // ---------- FILINGS ----------
  {
    const b = S('FILINGS');
    slider(b, 'Sprinkle count', 1000, 80000, 500, app.params.sprinkleCount, '', (v) => {
      app.params.sprinkleCount = v;
    });
    select(b, 'Pattern', [['disk', 'disk around wire'], ['ring', 'ring'], ['sheet', 'whole sheet']],
      app.params.sprinklePattern, (v) => { app.params.sprinklePattern = v; });
    slider(b, 'Spread radius', 0.03, 0.19, 0.005, app.params.sprinkleR, ' m', (v) => {
      app.params.sprinkleR = v;
    });
    slider(b, 'Clumpiness', 0, 1, 0.05, app.params.sprinkleClump, '', (v) => {
      app.params.sprinkleClump = v;
    });
    slider(b, 'Median length', 0.2, 1.0, 0.05, app.params.filingMedianL * 1e3, ' mm', (v) => {
      app.params.filingMedianL = v * 1e-3;
      app.pushParams({ filingMedianL: app.params.filingMedianL });
      app.refreshDiagnostics();
    });
    const row = document.createElement('div');
    row.className = 'ctl-row';
    const bS = document.createElement('button');
    bS.textContent = '⛬ Sprinkle';
    bS.onclick = () => app.liveSprinkle();
    const bC = document.createElement('button');
    bC.textContent = '✕ Clear';
    bC.onclick = () => app.liveClear();
    row.append(bS, bC);
    b.appendChild(row);
  }

  // ---------- TAP ----------
  {
    const b = S('TAP THE BOARD');
    slider(b, 'Strength', 2, 20, 0.5, app.params.tapStrength, ' g', (v) => {
      app.params.tapStrength = v;
      app.pushParams({ tapStrength: v });
    });
    slider(b, 'Lift visibility', 1, 8, 0.5, app.ui.liftScale, '×', (v) => {
      app.ui.liftScale = v;
    });
    const row = document.createElement('div');
    row.className = 'ctl-row';
    const bT = document.createElement('button');
    bT.textContent = '👆 TAP';
    bT.onclick = () => app.liveTap();
    const bB = document.createElement('button');
    bB.textContent = 'tap ×4';
    bB.onclick = () => app.liveTapBurst(4);
    row.append(bT, bB);
    b.appendChild(row);
    slider(b, 'Auto-tap rate', 0, 5, 0.1, app.params.autoTapRate, ' Hz', (v) => {
      app.params.autoTapRate = v;
      app.pushParams({ autoTapRate: v });
    });
    check(b, 'Board vibration cue', app.ui.tapVibration, (v) => { app.ui.tapVibration = v; });
  }

  // ---------- PHYSICS ----------
  {
    const b = S('PHYSICS', false);
    slider(b, 'Static friction μs', 0.1, 1.2, 0.02, app.params.muS, '', (v) => {
      app.params.muS = v; app.pushParams({ muS: v }); app.refreshDiagnostics();
    });
    slider(b, 'Kinetic friction μk', 0.05, 1.0, 0.02, app.params.muK, '', (v) => {
      app.params.muK = v; app.pushParams({ muK: v });
    });
    slider(b, 'Remanence f_r', 0, 0.05, 0.002, app.params.remanenceFrac, '', (v) => {
      app.params.remanenceFrac = v; app.pushParams({ remanenceFrac: v });
    });
    slider(b, 'Chain strength', 0, 3, 0.1, app.params.chainStrength, '×', (v) => {
      app.params.chainStrength = v; app.pushParams({ chainStrength: v });
    });
    check(b, 'Ambient (Earth) field', app.params.ambientOn, (v) => {
      app.params.ambientOn = v; app.pushParams({ ambientOn: v });
    });
    slider(b, 'Ambient angle', 0, 6.28, 0.05, app.params.ambientAngle, ' rad', (v) => {
      app.params.ambientAngle = v; app.pushParams({ ambientAngle: v });
    });
    hint(b, 'Physically-honest note: with pure induced magnetization a DC ' +
      'reversal is invisible (torque ∝ H²). Remanence f_r is what makes ' +
      '“reverse & re-align” readable.');
  }

  // ---------- VIEW ----------
  {
    const b = S('VIEW', false);
    check(b, 'Field-line preview', app.ui.showFieldLines, (v) => { app.ui.showFieldLines = v; });
    check(b, 'Clip filings to cardboard', app.ui.clipToCardboard, (v) => { app.ui.clipToCardboard = v; });
    select(b, 'Filing detail', [
      ['line', 'draft lines (fast)'],
      ['capsule', 'capsules (beauty)'],
    ], app.ui.renderStyle, (v) => { app.ui.renderStyle = v; });
    select(b, 'Preview density', [
      ['1', 'full'],
      ['2', '1/2 (faster)'],
      ['4', '1/4 (fast)'],
      ['8', '1/8 (very fast)'],
    ], String(app.ui.previewStride), (v) => {
      app.ui.previewStride = +v;
      app.pushRenderOptions();
    });
    check(b, 'Preview shadows', app.ui.previewShadows, (v) => { app.ui.previewShadows = v; });
    check(b, 'Calibration mode', false, (v) => app.setCalibrationMode(v));
    hint(b, 'Calibration pins map the physics plane onto the film keyframe. ' +
      'Drag the 4 corners to the cardboard corners, the hole pin onto the ' +
      'hole, and the wire-top pin to where the wire meets the crossbar. ' +
      'Saved automatically.');
    num(b, 'Sheet width (m)', app.cal.sheetW, 0.05, (v) => { app.cal.sheetW = v; app.calibrationChanged(); });
    num(b, 'Sheet height (m)', app.cal.sheetH, 0.05, (v) => { app.cal.sheetH = v; app.calibrationChanged(); });
    num(b, 'Wire height (m)', app.cal.wireHeight, 0.05, (v) => { app.cal.wireHeight = v; app.calibrationChanged(); });
  }

  // ---------- PRESET TAKES ----------
  {
    const b = S('PRESET TAKES');
    for (const p of PRESETS) {
      const row = document.createElement('div');
      row.className = 'ctl-row';
      const btn = document.createElement('button');
      btn.textContent = p.name;
      btn.title = p.hint;
      btn.onclick = () => app.loadPreset(p);
      row.appendChild(btn);
      b.appendChild(row);
    }
    hint(b, 'Loading a preset replaces the timeline and restarts the take.');
  }

  // ---------- RECORD ----------
  {
    const b = S('RECORD');
    select(b, 'Format', [
      ['mp4', 'MP4 (H.264)'],
      ['webm', 'WebM (VP9)'],
      ['png', 'PNG sequence'],
      ['png-alpha', 'PNG seq + alpha pass'],
    ], app.ui.recFormat, (v) => { app.ui.recFormat = v; });
    select(b, 'FPS', [['24', '24 (film)'], ['25', '25'], ['30', '30'], ['48', '48'], ['60', '60']],
      String(app.ui.recFps), (v) => { app.ui.recFps = +v; });
    num(b, 'Duration (s)', app.ui.recDuration, 0.5, (v) => { app.ui.recDuration = v; });
    select(b, 'Resolution', [['1', '2752 × 1536 (native)'], ['0.75', '2064 × 1152'], ['0.5', '1376 × 768']],
      String(app.ui.recScale), (v) => { app.ui.recScale = +v; });
    select(b, 'Filing detail', [
      ['line', 'draft lines (fast)'],
      ['capsule', 'capsules (beauty)'],
    ], app.ui.recRenderStyle, (v) => { app.ui.recRenderStyle = v; });
    select(b, 'Filing density', [
      ['1', 'full'],
      ['2', '1/2'],
      ['4', '1/4 (fast)'],
      ['8', '1/8 (very fast)'],
    ], String(app.ui.recStride), (v) => { app.ui.recStride = +v; });
    check(b, 'Record shadows', app.ui.recShadows, (v) => { app.ui.recShadows = v; });
    num(b, 'Physics substeps / frame', app.ui.recSubsteps, 1, (v) => { app.ui.recSubsteps = Math.max(1, Math.round(v)); });
    num(b, 'Seed', app.params.seed, 1, (v) => { app.params.seed = Math.round(v); app.refreshTakeHash(); });
    check(b, 'Include flow indicator', app.ui.recIncludeIndicator, (v) => { app.ui.recIncludeIndicator = v; });
    const row = document.createElement('div');
    row.className = 'ctl-row';
    const btn = document.createElement('button');
    btn.className = 'rec';
    btn.textContent = '● Record take';
    btn.onclick = () => app.startRecording();
    row.appendChild(btn);
    b.appendChild(row);
    hint(b, 'Recording restarts the take from t = 0 with the current seed and ' +
      'renders frame-by-frame (slower than realtime, full quality). Same seed ' +
      '+ same settings ⇒ identical footage.');
  }

  // ---------- DIAGNOSTICS ----------
  {
    const b = S('DIAGNOSTICS', false);
    const d = document.createElement('div');
    d.className = 'diag';
    b.appendChild(d);
    app.el.diag = d;
    hint(b, 'Γ > 1: field torque beats static friction (spontaneous alignment). ' +
      'The Γ = 1 radius is where neat arcs give way to ragged ones — the ' +
      'physically correct look this tool exists for.');
  }

  app.refreshDiagnostics();
}

// Physics diagnostics from the reference (median) filing.
export function diagnosticsHTML(app, stats) {
  const p = app.params;
  const L = p.filingMedianL, aspect = 5;
  const d = L / aspect;
  const V = Math.PI / 6 * d * d * L;
  const m = RHO_IRON * V;
  const dChi = 15.8; // χ∥−χ⊥ at aspect 5
  const I = p.currentA;
  // Γ(r) = ½ μ0 V Δχ H² / (μs m g L/4),  H = I/(2πr)  ⇒  r(Γ=1)
  const rGamma = (I / (2 * Math.PI)) * Math.sqrt((0.5 * MU0 * V * dChi) / (p.muS * m * G * L / 4));
  const fmt = (x, u = '') => `<b>${x}</b>${u}`;
  return [
    `sim time ${fmt(stats.time.toFixed(2), ' s')} · awake ${fmt(stats.awake)} / ${fmt(stats.count)}`,
    `I(t) = ${fmt(stats.current.toFixed(1), ' A')}`,
    `Γ=1 radius: ${fmt((rGamma * 1000).toFixed(1), ' mm')} <span class="${rGamma > 0.004 ? 'ok' : 'warn'}">` +
      `(spontaneous alignment inside this)</span>`,
    `beyond that: taps do the aligning — arcs get ragged with r (correct)`,
    `worker: ${fmt(stats.stepMs.toFixed(1), ' ms')}/frame · render ${fmt(stats.fps.toFixed(0), ' fps')}`,
    stats.rendered && stats.rendered < stats.count
      ? `preview drawing ${fmt(stats.rendered.toLocaleString())} / ${fmt(stats.count.toLocaleString())} filings`
      : null,
  ].filter(Boolean).join('<br>');
}

// ---- small DOM builders ----

function section(root, title, open = true) {
  const s = document.createElement('div');
  s.className = 'sect' + (open ? '' : ' closed');
  const h = document.createElement('h3');
  h.textContent = title;
  h.onclick = () => s.classList.toggle('closed');
  const b = document.createElement('div');
  b.className = 'sect-body';
  s.append(h, b);
  root.appendChild(s);
  return b;
}

function slider(parent, label, min, max, step, value, unit, onInput) {
  const row = document.createElement('div');
  row.className = 'ctl';
  const l = document.createElement('label');
  l.textContent = label;
  const r = document.createElement('input');
  r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value;
  const v = document.createElement('span');
  v.className = 'val';
  const show = (x) => { v.textContent = (+x).toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0) + unit; };
  show(value);
  r.oninput = () => { show(r.value); onInput(+r.value); };
  row.append(l, r, v);
  parent.appendChild(row);
  return r;
}

function select(parent, label, options, value, onChange) {
  const row = document.createElement('div');
  row.className = 'ctl';
  const l = document.createElement('label');
  l.textContent = label;
  const s = document.createElement('select');
  for (const [val, text] of options) {
    const o = document.createElement('option');
    o.value = val; o.textContent = text;
    s.appendChild(o);
  }
  s.value = value;
  s.onchange = () => onChange(s.value);
  row.append(l, s);
  parent.appendChild(row);
  return s;
}

function check(parent, label, value, onChange) {
  const row = document.createElement('div');
  row.className = 'ctl';
  const l = document.createElement('label');
  l.textContent = label;
  const c = document.createElement('input');
  c.type = 'checkbox'; c.checked = value;
  c.onchange = () => onChange(c.checked);
  row.append(l, c);
  parent.appendChild(row);
  return c;
}

function num(parent, label, value, step, onChange) {
  const row = document.createElement('div');
  row.className = 'ctl';
  const l = document.createElement('label');
  l.textContent = label;
  const i = document.createElement('input');
  i.type = 'number'; i.value = value; i.step = step;
  i.onchange = () => onChange(+i.value);
  row.append(l, i);
  parent.appendChild(row);
  return i;
}

function hint(parent, text) {
  const h = document.createElement('div');
  h.className = 'hint';
  h.textContent = text;
  parent.appendChild(h);
}
