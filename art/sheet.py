"""v2 候选总览：64 个按编号排 8×8，每格 3 倍，左半夜底右半日底。python sheet.py <目录名> [倍数]"""
import pathlib, sys, re
from PIL import Image, ImageDraw
ART = pathlib.Path(__file__).resolve().parent
name = sys.argv[1]; k = int(sys.argv[2]) if len(sys.argv) > 2 else 3
folder = ART / "out" / "r1" / name
files = sorted(folder.glob("*.png"), key=lambda p: int(re.findall(r"-(\d+)\.png$", p.name)[0]) if re.findall(r"-(\d+)\.png$", p.name) else 0)
im0 = Image.open(files[0]); w, h = im0.size
cell = w * k + 8
sheet = Image.new("RGBA", (8 * cell * 2 // 2 + 8 * cell, ((len(files) + 7) // 8) * (h * k + 14)), (0, 0, 0, 255))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGBA").resize((w * k, h * k), Image.NEAREST)
    x, y = (i % 8) * cell, (i // 8) * (h * k + 14)
    for half, bg in ((0, (11, 24, 48, 255)), (1, (246, 241, 230, 255))):
        tile = Image.new("RGBA", im.size, bg); tile.alpha_composite(im)
        sheet.alpha_composite(tile, (x + half * 8 * cell, y + 12))
    d.text((x + 2, y), str(i), fill=(255, 255, 0, 255))
sheet.save(ART / "out" / "review" / f"{name}.png")
print(len(files), "张")
