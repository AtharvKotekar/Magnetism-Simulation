# Magnetism Stage

A film-production tool that renders a **fast, art-directable iron-filings
animation directly onto the film keyframe** (`Assets/BASE.svg`) and records
takes at film FPS/formats. Built for the Oersted-experiment shot: vertical
copper wire through a cardboard sheet, current on, tap the board, the filings
arrange along the magnetic field.

The keyframe is preserved pixel-for-pixel — with zero filings the render is
identical to the original frame. Only the filings (plus an optional
current-flow indicator) are added, composited *between* the cardboard layer
and the crossbar/wire cutout that both live inside BASE.svg.

## Run it

```bash
cd tool
python3 extract_assets.py   # once: pulls the 3 PNG layers out of ../Assets/BASE.svg
python3 -m http.server 8734
# open http://localhost:8734 in Chrome or Edge
```

**Use Chrome/Edge on the recording workstation** — recording uses WebCodecs
(MP4/WebM) and the File System Access API (PNG sequences).

## Why it is fast now

The original prototype tried to simulate every filing with forces, contacts,
neighbor searches, friction, and dipole interaction. That was useful for
thinking, but too slow for staging and recording shots.

The current worker is a lightweight deterministic visual animator:

- Filings start scattered randomly.
- Current can be turned on without forcing an immediate move.
- Tapping wakes the filings and steers them toward tangential circular arcs.
- Increasing current after the first tap expands the aligned region outward.
- Lift, jitter, and board vibration are visual cues, not physical integration.

This is intentionally cheated for clean video output.

## Staging a take

- **Timeline** (bottom): a take is a list of events — sprinkle, current
  on/off/AC, taps, auto-tap, clear. Edit times inline, add events, or turn on
  *log live actions* and drive the panel by hand to write the timeline.
- **Presets** (side panel): classic reveal, high-current bloom, tap-vs-no-tap,
  AC shimmer, reverse & re-align, bare stage.
- **Space bar** = tap the board.
- **Filing detail** (View section) can switch the preview between low-cost
  projected lines and the full shaded capsule renderer. From this camera angle
  the line mode still reads as iron filings but is much faster.
- **Preview density** (View section) can draw 1/2, 1/4, or 1/8 of the filings
  while you work.
- **Lift visibility** and **Board vibration cue** (Tap section) make the tap
  read cinematically: filings visibly hop, translate, and rotate while the
  board gives a short damped vibration.
- **Motion Cheat** controls how strongly current changes and taps steer the
  pattern. This is the main place to tune the shot.
- **Calibration** (View section): drag the 4 corner pins onto the cardboard
  corners, the hole pin onto the hole, the wire-top pin to where the wire
  meets the crossbar; set the physical sheet size. Persisted in the browser.
  The orange grid shows the fitted plane.
- Determinism: same seed + same timeline + same settings ⇒ frame-identical
  footage. The take hash (bottom right) fingerprints the whole recipe.

## Recording

`● Record` restarts the take from t = 0 and renders frame-by-frame,
decoupled from wall clock (slower than realtime, full quality, deterministic).

- **MP4 (H.264)** or **WebM (VP9)** — downloads video + a JSON sidecar with
  every parameter needed to re-render the take.
- **PNG sequence** — pick an output folder (Chrome). Optional **alpha pass**
  writes `filings_alpha_#####.png` (filings + shadows only, premultiplied
  alpha, wire occlusion punched out) for compositing in your pipeline.
  Without folder access it falls back to a single .zip download.
- FPS: 24 / 25 / 30 / 48 / 60. Resolution up to the native 2752×1536.
- The default setup is now meant to record: native resolution, draft lines,
  full visual density, no shadows, and 1 animation step/frame.
- For a slightly richer look, switch Recording → Filing detail to capsules or
  turn Record shadows on.

## Layout

- `js/sim/` — visual animation worker, timeline, seeded RNG, and legacy
  physics modules kept for reference.
- `js/render/` — WebGL2: scene layer compositing, instanced filing renderer
  (homography-projected, Kajiya–Kay fiber shading), overlays (flow dashes,
  field-line preview, calibration grid), homography/DLT math.
- `js/ui/` — panel, timeline editor, calibration pins, presets.
- `js/record/` — frame-stepped recorder, mp4/webm via vendored muxers,
  PNG-sequence sink, store-only zip fallback.

Animation runs in a Web Worker on typed arrays; render state streams to the
main thread as transferable buffers. No build step.
