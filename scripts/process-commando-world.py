#!/usr/bin/env python3
"""Chroma + trim + fit Commandos-style civilians, buildings, props, terrains."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

RAW = Path("/workspace/artifacts/imagine_images")
PUB = Path("/workspace/public/assets")
OUT_CHAR = PUB / "chars"
OUT_BLD = PUB / "bld"
OUT_PROP = PUB / "props"
OUT_TEX = PUB / "tex"
for p in (OUT_CHAR, OUT_BLD, OUT_PROP, OUT_TEX):
    p.mkdir(parents=True, exist_ok=True)

TW, TH, ZH = 64, 32, 20
CELL_W, CELL_H = 56, 76

CIVILS = {
    "civil_villager": "eb640eaa-eb83-470c-9275-360707885618.jpg",
    "civil_believer": "c5e71429-b9d2-45f3-9b0c-ce533c8196aa.jpg",
    "civil_patient": "83824b21-b78a-4cc9-a08f-6d9719a1ad47.jpg",
    "civil_child": "b014e362-a250-4c2f-92ce-98eca5a69c50.jpg",
    "civil_prisoner": "005c94d9-280e-4ce9-85dc-b9782f2659e5.jpg",
}

BLDS = {
    "bld_thatch_2x2": ("32e3a27d-8f9b-432e-8831-990e3d24d009.jpg", 2, 2, 1.3),
    "bld_thatch_3x2": ("221f04eb-f28f-4921-99da-73505278ec47.jpg", 3, 2, 1.3),
    "bld_thatch_5x4": ("e5a8b791-5b3f-4880-9fe3-8dbfcabf16f0.jpg", 5, 4, 1.35),
    "bld_tile_2x2": ("c95174d6-a7fb-4fd1-bd14-140dcc371517.jpg", 2, 2, 1.35),
    "bld_tile_3x2": ("fa0015a1-7900-4856-b3a5-079d92502726.jpg", 3, 2, 1.35),
    "bld_west_8x6": ("26187d80-b332-44ad-a45a-2061a8750d29.jpg", 8, 6, 1.9),
    "bld_tile_6x4": ("d3cc0191-f170-490b-8842-332f396446b5.jpg", 6, 4, 1.4),
    "bld_tile_4x4": ("3eb29c86-4dcf-4c5b-8ac2-4269f981bdab.jpg", 4, 4, 1.4),
}

PROPS_SIZE = {
    "prop_pine": (80, 160),
    "prop_tree": (90, 140),
    "prop_bush": (56, 48),
    "prop_rock": (52, 40),
    "prop_well": (64, 72),
    "prop_boat": (110, 56),
    "prop_belltower": (64, 180),
    "prop_altar": (60, 52),
    "prop_crate": (44, 44),
    "prop_jar": (32, 44),
    "prop_wreck": (110, 52),
    "prop_cart": (80, 56),
    "prop_net": (56, 64),
    "prop_rack": (60, 64),
    "prop_kiln": (64, 72),
    "prop_stalag": (40, 80),
    "prop_stone_pile": (56, 40),
    "prop_lamp_off": (36, 80),
    "prop_lamp_on": (36, 80),
}

EXTRA_PROP = {
    "prop_pine": "16b7a651-ff3b-4ee0-b395-3ddc2afc0c9c.jpg",
    "prop_tree": "db51c76d-551e-48e6-9403-918775fea910.jpg",
    "prop_belltower": "b7dc4969-fa5e-4dbc-9ca2-973e46062f8b.jpg",
    "prop_boat": "9877cc19-88d2-4ef7-a7fc-3c35a10a24ed.jpg",
    "prop_wreck": "964b426c-992a-40e5-8a2e-7f1a84e153a0.jpg",
    "prop_well": "80db6a1b-6d68-418c-994f-4ada5aab16f8.jpg",
    "prop_cart": "6431c971-cacf-4ee2-abe0-6376cd5f5e59.jpg",
}

EXTRA_PACK = {
    "55d25ca5-1f2c-46cb-8632-f887c21ce478.jpg": ("prop_bush", "prop_rock", "prop_crate", "prop_jar"),
    "e1510c8b-d18f-40b3-bba4-66e21b30756f.jpg": ("prop_altar", "prop_kiln", "prop_net", "prop_rack"),
    "52c5a2de-0816-401e-b40c-9d414bdd2d04.jpg": ("prop_stalag", "prop_stone_pile", "prop_lamp_off", "prop_lamp_off"),
}

EXTRA_TEX = {
    "terr_mud": "48257f6b-6572-4d83-bc3b-393a4ba1647e.jpg",
    "terr_grass": "52954de8-b057-4fcc-8a05-87cfb17a432d.jpg",
    "terr_dirt": "2999f8fd-745b-4431-b286-ad107cd6d842.jpg",
    "terr_sand": "52b19fa0-e428-4215-b2c2-5226590c5dad.jpg",
    "terr_reed": "a00a297a-22e3-4e21-bb6a-f97a336ba559.jpg",
    "terr_stone": "44e969c0-cce3-485f-ac79-8dbe6b25469d.jpg",
    "terr_salt": "e49837e3-5627-42b0-a284-ab0caf37b300.jpg",
    "terr_floor": "57085675-8a2c-47f2-b73c-f06431180989.jpg",
    "terr_pier": "0756e49b-b548-4705-90ff-0a3152084cb1.jpg",
    "terr_cave": "86143a7a-02dc-4547-b335-234f2fd8ecad.jpg",
    "terr_rock": "a655438e-5729-4482-84bc-b22c026dbc6d.jpg",
    "terr_sea": "6a3f16e8-1b03-478f-acad-a358809fd9d0.jpg",
    "terr_wood": "058baeb0-9eef-4f5a-8d3f-f9c2869ba4c2.jpg",
}

EXTRA_LAMP_SHEET = "3a440317-cb3e-4330-907d-033e09e025e3.jpg"


def chroma(im: Image.Image, dist: float = 118) -> Image.Image:
    im = im.convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    d = np.sqrt((r - 255) ** 2 + (g - 0) ** 2 + (b - 255) ** 2)
    mag = (r > 175) & (b > 175) & (g < 100)
    hot_pink = (r > 190) & (g < 45) & (b > 70) & (b < 210)
    fringe = (r > 160) & (b > 85) & (g < 95) & ((r + b) > (g * 2.35))
    arr[..., 3] = np.where((d < dist) | mag | hot_pink | fringe, 0, a)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")



def trim(im: Image.Image, pad: int = 3) -> Image.Image:
    a = np.asarray(im.split()[-1])
    ys, xs = np.where(a > 14)
    if len(xs) == 0:
        return im
    x0, x1 = max(0, int(xs.min()) - pad), min(im.width, int(xs.max()) + pad + 1)
    y0, y1 = max(0, int(ys.min()) - pad), min(im.height, int(ys.max()) + pad + 1)
    return im.crop((x0, y0, x1, y1))


def fit_feet(im: Image.Image, w: int, h: int, pad: int = 4) -> Image.Image:
    im = trim(im)
    scale = min((w - pad) / max(1, im.width), (h - pad) / max(1, im.height))
    nw, nh = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(im, ((w - nw) // 2, h - nh), im)
    return canvas


def split_2x2(im: Image.Image):
    w, h = im.size
    cw, ch = w // 2, h // 2
    boxes = [(0, 0), (cw, 0), (0, ch), (cw, ch)]
    return [im.crop((x, y, x + cw, y + ch)) for x, y in boxes]


def iso_size(w: int, h: int, wall: float, scale: float = 2.0) -> tuple[int, int]:
    iw = int((w + h) * TW / 2 * scale)
    ih = int(((w + h) * TH / 2 + wall * ZH + 40) * scale)
    return max(96, iw), max(96, ih)


def make_seamless(im: Image.Image, size: int = 512) -> Image.Image:
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


def process_civil(name: str, fn: str) -> None:
    src = RAW / fn
    if not src.exists():
        print("missing civil", name, fn)
        return
    im = chroma(Image.open(src))
    cells = [fit_feet(c, CELL_W, CELL_H) for c in split_2x2(im)]
    sheet = Image.new("RGBA", (CELL_W, CELL_H * 4), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        sheet.paste(c, (0, i * CELL_H), c)
    out = OUT_CHAR / f"{name}.png"
    sheet.save(out, "PNG")
    print("civil", name, sheet.size, out.stat().st_size)


def process_bld(name: str, fn: str, w: int, h: int, wall: float) -> None:
    src = RAW / fn
    if not src.exists():
        print("missing bld", name, fn)
        return
    iw, ih = iso_size(w, h, wall, 2.0)
    im = fit_feet(chroma(Image.open(src)), iw, ih, pad=8)
    out = OUT_BLD / f"{name}.png"
    im.save(out, "PNG")
    print("bld", name, im.size, out.stat().st_size)


def process_prop(name: str, fn: str) -> None:
    src = RAW / fn
    if not src.exists():
        print("missing prop", name, fn)
        return
    w, h = PROPS_SIZE[name]
    im = fit_feet(chroma(Image.open(src)), w, h, pad=4)
    out = OUT_PROP / f"{name}.png"
    im.save(out, "PNG")
    print("prop", name, im.size, out.stat().st_size)


def process_pack(fn: str, names: tuple[str, str, str, str]) -> None:
    src = RAW / fn
    if not src.exists():
        print("missing pack", fn)
        return
    im = chroma(Image.open(src))
    cells = split_2x2(im)
    seen = set()
    for name, cell in zip(names, cells):
        if name in seen:
            continue
        seen.add(name)
        w, h = PROPS_SIZE[name]
        fitted = fit_feet(cell, w, h, pad=4)
        out = OUT_PROP / f"{name}.png"
        fitted.save(out, "PNG")
        print("pack", name, fitted.size, out.stat().st_size)


def process_lamp_sheet(fn: str) -> None:
    src = RAW / fn
    if not src.exists():
        print("missing lamp sheet", fn)
        return
    im = chroma(Image.open(src))
    cells = [fit_feet(c, 36, 80, pad=3) for c in split_2x2(im)]
    sheet = Image.new("RGBA", (36 * 4, 80), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        sheet.paste(c, (i * 36, 0), c)
    out = OUT_PROP / "prop_lamp_on.png"
    sheet.save(out, "PNG")
    print("lamp sheet", sheet.size, out.stat().st_size)


def process_tex(name: str, fn: str) -> None:
    src = RAW / fn
    if not src.exists():
        print("missing tex", name, fn)
        return
    im = make_seamless(Image.open(src), 512)
    out = OUT_TEX / f"{name}.jpg"
    im.save(out, "JPEG", quality=88)
    print("tex", name, im.size, out.stat().st_size)


def main() -> None:
    for name, fn in CIVILS.items():
        process_civil(name, fn)
    for name, (fn, w, h, wall) in BLDS.items():
        process_bld(name, fn, w, h, wall)
    for name, fn in EXTRA_PROP.items():
        process_prop(name, fn)
    for fn, names in EXTRA_PACK.items():
        process_pack(fn, names)
    process_lamp_sheet(EXTRA_LAMP_SHEET)
    for name, fn in EXTRA_TEX.items():
        process_tex(name, fn)


if __name__ == "__main__":
    main()
