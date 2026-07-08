# Magnetism Simulation

Browser-based iron-filings simulation and recording tool for the Oersted
experiment shot.

## Run locally

```bash
cd tool
python3 -m http.server 8734
```

Then open `http://localhost:8734/`.

Recording is manual: press Record, run the simulation, press Stop recording,
and the browser downloads the captured video. The default recording preset is
2K film-style output at 24 fps, with 1080p available in the Record panel.

The app itself lives in `tool/`. See [`tool/README.md`](tool/README.md) for
usage notes, recording settings, and physics details.
