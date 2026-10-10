import type { CSSProperties } from "react";
import {
  CAT_NAMES,
  LOWER,
  UPPER,
  UPPER_BONUS_THRESHOLD,
  earnsYachtBonus,
  legalCategories,
  scoreFor,
  sheetTotals,
  type Cat,
  type GameState,
  type LobbyMember,
  type Player,
} from "@yacht/game";
import { avatarArt, bonusIcon, catIcon, fxArt, seatOf } from "./art.js";

export interface SheetProps {
  readonly game: GameState;
  readonly members: readonly LobbyMember[];
  /** 计分表从谁的视角（填分、预览只对他）。 */
  readonly selfId: string;
  /** 显示哪几列（手机上只放两列）。 */
  readonly columns: readonly string[];
  /** 正在掷的人（高亮这一列）。 */
  readonly activeIds: readonly string[];
  /** 自己现在能填分：给出骰子。 */
  readonly myDice: readonly number[] | null;
  readonly canScore: boolean;
  readonly onScore: (cat: Cat, points: number) => void;
  /** 刚填的那一格（闪一下 / 划掉动画）：玩家 id + 格子 + 动画编号。 */
  readonly fresh: { player: string; cat: Cat; key: number } | null;
  /** 刚拿到上半区奖励的人（宝箱动画）。 */
  readonly bonusFresh: { player: string; key: number } | null;
  /** 刚刚亮出的这一轮（同时模式），这些格子闪一下。 */
  readonly revealed: { cells: { player: string; cat: Cat }[]; key: number } | null;
}

function cellTitle(player: Player, cat: Cat): string {
  const value = player.sheet.scores[cat];
  return value === undefined ? `${player.name} 的「${CAT_NAMES[cat]}」还空着` : `${player.name} 的「${CAT_NAMES[cat]}」${value} 分`;
}

export default function ScoreSheet(props: SheetProps) {
  const { game, members, selfId, columns, activeIds, myDice, canScore, onScore, fresh, bonusFresh, revealed } = props;
  const players = columns.map((id) => game.players.find((player) => player.id === id)!).filter(Boolean);
  const me = game.players.find((player) => player.id === selfId);
  const legal = canScore && myDice && me ? legalCategories(myDice, me.sheet) : [];
  const wild = canScore && myDice && me ? legal.length < 13 - Object.keys(me.sheet.scores).length : false;
  const style = { "--cols": players.length } as CSSProperties;

  const renderCell = (player: Player, cat: Cat) => {
    const value = player.sheet.scores[cat];
    const isFresh = fresh && fresh.player === player.id && fresh.cat === cat;
    const isRevealed = revealed?.cells.some((cell) => cell.player === player.id && cell.cat === cat);
    const classes = ["yt-cell"];
    if (activeIds.includes(player.id)) classes.push("active");
    if (player.id === selfId) classes.push("self");
    if (value !== undefined) {
      if (value === 0) classes.push("zero");
      if (isFresh) classes.push("fresh");
      if (isRevealed) classes.push("revealed");
      return (
        <div key={player.id} className={classes.join(" ")} title={cellTitle(player, cat)} data-tutorial={player.id === selfId ? `cell-${cat}` : undefined}>
          <span className="yt-cell-value">{value}</span>
          {value === 0 && <i key={isFresh ? `s${fresh!.key}` : "s"} className={isFresh ? "yt-scratch play" : "yt-scratch"} style={{ backgroundImage: `url(${fxArt.scratch})` }} aria-hidden="true" />}
        </div>
      );
    }
    if (player.id === selfId && myDice && canScore) {
      const points = scoreFor(myDice, cat, player.sheet);
      const ok = legal.includes(cat);
      if (!ok) {
        classes.push("locked");
        return (
          <div key={player.id} className={classes.join(" ")} title="又掷出了快艇：这次按百搭规则只能填亮着的格子" data-tutorial={`cell-${cat}`}>
            <span className="yt-cell-lock">—</span>
          </div>
        );
      }
      classes.push("pick");
      if (points === 0) classes.push("pick-zero");
      if (wild) classes.push("pick-wild");
      return (
        <button
          key={player.id}
          type="button"
          className={classes.join(" ")}
          onClick={() => onScore(cat, points)}
          title={points === 0 ? `填「${CAT_NAMES[cat]}」得 0 分（划掉）` : `填「${CAT_NAMES[cat]}」得 ${points} 分`}
          data-tutorial={`cell-${cat}`}
        >
          <span className="yt-cell-preview">{points}</span>
        </button>
      );
    }
    classes.push("empty");
    return <div key={player.id} className={classes.join(" ")} title={cellTitle(player, cat)} data-tutorial={player.id === selfId ? `cell-${cat}` : undefined} />;
  };

  const rowHead = (cat: Cat) => (
    <div className="yt-rowhead" key={`h-${cat}`}>
      <img src={catIcon(cat)} alt="" />
      <span>{CAT_NAMES[cat]}</span>
    </div>
  );

  return (
    <section className={`yt-sheet c${players.length}`} style={style} data-tutorial="sheet" aria-label="计分表">
      <div className="yt-sheet-grid">
        <div className="yt-rowhead yt-corner">计分表</div>
        {players.map((player) => {
          const member = members.find((candidate) => candidate.playerId === player.id);
          const seat = seatOf(player.color);
          return (
            <div key={player.id} className={activeIds.includes(player.id) ? "yt-colhead active" : "yt-colhead"} style={{ "--seat": seat.hex } as CSSProperties} title={player.name} data-tutorial={`col-${player.id}`}>
              <img src={avatarArt(player.color)} alt="" />
              <span>{player.id === selfId ? "你" : player.name}</span>
              {member?.bot && <em className="yt-tag bot">人机</em>}
            </div>
          );
        })}
        {UPPER.map((cat) => [rowHead(cat), ...players.map((player) => renderCell(player, cat))])}
        <div className="yt-rowhead yt-subhead" data-tutorial="upper-bonus">
          <img src={bonusIcon} alt="" />
          <span>奖励<small>满 63 +35</small></span>
        </div>
        {players.map((player) => {
          const totals = sheetTotals(player.sheet);
          const got = totals.upperBonus > 0;
          const isFresh = bonusFresh?.player === player.id;
          return (
            <div key={player.id} className={`yt-cell yt-sub${got ? " got" : ""}${activeIds.includes(player.id) ? " active" : ""}`} title={`上半区 ${totals.upper} / ${UPPER_BONUS_THRESHOLD}`}>
              {got ? <span className="yt-cell-value">+35</span> : <span className="yt-sub-progress">{totals.upper}<small>/63</small></span>}
              {isFresh && <i key={bonusFresh!.key} className="yt-bonus-fx" style={{ backgroundImage: `url(${fxArt.bonus})` }} aria-hidden="true" />}
            </div>
          );
        })}
        {LOWER.map((cat) => [rowHead(cat), ...players.map((player) => renderCell(player, cat))])}
        <div className="yt-rowhead yt-subhead">
          <img src={catIcon("LY")} alt="" />
          <span>快艇奖励<small>每次 +100</small></span>
        </div>
        {players.map((player) => (
          <div key={player.id} className={`yt-cell yt-sub${player.sheet.yachtBonuses > 0 ? " got" : ""}${activeIds.includes(player.id) ? " active" : ""}`}>
            {player.sheet.yachtBonuses > 0 ? <span className="yt-cell-value">+{player.sheet.yachtBonuses * 100}</span> : null}
            {player.id === selfId && myDice && canScore && me && earnsYachtBonus(myDice, me.sheet) && <span className="yt-cell-preview">+100</span>}
          </div>
        ))}
        <div className="yt-rowhead yt-totalhead" data-tutorial="total">总分</div>
        {players.map((player) => (
          <div key={player.id} className={`yt-cell yt-total${activeIds.includes(player.id) ? " active" : ""}`} data-tutorial={player.id === selfId ? "my-total" : undefined}>
            <span className="yt-cell-value">{sheetTotals(player.sheet).total}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
