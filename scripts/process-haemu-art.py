#!/usr/bin/env python3
"""Chroma-key, trim, and size 무한인천 art for the isometric engine."""
from __future__ import annotations

from pathlib import Path
from PIL import Image
import numpy as np

RAW = Path("/workspace/artifacts/imagine_images")
OUT_TEX = Path("/workspace/public/assets/tex")
OUT_CHAR = Path("/workspace/public/assets/chars")
OUT_PROP = Path("/workspace/public/assets/props")
OUT_UI = Path("/workspace/public/assets/ui")
for p in (OUT_TEX, OUT_CHAR, OUT_PROP, OUT_UI):
    p.mkdir(parents=True, exist_ok=True)

TEX = {
    "terr_mud": "9cb71a0d-4951-4f45-a06c-54ee1f9edd12.jpg",
    "terr_sea": "91110401-c8b7-445b-b69f-d371080bdd07.jpg",
    "terr_sand": "dd7bf6ea-b83c-4291-88db-820c42a06ddc.jpg",
    "terr_grass": "38c03001-d4bd-4976-b9a7-e76bb725b82e.jpg",
    "terr_dirt": "6b98a2a9-815f-4dc8-ae8e-e14d6ae0ea2c.jpg",
    "terr_wood": "c0c86930-c2f9-4188-abd8-bea3a9f2ffcf.jpg",
    "terr_stone": "5e122d36-fa7d-4d23-b43c-39fcc06ba92b.jpg",
    "terr_salt": "00a8ab63-794d-46ef-bf77-ce737521848e.jpg",
    "terr_reed": "407bc5b9-7430-43c4-804c-ddd7a2f4d659.jpg",
    "terr_rock": "3c6f8249-c40e-406f-a657-03d8aff0fd10.jpg",
    "terr_floor": "d2db06f9-1280-4b82-9685-cf0476bf91ff.jpg",
    "terr_pier": "51976f99-5ab3-413e-82c8-7c2f3def5331.jpg",
    "terr_cave": "6a580e19-d360-40d4-82ca-1ef4e47c8803.jpg",
}

CHARS = {
    "agent_haeju": "c249578e-92e6-4039-b22a-be5839919677.jpg",
    "agent_mujin": "b21f0dff-8af8-4ac6-aaed-5458eb255922.jpg",
    "agent_dochi": "c2235e69-2dbd-4c2f-a165-c133a9cc5094.jpg",
    "agent_wolsim": "a9a30ca4-71b6-4936-aacb-5cfc9cc153f6.jpg",
    "guard_acolyte": "b9ea1e1d-9ff1-4615-b0db-5747df616a2d.jpg",
    "guard_steward": "779c33e8-c02c-4ae5-8cf3-7c2289885f13.jpg",
    "guard_soldier": "833d9e4e-b3cd-4b50-93da-f70bec076cf1.jpg",
    "guard_sailor": "4cf0b5ee-279f-4512-b27e-6b9c1a08aa1e.jpg",
    "guard_priest": "7eedc5da-81fe-43c5-9c8b-cebeb60f497d.jpg",
    "civil_villager": "57ca2cb1-a602-48a7-b5fe-3817ff417e41.jpg",
    "civil_believer": "879d8001-6f45-4eac-9c82-f9619de7ed57.jpg",
    "civil_patient": "5760a75e-5cda-4a34-855b-e9064ed3755c.jpg",
    "civil_child": "822511ab-0149-456b-8bae-02502dab5a0d.jpg",
    "civil_prisoner": "dad7ea64-a720-49d4-82ef-72a720c0e1a7.jpg",
}

PROPS = {
    "prop_pine": ("d2f606cf-0ae9-4a9a-af77-f3b77b63be3c.jpg", 56, 100),
    "prop_tree": ("c4cb42e4-92b3-4a06-a335-7d3bc599d7d8.jpg", 64, 96),
    "prop_bush": ("590f8ba3-91ff-4564-8c90-7e2c634fcd47.jpg", 44, 40),
    "prop_rock": ("bdf22b2d-7674-4a78-b27b-088b1fa906af.jpg", 44, 36),
    "prop_well": ("93f8083a-ec76-428c-81dc-1a22789a832f.jpg", 52, 56),
    "prop_boat": ("c37e9cd3-23de-47f9-92fa-8a522abbcde7.jpg", 72, 40),
    "prop_belltower": ("df3f07a9-c8cd-4704-a0ea-8b221e2d7ad5.jpg", 48, 110),
    "prop_altar": ("825f17c6-d13d-4b5d-80cf-7cda384a5c7d.jpg", 48, 44),
    "prop_crate": ("43f0a04e-2993-4708-ab99-5531f0a336ce.jpg", 40, 40),
    "prop_jar": ("43f0a04e-2993-4708-ab99-5531f0a336ce.jpg", 36, 40),
    "prop_wreck": ("4a6fa909-c92a-4d82-bbc1-3c91a01a3b2f.jpg", 72, 40),
    "prop_cart": ("2a5e217a-c386-433a-bd2e-5204d435e8fd.jpg", 56, 44),
    "prop_net": ("c4b1fd8f-285f-4ca4-b4c2-4edcad2a9a45.jpg", 48, 52),
    "prop_rack": ("c8b66f39-f171-4b32-993b-6dd84cf7d64a.jpg", 52, 52),
    "prop_kiln": ("1e34414e-82dd-478f-be7b-bda29ce8c157.jpg", 52, 56),
    "prop_stalag": ("8ec12d68-bdc6-4588-962f-ae555dd3bb3a.jpg", 40, 64),
    "prop_stone_pile": ("f5a4ab1c-18f2-47da-9908-039c8e064b85.jpg", 48, 36),
}


def chroma(im: Image.Image, dist: float = 78) -> Image.Image:
    im = im.convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    # magenta + near-magenta (jpeg ringing)
    d = np.sqrt((r - 255) ** 2 + (g - 0) ** 2 + (b - 255) ** 2)
    # also punch very saturated magenta-ish
    mag = (r > 180) & (b > 180) & (g < 90)
    mask = (d < dist) | mag
    arr[..., 3] = np.where(mask, 0, a)
    # slight edge fade
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def trim_alpha(im: Image.Image, pad: int = 4) -> Image.Image:
    a = np.asarray(im.split()[-1])
    ys, xs = np.where(a > 12)
    if len(xs) == 0:
        return im
    x0, x1 = max(0, xs.min() - pad), min(im.width, xs.max() + pad + 1)
    y0, y1 = max(0, ys.min() - pad), min(im.height, ys.max() + pad + 1)
    return im.crop((x0, y0, x1, y1))


def fit_feet(im: Image.Image, w: int, h: int) -> Image.Image:
    """Scale to fit inside w×h, pin feet to bottom-center."""
    im = trim_alpha(im)
    scale = min((w - 2) / im.width, (h - 2) / im.height)
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


def main() -> None:
    for name, fn in TEX.items():
        src = RAW / fn
        out = OUT_TEX / f"{name}.jpg"
        make_seamless(Image.open(src), 256).save(out, "JPEG", quality=86)
        print("tex", name, out.stat().st_size)

    for name, fn in CHARS.items():
        src = RAW / fn
        im = fit_feet(chroma(Image.open(src)), 48, 64)
        out = OUT_CHAR / f"{name}.png"
        im.save(out, "PNG")
        print("char", name, im.size, out.stat().st_size)

    for name, (fn, w, h) in PROPS.items():
        src = RAW / fn
        im = fit_feet(chroma(Image.open(src)), w, h)
        out = OUT_PROP / f"{name}.png"
        im.save(out, "PNG")
        print("prop", name, im.size, out.stat().st_size)

    # jar reuses crate source (small ceramic variant)
    jar_src = RAW / "43f0a04e-2993-4708-ab99-5531f0a336ce.jpg"
    if jar_src.exists():
        im = fit_feet(chroma(Image.open(jar_src)), 36, 40)
        im.save(OUT_PROP / "prop_jar.png", "PNG")

    cover = Image.open(RAW / "5dd65e49-a942-4188-9249-9c8dfcff185c.jpg").convert("RGB")
    cover.save(OUT_UI / "title.jpg", "JPEG", quality=88)

    import subprocess, os
    subprocess.check_call([
        "ffmpeg", "-y", "-i", str(RAW / "5dd65e49-a942-4188-9249-9c8dfcff185c.jpg"),
        "-vf", "scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630",
        "-q:v", "4", "/workspace/public/og.jpg",
    ])
    subprocess.check_call([
        "ffmpeg", "-y", "-i", str(RAW / "8d5282cc-c0dc-44cd-b5eb-e432a6ba9086.jpg"),
        "-vf", "scale=1200:264:force_original_aspect_ratio=increase,crop=1200:264",
        "-q:v", "4", "/workspace/public/x-banner.jpg",
    ])
    print("og", os.path.getsize("/workspace/public/og.jpg"))
    print("banner", os.path.getsize("/workspace/public/x-banner.jpg"))


if __name__ == "__main__":
    main()
