#!/usr/bin/env python3
"""Paste the original portraits onto Grok environment plates so faces stay locked."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
ART = Path("/opt/cursor/artifacts/assets")
PLATES = ROOT / "videos" / "plates"
OUT = ROOT / "videos" / "stills"
OUT.mkdir(parents=True, exist_ok=True)
PLATES.mkdir(parents=True, exist_ok=True)

CHARS = [
    ("haeju", ROOT / "assets/portraits/haeju.jpg"),
    ("mujin", ROOT / "assets/portraits/mujin.jpg"),
    ("dochi", ROOT / "assets/portraits/dochi.jpg"),
    ("wolsim", ROOT / "assets/portraits/wolsim.jpg"),
]


def cutout(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    im = im.crop((int(w * 0.07), int(h * 0.04), int(w * 0.93), int(h * 0.96)))
    arr = np.asarray(im).astype(np.float32)
    h, w = arr.shape[:2]
    yy, xx = np.ogrid[:h, :w]
    nx = (xx - w * 0.50) / (w * 0.40)
    ny = (yy - h * 0.47) / (h * 0.47)
    r = np.sqrt(nx * nx + ny * ny)
    alpha = np.clip((1.02 - r) / 0.18, 0.0, 1.0)
    arr[:, :, 3] = alpha * 255
    out = Image.fromarray(arr.astype(np.uint8), "RGBA")
    a = out.split()[-1].filter(ImageFilter.GaussianBlur(1.6))
    out.putalpha(a)
    return out


def night_grade(im: Image.Image) -> Image.Image:
    im = ImageEnhance.Color(im).enhance(0.88)
    im = ImageEnhance.Contrast(im).enhance(1.06)
    im = ImageEnhance.Brightness(im).enhance(0.96)
    return im


def paste_bust(bg: Image.Image, bust: Image.Image, cx_ratio: float, cy_ratio: float, height_ratio: float) -> Image.Image:
    canvas = bg.convert("RGBA")
    target_h = max(1, int(canvas.height * height_ratio))
    scale = target_h / bust.height
    bust = bust.resize((max(1, int(bust.width * scale)), target_h), Image.Resampling.LANCZOS)
    bust = night_grade(bust)
    shadow = Image.new("RGBA", bust.size, (0, 0, 0, 0))
    sh = bust.split()[-1].filter(ImageFilter.GaussianBlur(18))
    shadow.putalpha(sh.point(lambda p: int(p * 0.55)))
    x = int(canvas.width * cx_ratio - bust.width / 2)
    y = int(canvas.height * cy_ratio - bust.height / 2)
    canvas.alpha_composite(shadow, (x + 8, y + 14))
    canvas.alpha_composite(bust, (x, y))
    return canvas.convert("RGB")


def load_plate(name: str) -> Image.Image:
    for p in (PLATES / name, ART / name):
        if p.exists():
            return Image.open(p).convert("RGB")
    raise SystemExit(f"missing plate {name}")


def save(im: Image.Image, name: str) -> None:
    path = OUT / name
    im.save(path, "PNG", optimize=True)
    print("wrote", path, im.size)


def main() -> None:
    busts = {key: cutout(src) for key, src in CHARS}

    for key, _ in CHARS:
        plate16 = load_plate(f"plate-{key}-16x9.png")
        plate9 = load_plate(f"plate-{key}-9x16.png")
        save(paste_bust(plate16, busts[key], 0.34, 0.54, 0.92), f"{key}-closeup-16x9.png")
        save(paste_bust(plate16, busts[key], 0.30, 0.58, 0.78), f"{key}-cinematic-16x9.png")
        save(paste_bust(plate9, busts[key], 0.50, 0.42, 0.58), f"{key}-vertical-9x16.png")

    squad = load_plate("plate-squad-16x9.png")
    canvas = squad.convert("RGBA")
    for key, x in (("haeju", 0.18), ("mujin", 0.39), ("dochi", 0.61), ("wolsim", 0.82)):
        bust = busts[key]
        target_h = int(squad.height * 0.70)
        scale = target_h / bust.height
        bust = night_grade(bust.resize((max(1, int(bust.width * scale)), target_h), Image.Resampling.LANCZOS))
        shadow = Image.new("RGBA", bust.size, (0, 0, 0, 0))
        sh = bust.split()[-1].filter(ImageFilter.GaussianBlur(16))
        shadow.putalpha(sh.point(lambda p: int(p * 0.5)))
        px = int(squad.width * x - bust.width / 2)
        py = int(squad.height * 0.64 - bust.height / 2)
        canvas.alpha_composite(shadow, (px + 6, py + 12))
        canvas.alpha_composite(bust, (px, py))
    save(canvas.convert("RGB"), "squad-cinematic-16x9.png")


if __name__ == "__main__":
    main()
