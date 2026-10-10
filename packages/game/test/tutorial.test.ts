import { describe, expect, it } from "vitest";
import {
  TUTORIAL_DICE,
  TUTORIAL_RIVAL,
  TUTORIAL_SELF,
  TUTORIAL_STEPS,
  anchorVisible,
  apply,
  botCommand,
  createPracticeGame,
  createTutorialGame,
  createTutorialRng,
  legalActions,
  pendingActors,
  redactGameForViewer,
  sameCommand,
  sheetTotals,
  type GameState,
  type TutorialRng,
} from "../src/index.js";

/** 按剧本走到第 upTo 步之前（不含），返回那时的局面。 */
function playScript(upTo = TUTORIAL_STEPS.length, rng: TutorialRng = createTutorialRng(1)): GameState {
  let game = createTutorialGame("小蒲");
  for (const step of TUTORIAL_STEPS.slice(0, upTo)) {
    if (step.kind === "do") game = apply(game, TUTORIAL_SELF, step.expect, rng).state;
    if (step.kind === "watch") for (const move of step.moves) game = apply(game, TUTORIAL_RIVAL, move, rng).state;
  }
  return game;
}
const stepIndex = (id: string) => TUTORIAL_STEPS.findIndex((step) => step.id === id);
const me = (game: GameState) => game.players.find((player) => player.id === TUTORIAL_SELF)!;
const dice = (game: GameState) => game.turns[TUTORIAL_SELF]!.dice;

describe("新手教程剧本（规则书 §9.8）", () => {
  it("从头走到尾：每一步要你做的都合法、轮到的是对的人，高亮的东西在界面上看得见，剧本骰子正好用完", () => {
    let game = createTutorialGame("小蒲");
    const rng = createTutorialRng(1);
    for (const step of TUTORIAL_STEPS) {
      if (step.anchor) expect(anchorVisible(game, step.anchor, TUTORIAL_SELF), `「${step.id}」高亮的 ${step.anchor} 看不见`).toBe(true);
      if (step.kind === "do") {
        expect(legalActions(game, TUTORIAL_SELF).some((command) => sameCommand(command, step.expect)), `「${step.id}」这一步不合法`).toBe(true);
        game = apply(game, TUTORIAL_SELF, step.expect, rng).state;
      }
      if (step.kind === "watch") {
        for (const move of step.moves) {
          expect(legalActions(game, TUTORIAL_RIVAL).some((command) => sameCommand(command, move)), `「${step.id}」里对手的 ${JSON.stringify(move)} 不合法`).toBe(true);
          game = apply(game, TUTORIAL_RIVAL, move, rng).state;
        }
      }
    }
    expect(rng.remaining).toBe(0);
  });

  it("关键的几幕一定发生：三颗 3 填 9、大顺 40、葫芦 25、三次没凑成填一点 2、快艇 50、又一个快艇必须填四点并 +100", () => {
    expect(dice(playScript(stepIndex("r1-explain")))).toEqual([3, 3, 3, 2, 6]);
    expect(dice(playScript(stepIndex("r2-explain")))).toEqual([2, 3, 4, 5, 6]);
    expect(dice(playScript(stepIndex("r3-score")))).toEqual([5, 5, 2, 2, 5]);
    const r4 = playScript(stepIndex("r4-explain"));
    expect(r4.turns[TUTORIAL_SELF]).toMatchObject({ dice: [1, 6, 3, 4, 1], rolls: 3 });
    expect(legalActions(r4, TUTORIAL_SELF).every((command) => command.type === "SCORE")).toBe(true);
    expect(dice(playScript(stepIndex("r5-explain")))).toEqual([6, 6, 6, 6, 6]);
    const r6 = playScript(stepIndex("r6-explain"));
    expect(dice(r6)).toEqual([4, 4, 4, 4, 4]);
    // 百搭：只有四点能填
    expect(legalActions(r6, TUTORIAL_SELF).filter((command) => command.type === "SCORE")).toEqual([{ type: "SCORE", cat: "U4" }]);
    const end = playScript();
    expect(me(end).sheet.scores).toEqual({ U3: 9, LLS: 40, LFH: 25, U1: 2, LY: 50, U4: 20 });
    expect(me(end).sheet.yachtBonuses).toBe(1);
    expect(sheetTotals(me(end).sheet).total).toBe(246);
    const rival = end.players.find((player) => player.id === TUTORIAL_RIVAL)!;
    expect(rival.sheet.scores).toEqual({ U4: 8, U6: 18, LSS: 30, L4K: 13, LFH: 25 });
    // 剧本走完轮到咕噜一号打第 6 轮，接着由人机接手打完
    expect(end.round).toBe(6);
    expect(end.players[end.currentPlayer]!.id).toBe(TUTORIAL_RIVAL);
  });

  it("剧本本身：步骤 id 不重复，最后一步是唯一的收尾，主句不空、不超过 30 个字，补充不超过两句", () => {
    const ids = TUTORIAL_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    const finales = TUTORIAL_STEPS.filter((step) => step.kind === "info" && step.finale);
    expect(finales).toHaveLength(1);
    expect(TUTORIAL_STEPS.at(-1)).toBe(finales[0]);
    for (const step of TUTORIAL_STEPS) {
      expect(step.say.trim().length).toBeGreaterThan(0);
      expect(step.say.length, step.id).toBeLessThanOrEqual(30);
      if (step.note) expect(step.note.split(/[。！？]/).filter(Boolean).length, step.id).toBeLessThanOrEqual(2);
    }
  });

  it("剧本骰子按顺序出，用完以后是普通随机数", () => {
    const rng = createTutorialRng(7);
    expect(Array.from({ length: TUTORIAL_DICE.length }, () => rng.int(6) + 1)).toEqual([...TUTORIAL_DICE]);
    expect(rng.remaining).toBe(0);
    const rolls = Array.from({ length: 200 }, () => rng.int(6) + 1);
    expect(rolls.every((face) => face >= 1 && face <= 6)).toBe(true);
    expect(new Set(rolls).size).toBe(6);
  });

  it("剧本走完接练习：两边都交给人机，120 局都能正常打完", () => {
    const stuck: string[] = [];
    for (let seed = 1; seed <= 120; seed += 1) {
      const rng = createTutorialRng(seed);
      let game = seed % 2 === 0 ? playScript(TUTORIAL_STEPS.length, rng) : createPracticeGame("小蒲", seed);
      let moves = 0;
      while (game.phase === "playing" && moves < 400) {
        const actor = pendingActors(game)[0]!;
        const command = botCommand(redactGameForViewer(game, actor), actor);
        if (!command) break;
        game = apply(game, actor, command, rng).state;
        moves += 1;
      }
      if (game.phase !== "finished" || !game.finalResult) stuck.push(`第 ${seed} 局（${moves} 步）`);
    }
    expect(stuck).toEqual([]);
  }, 60_000);
});
