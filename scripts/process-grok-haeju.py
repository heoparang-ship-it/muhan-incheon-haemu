#!/usr/bin/env python3
"""Turn grok haeju stills into engine idle/walk sheets.

Source:
  game/assets/chars/grok/haeju_walk_sheet.png  — 8 frames, one iso heading
  game/assets/chars/grok/haeju_base.jpg        — idle still, gray studio bg

Output (rows = 4 dirs, cols = frames):
  game/assets/chars/agent_haeju.png
  game/assets/chars/agent_haeju_walk.png

Dirs 0–1 keep the grok heading. Dirs 2–3 are a horizontal flip so
turning around is not the same silhouette. Also writes a full-size
ship occluder and a sampled 32×32 walk mask.
"""
from __future__ import annotations

import json
import re
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
CHARS = ROOT / "game/assets/chars"
GROK = CHARS / "grok"
MAPS = ROOT / "game/assets/maps"
OBJ = MAPS / "obj"
ASSET_JS = ROOT / "game/asset-data.js"
LAYERS = MAPS / "tut01_layers.json"

CELL_W, CELL_H = 72, 96
WALK_FRAMES = 4
DIRS = 4
CACHE_V = "v=13"


def flood_punch(im: Image.Image, is_bg) -> Image.Image:
    """Clear background that is reachable from the image edge. Keeps a black gat."""
    im = im.convert("RGBA")
    arr = np.array(im)
    h, w = arr.shape[:2]
    vis = np.zeros((h, w), dtype=bool)
    q = deque()

    def push(y, x):
        if vis[y, x] or not is_bg[y, x]:
            return
        vis[y, x] = True
        q.append((y, x))

    for x in range(w):
        push(0, x)
        push(h - 1, x)
    for y in range(h):
        push(y, 0)
        push(y, w - 1)
    while q:
        y, x = q.popleft()
        if y > 0:
            push(y - 1, x)
        if y + 1 < h:
            push(y + 1, x)
        if x > 0:
            push(y, x - 1)
        if x + 1 < w:
            push(y, x + 1)
    arr[..., 3] = np.where(vis, 0, arr[..., 3])
    # soften a 1px fringe
    a = arr[..., 3].astype(np.float32)
    p = np.pad(vis, 1, constant_values=False)
    fringe = ~vis & (
        p[:-2, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | p[2:, 1:-1]
    )
    a[fringe] *= 0.35
    arr[..., 3] = a.astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def punch_black(im: Image.Image, thresh: int = 22) -> Image.Image:
    arr = np.array(im.convert("RGBA"), dtype=np.float32)
    lum = 0.3 * arr[..., 0] + 0.59 * arr[..., 1] + 0.11 * arr[..., 2]
    is_bg = (lum < thresh) & (arr[..., 3] < 250)
    # already-transparent counts as background
    is_bg = is_bg | (arr[..., 3] < 8)
    return flood_punch(im, is_bg)


def punch_studio_gray(im: Image.Image) -> Image.Image:
    arr = np.array(im.convert("RGB"), dtype=np.float32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mean = (r + g + b) / 3.0
    chroma = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    is_bg = (mean > 175) & (chroma < 18)
    rgba = Image.fromarray(arr.astype(np.uint8), "RGB").convert("RGBA")
    return flood_punch(rgba, is_bg)


def content_bbox(im: Image.Image, alpha_min: int = 12):
    a = np.array(im.split()[-1])
    ys, xs = np.where(a >= alpha_min)
    if xs.size == 0:
        return (0, 0, im.size[0], im.size[1])
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def fit_cell(im: Image.Image, cw: int, ch: int) -> Image.Image:
    x0, y0, x1, y1 = content_bbox(im)
    crop = im.crop((x0, y0, x1, y1))
    pad = 6
    canvas = Image.new("RGBA", (crop.size[0] + pad * 2, crop.size[1] + pad * 2), (0, 0, 0, 0))
    canvas.paste(crop, (pad, pad), crop)
    # scale to fit height, keep aspect, then bottom-center in cell
    scale = min((ch - 4) / canvas.size[1], (cw - 2) / canvas.size[0])
    nw = max(1, int(round(canvas.size[0] * scale)))
    nh = max(1, int(round(canvas.size[1] * scale)))
    scaled = canvas.resize((nw, nh), Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    cell.paste(scaled, ((cw - nw) // 2, ch - nh - 2), scaled)
    return cell


def split_walk_frames(sheet: Image.Image, n: int = 8):
    w, h = sheet.size
    fw = w // n
    return [sheet.crop((i * fw, 0, (i + 1) * fw, h)) for i in range(n)]


def compose_sheet(cells_by_dir: list[list[Image.Image]]) -> Image.Image:
    frames = len(cells_by_dir[0])
    dirs = len(cells_by_dir)
    cw, ch = cells_by_dir[0][0].size
    out = Image.new("RGBA", (cw * frames, ch * dirs), (0, 0, 0, 0))
    for d, row in enumerate(cells_by_dir):
        for f, cell in enumerate(row):
            out.paste(cell, (f * cw, d * ch), cell)
    return out


def haeju_sheets():
    sheet = Image.open(GROK / "haeju_walk_sheet.png")
    raw = split_walk_frames(sheet, 8)
    punched = [punch_black(fr) for fr in raw]
    # 4-frame cycle from the 8-frame grok walk
    walk_src = [punched[i] for i in (0, 2, 4, 6)]
    walk_cells = [fit_cell(fr, CELL_W, CELL_H) for fr in walk_src]
    idle_cell = fit_cell(punched[0], CELL_W, CELL_H)

    base = GROK / "haeju_base.jpg"
    if base.exists():
        still = punch_studio_gray(Image.open(base))
        # prefer the still if it actually isolated a figure
        x0, y0, x1, y1 = content_bbox(still)
        if (x1 - x0) > 80 and (y1 - y0) > 160:
            idle_cell = fit_cell(still, CELL_W, CELL_H)

    flipped_walk = [c.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for c in walk_cells]
    flipped_idle = idle_cell.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    walk_dirs = [walk_cells, walk_cells, flipped_walk, flipped_walk]
    idle_dirs = [[idle_cell], [idle_cell], [flipped_idle], [flipped_idle]]
    walk = compose_sheet(walk_dirs)
    idle = compose_sheet(idle_dirs)
    idle.save(CHARS / "agent_haeju.png")
    walk.save(CHARS / "agent_haeju_walk.png")
    print("haeju idle", idle.size, "walk", walk.size)


def extract_ship_overlay():
    ground = Image.open(MAPS / "tut01_ground.png").convert("RGBA")
    arr = np.array(ground, dtype=np.float32)
    h, w = arr.shape[:2]
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    dirt = (r > 90) & (g > 70) & (b > 40) & (r > g) & (g > b) & ((r - b) < 110) & (r < 210)
    water = (b > r + 8) & (b > 70) & (g > 70)
    fog = (r > 160) & (g > 170) & (b > 180) & (np.abs(r - g) < 25)
    keep_x = np.zeros((h, w), dtype=bool)
    keep_x[:, : int(w * 0.42)] = True
    ship = keep_x & ~dirt & ~water & ~fog
    sail = keep_x & (r > 200) & (g > 195) & (b > 185) & (r - b < 40)
    mask = ship | sail
    p = np.pad(mask, 1, constant_values=False)
    mask = p[:-2, 1:-1] | p[1:-1, :-2] | p[1:-1, 1:-1] | p[1:-1, 2:] | p[2:, 1:-1]
    out = arr.copy()
    out[..., 3] = np.where(mask, a, 0)
    im = Image.fromarray(out.astype(np.uint8), "RGBA")
    dest = OBJ / "ship.png"
    im.save(dest)
    print("ship overlay", dest, im.size, "opaque", float((out[..., 3] > 8).mean()))
    return im.size


def sample_walk_mask() -> list[str]:
    ground = np.array(Image.open(MAPS / "tut01_ground.png").convert("RGB"))
    h, w = ground.shape[:2]
    tw, th, n = 64, 32, 32
    cx, cy = 0.0, (n * 0.5 + n * 0.5) * (th / 2)
    bx, by = cx - w / 2, cy - h / 2
    rows = []
    for y in range(n):
        row = []
        for x in range(n):
            sx = (x + 0.5 - (y + 0.5)) * (tw / 2)
            sy = (x + 0.5 + y + 0.5) * (th / 2)
            px = int(round(sx - bx))
            py = int(round(sy - by))
            if px < 8 or py < 8 or px >= w - 8 or py >= h - 8:
                row.append("#")
                continue
            patch = ground[py - 3 : py + 4, px - 3 : px + 4].reshape(-1, 3).astype(np.float32)
            r, g, b = patch.mean(axis=0)
            if b > r + 10 and b > 68 and g > 60:
                row.append("~")
            elif r > 168 and g > 176 and b > 184 and abs(r - g) < 22:
                row.append("#")
            elif r < 38 and g < 38 and b < 42:
                row.append("#")
            else:
                row.append(".")
        rows.append("".join(row))
    print("walk mask")
    for line in rows:
        print(line)
    return rows


def js_walk_literal(rows: list[str]) -> str:
    inner = ",\n  ".join("'" + r + "'" for r in rows)
    return "const TUT_WALK = [\n  " + inner + "\n];"


def update_asset_data():
    raw = ASSET_JS.read_text(encoding="utf-8")
    start, end = raw.find("{"), raw.rfind("}")
    data = json.loads(raw[start : end + 1])
    rec = data["assets"].setdefault("agent_haeju", {})
    rec.update({
        "dirs": DIRS,
        "cellW": CELL_W,
        "cellH": CELL_H,
        "anchorX": CELL_W // 2,
        "anchorY": CELL_H - 6,
        "clips": [
            {"key": "idle", "frames": 1},
            {"key": "walk", "frames": WALK_FRAMES},
        ],
        "sheets": {
            "idle": f"assets/chars/agent_haeju.png?{CACHE_V}",
            "walk": f"assets/chars/agent_haeju_walk.png?{CACHE_V}",
        },
    })
    mujin = data["assets"].get("agent_mujin")
    if mujin:
        mp = CHARS / "agent_mujin.png"
        if mp.exists() and Image.open(mp).size[0] >= 56:
            mujin["cellW"] = CELL_W
            mujin["cellH"] = CELL_H
            mujin["anchorX"] = CELL_W // 2
            mujin["anchorY"] = CELL_H - 6
            mujin["dirs"] = DIRS
            mujin.setdefault("sheets", {})["idle"] = f"assets/chars/agent_mujin.png?{CACHE_V}"
    ASSET_JS.write_text(
        "const ASSET_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print("asset-data haeju", rec)


def patch_index_walk(rows: list[str]):
    html = ROOT / "game/index.html"
    text = html.read_text(encoding="utf-8")
    new = js_walk_literal(rows)
    text2, n = re.subn(
        r"const TUT_WALK = \[[\s\S]*?\];",
        new,
        text,
        count=1,
    )
    if n != 1:
        raise SystemExit(f"TUT_WALK replace count {n}")
    html.write_text(text2, encoding="utf-8")
    print("patched TUT_WALK")


def patch_layers(rows: list[str], ship_size):
    if not LAYERS.exists():
        return
    data = json.loads(LAYERS.read_text(encoding="utf-8"))
    data["walk"] = rows
    data["objects"]["ship"] = {
        "w": ship_size[0],
        "h": ship_size[1],
        "dw": ship_size[0],
        "dh": ship_size[1],
        "ox": 0.0,
        "oy": 0.0,
        "paint": True,
    }
    LAYERS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("layers ship + walk")


def main():
    CHARS.mkdir(exist_ok=True)
    OBJ.mkdir(parents=True, exist_ok=True)
    haeju_sheets()
    update_asset_data()
    # Ship overlay / walk-mask sampling are opt-in. Color keys on this
    # paint still swallow mud and block the plaza, so they stay unused.


if __name__ == "__main__":
    main()
