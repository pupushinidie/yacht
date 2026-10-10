import type { Cat, Sheet, Totals } from "./types.js";

export const UPPER: readonly Cat[] = ["U1", "U2", "U3", "U4", "U5", "U6"];
export const LOWER: readonly Cat[] = ["L3K", "L4K", "LFH", "LSS", "LLS", "LY", "LCH"];
/** 计分表从上到下的顺序。 */
export const CATS: readonly Cat[] = [...UPPER, ...LOWER];

/** 界面上的格名。 */
export const CAT_NAMES: Readonly<Record<Cat, string>> = {
  U1: "一点", U2: "二点", U3: "三点", U4: "四点", U5: "五点", U6: "六点",
  L3K: "三条", L4K: "四条", LFH: "葫芦", LSS: "小顺", LLS: "大顺", LY: "快艇", LCH: "机会",
};

export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS = 35;
export const YACHT_BONUS = 100;
/** 固定分格（§2.1）。 */
export const FIXED_POINTS: Readonly<Partial<Record<Cat, number>>> = { LFH: 25, LSS: 30, LLS: 40, LY: 50 };

export function isCat(value: unknown): value is Cat {
  return typeof value === "string" && (CATS as readonly string[]).includes(value);
}

/** 上半区格子对应的点数（U4 → 4）。 */
export function upperFace(cat: Cat): number {
  return UPPER.indexOf(cat) + 1;
}

function counts(dice: readonly number[]): number[] {
  const result = [0, 0, 0, 0, 0, 0, 0];
  for (const die of dice) result[die] = (result[die] ?? 0) + 1;
  return result;
}

const sum = (dice: readonly number[]) => dice.reduce((total, die) => total + die, 0);

/** 5 颗点数全相同。 */
export function isYacht(dice: readonly number[]): boolean {
  return dice.length === 5 && dice[0]! >= 1 && dice.every((die) => die === dice[0]);
}

function hasRun(dice: readonly number[], length: number): boolean {
  const present = new Set(dice);
  for (let start = 1; start + length - 1 <= 6; start += 1) {
    let ok = true;
    for (let face = start; face < start + length; face += 1) if (!present.has(face)) ok = false;
    if (ok) return true;
  }
  return false;
}

/** 不考虑百搭时，这把骰子填进这一格得几分（§2.1）。5 颗相同不算葫芦（开工拍板，§11-1）。 */
export function rawScore(dice: readonly number[], cat: Cat): number {
  const c = counts(dice);
  const most = Math.max(...c.slice(1));
  switch (cat) {
    case "U1": case "U2": case "U3": case "U4": case "U5": case "U6": {
      const face = upperFace(cat);
      return face * c[face]!;
    }
    case "L3K": return most >= 3 ? sum(dice) : 0;
    case "L4K": return most >= 4 ? sum(dice) : 0;
    case "LFH": return c.includes(3) && c.includes(2) ? 25 : 0;
    case "LSS": return hasRun(dice, 4) ? 30 : 0;
    case "LLS": return hasRun(dice, 5) ? 40 : 0;
    case "LY": return most === 5 ? 50 : 0;
    case "LCH": return sum(dice);
  }
}

/** 这把骰子是不是「百搭」：5 颗相同，而且快艇格已经填过（50 或 0 都算，§4.4）。 */
export function isWild(dice: readonly number[], sheet: Sheet): boolean {
  return isYacht(dice) && sheet.scores.LY !== undefined;
}

/** 这次填分有没有快艇奖励 +100：百搭，而且快艇格是 50（§4.4）。 */
export function earnsYachtBonus(dice: readonly number[], sheet: Sheet): boolean {
  return isWild(dice, sheet) && sheet.scores.LY === 50;
}

/** 这把骰子在这张表上能填哪几格（空格，并且照百搭的强制顺序，§4.4）。 */
export function legalCategories(dice: readonly number[], sheet: Sheet): Cat[] {
  const empty = CATS.filter((cat) => sheet.scores[cat] === undefined);
  if (!isWild(dice, sheet)) return empty;
  // 1. 对应的上半区格空着 → 必须填它
  const upper = UPPER[dice[0]! - 1]!;
  if (sheet.scores[upper] === undefined) return [upper];
  // 2. 三条、四条有空的 → 必须填其中一格
  const kinds = (["L3K", "L4K"] as const).filter((cat) => sheet.scores[cat] === undefined);
  if (kinds.length > 0) return kinds;
  // 3. 下半区还有空格（机会、葫芦、小顺、大顺）→ 填其中一格
  const lower = LOWER.filter((cat) => sheet.scores[cat] === undefined);
  if (lower.length > 0) return lower;
  // 4. 都满了 → 剩下的上半区空格填 0（§11-2）
  return UPPER.filter((cat) => sheet.scores[cat] === undefined);
}

/** 这把骰子填进这一格得几分（含百搭借用固定分格；不含 +100 奖励）。 */
export function scoreFor(dice: readonly number[], cat: Cat, sheet: Sheet): number {
  if (isWild(dice, sheet)) {
    // 百搭借用葫芦、小顺、大顺按固定分（§4.4 步骤 3）
    if (cat === "LFH" || cat === "LSS" || cat === "LLS") return FIXED_POINTS[cat]!;
  }
  return rawScore(dice, cat);
}

/** 计分表的分数明细（§6）。 */
export function sheetTotals(sheet: Sheet): Totals {
  const upper = UPPER.reduce((total, cat) => total + (sheet.scores[cat] ?? 0), 0);
  const lower = LOWER.reduce((total, cat) => total + (sheet.scores[cat] ?? 0), 0);
  const upperBonus = upper >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
  const yachtBonus = sheet.yachtBonuses * YACHT_BONUS;
  return { upper, upperBonus, lower, yachtBonus, total: upper + upperBonus + lower + yachtBonus };
}

export function filledCount(sheet: Sheet): number {
  return CATS.filter((cat) => sheet.scores[cat] !== undefined).length;
}

export function emptySheet(): Sheet {
  return { scores: {}, yachtBonuses: 0 };
}
