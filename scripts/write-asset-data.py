#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
import json

PUB = Path("/workspace/game")
CACHE_VERSION = 6
chars = sorted((PUB / "assets/chars").glob("*.png"))
props = sorted((PUB / "assets/props").glob("*.png"))
texs = sorted((PUB / "assets/tex").glob("*.jpg"))
blds = sorted((PUB / "assets/bld").glob("*.png")) if (PUB / "assets/bld").exists() else []

FRAMES = {
    "prop_lamp_on": 4,
}

assets = {}
for p in texs:
    assets[p.stem] = {"kind": "texture", "data": f"assets/tex/{p.name}?v={CACHE_VERSION}"}

def sprite_rec(p: Path, rel: str) -> dict:
    im = Image.open(p)
    w, h = im.size
    frames = FRAMES.get(p.stem, 1)
    dirs = 1
    # walk sheet: 224x304 = 4 frames x 4 dirs
    if p.stem.endswith("_walk") and w >= 160 and h >= 240:
        dirs = 4
        frames = 4
        cell_w, cell_h = w // 4, h // 4
    elif h >= w * 3 and w <= 80:
        dirs = 4
        frames = 1
        cell_w, cell_h = w, h // 4
    else:
        cell_w, cell_h = w // frames, h
    return {
        "dirs": dirs,
        "cellW": cell_w,
        "cellH": cell_h,
        "anchorX": cell_w // 2,
        "anchorY": cell_h - 4 if any(k in p.stem for k in ("agent", "guard", "civil")) else cell_h - 2,
        "clips": [{"key": "idle" if not p.stem.endswith("_walk") else "walk", "frames": frames}],
        "sheets": {
            ("walk" if p.stem.endswith("_walk") else "idle"):
            f"{rel}?v={CACHE_VERSION}"
        },
    }

for p in chars:
    rec = sprite_rec(p, f"assets/chars/{p.name}")
    if p.stem.endswith("_walk"):
        base = p.stem[:-5]
        if base in assets:
            assets[base]["clips"] = [
                {"key": "idle", "frames": 1},
                {"key": "walk", "frames": rec["clips"][0]["frames"]},
            ]
            assets[base]["sheets"]["walk"] = rec["sheets"]["walk"]
            assets[base]["dirs"] = 4
            assets[base]["cellW"] = rec["cellW"]
            assets[base]["cellH"] = rec["cellH"]
            assets[base]["anchorX"] = rec["anchorX"]
            assets[base]["anchorY"] = rec["anchorY"]
        continue
    assets[p.stem] = rec

for p in props:
    assets[p.stem] = sprite_rec(p, f"assets/props/{p.name}")

for p in blds:
    assets[p.stem] = sprite_rec(p, f"assets/bld/{p.name}")

data = {"assets": assets}
js = "const ASSET_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n"
(PUB / "asset-data.js").write_text(js)
print("assets", len(assets), "bytes", len(js))
for k in sorted(assets):
    print(" ", k)
