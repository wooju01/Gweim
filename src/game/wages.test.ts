import { describe, expect, it } from "vitest";
import { TEST_MERCS } from "../test/fixtures";
import type { Merc } from "./types";
import { advanceCost, offerEffect, wageOf } from "./wages";

const [base] = TEST_MERCS;
const merc = (personalities: string[], background = "wanderer", level: Merc["level"] = "apprentice"): Merc => ({
  ...base,
  level,
  traitIds: { personalities, background },
});

describe("보수", () => {
  it("등급이 높을수록, 탐욕스럽거나 빚이 있으면 더 달라고 한다", () => {
    expect(wageOf(merc(["kind"]))).toBe(12);
    expect(wageOf(merc(["greedy"]))).toBe(16);
    expect(wageOf(merc(["greedy"], "debtor"))).toBe(19);
    expect(wageOf(merc(["kind"], "wanderer", "veteran"))).toBe(32);
    expect(wageOf(merc(["kind"]), true)).toBe(18);
    expect(advanceCost(merc(["kind"]))).toBe(24);
  });
});

describe("조건 제시", () => {
  it("탐욕·빚쟁이는 크게 반기고, 명예로운 용병은 효과가 줄고 호감이 떨어진다", () => {
    const greedy = offerEffect(merc(["greedy"], "debtor"), "advance");
    expect(greedy.willingness).toBe(Math.round(20 * 1.6 * 1.5));
    expect(greedy.affinity).toBe(5);
    const honorable = offerEffect(merc(["honorable"]), "advance");
    expect(honorable.willingness).toBe(10);
    expect(honorable.affinity).toBe(-4);
    expect(honorable.note).toContain("약속");
    expect(offerEffect(merc(["kind"]), "share").willingness).toBe(12);
  });
});
