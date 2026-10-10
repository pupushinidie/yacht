"""快艇骰子：代码画的特效精灵图（横排）。

- fx/yacht.png   96×96×12 循环：咕噜嘎（全站原图逐格，和 tutorial/gulu.ts 同一套像素，不上传 PixelLab）蹦跳 + 彩纸
- fx/burst.png   64×64×8  一次（末帧空）：小烟花
- fx/scratch.png 96×24×6  一次停末帧：红铅笔划掉
- fx/bonus.png   48×48×10 一次停末帧：宝箱蹦金币（宝箱是 PixelLab 挑定的 icons/bonus.png）
- fx/lantern-glow.png 64×64×4 循环：夜间背景马灯的火光
python fx.py [输出目录]   默认 out/final
"""
from __future__ import annotations

import math
import pathlib
import random
import sys

from PIL import Image, ImageDraw

from dice import P

ART = pathlib.Path(__file__).resolve().parent
OUT = ART / "out"

GULU_COLORS = {"y": "#ffd94b", "#": "#3a2a1b", "d": "#e7b421", "p": "#ff8fb0", "w": "#ffffff", "l": "#fff3a8"}
GULU_BASE = [
    "........................",
    "........................",
    "........................",
    ".......ppp....ppp.......",
    ".......ppp....ppp.......",
    "........#......#........",
    "..##....#......#....##..",
    ".#yy#..##########..#yy#.",
    ".#yy#.#llyyyyyyyy#.#yy#.",
    "..#yy#llyyyyyyyyyy#yy#..",
    "...#ylyyyyyyyyyyyyyy#...",
    "....#yyyyyyyyyyyyyy#....",
    "....#yyy#wyyyy#wyyy#....",
    "....#yyy##yyyy##yyy#....",
    "....#yppyy#yy#yyppy#....",
    "....#yyyyyy##yyyyyy#....",
    "....#yyyyyyyyyyyyyy#....",
    "....#dyyyyyyyyyyyyd#....",
    ".....#ddyyyyyyyydd#.....",
    "......#dddddddddd#......",
    ".......#dd#..#dd#.......",
    ".......####..####.......",
    "........................",
    "........................",
]
OPEN_MOUTH = [(14, 10, "####"), (15, 10, "#pp#"), (16, 11, "##")]
HAPPY = [(11, 8, "##"), (12, 7, "#yy#"), (13, 8, "yy"), (11, 14, "##"), (12, 13, "#yy#"), (13, 14, "yy"), *OPEN_MOUTH]


def patch(rows, patches):
    grid = [list(r) for r in rows]
    for row, col, text in patches:
        for i, ch in enumerate(text):
            grid[row][col + i] = ch
    return ["".join(r) for r in grid]


def hexc(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


def gulu_image(rows, scale=2) -> Image.Image:
    img = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in GULU_COLORS:
                px[x, y] = hexc(GULU_COLORS[ch])
    return img.resize((24 * scale, 24 * scale), Image.NEAREST)


SEAT = [(0xe5, 0x54, 0x4b), (0x3b, 0x82, 0xd6), (0x3f, 0xa4, 0x5b), (0xe0, 0xa0, 0x30), (0x9a, 0x5b, 0xd0), (0x2f, 0xb5, 0xad)]


def star(draw, x, y, color, big=False):
    draw.point((x, y), fill=color)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        draw.point((x + dx, y + dy), fill=color)
    if big:
        for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)):
            draw.point((x + dx, y + dy), fill=color)


def yacht_strip(frames=12) -> Image.Image:
    size = 96
    strip = Image.new("RGBA", (size * frames, size), (0, 0, 0, 0))
    happy = gulu_image(patch(GULU_BASE, HAPPY))
    happy_closed = gulu_image(patch(GULU_BASE, HAPPY[:6]))
    rng = random.Random(7)
    confetti = [(rng.randrange(0, size), rng.randrange(0, size), rng.choice(SEAT + [P["brass"], P["brass_l"]]),
                 rng.choice((1, 1, 2)), rng.randrange(0, 4), rng.choice((-1, 1))) for _ in range(22)]
    hop = [0, 3, 7, 10, 12, 12, 10, 7, 3, 0, 0, 0]
    sparkles = [(10, 20), (84, 16), (14, 58), (82, 54), (48, 6)]
    for f in range(frames):
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        # 影子随高度变小
        w = 30 - hop[f]
        d.ellipse((48 - w // 2, 84, 48 + w // 2, 89), fill=(0, 0, 0, 80))
        g = happy if f in (2, 3, 4, 5, 6, 7) else happy_closed
        im.alpha_composite(g, (24, 40 - hop[f]))
        # 彩纸：每帧下落 8×speed px，12 帧刚好一整屏 → 无缝循环；左右小幅摆动周期 4 帧
        for x0, y0, col, speed, phase, sgn in confetti:
            y = (y0 + f * 8 * speed) % size
            x = x0 + sgn * [0, 1, 1, 0][(f + phase) % 4]
            if [True, False, True, False][(f + phase) % 4]:
                d.rectangle((x, y, x + 1, y + 3), fill=col + (255,))
            else:
                d.rectangle((x, y, x + 3, y + 1), fill=col + (255,))
        # 闪光星星：周期 4 帧
        for i, (sx, sy) in enumerate(sparkles):
            phase = (f + i) % 4
            if phase == 0:
                star(d, sx, sy, (255, 255, 255, 255), big=True)
            elif phase == 1:
                star(d, sx, sy, P["brass_l"] + (255,))
        strip.alpha_composite(im, (size * f, 0))
    return strip


def burst_strip(frames=8) -> Image.Image:
    size = 64
    strip = Image.new("RGBA", (size * frames, size), (0, 0, 0, 0))
    cols = [P["brass_l"], P["brass"], (0xe5, 0x54, 0x4b), P["teal_l"], (255, 255, 255)]
    rays = 14
    radius = [0, 6, 12, 17, 21, 24, 26, None]
    for f in range(frames):
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        c = 32
        if f == 0:
            star(d, c, c, (255, 255, 255, 255), big=True)
            d.point((c, c), fill=P["brass_l"] + (255,))
        elif radius[f] is not None:
            r = radius[f]
            for i in range(rays):
                a = i / rays * 2 * math.pi + (0.11 if i % 2 else 0)
                col = cols[i % len(cols)] + (255,)
                x, y = c + r * math.cos(a), c + r * math.sin(a) + (f * f) * 0.15  # 稍微往下坠
                if f <= 3:  # 前几帧拖尾
                    x2, y2 = c + (r - 5) * math.cos(a), c + (r - 5) * math.sin(a)
                    d.line((x2, y2, x, y), fill=col)
                if f >= 5 and i % 2:
                    continue
                d.rectangle((round(x), round(y), round(x) + (2 if f < 4 else 1), round(y) + (2 if f < 4 else 1)), fill=col)
        strip.alpha_composite(im, (size * f, 0))
    return strip


def scratch_strip(frames=6) -> Image.Image:
    w, h = 96, 24
    strip = Image.new("RGBA", (w * frames, h), (0, 0, 0, 0))
    ends = [16, 34, 52, 70, 86, 92]
    pts = [(x, 12 + round(1.6 * math.sin(x / 11)) - (x - 4) * 3 // 88) for x in range(4, 93)]
    for f in range(frames):
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        px = im.load()
        for x, y in pts:
            if x > ends[f]:
                break
            px[x, y] = (*P["pencil"], 255)
            px[x, y + 1] = (*P["pencil"], 255)
            px[x, y + 2] = (*P["red_d"], 255)
            if (x * 7) % 5:  # 铅笔的颗粒感：上沿断断续续一点亮色
                px[x, y - 1] = (0xe8, 0x77, 0x68, 255)
        strip.alpha_composite(im, (w * f, 0))
    return strip


def bonus_strip(chest_path: pathlib.Path, frames=10) -> Image.Image:
    size = 48
    chest = Image.open(chest_path).convert("RGBA")
    if chest.size != (32, 32):
        chest = chest.resize((32, 32), Image.NEAREST)
    strip = Image.new("RGBA", (size * frames, size), (0, 0, 0, 0))
    jig = [0, -1, 0, -1, 0, 0, 0, 0, 0, 0]
    coins = [(-13, -25), (0, -30), (13, -25), (-7, -20), (7, -20)]  # 抛物线顶点偏移
    for f in range(frames):
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        im.alpha_composite(chest, (8, 15 + jig[f]))
        t = (f - 1) / 6  # 金币在第 1–7 帧飞
        if 0 <= t <= 1 and f < frames - 1:
            for i, (dx, dy) in enumerate(coins):
                tt = min(1.0, max(0.0, t - i * 0.06))
                x = 24 + dx * tt
                y = 20 + dy * (4 * tt * (1 - tt)) + 6 * tt
                x, y = round(x), round(y)
                d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=P["brass"] + (255,), outline=P["brass_d"] + (255,))
                d.point((x - 1, y - 1), fill=P["brass_l"] + (255,))
        if 2 <= f <= 8:
            for i, (sx, sy) in enumerate(((8, 10), (40, 8), (24, 3), (4, 26), (44, 24))):
                if (f + i) % 3 == 0:
                    star(d, sx, sy, (255, 255, 255, 255), big=(f + i) % 2 == 0)
        strip.alpha_composite(im, (size * f, 0))
    return strip


def glow_strip(frames=4) -> Image.Image:
    """夜间背景马灯的火光闪烁：64×64×4 循环，叠在 bg/deck-night.png 的 (99,95)（马灯玻璃中心 (131,127)）。"""
    size = 64
    strip = Image.new("RGBA", (size * frames, size), (0, 0, 0, 0))
    levels = [1.0, 0.72, 0.9, 0.62]
    for f in range(frames):
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        px = im.load()
        for y in range(size):
            for x in range(size):
                r = math.hypot(x - 31.5, y - 31.5) / 32
                if r < 1:
                    a = (1 - r) ** 1.6 * 150 * levels[f]
                    q = int(a) // 12 * 12  # 分档，像素画的光圈
                    if q > 0:
                        px[x, y] = (255, 205, 120, q)
        strip.alpha_composite(im, (size * f, 0))
    return strip


def build(final: pathlib.Path) -> None:
    (final / "fx").mkdir(parents=True, exist_ok=True)
    yacht_strip().save(final / "fx" / "yacht.png")
    burst_strip().save(final / "fx" / "burst.png")
    scratch_strip().save(final / "fx" / "scratch.png")
    glow_strip().save(final / "fx" / "lantern-glow.png")
    chest = ART / "out" / "r1" / "ic-bonus" / "ic-bonus-46.png"  # 宝箱 32px 原图（icons/bonus.png 是它裁成 24 的版本）
    if chest.exists():
        bonus_strip(chest).save(final / "fx" / "bonus.png")
    else:
        print("还没有 icons/bonus.png，先跳过 fx/bonus.png")


if __name__ == "__main__":
    build(pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else OUT / "final")
