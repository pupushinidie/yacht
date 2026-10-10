import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import {
  legalActions,
  type AckResponse,
  type ClientToServerEvents,
  type GameCommand,
  type LobbyRoomSnapshot,
  type PlayMode,
  type ServerToClientEvents,
} from "@yacht/game";

// 每一步 400 ms 超时、人机立刻行动（服务端在导入时读）。
process.env.TURN_MS = "400";
process.env.BOT_DELAY_SCALE = "0";

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const clients = new Set<TestSocket>();
const latest = new Map<TestSocket, LobbyRoomSnapshot>();
const received = new Map<TestSocket, LobbyRoomSnapshot[]>();
let serverUrl = "";
let serverIo: typeof import("../src/index.js").io;
let hooks: typeof import("../src/index.js").testHooks;
let seq = 0;

function connect(): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const client: TestSocket = createClient(serverUrl, { transports: ["websocket"], reconnection: false });
    clients.add(client);
    received.set(client, []);
    client.on("room:updated", (room) => {
      latest.set(client, room);
      received.get(client)!.push(room);
    });
    client.once("connect", () => resolve(client));
    client.once("connect_error", reject);
  });
}
const nick = (prefix: string) => `${prefix}${(seq += 1)}`;
const call = <T>(send: (ack: (response: AckResponse<T>) => void) => void) => new Promise<AckResponse<T>>((resolve) => send(resolve));
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const seat = (client: TestSocket) => latest.get(client)?.members.find((member) => member.id === client.id)?.playerId ?? "";
const command = (client: TestSocket, cmd: GameCommand) => call<LobbyRoomSnapshot>((ack) => client.emit("game:command", cmd, ack));

async function create(client: TestSocket, name: string, mode?: PlayMode, capacity = 4): Promise<LobbyRoomSnapshot> {
  const response = await call<LobbyRoomSnapshot>((ack) => client.emit("room:create", { name, capacity, ...(mode ? { mode } : {}) } as never, ack));
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

function updateWhere(client: TestSocket, test: (room: LobbyRoomSnapshot) => boolean, timeoutMs = 10_000): Promise<LobbyRoomSnapshot> {
  return new Promise((resolve, reject) => {
    const current = latest.get(client);
    if (current && test(current)) return resolve(current);
    const timer = setTimeout(() => {
      client.off("room:updated", handler);
      reject(new Error("等不到想要的房间状态"));
    }, timeoutMs);
    const handler = (room: LobbyRoomSnapshot) => {
      if (!test(room)) return;
      clearTimeout(timer);
      client.off("room:updated", handler);
      resolve(room);
    };
    client.on("room:updated", handler);
  });
}

/** 两人房：房主建、客人用房间码加入。 */
async function pair(mode?: PlayMode) {
  const host = await connect();
  const guest = await connect();
  const hostName = nick("房主");
  const guestName = nick("客人");
  const room = await create(host, hostName, mode);
  const joined = await call<LobbyRoomSnapshot>((ack) => guest.emit("room:join", { name: guestName, code: room.code }, ack));
  if (!joined.ok) throw new Error(joined.error);
  return { host, guest, code: room.code, hostName, guestName };
}

/** 能动就动：掷一次、再掷一次（只掷 0 号）、填第一个能填的格。返回停止函数。 */
function autoplay(client: TestSocket): () => void {
  let sentFor = "";
  const handler = (room: LobbyRoomSnapshot) => {
    const game = room.game;
    if (!game || game.phase === "finished") return;
    const actions = legalActions(game, seat(client));
    const key = `${game.version}`;
    if (actions.length === 0 || sentFor === key) return;
    sentFor = key;
    const rolls = game.turns[seat(client)]?.rolls ?? 0;
    const next = rolls === 1 ? { type: "ROLL" as const, reroll: [0] } : actions.find((action) => action.type === "SCORE") ?? actions[0]!;
    client.emit("game:command", next, () => {});
  };
  client.on("room:updated", handler);
  const current = latest.get(client);
  if (current) handler(current);
  return () => client.off("room:updated", handler);
}

describe("服务器：房间流程", () => {
  beforeAll(async () => {
    const serverModule = await import("../src/index.js");
    serverIo = serverModule.io;
    hooks = serverModule.testHooks;
    await new Promise<void>((resolve, reject) => {
      serverModule.httpServer.once("error", reject);
      serverModule.httpServer.listen(0, resolve);
    });
    serverUrl = `http://127.0.0.1:${(serverModule.httpServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    for (const client of clients) client.disconnect();
    await new Promise<void>((resolve) => serverIo.close(() => resolve()));
  });

  it("建房 → 加入 → 开局 → 掷骰、留下、重掷、填分都走得通 → 打完 → 再来一局", async () => {
    const { host, guest, code } = await pair();
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    hooks.reseed(code, 42);
    await delay(50);
    const started = await updateWhere(host, (room) => room.game?.round === 1 && room.game.version === 0);
    const first = started.game!.players[started.game!.currentPlayer]!.id;
    const mover = seat(host) === first ? host : guest;
    const other = mover === host ? guest : host;
    // 不是自己的回合：拒绝
    expect((await command(other, { type: "ROLL" })).ok).toBe(false);
    // 还没掷就填分：拒绝
    expect((await command(mover, { type: "SCORE", cat: "LCH" })).ok).toBe(false);
    const rolled = await command(mover, { type: "ROLL" });
    expect(rolled.ok).toBe(true);
    const dice = rolled.ok ? rolled.data.game!.turns[first]!.dice : [];
    expect(dice.every((die) => die >= 1 && die <= 6)).toBe(true);
    // 对手看得到骰子（轮流模式全公开）
    await updateWhere(other, (room) => room.game!.turns[first]?.rolls === 1);
    expect(latest.get(other)!.game!.turns[first]!.dice).toEqual(dice);
    expect((await command(mover, { type: "HOLD", held: [true, true, false, false, false] })).ok).toBe(true);
    await updateWhere(other, (room) => room.game!.turns[first]?.held[0] === true);
    const reroll = await command(mover, { type: "ROLL" });
    expect(reroll.ok && reroll.data.game!.turns[first]!.dice.slice(0, 2)).toEqual(dice.slice(0, 2));
    expect((await command(mover, { type: "ROLL", reroll: [] })).ok).toBe(false);
    expect((await command(mover, { type: "SCORE", cat: "LCH" })).ok).toBe(true);
    const afterScore = await updateWhere(other, (room) => room.game!.history.length === 1);
    expect(afterScore.game!.players[afterScore.game!.currentPlayer]!.id).toBe(seat(other));
    // 种子和随机数状态不下发
    expect(afterScore.game!.seed).toBeUndefined();
    expect(afterScore.game!.rngState).toBeUndefined();

    const stops = [autoplay(host), autoplay(guest)];
    const finished = await updateWhere(host, (room) => room.game?.phase === "finished", 30_000);
    stops.forEach((stop) => stop());
    expect(finished.game!.history).toHaveLength(26);
    expect(finished.game!.finalResult!.winners.length).toBeGreaterThan(0);
    expect(finished.rematch).toBeDefined();
    expect((await call<void>((ack) => host.emit("room:rematch", true, ack))).ok).toBe(true);
    expect((await call<void>((ack) => guest.emit("room:rematch", true, ack))).ok).toBe(true);
    const again = await updateWhere(host, (room) => room.game?.phase === "playing" && room.game.history.length === 0);
    expect(again.game!.round).toBe(1);
  }, 40_000);

  it("一个人也能开局（挑战自己的最高分），打完 13 轮", async () => {
    const solo = await connect();
    await create(solo, nick("独自"));
    expect((await call<LobbyRoomSnapshot>((ack) => solo.emit("room:start", ack))).ok).toBe(true);
    const stop = autoplay(solo);
    const done = await updateWhere(solo, (room) => room.game?.phase === "finished", 20_000);
    stop();
    expect(done.game!.players).toHaveLength(1);
    expect(done.game!.history).toHaveLength(13);
  }, 25_000);

  it("只有房主能改玩法；开局后不能改；同时掷的房间开出来是同时模式", async () => {
    const { host, guest } = await pair();
    expect((await call<void>((ack) => guest.emit("room:mode", "simultaneous", ack))).ok).toBe(false);
    expect((await call<void>((ack) => host.emit("room:mode", "bogus" as PlayMode, ack))).ok).toBe(false);
    expect((await call<void>((ack) => host.emit("room:mode", "simultaneous", ack))).ok).toBe(true);
    await updateWhere(guest, (room) => room.mode === "simultaneous");
    const started = await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack));
    expect(started.ok && started.data.game!.config.mode).toBe("simultaneous");
    expect((await call<void>((ack) => host.emit("room:mode", "turns", ack))).ok).toBe(false);
  });

  it("断线后用原昵称和房间码回到原座位", async () => {
    const { host, guest, code, guestName } = await pair();
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    await updateWhere(guest, (room) => room.game !== undefined);
    const guestSeat = seat(guest);
    guest.disconnect();
    await updateWhere(host, (room) => room.members.some((member) => member.playerId === guestSeat && !member.connected));
    const back = await connect();
    const rejoined = await call<LobbyRoomSnapshot>((ack) => back.emit("room:join", { name: guestName, code }, ack));
    expect(rejoined.ok && rejoined.data.members.find((member) => member.id === back.id)?.playerId).toBe(guestSeat);
    expect(rejoined.ok && rejoined.data.game).toBeDefined();
  });

  it("超时：还没掷 → 自动掷；掷过 → 自动填分（每个决定各自计时）", async () => {
    const { host, guest } = await pair();
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    const room = await updateWhere(host, (snapshot) => snapshot.game !== undefined);
    expect(room.turnRemainingMs).toBeGreaterThan(0);
    const first = room.game!.players[room.game!.currentPlayer]!.id;
    const rolled = await updateWhere(host, (snapshot) => snapshot.game!.turns[first]?.rolls === 1);
    expect(rolled.game!.events[0]).toEqual({ type: "TurnTimedOut", player: first, action: "roll" });
    expect(rolled.turnRemainingMs).toBeGreaterThan(200);
    const scored = await updateWhere(host, (snapshot) => snapshot.game!.history.length === 1);
    expect(scored.game!.history[0]).toMatchObject({ player: first, auto: true });
    expect(scored.game!.events[0]).toEqual({ type: "TurnTimedOut", player: first, action: "score" });
    void guest;
  });

  it("改「留下」不重置倒计时（计时 key 只在掷骰、填分时变）", async () => {
    const { host, guest, code } = await pair();
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    hooks.reseed(code, 7);
    await delay(50);
    const room = await updateWhere(host, (snapshot) => snapshot.game?.version === 0);
    const first = room.game!.players[room.game!.currentPlayer]!.id;
    const mover = seat(host) === first ? host : guest;
    expect((await command(mover, { type: "ROLL" })).ok).toBe(true);
    await delay(150);
    const held = await command(mover, { type: "HOLD", held: [true, false, false, false, false] });
    expect(held.ok && held.data.turnRemainingMs!).toBeLessThan(300);
    // 还是会在原来的时间点超时填分（不是从 HOLD 那一刻重新算）
    const scored = await updateWhere(mover, (snapshot) => snapshot.game!.history.length === 1, 2_000);
    expect(scored.game!.history[0]!.auto).toBe(true);
  });

  it("同时模式：各掷各的、互不等待；别人掷骰时我收不到任何推送；一轮填完一起亮出", async () => {
    const { host, guest } = await pair("simultaneous");
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    await updateWhere(guest, (room) => room.game !== undefined);
    await updateWhere(host, (room) => room.game !== undefined);
    const hostSeat = seat(host);
    const guestSeat = seat(guest);
    const before = received.get(guest)!.length;
    expect((await command(host, { type: "ROLL" })).ok).toBe(true);
    expect((await command(host, { type: "HOLD", held: [true, false, false, false, false] })).ok).toBe(true);
    expect((await command(host, { type: "ROLL" })).ok).toBe(true);
    await delay(100);
    expect(received.get(guest)!.length).toBe(before);
    // 两人同时都能动
    expect((await command(guest, { type: "ROLL" })).ok).toBe(true);
    const hostView = latest.get(host)!.game!;
    expect(hostView.turns[guestSeat]).toBeUndefined();
    // 房主填分：客人收到「已填好」，看不到填了哪格
    const scored = await command(host, { type: "SCORE", cat: "LCH" });
    expect(scored.ok).toBe(true);
    const doneView = await updateWhere(guest, (room) => room.game!.done[hostSeat] === true);
    expect(doneView.game!.history).toHaveLength(0);
    expect(doneView.game!.players.find((player) => player.id === hostSeat)!.sheet.scores.LCH).toBeUndefined();
    expect(JSON.stringify(doneView)).not.toContain(JSON.stringify(scored.ok ? scored.data.game!.history[0]!.dice : []));
    // 已填的人不能再掷
    expect((await command(host, { type: "ROLL" })).ok).toBe(false);
    expect((await command(guest, { type: "SCORE", cat: "U1" })).ok).toBe(true);
    const revealed = await updateWhere(host, (room) => room.game!.round === 2);
    expect(revealed.game!.history.map((record) => record.player).sort()).toEqual([hostSeat, guestSeat].sort());
    expect(revealed.game!.events.some((event) => event.type === "RoundRevealed")).toBe(true);
  });

  it("同时模式：倒计时只发自己的；一个人超时不影响另一个人", async () => {
    const { host, guest } = await pair("simultaneous");
    expect((await call<LobbyRoomSnapshot>((ack) => host.emit("room:start", ack))).ok).toBe(true);
    await updateWhere(guest, (room) => room.game !== undefined);
    await delay(200);
    expect((await command(guest, { type: "ROLL" })).ok).toBe(true);
    // 房主没动：400 ms 到点自动掷；客人刚掷过，自己的倒计时是新的
    const hostRolled = await updateWhere(host, (room) => room.game!.turns[seat(host)]?.rolls === 1);
    expect(hostRolled.game!.events[0]).toMatchObject({ type: "TurnTimedOut", action: "roll" });
    const guestView = latest.get(guest)!;
    expect(guestView.game!.turns[seat(host)]).toBeUndefined();
  });
});
