import { useEffect, useRef } from "react";
import type { GameEvent, GameState } from "@yacht/game";
import { sfx, synth, useSfxCountdown } from "./gm-sound.js";

/**
 * 快艇骰子的动作音效：对比前后两次对局快照，按这一步的 events 出声。
 * 自己的动作 mine=true 响亮，别人的（含观战时所有人的）减半。
 * 第一次拿到快照（进房间、重连、观战刚进来、教程开场）不出声；每个快照只带最近一步的事件，跳了很多步也只响最后一步。
 *
 * 引擎事件 → 声音：
 * - Rolled 掷骰 / 重掷 → dice(重掷几颗)；5 颗一样（快艇）→ 骰子停下时 汽笛（招牌）+ sparkle
 * - Held 留下 / 放回骰子 → 自己的点击时本地已响 select（GameBoard 的 toggleHold），这里只响别人的：轻轻一磕
 * - Scored 记分 → write（填格子的笔声）；划掉（0 分）→ write + pass；25 分以上的大格 → score；
 *   上半区奖励 +35 → score(big)；快艇奖励 +100 → 汽笛 + sparkle
 * - PlayerDone 同时掷模式别人填好了 → write（轻）
 * - RoundRevealed 同时掷一起亮出 → reveal
 * - RoundStarted 新一轮 → roundStart
 * - TurnStarted 轮到你 → yourTurn；自己交出回合 → turnPassed
 * - TurnTimedOut 超时 → 自己 timeout，别人 pass
 * - GameEnded 终局 → gameOver(赢/输)
 * - 再来一局 / 练习局重开（version 变小）→ gameStart
 */

/** 和 GameBoard 的骰子翻滚时长一致。 */
const ROLL_MS = 600;

/** 开发时记下响了哪个声音，测试脚本读 window.__sfxLog。 */
export function play(name: string, fn: () => void, delay = 0) {
  const run = () => {
    if (import.meta.env.DEV) ((window as unknown as { __sfxLog?: string[] }).__sfxLog ??= []).push(name);
    fn();
  };
  if (delay > 0) window.setTimeout(run, delay);
  else run();
}

/** 快艇汽笛：低沉的两声船笛，第二声更长。 */
function yachtHorn(mine: boolean) {
  const v = synth.level(mine);
  for (const [at, len] of [[0, 0.32], [0.42, 0.75]] as const) {
    synth.tone(147, { at, duration: len, volume: 0.16 * v, type: "sawtooth" });
    synth.tone(220, { at, duration: len, volume: 0.12 * v, type: "sawtooth" });
    synth.tone(294, { at, duration: len, volume: 0.08 * v, type: "triangle" });
    synth.noise({ at, duration: len, volume: 0.06 * v, filter: "lowpass", freq: 500 });
  }
}

type Of<T extends GameEvent["type"]> = Extract<GameEvent, { type: T }>;
const BIG_CATS = new Set(["LFH", "LSS", "LLS", "LY"]);

export function useGameSfx(game: GameState | undefined, selfId: string) {
  const prev = useRef<GameState | undefined>(undefined);

  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    if (!before || !game || before.version === game.version) return;

    if (game.version < before.version) {
      play("gameStart", () => sfx.gameStart());
      if (game.events.some((event) => event.type === "TurnStarted" && event.player === selfId)) play("yourTurn", () => sfx.yourTurn(), 700);
      return;
    }

    const events = game.events;
    const find = <T extends GameEvent["type"]>(type: T) => events.find((event): event is Of<T> => event.type === type);
    const isMine = (playerId: string) => playerId === selfId;
    let at = 0;

    const timedOut = find("TurnTimedOut");
    if (timedOut) {
      const mine = isMine(timedOut.player);
      play(mine ? "timeout" : "pass", () => (mine ? sfx.timeout() : sfx.pass(false)));
      at = 350;
    }

    const rolled = find("Rolled");
    if (rolled) {
      const mine = isMine(rolled.player);
      play("dice", () => sfx.dice(rolled.rerolled.length || 5, mine), at);
      if (rolled.dice.every((die) => die > 0 && die === rolled.dice[0])) {
        play("yachtHorn", () => yachtHorn(mine), at + ROLL_MS);
        play("sparkle", () => sfx.sparkle(mine), at + ROLL_MS + 900);
      }
    }

    const held = find("Held");
    if (held && !isMine(held.player)) play("tile", () => sfx.tile(false, 1, 1.5));

    for (const event of events) {
      if (event.type !== "Scored") continue;
      const record = event.record;
      const mine = isMine(record.player);
      play("write", () => sfx.write(mine), at);
      if (record.points === 0) play("pass", () => sfx.pass(mine), at + 200);
      else if (record.yachtBonus) {
        play("yachtHorn", () => yachtHorn(mine), at + 250);
        play("sparkle", () => sfx.sparkle(mine), at + 1150);
      } else if (BIG_CATS.has(record.cat)) play("score", () => sfx.score(mine, record.cat === "LY"), at + 250);
      if (record.upperBonus) play("score", () => sfx.score(mine, true), at + 700);
      at += 500;
    }

    const done = events.filter((event): event is Of<"PlayerDone"> => event.type === "PlayerDone" && !isMine(event.player));
    if (done.length > 0 && !find("Scored")) play("write", () => sfx.write(false), at);

    if (find("RoundRevealed")) {
      play("reveal", () => sfx.reveal(true), at);
      at += 450;
    }

    const ended = find("GameEnded");
    if (ended) {
      play("gameOver", () => sfx.gameOver(ended.winners.includes(selfId)), at + 500);
      return;
    }

    if (find("RoundStarted")) {
      play("roundStart", () => sfx.roundStart(), at + 200);
      at += 400;
      // 同时掷：新一轮大家一起开始，没有 TurnStarted
      if (game.config.mode === "simultaneous" && game.turns[selfId]) play("yourTurn", () => sfx.yourTurn(), at + 450);
    }

    const started = find("TurnStarted");
    if (started) {
      const actor = before.players[before.currentPlayer]?.id ?? "";
      if (isMine(started.player)) play("yourTurn", () => sfx.yourTurn(), at + 450);
      else if (isMine(actor) && game.config.mode === "turns") play("turnPassed", () => sfx.turnPassed(), at + 400);
    }
  }, [game?.version]);
}

/** 自己行动的最后 5 秒每秒一声（gm-sound 的 useSfxCountdown）；开发时也记进 __sfxLog。 */
export function useCountdownSfx(isMyTurn: boolean, secondsLeft: number | null | undefined) {
  useSfxCountdown(isMyTurn, secondsLeft);
  useEffect(() => {
    if (import.meta.env.DEV && isMyTurn && secondsLeft != null && secondsLeft >= 1 && secondsLeft <= 5) {
      ((window as unknown as { __sfxLog?: string[] }).__sfxLog ??= []).push("countdown");
    }
  }, [isMyTurn, secondsLeft]);
}
