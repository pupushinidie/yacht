import { legalActions } from "./engine.js";
import type { GameCommand, GameState } from "./types.js";

/** 人机（占位）：从合法行动里随机挑一个。第 3 步换成正式策略。 */
export function botCommand(state: GameState, playerId: string): GameCommand | null {
  const actions = legalActions(state, playerId);
  if (actions.length === 0) return null;
  return actions[Math.floor(Math.random() * actions.length)]!;
}
