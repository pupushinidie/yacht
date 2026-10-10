"""快艇骰子 正式美术第 1 轮：PixelLab 静态候选（场景、骰盅、计分表图标、头像、宝箱、封面）。

结果在 out/r1/：大图直接放 out/r1/<名字>-s<种子>.png，v2 小图一组一个目录 out/r1/<名字>/。
一个进程、一个线程池（会员下同一进程并发不报 429），全站排队照常经过 pxqueue。
用法：python r1.py [名字 ...]（不写就全跑；已经出过的跳过）
"""
from __future__ import annotations

import pathlib
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import pixellab  # noqa: E402

OUT = pixellab.ART / "out" / "r1"
NOTEXT = " No text, no letters, no numbers, no signs, no writing."

NIGHT = ("Pixel art game background, high top-down three-quarter view of a wooden teak yacht deck at night, "
         "a very large empty round wooden table fills the center of the picture with a completely clear empty tabletop, "
         "a brass oil lantern with warm glow stands at the left edge of the table, coiled ropes and a wooden railing around the edges, "
         "deep navy sea with silver moonlight reflections and a few stars along the top edge, "
         "cool navy and teal palette with warm brass lantern light, calm cozy mood, no people." + NOTEXT)
DAY = ("Pixel art game background, high top-down three-quarter view of a wooden teak yacht deck on a sunny day, "
       "a very large empty round wooden table fills the center of the picture with a completely clear empty tabletop, "
       "coiled ropes and a polished wooden railing around the edges, soft shadow of a white sail, "
       "bright turquoise sea with sparkles along the top edge, fresh turquoise, sand and white palette with brass accents, "
       "breezy cheerful mood, no people." + NOTEXT)

# 名字 → (接口, 描述, 宽, 高, 透明, 种子们)
JOBS: dict[str, tuple[str, str, int, int, bool, tuple[int, ...]]] = {
    "bg-night": ("/create-image-pixen", NIGHT, 512, 288, False, (4101, 4102, 4103, 4104)),
    "bg-day": ("/create-image-pixen", DAY, 512, 288, False, (4201, 4202, 4203, 4204)),
    "cup": ("/create-image-pixflux",
            "pixel art game item, a single upright dice cup made of dark brown leather with two shiny brass rim bands and stitching, "
            "open top, front three-quarter view, soft light from the upper left, bold dark outline, isolated object." + NOTEXT,
            64, 64, True, (4301, 4302, 4303, 4304)),
    "cover": ("/create-image-pixflux",
              "a moonlit teak sailing yacht deck at night, a round wooden table with five white six-sided dice tumbling out of a brown leather dice cup, "
              "a warm brass lantern, coiled ropes, calm deep blue sea with silver moon reflections and stars, sails in the background, no people, "
              "cozy 16-bit pixel art game cover illustration, rich warm colors, soft lighting, crisp clean pixels, no text, no letters, no logo",
              384, 192, False, (4401, 4402, 4403)),
    # v2 一次出 64 个候选
    "ic-yacht": ("/generate-image-v2", "pixel art icon of a small white sailboat with a triangular white sail and a navy blue hull on a tiny wave, bold dark outline, simple, readable", 24, 24, True, (4501,)),
    "ic-chance": ("/generate-image-v2", "pixel art icon of a small glass message bottle with a rolled paper scroll inside and a cork, light teal glass, bold dark outline, simple, readable", 24, 24, True, (4502,)),
    "ic-gourd": ("/generate-image-v2", "pixel art icon of a golden yellow calabash gourd with a red string tied around its waist and a tiny green leaf, bold dark outline, simple, readable", 24, 24, True, (4503,)),
    # 24px 出的帆船、漂流瓶只有 17px 大，改用 32px 出（内容约 23px），再裁进 24×24
    "ic-yacht32": ("/generate-image-v2", "pixel art icon of a small white sailboat with a triangular white sail and a navy blue hull with a yellow stripe on a tiny wave, bold dark outline, simple, readable, fills the canvas", 32, 32, True, (4511,)),
    "ic-chance32": ("/generate-image-v2", "pixel art icon of a small glass message bottle with a rolled paper scroll inside and a cork, light teal glass, bold dark outline, simple, readable, fills the canvas", 32, 32, True, (4512,)),
    # 32px 版内容 23×30 放不进 24，再用 24px + 「fills the canvas」出一次
    "ic-yacht24f": ("/generate-image-v2", "pixel art icon of a small white sailboat with a triangular white sail and a navy blue hull with a yellow stripe on a tiny wave, bold dark outline, simple, readable, fills the canvas", 24, 24, True, (4521,)),
    "ic-chance24f": ("/generate-image-v2", "pixel art icon of a small glass message bottle with a rolled paper scroll inside and a cork, light teal glass, bold dark outline, simple, readable, fills the canvas", 24, 24, True, (4522,)),
    "ic-bonus": ("/generate-image-v2", "pixel art icon of a small wooden treasure chest with brass bands, lid slightly open with gold coins glowing inside, bold dark outline, simple, readable", 32, 32, True, (4504,)),
    "av-gull": ("/generate-image-v2", "pixel art portrait avatar, head and shoulders of a friendly white seagull sailor wearing a navy blue knit cap and a striped shirt, front view, bold dark outline, cute, simple", 32, 32, True, (4601,)),
    "av-otter": ("/generate-image-v2", "pixel art portrait avatar, head and shoulders of a friendly brown sea otter sailor wearing a yellow rain hat, front view, bold dark outline, cute, simple", 32, 32, True, (4602,)),
    "av-penguin": ("/generate-image-v2", "pixel art portrait avatar, head and shoulders of a friendly penguin sailor wearing a red neckerchief, front view, bold dark outline, cute, simple", 32, 32, True, (4603,)),
    "av-seal": ("/generate-image-v2", "pixel art portrait avatar, head and shoulders of a friendly grey harbor seal sailor wearing a white captain cap with a brass anchor badge, front view, bold dark outline, cute, simple", 32, 32, True, (4604,)),
    "av-crab": ("/generate-image-v2", "pixel art portrait avatar of a friendly orange crab wearing a tiny green bandana, front view, bold dark outline, cute, simple", 32, 32, True, (4605,)),
    # 海龟戴紫帽子太像忍者神龟，座位 5 改成章鱼
    "av-octopus": ("/generate-image-v2", "pixel art portrait avatar of a friendly coral pink octopus sailor wearing a small white sailor cap with a navy band, front view, round head, a few curly tentacles at the bottom, bold dark outline, cute, simple", 32, 32, True, (4607,)),
    "av-turtle": ("/generate-image-v2", "pixel art portrait avatar, head and shoulders of a friendly green sea turtle sailor wearing a purple knit beanie, front view, bold dark outline, cute, simple", 32, 32, True, (4606,)),
}


def run(name: str, seed: int) -> None:
    endpoint, prompt, width, height, transparent, _ = JOBS[name]
    if endpoint == "/generate-image-v2":
        folder = OUT / name
        if folder.exists() and any(folder.glob("*.png")):
            return
        pixellab.generate_async(name, {
            "description": prompt, "image_size": {"width": width, "height": height},
            "no_background": transparent, "seed": seed,
        }, folder, endpoint=endpoint)
    else:
        target = f"{name}-s{seed}"
        if (OUT / f"{target}.png").exists():
            return
        body = {"description": prompt, "image_size": {"width": width, "height": height}, "seed": seed}
        if endpoint == "/create-image-pixen":
            body["detail"] = "highly detailed"
        else:
            body["no_background"] = transparent
        pixellab.generate_image(target, body, OUT, endpoint=endpoint)
    print(name, seed, "ok", flush=True)


if __name__ == "__main__":
    names = sys.argv[1:] or list(JOBS)
    tasks = [(n, s) for n in names for s in JOBS[n][5]]
    with ThreadPoolExecutor(max_workers=6) as pool:
        for future in [pool.submit(run, n, s) for n, s in tasks]:
            try:
                future.result()
            except Exception as error:  # 一样失败不拖累别的
                print("失败", error, flush=True)
    print("全部完成", flush=True)
