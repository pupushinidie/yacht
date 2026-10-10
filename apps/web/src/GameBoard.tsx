import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  CAT_NAMES,
  isWild,
  pendingActors,
  sheetTotals,
  type Cat,
  type GameCommand,
  type GameState,
  type LobbyMember,
  type LobbyRoomSnapshot,
  type ScoreRecord,
} from "@yacht/game";
import { avatarArt, catIcon, diceArt, dieArt, fxArt, seatOf, uiArt } from "./art.js";
import { useConfirm } from "./confirm.js";
import GameRules from "./GameRules.js";
import { GameRoomMenu, SpectateBar } from "./RoomExtras.js";
import ScoreSheet from "./ScoreSheet.js";
import { socket } from "./socket.js";

export interface GameBoardProps {
  readonly room: LobbyRoomSnapshot;
  readonly busy: boolean;
  readonly error: string;
  readonly notice: string;
  readonly brand: ReactNode;
  readonly connection: ReactNode;
  /** 顶栏的白天 / 夜间切换按钮。 */
  readonly themeToggle: ReactNode;
  readonly chat: ReactNode;
  readonly onCommand: (command: GameCommand) => void;
  readonly onRematch: (accept: boolean) => void;
  /** 打开 / 取消自己的托管。 */
  readonly onAuto: (enabled: boolean) => void;
  readonly onDissolve: () => void;
  /** 观战时从这位玩家的座位看。 */
  readonly watchId: string;
  readonly onWatch: (playerId: string) => void;
  /** 观战的人离开。 */
  readonly onLeave: () => void;
  /** 教程、预览：自己的成员 id（不看 socket.id）。 */
  readonly selfMemberId?: string;
  /** 教程的教练条等，放在顶栏下面。 */
  readonly tutorialBar?: ReactNode;
  /** 教程里不显示菜单里的托管、解散。 */
  readonly practice?: boolean;
}

/** 掷骰动画时长（骰子翻滚 12 帧 × 0.05 秒）。 */
export const ROLL_MS = 600;
const YACHT_FX_MS = 2200;

function useCountdown(room: LobbyRoomSnapshot): number | null {
  const [now, setNow] = useState(Date.now());
  const [anchor, setAnchor] = useState({ at: Date.now(), ms: room.turnRemainingMs });
  useEffect(() => setAnchor({ at: Date.now(), ms: room.turnRemainingMs }), [room]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  if (anchor.ms === undefined) return null;
  return Math.max(0, Math.ceil((anchor.ms - (now - anchor.at)) / 1000));
}

export function useNarrow(): boolean {
  const query = "(max-width: 640px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}

/** 临时特效：key 递增，到时自动清掉；计时器表只在卸载时清空（不随 version 变化取消）。 */
function useFlash<T>() {
  const [value, setValue] = useState<(T & { key: number }) | null>(null);
  const timers = useRef(new Set<number>());
  const seq = useRef(0);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  const show = (next: T, ms: number) => {
    seq.current += 1;
    const key = seq.current;
    setValue({ ...next, key });
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setValue((current) => (current?.key === key ? null : current));
    }, ms);
    timers.current.add(timer);
  };
  return [value, show] as const;
}

/** 骰子倍数：按掷骰区宽度挑整数倍（2–4 倍，36px 原图），矮屏不超过 2–3 倍。 */
function useDiceScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(3);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const narrow = width < 420;
      const usable = width - (narrow ? 8 : 40);
      const gap = narrow ? 2 : 12;
      let next = 2;
      for (const candidate of [4, 3, 2]) {
        if (candidate * 36 * 5 + gap * 4 <= usable) {
          next = candidate;
          break;
        }
      }
      if (window.innerHeight < 740) next = Math.min(next, 2);
      else if (window.innerHeight < 760) next = Math.min(next, 3);
      setScale(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, scale };
}

function recordText(record: ScoreRecord, name: (id: string) => string): string {
  const who = name(record.player);
  const extra = [record.yachtBonus ? "快艇奖励 +100" : "", record.upperBonus ? "上半区奖励 +35" : ""].filter(Boolean).join("，");
  const main = record.points === 0 ? `划掉「${CAT_NAMES[record.cat]}」` : `「${CAT_NAMES[record.cat]}」${record.points} 分`;
  return `${who} ${main}${extra ? `，${extra}` : ""}${record.auto ? "（自动）" : ""}`;
}

export default function GameBoard(props: GameBoardProps) {
  const { room, busy, error, notice, brand, themeToggle, chat, onCommand, onRematch, onAuto, onDissolve, watchId, onWatch, onLeave } = props;
  const game = room.game!;
  const narrow = useNarrow();
  const countdown = useCountdown(room);
  const [confirm, confirmDialog] = useConfirm();
  const myMemberId = props.selfMemberId ?? socket.id;
  const member = room.members.find((candidate) => candidate.id === myMemberId);
  const spectating = !member;
  const selfId = member?.playerId ?? watchId;
  const name = (id: string) => (id === selfId && !spectating ? "你" : game.players.find((player) => player.id === id)?.name ?? "?");
  const memberOf = (playerId: string): LobbyMember | undefined => room.members.find((candidate) => candidate.playerId === playerId);
  const simultaneous = game.config.mode === "simultaneous";
  const pending = pendingActors(game);
  const finished = game.phase === "finished";
  const current = game.players[game.currentPlayer]!;

  // 掷骰区显示谁的骰子：轮流模式是当前玩家；同时模式是自己（观战看所选座位）
  const trayOwner = simultaneous ? selfId : current.id;
  const trayTurn = game.turns[trayOwner];
  const myTurn = !spectating && pending.includes(selfId) && !finished;
  const canAct = myTurn && !!game.turns[selfId];
  const myTurnState = canAct ? game.turns[selfId]! : null;
  const rolled = !!myTurnState && myTurnState.rolls > 0;
  const me = game.players.find((player) => player.id === selfId);
  const lastOfTray = [...game.history].reverse().find((record) => record.player === trayOwner && record.round === game.round);

  // ---------- 动画：只看 version 变没变 ----------
  const [rolling, showRolling] = useFlash<{ indices: number[]; player: string }>();
  const [yachtFx, showYacht] = useFlash<{ player: string }>();
  const [fresh, showFresh] = useFlash<{ player: string; cat: Cat }>();
  const [bonusFresh, showBonus] = useFlash<{ player: string }>();
  const [toast, showToast] = useFlash<{ text: string; tone: "bonus" | "yacht" | "info" }>();
  const [revealed, showRevealed] = useFlash<{ cells: { player: string; cat: Cat }[]; records: ScoreRecord[] }>();
  const lastVersion = useRef(game.version);
  const timers = useRef(new Set<number>());
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  useEffect(() => {
    if (lastVersion.current === game.version) return;
    lastVersion.current = game.version;
    for (const event of game.events) {
      if (event.type === "Rolled") {
        showRolling({ indices: event.rerolled, player: event.player }, ROLL_MS);
        if (event.dice.every((die) => die === event.dice[0])) {
          const timer = window.setTimeout(() => {
            timers.current.delete(timer);
            showYacht({ player: event.player }, YACHT_FX_MS);
          }, ROLL_MS);
          timers.current.add(timer);
        }
      } else if (event.type === "Scored") {
        const record = event.record;
        showFresh({ player: record.player, cat: record.cat }, 1200);
        if (record.upperBonus) {
          showBonus({ player: record.player }, 2200);
          showToast({ text: `${name(record.player)} 上半区凑够 63：奖励 +35！`, tone: "bonus" }, 2600);
        }
        if (record.yachtBonus) showToast({ text: `${name(record.player)} 又掷出快艇：快艇奖励 +100！`, tone: "yacht" }, 2800);
      } else if (event.type === "RoundRevealed") {
        showRevealed({ cells: event.records.map((record) => ({ player: record.player, cat: record.cat })), records: event.records }, 4200);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.version]);
  const rollingSet = new Set(rolling && rolling.player === trayOwner ? rolling.indices : []);

  // ---------- 留下的骰子：自己掷的时候本地先改，再告诉服务器（大家都看得到）----------
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  const turnKey = `${game.round}:${trayOwner}:${trayTurn?.rolls ?? "-"}`;
  const serverHeld = JSON.stringify(trayTurn?.held ?? []);
  useEffect(() => {
    setHeld(trayTurn ? [...trayTurn.held] : [false, false, false, false, false]);
    // 自己掷的时候只在换回合、掷完骰子时同步；看别人掷时跟着服务器
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey, canAct ? "" : serverHeld]);
  const canHold = canAct && rolled && myTurnState!.rolls < 3 && rollingSet.size === 0;
  const toggleHold = (index: number) => {
    if (!canHold) return;
    const next = held.map((value, i) => (i === index ? !value : value));
    setHeld(next);
    onCommand({ type: "HOLD", held: next });
  };

  // ---------- 操作 ----------
  const roll = () => {
    if (!myTurnState || myTurnState.rolls >= 3 || rollingSet.size > 0) return;
    if (myTurnState.rolls === 0) onCommand({ type: "ROLL" });
    else if (!held.every(Boolean)) onCommand({ type: "ROLL", reroll: held.flatMap((value, index) => (value ? [] : [index])) });
  };
  const score = async (cat: Cat, points: number) => {
    if (!canAct) return;
    if (points === 0) {
      const ok = await confirm({
        title: `划掉「${CAT_NAMES[cat]}」？`,
        detail: cat === "LY" ? "这一格得 0 分。快艇格划掉以后，再掷出快艇就拿不到 +100 奖励了。" : "这一格得 0 分，以后不能再用。",
        confirmLabel: "确定划掉",
      });
      if (!ok) return;
    }
    onCommand({ type: "SCORE", cat });
  };

  // 键盘：空格掷骰，1–5 留下 / 放回
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [role=dialog], [role=alertdialog]")) return;
      if (event.key === " " && canAct) {
        event.preventDefault();
        roll();
      } else if (/^[1-5]$/.test(event.key)) toggleHold(Number(event.key) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // 页面在后台时标题提示轮到你
  useEffect(() => {
    const base = "快艇骰子 · 在线对战";
    const update = () => { document.title = myTurn && document.hidden ? "【轮到你】快艇骰子" : base; };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [myTurn, game.version]);

  // ---------- 计分表的列：手机上只放自己 + 一位 ----------
  const [focusId, setFocusId] = useState("");
  const others = game.players.filter((player) => player.id !== selfId);
  const focus = others.find((player) => player.id === focusId)
    ?? (!simultaneous && current.id !== selfId ? current : undefined)
    ?? [...others].sort((a, b) => b.score - a.score)[0];
  const columns = narrow
    ? [selfId, ...(focus ? [focus.id] : [])].filter((id) => game.players.some((player) => player.id === id))
    : game.players.map((player) => player.id);
  const activeIds = finished ? [] : simultaneous ? (pending.includes(selfId) ? [selfId] : []) : [current.id];

  // ---------- 状态条 ----------
  const doneCount = Object.keys(game.done).length;
  let headline: string;
  let hint: string;
  const lastAny = game.history.at(-1);
  const trayDice = trayTurn && trayTurn.rolls > 0 ? trayTurn.dice : trayTurn ? [0, 0, 0, 0, 0] : lastOfTray?.dice ?? (finished && lastAny ? lastAny.dice : [0, 0, 0, 0, 0]);
  const wildNow = !!myTurnState && rolled && !!me && isWild(myTurnState.dice, me.sheet);
  if (finished) {
    headline = "对局结束";
    hint = "看看谁的总分最高。";
  } else if (myTurn && myTurnState) {
    const left = 3 - myTurnState.rolls;
    if (myTurnState.rolls === 0) {
      headline = "轮到你了：先掷骰";
      hint = narrow ? "点「掷骰」把 5 颗骰子都掷出来。" : "点「掷骰」把 5 颗骰子都掷出来（也可以按空格）。";
    } else if (wildNow) {
      headline = "又是快艇！按百搭规则填";
      hint = me!.sheet.scores.LY === 50 ? "这次另加 100 分。计分表上只有亮着的格子能填。" : "计分表上只有亮着的格子能填。";
    } else if (left > 0) {
      headline = `轮到你了：还能掷 ${left} 次`;
      hint = narrow ? "点骰子留下，再重掷其余的；或直接在下面填分。" : "点骰子把它留下，再点「重掷」掷其余的；也可以直接在计分表上选一格填分。";
    } else {
      headline = "掷满 3 次了：选一格填分";
      hint = "灰字是填进去能得的分；凑不成就挑一格划掉（得 0）。";
    }
  } else if (spectating) {
    headline = simultaneous ? `同时掷 · 已填好 ${doneCount}/${game.players.length}` : `${current.name} 在掷骰`;
    hint = "你在观战。";
  } else if (simultaneous) {
    headline = `你填好了，等其他人（${doneCount}/${game.players.length}）`;
    hint = "这一轮所有人都填完后，大家的结果一起亮出来。";
  } else {
    const turn = game.turns[current.id];
    const info = memberOf(current.id);
    headline = `${current.name} 在掷骰${turn && turn.rolls > 0 ? `（第 ${turn.rolls} 次）` : ""}`;
    hint = info?.bot ? "人机正在想……" : info && !info.connected ? "他离线了，由人机代打。" : info?.auto ? "他托管了，由人机代打。" : "等他掷完填好分，就轮到下一位。";
  }
  const timerLow = countdown !== null && countdown <= 10;

  // ---------- 结算、抽屉 ----------
  const [hideResult, setHideResult] = useState(false);
  useEffect(() => setHideResult(false), [finished]);
  const [panel, setPanel] = useState<"" | "rules" | "chat" | "menu">("");
  const seenChat = useRef(room.chat.length);
  if (panel === "chat") seenChat.current = room.chat.length;
  const unread = Math.max(0, room.chat.length - seenChat.current);
  const diceScale = useDiceScale();
  const trayPlayer = game.players.find((player) => player.id === trayOwner);

  return (
    <div className={`yt-screen${narrow ? " narrow" : ""}`} style={{ "--die": diceScale.scale, "--tray-img": `url(${uiArt.tray})`, "--sheet-img": `url(${uiArt.sheet})` } as CSSProperties}>
      <header className="yt-topbar">
        {brand}
        <div className="yt-round" data-tutorial="round"><span>第</span><b>{game.round}</b><span>/13 轮</span>{simultaneous ? <small>同时掷</small> : null}</div>
        <div className="yt-topbar-right">
          {spectating && <span className="yt-tag watch">观战</span>}
          <button className={panel === "chat" ? "quiet-button on" : "quiet-button"} type="button" onClick={() => setPanel(panel === "chat" ? "" : "chat")}>
            聊天{unread > 0 ? <b className="yt-badge">{unread}</b> : null}
          </button>
          <button className={panel === "menu" ? "quiet-button on" : "quiet-button"} type="button" onClick={() => setPanel(panel === "menu" ? "" : "menu")} data-tutorial="menu">菜单</button>
          {themeToggle}
        </div>
      </header>

      {spectating && <SpectateBar room={room} watchId={watchId} onWatch={onWatch} onLeave={onLeave} showSeats={simultaneous} />}
      {props.tutorialBar}

      <div className="yt-main">
        <section className="yt-left">
          <div className={myTurn ? "yt-status mine" : "yt-status"} data-tutorial="status">
            <div className="yt-status-text">
              <strong>{headline}</strong>
              <span>{error ? <em className="yt-error">{error}</em> : notice && !myTurn ? notice : hint}</span>
            </div>
            {countdown !== null && !finished && (myTurn || !simultaneous) && (
              <div className={timerLow ? "yt-timer low" : "yt-timer"} data-tutorial="timer" title="这一步的剩余时间">{countdown}<small>秒</small></div>
            )}
          </div>

          {member?.auto && !finished && (
            <div className="yt-auto">
              <span>托管中：人机在替你打。</span>
              <button className="quiet-button" type="button" onClick={() => onAuto(false)}>取消托管</button>
            </div>
          )}

          <div className={`yt-tray${myTurn ? " mine" : ""}`} ref={diceScale.ref} data-tutorial="dice">
            <div className="yt-tray-head">
              {trayPlayer && <img className="yt-tray-avatar" src={avatarArt(trayPlayer.color)} alt="" />}
              <span>{trayOwner === selfId && !spectating ? "你的骰子" : `${name(trayOwner)} 的骰子`}</span>
              {trayTurn && trayTurn.rolls > 0 && <small>已掷 {trayTurn.rolls}/3</small>}
              {!trayTurn && lastOfTray && <small>这一轮：{recordText(lastOfTray, name)}</small>}
            </div>
            <div className="yt-dice">
              {trayDice.map((face, index) => {
                const isHeld = (trayTurn?.rolls ?? 0) > 0 && (canAct && trayOwner === selfId ? held[index] : trayTurn?.held[index]) === true;
                const spinning = rollingSet.has(index);
                return (
                  <button
                    key={index}
                    type="button"
                    className={`yt-die${isHeld ? " held" : ""}${spinning ? " rolling" : ""}${canHold ? " clickable" : ""}`}
                    style={{ "--i": index } as CSSProperties}
                    onClick={() => toggleHold(index)}
                    disabled={!canHold}
                    aria-pressed={isHeld}
                    aria-label={face ? `${face} 点${isHeld ? "（留下）" : ""}` : "还没掷"}
                    data-tutorial={`die-${index}`}
                  >
                    {spinning ? <i className="yt-die-roll" style={{ backgroundImage: `url(${diceArt.roll})` }} /> : <img src={dieArt(face, isHeld)} alt="" />}
                  </button>
                );
              })}
              {yachtFx && yachtFx.player === trayOwner && (
                <div className="yt-yacht-fx" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((index) => <i key={index} className="yt-burst" style={{ backgroundImage: `url(${fxArt.burst})`, "--i": index } as CSSProperties} />)}
                  <i className="yt-gulu" style={{ backgroundImage: `url(${fxArt.yacht})` }} />
                  <b>快艇！</b>
                </div>
              )}
            </div>
            <div className="yt-tray-actions">
              <i className={rollingSet.size > 0 ? "yt-cup shaking" : "yt-cup"} style={{ backgroundImage: `url(${rollingSet.size > 0 ? diceArt.cupShake : diceArt.cup})` }} aria-hidden="true" />
              {myTurn && myTurnState ? (
                <button
                  className="primary-button yt-roll"
                  type="button"
                  onClick={roll}
                  disabled={busy || myTurnState.rolls >= 3 || (rolled && held.every(Boolean)) || rollingSet.size > 0}
                  data-tutorial="roll"
                >
                  {myTurnState.rolls === 0 ? "掷骰" : myTurnState.rolls >= 3 ? "已掷满 3 次" : held.every(Boolean) ? "全部留下了" : `重掷 ${held.filter((value) => !value).length} 颗 · 剩 ${3 - myTurnState.rolls} 次`}
                </button>
              ) : (
                <span className="yt-tray-note">{finished ? "对局结束" : spectating ? "观战中" : simultaneous ? "等其他人填完" : `等 ${current.name} 掷完`}</span>
              )}
              {canHold && !narrow && <span className="yt-tray-tip">点骰子留下 / 放回（键盘 1–5）</span>}
            </div>
          </div>

          <div className="yt-players" data-tutorial="players" style={{ "--n": game.players.length } as CSSProperties}>
            {game.players.map((player) => {
              const info = memberOf(player.id);
              const seat = seatOf(player.color);
              const playing = !finished && (simultaneous ? !game.done[player.id] : player.id === current.id);
              const status = finished
                ? `第 ${game.finalResult?.ranks[player.id] ?? "?"} 名`
                : simultaneous ? (game.done[player.id] ? "已填好" : "还在掷") : playing ? "在掷骰" : "";
              return (
                <button
                  key={player.id}
                  type="button"
                  className={`yt-player${playing ? " active" : ""}${narrow && focus?.id === player.id ? " focus" : ""}`}
                  style={{ "--seat": seat.hex } as CSSProperties}
                  onClick={() => setFocusId(player.id)}
                  title={narrow ? `计分表上看 ${player.name}` : player.name}
                >
                  <img src={avatarArt(player.color)} alt="" />
                  <span className="yt-player-name">
                    <span className="yt-player-label">{player.id === selfId && !spectating ? "你" : player.name}</span>
                    <span className="yt-player-tags">
                      {info?.bot && <em className="yt-tag bot">人机</em>}
                      {info?.auto && <em className="yt-tag auto">托管</em>}
                      {info && !info.bot && !info.connected && <em className="yt-tag off">离线</em>}
                      {status && <em className={game.done[player.id] ? "yt-tag done" : "yt-tag"}>{status}</em>}
                    </span>
                  </span>
                  <b className="yt-player-score">{player.score}</b>
                </button>
              );
            })}
          </div>

          <div className="yt-log" aria-label="记录">
            {[...game.history].slice(-8).reverse().map((record, index) => (
              <div key={`${record.player}-${record.round}-${record.cat}`} className={index === 0 ? "yt-log-row latest" : "yt-log-row"}>
                <img src={catIcon(record.cat)} alt="" />
                <span>第 {record.round} 轮 · {recordText(record, name)}</span>
              </div>
            ))}
            {game.history.length === 0 && <div className="yt-log-row muted">每填一格都会记在这里。</div>}
          </div>
        </section>

        <ScoreSheet
          game={game}
          members={room.members}
          selfId={selfId}
          columns={columns}
          activeIds={activeIds}
          myDice={myTurnState && rolled && rollingSet.size === 0 ? myTurnState.dice : null}
          canScore={canAct && rolled && !busy}
          onScore={(cat, points) => void score(cat, points)}
          fresh={fresh}
          bonusFresh={bonusFresh}
          revealed={revealed}
        />
      </div>

      {toast && <div className={`yt-toast ${toast.tone}`} role="status">{toast.text}</div>}
      {revealed && !finished && (
        <div className="yt-reveal" role="status">
          <strong>第 {revealed.records[0]?.round} 轮亮出</strong>
          {revealed.records.map((record) => (
            <span key={record.player}><img src={catIcon(record.cat)} alt="" />{recordText(record, name)}</span>
          ))}
        </div>
      )}

      {panel === "chat" && (
        <div className="yt-drawer" role="dialog" aria-label="聊天">
          <button className="quiet-button yt-drawer-close" type="button" onClick={() => setPanel("")}>关闭</button>
          {chat}
        </div>
      )}
      {panel === "menu" && (
        <div className="yt-drawer yt-menu" role="dialog" aria-label="菜单">
          <div className="yt-menu-actions">
            <button className="quiet-button" type="button" onClick={() => setPanel("rules")}>规则说明</button>
            {!props.practice && !spectating && !finished && !member?.auto && <button className="quiet-button" type="button" onClick={() => { onAuto(true); setPanel(""); }}>托管（让人机代打）</button>}
            {!props.practice && <GameRoomMenu room={room} />}
            {!props.practice && member?.isHost && <button className="quiet-button danger" type="button" onClick={() => { setPanel(""); onDissolve(); }}>解散房间</button>}
            {spectating && <button className="quiet-button" type="button" onClick={onLeave}>离开观战</button>}
            <button className="quiet-button" type="button" onClick={() => setPanel("")}>关闭</button>
          </div>
          <p className="yt-menu-note">每个决定限时 {game.config.stepTimeoutSec} 秒：还没掷就自动掷，掷过就自动填得分最高的格；连续超时 2 次由人机托管。</p>
        </div>
      )}
      {panel === "rules" && (
        <div className="gm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(""); }}>
          <section className="gm-panel yt-rules-modal" role="dialog" aria-label="规则说明">
            <GameRules modal />
            <div className="gm-panel-actions"><button className="quiet-button" type="button" onClick={() => setPanel("")}>关闭</button></div>
          </section>
        </div>
      )}

      {finished && !hideResult && (
        <ResultDialog game={game} room={room} selfId={selfId} spectating={spectating} name={name} onRematch={onRematch} onHide={() => setHideResult(true)} onLeave={onLeave} />
      )}
      {finished && hideResult && (
        <button className="primary-button yt-show-result" type="button" onClick={() => setHideResult(false)}>看结算</button>
      )}
      {confirmDialog}
    </div>
  );
}

function ResultDialog({ game, room, selfId, spectating, name, onRematch, onHide, onLeave }: {
  game: GameState;
  room: LobbyRoomSnapshot;
  selfId: string;
  spectating: boolean;
  name: (id: string) => string;
  onRematch: (accept: boolean) => void;
  onHide: () => void;
  onLeave: () => void;
}) {
  const result = game.finalResult!;
  const ranked = [...game.players].sort((a, b) => result.ranks[a.id]! - result.ranks[b.id]!);
  const tie = result.winners.length > 1;
  const winnerNames = result.winners.map(name).join("、");
  const [now, setNow] = useState(Date.now());
  const [anchor, setAnchor] = useState({ at: Date.now(), ms: room.rematch?.remainingMs });
  useEffect(() => setAnchor({ at: Date.now(), ms: room.rematch?.remainingMs }), [room.rematch?.remainingMs]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = anchor.ms === undefined ? null : Math.max(0, Math.ceil((anchor.ms - (now - anchor.at)) / 1000));
  const myMember = room.members.find((member) => member.playerId === selfId);
  const accepted = !!myMember && !!room.rematch?.acceptedIds.includes(myMember.id);
  const title = tie ? `${winnerNames} 并列第一！` : result.winners[0] === selfId && !spectating ? "你赢了！" : `${winnerNames} 获胜！`;
  return (
    <div className="gm-modal-backdrop yt-result-backdrop" role="presentation">
      <section className="gm-panel yt-result" role="dialog" aria-label="结算" data-tutorial="result">
        <h2>{game.players.length === 1 ? `你这局得了 ${game.players[0]!.score} 分` : title}</h2>
        <div className="yt-result-list">
          {ranked.map((player) => {
            const totals = sheetTotals(player.sheet);
            const rank = result.ranks[player.id]!;
            return (
              <div key={player.id} className={rank === 1 ? "yt-result-row win" : "yt-result-row"} style={{ "--seat": seatOf(player.color).hex } as CSSProperties}>
                <b className="yt-result-rank">{rank}</b>
                <img src={avatarArt(player.color)} alt="" />
                <span className="yt-result-name">{name(player.id)}</span>
                <span className="yt-result-detail">上半区 {totals.upper}{totals.upperBonus ? " + 奖励 35" : ""} · 下半区 {totals.lower}{totals.yachtBonus ? ` · 快艇奖励 ${totals.yachtBonus}` : ""}</span>
                <b className="yt-result-total">{totals.total}</b>
              </div>
            );
          })}
        </div>
        {room.rematch && !spectating ? (
          <p className="yt-result-note">再来一局？{remaining !== null ? `${remaining} 秒内` : ""}所有人都同意就重新开局（已同意 {room.rematch.acceptedIds.length}/{room.members.length}）。</p>
        ) : null}
        <div className="gm-panel-actions">
          <button className="quiet-button" type="button" onClick={onHide}>看计分表</button>
          {spectating ? (
            <button className="quiet-button" type="button" onClick={onLeave}>离开观战</button>
          ) : room.rematch ? (
            <>
              <button className="quiet-button danger" type="button" onClick={() => onRematch(false)}>离开</button>
              <button className="primary-button" type="button" disabled={accepted} onClick={() => onRematch(true)} data-tutorial="rematch">{accepted ? "等其他人" : "再来一局"}</button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
