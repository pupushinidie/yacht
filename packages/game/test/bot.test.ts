import { describe, expect, it } from "vitest";
import {
  CATS,
  applyCommand,
  botCommand,
  botDecision,
  buildState,
  createGame,


  redactGameForViewer,
  type Cat,


} from "../src/index.js";

/** 1 人局，骰子已掷好（自己是 p0），喂给人机的是 redact 过的状态。 */
function decide(scores: Partial<Record<Cat, number>>, dice: number[], rolls: number, yachtBonuses = 0) {
  const state = buildState({ players: 1, sheets: [{ scores, yachtBonuses }], dice, rolls, round: Object.keys(scores).length + 1 });
  return botDecision(redactGameForViewer(state, "p0"), "p0")!;
}
const full = (except: Cat[]) => Object.fromEntries(CATS.filter((cat) => !except.includes(cat)).map((cat) => [cat, 10])) as Partial<Record<Cat, number>>;

describe("人机：只看自己座位的视角", () => {
  it("没 redact 的状态（带种子）直接拒绝", () => {
    const state = createGame([{ id: "a", name: "A" }], 1);
    expect(() => botCommand(state, "a")).toThrow();
    expect(botCommand(redactGameForViewer(state, "a"), "a")).toEqual({ type: "ROLL" });
  });
  it("同时模式：redact 后看不到别人的骰子也照样能走", () => {
    let state = createGame([{ id: "a", name: "A" }, { id: "b", name: "B" }], 3, { mode: "simultaneous" });
    state = applyCommand(state, "b", { type: "ROLL" });
    const view = redactGameForViewer(state, "a");
    expect(view.turns.b).toBeUndefined();
    expect(botCommand(view, "a")).toEqual({ type: "ROLL" });
  });
});

describe("人机：关键决策（规则书 §9.7）", () => {
  it("第 1 掷有 4 个连续 → 留顺子重掷多出来的那颗", () => {
    const decision = decide({}, [1, 2, 3, 4, 6], 1);
    expect(decision.command).toEqual({ type: "ROLL", reroll: [4] });
    expect(decision.reason).toContain("顺");
  });
  it("3 颗相同 → 留下三颗重掷另外两颗", () => {
    expect(decide({}, [5, 2, 5, 1, 5], 1).command).toEqual({ type: "ROLL", reroll: [1, 3] });
  });
  it("两对、葫芦还空着而且别的格用不上 → 掷一颗去凑葫芦", () => {
    const decision = decide(full(["LFH", "LCH", "U1"]), [2, 2, 5, 5, 1], 2);
    expect(decision.command).toEqual({ type: "ROLL", reroll: [4] });
    expect(decision.reason).toContain("葫芦");
  });
  it("前期两对 5 和 2 → 留下一对 5 去凑更多 5 点（上半区要紧）", () => {
    expect(decide({}, [2, 2, 5, 5, 1], 1).command).toEqual({ type: "ROLL", reroll: [0, 1, 4] });
  });
  it("掷满 3 次只填分，不再重掷", () => {
    expect(decide({}, [1, 2, 2, 4, 6], 3).command.type).toBe("SCORE");
  });
  it("大顺到手直接填 40", () => {
    expect(decide({}, [6, 2, 3, 4, 5], 1).command).toEqual({ type: "SCORE", cat: "LLS" });
  });
  it("快艇格空着掷出快艇 → 填快艇 50", () => {
    const decision = decide({ U6: 18 }, [6, 6, 6, 6, 6], 2);
    expect(decision.command).toEqual({ type: "SCORE", cat: "LY" });
    expect(decision.reason).toContain("50");
  });
  it("百搭：快艇格 50 又掷出快艇 → 按顺序填四点格（拿 +100）", () => {
    const decision = decide({ LY: 50 }, [4, 4, 4, 4, 4], 1);
    expect(decision.command).toEqual({ type: "SCORE", cat: "U4" });
    expect(decision.reason).toContain("+100");
  });
  it("百搭第 3 步：挑分最高的大顺借用", () => {
    expect(decide({ LY: 50, U4: 12, L3K: 20, L4K: 20 }, [4, 4, 4, 4, 4], 3).command).toEqual({ type: "SCORE", cat: "LLS" });
  });
  it("前期凑不成：不在五点、六点、快艇上划 0", () => {
    const decision = decide({}, [1, 1, 2, 2, 4], 3);
    expect(decision.command.type).toBe("SCORE");
    expect(["U5", "U6", "LY", "LLS"]).not.toContain((decision.command as { cat: Cat }).cat);
  });
  it("后期必须划 0：先划一点，不划快艇", () => {
    const decision = decide(full(["U1", "LY", "LLS"]), [2, 2, 3, 5, 6], 3);
    expect(decision.command).toEqual({ type: "SCORE", cat: "U1" });
    expect(decision.reason).toContain("划掉");
  });
  it("只剩一格时全力为它服务：只剩快艇，留下最多的那种点数", () => {
    const decision = decide(full(["LY"]), [3, 3, 3, 1, 6], 1);
    expect(decision.command).toEqual({ type: "ROLL", reroll: [3, 4] });
  });
  it("差一点拿上半区奖励：三颗 6 填六点格", () => {
    const decision = decide({ U1: 3, U2: 6, U3: 9, U4: 12, U5: 15 }, [6, 6, 6, 2, 5], 3);
    expect(decision.command).toEqual({ type: "SCORE", cat: "U6" });
    expect(decision.reason).toContain("35");
  });
  it("每一步都有一句理由", () => {
    for (const [dice, rolls] of [[[1, 2, 3, 4, 6], 1], [[2, 2, 2, 5, 6], 2], [[1, 3, 5, 6, 6], 3]] as const) {
      expect(decide({}, [...dice], rolls).reason.length).toBeGreaterThan(5);
    }
  });
});

