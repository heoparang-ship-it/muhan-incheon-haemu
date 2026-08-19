#!/usr/bin/env python3
"""Build tutorial zoom mips.

Do not paste whole generated close-ups (they invent crates/cars).
Keep the official 1065×737 layout, upscale it, then add high-frequency
detail from close-up tiles. Downscale makes the far mip.
Also write 2× object sheets so zoom-in has pixels.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

import importlib.util

_spec = importlib.util.spec_from_file_location(
    "process_tut_layers", Path(__file__).with_name("process-tut-layers.py")
)
_layers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_layers)
chroma_clean = _layers.chroma_clean
trim_alpha = _layers.trim_alpha
scale_to_height = _layers.scale_to_height

ROOT = Path("/workspace")
MAPS = ROOT / "game/assets/maps"
ART = Path("/opt/cursor/artifacts/assets")
SRC_OBJ = ART
Z1 = MAPS / "tut01_ground.png"
Z0 = MAPS / "tut01_ground_z0.png"
Z2 = MAPS / "tut01_ground_z2.png"

SCALE = 2
TUT_W, TUT_H = 1065, 737
HI_W, HI_H = TUT_W * SCALE, TUT_H * SCALE

# (filename in artifacts, box on the 1065×737 play map)
TILES = [
    ("zoom_ship.png", (0, 0, 500, 420)),
    ("zoom_junks.png", (0, 340, 480, 737)),
    ("zoom_dirt_mid.png", (300, 180, 740, 560)),
    ("zoom_dirt_right.png", (680, 60, 1065, 500)),
    ("zoom_dirt_south.png", (340, 430, 900, 737)),
    ("zoom_plank_dirt.png", (280, 200, 620, 500)),
    ("tut01_wharf_dirt_close.png", (360, 200, 900, 680)),
]

# World draw size stays the 60px-person sizes; files are 2× for zoom.
OBJ_LOGICAL = {
    "tent": 188,
    "crates": 96,
    "sacks": 100,
    "cart": 86,
    "nets": 100,
}
OBJ_OX = {"cart": 0.88}


def feather(h: int, w: int, pad: int) -> np.ndarray:
    yy = np.minimum(np.arange(h), np.arange(h)[::-1]).astype(np.float32)
    xx = np.minimum(np.arange(w), np.arange(w)[::-1]).astype(np.float32)
    m = np.minimum(yy[:, None], xx[None, :])
    return np.clip(m / max(1, pad), 0, 1)


def highpass(im: Image.Image, sigma: float) -> np.ndarray:
    blur = im.filter(ImageFilter.GaussianBlur(radius=sigma))
    return np.asarray(im, np.float32) - np.asarray(blur, np.float32)


def phase_shift(a: np.ndarray, b: np.ndarray) -> tuple[int, int]:
    """Pixel shift to overlay b onto a. Both HxW float."""
    fa = np.fft.rfft2(a)
    fb = np.fft.rfft2(b)
    r = fa * np.conj(fb)
    r /= np.abs(r) + 1e-6
    c = np.fft.irfft2(r, s=a.shape)
    y, x = np.unravel_index(int(np.argmax(c)), c.shape)
    if y > a.shape[0] // 2:
        y -= a.shape[0]
    if x > a.shape[1] // 2:
        x -= a.shape[1]
    return int(x), int(y)


def add_tile(canvas: np.ndarray, path: Path, box, amount: float = 0.92) -> None:
    if not path.exists():
        print("skip missing", path.name)
        return
    x0, y0, x1, y1 = [v * SCALE for v in box]
    tw, th = x1 - x0, y1 - y0
    src = Image.open(path).convert("RGB")
    # cover the target box
    s = max(tw / src.width, th / src.height)
    nw, nh = max(1, int(round(src.width * s))), max(1, int(round(src.height * s)))
    src = src.resize((nw, nh), Image.Resampling.LANCZOS)
    # center crop to box
    cx0 = max(0, (nw - tw) // 2)
    cy0 = max(0, (nh - th) // 2)
    src = src.crop((cx0, cy0, cx0 + tw, cy0 + th))
    if src.size != (tw, th):
        src = src.resize((tw, th), Image.Resampling.LANCZOS)

    base = canvas[y0:y1, x0:x1]
    if base.shape[0] != th or base.shape[1] != tw:
        print("skip shape", path.name, base.shape, tw, th)
        return

    g_base = base.mean(axis=2)
    g_src = np.asarray(src.convert("L"), np.float32)
    # small align, reject wild shifts
    sx, sy = phase_shift(g_base, g_src)
    if abs(sx) > 18 or abs(sy) > 18:
        sx = sy = 0
    if sx or sy:
        src = Image.fromarray(np.asarray(src)).transform(
            src.size, Image.AFFINE, (1, 0, -sx, 0, 1, -sy),
            resample=Image.Resampling.BILINEAR,
        )

    hp = highpass(src, sigma=3.4)
    # drop low-trust pixels: if close-up color is far from the map, it invented an object
    src_a = np.asarray(src, np.float32)
    dist = np.sqrt(((src_a - base) ** 2).sum(axis=2))
    trust = np.clip(1.0 - dist / 55.0, 0.0, 1.0)[..., None]
    mask = feather(th, tw, pad=70)[..., None] * trust
    canvas[y0:y1, x0:x1] = np.clip(base + hp * amount * mask, 0, 255)


def write_objects() -> dict:
    out = {}
    dest_dir = MAPS / "obj"
    dest_dir.mkdir(parents=True, exist_ok=True)
    for name, h in OBJ_LOGICAL.items():
        raw = Image.open(SRC_OBJ / f"obj_{name}.png")
        keyed = chroma_clean(raw)
        trimmed = trim_alpha(keyed)
        hi = scale_to_height(trimmed, h * 2)
        hi.save(dest_dir / f"{name}.png", "PNG", optimize=True)
        out[name] = {
            "w": hi.width, "h": hi.height,
            "dw": int(round(hi.width / 2)), "dh": h,
            "ox": 0.50, "oy": OBJ_OX.get(name, 0.90),
        }
        print("obj2x", name, hi.size, "draw", out[name]["dw"], out[name]["dh"])
    return out


def main() -> None:
    z1 = Image.open(Z1).convert("RGB")
    if z1.size != (TUT_W, TUT_H):
        raise SystemExit(f"expected {TUT_W}x{TUT_H}, got {z1.size}")
    hi = z1.resize((HI_W, HI_H), Image.Resampling.LANCZOS)
    canvas = np.asarray(hi, np.float32).copy()
    for fname, box in TILES:
        add_tile(canvas, ART / fname, box)
    z0 = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), "RGB")
    z0 = z0.filter(ImageFilter.UnsharpMask(radius=1.2, percent=55, threshold=3))
    z0.save(Z0, "PNG", optimize=True)
    z0.save(ART / "tut01_ground_z0.png", "PNG", optimize=True)
    z2 = z1.resize((TUT_W // 2, TUT_H // 2), Image.Resampling.LANCZOS)
    z2.save(Z2, "PNG", optimize=True)
    z2.save(ART / "tut01_ground_z2.png", "PNG", optimize=True)

    # compare crops: upscale-only vs stitched
    cmp = Image.new("RGB", (640, 360))
    a = hi.crop((200, 80, 520, 260)).resize((320, 180), Image.Resampling.NEAREST)
    b = z0.crop((200, 80, 520, 260)).resize((320, 180), Image.Resampling.NEAREST)
    cmp.paste(a, (0, 0))
    cmp.paste(b, (320, 0))
    c = hi.crop((720, 400, 1040, 580)).resize((320, 180), Image.Resampling.NEAREST)
    d = z0.crop((720, 400, 1040, 580)).resize((320, 180), Image.Resampling.NEAREST)
    cmp.paste(c, (0, 180))
    cmp.paste(d, (320, 180))
    cmp.save(ART / "tut01_zoom_compare.png", "PNG")

    objs = write_objects()
    meta_path = MAPS / "tut01_layers.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    meta["ground"] = {"w": TUT_W, "h": TUT_H}
    meta["mips"] = {
        "z0": {"file": "tut01_ground_z0.png", "w": HI_W, "h": HI_H, "zoom": 1.12},
        "z1": {"file": "tut01_ground.png", "w": TUT_W, "h": TUT_H, "zoom": 0.62},
        "z2": {"file": "tut01_ground_z2.png", "w": TUT_W // 2, "h": TUT_H // 2, "zoom": 0.0},
    }
    meta["objects"] = objs
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    print("z0", z0.size, Z0.stat().st_size)
    print("z2", z2.size, Z2.stat().st_size)


if __name__ == "__main__":
    main()
