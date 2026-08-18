#!/usr/bin/env python3
"""Split 2x2 Commandos-style sheets into 4-dir vertical strips."""
from pathlib import Path
from PIL import Image
import numpy as np

RAW = Path("/workspace/artifacts/imagine_images")
OUT = Path("/workspace/public/assets/chars")
OUT.mkdir(parents=True, exist_ok=True)

SHEETS = {
    "agent_haeju": "38e67956-1c5d-4ab5-90a1-4b7d0e4ea4d6.jpg",
    "agent_mujin": "0a5e01b8-2852-4d5e-8bc0-151df949ae73.jpg",
    "agent_dochi": "40eceaf3-fe7a-456f-a980-09b2359a0353.jpg",
    "agent_wolsim": "77fe766c-62fd-48af-9bf2-26b7c71beab4.jpg",
    "guard_acolyte": "ad62d264-5d13-4bd0-b5a3-e20e02cbe663.jpg",
    "guard_steward": "db100da2-200e-4a67-8745-94af7acb1f56.jpg",
    "guard_soldier": "7203f567-df3d-42f1-84ea-dfbb65174af1.jpg",
    "guard_sailor": "383632e3-6821-45d0-bc74-09bdfce6caf8.jpg",
    "guard_priest": "4c203601-cf8d-44b0-b84d-da738dc4a3c3.jpg",
}
CELL_W, CELL_H = 56, 76


def chroma(im: Image.Image, dist: float = 82) -> Image.Image:
    im = im.convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    d = np.sqrt((r - 255) ** 2 + (g - 0) ** 2 + (b - 255) ** 2)
    mag = (r > 175) & (b > 175) & (g < 95)
    arr[..., 3] = np.where((d < dist) | mag, 0, a)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def trim(im: Image.Image, pad: int = 3) -> Image.Image:
    a = np.asarray(im.split()[-1])
    ys, xs = np.where(a > 14)
    if len(xs) == 0:
        return im
    x0, x1 = max(0, xs.min() - pad), min(im.width, xs.max() + pad + 1)
    y0, y1 = max(0, ys.min() - pad), min(im.height, ys.max() + pad + 1)
    return im.crop((x0, y0, x1, y1))


def fit_feet(im: Image.Image, w: int, h: int) -> Image.Image:
    im = trim(im)
    scale = min((w - 4) / im.width, (h - 4) / im.height)
    nw, nh = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(im, ((w - nw) // 2, h - nh), im)
    return canvas


def split_2x2(im: Image.Image):
    w, h = im.size
    cw, ch = w // 2, h // 2
    # TL, TR, BL, BR = dirs 0..3
    boxes = [(0, 0), (cw, 0), (0, ch), (cw, ch)]
    return [im.crop((x, y, x + cw, y + ch)) for x, y in boxes]


def main():
    for name, fn in SHEETS.items():
        src = RAW / fn
        im = chroma(Image.open(src))
        cells = [fit_feet(c, CELL_W, CELL_H) for c in split_2x2(im)]
        sheet = Image.new("RGBA", (CELL_W, CELL_H * 4), (0, 0, 0, 0))
        for i, c in enumerate(cells):
            sheet.paste(c, (0, i * CELL_H), c)
        out = OUT / f"{name}.png"
        sheet.save(out, "PNG")
        print(name, sheet.size, out.stat().st_size)


if __name__ == "__main__":
    main()
