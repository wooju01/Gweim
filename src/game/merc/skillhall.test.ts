import { describe, expect, it } from "vitest";
import { CRAFT_COST, getFragment } from "@/data/fragments";
import { sampleSeeds } from "@/data/sampleRoster";
import { fragmentsFor, fragmentsIn, skillKey } from "@/game/skills";
import { buildMerc } from "./generate";
import { craft, craftBlock, forgetSkill, knownFragments, ownerOf, paySalvage, swapSkills, unlockBlock, upgradeBlock } from "./skillhall";

const base = sampleSeeds().find((s) => s.id === "s-durgan")!; // 드워프 대검사
const pool = fragmentsFor(ownerOf(base));

describe("용병별 조각", () => {
  it("가진 스킬 안에 든 조각은 처음부터 알고, 가르친 조각도 안다. 쓸 수 없는 조각은 빠진다", () => {
    const known = knownFragments(base, [], []);
    for (const b of base.skills) for (const id of fragmentsIn(b)) expect(known).toContain(id);
    const extra = pool.find((f) => !known.includes(f.id))!;
    expect(knownFragments(base, [], [extra.id])).toContain(extra.id);
    expect(knownFragments(base, [], ["knight_slash"])).not.toContain("knight_slash");
  });

  it("해금: 다른 직업 조각·궁극기·이미 아는 조각·모자란 금화와 재료는 막는다", () => {
    const known = knownFragments(base, [], []);
    const unknown = pool.find((f) => !known.includes(f.id) && f.tier === "bronze")!;
    const enough = { ...unknown.cost!.salvage };
    expect(unlockBlock(unknown.id, base, known, 999, enough, "bronze")).toBeNull();
    expect(unlockBlock(unknown.id, base, known, 0, enough, "bronze")).toBe("gold");
    expect(unlockBlock(unknown.id, base, known, 999, {}, "bronze")).toBe("salvage");
    // 직업 대표 메인은 비용이 없다 (처음부터 안다). 비용이 있는 아는 조각은 "이미 안다"
    const knownWithCost = known.find((id) => getFragment(id)?.cost)!;
    expect(unlockBlock(knownWithCost, base, known, 999, enough, "bronze")).toBe("known");
    expect(unlockBlock("knight_combo", base, known, 999, { tech_shard: 9, mat_whetstone: 9 }, "bronze")).toBe("forbidden");
    expect(unlockBlock("ult_greatsword", base, known, 999, {}, "bronze")).toBe("unknown");
    expect(paySalvage({ a: 2, b: 1 }, { a: 2 })).toEqual({ b: 1 });
  });

  it("은 조각은 길드 등급이 은 이상이어야 뚫는다", () => {
    const known = knownFragments(base, [], []);
    const silver = pool.find((f) => !known.includes(f.id) && f.tier === "silver")!;
    const enough = { ...silver.cost!.salvage };
    expect(unlockBlock(silver.id, base, known, 999, enough, "bronze")).toBe("rank");
    expect(unlockBlock(silver.id, base, known, 999, enough, "silver")).toBeNull();
    expect(unlockBlock(silver.id, base, known, 999, enough, "gold")).toBeNull();
  });

  it("강화: 아는 부 조각만, Lv3까지", () => {
    const sub = pool.find((f) => f.kind === "sub")!;
    const material = { tech_shard: 99, boss_token: 9, [sub.material!]: 99 };
    expect(upgradeBlock(sub.id, [], {}, 999, material)).toBe("unknown");
    expect(upgradeBlock(sub.id, [sub.id], {}, 999, material)).toBeNull();
    expect(upgradeBlock(sub.id, [sub.id], { [sub.id]: 3 }, 999, material)).toBe("max");
    expect(upgradeBlock(sub.id, [sub.id], {}, 0, material)).toBe("gold");
  });
});

describe("조립과 장착", () => {
  const main = pool.find((f) => f.kind === "main" && !f.race)!.id;
  const subs = pool.filter((f) => f.kind === "sub" && !f.race).map((f) => f.id);
  // 장착 4칸이 꽉 찬 용병
  const full = {
    ...base,
    skills: pool
      .filter((f) => f.kind === "main")
      .slice(0, 4)
      .map((f) => ({ main: f.id, subs: [] })),
  };

  it("모르는 조각, 등급 한도를 넘는 부 조각, 이미 가진 스킬, 금화 부족은 안 된다", () => {
    const unlocked = [main, ...subs];
    expect(craftBlock(base, [], [], 999, { main, subs: [subs[0]] })).toBe("모르는 조각이 있다");
    expect(craftBlock(base, [], unlocked, 999, { main, subs: subs.slice(0, 2) })).toBe("부 조각은 1개까지");
    expect(craftBlock({ ...base, level: "silver" }, [], unlocked, 999, { main, subs: subs.slice(0, 2) })).toBeNull();
    expect(craftBlock(base, [], unlocked, CRAFT_COST - 1, { main, subs: [subs[0]] })).toBe("금화가 모자란다");
    expect(craftBlock(base, [{ main, subs: [subs[0]] }], unlocked, 999, { main, subs: [subs[0]] })).toBe("이미 가진 스킬");
  });

  it("자리가 있으면 바로 장착, 꽉 찼으면 보관", () => {
    const unlocked = [main, subs[0]];
    const equipped = craft(base, [], unlocked, 999, { main, subs: [subs[0]] })!;
    expect(equipped.seed.skills.map(skillKey)).toContain(skillKey({ main, subs: [subs[0]] }));
    expect(equipped.learned).toEqual([]);
    const kept = craft(full, [], unlocked, 999, { main, subs: [subs[0]] })!;
    expect(kept.seed.skills).toEqual(full.skills);
    expect(kept.learned.map(skillKey)).toEqual([skillKey({ main, subs: [subs[0]] })]);
    expect(buildMerc(equipped.seed)).not.toBeNull();
  });

  it("장착 바꾸기: 맞바꾸기, 빼기, 빈 칸에 끼우기", () => {
    const learned = [{ main, subs: [subs[0]] }];
    const key = skillKey(learned[0]);
    const first = skillKey(full.skills[1]);
    const swapped = swapSkills(full, learned, { equip: key, unequip: first })!;
    expect(skillKey(swapped.seed.skills[1])).toBe(key);
    expect(swapped.learned.map(skillKey)).toEqual([first]);
    expect(buildMerc(swapped.seed)).not.toBeNull();
    // 꽉 찬 칸에 그냥 끼울 수는 없다
    expect(swapSkills(full, learned, { equip: key })).toBeNull();
    const out = swapSkills(full, [], { unequip: first })!;
    expect(out.seed.skills).toHaveLength(3);
    expect(swapSkills(out.seed, out.learned, { equip: first })!.seed.skills).toHaveLength(4);
    // 마지막 하나는 뺄 수 없다
    expect(swapSkills({ ...base, skills: [full.skills[0]] }, [], { unequip: skillKey(full.skills[0]) })).toBeNull();
    // 배우지 않은 스킬은 낄 수 없다
    expect(swapSkills(out.seed, out.learned, { equip: "ult_mage" })).toBeNull();
    expect(getFragment(main)).toBeDefined();
  });

  it("보관함은 4개까지: 꽉 차면 조립·빼기를 막고, 잊으면 다시 된다", () => {
    const four = subs.slice(0, 4).map((sub) => ({ main, subs: [sub] }));
    const unlocked = [main, ...subs];
    // 장착 칸도 꽉 찼고 보관함도 4개면 조립할 수 없다
    const fifth = { main: pool.filter((f) => f.kind === "main")[4].id, subs: [] };
    expect(craftBlock(full, four, [...unlocked, fifth.main], 999, fifth)).toBe("보관함이 꽉 찼다 (4개)");
    // 장착 스킬을 빼서 보관할 수도 없다 (맞바꾸기는 된다)
    expect(swapSkills(full, four, { unequip: skillKey(full.skills[0]) })).toBeNull();
    expect(swapSkills(full, four, { equip: skillKey(four[0]), unequip: skillKey(full.skills[0]) })).not.toBeNull();
    // 잊으면 자리가 난다
    const three = forgetSkill(four, skillKey(four[0]))!;
    expect(three).toHaveLength(3);
    expect(forgetSkill(four, "nope")).toBeNull();
    expect(craftBlock(full, three, [...unlocked, fifth.main], 999, fifth)).toBeNull();
  });
});
