#!/usr/bin/env python3
"""Chroma-key Grok 4x4 walk sheets into engine idle + walk strips."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

RAW = Path("/workspace/artifacts/imagine_images")
OUT = Path("/workspace/game/assets/chars")
OUT_BLD = Path("/workspace/game/assets/bld")
ASSET_JS = Path("/workspace/game/asset-data.js")
PREVIEW = Path("/workspace/artifacts/walk_preview")
PREVIEW.mkdir(parents=True, exist_ok=True)

CELL_W, CELL_H = 56, 76
WALK_FRAMES = 4
DIRS = 4

# generated filename -> game asset id
WALK_MAP = {
    "walk_haeju.png": "agent_haeju",
    "walk_mujin.png": "agent_mujin",
    "walk_dochi.png": "agent_dochi",
    "walk_wolsim.png": "agent_wolsim",
    "walk_acolyte.png": "guard_acolyte",
    "walk_steward.png": "guard_steward",
    "walk_soldier.png": "guard_soldier",
    "walk_sailor.png": "guard_sailor",
    "walk_priest.png": "guard_priest",
    "walk_villager.png": "civil_villager",
    "walk_believer.png": "civil_believer",
    "walk_patient.png": "civil_patient",
    "walk_child.png": "civil_child",
    "walk_prisoner.png": "civil_prisoner",
}

# engine dir 0=+tx SE, 1=+ty SW, 2=-tx NW, 3=-ty NE
# default generated rows already match; override if a sheet is rotated
DIR_ORDER = {
    # row indices in the generated sheet for engine dirs 0..3
}


def chroma(im: Image.Image, dist: float = 72) -> Image.Image:
    im = im.convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    d_mag = np.sqrt((r - 255) ** 2 + (g - 0) ** 2 + (b - 255) ** 2)
    # true chroma key + jpeg ringing + foot ovals (pink, not navy cloth)
    mag = (r > 190) & (b > 185) & (g < 95)
    oval = (r > 200) & (b > 130) & (g < 170) & ((r + b) > (g * 2.4 + 80))
    arr[..., 3] = np.where((d_mag < dist) | mag | oval, 0, a)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def trim(im: Image.Image, pad: int = 2) -> Image.Image:
    a = np.asarray(im.split()[-1])
    ys, xs = np.where(a > 16)
    if len(xs) == 0:
        return im
    x0, x1 = max(0, int(xs.min()) - pad), min(im.width, int(xs.max()) + pad + 1)
    y0, y1 = max(0, int(ys.min()) - pad), min(im.height, int(ys.max()) + pad + 1)
    return im.crop((x0, y0, x1, y1))


def fit_feet(im: Image.Image, w: int, h: int) -> Image.Image:
    im = trim(im)
    if im.width < 4 or im.height < 4:
        return Image.new("RGBA", (w, h), (0, 0, 0, 0))
    scale = min((w - 2) / im.width, (h - 2) / im.height)
    nw, nh = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(im, ((w - nw) // 2, h - nh), im)
    return canvas


def split_4x4(im: Image.Image):
    w, h = im.size
    cw, ch = w // 4, h // 4
    cells = []
    for row in range(4):
        line = []
        for col in range(4):
            line.append(im.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)))
        cells.append(line)
    return cells


def assemble_walk(cells, order):
    sheet = Image.new("RGBA", (CELL_W * WALK_FRAMES, CELL_H * DIRS), (0, 0, 0, 0))
    idle = Image.new("RGBA", (CELL_W, CELL_H * DIRS), (0, 0, 0, 0))
    for dest_dir, src_row in enumerate(order):
        row = cells[src_row]
        for f, cell in enumerate(row):
            fitted = fit_feet(cell, CELL_W, CELL_H)
            sheet.paste(fitted, (f * CELL_W, dest_dir * CELL_H), fitted)
            if f == 1:  # passing frame ≈ idle
                idle.paste(fitted, (0, dest_dir * CELL_H), fitted)
    return sheet, idle


def process_wall():
    src = RAW / "wall_iso.png"
    if not src.exists():
        return
    im = chroma(Image.open(src))
    im = fit_feet(im, 96, 108)
    out = OUT_BLD / "bld_wall.png"
    im.save(out, "PNG")
    print("wall", im.size, out.stat().st_size)


def rewrite_asset_data():
    text = ASSET_JS.read_text()
    prefix = "const ASSET_DATA = "
    if not text.startswith(prefix):
        raise SystemExit("unexpected asset-data.js")
    data = json.loads(text[len(prefix):].rstrip().rstrip(";"))
    assets = data["assets"]
    for name in WALK_MAP.values():
        rec = assets.get(name)
        if not rec:
            continue
        rec["dirs"] = 4
        rec["cellW"] = CELL_W
        rec["cellH"] = CELL_H
        rec["anchorX"] = CELL_W // 2
        rec["anchorY"] = CELL_H - 4
        rec["clips"] = [
            {"key": "idle", "frames": 1},
            {"key": "walk", "frames": WALK_FRAMES},
        ]
        rec["sheets"] = {
            "idle": f"assets/chars/{name}.png?v=5",
            "walk": f"assets/chars/{name}_walk.png?v=5",
        }
    wall = assets.get("bld_wall")
    if wall:
        wall["cellW"] = 96
        wall["cellH"] = 108
        wall["anchorX"] = 48
        wall["anchorY"] = 106
        wall["sheets"] = {"idle": "assets/bld/bld_wall.png?v=5"}
        wall["clips"] = [{"key": "idle", "frames": 1}]
    # bump texture cache bust
    for k, v in assets.items():
        if v.get("kind") == "texture" and isinstance(v.get("data"), str):
            v["data"] = v["data"].split("?")[0] + "?v=5"
        if "sheets" in v:
            for sk, sv in v["sheets"].items():
                if isinstance(sv, str) and "?v=" in sv:
                    v["sheets"][sk] = sv.split("?")[0] + "?v=5"
    ASSET_JS.write_text(prefix + json.dumps(data, ensure_ascii=False) + ";\n")
    print("wrote", ASSET_JS, "assets", len(assets))


def main():
    default_order = [0, 1, 2, 3]
    for fn, name in WALK_MAP.items():
        src = RAW / fn
        if not src.exists():
            print("missing", fn)
            continue
        im = chroma(Image.open(src))
        cells = split_4x4(im)
        order = DIR_ORDER.get(name, default_order)
        walk, idle = assemble_walk(cells, order)
        walk_path = OUT / f"{name}_walk.png"
        idle_path = OUT / f"{name}.png"
        walk.save(walk_path, "PNG")
        idle.save(idle_path, "PNG")
        preview = Image.new("RGBA", (walk.width + 8 + idle.width, walk.height), (30, 20, 28, 255))
        preview.paste(walk, (0, 0), walk)
        preview.paste(idle, (walk.width + 8, 0), idle)
        preview.convert("RGB").save(PREVIEW / f"{name}.jpg", "JPEG", quality=85)
        print(name, "walk", walk.size, walk_path.stat().st_size, "idle", idle_path.stat().st_size)
    process_wall()
    rewrite_asset_data()


if __name__ == "__main__":
    main()
