/**
 * 计分表的 13 格（规则书 §2.1）：
 * 上半区 U1–U6（一点到六点）；下半区 L3K 三条、L4K 四条、LFH 葫芦、LSS 小顺、LLS 大顺、LY 快艇、LCH 机会。
 */
export type Cat = "U1" | "U2" | "U3" | "U4" | "U5" | "U6" | "L3K" | "L4K" | "LFH" | "LSS" | "LLS" | "LY" | "LCH";

/** 轮流掷（默认）或同时掷（开房选项，§8）。 */
export type PlayMode = "turns" | "simultaneous";

export interface Config {
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly mode: PlayMode;
  /** 每个决定（掷骰、填分各算一次）的限时，超时见 timeoutCommand（§9.4）。 */
  readonly stepTimeoutSec: number;
}

/** 一个人的计分表。 */
export interface Sheet {
  /** 填过的格子 → 分数（划掉是 0）。 */
  scores: Partial<Record<Cat, number>>;
  /** 拿到快艇奖励（+100）的次数。 */
  yachtBonuses: number;
}

/** 一个人这一回合的骰子。 */
export interface Turn {
  /** 5 颗骰子的点数，0 = 还没掷。 */
  dice: number[];
  /** 界面上「留下」的标记；只影响下次不带 reroll 的掷骰（§4.1）。 */
  held: boolean[];
  /** 本回合掷了几次（0–3）。 */
  rolls: number;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  /** 座位下标 0–5：座位色和头像。 */
  readonly color: number;
  sheet: Sheet;
  /** 当前总分（含两种奖励）；房间列表里当作「分数」显示。同时模式下别人看到的是上一轮结束时的分数。 */
  score: number;
}

/** 一次填分的记录。 */
export interface ScoreRecord {
  readonly player: string;
  readonly round: number;
  readonly cat: Cat;
  readonly points: number;
  /** 这次拿到了快艇奖励 +100。 */
  readonly yachtBonus: boolean;
  /** 这次是「百搭」填法（快艇格填过以后又掷出 5 颗相同）。 */
  readonly wild: boolean;
  /** 这一下让上半区达到 63，拿到 +35。 */
  readonly upperBonus: boolean;
  readonly dice: number[];
  /** 超时或托管时自动填的。 */
  readonly auto?: boolean;
}

export type GameCommand =
  /** 掷骰：第 1 次 5 颗全掷；之后 reroll 是要重掷的下标（不给就重掷没「留下」的那几颗）。 */
  | { readonly type: "ROLL"; readonly reroll?: number[] }
  /** 改「留下」的标记，不算行动，不影响计时。 */
  | { readonly type: "HOLD"; readonly held: boolean[] }
  | { readonly type: "SCORE"; readonly cat: Cat };

export type GameEvent =
  | { readonly type: "RoundStarted"; readonly round: number }
  | { readonly type: "TurnStarted"; readonly player: string }
  | { readonly type: "Rolled"; readonly player: string; readonly dice: number[]; readonly rerolled: number[]; readonly rolls: number }
  | { readonly type: "Held"; readonly player: string; readonly held: boolean[] }
  | { readonly type: "Scored"; readonly record: ScoreRecord }
  /** 同时模式：这个人这一轮填好了（不说填了哪格）。 */
  | { readonly type: "PlayerDone"; readonly player: string }
  /** 同时模式：这一轮所有人都填完了，一起亮出。 */
  | { readonly type: "RoundRevealed"; readonly round: number; readonly records: ScoreRecord[] }
  | { readonly type: "TurnTimedOut"; readonly player: string; readonly action: "roll" | "score" }
  | { readonly type: "GameEnded"; readonly winners: string[] };

/** 一个人的分数明细（§6）。 */
export interface Totals {
  readonly upper: number;
  readonly upperBonus: number;
  readonly lower: number;
  readonly yachtBonus: number;
  readonly total: number;
}

export interface FinalResult {
  /** 总分最高的人（并列时不止一个，§7）。 */
  readonly winners: string[];
  readonly totals: Record<string, Totals>;
  /** 名次：1 起，同分同名次。 */
  readonly ranks: Record<string, number>;
}

export interface GameState {
  readonly config: Config;
  phase: "playing" | "finished";
  /** 第几轮（1–13）。 */
  round: number;
  players: Player[];
  /** 轮流模式：先手的下标（每轮从他开始）。 */
  startPlayer: number;
  /** 轮流模式：当前玩家在 players 里的下标。同时模式不用（固定为先手）。 */
  currentPlayer: number;
  /** 正在掷的人的骰子。轮流模式只有当前玩家一份；同时模式每个还没填的人一份（别人的不下发）。 */
  turns: Record<string, Turn>;
  /** 同时模式：这一轮已经填好的人。 */
  done: Record<string, boolean>;
  /** 每次填分的记录，按时间顺序（同时模式下别人这一轮的不下发）。 */
  history: ScoreRecord[];
  /** 上一步产生的事件（按看的人过滤过）。 */
  events: GameEvent[];
  finalResult?: FinalResult;
  /** 每个动作 +1；网页据此判断是不是新事件。同时模式下发给每个人的是「他看得到的变化」的计数，见 redactGameForViewer。 */
  version: number;
  /** 每人做过的动作数、填分总次数：同时模式算每个人看到的 version 用。 */
  actionCount: Record<string, number>;
  scoreCount: number;
  /** 以下只在服务端：种子、随机数状态、动作序列。 */
  seed?: number;
  rngState?: number;
  log?: { player: string; command: GameCommand | { type: "TIMEOUT" } }[];
}
