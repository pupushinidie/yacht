import { createRng, type Rng } from "./rng.js";
import {
  CATS,
  FIXED_POINTS,
  LOWER,
  UPPER,
  UPPER_BONUS_THRESHOLD,
  earnsYachtBonus,
  emptySheet,
  isCat,
  isWild,
  legalCategories,
  scoreFor,
  sheetTotals,
  upperFace,
} from "./scoring.js";
import type { Cat, Config, FinalResult, GameCommand, GameEvent, GameState, Player, ScoreRecord, Sheet, Totals, Turn } from "./types.js";

export const ROUNDS = 13;
export const DICE = 5;
export const MAX_ROLLS = 3;

export function defaultConfig(overrides: Partial<Config> = {}): Config {
  return {
    minPlayers: 1,
    maxPlayers: 6,
    mode: "turns",
    stepTimeoutSec: 30,
    ...overrides,
  };
}

export interface NewPlayer {
  readonly id: string;
  readonly name: string;
}

export function freshTurn(): Turn {
  return { dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 0 };
}

/** 现在要做决定的人：轮流模式是当前玩家；同时模式是这一轮还没填的人。 */
export function pendingActors(state: GameState): string[] {
  if (state.phase === "finished") return [];
  if (state.config.mode === "simultaneous") return state.players.filter((player) => !state.done[player.id]).map((player) => player.id);
  const player = state.players[state.currentPlayer];
  return player ? [player.id] : [];
}

/** 这个人当前这一步的计时 key：只在换人、换轮、掷骰、填分时变（改「留下」不变）。 */
export function actorKey(state: GameState, playerId: string): string {
  return `${state.round}:${playerId}:${state.turns[playerId]?.rolls ?? "done"}`;
}

function findPlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error("你不在这局里。");
  return player;
}

function canAct(state: GameState, playerId: string): void {
  if (state.phase === "finished") throw new Error("对局已经结束。");
  findPlayer(state, playerId);
  if (state.config.mode === "simultaneous") {
    if (state.done[playerId]) throw new Error("这一轮你已经填过了，等其他人填完。");
  } else if (state.players[state.currentPlayer]?.id !== playerId) {
    throw new Error("还没轮到你。");
  }
  if (!state.turns[playerId]) throw new Error("还没轮到你。");
}

function parseReroll(turn: Turn, reroll: unknown): number[] {
  if (turn.rolls === 0) {
    // 第 1 次必须 5 颗全掷（§5-3）
    if (reroll === undefined) return [0, 1, 2, 3, 4];
    if (!Array.isArray(reroll) || reroll.length !== DICE || new Set(reroll).size !== DICE || !reroll.every((index) => Number.isInteger(index) && index >= 0 && index < DICE)) {
      throw new Error("第一次要 5 颗全掷。");
    }
    return [0, 1, 2, 3, 4];
  }
  const indices = reroll === undefined ? turn.held.flatMap((held, index) => (held ? [] : [index])) : reroll;
  if (!Array.isArray(indices) || !indices.every((index) => Number.isInteger(index) && index >= 0 && index < DICE)) {
    throw new Error("要重掷的骰子不对。");
  }
  if (new Set(indices).size !== indices.length) throw new Error("同一颗骰子只能选一次。");
  if (indices.length === 0) throw new Error("至少选一颗要重掷的骰子。");
  return [...indices].sort((a, b) => a - b);
}

function applyRoll(state: GameState, playerId: string, reroll: unknown, rng: Rng, events: GameEvent[]): void {
  const turn = state.turns[playerId]!;
  if (turn.rolls >= MAX_ROLLS) throw new Error("已经掷满 3 次，只能填分。");
  const indices = parseReroll(turn, reroll);
  for (const index of indices) {
    turn.dice[index] = rng.int(6) + 1;
    turn.held[index] = false;
  }
  turn.rolls += 1;
  events.push({ type: "Rolled", player: playerId, dice: [...turn.dice], rerolled: indices, rolls: turn.rolls });
}

function applyHold(state: GameState, playerId: string, held: unknown, events: GameEvent[]): void {
  const turn = state.turns[playerId]!;
  if (turn.rolls === 0) throw new Error("先掷骰。");
  if (!Array.isArray(held) || held.length !== DICE || !held.every((value) => typeof value === "boolean")) {
    throw new Error("留下的骰子不对。");
  }
  turn.held = [...held];
  events.push({ type: "Held", player: playerId, held: [...held] });
}

function totalOf(sheet: Sheet): number {
  return sheetTotals(sheet).total;
}

function nextTurnOrRound(state: GameState, events: GameEvent[]): void {
  if (state.config.mode === "simultaneous") {
    if (state.players.some((player) => !state.done[player.id])) return;
    const records = state.history.filter((record) => record.round === state.round);
    events.push({ type: "RoundRevealed", round: state.round, records });
    if (state.round >= ROUNDS) {
      finishGame(state, events);
      return;
    }
    state.round += 1;
    state.done = {};
    state.turns = Object.fromEntries(state.players.map((player) => [player.id, freshTurn()]));
    events.push({ type: "RoundStarted", round: state.round });
    return;
  }
  const next = (state.currentPlayer + 1) % state.players.length;
  if (next === state.startPlayer) {
    if (state.round >= ROUNDS) {
      finishGame(state, events);
      return;
    }
    state.round += 1;
    events.push({ type: "RoundStarted", round: state.round });
  }
  state.currentPlayer = next;
  const playerId = state.players[next]!.id;
  state.turns = { [playerId]: freshTurn() };
  events.push({ type: "TurnStarted", player: playerId });
}

function applyScore(state: GameState, playerId: string, cat: unknown, events: GameEvent[], auto: boolean): void {
  const turn = state.turns[playerId]!;
  if (turn.rolls === 0) throw new Error("先掷骰再填分。");
  if (!isCat(cat)) throw new Error("没有这一格。");
  const player = findPlayer(state, playerId);
  const sheet = player.sheet;
  if (sheet.scores[cat] !== undefined) throw new Error("这一格已经填过了。");
  const dice = [...turn.dice];
  if (!legalCategories(dice, sheet).includes(cat)) throw new Error("又掷出了快艇：这次要按百搭的顺序填格子。");
  const wild = isWild(dice, sheet);
  const yachtBonus = earnsYachtBonus(dice, sheet);
  const points = scoreFor(dice, cat, sheet);
  const upperBefore = sheetTotals(sheet).upper;
  sheet.scores[cat] = points;
  if (yachtBonus) sheet.yachtBonuses += 1;
  const upperAfter = sheetTotals(sheet).upper;
  const record: ScoreRecord = {
    player: playerId,
    round: state.round,
    cat,
    points,
    yachtBonus,
    wild,
    upperBonus: upperBefore < UPPER_BONUS_THRESHOLD && upperAfter >= UPPER_BONUS_THRESHOLD,
    dice,
    ...(auto ? { auto: true } : {}),
  };
  player.score = totalOf(sheet);
  state.history.push(record);
  state.scoreCount += 1;
  events.push({ type: "Scored", record });
  if (state.config.mode === "simultaneous") {
    state.done[playerId] = true;
    delete state.turns[playerId];
    events.push({ type: "PlayerDone", player: playerId });
  }
  nextTurnOrRound(state, events);
}

/** 名次：总分高的在前，同分同名次（§7，并列获胜）。 */
export function rankPlayers(totals: Record<string, number>): Record<string, number> {
  const ranks: Record<string, number> = {};
  for (const [id, total] of Object.entries(totals)) {
    ranks[id] = 1 + Object.values(totals).filter((other) => other > total).length;
  }
  return ranks;
}

function finishGame(state: GameState, events: GameEvent[]): void {
  state.phase = "finished";
  state.turns = {};
  const totals: Record<string, Totals> = Object.fromEntries(state.players.map((player) => [player.id, sheetTotals(player.sheet)]));
  const best = Math.max(...Object.values(totals).map((entry) => entry.total));
  const winners = state.players.filter((player) => totals[player.id]!.total === best).map((player) => player.id);
  const ranks = rankPlayers(Object.fromEntries(Object.entries(totals).map(([id, entry]) => [id, entry.total])));
  const result: FinalResult = { winners, totals, ranks };
  state.finalResult = result;
  events.push({ type: "GameEnded", winners });
}

export function apply(state: GameState, playerId: string, command: GameCommand, rng: Rng): { state: GameState; events: GameEvent[] } {
  return applyInner(state, playerId, command, rng, false);
}

function applyInner(state: GameState, playerId: string, command: GameCommand, rng: Rng, auto: boolean): { state: GameState; events: GameEvent[] } {
  canAct(state, playerId);
  const next = structuredClone(state);
  const events: GameEvent[] = [];
  switch (command?.type) {
    case "ROLL":
      applyRoll(next, playerId, command.reroll, rng, events);
      break;
    case "HOLD":
      applyHold(next, playerId, command.held, events);
      break;
    case "SCORE":
      applyScore(next, playerId, command.cat, events, auto);
      break;
    default:
      throw new Error("未知的行动。");
  }
  next.version += 1;
  next.actionCount[playerId] = (next.actionCount[playerId] ?? 0) + 1;
  next.events = events;
  return { state: next, events };
}

function runCommand(state: GameState, playerId: string, command: GameCommand, auto = false): { state: GameState; events: GameEvent[] } {
  const rng = createRng(state.rngState ?? state.seed ?? 0);
  const { state: next, events } = applyInner(state, playerId, command, rng, auto);
  next.rngState = rng.state;
  next.log = [...(state.log ?? []), { player: playerId, command }];
  return { state: next, events };
}

/** 服务器用：随机数从 state.rngState 里接着取。 */
export function applyCommand(state: GameState, playerId: string, command: GameCommand): GameState {
  return runCommand(state, playerId, command).state;
}

/** 托管、人机代打时用：和 applyCommand 一样，只是填分记录上标「自动」。 */
export function applyAutoCommand(state: GameState, playerId: string, command: GameCommand): GameState {
  return runCommand(state, playerId, command, true).state;
}

const REROLL_SUBSETS: number[][] = Array.from({ length: 31 }, (_, mask) => mask + 1).map((mask) =>
  [0, 1, 2, 3, 4].filter((index) => mask & (1 << index)),
);

/** 这个人现在所有的合法行动（不含只影响界面的 HOLD）。 */
export function legalActions(state: GameState, playerId: string): GameCommand[] {
  if (!pendingActors(state).includes(playerId)) return [];
  const turn = state.turns[playerId];
  if (!turn) return [];
  if (turn.rolls === 0) return [{ type: "ROLL" }];
  const player = findPlayer(state, playerId);
  const actions: GameCommand[] = [];
  if (turn.rolls < MAX_ROLLS) for (const reroll of REROLL_SUBSETS) actions.push({ type: "ROLL", reroll });
  for (const cat of legalCategories(turn.dice, player.sheet)) actions.push({ type: "SCORE", cat });
  return actions;
}

/**
 * 超时填哪格（§9.4）：当前能拿到的最高分格；同分时先上半区（离「三颗」差得最少的，划 0 先划一点），
 * 再下半区的固定分格，再三条、四条、机会；快艇格只在别无选择时才划 0。
 */
export function autoScoreCategory(dice: readonly number[], sheet: Sheet): Cat {
  const legal = legalCategories(dice, sheet);
  const tier = (cat: Cat, points: number): number => {
    if (cat === "LY" && points === 0) return 9;
    if ((UPPER as readonly Cat[]).includes(cat)) return 0;
    if (FIXED_POINTS[cat] !== undefined) return 1;
    return cat === "LCH" ? 3 : 2;
  };
  const scored = legal.map((cat) => {
    const points = scoreFor(dice, cat, sheet);
    const upperPar = (UPPER as readonly Cat[]).includes(cat) ? points - 3 * upperFace(cat) : 0;
    return { cat, points, tier: tier(cat, points), upperPar };
  });
  scored.sort((a, b) => {
    if ((a.tier === 9) !== (b.tier === 9)) return a.tier === 9 ? 1 : -1;
    return b.points - a.points || a.tier - b.tier || b.upperPar - a.upperPar || CATS.indexOf(a.cat) - CATS.indexOf(b.cat);
  });
  return scored[0]!.cat;
}

/** 超时的默认行动：还没掷 → 掷；掷过了 → 不再重掷，按 autoScoreCategory 填。 */
export function timeoutCommand(state: GameState, playerId: string): GameCommand | null {
  const turn = state.turns[playerId];
  if (!turn || !pendingActors(state).includes(playerId)) return null;
  if (turn.rolls === 0) return { type: "ROLL" };
  return { type: "SCORE", cat: autoScoreCategory(turn.dice, findPlayer(state, playerId).sheet) };
}

/** 这个人这一步超时：按 timeoutCommand 自动处理，事件里加 TurnTimedOut。 */
export function timeoutTurn(state: GameState, playerId: string): GameState {
  const command = timeoutCommand(state, playerId);
  if (!command) return state;
  const { state: next, events } = runCommand(state, playerId, command, true);
  next.events = [{ type: "TurnTimedOut", player: playerId, action: command.type === "ROLL" ? "roll" : "score" }, ...events];
  next.log = [...(state.log ?? []), { player: playerId, command: { type: "TIMEOUT" } }];
  return next;
}

export interface RedactOptions {
  /** 观战「看全部」：同时模式下也能看到每个人这一轮的骰子和填分。 */
  readonly seeAll?: boolean;
}

/**
 * 发给某个人（viewerId；观战者传空字符串）的对局状态。
 * - 种子、随机数状态、动作序列任何时候都不下发（§9.3）。
 * - 轮流模式没有别的隐藏信息。
 * - 同时模式：这一轮还没结束时，别人的骰子、掷了几次、这一轮填的格子和分数都不下发，只发「已填好 / 还在掷」；
 *   version 换成「这个人看得到的变化」的计数（自己的动作数 + 全场填分次数），别人掷骰、改留下不会让它变，
 *   所以从 version 也推不出别人掷了几次。
 */
export function redactGameForViewer(state: GameState, viewerId: string, options: RedactOptions = {}): GameState {
  const { seed: _seed, rngState: _rngState, log: _log, ...rest } = state;
  if (state.config.mode !== "simultaneous" || options.seeAll) return structuredClone(rest);
  const view = structuredClone(rest) as GameState;
  const hidden = state.phase === "playing" ? view.history.filter((record) => record.round === state.round && record.player !== viewerId) : [];
  view.history = view.history.filter((record) => !hidden.includes(record));
  for (const record of hidden) {
    const player = view.players.find((candidate) => candidate.id === record.player)!;
    delete player.sheet.scores[record.cat];
    if (record.yachtBonus) player.sheet.yachtBonuses -= 1;
  }
  for (const player of view.players) {
    player.score = totalOf(player.sheet);
    if (player.id !== viewerId) delete view.turns[player.id];
  }
  view.events = view.events.filter((event) => {
    switch (event.type) {
      case "Rolled":
      case "Held":
      case "TurnTimedOut":
        return event.player === viewerId;
      case "Scored":
        return event.record.player === viewerId || state.phase === "finished";
      default:
        return true;
    }
  });
  view.version = (state.actionCount[viewerId] ?? 0) + state.scoreCount;
  return view;
}

export function createGame(
  players: readonly NewPlayer[],
  seed = Math.floor(Math.random() * 2 ** 32),
  overrides: Partial<Config> = {},
): GameState {
  const config = defaultConfig(overrides);
  if (players.length < config.minPlayers || players.length > config.maxPlayers) {
    throw new Error(`需要 ${config.minPlayers}–${config.maxPlayers} 位玩家才能开始。`);
  }
  const rng = createRng(seed);
  // 线上直接随机决定先手（§3）
  const startPlayer = rng.int(players.length);
  const state: GameState = {
    config,
    phase: "playing",
    round: 1,
    players: players.map((player, index) => ({ id: player.id, name: player.name, color: index, sheet: emptySheet(), score: 0 })),
    startPlayer,
    currentPlayer: startPlayer,
    turns: {},
    done: {},
    history: [],
    events: [],
    version: 0,
    actionCount: {},
    scoreCount: 0,
    seed,
  };
  if (config.mode === "simultaneous") {
    state.turns = Object.fromEntries(state.players.map((player) => [player.id, freshTurn()]));
    state.events = [{ type: "RoundStarted", round: 1 }];
  } else {
    const first = state.players[startPlayer]!.id;
    state.turns = { [first]: freshTurn() };
    state.events = [{ type: "RoundStarted", round: 1 }, { type: "TurnStarted", player: first }];
  }
  state.rngState = rng.state;
  return state;
}

/** 下半区 / 上半区（给界面和人机）。 */
export { LOWER, UPPER };
