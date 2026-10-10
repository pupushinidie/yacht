"""快艇骰子：代码画的骰子、计分表图标、九宫格底板、掷骰 3D 翻滚动画。

点数排布必须标准，所以骰点一律由代码画，不让模型画。
python dice.py            → 三套骰子风格的候选都画到 out/code/<风格>/（总览 out/code/overview-dice.png）
python dice.py final <风格> → 按 spec 导出到 out/final/（dice/、icons/ 代码部分、ui/）
"""
from __future__ import annotations

import math
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw

ART = pathlib.Path(__file__).resolve().parent
OUT = ART / "out"

P = {
    "outline": (0x1e, 0x18, 0x20), "navy": (0x04, 0x11, 0x27), "sea": (0x18, 0x33, 0x4d),
    "teak_l": (0xc9, 0x93, 0x5d), "teak": (0x93, 0x6f, 0x4d), "teak_d": (0x5a, 0x3a, 0x2b), "teak_dd": (0x45, 0x2e, 0x28),
    "brass_l": (0xff, 0xe3, 0x9a), "brass": (0xe0, 0xb0, 0x50), "brass_d": (0x9c, 0x6a, 0x24),
    "teal": (0x2f, 0xb5, 0xad), "teal_l": (0x59, 0xd2, 0xdb), "teal_d": (0x1d, 0x6f, 0x78),
    "paper": (0xf3, 0xe8, 0xcf), "paper_d": (0xce, 0xb8, 0x8f), "line": (0x8a, 0xa0, 0xb8),
    "felt": (0x15, 0x2a, 0x45), "felt_l": (0x1f, 0x3a, 0x5c), "felt_d": (0x0d, 0x1b, 0x30),
    "red": (0xc8, 0x34, 0x3a), "red_d": (0x8a, 0x1f, 0x2a), "pencil": (0xc8, 0x44, 0x3a),
}

# 三套骰子风格：正面 / 高光 / 侧面 / 侧面暗 / 点 / 一点 / 一点是否放大
STYLES = {
    "ivory": dict(face=(0xf6, 0xef, 0xdc), hi=(0xff, 0xfb, 0xf0), side=(0xd9, 0xcc, 0xae), side_d=(0xb8, 0xa8, 0x88),
                  pip=(0x1b, 0x22, 0x38), one=P["red"], big_one=True),
    "porcelain": dict(face=(0xfa, 0xfa, 0xf6), hi=(0xff, 0xff, 0xff), side=(0xc9, 0xd3, 0xdc), side_d=(0x9a, 0xa8, 0xb8),
                      pip=(0x14, 0x16, 0x1c), one=(0x14, 0x16, 0x1c), big_one=False),
    "seaglass": dict(face=(0x2f, 0x9e, 0xa0), hi=(0x7a, 0xdc, 0xd8), side=(0x1d, 0x6f, 0x78), side_d=(0x14, 0x4c, 0x58),
                     pip=(0xfa, 0xf6, 0xea), one=P["brass_l"], big_one=True),
}

LAYOUT = {1: [(1, 1)], 2: [(0, 0), (2, 2)], 3: [(0, 0), (1, 1), (2, 2)], 4: [(0, 0), (2, 0), (0, 2), (2, 2)],
          5: [(0, 0), (2, 0), (1, 1), (0, 2), (2, 2)], 6: [(0, 0), (0, 1), (0, 2), (2, 0), (2, 1), (2, 2)]}


def rrect(draw: ImageDraw.ImageDraw, box, r, fill):
    draw.rounded_rectangle(box, radius=r, fill=fill)


def pip_block(img: Image.Image, x: int, y: int, size: int, color, hl=None):
    """size×size 的点；≥4 时切掉四个角像素显得圆。"""
    px = img.load()
    for dy in range(size):
        for dx in range(size):
            if size >= 4 and dx in (0, size - 1) and dy in (0, size - 1):
                continue
            px[x + dx, y + dy] = (*color, 255)
    if hl and size >= 4:  # 点的右下 1px 高光（凹进去的感觉）
        px[x + size - 2, y + size - 2] = (*hl, 255)


def draw_die(n: int, style: str, size: int = 32, lip: int = 4) -> Image.Image:
    """标准骰子：1px 描边、正面、底部 lip 像素的侧面。返回 size×size。"""
    s = STYLES[style]
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = max(2, size // 7)
    rrect(d, (0, 0, size - 1, size - 1), r, (*P["outline"], 255))
    rrect(d, (1, 1, size - 2, size - 2), r - 1, (*s["side"], 255))
    d.line((r, size - 2, size - r - 1, size - 2), fill=(*s["side_d"], 255))
    face_bottom = size - 2 - lip
    rrect(d, (1, 1, size - 2, face_bottom), r - 1, (*s["face"], 255))
    d.line((r, 1, size - r - 1, 1), fill=(*s["hi"], 255))  # 左上来光
    d.line((1, r, 1, face_bottom - r + 1), fill=(*s["hi"], 255))
    # 正面区域 x 1..size-2，y 1..face_bottom；3×3 网格
    fx0, fx1, fy0, fy1 = 1, size - 2, 1, face_bottom
    w, h = fx1 - fx0 + 1, fy1 - fy0 + 1
    p = max(2, round(size / 8))  # 32 → 4
    xs = [fx0 + round(w * t - p / 2) for t in (0.24, 0.5, 0.76)]
    ys = [fy0 + round(h * t - p / 2) for t in (0.24, 0.5, 0.76)]
    for cx, cy in LAYOUT[n]:
        if n == 1 and s["big_one"]:
            q = p + 2
            pip_block(img, fx0 + round(w * 0.5 - q / 2), fy0 + round(h * 0.5 - q / 2), q, s["one"])
        else:
            pip_block(img, xs[cx], ys[cy], p, s["one"] if n == 1 else s["pip"])
    return img


def die_states(n: int, style: str) -> tuple[Image.Image, Image.Image]:
    """36×36：普通（骰子在 (2,3)，下面一道影子）/ 留下（上移到 (2,1)，外面黄铜框）。"""
    die = draw_die(n, style)
    normal = Image.new("RGBA", (36, 36), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (36, 36), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((3, 30, 32, 35), radius=2, fill=(0, 0, 0, 70))
    normal.alpha_composite(shadow)
    normal.alpha_composite(die, (2, 3))
    held = Image.new("RGBA", (36, 36), (0, 0, 0, 0))
    hd = ImageDraw.Draw(held)
    hd.rounded_rectangle((0, 0, 35, 35), radius=6, fill=(*P["outline"], 255))
    hd.rounded_rectangle((1, 1, 34, 34), radius=5, fill=(*P["brass"], 255))
    hd.line((5, 1, 30, 1), fill=(*P["brass_l"], 255))
    hd.line((1, 5, 1, 30), fill=(*P["brass_l"], 255))
    hd.line((5, 34, 30, 34), fill=(*P["brass_d"], 255))
    hd.line((34, 5, 34, 30), fill=(*P["brass_d"], 255))
    held.alpha_composite(die, (2, 1))
    return normal, held


def blank_slot() -> Image.Image:
    img = Image.new("RGBA", (36, 36), (0, 0, 0, 0))
    px = img.load()
    for i in range(3, 33):
        for x, y in ((i, 3), (i, 32), (3, i), (32, i)):
            if (i // 3) % 2 == 0:
                px[x, y] = (*P["paper_d"], 170)
    return img


# ---------- 计分表图标 24×24 ----------

def mini(n: int, style: str, size: int) -> Image.Image:
    return draw_die(n, style, size=size, lip=max(2, size // 8))


def icon_upper(n: int, style: str) -> Image.Image:
    img = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    img.alpha_composite(draw_die(n, style, size=22, lip=3), (1, 1))
    return img


def small_die(n: int, style: str, size: int = 12) -> Image.Image:
    """12px 小骰子，点 2×2（三条、四条用）。"""
    s = STYLES[style]
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=2, fill=(*P["outline"], 255))
    d.rectangle((1, 1, size - 2, size - 2), fill=(*s["side"], 255))
    d.rectangle((1, 1, size - 2, size - 4), fill=(*s["face"], 255))
    pos = {0: 2, 1: 5, 2: 8}  # 12px：正面 x 1..10、y 1..8
    ypos = {0: 2, 1: 4, 2: 6}
    for cx, cy in LAYOUT[n]:
        pip_block(img, pos[cx], ypos[cy], 2, s["one"] if n == 1 else s["pip"])
    return img


def icon_kind(k: int, style: str) -> Image.Image:
    img = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    if k == 3:
        for x, y in ((6, 0), (0, 11), (12, 11)):
            img.alpha_composite(small_die(3, style), (x, y))
    else:
        for x, y in ((0, 0), (12, 0), (0, 12), (12, 12)):
            img.alpha_composite(small_die(4, style), (x, y))
    return img


def icon_house(style: str) -> Image.Image:
    """葫芦的代码版：上 2 颗两点、下 3 颗... 24px 放不下，用左 3 摞 + 右 2 摞的小方块（骰子色/黄铜色）。"""
    img = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    # 左边一摞 3 颗（三点），右边一摞 2 颗（两点），后画的在上
    for i, y in enumerate((12, 6, 0)):
        img.alpha_composite(small_die(3, style), (0, y))
    for y in (12, 6):
        img.alpha_composite(small_die(2, style), (12, y))
    return img


def icon_stairs(steps: int) -> Image.Image:
    img = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bw = 5 if steps == 4 else 4
    gap = 1
    total = steps * bw + (steps - 1) * gap
    x0 = (24 - total) // 2
    for i in range(steps):
        h = round(6 + (21 - 6) * i / (steps - 1))
        x = x0 + i * (bw + gap)
        d.rectangle((x, 23 - h, x + bw - 1, 23), fill=(*P["outline"], 255))
        d.rectangle((x + 1, 24 - h, x + bw - 2, 22), fill=(*P["teal"], 255))
        d.line((x + 1, 24 - h, x + bw - 2, 24 - h), fill=(*P["teal_l"], 255))
        d.line((x + 1, 24 - h, x + 1, 22), fill=(*P["teal_l"], 255))
    return img


# ---------- 九宫格底板 ----------

def nine_tray() -> Image.Image:
    img = Image.new("RGBA", (24, 24), (*P["outline"], 255))
    d = ImageDraw.Draw(img)
    d.rectangle((1, 1, 22, 22), fill=(*P["brass"], 255))
    d.line((1, 1, 22, 1), fill=(*P["brass_l"], 255)); d.line((1, 1, 1, 22), fill=(*P["brass_l"], 255))
    d.line((1, 22, 22, 22), fill=(*P["brass_d"], 255)); d.line((22, 1, 22, 22), fill=(*P["brass_d"], 255))
    d.rectangle((3, 3, 20, 20), fill=(*P["outline"], 255))
    d.rectangle((4, 4, 19, 19), fill=(*P["felt"], 255))
    d.line((4, 4, 19, 4), fill=(*P["felt_d"], 255)); d.line((4, 4, 4, 19), fill=(*P["felt_d"], 255))
    px = img.load()
    for i in range(5, 19):  # 绒布内沿一圈浅色（中间 8×8 是纯色，九宫格拉伸时不出色块）
        if i % 2:
            px[i, 5] = (*P["felt_l"], 255)
            px[5, i] = (*P["felt_l"], 255)
    for cx, cy in ((2, 2), (21, 2), (2, 21), (21, 21)):  # 四角铆钉
        px[cx, cy] = (*P["brass_l"], 255)
    return img


def nine_sheet() -> Image.Image:
    img = Image.new("RGBA", (24, 24), (*P["outline"], 255))
    d = ImageDraw.Draw(img)
    d.rectangle((1, 1, 22, 22), fill=(*P["teak"], 255))
    d.line((1, 1, 22, 1), fill=(*P["teak_l"], 255)); d.line((1, 1, 1, 22), fill=(*P["teak_l"], 255))
    d.line((1, 22, 22, 22), fill=(*P["teak_dd"], 255)); d.line((22, 1, 22, 22), fill=(*P["teak_dd"], 255))
    d.rectangle((3, 3, 20, 20), fill=(*P["teak_d"], 255))
    d.rectangle((4, 4, 19, 19), fill=(*P["paper"], 255))
    d.line((4, 19, 19, 19), fill=(*P["paper_d"], 255)); d.line((19, 4, 19, 19), fill=(*P["paper_d"], 255))
    px = img.load()
    for cx, cy in ((2, 2), (21, 2), (2, 21), (21, 21)):
        px[cx, cy] = (*P["brass"], 255)
    return img


# ---------- 掷骰 3D 翻滚（正交投影，正面贴图就是骰子正面） ----------

def face_texture(n: int, style: str, res: int = 28) -> Image.Image:
    """没有侧面厚度的正方形骰面（3D 渲染用）。"""
    s = STYLES[style]
    img = Image.new("RGBA", (res, res), (*s["face"], 255))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, res - 1, res - 1), outline=(*s["side_d"], 255))
    p = 4
    xs = [round(res * t - p / 2) for t in (0.24, 0.5, 0.76)]
    for cx, cy in LAYOUT[n]:
        if n == 1 and s["big_one"]:
            pip_block(img, res // 2 - 3, res // 2 - 3, 6, s["one"])
        else:
            pip_block(img, xs[cx], xs[cy], p, s["one"] if n == 1 else s["pip"])
    return img


def rot(axis, ang):
    axis = np.asarray(axis, float); axis /= np.linalg.norm(axis)
    x, y, z = axis; c, s = math.cos(ang), math.sin(ang); C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s],
                     [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
                     [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


# 骰子六个面：法向、两个切向（u 右、v 下）、点数（对面和为 7）
FACES = [((0, 0, 1), (1, 0, 0), (0, 1, 0), 1), ((0, 0, -1), (-1, 0, 0), (0, 1, 0), 6),
         ((1, 0, 0), (0, 0, -1), (0, 1, 0), 2), ((-1, 0, 0), (0, 0, 1), (0, 1, 0), 5),
         ((0, -1, 0), (1, 0, 0), (0, 0, 1), 3), ((0, 1, 0), (1, 0, 0), (0, 0, -1), 4)]


def render_cube(R: np.ndarray, style: str, canvas: int = 48, half: float = 14.0) -> Image.Image:
    s = STYLES[style]
    tex = {n: np.asarray(face_texture(n, style)).astype(float) for n in range(1, 7)}
    out = np.zeros((canvas, canvas, 4), float)
    light = np.array([-0.5, -0.6, 0.75]); light /= np.linalg.norm(light)
    ys, xs = np.mgrid[0:canvas, 0:canvas]
    px = xs + 0.5 - canvas / 2; py = ys + 0.5 - canvas / 2
    zbuf = np.full((canvas, canvas), -1e9)
    for normal, u, v, n in FACES:
        nn = R @ np.array(normal, float)
        if nn[2] <= 0.02:
            continue
        uu = R @ np.array(u, float) * half; vv = R @ np.array(v, float) * half; c = nn * half
        M = np.array([[uu[0], vv[0]], [uu[1], vv[1]]])
        if abs(np.linalg.det(M)) < 1e-6:
            continue
        inv = np.linalg.inv(M)
        a = inv[0, 0] * (px - c[0]) + inv[0, 1] * (py - c[1])
        b = inv[1, 0] * (px - c[0]) + inv[1, 1] * (py - c[1])
        mask = (np.abs(a) <= 1) & (np.abs(b) <= 1)
        z = c[2] + a * uu[2] + b * vv[2]
        mask &= z > zbuf
        T = tex[n]; res = T.shape[0]
        ti = np.clip(((b + 1) / 2 * res).astype(int), 0, res - 1)
        tj = np.clip(((a + 1) / 2 * res).astype(int), 0, res - 1)
        col = T[ti, tj, :3]
        shade = 0.72 + 0.28 * max(0.0, float(nn @ light))
        out[mask, :3] = col[mask] * shade
        out[mask, 3] = 255
        zbuf[mask] = z[mask]
    img = Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGBA")
    # 量化到骰子自己的几种颜色 + 暗一档，保持像素画的干净
    pal = [s["face"], s["hi"], s["side"], s["side_d"], s["pip"], s["one"]]
    pal += [tuple(int(c * 0.82) for c in col) for col in pal]
    arr = np.asarray(img).copy()
    rgb = arr[..., :3].astype(int)
    palarr = np.array(pal)
    idx = ((rgb[:, :, None, :] - palarr[None, None]) ** 2).sum(-1).argmin(-1)
    arr[..., :3] = palarr[idx]
    alpha = arr[..., 3] > 0
    # 1px 描边
    edge = np.zeros_like(alpha)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        edge |= np.roll(alpha, (dy, dx), (0, 1))
    edge &= ~alpha
    arr[edge] = (*P["outline"], 255)
    return Image.fromarray(arr, "RGBA")


def roll_strip(style: str, frames: int = 12) -> Image.Image:
    strip = Image.new("RGBA", (48 * frames, 48), (0, 0, 0, 0))
    base = rot((1, 0, 0), -0.5) @ rot((0, 1, 0), 0.6)
    for i in range(frames):
        t = i / frames * 2 * math.pi
        R = rot((1, 0.35, 0), t) @ base  # 绕一条斜轴转一整圈 → 循环
        strip.alpha_composite(render_cube(R, style), (48 * i, 0))
    return strip


def candidates() -> None:
    root = OUT / "code"
    sheets = []
    for style in STYLES:
        folder = root / style
        (folder / "dice").mkdir(parents=True, exist_ok=True)
        (folder / "icons").mkdir(parents=True, exist_ok=True)
        for n in range(1, 7):
            a, b = die_states(n, style)
            a.save(folder / "dice" / f"d{n}.png"); b.save(folder / "dice" / f"d{n}-held.png")
            icon_upper(n, style).save(folder / "icons" / f"{['ones','twos','threes','fours','fives','sixes'][n-1]}.png")
        icon_kind(3, style).save(folder / "icons" / "three-kind.png")
        icon_kind(4, style).save(folder / "icons" / "four-kind.png")
        icon_house(style).save(folder / "icons" / "full-house-code.png")
        roll_strip(style).save(folder / "dice" / "roll.png")
        sheets.append(folder)
    icon_stairs(4).save(root / "small-straight.png"); icon_stairs(5).save(root / "large-straight.png")
    nine_tray().save(root / "tray.png"); nine_sheet().save(root / "sheet.png"); blank_slot().save(root / "blank.png")
    overview(sheets, root / "overview-dice.png")


def overview(folders, path) -> None:
    """每套风格一行：普通 1–6、留下 1–6（3×），夜/日两种底；下面是图标 1×/2× 和翻滚帧。"""
    rows = []
    for folder in folders:
        row = Image.new("RGBA", (1700, 330), (0, 0, 0, 0))
        for half, bg in ((0, (0x0b, 0x18, 0x30)), (1, (0xf6, 0xf1, 0xe6))):
            panel = Image.new("RGBA", (850, 330), (*bg, 255))
            for n in range(1, 7):
                for k, suffix in enumerate(("", "-held")):
                    im = Image.open(folder / "dice" / f"d{n}{suffix}.png").resize((108, 108), Image.NEAREST)
                    panel.alpha_composite(im, (10 + (n - 1) * 138, 4 + k * 112))
            icons = ["ones", "twos", "threes", "fours", "fives", "sixes", "three-kind", "four-kind", "full-house-code"]
            for i, name in enumerate(icons):
                im = Image.open(folder / "icons" / f"{name}.png")
                panel.alpha_composite(im, (10 + i * 30, 232))
                panel.alpha_composite(im.resize((48, 48), Image.NEAREST), (300 + i * 56, 232))
            roll = Image.open(folder / "dice" / "roll.png")
            for i in range(12):
                panel.alpha_composite(roll.crop((48 * i, 0, 48 * i + 48, 48)), (10 + i * 52, 284) if i < 16 else (0, 0))
            row.alpha_composite(panel, (half * 850, 0))
        rows.append(row)
    sheet = Image.new("RGBA", (1700, 330 * len(rows)), (0, 0, 0, 255))
    for i, r in enumerate(rows):
        sheet.alpha_composite(r, (0, 330 * i))
    sheet.save(path)


def export_final(style: str) -> None:
    final = OUT / "final"
    (final / "dice").mkdir(parents=True, exist_ok=True); (final / "icons").mkdir(parents=True, exist_ok=True)
    (final / "ui").mkdir(parents=True, exist_ok=True)
    for n in range(1, 7):
        a, b = die_states(n, style)
        a.save(final / "dice" / f"d{n}.png"); b.save(final / "dice" / f"d{n}-held.png")
        icon_upper(n, style).save(final / "icons" / f"{['ones','twos','threes','fours','fives','sixes'][n-1]}.png")
    blank_slot().save(final / "dice" / "blank.png")
    roll_strip(style).save(final / "dice" / "roll.png")
    icon_kind(3, style).save(final / "icons" / "three-kind.png")
    icon_kind(4, style).save(final / "icons" / "four-kind.png")
    icon_stairs(4).save(final / "icons" / "small-straight.png")
    icon_stairs(5).save(final / "icons" / "large-straight.png")
    nine_tray().save(final / "ui" / "tray.png"); nine_sheet().save(final / "ui" / "sheet.png")


if __name__ == "__main__":
    if sys.argv[1:2] == ["final"]:
        export_final(sys.argv[2])
    else:
        candidates()
