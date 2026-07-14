// Control panel: builds all parameter sections and wires them to app actions.
// `app` is the orchestrator from main.js (owns params, worker, renderer, ui prefs).

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
    const updateDirText = () => {
      if (app.variant?.currentDirectionText) {
        dirBtn.textContent = app.variant.currentDirectionText(app.params.currentDir);
      } else {
        dirBtn.textContent = app.params.currentDir < 0
          ? '⬇ current flows DOWN through hole'
          : '⬆ current flows UP through hole';
      }
    };
    updateDirText();
    dirBtn.onclick = () => {
      app.params.currentDir *= -1;
      updateDirText();
      app.pushParams({ currentDir: app.params.currentDir });
      if (app.ui.currentOn) app.liveCurrent();
    };
    dirRow.appendChild(dirBtn);
    b.appendChild(dirRow);
    if (app.variant?.scene?.turnOverlays) {
      select(b, 'Coil turns', [['1', '1 coil'], ['2', '2 coils'], ['3', '3 coils']],
        String(app.ui.coilTurns ?? 1), (v) => { app.setCoilTurns(+v); });
    }
    if (app.variant?.surge) {
      const row = document.createElement('div');
      row.className = 'ctl-row';
      const surge = document.createElement('button');
      surge.textContent = app.variant.surge.label ?? '⚡ Surge to 100 A';
      surge.title = app.variant.surge.title ??
        'Continuous-shot move: ramp the amplitude and glide the listed adjusters to their surge targets with ONE tap — without re-sprinkling';
      surge.onclick = () => app.liveSurge(app.variant.surge);
      row.appendChild(surge);
      b.appendChild(row);
    }
    if (app.variant?.turnsStage) {
      const row = document.createElement('div');
      row.className = 'ctl-row';
      const btn = document.createElement('button');
      const cur = app.ui.coilTurns ?? 1;
      const lines = app.variant.turnsStage.linesByTurns ?? {};
      if (cur >= 3) {
        btn.textContent = '➕ 3 coils (max) — reload preset to reset';
        btn.disabled = true;
      } else {
        btn.textContent = `➕ Add coil → ${cur + 1} (rings ${lines[cur] ?? '?'} → ${lines[cur + 1] ?? '?'})`;
      }
      btn.title = 'Continuous-shot move: the next conductor appears and the field-line count blooms smoothly to its target — no sprinkle, no tap.';
      btn.onclick = () => app.liveAddCoil();
      row.appendChild(btn);
      b.appendChild(row);
    }
    subhead(b, 'CONDUCTOR OVERLAY');
    check(b, 'Overlay visible', app.ui.showIndicator, (v) => { app.ui.showIndicator = v; });
    check(b, 'Pulses', app.ui.showCurrentPulses, (v) => { app.ui.showCurrentPulses = v; });
    check(b, 'Comets', app.ui.showCurrentComets, (v) => { app.ui.showCurrentComets = v; });
    check(b, 'Comet arrows', app.ui.showCurrentCometHeads, (v) => { app.ui.showCurrentCometHeads = v; });
    check(b, 'Arrows', app.ui.showCurrentArrows, (v) => { app.ui.showCurrentArrows = v; });
    color(b, 'Overlay color', app.ui.currentIndicatorColor, (v) => { app.ui.currentIndicatorColor = v; });
    slider(b, 'Pulse brightness', 0.2, 2, 0.05, app.ui.currentIndicatorStrength, '×', (v) => {
      app.ui.currentIndicatorStrength = v;
    });
    slider(b, 'Pulse speed', 0.1, 3, 0.05, app.ui.currentPulseSpeed, '×', (v) => {
      app.ui.currentPulseSpeed = v;
    });
    slider(b, 'Pulse spacing', 60, 320, 5, app.ui.currentPulseSpacing, ' px', (v) => {
      app.ui.currentPulseSpacing = v;
    });
    slider(b, 'Pulse width', 0.02, 0.18, 0.005, app.ui.currentPulseWidth, '', (v) => {
      app.ui.currentPulseWidth = v;
    });
    slider(b, 'Comet tail', 0.6, 8, 0.1, app.ui.currentCometTail, '×', (v) => {
      app.ui.currentCometTail = v;
    });
    slider(b, 'Comet arrow size', 0.25, 2, 0.05, app.ui.currentCometHeadSize, '×', (v) => {
      app.ui.currentCometHeadSize = v;
    });
    slider(b, 'Track width', 4, 24, 1, app.ui.currentTrackWidth, ' px', (v) => {
      app.ui.currentTrackWidth = v;
      app.rebuildCurrentOverlay();
    });
    slider(b, 'Path offset X', -80, 80, 1, app.ui.currentPathOffsetX ?? 0, ' px', (v) => {
      app.ui.currentPathOffsetX = v;
      app.rebuildCurrentOverlay();
    });
    slider(b, 'Path offset Y', -80, 80, 1, app.ui.currentPathOffsetY ?? 0, ' px', (v) => {
      app.ui.currentPathOffsetY = v;
      app.rebuildCurrentOverlay();
    });
    slider(b, 'Arrow spacing', 120, 700, 20, app.ui.currentArrowSpacing, ' px', (v) => {
      app.ui.currentArrowSpacing = v;
      app.rebuildCurrentOverlay();
    });
    slider(b, 'Arrow size', 0.4, 2, 0.05, app.ui.currentArrowSize, '×', (v) => {
      app.ui.currentArrowSize = v;
      app.rebuildCurrentOverlay();
    });
    color(b, 'Arrow color', app.ui.currentArrowColor, (v) => { app.ui.currentArrowColor = v; });
    slider(b, 'Arrow brightness', 0.2, 2, 0.05, app.ui.currentArrowStrength, '×', (v) => {
      app.ui.currentArrowStrength = v;
    });
  }

  // ---------- FILINGS ----------
  {
    const b = S('FILINGS');
    slider(b, 'Responsive filings', 500, app.params.maxResponsiveFilings ?? app.params.maxVisualParticles, 100, app.params.sprinkleCount, '', (v) => {
      app.params.sprinkleCount = v;
    });
    slider(b, 'Stray filings', 1, 9000, 1, app.params.strayCount, '', (v) => {
      app.params.strayCount = v;
    });
    select(b, 'Pattern', [['sheet', 'whole cardboard'], ['disk', 'disk around wire'], ['ring', 'ring']],
      app.params.sprinklePattern, (v) => { app.params.sprinklePattern = v; });
    slider(b, 'Spread radius', 0.03, 0.19, 0.005, app.params.sprinkleR, ' m', (v) => {
      app.params.sprinkleR = v;
    });
    slider(b, 'Center density', 0, 1, 0.05, app.params.sprinkleClump, '', (v) => {
      app.params.sprinkleClump = v;
    });
    slider(b, 'Filing length', 0.15, 1.0, 0.05, app.params.filingMedianL * 1e3, ' mm', (v) => {
      app.params.filingMedianL = v * 1e-3;
      app.pushParams({ filingMedianL: app.params.filingMedianL });
      app.refreshDiagnostics();
    });
    slider(b, 'Hole radius', 6, 24, 0.5, app.cal.holeWallR * 1000, ' mm', (v) => {
      app.cal.holeWallR = v * 1e-3;
      app.calibrationChanged(false);
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
    slider(b, 'Board shake', 0, 3, 0.1, app.ui.boardShake, '×', (v) => {
      app.ui.boardShake = v;
    });
    slider(b, 'Global lift', 0, 1.5, 0.05, app.params.tapLiftAll, '×', (v) => {
      app.params.tapLiftAll = v;
      app.pushParams({ tapLiftAll: v });
    });
    slider(b, 'Filing jitter', 0, 1, 0.05, app.params.tapJitterAmount, '×', (v) => {
      app.params.tapJitterAmount = v;
      app.pushParams({ tapJitterAmount: v });
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
    check(b, 'Tap vibration cue', app.ui.tapVibration, (v) => { app.ui.tapVibration = v; });
  }

  // ---------- FIELD RESPONSE ----------
  {
    const b = S('FIELD RESPONSE');
    check(b, 'Current can move pattern before tap', app.params.currentAutoAlign, (v) => {
      app.params.currentAutoAlign = v; app.pushParams({ currentAutoAlign: v });
    });
    slider(b, 'Current motion', 0, 1.5, 0.05, app.params.currentMotion, '×', (v) => {
      app.params.currentMotion = v; app.pushParams({ currentMotion: v });
    });
    slider(b, 'Affected radius', 0, 120, 1, affectedRadiusPercent(app), '%', (v) => {
      app.params.fieldReach30A = affectedRadiusMeters(app, v);
      app.pushParams({ fieldReach30A: app.params.fieldReach30A });
      app.rebuildFieldOverlay();
    });
    slider(b, '1/r falloff', 0.5, 2.2, 0.05, app.params.fieldFalloffPower, '', (v) => {
      app.params.fieldFalloffPower = v; app.pushParams({ fieldFalloffPower: v });
    });
    slider(b, 'Ring spacing', 3, 10, 0.25, app.params.chainSpacing * 1000, ' mm', (v) => {
      app.params.chainSpacing = v * 1e-3; app.pushParams({ chainSpacing: app.params.chainSpacing });
    });
    slider(b, 'Chain strength', 0, 2, 0.05, app.params.chainStrength, '×', (v) => {
      app.params.chainStrength = v; app.pushParams({ chainStrength: v });
    });
    slider(b, 'Inward pull', 0, 8, 0.25, app.params.inwardPull * 1000, ' mm', (v) => {
      app.params.inwardPull = v * 1e-3; app.pushParams({ inwardPull: app.params.inwardPull });
    });
    slider(b, 'Pull radius', 10, 150, 5, (app.params.pullRadius ?? 0.045) * 1000, ' mm', (v) => {
      app.params.pullRadius = v * 1e-3; app.pushParams({ pullRadius: app.params.pullRadius });
    });
    slider(b, 'Middle-line pull', 0, 6, 0.25, (app.params.axisPull ?? 0) * 1000, ' mm', (v) => {
      app.params.axisPull = v * 1e-3; app.pushParams({ axisPull: app.params.axisPull });
    });
    slider(b, 'Friction / stickiness', 0, 1, 0.05, app.params.visualFriction, '', (v) => {
      app.params.visualFriction = v; app.pushParams({ visualFriction: v });
    });
    slider(b, 'Slide amount', 0, 2, 0.05, app.params.slideAmount, '×', (v) => {
      app.params.slideAmount = v; app.pushParams({ slideAmount: v });
    });
    slider(b, 'Alignment speed', 1, 12, 0.25, app.params.alignSpeed, '×', (v) => {
      app.params.alignSpeed = v; app.pushParams({ alignSpeed: v });
    });
    slider(b, 'Rotation speed', 1, 16, 0.25, app.params.rotateSpeed, '×', (v) => {
      app.params.rotateSpeed = v; app.pushParams({ rotateSpeed: v });
    });
    hint(b, 'The outer edge of the affected radius stays still even when the board is tapped.');
  }

  // ---------- MAGNETIC FIELD ----------
  {
    const b = S('MAGNETIC FIELD');
    check(b, 'Field rings', app.ui.showFieldLines, (v) => { app.ui.showFieldLines = v; });
    color(b, 'Ring color', app.ui.fieldLineColor, (v) => { app.ui.fieldLineColor = v; });
    slider(b, 'Ring brightness', 0.2, 3, 0.05, app.ui.fieldLineStrength, '×', (v) => {
      app.ui.fieldLineStrength = v;
    });
    slider(b, 'Ring opacity', 0.05, 1, 0.05, app.ui.fieldLineOpacity ?? 0.32, '', (v) => {
      app.ui.fieldLineOpacity = v;
    });
    if (app.variant?.fieldOverlay === 'solenoid') {
      // Reveal the straight parallel field INSIDE the coil gradually while
      // explaining it — separate from the exterior loops behind the coil.
      slider(b, 'Inside-coil opacity', 0, 1, 0.02, app.ui.fieldBoreOpacity ?? 0.15, '', (v) => {
        app.ui.fieldBoreOpacity = v;
      });
    }
    slider(b, 'Max radius', 120, 2200, 10, app.ui.fieldMaxRadiusPx, ' px', (v) => {
      app.ui.fieldMaxRadiusPx = v;
      app.rebuildFieldOverlay();
    });
    slider(b, 'First radius', 8, 220, 1, app.ui.fieldFirstRadiusPx, ' px', (v) => {
      app.ui.fieldFirstRadiusPx = v;
      app.rebuildFieldOverlay();
    });
    slider(b, 'Radius multiplier', 1.1, 1.9, 0.01, app.ui.fieldRadiusMultiplier, '×', (v) => {
      app.ui.fieldRadiusMultiplier = v;
      app.rebuildFieldOverlay();
    });
    slider(b, 'Falloff curve', 0.6, 1.8, 0.05, app.ui.fieldFalloffCurve, '×', (v) => {
      app.ui.fieldFalloffCurve = v;
      app.rebuildFieldOverlay();
    });
    slider(b, 'Line count', 1, 36, 1, app.ui.fieldLineCount, '', (v) => {
      app.ui.fieldLineCount = v;
      app.rebuildFieldOverlay();
    });
    slider(b, 'Line thickness', 0.2, 3, 0.05, app.ui.fieldLineThickness, '×', (v) => {
      app.ui.fieldLineThickness = v;
      app.rebuildFieldOverlay();
    });
    slider(b, 'Line smoothness', 48, 240, 8, app.ui.fieldLineDetail, '', (v) => {
      app.ui.fieldLineDetail = v;
      app.rebuildFieldOverlay();
    });
    hint(b, 'Radii follow first radius × multiplier^(ring^falloff), so dense inner rings show the stronger 1/r field near the conductor.');
    subhead(b, 'FIELD MOTION');
    check(b, 'Pulses visible', app.ui.showFieldPulses, (v) => { app.ui.showFieldPulses = v; });
    check(b, 'Comets visible', app.ui.showFieldComets, (v) => { app.ui.showFieldComets = v; });
    check(b, 'Comet arrows', app.ui.showFieldCometHeads, (v) => { app.ui.showFieldCometHeads = v; });
    color(b, 'Motion color', app.ui.fieldMotionColor, (v) => { app.ui.fieldMotionColor = v; });
    slider(b, 'Motion brightness', 0.2, 3, 0.05, app.ui.fieldMotionStrength, '×', (v) => {
      app.ui.fieldMotionStrength = v;
    });
    slider(b, 'Motion speed', 0.05, 3, 0.05, app.ui.fieldMotionSpeed, '×', (v) => {
      app.ui.fieldMotionSpeed = v;
    });
    slider(b, 'Motion spacing', 30, 520, 5, app.ui.fieldMotionSpacing, ' px', (v) => {
      app.ui.fieldMotionSpacing = v;
      app.rebuildFieldOverlay();
    });
    slider(b, 'Pulse width', 0.015, 0.18, 0.005, app.ui.fieldPulseWidth, '', (v) => {
      app.ui.fieldPulseWidth = v;
    });
    slider(b, 'Comet tail', 0.6, 8, 0.1, app.ui.fieldCometTail, '×', (v) => {
      app.ui.fieldCometTail = v;
    });
    slider(b, 'Comet arrow size', 0.25, 2, 0.05, app.ui.fieldCometHeadSize, '×', (v) => {
      app.ui.fieldCometHeadSize = v;
      app.rebuildFieldOverlay();
    });
    slider(b, 'Motion thickness', 0.15, 1, 0.05, app.ui.fieldMotionThickness, '×', (v) => {
      app.ui.fieldMotionThickness = v;
    });
    subhead(b, 'FIELD ARROWS');
    check(b, 'Arrows visible', app.ui.showFieldArrows, (v) => { app.ui.showFieldArrows = v; });
    slider(b, 'Arrow density', 0.25, 3, 0.05, app.ui.fieldArrowDensity, '×', (v) => {
      app.ui.fieldArrowDensity = v;
      app.rebuildFieldOverlay();
    });
    slider(b, 'Arrow size', 0.4, 2.5, 0.05, app.ui.fieldArrowSize, '×', (v) => {
      app.ui.fieldArrowSize = v;
      app.rebuildFieldOverlay();
    });
    color(b, 'Arrow color', app.ui.fieldArrowColor, (v) => { app.ui.fieldArrowColor = v; });
    slider(b, 'Arrow brightness', 0.2, 3, 0.05, app.ui.fieldArrowStrength, '×', (v) => {
      app.ui.fieldArrowStrength = v;
    });
    slider(b, 'Arrow drift', 0, 2, 0.05, app.ui.fieldArrowSpeed, '×', (v) => {
      app.ui.fieldArrowSpeed = v;
    });
  }

  // ---------- COMPASS ----------
  if (app.variant?.compass) {
    const b = S('COMPASS');
    check(b, 'Show compass', app.ui.showCompass, (v) => { app.ui.showCompass = v; });
    slider(b, 'Size', 0.03, 0.11, 0.001, app.ui.compassSize, ' m', (v) => {
      app.ui.compassSize = v;
    });
    slider(b, 'Needle sensitivity', 0.2, 8, 0.1, app.ui.compassSensitivity, '×', (v) => {
      app.ui.compassSensitivity = v;
    });
    slider(b, 'Orbit radius', 0.03, 0.17, 0.001,
      app.compassPolar ? app.compassPolar().R : 0.09, ' m', (v) => {
        app.setCompassOrbitRadius(v);
      });
    slider(b, 'Orbit time', 2, 24, 0.5, app.ui.compassOrbitDur, ' s', (v) => {
      app.ui.compassOrbitDur = v;
    });
    const orbitBtn = document.createElement('button');
    orbitBtn.textContent = '⟳ Orbit once around the wire';
    orbitBtn.title = 'One smooth full revolution on the invisible circular track — the needle rides the field the whole way.';
    orbitBtn.onclick = () => app.liveCompassOrbit(app.ui.compassOrbitDur);
    b.appendChild(orbitBtn);
    const traceBtn = document.createElement('button');
    traceBtn.textContent = '☉ Trace rings one by one';
    traceBtn.title = 'Continuous-shot move: only ring 1 visible, the compass rides it for a full revolution, then ring 2 appears and the compass glides out and traces it too.';
    traceBtn.onclick = () => app.liveCompassTrace();
    b.appendChild(traceBtn);
    check(b, 'Flow revealed by compass', app.ui.fieldRevealMode, (v) => {
      app.ui.fieldRevealMode = v;
    });
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Drag the compass anywhere — dragging also sets the orbit circle. Orbit radius moves it closer to or farther from the conductor.';
    b.appendChild(hint);
    const reset = document.createElement('button');
    reset.textContent = '⌖ Reset position';
    reset.onclick = () => { app.ui.compassX = null; app.ui.compassY = null; };
    b.appendChild(reset);
  }

  // ---------- VIEW ----------
  {
    const b = S('VIEW', false);
    check(b, 'Clip filings to cardboard', app.ui.clipToCardboard, (v) => { app.ui.clipToCardboard = v; });
    select(b, 'Filing detail', [
      ['line', 'fast detailed strokes'],
      ['capsule', 'physical capsules'],
    ], app.ui.renderStyle, (v) => { app.ui.renderStyle = v; });
    slider(b, 'Filing visibility', 0.5, 2, 0.05, app.ui.filingVisibility, '×', (v) => {
      app.ui.filingVisibility = v;
    });
    slider(b, 'Stroke thickness', 0.35, 1.6, 0.05, app.ui.filingThickness, '×', (v) => {
      app.ui.filingThickness = v;
    });
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
    for (const p of app.presets || []) {
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
      ['webm', 'WebM'],
      ['mp4', 'MP4 if browser supports it'],
    ], app.ui.recFormat, (v) => { app.ui.recFormat = v; });
    select(b, 'FPS', [['24', '24 (film)'], ['25', '25'], ['30', '30'], ['48', '48'], ['60', '60']],
      String(app.ui.recFps), (v) => { app.ui.recFps = +v; });
    select(b, 'Canvas render', [
      ['native', 'native 2752 × 1536'],
      ['4k', 'true 4K 3840 × 2144'],
    ], app.ui.canvasRes ?? 'native', (v) => { app.setCanvasResolution(v); });
    select(b, 'Resolution', [
      ['2k', '2K film 2048 × 1152'],
      ['1080p', '1080p film 1920 × 1080'],
      ['native', 'native canvas size'],
      ['quick', 'quick 1280 × 720'],
    ], app.ui.recSize, (v) => { app.ui.recSize = v; });
    hint(b, 'For true 4K takes set Canvas render to 4K and Resolution to native — the frame is rendered at 4K, never upscaled.');
    select(b, 'Quality', [
      ['ultra', 'Ultra film (160 Mbps)'],
      ['high', 'High (90 Mbps)'],
      ['draft', 'Draft (45 Mbps)'],
    ], app.ui.recQuality, (v) => { app.ui.recQuality = v; });
    const row = document.createElement('div');
    row.className = 'ctl-row';
    const btn = document.createElement('button');
    btn.className = 'rec';
    btn.textContent = app.recording ? '■ Stop recording' : '● Start recording';
    btn.onclick = () => app.toggleRecording();
    app.el.recordPanelButton = btn;
    row.appendChild(btn);
    b.appendChild(row);
    const status = document.createElement('div');
    status.className = 'hint';
    status.textContent = app.recording ? 'recording...' : 'records exactly what you do live';
    app.el.recordStatus = status;
    b.appendChild(status);
  }

  // ---------- DIAGNOSTICS ----------
  {
    const b = S('DIAGNOSTICS', false);
    const d = document.createElement('div');
    d.className = 'diag';
    b.appendChild(d);
    app.el.diag = d;
    hint(b, 'This is now a fast visual animator. Use taps for the reveal and ' +
      'increase current after the first tap to bloom the arcs outward.');
  }

  app.refreshDiagnostics();
}

export function diagnosticsHTML(app, stats) {
  const p = app.params;
  const fmt = (x, u = '') => `<b>${x}</b>${u}`;
  return [
    `sim time ${fmt(stats.time.toFixed(2), ' s')} · awake ${fmt(stats.awake)} / ${fmt(stats.count)}`,
    `I(t) = ${fmt(stats.current.toFixed(1), ' A')}`,
    `visual mode: ${fmt(p.sprinkleCount.toLocaleString())} responsive + ${fmt((p.strayCount ?? 0).toLocaleString())} stray filings`,
    `affected radius: ${fmt((p.fieldReach30A * 1000).toFixed(0), ' mm')} @ 30 A · friction ${fmt(p.visualFriction.toFixed(2))}`,
    `worker: ${fmt(stats.stepMs.toFixed(1), ' ms')}/frame · preview ${fmt(stats.fps.toFixed(0), ' fps')}`,
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

function affectedRadiusPercent(app) {
  const ref = affectedRadiusReference(app);
  return ref > 0 ? (app.params.fieldReach30A / ref) * 100 : 0;
}

function affectedRadiusMeters(app, percent) {
  return affectedRadiusReference(app) * percent / 100;
}

function affectedRadiusReference(app) {
  return Math.max(0.001, app.cal?.sheetW ?? app.params.sheetW ?? 0.4);
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

function color(parent, label, value, onChange) {
  const row = document.createElement('div');
  row.className = 'ctl';
  const l = document.createElement('label');
  l.textContent = label;
  const c = document.createElement('input');
  c.type = 'color';
  c.value = value || '#ffffff';
  c.oninput = () => onChange(c.value);
  row.append(l, c);
  parent.appendChild(row);
  return c;
}

function subhead(parent, text) {
  const h = document.createElement('div');
  h.className = 'subhead';
  h.textContent = text;
  parent.appendChild(h);
  return h;
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
