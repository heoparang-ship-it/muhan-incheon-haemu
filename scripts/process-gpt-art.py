#!/usr/bin/env python3
"""Bake GPT-generated source sheets into the game's runtime asset slots.

The source images are original assets generated for the project. Sprite sources
use a #ff00ff chroma background; terrain and UI sources are opaque.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "game"
OUT_CHAR = GAME / "assets" / "chars"
OUT_PROP = GAME / "assets" / "props"
OUT_BLD = GAME / "assets" / "bld"
OUT_TEX = GAME / "assets" / "tex"
OUT_UI = GAME / "assets" / "ui"
PREVIEW = ROOT / "artifacts" / "gpt_art_preview"

CELL_W, CELL_H = 56, 76

CHARACTERS = (
    "haeju",
    "mujin",
    "dochi",
    "wolsim",
    "acolyte",
    "steward",
    "soldier",
    "sailor",
    "priest",
    "villager",
    "believer",
    "patient",
    "child",
    "prisoner",
)

CHARACTER_IDS = {
    "haeju": "agent_haeju",
    "mujin": "agent_mujin",
    "dochi": "agent_dochi",
    "wolsim": "agent_wolsim",
    "acolyte": "guard_acolyte",
    "steward": "guard_steward",
    "soldier": "guard_soldier",
    "sailor": "guard_sailor",
    "priest": "guard_priest",
    "villager": "civil_villager",
    "believer": "civil_believer",
    "patient": "civil_patient",
    "child": "civil_child",
    "prisoner": "civil_prisoner",
}

# Generated rows are ordered SE, SW, NW, NE. Keep this explicit so a future
# source sheet can be corrected without changing the runtime format.
DIR_ORDER = {
    "haeju": (0, 2, 1, 3),
}

PROP_A = (
    ("prop_pine", 80, 160),
    ("prop_tree", 90, 140),
    ("prop_bush", 56, 48),
    ("prop_rock", 52, 40),
    ("prop_jar", 32, 44),
    ("prop_net", 56, 64),
    ("prop_rack", 60, 64),
    ("prop_cart", 80, 56),
    ("prop_well", 64, 72),
    ("prop_boat", 110, 56),
    ("prop_wreck", 110, 52),
    ("prop_crate", 44, 44),
    ("prop_kiln", 64, 72),
    ("prop_altar", 60, 52),
    ("prop_belltower", 64, 180),
    ("prop_stalag", 40, 80),
)

TERRAINS = (
    "terr_sea",
    "terr_mud",
    "terr_sand",
    "terr_grass",
    "terr_dirt",
    "terr_wood",
    "terr_stone",
    "terr_salt",
    "terr_reed",
    "terr_rock",
    "terr_floor",
    "terr_pier",
    "terr_cave",
)

BUILDING_A = (
    ("bld_thatch_2x2", 256, 260),
    ("bld_thatch_3x2", 320, 292),
    ("bld_thatch_5x4", 576, 422),
    ("bld_tile_2x2", 256, 262),
)

BUILDING_B = (
    ("bld_tile_3x2", 320, 294),
    ("bld_tile_4x4", 512, 392),
    ("bld_tile_6x4", 640, 456),
    ("bld_west_8x6", 896, 604),
)

BUILDING_VARIANTS_A = (
    ("bld_thatch_2x2_v1", 256, 260),
    ("bld_thatch_2x2_v2", 256, 260),
    ("bld_thatch_3x2_v1", 320, 292),
    ("bld_thatch_3x2_v2", 320, 292),
)

BUILDING_VARIANTS_B = (
    ("bld_tile_2x2_v1", 256, 262),
    ("bld_tile_2x2_v2", 256, 262),
    ("bld_tile_3x2_v1", 320, 294),
    ("bld_thatch_5x4_v1", 576, 422),
)

DECALS = (
    ("decal_cart_ruts", 192, 96),
    ("decal_puddle", 144, 80),
    ("decal_trampled_grass", 144, 72),
    ("decal_courtyard", 192, 96),
    ("decal_salt_crust", 144, 72),
    ("decal_reed_trail", 160, 80),
    ("decal_shore_wrack", 160, 72),
    ("decal_moss_stain", 128, 64),
    ("decal_footprints", 128, 64),
    ("decal_cart_turn", 160, 80),
    ("decal_kiln_ash", 128, 64),
    ("decal_straw", 144, 72),
    ("decal_fish_scales", 128, 64),
    ("decal_drainage", 160, 72),
    ("decal_pebbles", 128, 64),
    ("decal_tide_pool", 144, 72),
)

SCENERY = (
    ("scene_pine_mass", 280, 220),
    ("scene_reed_bank", 260, 140),
    ("scene_rock_shelf", 260, 140),
    ("scene_fishing_yard", 260, 180),
)


def dilate(mask: np.ndarray, count: int = 1) -> np.ndarray:
    out = mask
    for _ in range(count):
        padded = np.pad(out, 1, constant_values=False)
        out = (
            padded[:-2, :-2]
            | padded[:-2, 1:-1]
            | padded[:-2, 2:]
            | padded[1:-1, :-2]
            | padded[1:-1, 1:-1]
            | padded[1:-1, 2:]
            | padded[2:, :-2]
            | padded[2:, 1:-1]
            | padded[2:, 2:]
        )
    return out


def rgb_hsv(
    r: np.ndarray, g: np.ndarray, b: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    maxc = np.maximum(np.maximum(rf, gf), bf)
    minc = np.minimum(np.minimum(rf, gf), bf)
    delta = maxc - minc
    sat = np.where(maxc > 1e-5, delta / np.maximum(maxc, 1e-5), 0.0)
    hue = np.zeros_like(maxc)
    rc = (maxc - rf) / np.maximum(delta, 1e-5)
    gc = (maxc - gf) / np.maximum(delta, 1e-5)
    bc = (maxc - bf) / np.maximum(delta, 1e-5)
    hue = np.where(maxc == rf, bc - gc, hue)
    hue = np.where(maxc == gf, 2.0 + rc - bc, hue)
    hue = np.where(maxc == bf, 4.0 + gc - rc, hue)
    hue = np.where(delta > 1e-5, (hue / 6.0) % 1.0, 0.0)
    return hue * 360.0, sat, maxc


def chroma(im: Image.Image) -> Image.Image:
    """Remove generated magenta plus its antialias ring and color spill."""
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    r, g, b, a = (arr[..., index] for index in range(4))
    hue, sat, val = rgb_hsv(r, g, b)
    distance = np.sqrt((r - 255.0) ** 2 + g**2 + (b - 255.0) ** 2)
    magenta_hue = (hue >= 278.0) & (hue <= 348.0)
    strong = (
        (distance < 120)
        | ((r > 175) & (b > 165) & (g < 115))
        | (magenta_hue & (sat > 0.36) & (val > 0.20) & (g < r * 0.68))
    )
    weak = (
        (distance < 180)
        | (magenta_hue & (sat > 0.14) & (val > 0.10) & (g < r * 0.84))
        | ((r > 125) & (b > 75) & (g < 120) & ((r + b) > g * 2.1 + 45))
    )

    # Flood-fill only through magenta-like pixels connected to the backdrop.
    punch = strong.copy()
    grown = punch.copy()
    for _ in range(64):
        nxt = dilate(grown) & (strong | weak)
        if np.array_equal(nxt, grown):
            break
        grown = nxt
    punch |= grown
    punch |= dilate(punch) & weak
    alpha = np.where(punch, 0.0, a)

    # Despill the one-pixel retained edge without touching interior colors.
    edge = dilate(alpha < 10, 2) & (alpha > 0)
    spill = np.clip(np.minimum(r, b) - g, 0.0, None)
    mag_edge = edge & ((spill > 5) | (magenta_hue & (sat > 0.10)))
    pull = np.where(mag_edge, np.clip(spill * 0.96, 0, 200), 0.0)
    arr[..., 0] = np.clip(r - pull, 0, 255)
    arr[..., 1] = np.clip(g + pull * 0.08, 0, 255)
    arr[..., 2] = np.clip(b - pull * 0.88, 0, 255)
    arr[..., 3] = np.where(alpha < 12, 0, alpha)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def neutralize_purple_spill(im: Image.Image) -> Image.Image:
    """Turn chroma-contaminated purple edge pixels into bark/foliage neutrals."""
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    r, g, b, a = (arr[..., index] for index in range(4))
    spill = (
        (a > 8)
        & (r > g * 1.08)
        & (b > g * 1.08)
        & ((r + b) > g * 2.35 + 16)
    )
    arr[..., 0] = np.where(spill, np.maximum(g * 1.06, r * 0.58), r)
    arr[..., 1] = np.where(spill, np.maximum(g, (r + g + b) / 4.2), g)
    arr[..., 2] = np.where(spill, np.minimum(g * 0.82, b), b)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def roughen_decal_edge(im: Image.Image, seed: int) -> Image.Image:
    """Break the generated oval silhouette with a deterministic ragged fade."""
    arr = np.asarray(im.convert("RGBA")).astype(np.float32)
    height, width = arr.shape[:2]
    yy, xx = np.mgrid[0:height, 0:width]
    nx = (xx - (width - 1) / 2) / max(1.0, width * 0.48)
    ny = (yy - (height - 1) / 2) / max(1.0, height * 0.48)
    radius = np.sqrt(nx * nx + ny * ny)
    noise = (
        np.sin(xx * 0.17 + seed * 1.7)
        + np.sin(yy * 0.29 + seed * 0.9)
        + np.sin((xx + yy) * 0.11 + seed * 2.3)
    ) / 3.0
    boundary = 0.78 + noise * 0.13
    ragged = np.clip((boundary - radius) / 0.16, 0.0, 1.0)
    arr[..., 3] *= ragged
    arr[..., 3] = np.where(arr[..., 3] < 10, 0, arr[..., 3])
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def trim(im: Image.Image, pad: int = 3) -> Image.Image:
    alpha = np.asarray(im.getchannel("A"))
    ys, xs = np.where(alpha > 12)
    if not len(xs):
        return Image.new("RGBA", (2, 2), (0, 0, 0, 0))
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(im.width, int(xs.max()) + pad + 1)
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(im.height, int(ys.max()) + pad + 1)
    return im.crop((x0, y0, x1, y1))


def fit_bottom(
    im: Image.Image,
    width: int,
    height: int,
    pad: int = 3,
    max_upscale: float | None = None,
) -> Image.Image:
    im = trim(im)
    scale = min((width - pad * 2) / max(1, im.width), (height - pad) / max(1, im.height))
    if max_upscale is not None:
        scale = min(scale, max_upscale)
    size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
    im = im.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((width - im.width) // 2, height - im.height))
    return canvas


def fit_center(im: Image.Image, width: int, height: int, pad: int = 3) -> Image.Image:
    im = trim(im)
    scale = min((width - pad * 2) / max(1, im.width), (height - pad * 2) / max(1, im.height))
    size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
    im = im.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((width - im.width) // 2, (height - im.height) // 2))
    return canvas


def split_grid(im: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    cells: list[Image.Image] = []
    for row in range(rows):
        y0 = round(row * im.height / rows)
        y1 = round((row + 1) * im.height / rows)
        for col in range(cols):
            x0 = round(col * im.width / cols)
            x1 = round((col + 1) * im.width / cols)
            cells.append(im.crop((x0, y0, x1, y1)))
    return cells


def seamless(im: Image.Image, size: int = 512) -> Image.Image:
    """Move the original edges inward and softly heal the center seams."""
    base = ImageOps.fit(im.convert("RGB"), (size, size), method=Image.Resampling.LANCZOS)
    arr = np.asarray(base).astype(np.float32)
    shifted = np.roll(np.roll(arr, size // 2, axis=0), size // 2, axis=1)

    yy, xx = np.mgrid[0:size, 0:size]
    dx = np.abs(xx - size / 2)
    dy = np.abs(yy - size / 2)
    seam = np.maximum(
        np.clip(1.0 - dx / 52.0, 0.0, 1.0),
        np.clip(1.0 - dy / 52.0, 0.0, 1.0),
    )
    # Near the new center seams, mix in a softly mirrored neighborhood.
    smooth = (
        shifted
        + np.roll(shifted, 12, axis=0)
        + np.roll(shifted, -12, axis=0)
        + np.roll(shifted, 12, axis=1)
        + np.roll(shifted, -12, axis=1)
    ) / 5.0
    out = shifted * (1.0 - seam[..., None] * 0.55) + smooth * seam[..., None] * 0.55
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")


def cover(im: Image.Image, size: tuple[int, int], centering=(0.5, 0.5)) -> Image.Image:
    return ImageOps.fit(
        im.convert("RGB"),
        size,
        method=Image.Resampling.LANCZOS,
        centering=centering,
    )


def process_characters(source: Path) -> None:
    for key in CHARACTERS:
        src = source / f"gpt_walk_{key}.png"
        cells = split_grid(chroma(Image.open(src)), 4, 4)
        rows = [cells[i * 4 : (i + 1) * 4] for i in range(4)]
        order = DIR_ORDER.get(key, (0, 1, 2, 3))
        walk = Image.new("RGBA", (CELL_W * 4, CELL_H * 4), (0, 0, 0, 0))
        idle = Image.new("RGBA", (CELL_W, CELL_H * 4), (0, 0, 0, 0))
        for dest_dir, src_dir in enumerate(order):
            for frame, cell in enumerate(rows[src_dir]):
                fitted = fit_bottom(cell, CELL_W, CELL_H, pad=1)
                walk.alpha_composite(fitted, (frame * CELL_W, dest_dir * CELL_H))
                if frame == 1:
                    idle.alpha_composite(fitted, (0, dest_dir * CELL_H))
        asset_id = CHARACTER_IDS[key]
        walk.save(OUT_CHAR / f"{asset_id}_walk.png", optimize=True)
        idle.save(OUT_CHAR / f"{asset_id}.png", optimize=True)


def process_props(source: Path) -> None:
    cells_a = split_grid(chroma(Image.open(source / "gpt_props_atlas_a.png")), 4, 4)
    for cell, (asset_id, width, height) in zip(cells_a, PROP_A):
        fit_bottom(cell, width, height, pad=2).save(
            OUT_PROP / f"{asset_id}.png", optimize=True
        )

    cells_b = split_grid(chroma(Image.open(source / "gpt_props_atlas_b.png")), 4, 2)
    fit_bottom(cells_b[0], 56, 40, pad=1).save(
        OUT_PROP / "prop_stone_pile.png", optimize=True
    )
    fit_bottom(cells_b[1], 36, 80, pad=1).save(
        OUT_PROP / "prop_lamp_off.png", optimize=True
    )
    lamp = Image.new("RGBA", (36 * 4, 80), (0, 0, 0, 0))
    for frame, cell_index in enumerate((2, 3, 4, 5)):
        lamp.alpha_composite(fit_bottom(cells_b[cell_index], 36, 80, pad=1), (frame * 36, 0))
    lamp.save(OUT_PROP / "prop_lamp_on.png", optimize=True)
    fit_bottom(cells_b[6], 64, 140, pad=1).save(
        OUT_PROP / "prop_pole.png", optimize=True
    )
    fit_bottom(cells_b[7], 80, 58, pad=1).save(
        OUT_PROP / "prop_fence.png", optimize=True
    )


def process_terrain(source: Path) -> None:
    cells = split_grid(Image.open(source / "gpt_terrain_atlas.png"), 4, 4)
    for asset_id, cell in zip(TERRAINS, cells):
        tex = seamless(cell, 512)
        tex.save(OUT_TEX / f"{asset_id}.jpg", quality=90, optimize=True)


def process_buildings(source: Path) -> None:
    cells_a = split_grid(chroma(Image.open(source / "gpt_buildings_atlas_a.png")), 2, 2)
    cells_b = split_grid(chroma(Image.open(source / "gpt_buildings_atlas_b.png")), 2, 2)
    for cell, (asset_id, width, height) in zip(cells_a, BUILDING_A):
        fit_bottom(cell, width, height, pad=6).save(
            OUT_BLD / f"{asset_id}.png", optimize=True
        )
    for cell, (asset_id, width, height) in zip(cells_b, BUILDING_B):
        fit_bottom(cell, width, height, pad=6).save(
            OUT_BLD / f"{asset_id}.png", optimize=True
        )
    wall = chroma(Image.open(source / "gpt_building_wall.png"))
    fit_bottom(wall, 96, 108, pad=2).save(OUT_BLD / "bld_wall.png", optimize=True)

    variant_a = split_grid(
        chroma(Image.open(source / "gpt_building_variants_a.png")), 2, 2
    )
    variant_b = split_grid(
        chroma(Image.open(source / "gpt_building_variants_b.png")), 2, 2
    )
    for cell, (asset_id, width, height) in zip(variant_a, BUILDING_VARIANTS_A):
        fit_bottom(cell, width, height, pad=6).save(
            OUT_BLD / f"{asset_id}.png", optimize=True
        )
    for cell, (asset_id, width, height) in zip(variant_b, BUILDING_VARIANTS_B):
        fit_bottom(cell, width, height, pad=6).save(
            OUT_BLD / f"{asset_id}.png", optimize=True
        )


def process_world_details(source: Path) -> None:
    decal_cells = split_grid(
        chroma(Image.open(source / "gpt_ground_decals.png")), 4, 4
    )
    for index, (cell, (asset_id, width, height)) in enumerate(zip(decal_cells, DECALS)):
        fitted = fit_center(cell, width, height, pad=2)
        roughen_decal_edge(fitted, index + 1).save(
            OUT_PROP / f"{asset_id}.png", optimize=True
        )

    scenery_cells = split_grid(
        chroma(Image.open(source / "gpt_scenery_clusters.png")), 2, 2
    )
    for cell, (asset_id, width, height) in zip(scenery_cells, SCENERY):
        fitted = fit_bottom(cell, width, height, pad=3)
        if asset_id == "scene_pine_mass":
            fitted = neutralize_purple_spill(fitted)
        fitted.save(OUT_PROP / f"{asset_id}.png", optimize=True)


def process_ui(source: Path) -> None:
    for key in ("haeju", "mujin", "dochi", "wolsim"):
        im = Image.open(source / f"gpt_portrait_{key}.png")
        cover(im, (192, 240), (0.5, 0.40)).save(
            OUT_UI / f"portrait_{key}.jpg", quality=92, optimize=True
        )

    title = Image.open(source / "gpt_title_gamnaru.png")
    cover(title, (1792, 1008), (0.5, 0.5)).save(
        OUT_UI / "title.jpg", quality=91, optimize=True
    )
    cover(title, (1200, 630), (0.5, 0.5)).save(
        GAME / "cover.jpg", quality=91, optimize=True
    )
    cover(title, (1200, 630), (0.5, 0.5)).save(
        GAME / "og.jpg", quality=91, optimize=True
    )
    cover(title, (1200, 264), (0.52, 0.47)).save(
        GAME / "x-banner.jpg", quality=91, optimize=True
    )


def write_preview() -> None:
    PREVIEW.mkdir(parents=True, exist_ok=True)
    char_ids = list(CHARACTER_IDS.values())
    canvas = Image.new("RGBA", (224 * 4, 304 * 4), (15, 20, 23, 255))
    for index, asset_id in enumerate(char_ids):
        im = Image.open(OUT_CHAR / f"{asset_id}_walk.png")
        canvas.alpha_composite(im, ((index % 4) * 224, (index // 4) * 304))
    canvas.convert("RGB").save(PREVIEW / "characters.jpg", quality=88)

    prop_files = [OUT_PROP / f"{asset_id}.png" for asset_id, *_ in PROP_A]
    prop_files += [
        OUT_PROP / "prop_stone_pile.png",
        OUT_PROP / "prop_lamp_off.png",
        OUT_PROP / "prop_lamp_on.png",
        OUT_PROP / "prop_pole.png",
        OUT_PROP / "prop_fence.png",
    ]
    props = Image.new("RGBA", (640, 480), (15, 20, 23, 255))
    for index, path in enumerate(prop_files):
        im = Image.open(path)
        cell = fit_bottom(im, 128, 96, pad=5, max_upscale=1.0)
        props.alpha_composite(cell, ((index % 5) * 128, (index // 5) * 96))
    props.convert("RGB").save(PREVIEW / "props.jpg", quality=88)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("/opt/cursor/artifacts/assets"),
        help="Directory containing gpt_*.png source images.",
    )
    args = parser.parse_args()
    for directory in (OUT_CHAR, OUT_PROP, OUT_BLD, OUT_TEX, OUT_UI):
        directory.mkdir(parents=True, exist_ok=True)

    process_characters(args.source)
    process_props(args.source)
    process_terrain(args.source)
    process_buildings(args.source)
    process_world_details(args.source)
    process_ui(args.source)
    write_preview()
    print("Baked original GPT art into", GAME / "assets")


if __name__ == "__main__":
    main()
