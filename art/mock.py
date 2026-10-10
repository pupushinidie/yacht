"""1440×790 牌桌示意（只给自查用，不是界面设计）：背景 + 掷骰区 + 计分表图标 + 头像，夜/日各一张。python mock.py"""
import pathlib
from PIL import Image, ImageDraw
ART = pathlib.Path(__file__).resolve().parent
F = ART / "out" / "final"
def nine(src, w, h, k=2, s=8):
    im = Image.open(src).convert("RGBA"); W, H = im.size
    out = Image.new("RGBA", (w, h))
    sw, sh = s * k, s * k
    parts = lambda box: im.crop(box)
    big = lambda p, size: p.resize(size, Image.NEAREST)
    cx = [0, s, W - s, W]; cy = [0, s, H - s, H]
    tx = [0, sw, w - sw, w]; ty = [0, sh, h - sh, h]
    for i in range(3):
        for j in range(3):
            p = parts((cx[i], cy[j], cx[i + 1], cy[j + 1]))
            out.alpha_composite(big(p, (tx[i + 1] - tx[i], ty[j + 1] - ty[j])), (tx[i], ty[j]))
    return out
def up(p, k):
    im = Image.open(p).convert("RGBA"); return im.resize((im.width * k, im.height * k), Image.NEAREST)
for theme in ("night", "day"):
    bg = Image.open(F / "bg" / f"deck-{theme}@3x.png").convert("RGBA")
    scale = max(1440 / bg.width, 790 / bg.height)
    bg = bg.resize((round(bg.width * scale), round(bg.height * scale)), Image.NEAREST)
    x0, y0 = (bg.width - 1440) // 2, (bg.height - 790) // 2
    canvas = bg.crop((x0, y0, x0 + 1440, y0 + 790))
    veil = Image.new("RGBA", canvas.size, (4, 10, 24, 90) if theme == "night" else (255, 255, 255, 50))
    canvas.alpha_composite(veil)
    canvas.alpha_composite(nine(F / "ui" / "tray.png", 680, 200), (120, 470))
    for i, (n, held) in enumerate(((5, True), (5, True), (2, False), (5, True), (3, False))):
        canvas.alpha_composite(up(F / "dice" / f"d{n}{'-held' if held else ''}.png", 3), (150 + i * 126, 516))
    canvas.alpha_composite(up(F / "dice" / "cup.png", 2) if (F / "dice" / "cup.png").exists() else Image.new("RGBA", (1, 1)), (830, 520))
    sheet = nine(F / "ui" / "sheet.png", 420, 740)
    canvas.alpha_composite(sheet, (980, 25))
    d = ImageDraw.Draw(canvas)
    names = ["ones", "twos", "threes", "fours", "fives", "sixes", "bonus", "three-kind", "four-kind", "full-house", "small-straight", "large-straight", "yacht", "chance"]
    for r, name in enumerate(names):
        y = 100 + r * 44
        canvas.alpha_composite(Image.open(F / "icons" / f"{name}.png").convert("RGBA"), (1012, y + 6))
        d.line((1004, y + 40, 1376, y + 40), fill=(138, 160, 184, 255))
    for i, a in enumerate(sorted((F / "avatars").glob("*.png"))[:4] if (F / "avatars").exists() else []):
        canvas.alpha_composite(up(a, 2), (1110 + i * 70, 34))
    canvas.alpha_composite(up(F / "fx" / "scratch.png", 1).crop((96 * 5, 0, 96 * 6, 24)), (1180, 100 + 8 * 44 + 8))
    canvas.save(ART / "out" / "review" / f"mock-{theme}.png")
print("ok")
