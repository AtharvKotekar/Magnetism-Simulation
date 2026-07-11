// Magnetism Stage — orchestrator. Owns the worker, the render stack, the UI
// state, and the interactive/record loops.

// The ?v= tags force browsers past GitHub Pages' 10-minute cache whenever a
// deploy changes these modules — bump them together with the tags in
// tool/index.html and coil/index.html.
import { createGL } from './render/gl.js?v=coil-v50';
import { SceneLayers } from './render/scene.js?v=coil-v50';
import { FilingRenderer, FLOATS_PER } from './render/filings.js?v=coil-v50';
import { Overlays } from './render/overlays.js?v=coil-v50';
import { Homography, loadCalibration, saveCalibration } from './render/homography.js';
import { CalibrationUI } from './ui/calibration.js?v=coil-v50';
import { buildPanel, diagnosticsHTML } from './ui/panel.js?v=coil-v50';
import { TimelineUI } from './ui/timelineui.js';
import { PRESETS } from './ui/presets.js?v=coil-v50';
import { DEFAULT_UI } from './ui/defaults.js?v=coil-v50';
import { Recorder } from './record/recorder.js';
import { DEFAULT_PARAMS } from './sim/units.js';
import { buildVariantConfig } from './variant.js?v=coil-v50';
import { CompassOverlay } from './render/compass.js?v=coil-v50';

const variant = buildVariantConfig(window.MAGNETISM_VARIANT || 'straight');

const app = {
  variant,
  presets: variant.presets || PRESETS,
  params: { ...DEFAULT_PARAMS, ...(variant.params || {}) },
  cal: loadCalibration(variant.calibrationKey, variant.defaultCalibration),
  timeline: [],
  takeDuration: 9,
  takeHash: '—',
  paused: false,
  recording: false,
  ui: { ...DEFAULT_UI },
  stats: { time: 0, current: 0, count: 0, rendered: 0, awake: 0, fps: 0, stepMs: 0 },
  el: {},
};
window.app = app; // console access for debugging

// ---------- boot ----------

async function boot() {
  app.canvas = document.getElementById('gl-canvas');
  const brand = document.getElementById('brand');
  if (brand && app.variant.brandHTML) brand.innerHTML = app.variant.brandHTML;
  const gl = createGL(app.canvas);
  app.gl = gl;

  app.scene = new SceneLayers(gl, app.variant.scene);
  await app.scene.load();
  app.filings = new FilingRenderer(gl, app.params.maxParticles);
  app.overlays = new Overlays(gl);
  app.overlays.buildGrid(app.cal.sheetW, app.cal.sheetH);
  if (app.variant.compass) {
    app.compass = new CompassOverlay(gl, app.variant.compass.assetsBase);
    await app.compass.load();
    bindCompassDrag();
  }
  rebuildCurrentOverlay();

  rebuildHomography();

  // worker
  app.worker = new Worker(new URL('./sim/worker.js?v=coil-v50', import.meta.url), { type: 'module' });
  app.worker.onmessage = onWorkerMessage;
  await workerReady();
  pushRenderOptions();

  // ui
  buildPanel(document.getElementById('panel'), app);
  app.timelineUI = new TimelineUI(app);
  app.calUI = new CalibrationUI(app.canvas, document.getElementById('pin-layer'), app.cal,
    () => calibrationChanged(false), app.variant.calibrationKey);
  app.recorder = new Recorder(app);
  bindTopbar();

  // default take
  loadPreset(app.presets[0]);

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
let pendingFrame = null;   // resolver for deterministic frame stepping
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
      drawFrame(m, {});
      updateStats(m);
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
  advanceFlowPhases(m);   // before surgeFollow: integrate with the speeds
  surgeFollow(m.current); // that were active over this frame's dt
  compassOrbitFollow(m);
  turnsFollow(m);
}

// Film-safe flow speeds: cap the dash advance below ~42% of its spacing per
// 24 fps film frame — past half a spacing per frame the eye locks onto the
// nearer dash BEHIND and the motion reads backward (wagon-wheel effect).
function filmSafePulseSpeed() {
  return Math.min(app.ui.currentPulseSpeed ?? 1, 0.024 * (app.ui.currentPulseSpacing ?? 140));
}
function filmSafeFieldSpeed() {
  return Math.min(app.ui.fieldMotionSpeed ?? 1, 0.056 * (app.ui.fieldMotionSpacing ?? 170));
}

// Integrate the overlay flow into traveled PIXELS. The dash shaders compute
// phase from time*speed, which is only valid while speed is constant: when
// the surge ramps the pulse speed (or AC flips the direction sign) an
// absolute-time phase teleports by simTime*deltaSpeed each frame — at
// simTime 200 s that is thousands of pixels per frame, and the pattern
// visibly scrambles "backward". Accumulating distance makes every speed or
// direction change slide the pattern smoothly instead.
function advanceFlowPhases(m) {
  const fp = app.flowPhase ?? (app.flowPhase = { t: m.time, cur: 0, fld: 0, arw: 0 });
  let dt = m.time - fp.t;
  if (dt < 0) { fp.cur = 0; fp.fld = 0; fp.arw = 0; dt = 0; }   // take restarted
  fp.t = m.time;
  const dirSign = currentDirection(m) < 0 ? 1 : -1;
  fp.cur += 420 * filmSafePulseSpeed() * dirSign * dt;
  fp.fld += 180 * filmSafeFieldSpeed() * dirSign * dt;
  fp.arw += 180 * (app.ui.fieldArrowSpeed ?? 0) * dirSign * dt;
}

// ---------- interactive loop ----------

function tick(now) {
  requestAnimationFrame(tick);
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
  if (c.coilLeft && c.coilRight) {
    app.coilLeftPlane = app.homog.toPlane(c.coilLeft[0], c.coilLeft[1]);
    app.coilRightPlane = app.homog.toPlane(c.coilRight[0], c.coilRight[1]);
  } else {
    app.coilLeftPlane = null;
    app.coilRightPlane = null;
  }
  // vertical scale: px per meter of height at the hole
  const dx = c.wireTop[0] - c.hole[0], dy = c.wireTop[1] - c.hole[1];
  const wireLenPx = Math.hypot(dx, dy) || 1;
  app.kUp = wireLenPx / (c.wireHeight || 0.3);
  app.upDir = [dx / wireLenPx, dy / wireLenPx];
  app.detJHole = app.homog.jacobianDet(hp[0], hp[1]);
  rebuildFieldOverlay();
}

function rebuildFieldOverlay() {
  if (!app.overlays || !app.holePlane) return;
  const pxPerM = Math.sqrt(Math.max(1e-9, Math.abs(app.detJHole || 1)));
  const pxToM = 1 / pxPerM;
  const rMax = Math.max(4, app.ui.fieldMaxRadiusPx ?? 1450) * pxToM;
  const twoPole = ['coil', 'bar', 'solenoid'].includes(app.variant.fieldOverlay) &&
    app.coilLeftPlane && app.coilRightPlane;
  if (twoPole) {
    const build = app.variant.fieldOverlay === 'bar'
      ? app.overlays.buildBarFieldLines.bind(app.overlays)
      : app.variant.fieldOverlay === 'solenoid'
        ? app.overlays.buildSolenoidFieldLines.bind(app.overlays)
        : app.overlays.buildCoilFieldLines.bind(app.overlays);
    build(app.coilLeftPlane, app.coilRightPlane, rMax, {
      rings: app.ui.fieldLineCount,
      firstRadius: Math.max(1, app.ui.fieldFirstRadiusPx ?? 52) * pxToM,
      radiusMultiplier: app.ui.fieldRadiusMultiplier,
      falloffCurve: app.ui.fieldFalloffCurve,
      pxToM,
      thickness: app.ui.fieldLineThickness,
      segments: app.ui.fieldLineDetail,
      arrowDensity: app.ui.fieldArrowDensity,
      arrowSize: app.ui.fieldArrowSize,
      cometSpacing: app.ui.fieldMotionSpacing,
      cometHeadSize: app.ui.fieldCometHeadSize,
      sheetW: app.cal.sheetW,
      sheetH: app.cal.sheetH,
      clipMargin: 0.0025,
      excludeRect: (() => {
        // Clip field lines at the full painted silhouette (barClipRect), not
        // the filings no-go box — that one sits 12 px inside the paint, and
        // clipping there leaks line slivers along the magnet's outline.
        const r = app.variant.barClipRect;
        if (!r) return null;
        const pts = [
          app.homog.toPlane(r[0], r[1]), app.homog.toPlane(r[2], r[1]),
          app.homog.toPlane(r[2], r[3]), app.homog.toPlane(r[0], r[3]),
        ];
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      })(),
      boreR: (app.variant.boreRadiusPx ?? 90) * pxToM,
      paths: app.variant.barFieldPaths?.map((path) => path.map(([px, py]) => {
        const q = app.homog.toPlane(px, py);
        return { x: q[0], y: q[1] };
      })),
    });
    return;
  }
  app.overlays.buildFieldLines(app.holePlane[0], app.holePlane[1], rMax, {
    rings: app.ui.fieldLineCount,
    firstRadius: Math.max(1, app.ui.fieldFirstRadiusPx ?? 52) * pxToM,
    radiusMultiplier: app.ui.fieldRadiusMultiplier,
    falloffCurve: app.ui.fieldFalloffCurve,
    pxToM,
    thickness: app.ui.fieldLineThickness,
    segments: app.ui.fieldLineDetail,
    arrowDensity: app.ui.fieldArrowDensity,
    arrowSize: app.ui.fieldArrowSize,
    cometSpacing: app.ui.fieldMotionSpacing,
    cometHeadSize: app.ui.fieldCometHeadSize,
  });
}
app.rebuildFieldOverlay = rebuildFieldOverlay;

function rebuildCurrentOverlay() {
  if (!app.overlays) return;
  const overlayCfg = app.variant.currentOverlay || {};
  const turns = app.ui.coilTurns ?? 1;
  const opts = {
    trackWidth: app.ui.currentTrackWidth,
    arrowSpacing: app.ui.currentArrowSpacing,
    arrowSize: app.ui.currentArrowSize,
    pathOffset: [app.ui.currentPathOffsetX ?? 0, app.ui.currentPathOffsetY ?? 0],
    ...overlayCfg,
  };
  if (turns > 1 && overlayCfg.pathsByTurns?.[turns]) {
    opts.paths = overlayCfg.pathsByTurns[turns];
  }
  if (typeof app.overlays.buildCurrentOverlay === 'function') {
    app.overlays.buildCurrentOverlay(opts);
  } else {
    app.overlays.buildDashGeometry?.(opts.trackWidth);
    app.overlays.buildCurrentArrowGeometry?.({ spacing: opts.arrowSpacing, size: opts.arrowSize });
  }
}
app.rebuildCurrentOverlay = rebuildCurrentOverlay;

// Coil turn count (1/2/3): swaps the conductor bundle overlay and gives
// every conductor its own current path. Scene dressing, like canvasRes —
// deliberately not part of presets or the take hash.
app.setCoilTurns = (n) => {
  app.ui.coilTurns = Math.max(1, Math.min(3, n | 0));
  rebuildCurrentOverlay();
};

function drawOpts(m, { alphaOnly = false, renderStyle = app.ui.renderStyle, shadows = app.ui.previewShadows } = {}) {
  const jitterPx = alphaOnly ? [0, 0] : tapJitterPx(m);
  return {
    H: app.glH,
    // res = keyframe image px (all geometry lives in that space);
    // screen = actual canvas backing px (differs when rendering at 4K).
    res: [app.scene.W, app.scene.H],
    screen: [app.canvas.width, app.canvas.height],
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
  const dur = 0.46;
  if (age < 0 || age > dur) return [0, 0];
  const env = Math.exp(-age * 7.0) * (1 - age / dur);
  const strength = m.tapStrength || app.params.tapStrength;
  const shake = Math.max(0, app.ui.boardShake ?? 1);
  const amp = Math.min(7.5, strength * 0.55 * shake) * env;
  const hit = Math.sin(Math.PI * Math.min(1, age / 0.08));
  const x = hit * -amp * 0.10 +
    Math.sin(age * Math.PI * 2 * 26) * amp * 0.36 +
    Math.sin(age * Math.PI * 2 * 61) * amp * 0.10;
  const y = hit * amp * 0.16 +
    Math.sin(age * Math.PI * 2 * 31) * amp * 0.55 +
    Math.sin(age * Math.PI * 2 * 73) * amp * 0.12;
  return [x, y];
}

function drawFrame(m, {
  indicator = null,
  alphaOnly = false,
  renderStyle = app.ui.renderStyle,
  shadows = app.ui.previewShadows,
} = {}) {
  const gl = app.gl;
  gl.viewport(0, 0, app.canvas.width, app.canvas.height);
  const o = drawOpts(m, { alphaOnly, renderStyle, shadows });
  const drawFilings = () => {
    if (o.renderStyle === 'line') app.filings.drawLines(o);
    else app.filings.drawFilings(o);
  };

  // Bar magnet: redraw the filings clipped to the magnet's screen rect so
  // the ones stuck ON the bar render above the occluder, like real filings
  // lying all over the magnet.
  const drawOnMagnet = () => {
    const r = app.variant.barBodyRect;
    if (!r) return;
    const sx = app.canvas.width / app.scene.W;
    const sy = app.canvas.height / app.scene.H;
    const m = 12;
    const x = (r[0] - m) * sx, y = (r[1] - m) * sy;
    const w = (r[2] - r[0] + 2 * m) * sx, h = (r[3] - r[1] + 2 * m) * sy;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.round(x), Math.round(app.canvas.height - y - h), Math.round(w), Math.round(h));
    drawFilings();
    gl.disable(gl.SCISSOR_TEST);
  };

  if (alphaOnly) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    app.scene.setJitter([0, 0]);
    if (o.shadows) app.filings.drawShadows(o);
    drawFilings();
    app.scene.drawOccluderEraser(app.ui.coilTurns ?? 1);
    drawOnMagnet();
    return;
  }

  const currentAbs = Math.abs(m?.current ?? 0);
  const effectiveDir = currentDirection(m);
  // The dash/head/arrow shaders take time*speed; pass effective times that
  // make that product equal the INTEGRATED travel distance (flowPhase), so
  // surge ramps and AC direction flips slide the pattern instead of
  // teleporting it (which reads as the current running backward).
  const dirSign = effectiveDir < 0 ? 1 : -1;
  const fp = app.flowPhase || { cur: 0, fld: 0, arw: 0 };
  const curPxS = 420 * filmSafePulseSpeed() * dirSign;
  const fldPxS = 180 * filmSafeFieldSpeed() * dirSign;
  const arwPxS = 180 * (app.ui.fieldArrowSpeed ?? 0) * dirSign;
  const tCur = curPxS ? fp.cur / curPxS : 0;
  const tFld = fldPxS ? fp.fld / fldPxS : 0;
  const tArw = arwPxS ? fp.arw / arwPxS : 0;
  // The reverse keyframe shows the cell physically flipped, so it follows
  // the wiring: the signed DC direction, but never the AC oscillation.
  const baseReverse =
    (app.params.currentMode === 'ac' ? (app.params.currentDir || 1) : effectiveDir) < 0;

  app.scene.setJitter([0, 0]);
  app.scene.drawScene(baseReverse);
  // The base scene already contains the cardboard; redrawing it shifted makes
  // the board exposure pop during taps. Keep the board stable and vibrate the
  // lifted filings instead.
  if (o.shadows) app.filings.drawShadows(o);
  drawFilings();
  const showFieldMotion = app.ui.showFieldPulses || app.ui.showFieldComets;
  if ((app.ui.showFieldLines || showFieldMotion || app.ui.showFieldArrows) &&
      (app.ui.currentOn || currentAbs > 0.5)) {
    const fieldBase = {
      H: o.H,
      res: o.res,
      jitterPx: [0, 0],
      dir: effectiveDir,
      time: tFld,
      hole: app.holePlane,
    };
    if (app.ui.showFieldLines) {
      app.overlays.drawFieldLines({
        ...fieldBase,
        color: hexToRgb(app.ui.fieldLineColor),
        intensity: indicatorLevel(currentAbs, app.ui.currentOn, app.ui.fieldLineStrength),
        opacity: app.ui.fieldLineOpacity,
      });
    }
    if (app.ui.showFieldPulses) {
      app.overlays.drawFieldDashes({
        ...fieldBase,
        mode: 'pulse',
        color: hexToRgb(app.ui.fieldMotionColor),
        intensity: indicatorLevel(currentAbs, app.ui.currentOn, app.ui.fieldMotionStrength),
        speed: filmSafeFieldSpeed(),
        spacing: app.ui.fieldMotionSpacing,
        pulseWidth: app.ui.fieldPulseWidth,
        tail: app.ui.fieldCometTail,
        widthFrac: app.ui.fieldMotionThickness,
      });
    }
    if (app.ui.showFieldComets) {
      app.overlays.drawFieldDashes({
        ...fieldBase,
        mode: 'comet',
        color: hexToRgb(app.ui.fieldMotionColor),
        intensity: indicatorLevel(currentAbs, app.ui.currentOn, app.ui.fieldMotionStrength),
        speed: filmSafeFieldSpeed(),
        spacing: app.ui.fieldMotionSpacing,
        pulseWidth: app.ui.fieldPulseWidth,
        tail: app.ui.fieldCometTail,
        widthFrac: app.ui.fieldMotionThickness,
      });
    }
    if (app.ui.showFieldComets && app.ui.showFieldCometHeads) {
      app.overlays.drawFieldCometHeads({
        ...fieldBase,
        color: hexToRgb(app.ui.fieldMotionColor),
        intensity: indicatorLevel(currentAbs, app.ui.currentOn, app.ui.fieldMotionStrength),
        speed: filmSafeFieldSpeed(),
        spacing: app.ui.fieldMotionSpacing,
        cometHeadSize: app.ui.fieldCometHeadSize,
      });
    }
    if (app.ui.showFieldArrows) {
      app.overlays.drawFieldArrows({
        ...fieldBase,
        time: tArw,
        color: hexToRgb(app.ui.fieldArrowColor ?? app.ui.fieldLineColor),
        intensity: indicatorLevel(currentAbs, app.ui.currentOn, app.ui.fieldArrowStrength),
        speed: app.ui.fieldArrowSpeed,
      });
    }
  }

  // Compass prop: on the paper above the filings, under the wire occluder
  // so the wire stays in front when they overlap.
  if (app.compass && app.ui.showCompass) {
    ensureCompassPos();
    app.compass.draw({
      homog: app.homog,
      res: o.res,
      center: [app.ui.compassX, app.ui.compassY],
      size: app.ui.compassSize,
      angle: compassNeedleAngle(m),
    });
  }

  app.scene.setJitter([0, 0]);
  app.scene.drawOccluder(app.ui.coilTurns ?? 1);
  drawOnMagnet();

  const showInd = indicator !== null ? indicator : app.ui.showIndicator;
  if (showInd) {
    const currentBase = {
      res: o.res,
      screen: o.screen,
      time: tCur,
      dir: effectiveDir,
      cardboardTex: app.scene.cardboard.tex,
      color: hexToRgb(app.ui.currentIndicatorColor),
      jitterPx: [0, 0],
      speed: filmSafePulseSpeed(),
      spacing: app.ui.currentPulseSpacing,
      pulseWidth: app.ui.currentPulseWidth,
      tail: app.ui.currentCometTail,
      cometHeadSize: app.ui.currentCometHeadSize,
      widthFrac: Math.min(1, Math.max(0.12, app.ui.currentTrackWidth / 18)),
    };
    const pulseIntensity = indicatorLevel(currentAbs, app.ui.currentOn, app.ui.currentIndicatorStrength);
    if (app.ui.showCurrentPulses) {
      app.overlays.drawCurrentDashes({
        ...currentBase,
        mode: 'pulse',
        currentFrac: pulseIntensity,
      });
    }
    if (app.ui.showCurrentComets) {
      app.overlays.drawCurrentDashes({
        ...currentBase,
        mode: 'comet',
        currentFrac: pulseIntensity,
      });
    }
    if (app.ui.showCurrentComets && app.ui.showCurrentCometHeads) {
      app.overlays.drawCurrentCometHeads({
        ...currentBase,
        color: hexToRgb(app.ui.currentArrowColor ?? app.ui.currentIndicatorColor),
        intensity: indicatorLevel(currentAbs, app.ui.currentOn, app.ui.currentArrowStrength),
      });
    }
    if (app.ui.showCurrentArrows) {
      app.overlays.drawCurrentArrows({
        ...currentBase,
        color: hexToRgb(app.ui.currentArrowColor ?? app.ui.currentIndicatorColor),
        intensity: indicatorLevel(currentAbs, app.ui.currentOn, app.ui.currentArrowStrength),
      });
    }
  }
  if (app.ui.calibrationMode) {
    app.overlays.drawGrid({ H: o.H, res: o.res, jitterPx: o.jitterPx });
  }
}
app.drawFrame = (snap, opts) => drawFrame(snap, opts);

// ---------- compass prop ----------

function ensureCompassPos() {
  if (app.ui.compassX != null && app.ui.compassY != null) return;
  // first show: on the paper to the lower-right of the wire
  app.ui.compassX = Math.min(app.cal.sheetW - 0.05, app.holePlane[0] + 0.085);
  app.ui.compassY = Math.min(app.cal.sheetH - 0.05, app.holePlane[1] + 0.035);
}

// ---- orbit: one smooth revolution around the conductor on an invisible
// circular track. Driven by SIM time (not wall clock) so recorded takes
// stay deterministic; eased with smoothstep so it starts and stops softly.
let compassOrbit = null;

app.compassPolar = () => {
  ensureCompassPos();
  const dx = app.ui.compassX - app.holePlane[0];
  const dy = app.ui.compassY - app.holePlane[1];
  return { R: Math.hypot(dx, dy), th: Math.atan2(dy, dx) };
};

app.setCompassOrbitRadius = (R) => {
  const p = app.compassPolar();
  const th = p.R < 1e-6 ? 0 : p.th;
  app.ui.compassX = app.holePlane[0] + R * Math.cos(th);
  app.ui.compassY = app.holePlane[1] + R * Math.sin(th);
  if (compassOrbit) compassOrbit.R = R;
};

app.liveCompassOrbit = (dur) => {
  const p = app.compassPolar();
  if (p.R < 0.02) return;                       // on the wire: nothing to orbit
  // travel WITH the field: B tangent is (dy,-dx)*sign(I) (right-hand rule),
  // and theta-increasing motion is (-dy,dx), so sweep = -sign(I) * 2pi
  const I = lastFrameData?.current ?? 0;
  const sig = Math.abs(I) > 0.001 ? Math.sign(I)
    : (app.params.currentDir || 1);
  compassOrbit = {
    t0: null,
    dur: Math.max(1, dur ?? app.ui.compassOrbitDur),
    R: p.R,
    th0: p.th,
    sweep: -sig * Math.PI * 2,
  };
};
app.cancelCompassOrbit = () => { compassOrbit = null; };

function compassOrbitFollow(m) {
  if (!compassOrbit || !app.holePlane) return;
  if (compassOrbit.t0 == null || m.time < compassOrbit.t0) compassOrbit.t0 = m.time;
  const p = Math.min(1, (m.time - compassOrbit.t0) / compassOrbit.dur);
  const e = p * p * (3 - 2 * p);                // smoothstep ease in/out
  const th = compassOrbit.th0 + e * (compassOrbit.sweep ?? Math.PI * 2);
  app.ui.compassX = app.holePlane[0] + compassOrbit.R * Math.cos(th);
  app.ui.compassY = app.holePlane[1] + compassOrbit.R * Math.sin(th);
  if (p >= 1) compassOrbit = null;
}

// Needle heading as a PURE function of (position, signed current) — no
// history, so identical takes render identical frames. The needle settles
// along the net in-plane field: Earth's field (fixed, pointing to the top
// of the paper, magnitude 1) plus the wire's tangent field, whose strength
// is `compassSensitivity` Earth-fields at 5 cm and 30 A and falls off 1/r.
function compassNeedleAngle(m) {
  const dx = app.ui.compassX - app.holePlane[0];
  const dy = app.ui.compassY - app.holePlane[1];
  const r = Math.max(0.012, Math.hypot(dx, dy));
  const I = m?.current ?? 0;
  const k = (app.ui.compassSensitivity ?? 3) * (0.05 / r) * (I / 30);
  // right-hand rule: current UP through the hole (dir=+1) curls the field
  // counterclockwise seen from above = tangent (dy, -dx) in y-down coords
  const bx = k * (dy / r);
  const by = k * (-dx / r) - 1;                // Earth north = -y (paper top)
  return Math.atan2(bx, -by);                  // 0 = north, clockwise-positive
}

function bindCompassDrag() {
  const cv = app.canvas;
  const toImagePx = (e) => {
    const rect = cv.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * app.scene.W,
      ((e.clientY - rect.top) / rect.height) * app.scene.H,
    ];
  };
  const hit = (e) => {
    if (!app.ui.showCompass || app.ui.compassX == null || !app.homog) return false;
    const p = toImagePx(e);
    const c = app.homog.toImage(app.ui.compassX, app.ui.compassY);
    const edge = app.homog.toImage(app.ui.compassX + app.ui.compassSize / 2, app.ui.compassY);
    const rPx = Math.hypot(edge[0] - c[0], edge[1] - c[1]);
    return Math.hypot(p[0] - c[0], p[1] - c[1]) <= rPx * 1.05;
  };
  let dragging = false;
  cv.addEventListener('pointerdown', (e) => {
    if (!hit(e)) return;
    dragging = true;
    app.cancelCompassOrbit();                   // hand takes over from the orbit
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) {
      cv.style.cursor = hit(e) ? 'grab' : '';
      return;
    }
    const p = toImagePx(e);
    const q = app.homog.toPlane(p[0], p[1]);
    const half = app.ui.compassSize / 2;
    app.ui.compassX = Math.min(app.cal.sheetW - half * 0.6, Math.max(half * 0.6, q[0]));
    app.ui.compassY = Math.min(app.cal.sheetH - half * 0.6, Math.max(half * 0.6, q[1]));
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    cv.releasePointerCapture?.(e.pointerId);
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
}

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

function currentDirection(m) {
  const current = m?.current ?? 0;
  const target = app.ui.currentOn ? app.params.currentA : current;
  const sign = Math.abs(current) > 0.001 ? Math.sign(current) : Math.sign(target || 1);
  return sign * (app.params.currentDir || 1);
}

function indicatorLevel(currentAbs, currentOn, strength = 1) {
  if (!currentOn && currentAbs <= 0.5) return 0;
  const base = Math.min(1, currentAbs / 20);
  return Math.min(2, Math.max(currentOn ? 0.3 : 0, base) * Math.max(0, strength));
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return [1, 1, 1];
  return [
    parseInt(m[1], 16) / 255,
    parseInt(m[2], 16) / 255,
    parseInt(m[3], 16) / 255,
  ];
}

// ---------- worker actions (live + take control) ----------

function simParams() {
  const params = {
    ...app.params,
    holeX: app.holePlane[0],
    holeY: app.holePlane[1],
    sheetW: app.cal.sheetW,
    sheetH: app.cal.sheetH,
    holeWallR: app.cal.holeWallR,
  };
  if ((app.variant.fieldOverlay === 'coil' || app.variant.fieldOverlay === 'bar') &&
      app.coilLeftPlane && app.coilRightPlane) {
    params.poleAX = app.coilLeftPlane[0];
    params.poleAY = app.coilLeftPlane[1];
    params.poleBX = app.coilRightPlane[0];
    params.poleBY = app.coilRightPlane[1];
    params.holeX = (params.poleAX + params.poleBX) * 0.5;
    params.holeY = (params.poleAY + params.poleBY) * 0.5;
  }
  Object.assign(params, barRectParams());
  return params;
}


// Bar magnet body rectangle (image px) backprojected into plane meters —
// the worker keeps filings out of it (the magnet sits ON the paper).
function barRectParams() {
  const r = app.variant.barBodyRect;
  if (!r || !app.homog) return {};
  const pts = [
    app.homog.toPlane(r[0], r[1]), app.homog.toPlane(r[2], r[1]),
    app.homog.toPlane(r[2], r[3]), app.homog.toPlane(r[0], r[3]),
  ];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return {
    barX0: Math.min(...xs), barX1: Math.max(...xs),
    barY0: Math.min(...ys), barY1: Math.max(...ys),
  };
}

app.pushParams = (patch) => app.worker.postMessage({ type: 'params', patch });

function pushRenderOptions() {
  if (!app.worker) return;
  app.worker.postMessage({ type: 'renderOptions', previewStride: app.ui.previewStride });
}
app.pushRenderOptions = pushRenderOptions;

// True 4K rendering: resize the canvas backing store (keyframe aspect is
// preserved, so nothing stretches — the scene, filings, and overlays are all
// resolution-independent in image space). Recording at "native canvas"
// then captures genuine 4K pixels.
function setCanvasResolution(mode) {
  app.ui.canvasRes = mode;
  const W = app.scene?.W || app.canvas.width;
  const H = app.scene?.H || app.canvas.height;
  let w = W, h = H;
  if (mode === '4k') {
    w = 3840;
    h = Math.round((H * 3840) / W / 2) * 2;
  }
  if (app.canvas.width !== w || app.canvas.height !== h) {
    app.canvas.width = w;
    app.canvas.height = h;
    if (app.calUI?.active) app.calUI.position();
  }
}
app.setCanvasResolution = setCanvasResolution;

function sendCurrentState(log = true) {
  const p = app.params;
  const opts = app.ui.currentOn
    ? { on: true, amp: p.currentA, mode: p.currentMode, freq: p.acFreq, rampDur: p.rampDur }
    : { on: false, rampDur: p.rampDur };
  app.worker.postMessage({ type: 'current', opts });
  if (log) logLive({ type: 'current', ...opts });
}

app.liveCurrent = () => sendCurrentState(true);

// One-click continuous-shot surge: ONE simultaneous tap, and the field-line
// count, falloff curve, and panel adjusters follow the worker's actual
// amplitude ramp frame by frame (see handleFrame) — no rAF, so it works in
// throttled tabs and deterministic recording alike. The sprinkle is never
// touched, and the tap blooms to the full target amplitude because the
// worker computes reach from the ramp target.
let surgeAnim = null;
// spec: { targetA, dur, ui: { uiKey: targetValue, ... } } — each listed UI
// adjuster glides from its CURRENT value to the target as the amplitude
// ramps. Variants define their own spec (variant.surge): the straight wire
// eases the falloff curve, the coil widens the ring multiplier.
app.liveSurge = (spec = {}) => {
  const p = app.params;
  const targetA = spec.targetA ?? 100;
  const dur = spec.dur ?? 2.6;
  const tracks = {};
  for (const [k, to] of Object.entries(spec.ui ?? {})) {
    tracks[k] = { from: app.ui[k] ?? to, to };
  }
  // WORKER params can surge too (chain strength, pulls, ...): they glide
  // with the same amplitude progress and get pushed to the sim each frame.
  const pTracks = {};
  for (const [k, to] of Object.entries(spec.params ?? {})) {
    pTracks[k] = { from: app.params[k] ?? to, to };
  }
  surgeAnim = { fromA: p.currentA, targetA, tracks, pTracks, lastPanel: 0 };
  app.ui.currentOn = true;
  syncCurrentSwitch();
  app.worker.postMessage({ type: 'current',
    opts: { on: true, amp: targetA, mode: p.currentMode, freq: p.acFreq, rampDur: dur } });
  logLive({ type: 'current', on: true, amp: targetA, mode: p.currentMode, rampDur: dur });
  app.liveTap();                       // exactly one tap, at the click
};

function surgeFollow(current) {
  const sa = surgeAnim;
  if (!sa) return;
  const span = sa.targetA - sa.fromA || 1;
  const prog = Math.max(0, Math.min(1, (current - sa.fromA) / span));
  for (const [k, t] of Object.entries(sa.tracks)) {
    const v = prog >= 1 ? t.to : t.from + (t.to - t.from) * prog;
    app.ui[k] = k === 'fieldLineCount' ? Math.round(v) : v;
  }
  const pKeys = Object.keys(sa.pTracks ?? {});
  if (pKeys.length) {
    const patch = {};
    for (const k of pKeys) {
      const t = sa.pTracks[k];
      const v = prog >= 1 ? t.to : t.from + (t.to - t.from) * prog;
      app.params[k] = v;
      patch[k] = v;
    }
    app.pushParams(patch);
  }
  app.params.currentA = prog >= 1 ? sa.targetA : Math.round(sa.fromA + span * prog);
  rebuildFieldOverlay();
  const now = performance.now();
  if (prog >= 1 || now - sa.lastPanel > 150) {
    sa.lastPanel = now;
    buildPanel(document.getElementById('panel'), app);
    refreshDiagnostics();
  }
  if (prog >= 1) surgeAnim = null;
}

// ---- turns stage: '➕ Add coil' steps the bundle 1 → 2 → 3 while the
// field-line count blooms smoothly to the per-turns target. No amplitude
// ramp is involved (the board stays clear, no tap), so the glide runs on
// SIM time — deterministic in recordings and pause-aware, like the
// compass orbit.
let turnsAnim = null;
app.liveAddCoil = () => {
  const cfg = app.variant?.turnsStage;
  if (!cfg) return;
  const cur = app.ui.coilTurns ?? 1;
  if (cur >= 3) return;
  const next = cur + 1;
  app.setCoilTurns(next);                 // the new conductor appears now...
  turnsAnim = {                           // ...and its field fills in smoothly
    t0: null,
    dur: cfg.dur ?? 2.2,
    from: app.ui.fieldLineCount,
    to: cfg.linesByTurns?.[next] ?? app.ui.fieldLineCount,
    lastPanel: 0,
  };
};

function turnsFollow(m) {
  const ta = turnsAnim;
  if (!ta) return;
  if (ta.t0 == null || m.time < ta.t0) ta.t0 = m.time;
  const p = Math.min(1, (m.time - ta.t0) / ta.dur);
  const e = p * p * (3 - 2 * p);          // smoothstep ease in/out
  app.ui.fieldLineCount = Math.round(ta.from + (ta.to - ta.from) * e);
  rebuildFieldOverlay();
  const now = performance.now();
  if (p >= 1 || now - ta.lastPanel > 150) {
    ta.lastPanel = now;
    buildPanel(document.getElementById('panel'), app);
    refreshDiagnostics();
  }
  if (p >= 1) turnsAnim = null;
}

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
  const opts = {
    count: p.sprinkleCount,
    strayCount: p.strayCount,
    pattern: p.sprinklePattern,
    radius: p.sprinkleR,
    clump: p.sprinkleClump,
  };
  app.worker.postMessage({ type: 'sprinkle', opts });
  logLive({ type: 'sprinkle', ...opts });
};

app.liveClear = () => {
  app.worker.postMessage({ type: 'clearFilings' });
  logLive({ type: 'clear' });
};

function logLive(ev) {
  if (!app.ui.logLive) return;
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

async function restartTake() {
  const shouldCurrentOn = app.ui.currentOn;
  syncCurrentSwitch();
  await app.resetTake();
  if (shouldCurrentOn) sendCurrentState(false);
}

function loadPreset(p) {
  app.timeline = structuredClone(p.timeline);
  if (p.params) Object.assign(app.params, p.params);
  if (p.cal) {
    Object.assign(app.cal, structuredClone(p.cal));
    saveCalibration(app.cal, app.variant.calibrationKey);
    rebuildHomography();
    if (app.calUI?.active) app.calUI.position();
  }
  app.ui.currentOn = p.ui?.currentOn ?? false;
  if (p.ui) Object.assign(app.ui, p.ui);
  setCanvasResolution(app.ui.canvasRes ?? 'native');
  app.takeDuration = p.duration;
  rebuildFieldOverlay();
  rebuildCurrentOverlay();
  app.overlays.buildGrid(app.cal.sheetW, app.cal.sheetH);
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
  saveCalibration(app.cal, app.variant.calibrationKey);
  app.overlays.buildGrid(app.cal.sheetW, app.cal.sheetH);
  app.pushParams({
    holeX: app.holePlane[0], holeY: app.holePlane[1],
    ...(app.coilLeftPlane && app.coilRightPlane ? {
      poleAX: app.coilLeftPlane[0], poleAY: app.coilLeftPlane[1],
      poleBX: app.coilRightPlane[0], poleBY: app.coilRightPlane[1],
      holeX: (app.coilLeftPlane[0] + app.coilRightPlane[0]) * 0.5,
      holeY: (app.coilLeftPlane[1] + app.coilRightPlane[1]) * 0.5,
    } : {}),
    sheetW: app.cal.sheetW, sheetH: app.cal.sheetH, holeWallR: app.cal.holeWallR,
    ...barRectParams(),
  });
  refreshTakeHash();
}
app.calibrationChanged = calibrationChanged;

app.setCalibrationMode = (on) => {
  app.ui.calibrationMode = on;
  app.calUI.setActive(on);
};

// ---------- recording ----------

function recordingConfig() {
  return {
    format: app.ui.recFormat,
    fps: app.ui.recFps,
    size: recordingSize(app.ui.recSize),
    bitrate: recordingBitrate(app.ui.recQuality),
  };
}

function recordingBitrate(quality) {
  if (quality === 'draft') return 45e6;
  if (quality === 'high') return 90e6;
  return 160e6;
}

function recordingSize(size) {
  if (size === '1080p') return { width: 1920, height: 1080 };
  if (size === 'native') return { width: app.canvas.width, height: app.canvas.height };
  if (size === 'quick') return { width: 1280, height: 720 };
  return { width: 2048, height: 1152 };
}

function setRecordingUI(active, text = '') {
  const top = document.getElementById('btn-record');
  if (top) {
    top.textContent = active ? '■ Stop recording' : '● Record';
    top.classList.toggle('active', active);
  }
  if (app.el.recordPanelButton) {
    app.el.recordPanelButton.textContent = active ? '■ Stop recording' : '● Start recording';
    app.el.recordPanelButton.classList.toggle('active', active);
  }
  if (app.el.recordStatus) app.el.recordStatus.textContent = text;
}

function startRecording() {
  if (app.recording) return;
  const cfg = {
    ...recordingConfig(),
  };
  try {
    app.recording = true;
    setRecordingUI(true, 'recording 0.0 s');
    const started = app.recorder.start(cfg, (status) => {
      setRecordingUI(true, status);
    }, () => {
      app.recording = false;
      setRecordingUI(false, 'saved');
    }, (err) => {
      app.recording = false;
      setRecordingUI(false, 'failed');
      console.error(err);
      alert('Recording failed: ' + err.message);
    });
    if (!started) {
      app.recording = false;
      setRecordingUI(false, 'not started');
    }
  } catch (err) {
    app.recording = false;
    setRecordingUI(false, 'failed');
    console.error(err);
    alert('Recording failed: ' + err.message);
  }
}
app.startRecording = startRecording;

function stopRecording() {
  if (!app.recording) return;
  setRecordingUI(true, 'saving...');
  app.recorder.stop();
}
app.stopRecording = stopRecording;

function toggleRecording() {
  if (app.recording) stopRecording();
  else startRecording();
}
app.toggleRecording = toggleRecording;

// ---------- topbar ----------

function bindTopbar() {
  document.getElementById('btn-restart').onclick = restartTake;
  const pp = document.getElementById('btn-playpause');
  pp.onclick = () => {
    app.paused = !app.paused;
    pp.textContent = app.paused ? '▶ Play' : '⏸ Pause';
  };
  document.getElementById('btn-record').onclick = toggleRecording;
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
