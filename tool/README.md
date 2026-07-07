# Magnetism Stage

A film-production tool that renders a **physically accurate iron-filings
simulation directly onto the film keyframe** (`Assets/BASE.svg`) and records
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

## Why it doesn't look like a schoolbook diagram (on purpose)

For a 0.5 mm filing 1 cm from a 20–30 A wire, the magnetic torque is ~5×
*weaker* than static friction, and the pull toward the wire is ~150× weaker
than sliding friction. So, exactly as in the real experiment:

- Nothing moves when the current switches on. **Tapping** breaks static
  friction; filings align mostly *while airborne* for ~20 ms per tap.
- Alignment is strong near the wire and decays with 1/r — arcs get ragged
  and incomplete with distance. No neat full rings.
- Filings link tip-to-tip into short **chains** (dipole–dipole interaction);
  chains get dramatic at high current (try the 80 A preset).
- A dense collar of filings climbs against the hole rim (field gradient).
- DC **reversal is invisible in pure physics** (induced torque ∝ H²). The
  small remanence slider (Physics section) is the physically-honest knob that
  makes "reverse & re-align" readable. AC makes the near-wire zone shimmer.

The model per filing: demag-limited magnetization with saturation
(χ∥ ≈ 18, χ⊥ ≈ 2 from prolate shape anisotropy), field torque, gradient
force, pairwise dipole forces/torques, capsule contacts, Coulomb
static/kinetic friction, tap launches with restitution, and sleeping for
performance. All in SI units; the Diagnostics panel shows the Γ = 1 radius
(inside it, torque beats friction — spontaneous alignment).

## Staging a take

- **Timeline** (bottom): a take is a list of events — sprinkle, current
  on/off/AC, taps, auto-tap, clear. Edit times inline, add events, or turn on
  *log live actions* and drive the panel by hand to write the timeline.
- **Presets** (side panel): classic reveal, high-current chains, tap-vs-no-tap,
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
- For quick review exports, use the default draft setup: 1376×768, draft
  lines, 1/4 filing density, no shadows, and 24 physics substeps/frame.
- For final beauty exports, switch Recording → Filing detail to capsules,
  Filing density to full, Record shadows on, native resolution, and 48+
  physics substeps/frame.

## Layout

- `js/sim/` — physics: engine (forces/integrator/taps/sleeping), field &
  current driver, particles, spatial hash, timeline, seeded RNG, worker.
- `js/render/` — WebGL2: scene layer compositing, instanced filing renderer
  (homography-projected, Kajiya–Kay fiber shading), overlays (flow dashes,
  field-line preview, calibration grid), homography/DLT math.
- `js/ui/` — panel, timeline editor, calibration pins, presets.
- `js/record/` — frame-stepped recorder, mp4/webm via vendored muxers,
  PNG-sequence sink, store-only zip fallback.

Physics runs in a Web Worker on typed arrays; render state streams to the
main thread as transferable buffers (zero copy). No build step.
