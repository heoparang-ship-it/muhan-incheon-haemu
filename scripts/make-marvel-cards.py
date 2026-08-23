#!/usr/bin/env python3
"""Marvel-style title cards for each agent."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "videos" / "cards"
OUT.mkdir(parents=True, exist_ok=True)
FONT = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
GOLD = (227, 192, 114, 255)
CREAM = (242, 220, 166, 255)
MUTED = (147, 167, 174, 255)
BG = (3, 7, 10, 255)

CHARS = [
    {
        "id": "haeju",
        "name": "윤해주",
        "role": "역관 겸 의술 보조",
        "q": "변장",
        "x": "대화 유인",
        "hint": "위조 문답으로 검문을 통과한다",
    },
    {
        "id": "mujin",
        "name": "강무진",
        "role": "파직된 영종진 수군",
        "q": "배후 제압",
        "x": "밧줄 걸기",
        "hint": "뒤에서 소리 없이 제압한다",
    },
    {
        "id": "dochi",
        "name": "백도치",
        "role": "감나루 뱃사공",
        "q": "물길",
        "x": "어망 함정",
        "hint": "갯골을 지름길로 쓴다",
    },
    {
        "id": "wolsim",
        "name": "월심",
        "role": "당집을 떠난 무녀의 제자",
        "q": "방울 유인",
        "x": "향 연기",
        "hint": "소리와 연기로 시야를 끊는다",
    },
]


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def center(draw: ImageDraw.ImageDraw, text: str, y: int, fnt, fill, W: int) -> None:
    box = draw.textbbox((0, 0), text, font=fnt)
    x = (W - (box[2] - box[0])) // 2
    draw.text((x, y), text, font=fnt, fill=fill)


def rule(draw: ImageDraw.ImageDraw, y: int, W: int, width: int = 120) -> None:
    x0 = (W - width) // 2
    draw.rectangle((x0, y, x0 + width, y + 3), fill=GOLD)


def card(size: tuple[int, int], lines: list[tuple[str, int, tuple]]) -> Image.Image:
    W, H = size
    im = Image.new("RGBA", size, BG)
    draw = ImageDraw.Draw(im)
    # faint vignette
    for i in range(80):
        a = int(40 * (1 - i / 80))
        draw.rectangle((i, i, W - 1 - i, H - 1 - i), outline=(0, 0, 0, a))
    total = sum(s + 18 for _, s, _ in lines) + 40
    y = (H - total) // 2
    for text, size_pt, color in lines:
        if text == "—":
            rule(draw, y + 10, W)
            y += 36
            continue
        center(draw, text, y, font(size_pt), color, W)
        y += size_pt + 18
    return im.convert("RGB")


def save(im: Image.Image, name: str) -> None:
    path = OUT / name
    im.save(path, "PNG", optimize=True)
    print("wrote", path)


def main() -> None:
    sizes = {"9x16": (1080, 1920), "16x9": (1920, 1080)}
    for tag, size in sizes.items():
        save(
            card(
                size,
                [
                    ("무한인천", 28 if tag == "9x16" else 26, GOLD),
                    ("—", 20, GOLD),
                    ("해무의 성가", 72 if tag == "9x16" else 64, CREAM),
                    ("조사패 시네마틱", 28, MUTED),
                ],
            ),
            f"intro-{tag}.png",
        )
        for c in CHARS:
            q_size = 96 if tag == "9x16" else 80
            save(
                card(
                    size,
                    [
                        ("Q", 22, MUTED),
                        ("—", 20, GOLD),
                        (c["q"], q_size, CREAM),
                        (c["hint"], 26, MUTED),
                    ],
                ),
                f"{c['id']}-q-{tag}.png",
            )
            save(
                card(
                    size,
                    [
                        ("X", 22, MUTED),
                        ("—", 20, GOLD),
                        (c["x"], q_size, CREAM),
                    ],
                ),
                f"{c['id']}-x-{tag}.png",
            )
            save(
                card(
                    size,
                    [
                        ("무한인천", 24, GOLD),
                        ("—", 20, GOLD),
                        (c["name"], 88 if tag == "9x16" else 76, CREAM),
                        (c["role"], 28, GOLD),
                        (f"{c['q']}  ·  {c['x']}", 26, MUTED),
                    ],
                ),
                f"{c['id']}-end-{tag}.png",
            )


if __name__ == "__main__":
    main()
