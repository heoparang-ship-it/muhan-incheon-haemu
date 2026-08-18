#!/usr/bin/env python3
"""Process the uploaded 무한인천-에셋 pack into engine-sized files."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

RAW = Path("/tmp/drive-assets/unpack/무한인천-에셋")
PUB = Path("/workspace/public/assets")
OUT_TEX = PUB / "tex"
OUT_CHAR = PUB / "chars"
OUT_PROP = PUB / "props"
OUT_BLD = PUB / "bld"
OUT_UI = PUB / "ui"
for p in (OUT_TEX, OUT_CHAR, OUT_PROP, OUT_BLD, OUT_UI):
    p.mkdir(parents=True, exist_ok=True)

TW, TH, ZH = 64, 32, 20

PROPS = {
    "prop_pine": (56, 100),
    "prop_tree": (64, 96),
    "prop_bush": (44, 40),
    "prop_rock": (44, 36),
    "prop_well": (52, 56),
    "prop_boat": (72, 40),
    "prop_belltower": (48, 110),
    "prop_altar": (48, 44),
    "prop_crate": (40, 40),
    "prop_jar": (36, 40),
    "prop_wreck": (72, 40),
    "prop_cart": (56, 44),
    "prop_net": (48, 52),
    "prop_rack": (52, 52),
    "prop_kiln": (52, 56),
    "prop_stalag": (40, 64),
    "prop_stone_pile": (48, 36),
    "prop_lamp_off": (36, 68),
    "prop_lamp_on": (36, 68),
}

BLD = {
    "bld_thatch_2x2": (2, 2, 1.3),
    "bld_thatch_3x2": (3, 2, 1.3),
    "bld_thatch_5x4": (5, 4, 1.35),
    "bld_tile_2x2": (2, 2, 1.35),
    "bld_tile_3x2": (3, 2, 1.35),
    "bld_tile_6x4": (6, 4, 1.4),
    "bld_west_8x6": (8, 6, 1.9),
    "bld_wall": (3, 1, 1.6),
}

AGENTS = ("haeju", "mujin", "dochi", "wolsim")
TEX_KEEP = ("terr_sea", "terr_wood")  # not in the pack


def chroma(im: Image.Image, dist: float = 72) -> Image.Image:
    im = im.convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    d = np.sqrt((r - 255) ** 2 + (g - 0) ** 2 + (b - 255) ** 2)
    mag = (r > 175) & (b > 175) & (g < 95)
    # also punch leftover jpeg-ish pink fringes
    fringe = (r > 200) & (b > 160) & (g < 120) & ((r + b) > (g * 3.2))
    mask = (d < dist) | mag | fringe
    arr[..., 3] = np.where(mask, 0, a)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def trim_alpha(im: Image.Image, pad: int = 3) -> Image.Image:
    a = np.asarray(im.split()[-1])
    ys, xs = np.where(a > 14)
    if len(xs) == 0:
        return im
    x0, x1 = max(0, int(xs.min()) - pad), min(im.width, int(xs.max()) + pad + 1)
    y0, y1 = max(0, int(ys.min()) - pad), min(im.height, int(ys.max()) + pad + 1)
    return im.crop((x0, y0, x1, y1))


def fit_feet(im: Image.Image, w: int, h: int) -> Image.Image:
    im = trim_alpha(im)
    scale = min((w - 2) / max(1, im.width), (h - 2) / max(1, im.height))
    nw, nh = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(im, ((w - nw) // 2, h - nh), im)
    return canvas


def make_seamless(im: Image.Image, size: int = 256) -> Image.Image:
    im = im.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
    arr = np.asarray(im).astype(np.float32)
    h, w = arr.shape[:2]
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(0, 1, w)[None, :]
    wx = np.minimum(x, 1 - x) * 2
    wy = np.minimum(y, 1 - y) * 2
    wgt = np.clip(wx * wy, 0, 1)[..., None]
    rolled = np.roll(np.roll(arr, h // 2, 0), w // 2, 1)
    mix = arr * wgt + rolled * (1 - wgt)
    return Image.fromarray(np.clip(mix, 0, 255).astype(np.uint8), "RGB")


def iso_size(w: int, h: int, wall: float) -> tuple[int, int]:
    iw = int((w + h) * TW / 2)
    ih = int((w + h) * TH / 2 + wall * ZH + 40)
    return max(48, iw), max(48, ih)


def pack_frames(paths: list[Path], w: int, h: int) -> Image.Image:
    frames = [fit_feet(chroma(Image.open(p)), w, h) for p in paths]
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        sheet.paste(fr, (i * w, 0), fr)
    return sheet


def main() -> None:
    # textures — keep generated sea/wood
    for src in sorted((RAW / "textures").glob("terr_*.jpg")):
        out = OUT_TEX / src.name
        make_seamless(Image.open(src), 256).save(out, "JPEG", quality=86)
        print("tex", src.stem, out.stat().st_size)
    for keep in TEX_KEEP:
        p = OUT_TEX / f"{keep}.jpg"
        print("tex keep", keep, p.exists(), p.stat().st_size if p.exists() else 0)

    # agents only (guards/civilians stay as previous pack)
    for name in AGENTS:
        src = RAW / "characters" / f"agent_{name}.png"
        im = fit_feet(chroma(Image.open(src)), 48, 64)
        out = OUT_CHAR / f"agent_{name}.png"
        im.save(out, "PNG")
        print("char", name, im.size, out.stat().st_size)

    # portraits — cinematic crop for HUD
    for name in AGENTS:
        src = RAW / "portraits" / f"portrait_{name}.jpg"
        im = Image.open(src).convert("RGB")
        # keep the figure, drop magenta edges if any survived as pink
        w, h = im.size
        crop = im.crop((int(w * 0.18), int(h * 0.02), int(w * 0.82), int(h * 0.98)))
        crop = crop.resize((192, 240), Image.Resampling.LANCZOS)
        out = OUT_UI / f"portrait_{name}.jpg"
        crop.save(out, "JPEG", quality=86)
        print("portrait", name, out.stat().st_size)

    # props
    for name, (w, h) in PROPS.items():
        src = RAW / "props" / f"{name}.png"
        if not src.exists():
            print("missing prop", name)
            continue
        im = fit_feet(chroma(Image.open(src)), w, h)
        out = OUT_PROP / f"{name}.png"
        im.save(out, "PNG")
        print("prop", name, im.size, out.stat().st_size)

    # lamp flicker strip
    lamp_frames = [RAW / "anim" / "loop" / f"lamp_f{i}.png" for i in range(1, 5)]
    if all(p.exists() for p in lamp_frames):
        sheet = pack_frames(lamp_frames, 36, 68)
        out = OUT_PROP / "prop_lamp_on.png"
        sheet.save(out, "PNG")
        print("lamp sheet", sheet.size, out.stat().st_size)

    # buildings
    for name, (w, h, wall) in BLD.items():
        src = RAW / "buildings" / f"{name}.png"
        if not src.exists():
            print("missing bld", name)
            continue
        iw, ih = iso_size(w, h, wall)
        im = fit_feet(chroma(Image.open(src)), iw, ih)
        out = OUT_BLD / f"{name}.png"
        im.save(out, "PNG")
        print("bld", name, im.size, out.stat().st_size)


if __name__ == "__main__":
    main()
