"""PixelLab 挑定的计分表图标：裁掉空白、居中放进 24×24。python export_icons.py"""
import pathlib
from PIL import Image
ART = pathlib.Path(__file__).resolve().parent
R1, FINAL = ART / "out" / "r1", ART / "out" / "final" / "icons"
PICKS = {"yacht": "ic-yacht32/ic-yacht32.png", "chance": "ic-chance32/ic-chance32-8.png", "full-house": "ic-gourd/ic-gourd-8.png", "bonus": "ic-bonus/ic-bonus-46.png"}
def fit(src, size=24):
    im = Image.open(src).convert("RGBA")
    a = im.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    im.putalpha(Image.composite(im.getchannel("A"), Image.new("L", im.size, 0), a))  # 去掉半透明杂点
    im = im.crop(im.getbbox())
    if max(im.size) > size - 1:  # 32px 出的帆船、漂流瓶内容约 23×30：最近邻缩到 23 高（24px 直接出的只有 17px 大，太小）
        k = (size - 1) / max(im.size)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.NEAREST)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    return out
if __name__ == "__main__":
    FINAL.mkdir(parents=True, exist_ok=True)
    for name, rel in PICKS.items():
        fit(R1 / rel).save(FINAL / f"{name}.png"); print(name, "ok")
