"""核对 out/final 和 spec 一一对应、尺寸对。python check_final.py"""
import pathlib, sys
from PIL import Image
F = pathlib.Path(__file__).resolve().parent / "out" / "final"
EXP = {"bg/deck-night.png": (512, 288), "bg/deck-day.png": (512, 288), "bg/deck-night@3x.png": (1536, 864), "bg/deck-day@3x.png": (1536, 864),
       "dice/blank.png": (36, 36), "dice/roll.png": (576, 48), "dice/cup.png": (46, 60), "dice/cup-shake.png": (368, 60),
       "ui/tray.png": (24, 24), "ui/sheet.png": (24, 24),
       "fx/yacht.png": (1152, 96), "fx/burst.png": (512, 64), "fx/bonus.png": (480, 48), "fx/scratch.png": (576, 24), "fx/lantern-glow.png": (256, 64)}
for n in range(1, 7):
    EXP[f"dice/d{n}.png"] = EXP[f"dice/d{n}-held.png"] = (36, 36)
for k in ("ones", "twos", "threes", "fours", "fives", "sixes", "three-kind", "four-kind", "full-house", "small-straight", "large-straight", "yacht", "chance", "bonus"):
    EXP[f"icons/{k}.png"] = (24, 24)
for a in ("gull", "otter", "penguin", "seal", "crab", "octopus"):
    EXP[f"avatars/{a}.png"] = (32, 32)
bad = 0
for rel, size in EXP.items():
    p = F / rel
    if not p.exists():
        print("✗ 缺", rel); bad += 1; continue
    got = Image.open(p).size
    if got != size:
        print("✗", rel, got, "应为", size); bad += 1
extra = sorted(str(p.relative_to(F)) for p in F.rglob("*.png") if str(p.relative_to(F)) not in EXP)
covers = sorted((F.parent / "covers").glob("yacht-c*.png"))
print(f"spec {len(EXP)} 项，有问题 {bad} 项；多出来的 {extra}；封面 {len(covers)} 张")
sys.exit(1 if bad or extra or len(covers) != 3 else 0)
