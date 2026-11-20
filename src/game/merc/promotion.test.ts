import { describe, expect, it } from "vitest";
import { sampleSeeds } from "@/data/sampleRoster";
import { getSkill } from "@/data/skillgen";
import { JOB_ULTIMATE } from "@/data/skills";
import { buildMerc } from "./generate";
import { nextRank, promote, promoteCost, promotionChoices } from "./promotion";

const seed = sampleSeeds().find((s) => s.id === "s-durgan")!; // 드워프 대검사

describe("승급", () => {
  it("견습 → 숙련 → 노련까지. 전설은 승급으로 오르지 않는다", () => {
    expect(nextRank("apprentice")).toBe("skilled");
    expect(nextRank("skilled")).toBe("veteran");
    expect(nextRank("veteran")).toBeNull();
    expect(promoteCost("apprentice")).toBe(20);
    expect(promoteCost("skilled")).toBe(40);
  });

  it("후보는 언제 봐도 같고, 이미 가진 패시브·스킬은 빠진다", () => {
    const a = promotionChoices(seed);
    expect(a).toEqual(promotionChoices(seed));
    expect(a.passives).toHaveLength(2);
    expect(a.skills).toHaveLength(2);
    for (const id of a.passives) expect(seed.passives).not.toContain(id);
    for (const id of a.skills) expect(seed.skills).not.toContain(id);
  });

  it("승급하면 등급·패시브·스킬이 늘고 궁극기가 열린다. 규칙 검사도 통과한다", () => {
    const { passives, skills } = promotionChoices(seed);
    const done = promote(seed, [], { passive: passives[0], skill: skills[0] })!;
    expect(done.seed.level).toBe("skilled");
    expect(done.seed.passives).toContain(passives[0]);
    expect(done.seed.ultimate).toBe(JOB_ULTIMATE.greatsword);
    // 장착 칸 4개가 꽉 찼으니 배운 스킬로 보관
    expect(seed.skills).toHaveLength(4);
    expect(done.learned).toEqual([skills[0]]);
    expect(buildMerc(done.seed)).not.toBeNull();
  });

  it("후보에 없는 패시브·스킬이나 빠진 선택은 거부한다", () => {
    const { passives, skills } = promotionChoices(seed);
    expect(promote(seed, [], { passive: "keen_eye", skill: skills[0] })).toBeNull();
    expect(promote(seed, [], { passive: passives[0] })).toBeNull();
  });

  it("견습에게 궁극기가 있거나, 다른 직업 궁극기면 규칙 검사에서 거부한다", () => {
    expect(buildMerc({ ...seed, ultimate: JOB_ULTIMATE.greatsword })).toBeNull();
    expect(buildMerc({ ...seed, level: "skilled", ultimate: JOB_ULTIMATE.mage })).toBeNull();
    expect(getSkill(JOB_ULTIMATE.greatsword)!.ultimate).toBe(true);
  });
});
