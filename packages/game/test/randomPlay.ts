import {
  CATS,
  FIXED_POINTS,
  applyCommand,
  createGame,
  legalActions,
  pendingActors,
  rawScore,
  redactGameForViewer,
  sheetTotals,
  timeoutTurn,
  type GameCommand,
  type GameState,
  type PlayMode,
} from "../src/index.js";
import { createRng } from "../src/rng.js";

export const GAMES = 300;

/** 随机走到终局，用普通代码查不变量，返回发现的问题（空数组 = 没问题）。 */
export function playRandom(players: number, mode: PlayMode, seed: number): string[] {
  const problems: string[] = [];
  const pick = createRng(seed * 7919 + players);
  let state: GameState = createGame(Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `p${i}` })), seed, { mode });
  const viewVersions = new Map<string, number>();
  const maxSteps = players * 13 * 8;
  let steps = 0;
  while (state.phase === "playing") {
    steps += 1;
    if (steps > maxSteps) {
      problems.push(`超过 ${maxSteps} 步没结束`);
      break;
    }
    const pending = pendingActors(state);
    if (pending.length === 0) {
      problems.push("没结束但没人能动");
      break;
    }
    if (mode === "turns" && pending.length !== 1) problems.push("轮流模式同时有几个人能动");
    const actor = pending[pick.int(pending.length)]!;
    const actions = legalActions(state, actor);
    if (actions.length === 0) {
      problems.push(`${actor} 没有合法行动`);
      break;
    }
    const before = state;
    const roll = pick.next();
    let command: GameCommand;
    const turn = state.turns[actor]!;
    if (turn.rolls > 0 && roll < 0.1) {
      command = { type: "HOLD", held: turn.dice.map(() => pick.next() < 0.5) };
    } else {
      const scores = actions.filter((action) => action.type === "SCORE");
      const rolls = actions.filter((action) => action.type === "ROLL");
      const pool = rolls.length > 0 && (scores.length === 0 || pick.next() < 0.6) ? rolls : scores;
      command = pool[pick.int(pool.length)]!;
    }
    try {
      state = roll > 0.97 ? timeoutTurn(state, actor) : applyCommand(state, actor, command);
    } catch (error) {
      // 托住「全部留下」后不带 reroll 掷骰这种本来就会被拒的情况
      problems.push(`${actor} ${JSON.stringify(command)} 被拒：${(error as Error).message}`);
      break;
    }
    // 不变量
    if (state.version !== before.version + 1) problems.push("version 没有 +1");
    for (const [id, t] of Object.entries(state.turns)) {
      if (t.rolls < 0 || t.rolls > 3) problems.push(`${id} 掷了 ${t.rolls} 次`);
      if (t.dice.length !== 5 || t.held.length !== 5) problems.push("骰子不是 5 颗");
      if (t.rolls > 0 && !t.dice.every((die) => die >= 1 && die <= 6)) problems.push(`骰子点数不对 ${t.dice}`);
      if (t.rolls === 0 && !t.dice.every((die) => die === 0)) problems.push("还没掷就有点数");
    }
    if (state.round < before.round || state.round > 13) problems.push(`round 不对 ${state.round}`);
    const newRecords = state.history.length - before.history.length;
    if (newRecords < 0 || newRecords > 1) problems.push("一步填了不止一格");
    if (newRecords === 1) {
      const record = state.history.at(-1)!;
      const prevSheet = before.players.find((player) => player.id === record.player)!.sheet;
      if (prevSheet.scores[record.cat] !== undefined) problems.push("填了已经填过的格");
      const allSame = record.dice.every((die) => die === record.dice[0]);
      const wild = allSame && prevSheet.scores.LY !== undefined;
      if (record.wild !== wild) problems.push("百搭标记不对");
      const expected = wild && FIXED_POINTS[record.cat] !== undefined && record.cat !== "LY" ? FIXED_POINTS[record.cat]! : rawScore(record.dice, record.cat);
      if (record.points !== expected) problems.push(`${record.cat} ${record.dice} 得 ${record.points}，应为 ${expected}`);
      if (record.yachtBonus !== (wild && prevSheet.scores.LY === 50)) problems.push("快艇奖励不对");
      if (wild) {
        const face = record.dice[0]!;
        const upper = CATS[face - 1]!;
        if (prevSheet.scores[upper] === undefined && record.cat !== upper) problems.push("百搭没先填对应的上半区");
      }
    }
    for (const player of state.players) {
      if (player.score !== sheetTotals(player.sheet).total) problems.push("score 和计分表对不上");
      const filled = CATS.filter((cat) => player.sheet.scores[cat] !== undefined).length;
      const recorded = state.history.filter((record) => record.player === player.id).length;
      if (filled !== recorded) problems.push("填格数和记录数对不上");
      if (filled > 13) problems.push("填超过 13 格");
    }
    if (mode === "simultaneous") {
      // 填分的那一步查每个视角，其余步骤随机抽一个视角（全查太慢）
      const viewers = [...state.players.map((player) => player.id), ""];
      const checked = newRecords === 1 ? viewers : [viewers[pick.int(viewers.length)]!];
      for (const viewer of checked) {
        const view = redactGameForViewer(state, viewer);
        if (view.seed !== undefined || view.rngState !== undefined || view.log !== undefined) problems.push("下发了种子");
        if (state.phase === "playing") {
          for (const id of Object.keys(view.turns)) if (id !== viewer) problems.push(`${viewer} 看到了 ${id} 的骰子`);
          for (const record of view.history) {
            if (record.round === state.round && record.player !== viewer) problems.push(`${viewer} 看到了 ${record.player} 这一轮的填分`);
          }
        }
        const last = viewVersions.get(viewer) ?? -1;
        if (view.version < last) problems.push(`${viewer} 看到的 version 倒退`);
        viewVersions.set(viewer, view.version);
      }
    }
    if (problems.length > 0) break;
  }
  if (problems.length === 0) {
    if (state.phase !== "finished") problems.push("没打完");
    if (state.history.length !== players * 13) problems.push(`一共填了 ${state.history.length} 格`);
    for (const player of state.players) {
      if (CATS.some((cat) => player.sheet.scores[cat] === undefined)) problems.push("终局有空格");
      if (state.finalResult!.totals[player.id]!.total !== player.score) problems.push("结算总分不对");
    }
    const best = Math.max(...state.players.map((player) => player.score));
    const winners = state.players.filter((player) => player.score === best).map((player) => player.id);
    if (JSON.stringify(winners) !== JSON.stringify(state.finalResult!.winners)) problems.push("赢家不对");
  }
  return problems;
}

