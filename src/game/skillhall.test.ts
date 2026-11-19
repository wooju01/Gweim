import { describe, expect, it } from "vitest";
import { PIECES, craftCooldown, craftId, craftSkill, piecesIn, validCraft } from "../data/craft";
import { sampleSeeds } from "../data/sampleRoster";
import { getSkill } from "../data/skillgen";
import { buildMerc } from "./generate";
import { craft, knownPieces, paySalvage, swapSkills, unlockBlock } from "./skillhall";

const seed = sampleSeeds().find((s) => s.id === "s-durgan")!; // 드워프 대검사, 장착 4칸

describe("조각과 조립", () => {
  it("모든 올바른 조합은 스킬이 되고, 효과에서 조각을 다시 읽으면 쓴 조각이 다 나온다", () => {
    const cores = PIECES.filter((p) => p.kind === "core");
    const mods = PIECES.filter((p) => p.kind === "mod");
    let count = 0;
    for (const c of cores)
      for (const a of [undefined, ...mods])
        for (const b of [undefined, ...mods]) {
          const ms = [a, b].flatMap((m) => (m ? [m.id] : []));
          if (!validCraft(c.id, ms)) continue;
          const sk = getSkill(craftId(c.id, ms));
          expect(sk, craftId(c.id, ms)).toBeDefined();
          expect(sk!.cooldown).toBeGreaterThanOrEqual(2);
          expect(sk!.cooldown).toBeLessThanOrEqual(5);
          for (const p of [c.id, ...ms]) expect(piecesIn(sk!)).toContain(p);
          count++;
        }
    expect(count).toBeGreaterThan(50);
  });

  it("맞지 않는 조합·겹친 조각·순서가 다른 id는 거부한다", () => {
    expect(validCraft("mend", ["bleed"])).toBe(false); // 아군 회복에 출혈
    expect(validCraft("fog", ["weaken"])).toBe(false); // 위축 안개에 위축
    expect(validCraft("strike", ["bleed", "bleed"])).toBe(false);
    expect(validCraft("bleed", [])).toBe(false); // 덧붙임은 몸체가 될 수 없다
    expect(craftSkill("craft:strike.blood.bleed")).toBeUndefined(); // 정렬 순서가 아니다
    expect(craftSkill(craftId("strike", ["blood", "bleed"]))).toBeDefined();
  });

  it("실패 조각은 맨 앞, 이름은 첫 덧붙임 + 몸체, 강할수록 오래 기다린다", () => {
    const sk = craftSkill(craftId("heavy", ["crack", "gamble"]))!;
    expect(sk.effects[0].kind).toBe("fail");
    expect(sk.name).toBe("갑옷을 깨는 강타");
    expect(craftSkill(craftId("heavy", ["crack"]))!.cooldown).toBeGreaterThan(craftSkill(craftId("strike", []))!.cooldown);
    expect(craftCooldown(0)).toBe(2);
    expect(craftCooldown(99)).toBe(5);
  });
});

describe("용병별 조각", () => {
  it("가진 스킬 안에 든 조각은 처음부터 안다", () => {
    const known = knownPieces(seed, [], []);
    for (const id of seed.skills) for (const p of piecesIn(getSkill(id)!)) expect(known).toContain(p);
    expect(knownPieces(seed, [], ["mend"])).toContain("mend");
  });

  it("해금: 이미 알거나 금화·유실물이 모자라면 막는다", () => {
    const known = knownPieces(seed, [], []);
    const unknown = PIECES.find((p) => !known.includes(p.id))!;
    const enough = { ...unknown.cost.salvage };
    expect(unlockBlock(unknown.id, known, 999, enough)).toBeNull();
    expect(unlockBlock(unknown.id, known, 0, enough)).toBe("gold");
    expect(unlockBlock(unknown.id, known, 999, {})).toBe("salvage");
    expect(unlockBlock(known[0], known, 999, enough)).toBe("known");
    expect(paySalvage({ a: 2, b: 1 }, { a: 2 })).toEqual({ b: 1 });
  });

  it("조립: 모르는 조각, 등급 한도를 넘는 덧붙임, 이미 가진 스킬은 안 된다. 꽉 차면 보관", () => {
    const known = knownPieces(seed, [], []);
    const core = PIECES.find((p) => p.kind === "core" && known.includes(p.id))!.id;
    expect(craft(seed, [], [], 999, core, [])).not.toBeNull();
    expect(craft(seed, [], [], 0, core, [])).toBeNull();
    const unknownCore = PIECES.find((p) => p.kind === "core" && !known.includes(p.id))!.id;
    expect(craft(seed, [], [], 999, unknownCore, [])).toBeNull();
    // 견습은 덧붙임 1개
    expect(craft(seed, [], ["strike", "bleed", "blood"], 999, "strike", ["bleed", "blood"])).toBeNull();
    const done = craft(seed, [], ["strike", "bleed"], 999, "strike", ["bleed"])!;
    expect(done.seed.skills).toEqual(seed.skills);
    expect(done.learned).toEqual([craftId("strike", ["bleed"])]);
    expect(craft(seed, done.learned, ["strike", "bleed"], 999, "strike", ["bleed"])).toBeNull();
    // 숙련이면 2개
    expect(craft({ ...seed, level: "skilled" }, [], ["strike", "bleed", "blood"], 999, "strike", ["bleed", "blood"])).not.toBeNull();
  });

  it("장착 바꾸기: 맞바꾸기, 빼기, 빈 칸에 끼우기. 조립한 스킬을 낀 용병도 만들 수 있다", () => {
    const sk = craftId("strike", ["bleed"]);
    const swapped = swapSkills(seed, [sk], { equip: sk, unequip: seed.skills[1] })!;
    expect(swapped.seed.skills[1]).toBe(sk);
    expect(swapped.learned).toEqual([seed.skills[1]]);
    expect(buildMerc(swapped.seed)).not.toBeNull();
    // 꽉 찬 칸에 그냥 끼울 수는 없다
    expect(swapSkills(seed, [sk], { equip: sk })).toBeNull();
    const out = swapSkills(seed, [], { unequip: seed.skills[0] })!;
    expect(out.seed.skills).toHaveLength(3);
    expect(swapSkills(out.seed, out.learned, { equip: seed.skills[0] })!.seed.skills).toHaveLength(4);
    // 마지막 하나는 뺄 수 없다
    expect(swapSkills({ ...seed, skills: [seed.skills[0]] }, [], { unequip: seed.skills[0] })).toBeNull();
    // 배우지 않은 스킬은 낄 수 없다
    expect(swapSkills(out.seed, out.learned, { equip: "ult_mage" })).toBeNull();
  });
});
