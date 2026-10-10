import { describe, expect, it } from "vitest";
import { applyCommand, botCommand, createGame, legalActions, pendingActors, redactGameForViewer, type GameCommand, type GameState } from "../src/index.js";

describe("人机自对弈（每种人数 300 局，轮流和同时）", () => {
  for (let players = 1; players <= 3; players += 1) {
    it(`${players} 人 × 300 局：每步合法、不死循环、耗时达标`, () => {
      const problems: string[] = [];
      const times: number[] = [];
      for (let game = 0; game < 300; game += 1) {
        const mode = game % 2 === 0 ? "turns" : "simultaneous";
        let state: GameState = createGame(Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `p${i}` })), 77_000 + players * 1000 + game, { mode });
        let steps = 0;
        while (state.phase === "playing") {
          if ((steps += 1) > 13 * players * 4) {
            problems.push(`第 ${game} 局超过最大步数`);
            break;
          }
          const id = pendingActors(state)[steps % pendingActors(state).length]!;
          const t0 = performance.now();
          const command = botCommand(redactGameForViewer(state, id), id) as GameCommand;
          times.push(performance.now() - t0);
          if (!legalActions(state, id).some((action) => JSON.stringify(action) === JSON.stringify(command))) {
            problems.push(`第 ${game} 局非法行动 ${JSON.stringify(command)}`);
            break;
          }
          state = applyCommand(state, id, command);
        }
      }
      expect(problems.slice(0, 3)).toEqual([]);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      expect(mean).toBeLessThan(50);
      expect(Math.max(...times)).toBeLessThan(300);
    }, 120_000);
  }
});
