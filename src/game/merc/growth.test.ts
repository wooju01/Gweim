import { describe, expect, it } from "vitest";
import { GROWTH, GROWTH_POINTS, STAT_CURVE, XP_TO_NEXT, curveValue, nextPointGain } from "@/data/growth";
import { NO_GROWTH, canPromote, gainXp, validTraining, xpToNext } from "./growth";

describe("성장", () => {
  it("경험치가 차면 레벨업하고, 직업 성장표대로 스탯 5가 붙고 단련 기회가 생긴다", () => {
    const { growth, gained } = gainXp(NO_GROWTH, XP_TO_NEXT[0], "knight");
    expect(growth).toMatchObject({ lv: 1, xp: 0, trainable: 1, stats: { str: 2, defense: 1, hp: 2 } });
    expect(gained).toEqual([GROWTH.knight]);
  });

  it("한 번에 여러 레벨도 오르고, 등급의 1단계(레벨 2)에서는 승급용 경험치가 쌓인다 (승급용 경험치 이상은 쌓이지 않는다)", () => {
    const { growth, gained } = gainXp(NO_GROWTH, XP_TO_NEXT[0] + XP_TO_NEXT[1] + 50, "mage");
    expect(gained).toHaveLength(2);
    expect(growth).toMatchObject({ lv: 2, xp: 50, trainable: 2, stats: { mag: 6, speed: 2, hp: 2 } });
    expect(canPromote(growth)).toBe(false);
    expect(xpToNext(2)).toBe(XP_TO_NEXT[2]);
    const full = gainXp(growth, 1000, "mage").growth;
    expect(full).toMatchObject({ lv: 2, xp: XP_TO_NEXT[2] });
    expect(canPromote(full)).toBe(true);
  });

  it("필요 경험치: 3단계→2단계 15, 2단계→1단계 75, 1단계→승급 170", () => {
    expect([...XP_TO_NEXT]).toEqual([15, 75, 170]);
  });

  it("모자란 경험치는 남는다", () => {
    expect(gainXp(NO_GROWTH, XP_TO_NEXT[0] + 2, "priest").growth).toMatchObject({ lv: 1, xp: 2 });
  });

  it("모든 직업의 성장표는 합이 5", () => {
    for (const [job, g] of Object.entries(GROWTH)) {
      expect(Object.values(g).reduce((a, b) => a + (b ?? 0), 0), job).toBe(GROWTH_POINTS);
    }
    expect(GROWTH_POINTS).toBe(5);
  });

  it("방어·회피·치명 체감 곡선: max × p / (p + k), 다음 1점의 효과는 점점 줄어든다", () => {
    expect(curveValue("defense", 15)).toBeCloseTo(0.35);
    expect(curveValue("evade", 20)).toBeCloseTo(0.25);
    expect(curveValue("crit", 25)).toBeCloseTo(0.1 + 0.3);
    expect(curveValue("crit", 0)).toBeCloseTo(0.1);
    expect(curveValue("defense", -3)).toBe(0);
    expect(nextPointGain("evade", 0)).toBeGreaterThan(nextPointGain("evade", 10));
    expect(STAT_CURVE).toMatchObject({ defense: { max: 0.7, k: 15, cap: 0.8 }, evade: { max: 0.5, k: 20, cap: 0.6 }, crit: { base: 0.1, max: 0.6, k: 25, cap: 0.8 } });
  });

  it("단련장 배분은 정확히 3점, 음수·없는 스탯은 안 된다", () => {
    expect(validTraining({ crit: 2, faith: 1 })).toBe(true);
    expect(validTraining({ str: 2 })).toBe(false);
    expect(validTraining({ str: 4, hp: -1 })).toBe(false);
    expect(validTraining({ luck: 3 } as never)).toBe(false);
  });
});
