#!/usr/bin/env python3
"""Punch leftover JPEG magenta / hot-pink ground discs off building and prop sprites."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

PUB = Path("/workspace/public/assets")
BLD = PUB / "bld"
PROP = PUB / "props"


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


def _erode(mask: np.ndarray, n: int = 1) -> np.ndarray:
    return ~_dilate(~mask, n)


def _rgb_to_h(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
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
    return h * 360.0, s, v


def chroma_clean(im: Image.Image, aggressive: bool = True) -> Image.Image:
    im = im.convert("RGBA")
    arr = np.array(im, dtype=np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    h, s, v = _rgb_to_h(r, g, b)
    d_key = np.sqrt((r - 255.0) ** 2 + (g - 0.0) ** 2 + (b - 255.0) ** 2)

    hue_mag = (h >= 278.0) & (h <= 348.0)
    # classic #FF00FF + JPEG hot-pink disc (~237,10,139)
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
    # grow from already-transparent + punched into weak magenta (eats leftover rings / discs)
    grow = (a < 10) | punch
    for _ in range(48):
        nxt = _dilate(grow, 1) & ((a < 10) | punch | weak)
        if nxt.sum() == grow.sum():
            break
        grow = nxt
    punch = punch | (grow & weak)

    # chew a 1px JPEG fringe only where the pixel is still magenta-tinted
    fringe = _dilate(punch | (a < 10), 1) & weak & ~punch
    punch = punch | fringe

    if aggressive:
        # second 1px bite for stubborn JPEG ringing, still gated on weak magenta
        punch = punch | (_dilate(punch | (a < 10), 1) & weak)

    a_new = np.where(punch, 0.0, a)

    # despill remaining edge pixels (pull R/B toward G, soften alpha)
    edge = _dilate(a_new < 10, 2) & (a_new > 0)
    spill = np.clip(np.minimum(r, b) - g, 0.0, None)
    mag_edge = edge & ((spill > 8) | (hue_mag & (s > 0.12)))
    pull = np.where(mag_edge, np.clip(spill * 0.92, 0, 180), 0.0)
    r2 = np.clip(r - pull, 0, 255)
    b2 = np.clip(b - pull * 0.85, 0, 255)
    g2 = np.clip(g + pull * 0.08, 0, 255)
    a2 = np.where(mag_edge, a_new * np.clip(1.0 - spill / 220.0, 0.15, 1.0), a_new)

    # drop near-invisible leftover specks
    a2 = np.where(a2 < 12, 0.0, a2)

    out = np.stack([r2, g2, b2, a2], axis=-1).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def mag_count(im: Image.Image) -> int:
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    return int(((a > 20) & (r > 160) & (g < 80) & (b > 80) & ((r + b) > g * 2.4)).sum())


def process_dir(folder: Path) -> None:
    for p in sorted(folder.glob("*.png")):
        im = Image.open(p)
        before = mag_count(im)
        cleaned = chroma_clean(im, aggressive=True)
        after = mag_count(cleaned)
        cleaned.save(p, "PNG")
        print(f"{p.name:24s} {im.size}  mag {before:6d} -> {after:5d}")


def main() -> None:
    process_dir(BLD)
    process_dir(PROP)


if __name__ == "__main__":
    main()
