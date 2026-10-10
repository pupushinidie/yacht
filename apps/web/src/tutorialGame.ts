/**
 * 快艇骰子和教程有关的部分（共用的 tutorial/ 文件夹之外，每款游戏自己写的）：
 * 游戏 id、「提示」怎么说、「第一次遇到」小贴士什么时候出。
 */
import { botDecision, pendingActors, type GameState } from "@yacht/game";

/** 本机记录（gm-tutorial-<id>、gm-tips-<id>）用的游戏 id。 */
export const GAME_ID = "yacht";

export interface Hint {
  readonly say: string;
  readonly note?: string;
  /** 高亮哪个按钮（data-tutorial）；null 不指。 */
  readonly anchor: string | null;
}

/** 「提示」：让人机从你的位置算一步（界面拿到的局面就是你能看到的那份），配一句原因。 */
export function hintFor(game: GameState, playerId: string): Hint {
  if (game.phase !== "playing") return { say: "这局已经结束了。", anchor: null };
  if (!pendingActors(game).includes(playerId)) return { say: "等轮到你再问我。", anchor: null };
  const decision = botDecision(game, playerId);
  if (!decision) return { say: "等轮到你再问我。", anchor: null };
  const { command, reason } = decision;
  if (command.type === "ROLL") {
    if (!command.reroll) return { say: "先点「掷骰」。", anchor: "roll" };
    const keep = [0, 1, 2, 3, 4].filter((index) => !command.reroll!.includes(index));
    return {
      say: "我会再掷一次。",
      note: `${reason}${keep.length > 0 ? "先点骰子把要留的留下，再点「重掷」。" : ""}`,
      anchor: keep.length === 1 ? `die-${keep[0]}` : "dice",
    };
  }
  if (command.type === "SCORE") return { say: "我会现在就填分。", note: reason, anchor: `cell-${command.cat}` };
  return { say: reason, anchor: null };
}

/** 「第一次遇到」小贴士的内容。 */
export const TIPS = {
  yacht: { title: "5 颗一样：快艇！", text: "快艇格空着就填进去拿 50。之后每再掷出一次快艇，另加 100。" },
  wild: { title: "又掷出了快艇", text: "这次要按顺序填格子，计分表上只有亮着的能点。快艇格是 50 分时还另加 100。" },
  "last-roll": { title: "掷满 3 次了", text: "不能再掷，选一格填分；凑不成就挑损失最小的一格划掉（得 0）。" },
  scratch: { title: "划掉了一格", text: "得 0 分的格子以后不能再用了。一点、二点这种本来分就少的格子最适合拿来划。" },
  bonus: { title: "上半区奖励到手", text: "一点到六点加起来满 63，奖励 35 已经算进总分。" },
  simul: { title: "这是「同时掷」房间", text: "大家同时各掷各的；别人的骰子和填的格子，一轮全填完才一起亮出来。" },
} as const;

/** 这一步该出哪些小贴士（按优先顺序；只出第一条没看过的）。 */
export function detectTips(game: GameState, selfId: string): string[] {
  const ids: string[] = [];
  const me = game.players.find((player) => player.id === selfId);
  for (const event of game.events) {
    if (event.type === "Rolled" && event.player === selfId) {
      if (event.dice.every((die) => die === event.dice[0])) ids.push(me?.sheet.scores.LY !== undefined ? "wild" : "yacht");
      if (event.rolls === 3) ids.push("last-roll");
    }
    if (event.type === "Scored" && event.record.player === selfId) {
      if (event.record.upperBonus) ids.push("bonus");
      if (event.record.points === 0) ids.push("scratch");
    }
  }
  if (game.config.mode === "simultaneous") ids.push("simul");
  return ids;
}
