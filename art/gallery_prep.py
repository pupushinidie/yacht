"""画廊：把候选做成预览图（out/gallery/），再写拍板 JSON（assets/gallery-decision.json，不阻塞）。

预览图：小图左半夜底、右半白天底（计分纸底），先放大到界面倍数，旁边再放 1 倍原大；动画做成 GIF。
python gallery_prep.py
"""
from __future__ import annotations

import json
import pathlib

from PIL import Image

ART = pathlib.Path(__file__).resolve().parent
OUT = ART / "out"
GAL = OUT / "gallery"
R1 = OUT / "r1"
SEL = json.loads((ART / "selection.json").read_text())
NIGHT, DAY, PAPER = (11, 24, 48, 255), (246, 241, 230, 255), (243, 232, 207, 255)


def preview(src: pathlib.Path, scale: int, name: str, bgs=(NIGHT, PAPER)) -> str:
    im = Image.open(src).convert("RGBA")
    big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    pad = 12
    cw = big.width + im.width + pad * 3
    sheet = Image.new("RGBA", (cw * len(bgs), big.height + pad * 2), (0, 0, 0, 255))
    for i, bg in enumerate(bgs):
        tile = Image.new("RGBA", (cw, big.height + pad * 2), bg)
        tile.alpha_composite(big, (pad, pad))
        tile.alpha_composite(im, (pad * 2 + big.width, pad + big.height - im.height))
        sheet.alpha_composite(tile, (i * cw, 0))
    GAL.mkdir(parents=True, exist_ok=True)
    path = GAL / f"{name}.png"
    sheet.save(path)
    return str(path)


def gif(src: pathlib.Path, frames: int, scale: int, name: str, ms: int, bg=NIGHT, base: pathlib.Path | None = None, hold=1) -> str:
    sheet = Image.open(src).convert("RGBA")
    w = sheet.width // frames
    out = []
    for i in range(frames):
        canvas = Image.new("RGBA", (w, sheet.height), bg)
        if base is not None:
            canvas.alpha_composite(Image.open(base).convert("RGBA").crop((0, 0, w, sheet.height)))
        canvas.alpha_composite(sheet.crop((i * w, 0, (i + 1) * w, sheet.height)))
        out.append(canvas.resize((w * scale, sheet.height * scale), Image.NEAREST).convert("RGB"))
    out += [out[-1]] * (hold - 1)
    path = GAL / f"{name}.gif"
    out[0].save(path, save_all=True, append_images=out[1:], duration=ms, loop=0)
    return str(path)


def opt(value, label, images, desc, rec=False):
    o = {"value": value, "label": label, "images": images, "description": desc}
    if rec:
        o["recommended"] = True
    return o


def main() -> None:
    GAL.mkdir(parents=True, exist_ok=True)
    questions = []
    for item in SEL["items"]:
        options = []
        for c in item["candidates"]:
            src = ART / c["src"]
            if item["kind"] == "scene":
                images = [str(src)]
            elif item["kind"] == "sheet":  # 已经是总览图
                images = [str(src)]
            elif item["kind"] == "anim":
                images = [gif(src, c["frames"], c.get("scale", 3), f"{item['id']}-{c['value']}", c.get("ms", 80), bg=PAPER if item["id"] == "anim-scratch" else NIGHT, hold=c.get("hold", 1))]
            else:
                images = [preview(src, item.get("scale", 3), f"{item['id']}-{c['value']}")]
            options.append(opt(c["value"], c["label"], images, c["why"], c["value"] == item["pick"]))
        questions.append({"id": item["id"], "type": "choice", "question": item["question"], "options": options, "allowOther": True, "required": False})
    decision = {
        "id": "art-gallery", "title": "快艇骰子：正式美术画廊", "stage": "art", "blocking": False,
        "intro": ("快艇骰子正式美术（方向 A 月夜游艇甲板）的候选，每样一题。标「推荐」的是美术自查后挑定、已经导出到 art/out/final 的那张，"
                  "不选就按推荐上线；想换哪张随时来换，都不满意选「其他」写备注，美术重画。\n\n"
                  "小图预览：左半夜间底、右半计分纸底，先放大到界面倍数，右下角是 1 倍原大。动画是 GIF。"
                  "骰点、三条/四条/顺子图标、划掉、烟花、咕噜嘎庆祝都是代码画的（点数排布保证标准），所以只有一个版本。"),
        "questions": questions,
    }
    path = pathlib.Path.home() / "projects/pipeline/games/yacht/assets/gallery-decision.json"
    path.write_text(json.dumps(decision, ensure_ascii=False, indent=2))
    print("写好", path, len(questions), "题")


if __name__ == "__main__":
    main()
