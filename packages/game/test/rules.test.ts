import { describe, expect, it } from "vitest";
import {
  CATS,
  apply,
  applyCommand,
  autoScoreCategory,
  buildState,
  createGame,
  isWild,
  legalCategories,
  rawScore,
  redactGameForViewer,
  scoreFor,
  sheetTotals,
  timeoutCommand,
  timeoutTurn,
  type Cat,
  type GameCommand,
  type GameState,
  type Sheet,
} from "../src/index.js";
import { diceRng } from "./helpers.js";

const sheet = (scores: Partial<Record<Cat, number>> = {}, yachtBonuses = 0): Sheet => ({ scores, yachtBonuses });

/** 1 人局，骰子已掷好，计分表按给定的填。 */
function solo(scores: Partial<Record<Cat, number>>, dice: number[], rolls = 1, yachtBonuses = 0): GameState {
  return buildState({ players: 1, sheets: [{ scores, yachtBonuses }], dice, rolls, round: Object.keys(scores).length + 1 });
}

function act(state: GameState, player: string, command: GameCommand, faces: number[] = []): GameState {
  return apply(state, player, command, diceRng(faces)).state;
}

describe("规则书 §10 测试用例", () => {
  it("规则书#TC1 上半区：[3,3,3,5,1]", () => {
    const dice = [3, 3, 3, 5, 1];
    expect(rawScore(dice, "U1")).toBe(1);
    expect(rawScore(dice, "U2")).toBe(0);
    expect(rawScore(dice, "U3")).toBe(9);
    expect(rawScore(dice, "U5")).toBe(5);
    expect(rawScore(dice, "U6")).toBe(0);
  });

  it("规则书#TC2 三条 / 四条 / 机会", () => {
    expect(rawScore([3, 3, 3, 5, 6], "L3K")).toBe(20);
    expect(rawScore([3, 3, 3, 5, 6], "L4K")).toBe(0);
    expect(rawScore([3, 3, 3, 5, 6], "LCH")).toBe(20);
    expect(rawScore([5, 5, 5, 5, 2], "L4K")).toBe(22);
    expect(rawScore([5, 5, 5, 5, 2], "L3K")).toBe(22);
    expect(rawScore([5, 5, 5, 5, 2], "U5")).toBe(20);
    const six = [6, 6, 6, 6, 6];
    expect([rawScore(six, "L3K"), rawScore(six, "L4K"), rawScore(six, "U6"), rawScore(six, "LCH"), rawScore(six, "LY")]).toEqual([30, 30, 30, 30, 50]);
  });

  it("规则书#TC3 葫芦（快艇格空着时 5 颗相同不算葫芦）", () => {
    expect(rawScore([2, 2, 5, 5, 5], "LFH")).toBe(25);
    expect(rawScore([2, 2, 5, 5, 6], "LFH")).toBe(0);
    expect(scoreFor([6, 6, 6, 6, 6], "LFH", sheet())).toBe(0);
    // 真的填进去也是 0
    const after = act(solo({}, [6, 6, 6, 6, 6]), "p0", { type: "SCORE", cat: "LFH" });
    expect(after.players[0]!.sheet.scores.LFH).toBe(0);
  });

  it("规则书#TC4 顺子", () => {
    expect(rawScore([1, 2, 3, 4, 6], "LSS")).toBe(30);
    expect(rawScore([1, 2, 3, 4, 6], "LLS")).toBe(0);
    expect(rawScore([3, 4, 5, 6, 6], "LSS")).toBe(30);
    expect(rawScore([1, 1, 2, 3, 4], "LSS")).toBe(30);
    expect(rawScore([1, 2, 3, 5, 6], "LSS")).toBe(0);
    expect(rawScore([1, 2, 3, 5, 6], "LLS")).toBe(0);
    expect(rawScore([2, 3, 4, 5, 6], "LLS")).toBe(40);
    const after = act(solo({}, [2, 3, 4, 5, 6]), "p0", { type: "SCORE", cat: "LSS" });
    expect(after.players[0]!.sheet.scores.LSS).toBe(30);
  });

  it("规则书#TC5 上半区奖励门槛 63", () => {
    expect(sheetTotals(sheet({ U1: 3, U2: 6, U3: 9, U4: 12, U5: 15, U6: 18 })).upperBonus).toBe(35);
    expect(sheetTotals(sheet({ U1: 3, U2: 6, U3: 9, U4: 12, U5: 10, U6: 18 })).upperBonus).toBe(0);
    // 达成的那一下记录上标出来，之后不重复加
    const state = solo({ U1: 3, U2: 6, U3: 9, U4: 12, U5: 15 }, [6, 6, 6, 1, 2]);
    const after = act(state, "p0", { type: "SCORE", cat: "U6" });
    expect(after.history.at(-1)!.upperBonus).toBe(true);
    expect(sheetTotals(after.players[0]!.sheet)).toMatchObject({ upper: 63, upperBonus: 35, total: 98 });
    const later = act(act(after, "p0", { type: "ROLL" }, [2, 2, 3, 4, 5]), "p0", { type: "SCORE", cat: "LCH" });
    expect(later.history.at(-1)!.upperBonus).toBe(false);
    expect(sheetTotals(later.players[0]!.sheet).upperBonus).toBe(35);
  });

  it("规则书#TC6 掷骰次数", () => {
    let state = createGame([{ id: "a", name: "A" }], 1);
    expect(() => act(state, "a", { type: "SCORE", cat: "LCH" })).toThrow();
    state = act(state, "a", { type: "ROLL" }, [1, 2, 3, 4, 5]);
    expect(state.turns.a!.dice.every((die) => die >= 1 && die <= 6)).toBe(true);
    expect(() => act(state, "a", { type: "ROLL", reroll: [] })).toThrow();
    state = act(state, "a", { type: "ROLL", reroll: [0, 4] }, [6, 6]);
    expect(state.turns.a!.dice).toEqual([6, 2, 3, 4, 6]);
    // 第 2 次之后把 0 号留下，第 3 次照样可以重掷它
    state = act(state, "a", { type: "HOLD", held: [true, false, false, false, false] });
    state = act(state, "a", { type: "ROLL", reroll: [0] }, [1]);
    expect(state.turns.a!.dice).toEqual([1, 2, 3, 4, 6]);
    expect(state.turns.a!.rolls).toBe(3);
    expect(() => act(state, "a", { type: "ROLL", reroll: [1] }, [1])).toThrow();
  });

  it("规则书#TC7 快艇奖励 + 百搭：先填上半区", () => {
    const state = solo({ LY: 50 }, [4, 4, 4, 4, 4]);
    expect(() => act(state, "p0", { type: "SCORE", cat: "LCH" })).toThrow();
    const after = act(state, "p0", { type: "SCORE", cat: "U4" });
    expect(after.players[0]!.sheet.scores.U4).toBe(20);
    expect(after.players[0]!.sheet.yachtBonuses).toBe(1);
    expect(sheetTotals(after.players[0]!.sheet).total).toBe(50 + 20 + 100);
  });

  it("规则书#TC8 百搭：上半区满了，填三条或四条", () => {
    const state = solo({ LY: 50, U4: 12, L4K: 0 }, [4, 4, 4, 4, 4]);
    expect(() => act(state, "p0", { type: "SCORE", cat: "LFH" })).toThrow();
    const after = act(state, "p0", { type: "SCORE", cat: "L3K" });
    expect(after.players[0]!.sheet.scores.L3K).toBe(20);
    expect(after.players[0]!.sheet.yachtBonuses).toBe(1);
  });

  it("规则书#TC9 百搭：借用固定分格", () => {
    const scores = { LY: 50, U4: 12, L3K: 18, L4K: 0, LSS: 30, U1: 1, U3: 6, U5: 10, U6: 12 };
    const state = solo(scores, [4, 4, 4, 4, 4]);
    expect(act(state, "p0", { type: "SCORE", cat: "LFH" }).players[0]!.sheet.scores.LFH).toBe(25);
    expect(act(state, "p0", { type: "SCORE", cat: "LLS" }).players[0]!.sheet.scores.LLS).toBe(40);
    expect(act(state, "p0", { type: "SCORE", cat: "LCH" }).players[0]!.sheet.scores.LCH).toBe(20);
    for (const cat of ["LFH", "LLS", "LCH"] as const) expect(act(state, "p0", { type: "SCORE", cat }).players[0]!.sheet.yachtBonuses).toBe(1);
    expect(() => act(state, "p0", { type: "SCORE", cat: "U2" })).toThrow();
  });

  it("规则书#TC10 快艇格是 0：没有奖励，百搭顺序照样适用", () => {
    const state = solo({ LY: 0, U2: 4 }, [2, 2, 2, 2, 2]);
    expect(() => act(state, "p0", { type: "SCORE", cat: "LCH" })).toThrow();
    const after = act(state, "p0", { type: "SCORE", cat: "L3K" });
    expect(after.players[0]!.sheet.scores.L3K).toBe(10);
    expect(after.players[0]!.sheet.yachtBonuses).toBe(0);
    expect(after.history.at(-1)).toMatchObject({ wild: true, yachtBonus: false });
  });

  it("规则书#TC11 百搭的最后一步：只能在上半区空格填 0", () => {
    const scores = { LY: 50, L3K: 20, L4K: 22, LFH: 25, LSS: 30, LLS: 40, LCH: 22, U5: 15, U2: 6, U3: 9, U4: 12 };
    const state = solo(scores, [5, 5, 5, 5, 5]);
    expect(legalCategories([5, 5, 5, 5, 5], state.players[0]!.sheet).sort()).toEqual(["U1", "U6"]);
    for (const cat of ["U1", "U6"] as const) {
      const after = act(state, "p0", { type: "SCORE", cat });
      expect(after.players[0]!.sheet.scores[cat]).toBe(0);
      expect(after.players[0]!.sheet.yachtBonuses).toBe(1);
    }
  });

  it("规则书#TC12 快艇格空着时掷出 5 颗相同：没有奖励，所有空格都能选", () => {
    const state = solo({}, [3, 3, 3, 3, 3]);
    expect(legalCategories([3, 3, 3, 3, 3], state.players[0]!.sheet)).toEqual([...CATS]);
    const ly = act(state, "p0", { type: "SCORE", cat: "LY" });
    expect(ly.players[0]!.sheet.scores.LY).toBe(50);
    expect(ly.players[0]!.sheet.yachtBonuses).toBe(0);
    expect(act(state, "p0", { type: "SCORE", cat: "U3" }).players[0]!.sheet.scores.U3).toBe(15);
    expect(act(state, "p0", { type: "SCORE", cat: "L4K" }).players[0]!.sheet.scores.L4K).toBe(15);
  });

  it("规则书#TC13 完整计分：§6 例 1 = 353", () => {
    const example = sheet({ U1: 3, U2: 6, U3: 9, U4: 12, U5: 20, U6: 18, L3K: 22, L4K: 0, LFH: 25, LSS: 30, LLS: 0, LY: 50, LCH: 23 }, 1);
    expect(sheetTotals(example)).toEqual({ upper: 68, upperBonus: 35, lower: 150, yachtBonus: 100, total: 353 });
  });

  it("规则书#TC14 轮次和结束：2 人各填 13 次，P2 填完第 13 格结束，240 平分并列获胜", () => {
    // 两人都按同一串骰子、同一串格子走：上半区 63 + 35，三条 28、四条 29、葫芦 25、小顺 30、大顺 0、快艇 0、
    // 最后一轮 5 颗 6 点（快艇格是 0 → 百搭，上半区、三条四条都满了，只能填机会 30），合计 240。
    const plan: { dice: number[]; cat: Cat }[] = [
      { dice: [1, 1, 1, 2, 3], cat: "U1" }, // 3
      { dice: [2, 2, 2, 1, 3], cat: "U2" }, // 6
      { dice: [3, 3, 3, 1, 2], cat: "U3" }, // 9
      { dice: [4, 4, 4, 1, 2], cat: "U4" }, // 12
      { dice: [5, 5, 5, 1, 2], cat: "U5" }, // 15
      { dice: [6, 6, 6, 1, 2], cat: "U6" }, // 18 → 63 + 35
      { dice: [6, 6, 6, 5, 5], cat: "L3K" }, // 28
      { dice: [6, 6, 6, 6, 5], cat: "L4K" }, // 29
      { dice: [2, 2, 3, 3, 3], cat: "LFH" }, // 25
      { dice: [1, 2, 3, 4, 6], cat: "LSS" }, // 30
      { dice: [1, 2, 3, 4, 6], cat: "LLS" }, // 0
      { dice: [1, 2, 3, 4, 6], cat: "LY" }, // 0
      { dice: [6, 6, 6, 6, 6], cat: "LCH" }, // 30（百搭）
    ];
    let state = createGame([{ id: "P1", name: "一" }, { id: "P2", name: "二" }], 7);
    state = { ...state, startPlayer: 0, currentPlayer: 0, turns: { P1: { dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 0 } } };
    let scoresByP2 = 0;
    for (let round = 1; round <= 13; round += 1) {
      for (const id of ["P1", "P2"]) {
        expect(state.phase).toBe("playing");
        expect(state.round).toBe(round);
        expect(state.players[state.currentPlayer]!.id).toBe(id);
        const step = plan[round - 1]!;
        state = act(state, id, { type: "ROLL" }, step.dice);
        state = act(state, id, { type: "SCORE", cat: step.cat });
        if (id === "P2") scoresByP2 += 1;
      }
    }
    expect(scoresByP2).toBe(13);
    expect(state.phase).toBe("finished");
    expect(state.round).toBe(13);
    expect(state.finalResult!.totals.P1!.total).toBe(240);
    expect(state.finalResult!.totals.P2!.total).toBe(240);
    expect(state.finalResult!.winners).toEqual(["P1", "P2"]);
    expect(state.finalResult!.ranks).toEqual({ P1: 1, P2: 1 });
    expect(() => act(state, "P1", { type: "ROLL" }, [1, 1, 1, 1, 1])).toThrow();
  });

  it("规则书#TC15 同时模式：别人的骰子和这一轮填的格不下发，最后一人填完一起亮出", () => {
    let state = createGame([{ id: "P1", name: "一" }, { id: "P2", name: "二" }, { id: "P3", name: "三" }], 3, { mode: "simultaneous" });
    state = act(state, "P1", { type: "ROLL" }, [6, 6, 6, 2, 3]);
    state = act(state, "P1", { type: "SCORE", cat: "U6" });
    state = act(state, "P2", { type: "ROLL" }, [1, 2, 3, 4, 5]);
    state = act(state, "P2", { type: "SCORE", cat: "LLS" });
    state = act(state, "P3", { type: "ROLL" }, [5, 5, 1, 1, 2]);
    expect(state.round).toBe(1);
    const p1 = redactGameForViewer(state, "P1");
    expect(p1.turns.P3).toBeUndefined();
    expect(p1.players[1]!.sheet.scores.LLS).toBeUndefined();
    expect(p1.players[1]!.score).toBe(0);
    expect(p1.history.map((record) => record.player)).toEqual(["P1"]);
    expect(p1.done).toEqual({ P1: true, P2: true });
    const p2 = redactGameForViewer(state, "P2");
    expect(p2.players[0]!.sheet.scores.U6).toBeUndefined();
    expect(JSON.stringify(p2)).not.toContain("5,5,1,1,2");
    // P1 这一轮已经填过，不能再掷
    expect(() => act(state, "P1", { type: "ROLL" }, [1, 1, 1, 1, 1])).toThrow();
    state = act(state, "P3", { type: "SCORE", cat: "U5" });
    expect(state.round).toBe(2);
    const after = redactGameForViewer(state, "P1");
    expect(after.players.map((player) => player.score)).toEqual([18, 40, 10]);
    expect(after.history.map((record) => record.cat)).toEqual(["U6", "LLS", "U5"]);
    expect(after.events.find((event) => event.type === "RoundRevealed")).toMatchObject({ round: 1 });
  });
});

describe("规则书 §2.1 计分表", () => {
  it("§2.1 13 格、上半区按个数算、划掉得 0", () => {
    expect(CATS).toHaveLength(13);
    expect(rawScore([2, 2, 2, 2, 6], "U2")).toBe(8);
    expect(rawScore([2, 2, 2, 2, 6], "U5")).toBe(0);
    const after = act(solo({}, [1, 2, 3, 5, 6]), "p0", { type: "SCORE", cat: "LY" });
    expect(after.players[0]!.sheet.scores.LY).toBe(0);
    expect(after.history.at(-1)!.points).toBe(0);
  });
  it("§2.1 葫芦要求两个点数不同；四条也满足三条；大顺也满足小顺", () => {
    expect(rawScore([4, 4, 4, 4, 1], "LFH")).toBe(0);
    expect(rawScore([1, 1, 6, 6, 6], "LFH")).toBe(25);
    expect(rawScore([1, 1, 1, 1, 6], "L3K")).toBe(10);
    expect(rawScore([1, 2, 3, 4, 5], "LSS")).toBe(30);
    expect(rawScore([1, 2, 4, 5, 6], "LSS")).toBe(0);
    expect(rawScore([1, 3, 4, 5, 6], "LSS")).toBe(30);
  });
});

describe("规则书 §3 开局", () => {
  it("§3 每人空白计分表，随机先手，按座位顺时针", () => {
    const starts = new Set<number>();
    for (let seed = 0; seed < 40; seed += 1) {
      const state = createGame(["a", "b", "c", "d"].map((id) => ({ id, name: id })), seed);
      starts.add(state.startPlayer);
      expect(state.players.every((player) => Object.keys(player.sheet.scores).length === 0)).toBe(true);
      expect(state.round).toBe(1);
      expect(Object.keys(state.turns)).toEqual([state.players[state.startPlayer]!.id]);
    }
    expect(starts.size).toBe(4);
    let state = createGame(["a", "b", "c"].map((id) => ({ id, name: id })), 5);
    const first = state.currentPlayer;
    const id = state.players[first]!.id;
    state = act(act(state, id, { type: "ROLL" }, [1, 1, 1, 1, 2]), id, { type: "SCORE", cat: "U1" });
    expect(state.currentPlayer).toBe((first + 1) % 3);
  });
  it("§3/§8 1 人到 6 人都能开局，7 人不行", () => {
    for (let count = 1; count <= 6; count += 1) expect(() => createGame(Array.from({ length: count }, (_, i) => ({ id: `${i}`, name: `${i}` })), 1)).not.toThrow();
    expect(() => createGame(Array.from({ length: 7 }, (_, i) => ({ id: `${i}`, name: `${i}` })), 1)).toThrow();
    expect(() => createGame([], 1)).toThrow();
  });
});

describe("规则书 §4.1 掷骰", () => {
  it("§4.1 不带 reroll 时重掷没留下的；留下的骰子不动；重掷的那颗不再留下", () => {
    let state = solo({}, [1, 2, 3, 4, 5]);
    state = act(state, "p0", { type: "HOLD", held: [true, false, true, false, false] });
    state = act(state, "p0", { type: "ROLL" }, [6, 6, 6]);
    expect(state.turns.p0!.dice).toEqual([1, 6, 3, 6, 6]);
    expect(state.turns.p0!.held).toEqual([true, false, true, false, false]);
    state = act(state, "p0", { type: "ROLL", reroll: [0] }, [2]);
    expect(state.turns.p0!.held[0]).toBe(false);
  });
  it("§4.1 全部留下又不带 reroll → 拒绝；reroll 下标越界、重复 → 拒绝；第 1 次只给部分下标 → 拒绝", () => {
    let state = solo({}, [1, 2, 3, 4, 5]);
    state = act(state, "p0", { type: "HOLD", held: [true, true, true, true, true] });
    expect(() => act(state, "p0", { type: "ROLL" }, [1])).toThrow();
    expect(() => act(state, "p0", { type: "ROLL", reroll: [5] }, [1])).toThrow();
    expect(() => act(state, "p0", { type: "ROLL", reroll: [1, 1] }, [1, 1])).toThrow();
    const fresh = createGame([{ id: "a", name: "A" }], 1);
    expect(() => act(fresh, "a", { type: "ROLL", reroll: [0, 1] }, [1, 1])).toThrow();
    expect(act(fresh, "a", { type: "ROLL", reroll: [4, 3, 2, 1, 0] }, [1, 2, 3, 4, 5]).turns.a!.dice).toEqual([1, 2, 3, 4, 5]);
  });
  it("§4.1 「留下」只是标记：不改骰子、不算掷骰次数；没掷前不能留", () => {
    const state = solo({}, [1, 2, 3, 4, 5], 2);
    const held = act(state, "p0", { type: "HOLD", held: [false, true, false, true, false] });
    expect(held.turns.p0!.dice).toEqual([1, 2, 3, 4, 5]);
    expect(held.turns.p0!.rolls).toBe(2);
    expect(() => act(createGame([{ id: "a", name: "A" }], 1), "a", { type: "HOLD", held: [true, true, true, true, true] })).toThrow();
    expect(() => act(state, "p0", { type: "HOLD", held: [true] })).toThrow();
  });
  it("§4.1 骰子点数由传进来的随机数决定（服务器掷），apply 不改输入", () => {
    const state = createGame([{ id: "a", name: "A" }], 9);
    const before = JSON.stringify(state);
    const after = act(state, "a", { type: "ROLL" }, [6, 5, 4, 3, 2]);
    expect(after.turns.a!.dice).toEqual([6, 5, 4, 3, 2]);
    expect(JSON.stringify(state)).toBe(before);
    expect(after.version).toBe(state.version + 1);
  });
});

describe("规则书 §4.2 填分", () => {
  it("§4.2 掷完第 1 次就能填；填过的格不能再填；填完换下一位并清空骰子", () => {
    let state = buildState({ players: 2, sheets: [{ scores: { U1: 2 } }], dice: [1, 2, 3, 4, 5], rolls: 1, round: 2 });
    expect(() => act(state, "p0", { type: "SCORE", cat: "U1" })).toThrow();
    expect(() => act(state, "p0", { type: "SCORE", cat: "XX" as Cat })).toThrow();
    state = act(state, "p0", { type: "SCORE", cat: "LLS" });
    expect(state.players[0]!.sheet.scores.LLS).toBe(40);
    expect(state.currentPlayer).toBe(1);
    expect(state.turns).toEqual({ p1: { dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 0 } });
    expect(state.players[0]!.score).toBe(42);
  });
  it("§4.2 不是自己的回合不能动", () => {
    const state = buildState({ players: 2, dice: [1, 2, 3, 4, 5], rolls: 1 });
    expect(() => act(state, "p1", { type: "SCORE", cat: "U1" })).toThrow();
    expect(() => act(state, "p1", { type: "ROLL" }, [1, 1, 1, 1, 1])).toThrow();
    expect(() => act(state, "zz", { type: "ROLL" }, [1, 1, 1, 1, 1])).toThrow();
  });
});

describe("规则书 §4.3 公开信息", () => {
  it("§4.3 轮流模式：所有人都看得到当前玩家的骰子、留下和每个人的计分表；种子和随机数状态谁都拿不到", () => {
    const state = buildState({ players: 3, sheets: [{ scores: { U1: 3 } }, { scores: { LCH: 20 } }], current: 1, dice: [2, 2, 3, 4, 6], rolls: 2, held: [true, true, false, false, false], round: 2 });
    state.rngState = 123456;
    state.log = [{ player: "p0", command: { type: "ROLL" } }];
    for (const viewer of ["p0", "p1", "p2", ""]) {
      const view = redactGameForViewer(state, viewer);
      expect(view.turns.p1).toEqual(state.turns.p1);
      expect(view.players[1]!.sheet.scores.LCH).toBe(20);
      expect(view.seed).toBeUndefined();
      expect(view.rngState).toBeUndefined();
      expect(view.log).toBeUndefined();
      expect(view.version).toBe(state.version);
    }
  });
});

describe("规则书 §4.4 快艇奖励和百搭", () => {
  it("§4.4 只有快艇格填过才算百搭；快艇格 50 才有 +100", () => {
    expect(isWild([2, 2, 2, 2, 2], sheet())).toBe(false);
    expect(isWild([2, 2, 2, 2, 2], sheet({ LY: 0 }))).toBe(true);
    expect(isWild([2, 2, 2, 2, 3], sheet({ LY: 50 }))).toBe(false);
  });
  it("§4.4 奖励每次都加，没有上限（第 4 次也 +100）", () => {
    let state = solo({ LY: 50 }, [1, 1, 1, 1, 1], 1, 3);
    state = act(state, "p0", { type: "SCORE", cat: "U1" });
    expect(state.players[0]!.sheet.yachtBonuses).toBe(4);
    expect(sheetTotals(state.players[0]!.sheet).yachtBonus).toBe(400);
  });
  it("§4.4 步骤 2：三条、四条都空时两格都能选（自己选）", () => {
    expect(legalCategories([3, 3, 3, 3, 3], sheet({ LY: 50, U3: 9 })).sort()).toEqual(["L3K", "L4K"]);
  });
  it("§4.4 步骤 3：借用葫芦/小顺/大顺按固定分，机会按总和；快艇格是 0 时借用照样给固定分", () => {
    const full = { LY: 0, U6: 18, L3K: 20, L4K: 20 };
    expect(legalCategories([6, 6, 6, 6, 6], sheet(full)).sort()).toEqual(["LCH", "LFH", "LLS", "LSS"]);
    expect(scoreFor([6, 6, 6, 6, 6], "LSS", sheet(full))).toBe(30);
    expect(scoreFor([6, 6, 6, 6, 6], "LCH", sheet(full))).toBe(30);
    const after = act(solo(full, [6, 6, 6, 6, 6]), "p0", { type: "SCORE", cat: "LLS" });
    expect(after.players[0]!.sheet.scores.LLS).toBe(40);
    expect(after.players[0]!.sheet.yachtBonuses).toBe(0);
  });
  it("§4.4 步骤 3 时不能去上半区别的空格，步骤 1 时不能填下半区", () => {
    expect(legalCategories([6, 6, 6, 6, 6], sheet({ LY: 50 }))).toEqual(["U6"]);
    expect(legalCategories([6, 6, 6, 6, 6], sheet({ LY: 50, U6: 24, L3K: 1, L4K: 1 }))).not.toContain("U1");
  });
  it("§4.4 不是 5 颗相同时，快艇格填过也只按普通规则（所有空格）", () => {
    expect(legalCategories([6, 6, 6, 6, 5], sheet({ LY: 50 })).length).toBe(12);
  });
});

describe("规则书 §5 特殊情况和边界", () => {
  it("§5-1 没有可得分的格也必须选一格填 0（第 13 轮只剩 1 格也有合法填分）", () => {
    const scores = Object.fromEntries(CATS.filter((cat) => cat !== "LLS").map((cat) => [cat, 1]));
    const state = solo(scores, [1, 1, 2, 2, 4]);
    expect(legalCategories([1, 1, 2, 2, 4], state.players[0]!.sheet)).toEqual(["LLS"]);
    const after = act(state, "p0", { type: "SCORE", cat: "LLS" });
    expect(after.players[0]!.sheet.scores.LLS).toBe(0);
    expect(after.phase).toBe("finished");
  });
  it("§5-7 一回合中途掷出快艇不算，只按填分时的最终骰子判断", () => {
    let state = solo({ LY: 50 }, [4, 4, 4, 4, 4]);
    state = act(state, "p0", { type: "ROLL", reroll: [4] }, [2]);
    const after = act(state, "p0", { type: "SCORE", cat: "LCH" });
    expect(after.players[0]!.sheet.yachtBonuses).toBe(0);
    expect(after.players[0]!.sheet.scores.LCH).toBe(18);
  });
  it("§5-9 平分：并列获胜，名次相同；三人里两人并列第一时第三名是 3", () => {
    const tie = buildState({ players: 3, sheets: [{ scores: { LCH: 20 } }, { scores: { LCH: 20 } }, { scores: { LCH: 5 } }], finished: true });
    expect(tie.finalResult!.winners).toEqual(["p0", "p1"]);
    expect(tie.finalResult!.ranks).toEqual({ p0: 1, p1: 1, p2: 3 });
  });
});

describe("规则书 §6 计分", () => {
  it("§6 例 2：上半区每格三颗 = 63 有奖励；五点只有两颗 = 58 没有", () => {
    expect(sheetTotals(sheet({ U1: 3, U2: 6, U3: 9, U4: 12, U5: 15, U6: 18 })).total).toBe(98);
    expect(sheetTotals(sheet({ U1: 3, U2: 6, U3: 9, U4: 12, U5: 10, U6: 18 })).total).toBe(58);
  });
  it("§6 总分 = 上半区 + 奖励 + 下半区 + 快艇奖励；player.score 每次填分后更新", () => {
    const state = act(solo({ U1: 3, LY: 50 }, [5, 5, 5, 5, 5], 1, 0), "p0", { type: "SCORE", cat: "U5" });
    expect(state.players[0]!.score).toBe(3 + 50 + 25 + 100);
  });
});

describe("规则书 §7 结束与胜负", () => {
  it("§7 1 人局打完 13 轮结束；结算有每人的明细", () => {
    let state = createGame([{ id: "a", name: "A" }], 2);
    for (let round = 1; round <= 13; round += 1) {
      expect(state.round).toBe(round);
      state = act(state, "a", { type: "ROLL" }, [1, 2, 3, 4, 6]);
      const cat = legalCategories(state.turns.a!.dice, state.players[0]!.sheet)[0]!;
      state = act(state, "a", { type: "SCORE", cat });
    }
    expect(state.phase).toBe("finished");
    expect(state.finalResult!.winners).toEqual(["a"]);
    expect(state.finalResult!.totals.a!.total).toBe(state.players[0]!.score);
  });
  it("§7 最后一轮先手不是座位 0 时，最后一个填的是先手的上家", () => {
    let state = buildState({ players: 3, startPlayer: 1, current: 0, round: 13, sheets: [sampleFull("LCH"), sampleFull(), sampleFull()], dice: [1, 2, 3, 4, 5], rolls: 1 });
    state = act(state, "p0", { type: "SCORE", cat: "LCH" });
    expect(state.phase).toBe("finished");
  });
});

function sampleFull(except?: Cat) {
  return { scores: Object.fromEntries(CATS.filter((cat) => cat !== except).map((cat) => [cat, 1])) as Partial<Record<Cat, number>> };
}

describe("规则书 §8 同时掷", () => {
  it("§8 每人一套骰子，各掷各的；一轮全员填完才进下一轮；round 结束时所有人都换新骰子", () => {
    let state = createGame([{ id: "a", name: "A" }, { id: "b", name: "B" }], 4, { mode: "simultaneous" });
    expect(Object.keys(state.turns).sort()).toEqual(["a", "b"]);
    state = act(state, "b", { type: "ROLL" }, [1, 1, 1, 1, 1]);
    state = act(state, "a", { type: "ROLL" }, [2, 2, 2, 2, 2]);
    expect(state.turns.a!.dice).toEqual([2, 2, 2, 2, 2]);
    expect(state.turns.b!.dice).toEqual([1, 1, 1, 1, 1]);
    state = act(state, "b", { type: "SCORE", cat: "LY" });
    expect(state.done).toEqual({ b: true });
    expect(state.turns.b).toBeUndefined();
    expect(() => act(state, "b", { type: "ROLL" }, [1, 1, 1, 1, 1])).toThrow();
    state = act(state, "a", { type: "SCORE", cat: "LY" });
    expect(state.round).toBe(2);
    expect(state.done).toEqual({});
    expect(state.turns.a!.rolls).toBe(0);
    expect(state.turns.b!.rolls).toBe(0);
  });
  it("§8/§9.3 同时模式下别人掷骰、留下不会让我看到的 version 变；填好会变", () => {
    let state = createGame([{ id: "a", name: "A" }, { id: "b", name: "B" }], 4, { mode: "simultaneous" });
    const v0 = redactGameForViewer(state, "a").version;
    state = act(state, "b", { type: "ROLL" }, [1, 2, 3, 4, 5]);
    state = act(state, "b", { type: "HOLD", held: [true, true, true, true, false] });
    state = act(state, "b", { type: "ROLL" }, [5]);
    const v1 = redactGameForViewer(state, "a");
    expect(v1.version).toBe(v0);
    expect(v1.events).toEqual([]);
    state = act(state, "b", { type: "SCORE", cat: "LLS" });
    const v2 = redactGameForViewer(state, "a");
    expect(v2.version).toBe(v0 + 1);
    expect(v2.events).toEqual([{ type: "PlayerDone", player: "b" }]);
    expect(redactGameForViewer(state, "b").version).toBeGreaterThan(v2.version);
    // 观战「看全部」看得到别人这一轮的骰子和填分
    const all = redactGameForViewer(state, "", { seeAll: true });
    expect(all.players[1]!.sheet.scores.LLS).toBe(40);
    expect(all.seed).toBeUndefined();
    const plain = redactGameForViewer(state, "");
    expect(plain.players[1]!.sheet.scores.LLS).toBeUndefined();
  });
  it("§8 同时模式下拿了快艇奖励，别人在这一轮结束前也看不到奖励次数和总分", () => {
    let state = buildState({ players: 2, mode: "simultaneous", sheets: [{ scores: { LY: 50 } }, { scores: { LCH: 10 } }], round: 2, dice: [3, 3, 3, 3, 3], rolls: 1 });
    state = act(state, "p0", { type: "SCORE", cat: "U3" });
    const view = redactGameForViewer(state, "p1");
    expect(view.players[0]!.sheet.yachtBonuses).toBe(0);
    expect(view.players[0]!.score).toBe(50);
    expect(redactGameForViewer(state, "p0").players[0]!.score).toBe(165);
  });
  it("§8 同时模式第 13 轮最后一人填完：结束，所有人的分都亮出", () => {
    let state = buildState({ players: 2, mode: "simultaneous", sheets: [sampleFull("U1"), sampleFull("U2")], round: 13, dice: [1, 1, 2, 2, 2], rolls: 1 });
    state = act(state, "p1", { type: "SCORE", cat: "U2" });
    expect(state.phase).toBe("playing");
    expect(redactGameForViewer(state, "p0").players[1]!.sheet.scores.U2).toBeUndefined();
    state = act(state, "p0", { type: "SCORE", cat: "U1" });
    expect(state.phase).toBe("finished");
    const view = redactGameForViewer(state, "p0");
    expect(view.players[1]!.sheet.scores.U2).toBe(6);
    expect(view.finalResult!.totals.p1!.total).toBe(12 + 6);
  });
});

describe("规则书 §9.4 超时", () => {
  it("§9.4 还没掷 → 自动掷；掷过 → 按最高分格填，不再重掷", () => {
    const fresh = createGame([{ id: "a", name: "A" }], 1);
    expect(timeoutCommand(fresh, "a")).toEqual({ type: "ROLL" });
    const rolled = timeoutTurn(fresh, "a");
    expect(rolled.turns.a!.rolls).toBe(1);
    expect(rolled.events[0]).toEqual({ type: "TurnTimedOut", player: "a", action: "roll" });
    const state = solo({}, [6, 6, 6, 6, 2]);
    expect(timeoutCommand(state, "p0")).toEqual({ type: "SCORE", cat: "L3K" });
    const after = timeoutTurn(state, "p0");
    expect(after.players[0]!.sheet.scores.L3K).toBe(26);
    expect(after.history.at(-1)!.auto).toBe(true);
  });
  it("§9.4 同分时：先上半区（划 0 先划一点），再固定分格；不主动把快艇格填 0", () => {
    // [2,3,4,5,6]：大顺 40 最高
    expect(autoScoreCategory([2, 3, 4, 5, 6], sheet())).toBe("LLS");
    // 只剩 一点、快艇、大顺：都是 0 → 划一点
    const late = sheet(Object.fromEntries(CATS.filter((cat) => !["U1", "LY", "LLS"].includes(cat)).map((cat) => [cat, 5])));
    expect(autoScoreCategory([2, 2, 3, 4, 6], late)).toBe("U1");
    // 只剩快艇和大顺：划大顺，不划快艇
    const late2 = sheet(Object.fromEntries(CATS.filter((cat) => !["LY", "LLS"].includes(cat)).map((cat) => [cat, 5])));
    expect(autoScoreCategory([2, 2, 3, 4, 6], late2)).toBe("LLS");
    // 只剩快艇：只能填它
    const late3 = sheet(Object.fromEntries(CATS.filter((cat) => cat !== "LY").map((cat) => [cat, 5])));
    expect(autoScoreCategory([2, 2, 3, 4, 6], late3)).toBe("LY");
    // 同分 10：五点 10 vs 机会……[5,5,0]：上半区 U5=10 与 L3K? 不成立；三点 9 < 机会：机会最高
    expect(autoScoreCategory([5, 5, 1, 2, 3], sheet())).toBe("LCH");
  });
  it("§9.4 超时也遵守百搭顺序", () => {
    expect(autoScoreCategory([4, 4, 4, 4, 4], sheet({ LY: 50 }))).toBe("U4");
  });
  it("§9.4 同时模式每个人各自超时，互不影响", () => {
    let state = createGame([{ id: "a", name: "A" }, { id: "b", name: "B" }], 4, { mode: "simultaneous" });
    state = timeoutTurn(state, "b");
    expect(state.turns.b!.rolls).toBe(1);
    expect(state.turns.a!.rolls).toBe(0);
    state = timeoutTurn(state, "b");
    expect(state.done.b).toBe(true);
    expect(timeoutCommand(state, "b")).toBeNull();
  });
});

describe("非法输入", () => {
  it("对局结束后任何行动都拒绝；未知行动拒绝；applyCommand 用 state 里的随机数状态", () => {
    const finished = buildState({ players: 1, sheets: [sampleFull()], finished: true });
    expect(() => act(finished, "p0", { type: "ROLL" }, [1, 1, 1, 1, 1])).toThrow();
    const state = createGame([{ id: "a", name: "A" }], 77);
    expect(() => act(state, "a", { type: "NOPE" } as unknown as GameCommand)).toThrow();
    const one = applyCommand(state, "a", { type: "ROLL" });
    const two = applyCommand(state, "a", { type: "ROLL" });
    expect(one.turns.a!.dice).toEqual(two.turns.a!.dice);
    expect(one.rngState).not.toBe(state.rngState);
  });
});
