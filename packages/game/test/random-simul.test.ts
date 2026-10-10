import { describe, expect, it } from "vitest";
import { GAMES, playRandom } from "./randomPlay.js";

describe("随机对局（同时模式，每种人数 300 局）", () => {
  for (let players = 1; players <= 6; players += 1) {
    it(`同时 ${players} 人 × ${GAMES} 局：不卡死、计分对、隐藏信息不漏`, () => {
      const failures: string[] = [];
      for (let game = 0; game < GAMES; game += 1) {
        const seed = 1000 * players + game;
        const problems = playRandom(players, "simultaneous", seed);
        if (problems.length > 0) failures.push(`种子 ${seed}：${problems.slice(0, 3).join("；")}`);
      }
      expect(failures.slice(0, 5)).toEqual([]);
    }, 120_000);
  }
});
