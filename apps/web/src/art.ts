/**
 * 像素美术的地址（美术 agent 的定稿，规格见仓库 art/spec.md）。图片放在 public/art 下。
 * 所有像素图 image-rendering: pixelated，只按整数倍缩放（背景除外）。
 */
import type { Cat } from "@yacht/game";

const ROOT = `${import.meta.env.BASE_URL}art/`;

/** 座位色和头像（spec 第 1 节）：白天夜间同一套。 */
export const SEATS = [
  { key: "gull", name: "珊瑚红", hex: "#e5544b", animal: "海鸥" },
  { key: "otter", name: "海蓝", hex: "#3b82d6", animal: "海獭" },
  { key: "penguin", name: "海草绿", hex: "#3fa45b", animal: "企鹅" },
  { key: "seal", name: "黄铜金", hex: "#e0a030", animal: "海豹" },
  { key: "crab", name: "紫贝", hex: "#9a5bd0", animal: "螃蟹" },
  { key: "octopus", name: "青碧", hex: "#2fb5ad", animal: "章鱼" },
] as const;

export function seatOf(color: number) {
  return SEATS[color % SEATS.length]!;
}

export const avatarArt = (color: number) => `${ROOT}avatars/${seatOf(color).key}.png`;

export const bgArt = {
  night: `${ROOT}bg/deck-night@3x.png`,
  day: `${ROOT}bg/deck-day@3x.png`,
  /** 马灯火光：64×64 × 4 帧，叠在背景 (99,95)。 */
  lantern: `${ROOT}fx/lantern-glow.png`,
};

/** 骰子：36×36，d1–d6、留下的 -held 版、还没掷的 blank。 */
export const dieArt = (face: number, held = false) => (face < 1 ? `${ROOT}dice/blank.png` : `${ROOT}dice/d${face}${held ? "-held" : ""}.png`);
export const diceArt = {
  /** 48×48 × 12 帧，循环，0.05s/帧。 */
  roll: `${ROOT}dice/roll.png`,
  /** 46×60。 */
  cup: `${ROOT}dice/cup.png`,
  /** 46×60 × 8 帧，播一遍。 */
  cupShake: `${ROOT}dice/cup-shake.png`,
};

const ICONS: Record<Cat, string> = {
  U1: "ones", U2: "twos", U3: "threes", U4: "fours", U5: "fives", U6: "sixes",
  L3K: "three-kind", L4K: "four-kind", LFH: "full-house", LSS: "small-straight", LLS: "large-straight", LY: "yacht", LCH: "chance",
};
export const catIcon = (cat: Cat) => `${ROOT}icons/${ICONS[cat]}.png`;
export const bonusIcon = `${ROOT}icons/bonus.png`;

export const uiArt = {
  tray: `${ROOT}ui/tray.png`,
  sheet: `${ROOT}ui/sheet.png`,
};

/** 特效（横排精灵图）。 */
export const fxArt = {
  /** 96×96 × 12 帧循环，0.08s/帧：咕噜嘎庆祝快艇。 */
  yacht: `${ROOT}fx/yacht.png`,
  /** 64×64 × 8 帧，播一次（末帧空）。 */
  burst: `${ROOT}fx/burst.png`,
  /** 48×48 × 10 帧，停在末帧：上半区奖励宝箱。 */
  bonus: `${ROOT}fx/bonus.png`,
  /** 96×24 × 6 帧，停在末帧：划掉。 */
  scratch: `${ROOT}fx/scratch.png`,
};
