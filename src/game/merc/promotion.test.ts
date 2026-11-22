import { describe, expect, it } from "vitest";
import { JOB_ULTIMATE } from "@/data/fragments";
import { jobTitle } from "@/data/jobs";
import { RANKS, RANK_ORDER, rankLabel } from "@/data/ranks";
import { sampleSeeds } from "@/data/sampleRoster";
import type { MercSeed } from "@/lib/schemas";
import { buildMerc } from "./generate";
import { nextRank, promote, promoteCost, promotionChoices } from "./promotion";

const seed = sampleSeeds().find((s) => s.id === "s-durgan")!; // 드워프 대검사, 동
const atSilver: MercSeed = { ...seed, level: "silver" };

describe("승급", () => {
  it("동 → 은 → 금 → 미스릴 → 다이아 → 성휘. 성휘 다음은 없다", () => {
    expect(RANK_ORDER).toHaveLength(6);
    expect(nextRank("bronze")).toBe("silver");
    expect(nextRank("diamond")).toBe("radiant");
    expect(nextRank("radiant")).toBeNull();
    expect(promoteCost("bronze")).toBe(RANKS.silver.promoteCost);
    expect(promoteCost("radiant")).toBeNull();
    expect(rankLabel("bronze", 0)).toBe("동 3단계");
    expect(rankLabel("gold", 2)).toBe("금 1단계");
  });

  it("후보: 은으로 오를 때 은 A/B, 금으로 오를 때 금 A/B (그 직업·종족). 금으로 오를 때만 전직 갈래", () => {
    const a = promotionChoices(seed);
    expect(a.passives).toEqual(["greatsword_dwarf_sA", "greatsword_dwarf_sB"]);
    expect(a.branches).toEqual([]);
    const g = promotionChoices({ ...atSilver, passiveSilver: "greatsword_dwarf_sB" });
    expect(g.passives).toEqual(["greatsword_dwarf_gA", "greatsword_dwarf_gB"]);
    expect(g.branches.map((b) => b.id)).toEqual(["crusher", "gale_blade"]);
  });

  it("동 → 은: 은 패시브를 하나 고른다 (후보 밖은 안 된다), 궁극기는 아직 없다", () => {
    expect(promote(seed, {})).toBeNull();
    expect(promote(seed, { passive: "greatsword_dwarf_gA" })).toBeNull();
    const done = promote(seed, { passive: "greatsword_dwarf_sB" })!;
    expect(done).toMatchObject({ level: "silver", passiveSilver: "greatsword_dwarf_sB" });
    expect(done.ultimate).toBeUndefined();
    expect(buildMerc(done)!.passives).toEqual(["greatsword_job", "greatsword_dwarf_sB"]);
  });

  it("은 → 금: 전직 갈래를 골라야 하고, 궁극기가 열린다", () => {
    const silver = { ...atSilver, passiveSilver: "greatsword_dwarf_sA" };
    const { passives } = promotionChoices(silver);
    expect(promote(silver, { passive: passives[0] })).toBeNull();
    expect(promote(silver, { passive: passives[0], branch: "saber" })).toBeNull(); // 기사 갈래
    // 금 패시브는 2차 갈래와 상관없이 고른다
    const done = promote(silver, { passive: passives[1], branch: "crusher" })!;
    expect(done).toMatchObject({ level: "gold", branch: "crusher", passiveGold: "greatsword_dwarf_gB", ultimate: JOB_ULTIMATE.greatsword });
    expect(buildMerc(done)).not.toBeNull();
  });

  it("원소술사는 원소 둘을 함께 고른다", () => {
    const mage: MercSeed = { ...atSilver, id: "m", traits: { ...atSilver.traits, job: "mage", race: "human", personalities: ["kind"] }, skills: [] };
    const passive = promotionChoices(mage).passives[0];
    expect(promote(mage, { passive, branch: "elementalist" })).toBeNull();
    expect(promote(mage, { passive, branch: "elementalist", elements: ["fire", "fire"] })).toBeNull();
    expect(promote(mage, { passive, branch: "elementalist", elements: ["fire", "wind"] })).toMatchObject({ branch: "elementalist", elements: ["fire", "wind"] });
    expect(promote(mage, { passive, branch: "warlock" })).toMatchObject({ branch: "warlock" });
  });

  it("후보에 없는 패시브나 빠진 선택은 거부한다", () => {
    const { passives } = promotionChoices(seed);
    expect(promote(seed, { passive: "keen_eye" })).toBeNull();
    expect(promote(seed, {})).toBeNull();
    expect(passives.length).toBeGreaterThan(0);
  });

  it("규칙 검사: 동 등급 궁극기·다른 직업 궁극기·은 등급 전직은 거부한다", () => {
    expect(buildMerc({ ...seed, ultimate: JOB_ULTIMATE.greatsword })).toBeNull();
    expect(buildMerc({ ...seed, level: "gold", ultimate: JOB_ULTIMATE.mage })).toBeNull();
    expect(buildMerc({ ...seed, level: "gold", ultimate: JOB_ULTIMATE.greatsword })).not.toBeNull();
    expect(buildMerc({ ...seed, branch: "crusher" })).toBeNull();
    expect(buildMerc({ ...seed, level: "gold", branch: "saber" })).toBeNull();
  });
});

describe("직업 이름", () => {
  it("1차는 기본, 금부터 갈래 이름, 4차는 종족별. 정하지 않은 단계는 앞 단계 이름", () => {
    const knight = { job: "knight", race: "dwarf", branch: "saber" };
    expect(jobTitle({ ...knight, level: "silver" }, "기사")).toBe("기사");
    expect(jobTitle({ ...knight, level: "gold" }, "기사")).toBe("세이버");
    expect(jobTitle({ ...knight, level: "diamond" }, "기사")).toBe("소드마스터");
    expect(jobTitle({ ...knight, level: "radiant" }, "기사")).toBe("룬 팔라딘");
    expect(jobTitle({ job: "greatsword", level: "radiant", branch: "crusher" }, "대검사")).toBe("파쇄자");
    expect(jobTitle({ job: "priest", level: "gold", branch: "saint", gender: "female" }, "사제")).toBe("성녀");
    expect(jobTitle({ job: "priest", level: "gold", branch: "saint", gender: "male" }, "사제")).toBe("성자");
  });
});
