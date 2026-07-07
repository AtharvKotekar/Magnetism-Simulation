#!/usr/bin/env python3
"""Extract the embedded PNG layers from Assets/BASE.svg into tool/assets/.

Layers:
  image0.png  2752x1536 RGB   full film keyframe
  image1.png  2752x1536 RGBA  cardboard sheet alpha cutout
  image2.png  3016x1198 RGBA  crossbar + wire occluder (composited at 0.5x at px 1244,313)
"""
import re
import base64
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SVG = ROOT.parent / "Assets" / "BASE.svg"
OUT = ROOT / "assets"

NAME_MAP = {
    "image0_1_25": "image0.png",
    "image1_1_25": "image1.png",
    "image2_1_25": "image2.png",
}


def main():
    OUT.mkdir(exist_ok=True)
    data = SVG.read_text()
    found = re.findall(
        r'<image id="([^"]+)" width="(\d+)" height="(\d+)"[^>]*'
        r'xlink:href="data:image/png;base64,([^"]+)"',
        data,
    )
    if len(found) != 3:
        raise SystemExit(f"expected 3 embedded images in {SVG}, found {len(found)}")
    for iid, w, h, b64 in found:
        name = NAME_MAP.get(iid, iid + ".png")
        raw = base64.b64decode(b64)
        (OUT / name).write_bytes(raw)
        print(f"{name}: {w}x{h}, {len(raw)} bytes")


if __name__ == "__main__":
    main()
