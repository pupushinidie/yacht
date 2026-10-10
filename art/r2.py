"""第 2 轮：骰盅摇晃动画（animate-with-text-v3，首末帧 = 挑定的骰盅静态图），3 个种子。python r2.py <骰盅 png>"""
import pathlib, sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import pixellab
from PIL import Image
OUT = pixellab.ART / "out" / "r2"
cup = pathlib.Path(sys.argv[1])
ACTIONS = {1: "the dice cup shakes quickly left and right, rattling", 2: "the dice cup wobbles and tilts side to side", 3: "the dice cup shakes left and right"}
def run(seed):
    folder = OUT / f"cup-shake-s{seed}"
    if (folder / "raw").exists():
        return
    folder.mkdir(parents=True, exist_ok=True)
    Image.open(cup).convert("RGBA").save(folder / "first.png")
    pixellab.animate(f"cup-shake-s{seed}", {"first_frame": pixellab.b64_image(folder / "first.png"), "last_frame": pixellab.b64_image(folder / "first.png"),
        "action": ACTIONS[seed], "frame_count": 8, "no_background": True, "seed": 5100 + seed}, folder / "raw")
    print("cup-shake", seed, "ok", flush=True)
with ThreadPoolExecutor(3) as pool:
    for f in [pool.submit(run, s) for s in ACTIONS]:
        try: f.result()
        except Exception as e: print("失败", e, flush=True)
