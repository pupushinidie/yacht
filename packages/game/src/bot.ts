/**
 * 人机（「普通」难度）：像一个认真玩、会算账的普通玩家，不作弊（只看 redactGameForViewer 之后自己能看到的）。
 *
 * 做法：
 * 1. 给「这把骰子填进某一格」打分：得分 + 上半区奖励的变化（按离 63 还差多少估算拿到 35 的把握）
 *    + 快艇奖励 − 这一格留到以后平均能拿的分（机会成本）。
 * 2. 还能重掷时，精确算每种「留下哪几颗」的期望（5 颗骰子只有 252 种组合，往前看到用完 3 次），
 *    比现在就填更好才重掷。
 * 3. 每一步附一句理由（教程的「提示」用）。
 */
import { legalActions } from "./engine.js";
import {
  CAT_NAMES,
  CATS,
  UPPER,
  UPPER_BONUS,
  UPPER_BONUS_THRESHOLD,
  YACHT_BONUS,
  earnsYachtBonus,
  isWild,
  legalCategories,
  scoreFor,
  upperFace,
} from "./scoring.js";
import type { Cat, GameCommand, GameState, Sheet } from "./types.js";

export interface BotDecision {
  readonly command: GameCommand;
  /** 一句玩家听得懂的理由。 */
  readonly reason: string;
}

/** 每一格留到以后（专门去凑）平均大约能拿多少分（参考最优策略的统计，葫芦、顺子调低了一点，让人机更愿意像人一样追顺子、葫芦；模拟里单人平均分只差 3 分）。顺子、葫芦、四条、快艇是「凑得到才有」，后期机会少，见 futureValue。 */
export const BOT_BASE_VALUE: Record<Cat, number> = {
  U1: 2.1, U2: 5.3, U3: 8.6, U4: 12.2, U5: 15.7, U6: 19.2,
  L3K: 21.7, L4K: 13.1, LFH: 20, LSS: 25, LLS: 29, LY: 16.9, LCH: 22.0,
};
const CHANCY: ReadonlySet<Cat> = new Set(["L4K", "LFH", "LSS", "LLS", "LY"]);

/** 这一格留到以后的价值：剩下的回合越少，「凑得到才有」的格越不值钱。 */
function futureValue(cat: Cat, turnsLeft: number): number {
  if (turnsLeft <= 0) return 0;
  const base = BOT_BASE_VALUE[cat];
  if (!CHANCY.has(cat)) return base;
  return base * (0.55 + 0.45 * Math.min(1, turnsLeft / 6));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** 按上半区还差多少分、还剩哪几格，估算最后拿到 35 奖励的把握。 */
function bonusChance(need: number, remaining: readonly Cat[]): number {
  if (need <= 0) return 1;
  const best = remaining.reduce((total, cat) => total + 5 * upperFace(cat), 0);
  if (best < need) return 0;
  const par = remaining.reduce((total, cat) => total + 3 * upperFace(cat), 0);
  const spread = 3 + 3 * remaining.length;
  return sigmoid(((par - need) / spread) * 1.8);
}

interface Context {
  readonly sheet: Sheet;
  readonly turnsLeft: number;
  readonly upperSum: number;
  readonly upperLeft: readonly Cat[];
  readonly chanceNow: number;
}

function makeContext(sheet: Sheet): Context {
  const empty = CATS.filter((cat) => sheet.scores[cat] === undefined);
  const upperLeft = UPPER.filter((cat) => sheet.scores[cat] === undefined);
  const upperSum = UPPER.reduce((total, cat) => total + (sheet.scores[cat] ?? 0), 0);
  return {
    sheet,
    turnsLeft: empty.length - 1,
    upperSum,
    upperLeft,
    chanceNow: bonusChance(UPPER_BONUS_THRESHOLD - upperSum, upperLeft),
  };
}

/** 这把骰子填进这一格的「值」（越大越好）。 */
function valueOf(ctx: Context, dice: readonly number[], cat: Cat): number {
  const points = scoreFor(dice, cat, ctx.sheet);
  let value = points - futureValue(cat, ctx.turnsLeft);
  if (earnsYachtBonus(dice, ctx.sheet)) value += YACHT_BONUS;
  if ((UPPER as readonly Cat[]).includes(cat) && ctx.chanceNow < 1) {
    const after = bonusChance(UPPER_BONUS_THRESHOLD - ctx.upperSum - points, ctx.upperLeft.filter((other) => other !== cat));
    value += UPPER_BONUS * (after - ctx.chanceNow);
  }
  // 快艇格空着：5 颗相同是以后 +100 的前提，别轻易划掉
  if (cat === "LY" && points === 0) value -= 4 * Math.min(1, ctx.turnsLeft / 4);
  return value;
}

/** 这把骰子现在填哪一格最好。 */
function bestCategory(ctx: Context, dice: readonly number[]): { cat: Cat; value: number } {
  let best: { cat: Cat; value: number } | null = null;
  for (const cat of legalCategories(dice, ctx.sheet)) {
    const value = valueOf(ctx, dice, cat);
    if (!best || value > best.value + 1e-9) best = { cat, value };
  }
  return best!;
}

// ---------- 骰子组合（按每种点数的个数，下标 1–6）----------
type Counts = number[];
const keyOf = (counts: Counts) => counts[1]! + 6 * (counts[2]! + 6 * (counts[3]! + 6 * (counts[4]! + 6 * (counts[5]! + 6 * counts[6]!))));
const sizeOf = (counts: Counts) => counts[1]! + counts[2]! + counts[3]! + counts[4]! + counts[5]! + counts[6]!;
const toDice = (counts: Counts) => counts.flatMap((count, face) => Array.from({ length: face === 0 ? 0 : count }, () => face));
const countsOf = (dice: readonly number[]): Counts => {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const die of dice) counts[die] = (counts[die] ?? 0) + 1;
  return counts;
};
const merge = (a: Counts, b: Counts): Counts => a.map((count, face) => count + (b[face] ?? 0));

/** n 颗骰子所有结果（按个数合并）和概率。 */
const OUTCOMES: { counts: Counts; p: number }[][] = [];
{
  const factorial = [1, 1, 2, 6, 24, 120];
  for (let n = 0; n <= 5; n += 1) {
    const list: { counts: Counts; p: number }[] = [];
    const walk = (face: number, left: number, counts: Counts) => {
      if (face === 6) {
        const full = [...counts];
        full[6] = left;
        let ways = factorial[n]!;
        for (let f = 1; f <= 6; f += 1) ways /= factorial[full[f]!]!;
        list.push({ counts: full, p: ways / 6 ** n });
        return;
      }
      for (let c = 0; c <= left; c += 1) {
        const next = [...counts];
        next[face] = c;
        walk(face + 1, left - c, next);
      }
    };
    walk(1, n, [0, 0, 0, 0, 0, 0, 0]);
    OUTCOMES.push(list);
  }
}

/** 所有 5 颗骰子的组合（252 种）。 */
const FULL = OUTCOMES[5]!.map((entry) => entry.counts);

/** 一个组合的所有「留下」子集（按个数合并，含全部留下）。 */
function subKeeps(counts: Counts): Counts[] {
  const result: Counts[] = [];
  const walk = (face: number, current: Counts) => {
    if (face === 7) {
      result.push([...current]);
      return;
    }
    for (let c = 0; c <= counts[face]!; c += 1) {
      current[face] = c;
      walk(face + 1, current);
    }
    current[face] = 0;
  };
  walk(1, [0, 0, 0, 0, 0, 0, 0]);
  return result;
}
const SUBKEEPS = new Map<number, Counts[]>(FULL.map((counts) => [keyOf(counts), subKeeps(counts)]));

/** 对一张计分表：每种 5 颗组合在「还能重掷 r 次」时的最佳期望值，以及每种「留下」的期望。 */
class Planner {
  private readonly levels: Map<number, number>[] = [];
  private readonly keepCache: Map<number, number>[] = [new Map(), new Map(), new Map()];

  constructor(private readonly ctx: Context) {
    const v0 = new Map<number, number>();
    for (const counts of FULL) v0.set(keyOf(counts), bestCategory(ctx, toDice(counts)).value);
    this.levels.push(v0);
  }

  value(counts: Counts, rollsLeft: number): number {
    while (this.levels.length <= rollsLeft) this.buildLevel(this.levels.length);
    return this.levels[rollsLeft]!.get(keyOf(counts))!;
  }

  /** 留下 keep、重掷其余（之后还能再重掷 rollsLeft - 1 次）的期望值。 */
  keepValue(keep: Counts, rollsLeft: number): number {
    const key = keyOf(keep);
    const cache = this.keepCache[rollsLeft]!;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let total = 0;
    for (const { counts, p } of OUTCOMES[5 - sizeOf(keep)]!) total += p * this.value(merge(keep, counts), rollsLeft - 1);
    cache.set(key, total);
    return total;
  }

  private buildLevel(rollsLeft: number): void {
    const level = new Map<number, number>();
    for (const counts of FULL) {
      const key = keyOf(counts);
      let best = this.levels[0]!.get(key)!;
      for (const keep of SUBKEEPS.get(key)!) if (sizeOf(keep) < 5) best = Math.max(best, this.keepValue(keep, rollsLeft));
      level.set(key, best);
    }
    this.levels.push(level);
  }

  /** 现在这把骰子最好的「留下」（不含全部留下）和期望值。 */
  bestKeep(counts: Counts, rollsLeft: number): { keep: Counts; value: number } {
    let best: { keep: Counts; value: number } | null = null;
    for (const keep of SUBKEEPS.get(keyOf(counts))!) {
      if (sizeOf(keep) === 5) continue;
      const value = this.keepValue(keep, rollsLeft);
      // 同样好时多留几颗（少动骰子，更像人）
      if (!best || value > best.value + 1e-9 || (Math.abs(value - best.value) <= 1e-9 && sizeOf(keep) > sizeOf(best.keep))) best = { keep, value };
    }
    return best!;
  }

  /** 留下 keep 再掷一次后，最常落到哪一格（给理由用）。 */
  likelyTarget(keep: Counts): Cat {
    const weight = new Map<Cat, number>();
    for (const { counts, p } of OUTCOMES[5 - sizeOf(keep)]!) {
      const dice = toDice(merge(keep, counts));
      const { cat, value } = bestCategory(this.ctx, dice);
      weight.set(cat, (weight.get(cat) ?? 0) + p * Math.max(0, value));
    }
    return [...weight.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }
}

/** 同一张计分表（同一回合里的几次决定、同时模式的同一轮）复用算好的期望表。 */
const plannerCache = new Map<string, Planner>();
function plannerFor(ctx: Context): Planner {
  const key = CATS.map((cat) => ctx.sheet.scores[cat] ?? "-").join(",") + "|" + ctx.sheet.yachtBonuses;
  let planner = plannerCache.get(key);
  if (!planner) {
    planner = new Planner(ctx);
    if (plannerCache.size >= 32) plannerCache.delete(plannerCache.keys().next().value!);
    plannerCache.set(key, planner);
  }
  return planner;
}

/** 留下 keep 要重掷哪几颗（下标）。 */
function rerollIndices(dice: readonly number[], keep: Counts): number[] {
  const left = [...keep];
  const reroll: number[] = [];
  dice.forEach((die, index) => {
    if ((left[die] ?? 0) > 0) left[die] = left[die]! - 1;
    else reroll.push(index);
  });
  return reroll;
}

function scoreReason(ctx: Context, dice: readonly number[], cat: Cat): string {
  const points = scoreFor(dice, cat, ctx.sheet);
  const name = `「${CAT_NAMES[cat]}」`;
  if (isWild(dice, ctx.sheet)) {
    const bonus = earnsYachtBonus(dice, ctx.sheet) ? "快艇奖励 +100，" : "";
    return `又掷出快艇：${bonus}按百搭规则填${name}得 ${points} 分。`;
  }
  if (points === 0) return `这把凑不成好组合，划掉${name}损失最小。`;
  if ((UPPER as readonly Cat[]).includes(cat)) {
    const face = upperFace(cat);
    const count = dice.filter((die) => die === face).length;
    if (ctx.upperSum < UPPER_BONUS_THRESHOLD && ctx.upperSum + points >= UPPER_BONUS_THRESHOLD) return `填${name}得 ${points} 分，上半区凑够 63，拿到奖励 35！`;
    return count >= 3 ? `${count} 颗 ${face} 点，填${name}得 ${points} 分，离上半区奖励更近。` : `填${name}得 ${points} 分，别的格子都不划算。`;
  }
  if (cat === "LY") return `5 颗一样！填${name}得 50 分。`;
  if (cat === "LCH") return `没有更合适的格子，填${name}得 ${points} 分（5 颗的总和）。`;
  return `填${name}得 ${points} 分。`;
}

function keepReason(keep: Counts, fallback: () => Cat): string {
  const kept = toDice(keep);
  const head = kept.length === 0 ? "这把没什么好留的，5 颗全部重掷" : `留下 ${kept.join("、")}，重掷 ${5 - kept.length} 颗`;
  const faces = [1, 2, 3, 4, 5, 6].filter((face) => keep[face]! > 0);
  const pairs = faces.filter((face) => keep[face]! >= 2);
  let goal: string;
  if (kept.length === 0) goal = `去碰碰运气`;
  else if (faces.length === 1) {
    const count = keep[faces[0]!]!;
    goal = count >= 4 ? "冲快艇" : count === 3 ? "去凑四条、快艇" : `去凑更多 ${faces[0]} 点`;
  } else if (pairs.length === 2 && faces.length === 2) goal = "去凑葫芦";
  else if (faces.length >= 3 && faces.length === kept.length && faces.at(-1)! - faces[0]! === faces.length - 1) goal = "去凑顺子";
  else goal = `去凑「${CAT_NAMES[fallback()]}」`;
  return `${head}，${goal}。`;
}

/** 人机这一步走什么、为什么。输入必须是 redactGameForViewer(game, playerId) 之后的状态。 */
export function botDecision(state: GameState, playerId: string): BotDecision | null {
  if (state.seed !== undefined || state.rngState !== undefined) throw new Error("人机只能看自己座位视角的状态（先 redactGameForViewer）。");
  if (legalActions(state, playerId).length === 0) return null;
  const turn = state.turns[playerId]!;
  const player = state.players.find((candidate) => candidate.id === playerId)!;
  if (turn.rolls === 0) return { command: { type: "ROLL" }, reason: "先把 5 颗骰子都掷出来。" };
  const ctx = makeContext(player.sheet);
  const dice = turn.dice;
  const now = bestCategory(ctx, dice);
  const rollsLeft = 3 - turn.rolls;
  if (rollsLeft > 0) {
    const planner = plannerFor(ctx);
    const keep = planner.bestKeep(countsOf(dice), rollsLeft);
    if (keep.value > now.value + 0.5) {
      return { command: { type: "ROLL", reroll: rerollIndices(dice, keep.keep) }, reason: keepReason(keep.keep, () => planner.likelyTarget(keep.keep)) };
    }
  }
  return { command: { type: "SCORE", cat: now.cat }, reason: scoreReason(ctx, dice, now.cat) };
}

/** 人机这一步（输入必须是 redactGameForViewer(game, playerId) 之后的状态）。 */
export function botCommand(state: GameState, playerId: string): GameCommand | null {
  return botDecision(state, playerId)?.command ?? null;
}
