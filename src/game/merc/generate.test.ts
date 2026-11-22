import { describe, expect, it } from "vitest";
import { ALL_TRAITS, BACKGROUNDS, JOBS, PERSONALITIES, RACES, getTrait } from "@/data/traits";
import { MercSeed } from "@/lib/schemas";
import { FUSION_PASSIVES, JOB_PASSIVES, PASSIVES, PASSIVE_CAP, fusionChoices, pctSum } from "@/data/passives";
import { canBe } from "@/data/jobs";
import { dislikedTones, likedTones } from "./affinity";
import {
  pickImpression,
  rollPassives,
  validPassives,
  jobsFor,
  START_AFFINITY_RANGE,
  START_WILLINGNESS_RANGE,
  buildMerc,
  combineReactions,
  resolveTraits,
  RECRUIT_COUNT_RANGE,
  rollRecruitCount,
  rollStart,
  rollTraits,
  seededRandom,
} from "./generate";

const ROLLS = 5000;

function rollMany(seed = 42) {
  const rand = seededRandom(seed);
  return Array.from({ length: ROLLS }, () => {
    const ids = rollTraits(rand);
    const traits = resolveTraits(ids);
    return { ids, traits, start: traits ? rollStart(traits, rand) : null };
  });
}

const profile: MercSeed["profile"] = {
  name: "테스트",
  title: "시험용 용병",
  persona: "p",
  background: "b",
  secret: "s",
  speechStyle: "반말",
  exampleLines: ["가", "나"],
};

describe("특성 데이터", () => {
  it("id가 겹치지 않는다", () => {
    expect(new Set(ALL_TRAITS.map((t) => t.id)).size).toBe(ALL_TRAITS.length);
  });

  it("excludes와 requires가 실제 있는 특성을 가리킨다", () => {
    for (const t of ALL_TRAITS) {
      for (const id of [...(t.excludes ?? []), ...(t.requires ?? [])]) {
        expect(getTrait(id), `${t.id} → ${id}`).toBeDefined();
      }
    }
  });

  it("성격은 모두 호감도를 올리는 태도와 내리는 태도를 하나 이상 가진다", () => {
    for (const p of PERSONALITIES) {
      const levels = Object.values(p.reactions ?? {}).map((r) => r.affinity);
      expect(levels.some((l) => l > 0), p.id).toBe(true);
      expect(levels.some((l) => l < 0), p.id).toBe(true);
    }
  });
});

describe("rollTraits", () => {
  const rolls = rollMany();

  it("뽑힌 조합은 항상 규칙(제외, 필요 조건)을 지킨다", () => {
    for (const r of rolls) expect(r.traits, JSON.stringify(r.ids)).not.toBeNull();
  });

  it("직업 1, 성격 1~2, 배경 1", () => {
    for (const { ids } of rolls) {
      expect(getTrait(ids.job)?.kind).toBe("job");
      expect(ids.personalities.length).toBeGreaterThanOrEqual(1);
      expect(ids.personalities.length).toBeLessThanOrEqual(2);
      expect(new Set(ids.personalities).size).toBe(ids.personalities.length);
      expect(getTrait(ids.background)?.kind).toBe("background");
    }
  });

  it("파문은 사제에게만 나온다", () => {
    const excommunicated = rolls.filter((r) => r.ids.background === "excommunicated");
    expect(excommunicated.length).toBeGreaterThan(0);
    for (const r of excommunicated) expect(r.ids.job).toBe("priest");
  });

  it("다정함과 싸가지없음은 같이 나오지 않는다", () => {
    for (const { ids } of rolls) {
      expect(ids.personalities.includes("kind") && ids.personalities.includes("rude")).toBe(false);
    }
  });

  it("모든 직업, 성격, 배경이 한 번 이상 나온다", () => {
    const seen = new Set(rolls.flatMap(({ ids }) => [ids.job, ...ids.personalities, ids.background]));
    for (const t of [...JOBS, ...PERSONALITIES, ...BACKGROUNDS]) expect(seen.has(t.id), t.id).toBe(true);
  });

  it("희귀한 특성일수록 덜 나온다 (잔혹함 < 냉소)", () => {
    const count = (id: string) => rolls.filter((r) => r.ids.personalities.includes(id)).length;
    expect(count("cruel")).toBeLessThan(count("cynical") / 2);
  });

  it("같은 시드면 같은 결과", () => {
    expect(rollMany(7).slice(0, 20).map((r) => r.ids)).toEqual(rollMany(7).slice(0, 20).map((r) => r.ids));
  });
});

describe("rollStart", () => {
  it("시작 수치가 정해진 범위 안이다 (고용 의향 최소 30)", () => {
    for (const { start } of rollMany()) {
      expect(start!.affinity).toBeGreaterThanOrEqual(START_AFFINITY_RANGE[0]);
      expect(start!.affinity).toBeLessThanOrEqual(START_AFFINITY_RANGE[1]);
      expect(start!.willingness).toBeGreaterThanOrEqual(START_WILLINGNESS_RANGE[0]);
      expect(start!.willingness).toBeLessThanOrEqual(START_WILLINGNESS_RANGE[1]);
    }
  });
});

describe("combineReactions", () => {
  it("여러 특성의 반응을 더하고 -2~+2로 자른다", () => {
    // 오만함(조롱: 호감 -2, 의향 +2) + 몰락 귀족(조롱: 호감 -1)
    const table = combineReactions([getTrait("proud")!, getTrait("fallen_noble")!]);
    expect(table.mockery).toMatchObject({ affinity: -2, willingness: 2 });
  });

  it("서로 상쇄되면 반응표에서 빠진다", () => {
    // 냉소(존중: 호감 -1) + 노병(존중: 호감 +1)
    const table = combineReactions([getTrait("cynical")!, getTrait("veteran")!]);
    expect(table.respect).toBeUndefined();
  });

  it("속마음 메모를 이어 붙인다", () => {
    const table = combineReactions([getTrait("greedy")!, getTrait("reckless")!]);
    expect(table.mercy?.note).toContain("바보짓");
    expect(table.mercy?.note).toContain("머뭇거리면");
  });

  it("뽑힌 용병은 대부분 좋아하는 태도와 싫어하는 태도를 모두 가진다", () => {
    const mercs = rollMany().map(({ ids, start }) =>
      buildMerc({ id: "x", traits: ids, start: start!, level: "bronze", skills: [], profile }),
    );
    const complete = mercs.filter((m) => likedTones(m!).length > 0 && dislikedTones(m!).length > 0);
    expect(complete.length / mercs.length).toBeGreaterThan(0.95);
  });
});

describe("buildMerc", () => {
  const seed: MercSeed = {
    id: "r-test",
    traits: { race: "human", job: "priest", personalities: ["rude"], background: "excommunicated" },
    start: { affinity: 15, willingness: 40 },
    level: "bronze",
    skills: [],
    profile,
  };

  it("싸가지없는 사제: 반응표는 특성에서 계산되고 태그가 붙는다", () => {
    const merc = buildMerc(seed)!;
    expect(merc.tags).toEqual(["인간", "사제", "싸가지없음", "파문"]);
    expect(merc.race).toBe("human");
    expect(merc.reactions.mockery).toMatchObject({ affinity: 2, willingness: 1 });
    expect(merc.startWillingness).toBe(40);
  });

  it("규칙을 어긴 조합이나 없는 특성은 거부한다", () => {
    expect(buildMerc({ ...seed, traits: { ...seed.traits, job: "knight" } })).toBeNull(); // 파문은 사제만
    expect(buildMerc({ ...seed, traits: { ...seed.traits, personalities: ["kind", "rude"] } })).toBeNull();
    expect(buildMerc({ ...seed, traits: { ...seed.traits, job: "dragon" } })).toBeNull();
    expect(buildMerc({ ...seed, traits: { ...seed.traits, job: "kind" } })).toBeNull(); // 성격을 직업 자리에
    expect(buildMerc({ ...seed, traits: { ...seed.traits, race: "dragon" } })).toBeNull();
    expect(buildMerc({ ...seed, traits: { ...seed.traits, race: "priest" } })).toBeNull(); // 직업을 종족 자리에
  });
});

describe("rollRecruitCount", () => {
  it("1~5명이 모두 고르게 나온다", () => {
    const rand = seededRandom(3);
    const counts = new Map<number, number>();
    for (let i = 0; i < 10000; i++) {
      const n = rollRecruitCount(rand);
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(RECRUIT_COUNT_RANGE).toEqual([1, 5]);
    for (const c of counts.values()) expect(c).toBeGreaterThan(1700); // 기대값 2000
  });
});

describe("첫인상", () => {
  it("모든 성격에 첫인상 문구가 있다", () => {
    for (const p of PERSONALITIES) expect(p.impressions?.length, p.id).toBeGreaterThan(0);
  });

  it("첫 번째 성격의 문구를 고르고, 같은 id면 항상 같은 문구다", () => {
    const traits = [getTrait("archer")!, getTrait("greedy")!, getTrait("kind")!];
    const picked = pickImpression("merc-abc", traits);
    expect(getTrait("greedy")!.impressions).toContain(picked);
    expect(pickImpression("merc-abc", traits)).toBe(picked);
  });
});

describe("종족", () => {
  it("모든 종족이 나오고, 뽑힌 조합은 언제나 규칙을 지킨다", () => {
    const rand = seededRandom(11);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const traits = rollTraits(rand);
      seen.add(traits.race);
      expect(resolveTraits(traits), JSON.stringify(traits)).not.toBeNull();
    }
    expect([...seen].sort()).toEqual(RACES.map((r) => r.id).sort());
  });

  it("종족 반응은 ±1을 넘지 않고, 성격 반응과 더해진다", () => {
    for (const race of RACES) {
      for (const r of Object.values(race.reactions ?? {})) {
        expect(Math.abs(r.affinity)).toBeLessThanOrEqual(1);
        expect(Math.abs(r.willingness)).toBeLessThanOrEqual(1);
      }
    }
    // 오만함(존중 +1/+1) + 엘프(존중 +1/0)
    const table = combineReactions([getTrait("elf")!, getTrait("proud")!]);
    expect(table.respect).toMatchObject({ affinity: 2, willingness: 1 });
  });

  it("종족×직업 표 밖의 직업은 나오지 않고, 표 안에서는 종족 가중치를 따른다", () => {
    const jobs = (race: string) => jobsFor(getTrait(race)!).map((j) => j.id);
    expect(jobs("beastfolk")).not.toContain("knight");
    expect(jobs("barbarian")).not.toContain("mage");
    expect(jobs("elf")).not.toContain("guardian");
    expect(jobs("human")).toHaveLength(9);
    const weight = (race: string, job: string) => jobsFor(getTrait(race)!).find((j) => j.id === job)!.rarity;
    expect(weight("elf", "mage")).toBeGreaterThan(weight("human", "mage"));
    expect(weight("barbarian", "greatsword")).toBeGreaterThan(weight("human", "greatsword"));
    // 뽑힌 조합은 언제나 표 안에 있다
    const rand = seededRandom(3);
    for (let i = 0; i < 500; i++) {
      const t = rollTraits(rand);
      expect(canBe(t.race, t.job), `${t.race}/${t.job}`).toBe(true);
    }
  });

  it("표 밖 조합(수인 기사)의 시드는 거부한다", () => {
    const seed: MercSeed = {
      id: "x",
      traits: { race: "beastfolk", job: "knight", personalities: ["kind"], background: "wanderer" },
      start: { affinity: 40, willingness: 40 },
      level: "bronze",
        skills: [],
      profile,
    };
    expect(buildMerc(seed)).toBeNull();
    expect(buildMerc({ ...seed, traits: { ...seed.traits, job: "monk" } })).not.toBeNull();
  });

  it("수인은 시작 호감이 낮다", () => {
    const rand = seededRandom(5);
    const avg = (race: string) => {
      let sum = 0;
      for (let i = 0; i < 300; i++) sum += rollStart([getTrait(race)!], rand).affinity;
      return sum / 300;
    };
    expect(avg("beastfolk")).toBeLessThan(avg("human") - 5);
  });
});

describe("패시브 (2026-11-22 개편)", () => {
  it("직업 패시브 9개 + 융합 패시브 132개 (33조합 × 은 A/B × 금 A/B), id가 겹치지 않는다", () => {
    expect(JOB_PASSIVES).toHaveLength(9);
    expect(FUSION_PASSIVES).toHaveLength(132);
    expect(new Set(PASSIVES.map((p) => p.id)).size).toBe(PASSIVES.length);
    for (const job of JOBS)
      for (const race of RACES.filter((r) => canBe(r.id, job.id))) {
        for (const tier of ["silver", "gold"] as const) expect(fusionChoices(job.id, race.id, tier).map((p) => p.slot), `${job.id}/${race.id}/${tier}`).toEqual(["A", "B"]);
      }
  });

  it("상한: 직업 ≤ 10%, 은 ≤ 10%, 금 ≤ 20% (비율 효과의 합)", () => {
    for (const p of PASSIVES) expect(pctSum(p.effects), `${p.id} ${p.name}`).toBeLessThanOrEqual(PASSIVE_CAP[p.tier]);
    // 배치 예: 드워프 기사 = 은A 룬 새김 갑옷 / 은B 혈룬의 서약 / 금A 바위의 발걸음 / 금B 혈룬 각인
    expect(FUSION_PASSIVES.filter((p) => p.job === "knight" && p.race === "dwarf").map((p) => `${p.tier}${p.slot} ${p.name}`)).toEqual([
      "silverA 룬 새김 갑옷",
      "silverB 혈룬의 서약",
      "goldA 바위의 발걸음",
      "goldB 혈룬 각인",
    ]);
  });

  it("buildMerc: 직업 패시브는 처음부터, 은·금 패시브는 그 등급부터 그 직업·종족 것만", () => {
    const seed: MercSeed = {
      id: "d-1",
      traits: { race: "dwarf", job: "greatsword", personalities: ["jovial"], background: "veteran" },
      start: { affinity: 15, willingness: 40 },
      level: "bronze",
      skills: [],
      profile,
    };
    expect(buildMerc(seed)!.passives).toEqual(["greatsword_job"]);
    // 동인데 은 패시브 → 거부, 다른 직업 패시브 → 거부
    expect(buildMerc({ ...seed, passiveSilver: "greatsword_dwarf_sA" })).toBeNull();
    expect(buildMerc({ ...seed, level: "silver", passiveSilver: "greatsword_dwarf_sA" })!.passives).toEqual(["greatsword_job", "greatsword_dwarf_sA"]);
    expect(buildMerc({ ...seed, level: "silver", passiveSilver: "knight_dwarf_sA" })).toBeNull();
    expect(buildMerc({ ...seed, level: "silver", passiveSilver: "greatsword_dwarf_gA" })).toBeNull();
  });

  it("은 이상으로 모집되면 융합 패시브를 무작위로 (동은 없다)", () => {
    const rand = seededRandom(9);
    expect(rollPassives("greatsword", "dwarf", "bronze", rand)).toEqual({});
    const s = rollPassives("greatsword", "dwarf", "silver", rand);
    expect(["greatsword_dwarf_sA", "greatsword_dwarf_sB"]).toContain(s.passiveSilver);
    expect(s.passiveGold).toBeUndefined();
    const g = rollPassives("greatsword", "dwarf", "gold", rand);
    expect(["greatsword_dwarf_gA", "greatsword_dwarf_gB"]).toContain(g.passiveGold);
    expect(validPassives({ traits: { race: "dwarf", job: "greatsword", personalities: [], background: "veteran" }, level: "gold", ...g })).toBe(true);
  });

  it("예전 시드처럼 등급이 없으면 동, 융합 패시브 없음으로 읽는다", () => {
    const old = {
      id: "o-1",
      traits: { race: "human", job: "archer", personalities: ["kind"], background: "wanderer" },
      start: { affinity: 15, willingness: 40 },
      profile,
    };
    const parsed = MercSeed.parse(old);
    expect(parsed.level).toBe("bronze");
    expect(parsed.passiveSilver).toBeUndefined();
  });
});
