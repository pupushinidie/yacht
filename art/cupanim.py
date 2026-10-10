"""骰盅摇晃：把 r2 返回的帧整理成 8 帧横排（首帧换成静态图、去掉重复的末帧），按全部帧的并集裁掉空白。
python cupanim.py           → out/r2/cup-shake-sN.png + 总览 out/review/cup-shake.png
python cupanim.py final N    → out/final/dice/cup.png、cup-shake.png（同一个裁切框）
"""
import pathlib, sys
from PIL import Image, ImageChops, ImageDraw
ART = pathlib.Path(__file__).resolve().parent
R2 = ART / "out" / "r2"
def frames(seed):
    folder = R2 / f"cup-shake-s{seed}"
    first = Image.open(folder / "first.png").convert("RGBA")
    raw = [Image.open(p).convert("RGBA") for p in sorted((folder / "raw").glob("*.png"))]
    raw = [f if f.size == first.size else f.resize(first.size, Image.NEAREST) for f in raw][:8]
    raw[0] = first
    # 半透明杂点归零/归满，保持像素干净
    out = []
    for f in raw:
        a = f.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
        g = f.copy(); g.putalpha(a); out.append(g)
    return out
def union_box(fr):
    box = None
    for f in fr:
        b = f.getbbox()
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    # 宽高取偶数
    w, h = box[2] - box[0], box[3] - box[1]
    return (box[0], box[1], box[0] + w + (w % 2), box[1] + h + (h % 2))
def strip(fr, box):
    w, h = box[2] - box[0], box[3] - box[1]
    s = Image.new("RGBA", (w * len(fr), h))
    for i, f in enumerate(fr):
        s.alpha_composite(f.crop(box), (i * w, 0))
    return s
if __name__ == "__main__":
    if sys.argv[1:2] == ["final"]:
        fr = frames(int(sys.argv[2])); box = union_box(fr)
        fr[0].crop(box).save(ART / "out" / "final" / "dice" / "cup.png")
        strip(fr, box).save(ART / "out" / "final" / "dice" / "cup-shake.png")
        print("box", box)
    else:
        rows = []
        for seed in (1, 2, 3):
            fr = frames(seed); box = union_box(fr)
            st = strip(fr, box); st.save(R2 / f"cup-shake-s{seed}.png")
            rows.append(st.resize((st.width * 3, st.height * 3), Image.NEAREST))
        W = max(r.width for r in rows); H = sum(r.height + 6 for r in rows)
        sheet = Image.new("RGBA", (W, H), (11, 24, 48, 255)); y = 0
        for r in rows:
            sheet.alpha_composite(r, (0, y)); y += r.height + 6
        sheet.save(ART / "out" / "review" / "cup-shake.png")


def code_shake(cup_path, pad=4):
    """PixelLab 三个种子都没摇起来（s1/s2 冒出一团白点、s3 不动），改用代码：整只骰盅左右晃 + 上部按行错位做出倾斜。8 帧，首末帧都是静态图。"""
    cup = Image.open(cup_path).convert("RGBA")
    cup = cup.crop(cup.getbbox())
    W, H = cup.width + pad * 2, cup.height + pad * 2
    tilt = [0, -3, 3, -3, 3, -2, 1, 0]   # 顶部相对底部错开的像素
    lift = [0, -1, -2, -1, -2, -1, 0, 0]
    fr = []
    for t, l in zip(tilt, lift):
        im = Image.new("RGBA", (W, H))
        for y in range(cup.height):
            k = round(t * (cup.height - 1 - y) / (cup.height - 1))  # 底边不动、顶边错开 t
            im.alpha_composite(cup.crop((0, y, cup.width, y + 1)), (pad + k, pad + y + l))
        fr.append(im)
    return fr


def final_code(cup_path):
    fr = code_shake(cup_path)
    fr[0].save(ART / "out" / "final" / "dice" / "cup.png")
    s = Image.new("RGBA", (fr[0].width * len(fr), fr[0].height))
    for i, f in enumerate(fr):
        s.alpha_composite(f, (i * fr[0].width, 0))
    s.save(ART / "out" / "final" / "dice" / "cup-shake.png")
    print("cup", fr[0].size)


if __name__ == "__main__" and sys.argv[1:2] == ["code"]:
    final_code(pathlib.Path(sys.argv[2]))
