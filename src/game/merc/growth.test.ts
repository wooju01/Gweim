import { describe, expect, it } from "vitest";
import { GROWTH } from "@/data/growth";
import { NO_GROWTH, canPromote, gainXp, validTraining, xpToNext } from "./growth";

describe("성장", () => {
  it("경험치가 차면 레벨업하고, 직업 성장표대로 스탯 3이 붙고 단련 기회가 생긴다", () => {
    const { growth, gained } = gainXp(NO_GROWTH, 5, "knight");
    expect(growth).toMatchObject({ lv: 1, xp: 0, trainable: 1, stats: { defense: 2, hp: 1 } });
    expect(gained).toEqual([GROWTH.knight]);
  });

  it("한 번에 여러 레벨도 오르고, 레벨 3에서 멈춘다 (승급 전까지 경험치가 쌓이지 않는다)", () => {
    const { growth, gained } = gainXp(NO_GROWTH, 100, "mage");
    expect(gained).toHaveLength(3);
    expect(growth).toMatchObject({ lv: 3, xp: 0, trainable: 3, stats: { mag: 6, speed: 3 } });
    expect(canPromote(growth)).toBe(true);
    expect(xpToNext(3)).toBeNull();
  });

  it("모자란 경험치는 남는다", () => {
    expect(gainXp(NO_GROWTH, 7, "nun").growth).toMatchObject({ lv: 1, xp: 2 });
  });

  it("모든 직업의 성장표는 합이 3", () => {
    for (const [job, g] of Object.entries(GROWTH)) {
      expect(Object.values(g).reduce((a, b) => a + (b ?? 0), 0), job).toBe(3);
    }
  });

  it("단련장 배분은 정확히 3점, 음수·없는 스탯은 안 된다", () => {
    expect(validTraining({ crit: 2, faith: 1 })).toBe(true);
    expect(validTraining({ str: 2 })).toBe(false);
    expect(validTraining({ str: 4, hp: -1 })).toBe(false);
    expect(validTraining({ luck: 3 } as never)).toBe(false);
  });
});
