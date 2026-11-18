import { describe, expect, it } from "vitest";
import { buildMerc } from "../game/generate";
import { sampleSeeds } from "./sampleRoster";
import { generateSkill, getSkill, rollSkills, validSkills } from "./skillgen";

describe("무작위 조합 스킬", () => {
  const skills = Array.from({ length: 500 }, (_, n) => generateSkill(n));

  it("같은 번호면 같은 스킬이고, getSkill로 다시 찾을 수 있다", () => {
    expect(generateSkill(42)).toEqual(generateSkill(42));
    expect(getSkill("gen:42")).toEqual(generateSkill(42));
    expect(getSkill("gen:abc")).toBeUndefined();
    expect(getSkill("gen:-1")).toBeUndefined();
    expect(getSkill("nothing")).toBeUndefined();
  });

  it("대상과 효과 조각이 맞고, 대기 시간은 1~4턴, 설명과 이름이 있다", () => {
    for (const s of skills) {
      expect(s.cooldown).toBeGreaterThanOrEqual(1);
      expect(s.cooldown).toBeLessThanOrEqual(4);
      expect(s.name.length).toBeGreaterThan(2);
      expect(s.description.length).toBeGreaterThan(5);
      const kinds = s.effects.map((e) => e.kind);
      if (s.target === "ally") expect(kinds.some((k) => k === "heal" || k === "shield")).toBe(true);
      if (s.target === "enemy") expect(kinds).toContain("damage");
      // 실패 조각은 언제나 맨 앞
      if (kinds.includes("fail")) expect(kinds[0]).toBe("fail");
    }
    const targets = new Set(skills.map((s) => s.target));
    expect([...targets].sort()).toEqual(["ally", "enemy", "none"]);
  });

  it("시작 스킬은 직업 스킬 1 + 조합 3, 규칙 검사를 통과한다", () => {
    let n = 0;
    const ids = rollSkills("mage", () => (n++ % 97) / 97);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe("firelance");
    expect(validSkills(ids)).toBe(true);
    expect(validSkills(["firelance", "firelance"])).toBe(false);
    expect(validSkills(["nope"])).toBe(false);
  });

  it("샘플 용병은 모두 4칸이 찬 채로 만들어진다", () => {
    for (const seed of sampleSeeds()) {
      const skills = buildMerc(seed)!.skills!;
      expect(skills).toHaveLength(4);
      expect(new Set(skills.map((id) => getSkill(id)!.name)).size).toBe(4);
    }
  });
});
