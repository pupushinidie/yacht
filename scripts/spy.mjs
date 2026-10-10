// 抓包：连上真实服务器，检查发给别人的数据里没有不该看到的东西（先起服务器，比如 npm run dev 或 npm run start）。
//   node scripts/spy.mjs            → 同时掷：A、B 两个玩家 + 观战 C，打 3 轮
//   SERVER_URL=http://localhost:3122 node scripts/spy.mjs
// 检查：
//   1. 任何人收到的数据里都没有 seed / rngState / log；
//   2. 同时掷：A 掷骰、改留下时，B 和 C 一条推送都收不到；
//   3. B、C 收到的每一份里：没有 A 这一轮的骰子（turns）、没有 A 这一轮填的格（history、计分表）；
//      A 掷出的每一把骰子（5 个数连在一起）都不出现在 B、C 收到的原始 JSON 里，直到这一轮亮出；
//   4. 轮流掷：观战和对手看得到当前玩家的骰子（公开），但同样没有种子。
import { io } from "socket.io-client";

const URL = process.env.SERVER_URL ?? "http://localhost:3022";
const PATH = process.env.SOCKET_PATH ?? "/socket.io";
const problems = [];
const tag = Math.random().toString(36).slice(2, 6);

function client(label) {
  const socket = io(URL, { path: PATH, transports: ["websocket"], reconnection: false });
  const state = { socket, label, latest: null, raw: [] };
  socket.on("room:updated", (room) => {
    state.latest = room;
    state.raw.push(JSON.stringify(room));
  });
  state.emit = (event, ...args) => new Promise((resolve) => socket.emit(event, ...args, resolve));
  state.ready = new Promise((resolve) => socket.once("connect", resolve));
  return state;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seatOf = (who) => who.latest?.members.find((member) => member.id === who.socket.id)?.playerId;

function checkServerOnly(who) {
  for (const raw of who.raw) {
    for (const key of ['"seed"', '"rngState"', '"log"']) if (raw.includes(key)) problems.push(`${who.label} 收到了 ${key}`);
  }
}

async function simultaneous() {
  const a = client("A"), b = client("B"), c = client("C观战");
  await Promise.all([a.ready, b.ready, c.ready]);
  const created = await a.emit("room:create", { name: `间谍A${tag}`, capacity: 2, mode: "simultaneous" });
  if (!created.ok) throw new Error(created.error);
  const code = created.data.code;
  if (!(await b.emit("room:join", { name: `间谍B${tag}`, code })).ok) throw new Error("B 加不进去");
  if (!(await c.emit("room:join", { name: `间谍C${tag}`, code, spectate: true })).ok) throw new Error("C 进不来观战");
  await sleep(100);
  if (!(await a.emit("room:start")).ok) throw new Error("开不了局");
  await sleep(200);
  const aSeat = seatOf(a), bSeat = seatOf(b);
  for (let round = 1; round <= 3; round += 1) {
    const before = { b: b.raw.length, c: c.raw.length };
    const aDice = [];
    for (const command of [{ type: "ROLL" }, { type: "HOLD", held: [true, true, false, false, false] }, { type: "ROLL" }, { type: "ROLL", reroll: [0] }]) {
      const result = await a.emit("game:command", command);
      if (!result.ok) throw new Error(`A ${command.type} 失败：${result.error}`);
      aDice.push(result.data.game.turns[aSeat].dice.join(","));
    }
    await sleep(150);
    if (b.raw.length !== before.b) problems.push(`第 ${round} 轮 A 掷骰时 B 收到了 ${b.raw.length - before.b} 条推送`);
    if (c.raw.length !== before.c) problems.push(`第 ${round} 轮 A 掷骰时 C 收到了 ${c.raw.length - before.c} 条推送`);
    const scored = await a.emit("game:command", { type: "SCORE", cat: ["LCH", "U1", "U2"][round - 1] });
    if (!scored.ok) throw new Error(scored.error);
    await sleep(150);
    // A 填完、B 还没动：B 和 C 收到的东西里不能有 A 这一轮的骰子和格子
    for (const who of [b, c]) {
      const game = who.latest.game;
      if (game.turns[aSeat]) problems.push(`第 ${round} 轮 ${who.label} 看到了 A 的 turns`);
      if (game.history.some((record) => record.player === aSeat && record.round === game.round)) problems.push(`第 ${round} 轮 ${who.label} 看到了 A 这一轮的填分`);
      const aSheet = game.players.find((player) => player.id === aSeat).sheet.scores;
      if (Object.keys(aSheet).length !== round - 1) problems.push(`第 ${round} 轮 ${who.label} 看到 A 的计分表有 ${Object.keys(aSheet).length} 格`);
      if (!game.done[aSeat]) problems.push(`第 ${round} 轮 ${who.label} 没看到 A「已填好」`);
      for (const raw of who.raw.slice(before[who === b ? "b" : "c"])) {
        for (const dice of aDice) if (raw.includes(`[${dice}]`)) problems.push(`第 ${round} 轮 ${who.label} 的原始数据里出现了 A 的骰子 [${dice}]`);
      }
    }
    // B 打完这一轮 → 一起亮出
    const bBefore = a.raw.length;
    if (!(await b.emit("game:command", { type: "ROLL" })).ok) throw new Error("B 掷不了");
    await sleep(100);
    if (a.raw.length !== bBefore) problems.push(`第 ${round} 轮 B 掷骰时 A 收到了推送`);
    if (!(await b.emit("game:command", { type: "SCORE", cat: ["LCH", "U1", "U2"][round - 1] })).ok) throw new Error("B 填不了");
    await sleep(150);
    for (const who of [a, b, c]) {
      const game = who.latest.game;
      if (game.round !== round + 1) problems.push(`第 ${round} 轮结束后 ${who.label} 的 round 是 ${game.round}`);
      if (game.history.filter((record) => record.round === round).length !== 2) problems.push(`第 ${round} 轮结束后 ${who.label} 没看到两人的结果`);
    }
    void bSeat;
  }
  for (const who of [a, b, c]) checkServerOnly(who);
  console.log(`同时掷：A 收到 ${a.raw.length} 条、B ${b.raw.length} 条、观战 ${c.raw.length} 条`);
  await a.emit("room:dissolve");
  for (const who of [a, b, c]) who.socket.disconnect();
}

async function turns() {
  const a = client("A"), b = client("B"), c = client("C观战");
  await Promise.all([a.ready, b.ready, c.ready]);
  const created = await a.emit("room:create", { name: `间谍D${tag}`, capacity: 2 });
  const code = created.data.code;
  await b.emit("room:join", { name: `间谍E${tag}`, code });
  await c.emit("room:join", { name: `间谍F${tag}`, code, spectate: true });
  await sleep(100);
  await a.emit("room:start");
  await sleep(200);
  const current = a.latest.game.players[a.latest.game.currentPlayer].id;
  const mover = seatOf(a) === current ? a : b;
  const rolled = await mover.emit("game:command", { type: "ROLL" });
  await sleep(150);
  const dice = rolled.data.game.turns[current].dice.join(",");
  for (const who of [a, b, c]) {
    if (who.latest.game.turns[current]?.dice.join(",") !== dice) problems.push(`轮流掷：${who.label} 没看到当前玩家的骰子`);
    checkServerOnly(who);
  }
  console.log(`轮流掷：A 收到 ${a.raw.length} 条、B ${b.raw.length} 条、观战 ${c.raw.length} 条`);
  await a.emit("room:dissolve");
  for (const who of [a, b, c]) who.socket.disconnect();
}

try {
  await simultaneous();
  await turns();
} catch (error) {
  problems.push(`出错：${error.message}`);
}
if (problems.length > 0) {
  console.log("发现问题：");
  for (const problem of problems) console.log(" -", problem);
  process.exit(1);
}
console.log("抓包通过：没有泄露（种子、随机数状态、动作序列都没下发；同时掷时别人的骰子、填分和推送次数都看不到）");
process.exit(0);
