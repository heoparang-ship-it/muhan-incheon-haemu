#!/usr/bin/env python3
"""Joseon Commandos asset baker.

- Punch leftover magenta from character strips
- Build 4-dir x 4-frame walk sheets from idle poses
- Cut a ship occluder from the painted ground (MA2-style overlay)
- Bake a few isometric 3D dock props (barrel, lantern) as original art
"""
from __future__ import annotations

from pathlib import Path
import json
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
CHARS = ROOT / "game/assets/chars"
MAPS = ROOT / "game/assets/maps"
OBJ = MAPS / "obj"
PROPS = ROOT / "game/assets/props"
ASSET_JS = ROOT / "game/asset-data.js"

CELL_W, CELL_H = 56, 76
PERSON_PX = 60


def punch_magenta(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    arr = np.array(im, dtype=np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    d = np.sqrt((r - 255.0) ** 2 + (g - 0.0) ** 2 + (b - 255.0) ** 2)
    key = (d < 90) | ((r > 200) & (b > 200) & (g < 90))
    a = np.where(key, 0, a)
    # fringe: pull remaining magenta toward neighbor
    fringe = (d < 140) & (a > 0) & ~key
    a = np.where(fringe, a * 0.15, a)
    arr[..., 3] = a
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def split_dirs(im: Image.Image):
    w, h = im.size
    if h >= w * 3 and w <= 90:
        ch = h // 4
        return [im.crop((0, i * ch, w, (i + 1) * ch)) for i in range(4)], w, ch
    return [im], w, h


def stride_frame(cell: Image.Image, sign: int) -> Image.Image:
    """Fake a walk frame: bob + slight lean + lower-body shear."""
    w, h = cell.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bob = -1 if sign == 0 else (1 if sign > 0 else 0)
    lean = 3.2 * sign
    shifted = cell.rotate(lean, resample=Image.BICUBIC, expand=False)
    # shear lower half sideways
    arr = np.array(shifted, dtype=np.uint8)
    mid = int(h * 0.55)
    dx = int(round(2.4 * sign))
    if dx:
        lower = arr[mid:]
        rolled = np.roll(lower, dx, axis=1)
        if dx > 0:
            rolled[:, :dx] = 0
        else:
            rolled[:, dx:] = 0
        arr[mid:] = rolled
    shifted = Image.fromarray(arr, "RGBA")
    out.paste(shifted, (0, bob), shifted)
    return out


def make_walk_sheet(idle: Image.Image) -> Image.Image:
    dirs, cw, ch = split_dirs(idle)
    sheet = Image.new("RGBA", (cw * 4, ch * len(dirs)), (0, 0, 0, 0))
    for d, cell in enumerate(dirs):
        frames = [
            stride_frame(cell, 0),
            stride_frame(cell, 1),
            stride_frame(cell, 0),
            stride_frame(cell, -1),
        ]
        for f, fr in enumerate(frames):
            sheet.paste(fr, (f * cw, d * ch), fr)
    return sheet


def extract_ship_occluder(ground: Image.Image) -> Image.Image:
    """Keep left ship / sail / hull, punch dirt and water."""
    im = ground.convert("RGBA")
    arr = np.array(im, dtype=np.float32)
    h, w = arr.shape[:2]
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    # dirt / mud tan
    dirt = (r > 90) & (g > 70) & (b > 40) & (r > g) & (g > b) & ((r - b) < 110) & (r < 210)
    # water / fog blue-gray
    water = (b > r + 8) & (b > 70) & (g > 70)
    # sky fog
    fog = (r > 160) & (g > 170) & (b > 180) & (abs(r - g) < 25)
    keep_x = np.zeros((h, w), dtype=bool)
    keep_x[:, : int(w * 0.42)] = True
    ship = keep_x & ~dirt & ~water & ~fog
    # also keep bright sails in left third
    sail = keep_x & (r > 200) & (g > 195) & (b > 185) & (r - b < 40)
    mask = ship | sail
    # dilate a little so ropes stay
    p = np.pad(mask, 1, constant_values=False)
    mask = (
        p[:-2, 1:-1] | p[1:-1, :-2] | p[1:-1, 1:-1] | p[1:-1, 2:] | p[2:, 1:-1]
    )
    arr[..., 3] = np.where(mask, a, 0)
    out = Image.fromarray(arr.astype(np.uint8), "RGBA")
    # crop to content
    bbox = out.getbbox()
    if not bbox:
        return out
    cropped = out.crop(bbox)
    return cropped


def iso_project(x, y, z):
    return (x - y), (x + y) / 2 - z


def draw_iso_box(draw, ox, oy, w, d, h, top, left, right):
    # origin at front-bottom of box in iso space
    pts = {}
    for name, (x, y, z) in {
        "flb": (0, 0, 0),
        "frb": (w, 0, 0),
        "blb": (0, d, 0),
        "brb": (w, d, 0),
        "flt": (0, 0, h),
        "frt": (w, 0, h),
        "blt": (0, d, h),
        "brt": (w, d, h),
    }.items():
        px, py = iso_project(x, y, z)
        pts[name] = (ox + px, oy + py)

    def face(keys, fill, outline=None):
        draw.polygon([pts[k] for k in keys], fill=fill, outline=outline or fill)

    face(("flt", "frt", "brt", "blt"), top)
    face(("flt", "frt", "frb", "flb"), left)
    face(("frt", "brt", "brb", "frb"), right)


def bake_barrel() -> Image.Image:
    im = Image.new("RGBA", (120, 140), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ox, oy = 60, 118
    # stacked rings as short iso cylinders approximated by boxes
    for i, (hh, col_t, col_l, col_r) in enumerate(
        [
            (10, (92, 62, 36, 255), (72, 48, 28, 255), (54, 36, 20, 255)),
            (22, (118, 78, 44, 255), (96, 64, 36, 255), (74, 48, 26, 255)),
            (10, (86, 58, 32, 255), (68, 46, 26, 255), (50, 34, 18, 255)),
            (22, (118, 78, 44, 255), (96, 64, 36, 255), (74, 48, 26, 255)),
            (10, (92, 62, 36, 255), (72, 48, 28, 255), (54, 36, 20, 255)),
        ]
    ):
        oy_i = oy - i * 14
        draw_iso_box(d, ox, oy_i, 28, 28, hh, col_t, col_l, col_r)
    # hoop highlights
    d.ellipse((ox - 22, oy - 78, ox + 22, oy - 66), outline=(40, 28, 16, 220), width=2)
    return im.filter(ImageFilter.SMOOTH_MORE)


def bake_lantern() -> Image.Image:
    im = Image.new("RGBA", (90, 180), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ox, oy = 45, 168
    draw_iso_box(d, ox, oy, 8, 8, 70, (70, 52, 32, 255), (56, 40, 24, 255), (42, 30, 18, 255))
    # lamp house
    draw_iso_box(
        d,
        ox,
        oy - 78,
        16,
        16,
        22,
        (220, 170, 70, 255),
        (190, 130, 40, 230),
        (150, 90, 28, 230),
    )
    draw_iso_box(
        d,
        ox,
        oy - 98,
        18,
        18,
        8,
        (50, 38, 24, 255),
        (40, 30, 18, 255),
        (30, 22, 14, 255),
    )
    return im.filter(ImageFilter.SMOOTH)


def update_asset_data():
    raw = ASSET_JS.read_text(encoding="utf-8")
    start = raw.find("{")
    end = raw.rfind("}")
    data = json.loads(raw[start : end + 1])
    assets = data["assets"]
    v = "v=5"
    for p in sorted(CHARS.glob("*.png")):
        if p.name.endswith("_walk.png"):
            continue
        rec = assets.get(p.stem)
        if not rec or rec.get("kind") == "texture":
            continue
        rec["sheets"]["idle"] = f"assets/chars/{p.name}?{v}"
        walk = CHARS / f"{p.stem}_walk.png"
        if walk.exists():
            rec["clips"] = [
                {"key": "idle", "frames": 1},
                {"key": "walk", "frames": 4},
            ]
            rec["sheets"]["walk"] = f"assets/chars/{walk.name}?{v}"
            rec["dirs"] = 4
            rec["cellW"] = CELL_W
            rec["cellH"] = CELL_H
    for extra, relw, relh, ax, ay in [
        ("prop_barrel3d", 120, 140, 60, 132),
        ("prop_lantern3d", 90, 180, 45, 172),
    ]:
        path = PROPS / f"{extra}.png"
        if path.exists():
            assets[extra] = {
                "dirs": 1,
                "cellW": relw,
                "cellH": relh,
                "anchorX": ax,
                "anchorY": ay,
                "clips": [{"key": "idle", "frames": 1}],
                "sheets": {"idle": f"assets/props/{extra}.png?{v}"},
            }
    ASSET_JS.write_text("const ASSET_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("asset-data", len(assets))


def main():
    CHARS.mkdir(exist_ok=True)
    OBJ.mkdir(parents=True, exist_ok=True)
    PROPS.mkdir(exist_ok=True)

    for p in sorted(CHARS.glob("*.png")):
        if p.name.endswith("_walk.png"):
            continue
        im = punch_magenta(Image.open(p))
        im.save(p)
        walk = make_walk_sheet(im)
        walk.save(CHARS / f"{p.stem}_walk.png")
        print("char", p.name, im.size, "walk", walk.size)

    ground = MAPS / "tut01_ground.png"
    if ground.exists():
        ship = extract_ship_occluder(Image.open(ground))
        dest = OBJ / "ship.png"
        ship.save(dest)
        print("ship occluder", dest, ship.size)

    bake_barrel().save(PROPS / "prop_barrel3d.png")
    bake_lantern().save(PROPS / "prop_lantern3d.png")
    print("baked 3d barrel + lantern")

    update_asset_data()


if __name__ == "__main__":
    main()
