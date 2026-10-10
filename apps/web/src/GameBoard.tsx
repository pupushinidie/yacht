// 临时牌桌（引擎阶段占位，界面阶段整个换掉）：能掷骰、留下、填分，把一局打完。
import { useState, type ReactNode } from "react";
import { CATS, CAT_NAMES, legalCategories, scoreFor, sheetTotals, type GameCommand, type LobbyRoomSnapshot } from "@yacht/game";
import { socket } from "./socket.js";

interface GameBoardProps {
  readonly room: LobbyRoomSnapshot;
  readonly busy: boolean;
  readonly error: string;
  readonly notice: string;
  readonly brand: ReactNode;
  readonly connection: ReactNode;
  readonly themeToggle: ReactNode;
  readonly chat: ReactNode;
  readonly onCommand: (command: GameCommand) => void;
  readonly onRematch: (accept: boolean) => void;
  readonly onAuto: (enabled: boolean) => void;
  readonly onDissolve: () => void;
  readonly watchId: string;
  readonly onWatch: (playerId: string) => void;
  readonly onLeave: () => void;
}

export default function GameBoard({ room, error, notice, brand, themeToggle, onCommand, onRematch }: GameBoardProps) {
  const game = room.game!;
  const self = room.members.find((member) => member.id === socket.id)?.playerId ?? "";
  const turn = game.turns[self];
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  const me = game.players.find((player) => player.id === self);
  const legal = turn && turn.rolls > 0 && me ? legalCategories(turn.dice, me.sheet) : [];
  return (
    <main className="app-shell">
      <header>{brand}{themeToggle}</header>
      <p>第 {game.round} / 13 轮 {game.phase === "finished" ? "· 结束" : ""}</p>
      {turn && (
        <section>
          <p>{turn.dice.map((die, index) => (
            <button key={index} type="button" onClick={() => setHeld(held.map((value, i) => (i === index ? !value : value)))}>
              {die || "?"}{held[index] ? "（留）" : ""}
            </button>
          ))}</p>
          <button type="button" disabled={turn.rolls >= 3} onClick={() => {
            const reroll = turn.rolls === 0 ? undefined : held.flatMap((value, index) => (value ? [] : [index]));
            onCommand(reroll ? { type: "ROLL", reroll } : { type: "ROLL" });
            setHeld([false, false, false, false, false]);
          }}>掷骰（剩 {3 - turn.rolls} 次）</button>
        </section>
      )}
      <table>
        <tbody>
          {CATS.map((cat) => (
            <tr key={cat}>
              <td>{CAT_NAMES[cat]}</td>
              {game.players.map((player) => (
                <td key={player.id}>
                  {player.sheet.scores[cat] ?? (player.id === self && legal.includes(cat) && turn ? (
                    <button type="button" onClick={() => onCommand({ type: "SCORE", cat })}>{scoreFor(turn.dice, cat, player.sheet)}</button>
                  ) : "")}
                </td>
              ))}
            </tr>
          ))}
          <tr><td>总分</td>{game.players.map((player) => <td key={player.id}>{sheetTotals(player.sheet).total}</td>)}</tr>
        </tbody>
      </table>
      {game.phase === "finished" && room.rematch && <button type="button" onClick={() => onRematch(true)}>再来一局</button>}
      {error && <p>{error}</p>}
      {notice && <p>{notice}</p>}
    </main>
  );
}
