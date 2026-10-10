/**
 * 预览页（开发时打开 /preview.html）：用规则包的预览局面工厂造局面，渲染真正的牌桌 / 等候房间，不用真打一局去等。
 *
 * 参数：
 *   ?s=场景名（规则包的 SCENE_NAMES，加上下面 UI_SCENES、ROOM_SCENES 里的；home 是真首页）
 *   &v=从谁的座位看（p0…，空 = 观战；默认 p0）
 *   &offline=p1 &bots=p1,p2 &auto=p0（托管中的座位）&t=倒计时毫秒（不给 = 30000，空 = 不显示）&all=1（观战看全部）
 *   &err=文字（状态条上的出错提示，比如非法操作）
 *   &from=场景名（先显示这个场景，0.8 秒后换成 s，用来看掷骰、快艇庆祝、划掉、奖励这些动画）
 *   &chat=1（聊天里放几条示例消息）&panel=chat|menu|rules（打开抽屉 / 弹窗）
 *   &rematch=p1（结算时已同意再来一局的座位）&nav=0（不显示底部的场景导航，截图用）
 *
 * 界面阶段维护；教程要加场景就往 UI_SCENES / ROOM_SCENES 里加，不要删别人的。生产构建只打包 index.html，不带这个页面。
 */
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  DEFAULT_ROOM_ACCESS,
  SCENE_NAMES,
  buildState,
  makeScene,
  redactGameForViewer,
  sampleSheet,
  type Capacity,
  type GameState,
  type LobbyMember,
  type LobbyRoomSnapshot,
  type PlayMode,
  type SceneName,
} from "@yacht/game";
import App, { Brand, ConnectionStatus, DeckBackdrop, RoomView } from "./App.js";
import { useConfirm } from "./confirm.js";
import GameBoard from "./GameBoard.js";
import GameRules from "./GameRules.js";
import RoomChat from "./RoomChat.js";
import { socket } from "./socket.js";
import { applyTheme, readTheme, ThemeToggle, useTheme } from "./theme.js";
import { useVoice } from "./voice.js";
import { TutorialInvite } from "./tutorial/Invite.js";
import "./styles.css";
import "./app-pixel.css";
import "./yacht.css";
import "./theme-day.css";

applyTheme(readTheme());

/** 界面阶段补的牌桌局面（规则包的 SCENE_NAMES 之外）。 */
const UI_SCENES: Record<string, { title: string; build: () => GameState }> = {
  "yacht-roll": {
    title: "掷出快艇（配 from=rolled 看庆祝动画）",
    build: () => makeScene("yacht", { events: [{ type: "Rolled", player: "p0", dice: [6, 6, 6, 6, 6], rerolled: [0, 1, 2, 3, 4], rolls: 2 }] }),
  },
  "scratched": {
    title: "刚划掉大顺（配 from=scratch 看划掉动画）",
    build: () => {
      const state = buildState({ players: 2, sheets: [{ scores: { U2: 6, U3: 9, U4: 12, U5: 15, U6: 18, L3K: 22, LFH: 25, LSS: 30, LCH: 23, LY: 50, LLS: 0 } }, sampleSheet(10, 1)], current: 1, round: 11, dice: [0, 0, 0, 0, 0], rolls: 0 });
      const record = { player: "p0", round: 11, cat: "LLS" as const, points: 0, yachtBonus: false, wild: false, upperBonus: false, dice: [1, 2, 2, 4, 6] };
      state.history.push(record);
      state.events = [{ type: "Scored", record }, { type: "TurnStarted", player: "p1" }];
      return state;
    },
  },
  "bonus-got": {
    title: "刚拿到上半区奖励（配 from=bonus-near 看宝箱）",
    build: () => {
      const state = buildState({ players: 2, sheets: [{ scores: { U1: 3, U2: 6, U3: 9, U4: 12, U5: 15, U6: 18, L3K: 22, LCH: 20 } }, sampleSheet(7, 1)], current: 1, round: 8 });
      const record = { player: "p0", round: 8, cat: "U6" as const, points: 18, yachtBonus: false, wild: false, upperBonus: true, dice: [6, 6, 6, 2, 5] };
      state.history.push(record);
      state.events = [{ type: "Scored", record }, { type: "TurnStarted", player: "p1" }];
      return state;
    },
  },
  "yacht-bonus": {
    title: "又掷出快艇填进四点格：+100（配 from=wild-upper）",
    build: () => {
      const state = buildState({ players: 2, sheets: [{ scores: { LY: 50, U1: 3, U6: 18, LSS: 30, U4: 20 }, yachtBonuses: 1 }, sampleSheet(5, 1)], current: 1, round: 6 });
      const record = { player: "p0", round: 6, cat: "U4" as const, points: 20, yachtBonus: true, wild: true, upperBonus: false, dice: [4, 4, 4, 4, 4] };
      state.history.push(record);
      state.events = [{ type: "Scored", record }, { type: "TurnStarted", player: "p1" }];
      return state;
    },
  },
  "six-mine": {
    title: "6 人局，轮到你、掷了 2 次（最多人数的牌桌）",
    build: () => makeScene("six-players", { current: 0, startPlayer: 0, round: 8, sheets: [0, 1, 2, 3, 4, 5].map((index) => sampleSheet(7, index)), dice: [5, 5, 2, 5, 6], rolls: 2, held: [true, true, false, true, false] }),
  },
  "simul-mine-done": {
    title: "同时掷：你填好了，等另外两人",
    build: () => makeScene("simul-waiting", { done: [0], doneCats: ["LFH"] }),
  },
  // 教程、验收要加的场景往下加
};

/** 等候房间的局面（status = waiting）。 */
const ROOM_SCENES: Record<string, { title: string; members: { name: string; bot?: boolean; connected?: boolean }[]; capacity: Capacity; viewer?: number; mode?: PlayMode }> = {
  room1: { title: "等候房间：只有房主一个人", members: [{ name: "阿宝" }], capacity: 4 },
  roomBots: { title: "等候房间：房主加了 2 个人机", members: [{ name: "阿宝" }, { name: "咕噜一号", bot: true }, { name: "咕噜二号", bot: true }], capacity: 4 },
  roomFull: {
    title: "等候房间：6 人满员（含 3 个人机），同时掷",
    members: [{ name: "阿宝" }, { name: "小王" }, { name: "咕噜一号", bot: true }, { name: "阿杰", connected: false }, { name: "咕噜二号", bot: true }, { name: "咕噜三号", bot: true }],
    capacity: 6,
    mode: "simultaneous",
  },
  roomGuest: { title: "等候房间：你是客人（不是房主）", members: [{ name: "小王" }, { name: "阿宝" }, { name: "阿杰" }], capacity: 4, viewer: 1 },
};

const params = new URLSearchParams(window.location.search);
const list = (key: string) => (params.get(key) ?? "").split(",").filter(Boolean);
const ALL = [...SCENE_NAMES, ...Object.keys(UI_SCENES), ...Object.keys(ROOM_SCENES), "home"];
const requested = params.get("s") ?? "rolled";
const name = ALL.includes(requested) ? requested : "rolled";
const viewer = params.has("v") ? params.get("v")! : "p0";
const timer = params.get("t");
const showNav = params.get("nav") !== "0";
const sockId = (seat: string) => `sock-${seat}`;

function buildGame(scene: string): GameState {
  if (scene in UI_SCENES) return UI_SCENES[scene]!.build();
  return makeScene(scene as SceneName);
}

const SAMPLE_CHAT = [
  { id: "c1", senderId: sockId("p1"), name: "咕噜一号", message: "这把要冲快艇了", createdAt: new Date().toISOString() },
  { id: "c2", senderId: sockId("p0"), name: "你", message: "冲！", createdAt: new Date().toISOString() },
  { id: "c3", senderId: "sock-watch", name: "路人", message: "六点格还空着呢", createdAt: new Date().toISOString(), spectator: true },
];

const BOT_NAMES = ["咕噜一号", "咕噜二号", "咕噜三号", "咕噜四号", "咕噜五号"];

function gameRoom(scene: string): LobbyRoomSnapshot {
  const full = buildGame(scene);
  const bots = new Set(list("bots").length ? list("bots") : full.players.filter((player) => player.id !== "p0").map((player) => player.id));
  // 人机的名字换成咕噜几号（预览工厂里的名字是示例）
  let botIndex = 0;
  full.players = full.players.map((player) => (bots.has(player.id) && player.id !== "p0" ? { ...player, name: BOT_NAMES[botIndex++] ?? player.name } : player));
  const game = redactGameForViewer(full, viewer, { seeAll: params.get("all") === "1" });
  const offline = new Set(list("offline"));
  const auto = new Set(list("auto"));
  const members: LobbyMember[] = full.players.map((player, index) => ({
    id: sockId(player.id),
    playerId: player.id,
    name: player.name,
    isHost: index === 0,
    connected: !offline.has(player.id),
    ...(bots.has(player.id) && player.id !== "p0" ? { bot: true } : {}),
    ...(auto.has(player.id) ? { auto: true } : {}),
  }));
  const finished = full.phase === "finished";
  return {
    code: "K7Q2TX",
    spectators: viewer === "" ? [{ id: "sock-watch", name: "路人" }] : [],
    access: { ...DEFAULT_ROOM_ACCESS, spectatorsSeeAll: params.get("all") === "1" },
    capacity: Math.max(2, full.players.length) as Capacity,
    mode: full.config.mode,
    status: "playing",
    members,
    chat: params.get("chat") === "1" ? SAMPLE_CHAT : [],
    voice: [],
    game,
    ...(timer === "" || finished ? {} : { turnRemainingMs: timer === null ? 30000 : Number(timer) }),
    ...(finished ? { rematch: { remainingMs: 60000, acceptedIds: [...list("rematch").map(sockId), ...members.filter((member) => member.bot).map((member) => member.id)] } } : {}),
  };
}

function waitingRoom(scene: string): LobbyRoomSnapshot {
  const spec = ROOM_SCENES[scene]!;
  const me = spec.viewer ?? 0;
  const members: LobbyMember[] = spec.members.map((member, index) => ({
    id: sockId(`p${index}`),
    playerId: `p${index}`,
    name: member.name,
    isHost: index === 0,
    connected: member.connected ?? true,
    ...(member.bot ? { bot: true } : {}),
  }));
  Object.defineProperty(socket, "id", { value: sockId(`p${me}`), configurable: true });
  return {
    code: "K7Q2TX",
    spectators: [],
    access: DEFAULT_ROOM_ACCESS,
    capacity: spec.capacity,
    mode: spec.mode ?? "turns",
    status: "waiting",
    members,
    chat: params.get("chat") === "1" ? SAMPLE_CHAT : [],
    voice: [],
  };
}

// 冒充自己：牌桌按 socket.id 找自己的座位
if (name !== "home") Object.defineProperty(socket, "id", { value: viewer ? sockId(viewer) : "sock-watch", configurable: true });

function Nav() {
  if (!showNav) return null;
  return (
    <nav style={{ position: "fixed", zIndex: 2000, left: 0, right: 0, bottom: 0, display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 8px", fontSize: 12, background: "rgba(5,10,20,.85)" }}>
      {ALL.map((scene) => (
        <a key={scene} href={`?s=${scene}&v=${viewer}`} style={{ color: scene === name ? "#f0c050" : "#a7b6c0" }}>{scene}</a>
      ))}
      <span style={{ color: "#f1ece0" }}>· {UI_SCENES[name]?.title ?? ROOM_SCENES[name]?.title ?? name}</span>
    </nav>
  );
}

function PreviewGame() {
  const [theme, toggleTheme] = useTheme();
  const [confirm, confirmDialog] = useConfirm();
  const from = params.get("from");
  const [scene, setScene] = useState(from && ALL.includes(from) ? from : name);
  const [room, setRoom] = useState(() => gameRoom(scene));
  useEffect(() => {
    if (scene === name) return;
    const timerId = window.setTimeout(() => {
      setScene(name);
      // 动画看的是 version 变没变：目标局面的 version 比来源大
      const next = gameRoom(name);
      setRoom({ ...next, game: { ...next.game!, version: room.game!.version + 1 } });
    }, 800);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const panel = params.get("panel");
    // StrictMode 下 effect 会跑两次，只点一次
    if (!panel || (window as unknown as { __panelOpened?: boolean }).__panelOpened) return;
    (window as unknown as { __panelOpened?: boolean }).__panelOpened = true;
    const label = panel === "chat" ? "聊天" : "菜单";
    window.setTimeout(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>(".yt-topbar button")].find((candidate) => candidate.textContent?.startsWith(label));
      button?.click();
      if (panel === "rules") window.setTimeout(() => [...document.querySelectorAll<HTMLButtonElement>(".yt-menu button")].find((candidate) => candidate.textContent === "规则说明")?.click(), 50);
    }, 50);
  }, []);
  const voice = useVoice(null);
  return (
    <main className="app-shell yt-game">
      <DeckBackdrop theme={theme} />
      <GameBoard
        room={room}
        busy={false}
        error={params.get("err") ?? ""}
        notice=""
        brand={<Brand />}
        connection={<ConnectionStatus connected />}
        themeToggle={<ThemeToggle theme={theme} onToggle={toggleTheme} />}
        chat={<RoomChat room={room} voice={voice} />}
        onCommand={(command) => console.log("command", command)}
        onRematch={() => {}}
        onAuto={() => {}}
        onDissolve={() => { void confirm({ title: "解散房间？", detail: "所有玩家都会被移出，当前对局也会结束。", confirmLabel: "解散" }); }}
        watchId={viewer || "p0"}
        onWatch={() => {}}
        onLeave={() => {}}
      />
      {confirmDialog}
      <Nav />
    </main>
  );
}

function PreviewRoom() {
  const [theme, toggleTheme] = useTheme();
  const [confirm, confirmDialog] = useConfirm();
  const room = waitingRoom(name);
  const voice = useVoice(null);
  return (
    <main className="app-shell yt-room">
      <DeckBackdrop theme={theme} />
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <ConnectionStatus connected />
        </div>
      </header>
      <div className="yt-room-top">
        <GameRules />
        <TutorialInvite record={params.get("tut") === "again" ? "done" : null} title="等人的时候，先学一下？" text="咕噜嘎在真牌桌上带你走几轮，不会离开房间，房主一开局就自动回来。" again="再看一遍新手教程（不会离开房间）" onOpen={() => {}} />
      </div>
      <RoomView
        room={room}
        busy={false}
        error={params.get("err") ?? ""}
        notice=""
        onCopyCode={() => {}}
        onLeave={() => {}}
        onStart={() => {}}
        onKick={() => {}}
        onAddBot={() => {}}
        onDissolve={() => { void confirm({ title: "解散房间？", detail: "所有玩家都会被移出，当前对局也会结束。", confirmLabel: "解散" }); }}
        onMode={() => {}}
      />
      <RoomChat room={room} voice={voice} />
      {confirmDialog}
      <Nav />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {name === "home" ? <App /> : name in ROOM_SCENES ? <PreviewRoom /> : <PreviewGame />}
  </React.StrictMode>,
);
