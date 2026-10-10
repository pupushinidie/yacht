/**
 * 预览局面工厂（对外接口）：界面预览页、教程、测试都用它造局面。
 *
 * - `buildState(options)`：按参数造任意一个精确局面（人数、模式、每人的计分表、当前是谁、骰子、掷了几次……）。
 * - `makeScene(name, options?)`：按名字造常见局面，名字见 SCENE_NAMES。
 *
 * 造出来的局面和真实对局的状态结构完全一样（带种子），可以直接交给 apply / applyCommand 接着走。
 */
import { createGame, freshTurn } from "./engine.js";
import { CATS, sheetTotals } from "./scoring.js";
import type { Cat, GameEvent, GameState, PlayMode, ScoreRecord, Sheet } from "./types.js";

export interface SceneSheet {
  readonly scores: Partial<Record<Cat, number>>;
  readonly yachtBonuses?: number;
}

export interface BuildOptions {
  /** 人数（默认 2），或者每人的名字。玩家 id 是 p0、p1……。 */
  readonly players?: number | readonly string[];
  readonly mode?: PlayMode;
  readonly seed?: number;
  /** 每人的计分表（按座位下标）；没给的是空表。 */
  readonly sheets?: readonly (SceneSheet | undefined)[];
  /** 第几轮；不给就按当前玩家已填的格数 + 1 算。 */
  readonly round?: number;
  /** 轮流模式的先手、当前玩家（座位下标，默认都是 0）。 */
  readonly startPlayer?: number;
  readonly current?: number;
  /** 当前玩家（同时模式：每个还没填的人）的骰子，0 = 没掷。 */
  readonly dice?: readonly number[];
  readonly rolls?: number;
  readonly held?: readonly boolean[];
  /** 同时模式：这一轮已经填好的人（座位下标）；他们这一轮填的格子要写在 sheets 里，并在 doneCats 里注明是哪格。 */
  readonly done?: readonly number[];
  readonly doneCats?: readonly (Cat | undefined)[];
  /** 局面的最近事件（演示动画用）。 */
  readonly events?: readonly GameEvent[];
  /** 13 格都填满时置 true：算出结算。 */
  readonly finished?: boolean;
}

const NAMES = ["你", "咕噜一号", "海獭船长", "企鹅大副", "海豹水手", "螃蟹厨师"];

function toSheet(scene: SceneSheet | undefined): Sheet {
  return { scores: { ...(scene?.scores ?? {}) }, yachtBonuses: scene?.yachtBonuses ?? 0 };
}

export function buildState(options: BuildOptions = {}): GameState {
  const names = typeof options.players === "object" ? [...options.players] : NAMES.slice(0, options.players ?? 2);
  const mode = options.mode ?? "turns";
  const state = createGame(names.map((name, index) => ({ id: `p${index}`, name })), options.seed ?? 12345, { mode });
  state.startPlayer = options.startPlayer ?? 0;
  state.currentPlayer = options.current ?? state.startPlayer;
  state.players.forEach((player, index) => {
    player.sheet = toSheet(options.sheets?.[index]);
    player.score = sheetTotals(player.sheet).total;
  });
  const current = state.players[state.currentPlayer]!;
  const filled = CATS.filter((cat) => current.sheet.scores[cat] !== undefined).length;
  state.round = options.round ?? Math.min(13, filled + 1);

  // 历史：每人的已填格按计分表顺序编进前几轮（同时模式这一轮已填的那格算这一轮）
  const history: ScoreRecord[] = [];
  state.players.forEach((player, index) => {
    const thisRound = options.doneCats?.[index];
    let round = 1;
    for (const cat of CATS) {
      const points = player.sheet.scores[cat];
      if (points === undefined) continue;
      const isNow = cat === thisRound;
      history.push({
        player: player.id,
        round: isNow ? state.round : Math.min(round, state.round),
        cat,
        points,
        yachtBonus: false,
        wild: false,
        upperBonus: false,
        dice: [0, 0, 0, 0, 0],
      });
      if (!isNow) round += 1;
    }
  });
  state.history = history;

  const makeTurn = () => {
    const turn = freshTurn();
    if (options.dice) turn.dice = [...options.dice];
    turn.rolls = options.rolls ?? (options.dice && options.dice.some((die) => die > 0) ? 1 : 0);
    if (options.held) turn.held = [...options.held];
    return turn;
  };
  if (options.finished) {
    state.turns = {};
    finish(state);
  } else if (mode === "simultaneous") {
    const done = new Set(options.done ?? []);
    state.done = Object.fromEntries(state.players.filter((_, index) => done.has(index)).map((player) => [player.id, true]));
    state.turns = Object.fromEntries(state.players.filter((_, index) => !done.has(index)).map((player) => [player.id, makeTurn()]));
  } else {
    state.turns = { [current.id]: makeTurn() };
  }
  state.scoreCount = history.length;
  state.events = options.events ? [...options.events] : [];
  state.version = 1;
  return state;
}

function finish(state: GameState): void {
  state.phase = "finished";
  state.round = 13;
  const totals = Object.fromEntries(state.players.map((player) => [player.id, sheetTotals(player.sheet)]));
  const best = Math.max(...Object.values(totals).map((entry) => entry.total));
  const winners = state.players.filter((player) => totals[player.id]!.total === best).map((player) => player.id);
  const ranks = Object.fromEntries(
    state.players.map((player) => [player.id, 1 + state.players.filter((other) => totals[other.id]!.total > totals[player.id]!.total).length]),
  );
  state.finalResult = { winners, totals, ranks };
  state.events = [{ type: "GameEnded", winners }];
}

/** 一张填好 n 格的「像样」的计分表（variant 让每人的分数不一样）。 */
export function sampleSheet(filled: number, variant = 0, order: readonly Cat[] = CATS): SceneSheet {
  const base: Record<Cat, number[]> = {
    U1: [3, 2, 1, 4, 3, 0], U2: [6, 4, 8, 6, 2, 6], U3: [9, 12, 6, 9, 9, 3], U4: [12, 8, 16, 12, 4, 12],
    U5: [15, 20, 10, 15, 25, 10], U6: [18, 24, 18, 12, 18, 24],
    L3K: [22, 25, 17, 0, 19, 24], L4K: [0, 24, 18, 0, 13, 0], LFH: [25, 25, 0, 25, 25, 0], LSS: [30, 30, 30, 0, 30, 30],
    LLS: [40, 0, 40, 40, 0, 0], LY: [50, 0, 0, 50, 0, 0], LCH: [23, 21, 19, 24, 22, 20],
  };
  const scores: Partial<Record<Cat, number>> = {};
  for (const cat of order.slice(0, filled)) scores[cat] = base[cat][variant % 6]!;
  return { scores };
}

export const SCENE_NAMES = [
  "start",
  "rolled",
  "held",
  "last-roll",
  "yacht",
  "wild-upper",
  "wild-kind",
  "wild-borrow",
  "wild-zero",
  "scratch",
  "bonus-near",
  "opponent-turn",
  "six-players",
  "solo",
  "simul-rolling",
  "simul-waiting",
  "simul-reveal",
  "timeout",
  "last-round",
  "final",
  "final-tie",
  "final-six",
] as const;
export type SceneName = (typeof SCENE_NAMES)[number];

/**
 * 按名字造常见局面（自己是 p0）：
 * start 开局没掷 · rolled 掷了第 1 次 · held 留下了两颗 · last-roll 掷满 3 次只能填分 · yacht 快艇格空着掷出快艇 ·
 * wild-upper / wild-kind / wild-borrow / wild-zero 百搭的四步 · scratch 后期没凑成要划掉 · bonus-near 差一格就拿上半区奖励 ·
 * opponent-turn 别人在掷 · six-players 6 人局中盘 · solo 1 人局 · simul-rolling / simul-waiting / simul-reveal 同时模式 ·
 * timeout 别人刚超时被自动填 · last-round 第 13 轮 · final 终局 · final-tie 并列 · final-six 6 人终局。
 */
export function makeScene(name: SceneName, overrides: BuildOptions = {}): GameState {
  const make = (options: BuildOptions) => buildState({ ...options, ...overrides });
  switch (name) {
    case "start":
      return make({ players: 2 });
    case "rolled":
      return make({ players: 2, dice: [3, 3, 5, 1, 6], rolls: 1, events: [{ type: "Rolled", player: "p0", dice: [3, 3, 5, 1, 6], rerolled: [0, 1, 2, 3, 4], rolls: 1 }] });
    case "held":
      return make({ players: 2, dice: [3, 3, 5, 1, 6], rolls: 1, held: [true, true, false, false, false] });
    case "last-roll":
      return make({ players: 2, sheets: [sampleSheet(4), sampleSheet(4, 1)], dice: [2, 3, 3, 4, 6], rolls: 3 });
    case "yacht":
      return make({ players: 2, sheets: [sampleSheet(3), sampleSheet(3, 1)], dice: [6, 6, 6, 6, 6], rolls: 2, events: [{ type: "Rolled", player: "p0", dice: [6, 6, 6, 6, 6], rerolled: [2, 4], rolls: 2 }] });
    case "wild-upper":
      return make({ players: 2, sheets: [{ scores: { LY: 50, U1: 3, U6: 18, LSS: 30 } }, sampleSheet(4, 1)], dice: [4, 4, 4, 4, 4], rolls: 1 });
    case "wild-kind":
      return make({ players: 2, sheets: [{ scores: { LY: 50, U4: 12, L4K: 0, U1: 2 } }, sampleSheet(4, 1)], dice: [4, 4, 4, 4, 4], rolls: 2 });
    case "wild-borrow":
      return make({ players: 2, sheets: [{ scores: { LY: 50, U4: 12, L3K: 22, L4K: 24, LSS: 30, U2: 6 } }, sampleSheet(6, 1)], dice: [4, 4, 4, 4, 4], rolls: 1 });
    case "wild-zero":
      return make({ players: 2, sheets: [{ scores: { LY: 50, U2: 6, U3: 9, U4: 12, U5: 15, L3K: 22, L4K: 24, LFH: 25, LSS: 30, LLS: 40, LCH: 21 }, yachtBonuses: 1 }, sampleSheet(11, 1)], dice: [5, 5, 5, 5, 5], rolls: 3 });
    case "scratch":
      return make({ players: 2, sheets: [{ scores: { U2: 6, U3: 9, U4: 12, U5: 15, U6: 18, L3K: 22, LFH: 25, LSS: 30, LCH: 23, LY: 50 } }, sampleSheet(10, 1)], dice: [1, 2, 2, 4, 6], rolls: 3 });
    case "bonus-near":
      return make({ players: 2, sheets: [{ scores: { U1: 3, U2: 6, U3: 9, U4: 12, U5: 15, L3K: 22, LCH: 20 } }, sampleSheet(7, 1)], dice: [6, 6, 6, 2, 5], rolls: 2 });
    case "opponent-turn":
      return make({ players: 3, sheets: [sampleSheet(5), sampleSheet(5, 1), sampleSheet(4, 2)], current: 2, startPlayer: 0, round: 5, dice: [5, 5, 2, 5, 1], rolls: 1, held: [true, true, false, true, false] });
    case "six-players":
      return make({ players: 6, sheets: [0, 1, 2, 3, 4, 5].map((index) => sampleSheet(index < 3 ? 8 : 7, index)), current: 3, startPlayer: 0, round: 8, dice: [2, 3, 4, 5, 5], rolls: 2 });
    case "solo":
      return make({ players: 1, sheets: [sampleSheet(6)], dice: [1, 2, 3, 4, 6], rolls: 1 });
    case "simul-rolling":
      return make({ players: 3, mode: "simultaneous", sheets: [sampleSheet(4), { scores: { ...sampleSheet(4, 1).scores, LCH: 21 } }, sampleSheet(4, 2)], round: 5, done: [1], doneCats: [undefined, "LCH"], dice: [2, 2, 5, 5, 3], rolls: 1 });
    case "simul-waiting":
      return make({ players: 3, mode: "simultaneous", sheets: [{ scores: { ...sampleSheet(4).scores, LFH: 25 } }, { scores: { ...sampleSheet(4, 1).scores, LCH: 21 } }, sampleSheet(4, 2)], round: 5, done: [0, 1], doneCats: ["LFH", "LCH"], dice: [6, 6, 1, 3, 3], rolls: 2 });
    case "simul-reveal": {
      const state = make({ players: 3, mode: "simultaneous", sheets: [sampleSheet(5), sampleSheet(5, 1), sampleSheet(5, 2)], round: 6 });
      const records = state.players.map((player) => state.history.filter((record) => record.player === player.id).at(-1)!);
      state.events = [{ type: "RoundRevealed", round: 5, records }, { type: "RoundStarted", round: 6 }];
      return state;
    }
    case "timeout": {
      const state = make({ players: 2, sheets: [sampleSheet(3), sampleSheet(4, 1)], current: 0, round: 4 });
      state.events = [
        { type: "TurnTimedOut", player: "p1", action: "score" },
        { type: "Scored", record: state.history.filter((record) => record.player === "p1").at(-1)! },
        { type: "TurnStarted", player: "p0" },
      ];
      return state;
    }
    case "last-round":
      return make({ players: 2, sheets: [sampleSheet(12), sampleSheet(13, 1)], current: 0, startPlayer: 1, round: 13, dice: [1, 1, 3, 4, 6], rolls: 1 });
    case "final":
      return make({ players: 3, sheets: [{ ...sampleSheet(13), yachtBonuses: 1 }, sampleSheet(13, 1), sampleSheet(13, 2)], finished: true });
    case "final-tie":
      return make({ players: 2, sheets: [sampleSheet(13), sampleSheet(13)], finished: true });
    case "final-six":
      return make({ players: 6, sheets: [0, 1, 2, 3, 4, 5].map((index) => sampleSheet(13, index)), finished: true });
  }
}
