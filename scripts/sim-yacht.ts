// 人机强度模拟：npx tsx scripts/sim-yacht.ts [局数，默认 400]
// 基线：随机（从合法行动里随机挑，包括随机重掷和随机停）、贪心（不重掷，掷一次就填当前得分最高的格）、
// 留多（留下最多的那种点数、其余重掷到 3 次，再填得分最高的格；一眼能想到的玩法）。
import {
  applyCommand,
  botCommand,
  createGame,
  legalActions,
  legalCategories,
  redactGameForViewer,
  scoreFor,
  type GameCommand,
  type GameState,
} from "../packages/game/src/index.js";

type Bot = (state: GameState, id: string) => GameCommand;
let seedState = 12345;
const rand = () => (seedState = (seedState * 1103515245 + 12345) % 2147483648) / 2147483648;

const random: Bot = (state, id) => {
  const actions = legalActions(state, id);
  return actions[Math.floor(rand() * actions.length)]!;
};
const bestPoints = (state: GameState, id: string): GameCommand => {
  const turn = state.turns[id]!;
  const sheet = state.players.find((player) => player.id === id)!.sheet;
  const cats = legalCategories(turn.dice, sheet);
  let best = cats[0]!;
  for (const cat of cats) if (scoreFor(turn.dice, cat, sheet) > scoreFor(turn.dice, best, sheet)) best = cat;
  return { type: "SCORE", cat: best };
};
const greedy: Bot = (state, id) => (state.turns[id]!.rolls === 0 ? { type: "ROLL" } : bestPoints(state, id));
const keepMost: Bot = (state, id) => {
  const turn = state.turns[id]!;
  if (turn.rolls === 0) return { type: "ROLL" };
  if (turn.rolls < 3) {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const die of turn.dice) counts[die]! += 1;
    let face = 1;
    for (let f = 1; f <= 6; f += 1) if (counts[f]! > counts[face]! || (counts[f] === counts[face] && f > face)) face = f;
    const reroll = turn.dice.flatMap((die, index) => (die === face ? [] : [index]));
    if (reroll.length > 0) return { type: "ROLL", reroll };
  }
  return bestPoints(state, id);
};
const times: number[] = [];
const mine: Bot = (state, id) => {
  const view = redactGameForViewer(state, id);
  const t0 = performance.now();
  const command = botCommand(view, id)!;
  times.push(performance.now() - t0);
  return command;
};

function play(bots: Bot[], seed: number, mode: "turns" | "simultaneous" = "turns"): number[] {
  let state = createGame(bots.map((_, i) => ({ id: `p${i}`, name: `b${i}` })), seed, { mode });
  let steps = 0;
  while (state.phase === "playing") {
    if ((steps += 1) > 13 * bots.length * 6) throw new Error("步数超限");
    const pending = state.config.mode === "turns" ? [state.players[state.currentPlayer]!.id] : state.players.filter((p) => !state.done[p.id]).map((p) => p.id);
    const id = pending[Math.floor(rand() * pending.length)]!;
    const command = bots[Number(id.slice(1))]!(state, id);
    if (!legalActions(state, id).some((action) => JSON.stringify(action) === JSON.stringify(command))) throw new Error(`非法行动 ${JSON.stringify(command)}`);
    state = applyCommand(state, id, command);
  }
  return state.players.map((player) => player.score);
}

const N = Number(process.argv[2] ?? 400);
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

function solo(name: string, bot: Bot, n: number) {
  const scores: number[] = [];
  for (let i = 0; i < n; i += 1) scores.push(play([bot], 500 + i)[0]!);
  scores.sort((a, b) => a - b);
  console.log(`单人 ${name}: 平均 ${mean(scores).toFixed(1)}  中位 ${scores[Math.floor(n / 2)]}  最低 ${scores[0]}  最高 ${scores.at(-1)}`);
}

function duel(name: string, a: Bot, b: Bot, n: number) {
  let wins = 0;
  const aScores: number[] = [];
  const bScores: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const swap = i % 2 === 1;
    const scores = play(swap ? [b, a] : [a, b], 9000 + i);
    const mineScore = scores[swap ? 1 : 0]!;
    const other = scores[swap ? 0 : 1]!;
    aScores.push(mineScore);
    bScores.push(other);
    wins += mineScore > other ? 1 : mineScore === other ? 0.5 : 0;
  }
  console.log(`2 人 ${name}: 胜率 ${((100 * wins) / n).toFixed(1)}%  平均分 ${mean(aScores).toFixed(1)} 对 ${mean(bScores).toFixed(1)}`);
}

function table(name: string, others: Bot, players: number, n: number) {
  const ranks: number[] = [];
  let wins = 0;
  for (let i = 0; i < n; i += 1) {
    const seat = i % players;
    const bots = Array.from({ length: players }, (_, index) => (index === seat ? mine : others));
    const scores = play(bots, 20000 + i);
    const my = scores[seat]!;
    ranks.push(1 + scores.filter((score) => score > my).length);
    if (scores.every((score) => score <= my)) wins += 1 / scores.filter((score) => score === my).length;
  }
  console.log(`${players} 人（人机 + ${players - 1} 个${name}）: 人机平均名次 ${mean(ranks).toFixed(2)}（公平值 ${((players + 1) / 2).toFixed(1)}）  第一名 ${((100 * wins) / n).toFixed(1)}%（公平值 ${(100 / players).toFixed(1)}%）`);
}

solo("随机", random, N);
solo("贪心", greedy, N);
solo("留多", keepMost, N);
solo("人机", mine, N);
duel("人机 对 随机", mine, random, N);
duel("人机 对 贪心", mine, greedy, N);
duel("人机 对 留多", mine, keepMost, N);
table("留多", keepMost, 4, N);
table("留多", keepMost, 6, Math.floor(N / 2));
times.sort((a, b) => a - b);
console.log(`人机每步耗时：平均 ${mean(times).toFixed(2)} ms  p99 ${times[Math.floor(times.length * 0.99)]!.toFixed(2)} ms  最坏 ${times.at(-1)!.toFixed(2)} ms（${times.length} 步）`);
