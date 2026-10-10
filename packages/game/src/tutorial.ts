/**
 * 新手教程的剧本（快艇骰子，规则书 §9.8）。
 *
 * 教程在浏览器里直接跑规则引擎，不连服务器：骰子按 TUTORIAL_DICE 出，对手（咕噜一号）按剧本走，
 * 所以「凑成大顺」「掷出快艇」「又一个快艇按百搭填」这些关键一幕一定会发生。
 * 剧本走完接着把这局打完（练习）：对手交给人机，骰子换成普通随机数。
 *
 * 每一步写三件事：咕噜嘎说什么（say / note）、高亮哪个元素（anchor，对应网页里的 data-tutorial="…"）、
 * 等玩家做什么（do 步骤的 expect）。改了规则或界面，test/tutorial.test.ts 会检查剧本还能不能从头走到尾。
 */
import { createGame } from "./engine.js";
import { createRng, type Rng } from "./rng.js";
import { CATS } from "./scoring.js";
import type { GameCommand, GameState } from "./types.js";

/** 咕噜嘎的表情。 */
export type TutorialFace = "base" | "happy" | "surprised" | "think";

interface StepBase {
  readonly id: string;
  /** 侧栏「新手教程」进度里这一课叫什么；没有就不单独列。 */
  readonly lesson?: string;
  /** 主句（24px），一句话说清这一步。 */
  readonly say: string;
  /** 补充说明（12px）。 */
  readonly note?: string;
  /** 触屏设备上换成这句说明。 */
  readonly noteTouch?: string;
  /**
   * 高亮哪个元素：网页里 data-tutorial 的值。
   * 固定的有 status、dice、roll、sheet、players、upper-bonus、my-total、round、menu；计分表列头 col-<玩家 id>；
   * 单颗骰子 die-0 … die-4；自己计分表上的格子 cell-<格子代码>（如 cell-U3、cell-LLS）。
   */
  readonly anchor?: string;
  readonly face?: TutorialFace;
}

export type TutorialStep =
  /** 讲解：玩家点「下一步」继续。finale 是最后一步（接练习或结束）。 */
  | (StepBase & { readonly kind: "info"; readonly finale?: boolean })
  /** 等玩家做这一步；做别的会被拦下（改「留下」不算，随便点）。 */
  | (StepBase & { readonly kind: "do"; readonly expect: GameCommand })
  /** 对手按剧本自动走这几步，牌桌不压暗。 */
  | (StepBase & { readonly kind: "watch"; readonly moves: readonly GameCommand[] });

export const TUTORIAL_SELF = "p0";
export const TUTORIAL_RIVAL = "p1";
export const TUTORIAL_RIVAL_NAME = "咕噜一号";

const ROLL: GameCommand = { type: "ROLL" };
const reroll = (...indices: number[]): GameCommand => ({ type: "ROLL", reroll: indices });
const score = (cat: (typeof CATS)[number]): GameCommand => ({ type: "SCORE", cat });

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    kind: "info", id: "goal", lesson: "目标", anchor: "round",
    say: "一共 13 轮，每轮掷完骰子在计分表上填一格。",
    note: "13 格填满，总分最高的人赢。这局你和咕噜一号比。",
  },
  // ---------- 第 1 轮：掷骰、留下、上半区 ----------
  { kind: "do", id: "r1-roll", lesson: "掷骰", anchor: "roll", expect: ROLL, say: "点「掷骰」，5 颗骰子一起掷。", note: "每轮最多掷 3 次。" },
  {
    kind: "do", id: "r1-hold", lesson: "留下骰子", anchor: "dice", expect: reroll(2, 3, 4),
    say: "点两颗 3 把它们留下，再点「重掷」。",
    note: "留下的骰子不动，只重掷其余 3 颗。点错了再点一下就放回。",
  },
  {
    kind: "info", id: "r1-explain", lesson: "上半区", anchor: "cell-U3", face: "happy",
    say: "三颗 3！「三点」只数 3 点的骰子：3 × 3 = 9。",
    note: "计分表上的灰字，就是填进那一格能得的分。",
  },
  { kind: "do", id: "r1-score", anchor: "cell-U3", expect: score("U3"), say: "点「三点」那一格，填 9 分。", note: "每格只能填一次，13 格正好用 13 轮。" },
  {
    kind: "info", id: "bonus", lesson: "上半区奖励", anchor: "upper-bonus", face: "think",
    say: "一点到六点加起来满 63，再奖励 35。",
    note: "差不多是每格三颗。所以五点、六点别随便浪费。",
  },
  { kind: "watch", id: "rival-1", anchor: "col-p1", moves: [ROLL, score("U4")], say: "轮到咕噜一号了，他的分记在旁边一列。" },
  // ---------- 第 2 轮：顺子 ----------
  { kind: "do", id: "r2-roll", anchor: "roll", expect: ROLL, say: "又轮到你了，掷骰。" },
  {
    kind: "do", id: "r2-hold", lesson: "顺子", anchor: "dice", expect: reroll(3, 4),
    say: "留下 2、3、4，重掷两颗 6，去凑顺子。",
  },
  {
    kind: "info", id: "r2-explain", anchor: "cell-LLS", face: "happy",
    say: "2-3-4-5-6，五个连续：大顺 40 分！",
    note: "4 个连续是小顺 30。大顺也能填进小顺，不过 40 更划算。",
  },
  { kind: "do", id: "r2-score", lesson: "固定分", anchor: "cell-LLS", expect: score("LLS"), say: "填进「大顺」。", note: "葫芦、小顺、大顺、快艇都是固定分，和点数大小无关。" },
  { kind: "watch", id: "rival-2", anchor: "col-p1", moves: [ROLL, score("U6")], say: "咕噜一号掷出三颗 6，填进了「六点」。" },
  // ---------- 第 3 轮：葫芦 ----------
  { kind: "do", id: "r3-roll", anchor: "roll", expect: ROLL, say: "掷骰。" },
  {
    kind: "do", id: "r3-hold", lesson: "葫芦", anchor: "dice", expect: reroll(4),
    say: "两对！留下这两对，只重掷那颗 1。",
    note: "3 颗一样 + 2 颗一样就是葫芦，25 分。",
  },
  { kind: "do", id: "r3-score", anchor: "cell-LFH", expect: score("LFH"), face: "happy", say: "凑成了！填进「葫芦」得 25。" },
  {
    kind: "watch", id: "rival-3", anchor: "col-p1", moves: [ROLL, score("LSS")],
    say: "咕噜一号掷出 1、3、4、5、6，填了「小顺」30。",
    note: "小顺只要有 4 个连续，多一颗不影响。",
  },
  // ---------- 第 4 轮：凑不成也要填 ----------
  { kind: "do", id: "r4-roll", anchor: "roll", expect: ROLL, say: "掷骰。" },
  { kind: "do", id: "r4-hold", lesson: "掷 3 次", anchor: "dice", expect: reroll(0, 1, 4), say: "留下 3、4，重掷另外 3 颗，去碰顺子。" },
  {
    kind: "do", id: "r4-again", anchor: "roll", expect: reroll(0, 1, 4), face: "think",
    say: "没凑成。还能再掷一次，这是最后一次。",
    note: "3、4 还留着，直接点「重掷」。",
  },
  {
    kind: "info", id: "r4-explain", lesson: "凑不成也要填", anchor: "cell-U1", face: "think",
    say: "3 次用完，什么都没凑成——还是必须填一格。",
    note: "挑损失最小的：「一点」本来就只值几分，填 2 分最划算。凑不成的格子也能填，得 0 分叫「划掉」。",
  },
  { kind: "do", id: "r4-score", anchor: "cell-U1", expect: score("U1"), say: "填进「一点」。" },
  {
    kind: "watch", id: "rival-4", lesson: "三条、四条、机会", anchor: "col-p1", moves: [ROLL, score("L4K")],
    say: "咕噜一号掷出四颗 2，填「四条」：13 分。",
    note: "三条、四条、机会都按 5 颗骰子的总和算，不只算相同的那几颗。",
  },
  // ---------- 第 5 轮：快艇 ----------
  { kind: "do", id: "r5-roll", anchor: "roll", expect: ROLL, say: "掷骰。" },
  { kind: "info", id: "r5-explain", lesson: "快艇", anchor: "cell-LY", face: "surprised", say: "5 颗全是 6——快艇！", note: "快艇格固定 50 分。" },
  { kind: "do", id: "r5-score", anchor: "cell-LY", expect: score("LY"), face: "happy", say: "填进「快艇」拿 50 分。" },
  { kind: "watch", id: "rival-5", anchor: "col-p1", moves: [ROLL, score("LFH")], say: "咕噜一号凑了个葫芦。" },
  // ---------- 第 6 轮：又一个快艇（+100、百搭） ----------
  { kind: "do", id: "r6-roll", anchor: "roll", expect: ROLL, say: "掷骰。" },
  {
    kind: "info", id: "r6-explain", lesson: "又一个快艇", anchor: "cell-U4", face: "surprised",
    say: "又是快艇！快艇格已经是 50，这次再加 100。",
    note: "这次要按顺序填：对应的「四点」还空着，就只能填它。计分表上只有亮着的格子能点。",
  },
  { kind: "do", id: "r6-score", anchor: "cell-U4", expect: score("U4"), face: "happy", say: "填进「四点」：20 分，外加快艇奖励 100。" },
  {
    kind: "info", id: "finale", finale: true, anchor: "my-total", face: "happy",
    say: "剩下 7 轮你自己来！",
    note: "拿不准就点「提示」（键盘 H）。真实对局里每个决定限时 30 秒，连续超时 2 次会转托管，由人机替你打。",
  },
];

/** 剧本里每一颗骰子，按出现的顺序（每次掷骰时被重掷的那几颗从左到右取）。用完以后是普通随机数。 */
export const TUTORIAL_DICE: readonly number[] = [
  // 第 1 轮：你 3 3 5 1 6 → 重掷 3 颗得 3 2 6；咕噜一号 4 4 2 5 1
  3, 3, 5, 1, 6, 3, 2, 6, 4, 4, 2, 5, 1,
  // 第 2 轮：你 2 3 4 6 6 → 重掷 2 颗得 5 6（大顺）；咕噜一号 6 6 6 2 1
  2, 3, 4, 6, 6, 5, 6, 6, 6, 6, 2, 1,
  // 第 3 轮：你 5 5 2 2 1 → 重掷 1 颗得 5（葫芦）；咕噜一号 1 3 4 5 6
  5, 5, 2, 2, 1, 5, 1, 3, 4, 5, 6,
  // 第 4 轮：你 1 1 3 4 6 → 重掷 3 颗得 6 1 6 → 再重掷 3 颗得 1 6 1（什么都没凑成）；咕噜一号 2 2 2 2 5
  1, 1, 3, 4, 6, 6, 1, 6, 1, 6, 1, 2, 2, 2, 2, 5,
  // 第 5 轮：你 6 6 6 6 6（快艇）；咕噜一号 3 3 4 4 4
  6, 6, 6, 6, 6, 3, 3, 4, 4, 4,
  // 第 6 轮：你 4 4 4 4 4（又一个快艇）
  4, 4, 4, 4, 4,
];

/** 教程开局：你先手，对手是咕噜一号。 */
export function createTutorialGame(selfName: string, seed = 20261010): GameState {
  const game = createGame([{ id: TUTORIAL_SELF, name: selfName }, { id: TUTORIAL_RIVAL, name: TUTORIAL_RIVAL_NAME }], seed);
  game.startPlayer = 0;
  game.currentPlayer = 0;
  game.turns = { [TUTORIAL_SELF]: { dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 0 } };
  game.events = [{ type: "RoundStarted", round: 1 }, { type: "TurnStarted", player: TUTORIAL_SELF }];
  return game;
}

/** 练习局重开：随机先手、随机骰子。 */
export function createPracticeGame(selfName: string, seed: number): GameState {
  return createGame([{ id: TUTORIAL_SELF, name: selfName }, { id: TUTORIAL_RIVAL, name: TUTORIAL_RIVAL_NAME }], seed);
}

/** 剧本骰子：前面按 dice 出（每次 int(6) 取一颗），用完以后交给普通随机数。 */
export interface TutorialRng extends Rng {
  /** 还剩几颗剧本骰子。 */
  readonly remaining: number;
}

export function createTutorialRng(seed: number, dice: readonly number[] = TUTORIAL_DICE): TutorialRng {
  const queue = [...dice];
  const free = createRng(seed);
  return {
    next: () => free.next(),
    int: (max) => (max === 6 && queue.length > 0 ? queue.shift()! - 1 : free.int(max)),
    pick: (items) => free.pick(items),
    shuffle: (items) => free.shuffle(items),
    get state() {
      return free.state;
    },
    get remaining() {
      return queue.length;
    },
  };
}

/** 两条命令是不是同一步：掷骰比较重掷哪几颗（顺序无关；第一次掷骰都算全掷），填分比较格子。 */
export function sameCommand(a: GameCommand, b: GameCommand): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "SCORE" && b.type === "SCORE") return a.cat === b.cat;
  if (a.type === "ROLL" && b.type === "ROLL") {
    const key = (command: { reroll?: readonly number[] }) => (command.reroll ? [...command.reroll].sort().join(",") : "all");
    const ka = key(a);
    const kb = key(b);
    return ka === kb || (ka === "0,1,2,3,4" && kb === "all") || (ka === "all" && kb === "0,1,2,3,4");
  }
  return true;
}

const ALWAYS = new Set(["status", "dice", "sheet", "players", "upper-bonus", "my-total", "round", "menu"]);

/**
 * 这个锚点在这个局面里，界面上应该看得见吗（给剧本单测用，对应 GameBoard / ScoreSheet 的显示条件）。
 * viewer 是看界面的人（教程里就是你）。
 */
export function anchorVisible(state: GameState, anchor: string, viewer: string): boolean {
  if (ALWAYS.has(anchor)) return true;
  const turn = state.phase === "playing" ? state.turns[viewer] : undefined;
  const myTurn = !!turn && (state.config.mode === "simultaneous" || state.players[state.currentPlayer]?.id === viewer);
  if (anchor === "roll") return myTurn && turn!.rolls < 3;
  if (/^die-[0-4]$/.test(anchor)) return true;
  if (anchor.startsWith("cell-")) return (CATS as readonly string[]).includes(anchor.slice("cell-".length));
  // 计分表的列头：手机上只放自己和另一位（教程里就是对手），都看得见
  if (anchor.startsWith("col-")) return state.players.some((player) => player.id === anchor.slice("col-".length));
  return false;
}
