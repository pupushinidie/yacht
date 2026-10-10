import type { Rng } from "../src/index.js";

/** 按剧本出点数的随机数：int(6) 依次返回 faces[i] - 1。 */
export function diceRng(faces: number[]): Rng {
  const queue = [...faces];
  const int = (max: number) => {
    if (max !== 6) throw new Error(`diceRng 只出骰子点数，收到 int(${max})`);
    const face = queue.shift();
    if (face === undefined) throw new Error("剧本里的点数用完了");
    return face - 1;
  };
  return {
    next: () => int(6) / 6,
    int,
    pick: (items) => items[0]!,
    shuffle: (items) => [...items],
    get state() {
      return queue.length;
    },
  };
}
