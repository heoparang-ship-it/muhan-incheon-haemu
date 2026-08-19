#!/usr/bin/env python3
"""Split tutorial Y64-like ground from MA2-like objects.

Ground: crop 1536×1024 harbor paint to Commandos TU01 zoom-0 size 1065×737.
Objects: punch magenta #FF00FF, trim, scale to a 60px person.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path("/opt/cursor/artifacts/assets")
OUT_MAPS = Path("/workspace/game/assets/maps")
OUT_OBJ = OUT_MAPS / "obj"
OUT_ART = Path("/opt/cursor/artifacts/assets")
OUT_OBJ.mkdir(parents=True, exist_ok=True)

TUT_W, TUT_H = 1065, 737
TW, TH = 64, 32
MAP = 32
PERSON_PX = 60

# After scale-to-cover, keep ships (left) and cut extra fog (right).
GROUND_CROP_X0 = 10


def _dilate(mask: np.ndarray, n: int = 1) -> np.ndarray:
    out = mask
    for _ in range(n):
        p = np.pad(out, 1, constant_values=False)
        out = (
            p[:-2, :-2] | p[:-2, 1:-1] | p[:-2, 2:]
            | p[1:-1, :-2] | p[1:-1, 1:-1] | p[1:-1, 2:]
            | p[2:, :-2] | p[2:, 1:-1] | p[2:, 2:]
        )
    return out


def chroma_clean(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    arr = np.array(im, dtype=np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    d_key = np.sqrt((r - 255.0) ** 2 + (g - 0.0) ** 2 + (b - 255.0) ** 2)
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    maxc = np.maximum(np.maximum(rf, gf), bf)
    minc = np.minimum(np.minimum(rf, gf), bf)
    v = maxc
    d = maxc - minc
    s = np.where(maxc > 1e-5, d / np.maximum(maxc, 1e-5), 0.0)
    h = np.zeros_like(maxc)
    rc = (maxc - rf) / np.maximum(d, 1e-5)
    gc = (maxc - gf) / np.maximum(d, 1e-5)
    bc = (maxc - bf) / np.maximum(d, 1e-5)
    h = np.where(maxc == rf, (bc - gc), h)
    h = np.where(maxc == gf, (2.0 + rc - bc), h)
    h = np.where(maxc == bf, (4.0 + gc - rc), h)
    h = np.where(d > 1e-5, (h / 6.0) % 1.0, 0.0)
    h = h * 360.0
    hue_mag = (h >= 278.0) & (h <= 348.0)
    strong = (
        ((d_key < 118) & (a > 0))
        | ((r > 175) & (b > 175) & (g < 100) & (a > 0))
        | ((r > 190) & (g < 45) & (b > 70) & (b < 210) & (a > 0))
        | (hue_mag & (s > 0.38) & (v > 0.22) & (g < r * 0.62) & (g < b * 0.95) & (a > 0))
    )
    weak = (
        ((d_key < 168) & (a > 0))
        | (hue_mag & (s > 0.18) & (v > 0.12) & (g < r * 0.78) & (a > 0))
        | ((r > 145) & (g < 95) & (b > 85) & ((r + b) > g * 2.35) & (a > 0))
    )
    punch = strong.copy()
    grow = (a < 10) | punch
    for _ in range(48):
        nxt = _dilate(grow, 1) & ((a < 10) | punch | weak)
        if nxt.sum() == grow.sum():
            break
        grow = nxt
    punch = punch | (grow & weak)
    fringe = _dilate(punch, 1) & ~punch & (a > 0)
    arr[..., 3] = np.where(punch, 0, a)
    arr[..., 3] = np.where(fringe, arr[..., 3] * 0.35, arr[..., 3])
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def trim_alpha(im: Image.Image, pad: int = 6) -> Image.Image:
    a = np.asarray(im.split()[-1])
    ys, xs = np.where(a > 16)
    if len(xs) == 0:
        return im
    x0, x1 = max(0, int(xs.min()) - pad), min(im.width, int(xs.max()) + pad + 1)
    y0, y1 = max(0, int(ys.min()) - pad), min(im.height, int(ys.max()) + pad + 1)
    return im.crop((x0, y0, x1, y1))


def scale_to_height(im: Image.Image, h: int) -> Image.Image:
    if im.height <= 0:
        return im
    s = h / im.height
    w = max(1, int(round(im.width * s)))
    return im.resize((w, h), Image.Resampling.LANCZOS)


def crop_ground() -> Image.Image:
    src = Image.open(SRC / "tut01_ground_only.png").convert("RGB")
    scale = max(TUT_W / src.width, TUT_H / src.height)
    nw, nh = int(round(src.width * scale)), int(round(src.height * scale))
    im = src.resize((nw, nh), Image.Resampling.LANCZOS)
    x0 = min(GROUND_CROP_X0, nw - TUT_W)
    y0 = max(0, (nh - TUT_H) // 2)
    return im.crop((x0, y0, x0 + TUT_W, y0 + TUT_H))


def paint_to_tile(px: float, py: float) -> tuple[float, float]:
    bx, by = -TUT_W / 2, (MAP * 0.5 + MAP * 0.5) * (TH / 2) - TUT_H / 2
    wx, wy = bx + px, by + py
    a, b = wx / (TW / 2), wy / (TH / 2)
    return (b + a) / 2, (b - a) / 2


def classify_tiles(ground: Image.Image) -> list[str]:
    arr = np.asarray(ground.convert("RGB"), dtype=np.float32)
    rows = []
    for ty in range(MAP):
        line = []
        for tx in range(MAP):
            sx = (tx + 0.5 - (ty + 0.5)) * (TW / 2)
            sy = (tx + 0.5 + ty + 0.5) * (TH / 2)
            bx, by = -TUT_W / 2, (MAP * 0.5 + MAP * 0.5) * (TH / 2) - TUT_H / 2
            px = int(round(sx - bx))
            py = int(round(sy - by))
            if px < 8 or py < 8 or px >= TUT_W - 8 or py >= TUT_H - 8:
                line.append("#")
                continue
            patch = arr[max(0, py - 3):py + 4, max(0, px - 3):px + 4]
            r, g, b = patch.mean(axis=(0, 1))
            # water: blue-grey, darker, not brown
            if b > r + 8 and b >= g - 4 and r < 95:
                line.append("~")
            elif r > 200 and g > 200 and b > 200:
                line.append("F")
            elif r + g + b < 70:
                line.append("~")
            else:
                line.append(".")
        rows.append("".join(line))
    return rows


def main() -> None:
    ground = crop_ground()
    ground.save(OUT_MAPS / "tut01_ground.png", "PNG", optimize=True)
    ground.save(OUT_ART / "tut01_ground.png", "PNG", optimize=True)

    # World height at zoom 1 (person ~60px). Files are 2× so zoom-in has pixels.
    targets = {
        "tent": 188,
        "crates": 96,
        "sacks": 100,
        "cart": 86,
        "nets": 100,
    }
    meta = {"ground": {"w": TUT_W, "h": TUT_H}, "objects": {}}
    for name, h in targets.items():
        raw = Image.open(SRC / f"obj_{name}.png")
        keyed = chroma_clean(raw)
        trimmed = trim_alpha(keyed)
        scaled = scale_to_height(trimmed, h * 2)
        dest = OUT_OBJ / f"{name}.png"
        scaled.save(dest, "PNG", optimize=True)
        scaled.save(OUT_ART / f"obj_{name}_keyed.png", "PNG", optimize=True)
        meta["objects"][name] = {
            "w": scaled.width, "h": scaled.height,
            "dw": int(round(scaled.width / 2)), "dh": h,
            "ox": 0.50, "oy": 0.90,
        }

    walk = classify_tiles(ground)
    meta["walk"] = walk
    spots = {
        "tent": (760, 340),
        "crates": (520, 400),
        "sacks": (480, 530),
        "cart": (680, 460),
        "nets": (400, 500),
        "start": (470, 620),
        "plank": (390, 290),
        "porter": (440, 390),
        "passCrate": (740, 380),
    }
    meta["spots"] = {}
    for k, (px, py) in spots.items():
        tx, ty = paint_to_tile(px, py)
        meta["spots"][k] = {"px": px, "py": py, "tx": round(tx, 2), "ty": round(ty, 2)}

    (OUT_MAPS / "tut01_layers.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    print("ground", ground.size, "bytes", (OUT_MAPS / "tut01_ground.png").stat().st_size)
    for k, v in meta["objects"].items():
        print("obj", k, v)
    print("walk:")
    for i, row in enumerate(walk):
        print(f"{i:2d} {row}")
    print("spots", json.dumps(meta["spots"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
