#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
import json

PUB = Path("/workspace/public")
chars = sorted((PUB / "assets/chars").glob("*.png"))
props = sorted((PUB / "assets/props").glob("*.png"))
texs = sorted((PUB / "assets/tex").glob("*.jpg"))
blds = sorted((PUB / "assets/bld").glob("*.png")) if (PUB / "assets/bld").exists() else []

FRAMES = {
    "prop_lamp_on": 4,
}

assets = {}
for p in texs:
    assets[p.stem] = {"kind": "texture", "data": f"assets/tex/{p.name}?v=4"}

def sprite_rec(p: Path, rel: str) -> dict:
    im = Image.open(p)
    w, h = im.size
    frames = FRAMES.get(p.stem, 1)
    dirs = 1
    # 4-dir vertical strip: 56x304 or similar
    if h >= w * 3 and w <= 80:
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
        "clips": [{"key": "idle", "frames": frames}],
        "sheets": {"idle": f"{rel}?v=4"},
    }

for p in chars:
    assets[p.stem] = sprite_rec(p, f"assets/chars/{p.name}")

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
