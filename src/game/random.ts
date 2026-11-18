// 시드 난수 (mulberry32). 상태를 숫자 하나로 저장할 수 있어 전투 재현·저장에 쓴다.

export type Rng = {
  /** 0 이상 1 미만 */
  next: () => number;
  /** 지금까지 굴린 뒤의 내부 상태. 다시 createRng에 넣으면 이어서 굴린다 */
  state: () => number;
};

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => a,
  };
}

/** min 이상 max 이하 정수 */
export function rollInt(next: () => number, min: number, max: number): number {
  return min + Math.floor(next() * (max - min + 1));
}
