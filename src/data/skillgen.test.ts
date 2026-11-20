import { describe, expect, it } from "vitest";
import { buildMerc } from "@/game/merc/generate";
import { sampleSeeds } from "./sampleRoster";
import { generateSkill, getSkill, rollSkills, validSkills, validSkillsFor } from "./skillgen";
import { JOB_SKILL, SKILLS, skillsFrom } from "./skills";
import { comboId, earlyCombo } from "./combo";

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

  it("직업·종족이 없으면 대표 스킬 1 + 조합 3으로 채운다", () => {
    let n = 0;
    const ids = rollSkills(undefined, undefined, () => (n++ % 97) / 97);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe("power");
    expect(ids.slice(1).every((id) => id.startsWith("gen:"))).toBe(true);
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

describe("직업·종족 시작 스킬", () => {
  const JOBS = ["knight", "assassin", "nun", "archer", "greatsword", "herbalist", "mage", "spiritcaller"];
  const RACES = ["human", "dwarf", "elf", "beastfolk", "barbarian"];

  it("직업마다 4개, 종족마다 4개의 스킬이 있고 id와 이름이 겹치지 않는다", () => {
    for (const job of JOBS) expect(skillsFrom({ job }), job).toHaveLength(4);
    for (const race of RACES) expect(skillsFrom({ race }), race).toHaveLength(4);
    const all = Object.values(SKILLS);
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    expect(new Set(all.map((s) => s.name)).size).toBe(all.length);
  });

  it("직업 대표 스킬 + 직업 하나 + 종족 하나 + 직업·종족 하나, 모두 그 용병 것", () => {
    let n = 1;
    const rand = () => ((n = (n * 16807) % 2147483647) / 2147483647);
    for (const job of JOBS) {
      for (const race of RACES) {
        const ids = rollSkills(job, race, rand);
        expect(ids).toHaveLength(4);
        expect(ids[0]).toBe(JOB_SKILL[job]);
        expect(validSkillsFor(ids, job, race)).toBe(true);
        const sources = ids.map((id) => getSkill(id)!.source);
        expect(sources.filter((s) => s.job === job).length).toBeGreaterThanOrEqual(2);
        expect(sources.filter((s) => s.race === race).length).toBeGreaterThanOrEqual(1);
        expect(ids.some((id) => id.startsWith("gen:"))).toBe(false);
      }
    }
  });

  it("다른 직업·종족의 스킬은 거부한다", () => {
    expect(validSkillsFor(["firelance"], "mage", "elf")).toBe(true);
    expect(validSkillsFor(["firelance"], "knight", "elf")).toBe(false);
    expect(validSkillsFor(["dwarf_hammer"], "mage", "elf")).toBe(false);
    expect(validSkillsFor(["gen:5"], "mage", "elf")).toBe(true);
  });

  it("모든 스킬의 설명이 만들어지고, 자신에게 쓰는 스킬은 '자신'으로 적힌다", () => {
    expect(getSkill("human_resolve")!.description).toContain("자신에게 각성");
    expect(getSkill("assassin_smoke")!.description).toContain("자신에게 피해를 먼저 막는 보호막 5");
    for (const id of [...JOBS.flatMap((job) => skillsFrom({ job })), ...RACES.flatMap((race) => skillsFrom({ race }))]) {
      expect(getSkill(id)!.description.length, id).toBeGreaterThan(5);
    }
  });
});

describe("조합 스킬", () => {
  const JOBS = ["knight", "assassin", "nun", "archer", "greatsword", "herbalist", "mage", "spiritcaller"];
  const RACES = ["human", "dwarf", "elf", "beastfolk", "barbarian"];

  it("직업 8 × 종족 5 × 2 = 80개가 모두 만들어지고, 그 직업·종족만 가질 수 있다", () => {
    const ids = JOBS.flatMap((job) => RACES.flatMap((race) => [comboId(job, race, 1), comboId(job, race, 2)]));
    expect(new Set(ids).size).toBe(80);
    for (const id of ids) {
      const s = getSkill(id)!;
      expect(s, id).toBeDefined();
      expect(s.description.length).toBeGreaterThan(5);
      const [, job, race] = id.split(":");
      expect(validSkillsFor([id], job, race)).toBe(true);
      expect(validSkillsFor([id], job, race === "elf" ? "dwarf" : "elf")).toBe(false);
    }
    expect(getSkill("combo:mage:dragon:1")).toBeUndefined();
    expect(getSkill("combo:mage:elf:3")).toBeUndefined();
  });

  it("시작 스킬 마지막 칸은 약 30% 확률로 그 조합의 초반 스킬", () => {
    let n = 7;
    const rand = () => ((n = (n * 16807) % 2147483647) / 2147483647);
    let combos = 0;
    for (let i = 0; i < 1000; i++) {
      const ids = rollSkills("assassin", "elf", rand);
      if (ids.includes(earlyCombo("assassin", "elf")!)) combos++;
      expect(validSkillsFor(ids, "assassin", "elf")).toBe(true);
    }
    expect(combos / 1000).toBeGreaterThan(0.24);
    expect(combos / 1000).toBeLessThan(0.36);
  });
});
