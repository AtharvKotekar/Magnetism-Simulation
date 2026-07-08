# Magnetism Simulation — project notes for Claude

Film-production tool for an AI-generated film about magnetism: a browser app
that renders an art-directable iron-filings animation composited pixel-exactly
onto film keyframes, and records deterministic takes. Two experiment variants
share one codebase:

- **Straight wire** (Oersted shot) — served from `tool/`, keyframe
  `Assets/BASE.svg` (layers extracted to `tool/assets/` by
  `tool/extract_assets.py`).
- **Coil** (loop through the board) — served from `coil/`, keyframe layers in
  `coil/assets/`, activated by `window.MAGNETISM_VARIANT = 'coil'` and
  configured in `tool/js/variant.js`. `image0-rev.png` is the same keyframe
  with the cell flipped; the renderer swaps to it whenever the signed DC
  direction is right-to-left (never on AC oscillation). `coil-x2.png` /
  `coil-x3.png` are multi-turn conductor bundles (panel → Coil turns):
  placed via `COIL_TURNS` rects so their feet sit on the holes and the
  outermost tube covers the arch baked into image0; each tube carries its
  own ray-traced current path. Visual only — the field model does not scale
  with turn count.

## Run

```bash
# from the repo root (required for the coil page, which references ../tool/)
python3 -m http.server 8745
# straight variant: http://localhost:8745/tool/
# coil variant:     http://localhost:8745/coil/
```

Use Chrome/Edge (WebGL2 + MediaRecorder). `.claude/launch.json` has
`magnetism-stage` (tool/ only, port 8734) and `magnetism-root` (repo root,
port 8745).

## Hard constraints

- **Keyframes stay pixel-identical.** With zero filings the render must match
  the original frame exactly. Filings (plus overlays) composite *between* the
  cardboard layer (image1 alpha) and the wire/coil occluder (image2).
- **Determinism.** Same seed + params + timeline + calibration ⇒
  frame-identical footage (take hash bottom-right fingerprints the recipe).
  No `Math.random`/`Date` in the worker — only the seeded RNG.
- The sim is a *visual animator*, not a physics solver: filings only
  reorganize while a tap is "live" (~0.6 s); current alone never moves a
  settled pattern (torque < static friction). This is intentional film
  behavior — keep it.

## Architecture (no build step, ES modules)

- `tool/js/main.js` — orchestrator: worker, homography, render loop, presets,
  recording. `loadPreset` must call `rebuildHomography()` when a preset
  carries calibration (it does — don't remove it, preset cal is otherwise
  silently ignored).
- `tool/js/variant.js` — variant configs (`straight` / `coil`), coil presets
  and `COIL_CALIBRATION` (measured from the keyframe, see below).
- `tool/js/sim/worker.js` — the animator. `updateTargets` = straight wire
  (rings around the hole); `updateCoilTargets` = coil.
- `tool/js/render/overlays.js` — current-path comets (image px) and
  field-line overlays (plane meters through the homography).
  `buildFieldLines` = straight (concentric rings), `buildCoilFieldLines` =
  coil (see below).
- `tool/js/render/homography.js` — DLT plane fit from the 4 corner pins.
- `tool/js/ui/…` — panel, timeline editor, calibration pins, presets.

## Coil physics convention (do not regress)

The loop's legs pierce the board with **antiparallel** currents. The in-plane
field is therefore that of two opposite line currents:

- Field lines = **Apollonius circles** of the two holes (level sets of
  `u = ln(da/db)`), circling each hole, straightening into the coil-axis line
  on the perpendicular bisector. Filings between the holes align
  **perpendicular to the hole–hole axis** (flux through the loop), NOT
  hole-to-hole. The holes are *not* magnet poles — never model them as a
  monopole pair.
- Worker: `H(dir=+1) = rot90(∇u)` — dir = +1 means current up the **left**
  leg ("left-to-right around the loop"). Chain bands quantize `u` with a
  constant step, giving ring spacing proportional to hole distance.
- Overlay polylines are wound along `H(dir=-1)` because the dash shader moves
  comets toward decreasing arc for dir = +1. The head-triangle speed/dir signs
  in `drawFieldVectorCometHeads` / `drawFieldVectorArrowSet` must match the
  dash shader (`o.dir < 0 ? 1 : -1`) or heads travel against their tails.
- Overlay lines are clipped to the sheet rectangle (`sheetW/sheetH/clipMargin`
  options) so nothing draws past the cardboard.
- The inward pull toward a leg is faded out beyond ~4 cm (`pullZone` in
  `updateCoilTargets`). A constant pull everywhere drains the center strip
  over repeated taps (its sign flips at the bisector), opening a bare gap
  between the conductors that the real experiment never shows.

`COIL_CALIBRATION` in variant.js was **measured from the keyframe**: corners
fitted to the image1 alpha edges (bottom corners on the top-surface front
edge, y≈1400 — the alpha extends lower onto the dark board front face), holes
from dark blobs in image0 at (857,742)/(2071,741), arch apex (1448,337) from
image2 alpha, wireHeight ≈ loop radius 0.118 m. If the keyframe changes,
re-measure rather than eyeballing.

## Gotchas

- `img.decode()` hangs forever in occluded/background tabs — `loadTexture`
  in `gl.js` deliberately races it against a timeout after `onload`. Don't
  "simplify" back to plain `await img.decode()`.
- Chrome throttles rAF in hidden tabs; for scripted verification drive the
  sim with `app.paused = true` + `await app.stepFrame(1/24, 1)` (deterministic,
  same path the recorder uses) instead of waiting wall-clock.
- Calibration persists in localStorage per variant key; presets embed a `cal`
  block that overrides it on load.
- Worker perf traps already fixed once (don't reintroduce): neighbor work per
  frame not per substep; wake scans must use torque at the filing's actual
  orientation.

## After code changes

Run `graphify update .` (AST-only, no API cost) to keep `graphify-out/` fresh.
