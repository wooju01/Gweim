import { describe, expect, it } from "vitest";
import { FRAGMENTS, JOB_BASIC, JOB_ULTIMATE, SUB_CAPS, getFragment, scaled, type MainFragment } from "@/data/fragments";
import { JOB_IDS, RACE_IDS, RACE_JOBS, canBe } from "@/data/jobs";
import type { DamageEffect } from "@/data/skills";
import {
  describeFragment,
  elementsAllowed,
  fragmentsFor,
  getSkill,
  normalize,
  resolveSkill,
  rollStartSkills,
  skillKey,
  validateLoadout,
  validateSkill,
  validateUltimate,
  type SkillOwner,
} from "./skills";
import { seededRandom } from "./merc/generate";

const dmg = (id: string, subs: string[] = [], levels = {}) =>
  resolveSkill({ main: id, subs }, levels)!.effects.find((e): e is DamageEffect => e.kind === "damage")!;

const human = (job: string, level: SkillOwner["level"] = "silver"): SkillOwner => ({ job, race: "human", level });

describe("조각 데이터", () => {
  it("직업마다 공통 메인 4 + 공통 부 4 + 궁극기, 가능한 종족마다 전용 메인 1 + 부 1", () => {
    for (const job of JOB_IDS) {
      const own = FRAGMENTS.filter((f) => f.job === job);
      expect(own.filter((f) => f.kind === "main" && !f.race && !f.ultimate), job).toHaveLength(4);
      expect(own.filter((f) => f.kind === "sub" && !f.race), job).toHaveLength(4);
      expect(own.filter((f) => f.kind === "main" && f.ultimate), job).toHaveLength(1);
      expect(JOB_ULTIMATE[job]).toBeDefined();
      expect(JOB_BASIC[job]).toBeDefined();
      for (const race of RACE_IDS) {
        const forRace = own.filter((f) => f.race === race);
        // 종족 전용 조각은 그 종족이 가질 수 있는 직업에만 있다
        if (!canBe(race, job)) expect(forRace, `${job}/${race}`).toHaveLength(0);
        else if (forRace.length) {
          expect(forRace.filter((f) => f.kind === "main"), `${job}/${race}`).toHaveLength(1);
          expect(forRace.filter((f) => f.kind === "sub"), `${job}/${race}`).toHaveLength(1);
        }
      }
    }
  });

  it("종족마다 직업 상관없는 공통 메인 4", () => {
    for (const race of RACE_IDS) expect(FRAGMENTS.filter((f) => f.race === race && !f.job && f.kind === "main"), race).toHaveLength(4);
  });

  it("id가 겹치지 않고, 메인 조각은 모두 스킬이 되며, 메인 + 부 하나 조합도 모두 스킬이 된다", () => {
    expect(new Set(FRAGMENTS.map((f) => f.id)).size).toBe(FRAGMENTS.length);
    for (const job of JOB_IDS)
      for (const race of RACE_JOBS.human.includes(job) ? ["human"] : RACE_IDS.filter((r) => canBe(r, job)).slice(0, 1)) {
        const pool = fragmentsFor({ job, race });
        for (const m of pool.filter((f) => f.kind === "main"))
          for (const sub of [undefined, ...pool.filter((f) => f.kind === "sub")]) {
            const sk = resolveSkill({ main: m.id, subs: sub ? [sub.id] : [] });
            expect(sk, `${m.id}+${sub?.id}`).toBeDefined();
            expect(sk!.cooldown).toBeGreaterThanOrEqual(0);
            expect(sk!.description.length).toBeGreaterThan(0);
            if (sub) expect(describeFragment(sub)).not.toBe("");
          }
      }
  });

  it("종족×직업 표는 33조합", () => {
    expect(Object.values(RACE_JOBS).reduce((s, js) => s + js.length, 0)).toBe(33);
    expect(canBe("beastfolk", "knight")).toBe(false);
    expect(canBe("elf", "guardian")).toBe(false);
    expect(canBe("barbarian", "priest")).toBe(true);
  });

  it("부 조각 수치는 Lv1 → Lv3, Lv2는 가운데", () => {
    expect(scaled([2, 5], 1)).toBe(2);
    expect(scaled([2, 5], 2)).toBe(3.5);
    expect(scaled([2, 5], 3)).toBe(5);
    expect(scaled(0.3, 3)).toBe(0.3);
  });
});

describe("조각 합치기", () => {
  it("대기 = 메인 기본 대기 + 부 조각 대가", () => {
    expect(resolveSkill({ main: "knight_slash", subs: [] })!.cooldown).toBe(0);
    expect(resolveSkill({ main: "knight_slash", subs: ["knight_chivalry"] })!.cooldown).toBe(1);
    expect(resolveSkill({ main: "mn_courage", subs: ["mn_tempo"] })!.cooldown).toBe(0);
    // 대기는 0 아래로 내려가지 않는다
    expect(resolveSkill({ main: "mn_discord", subs: ["mn_tempo"] })!.cooldown).toBe(0);
  });

  it("휩쓸기는 적 하나 공격을 적 전체로, 연격은 2회 ×0.6", () => {
    const sweep = dmg("knight_slash", ["knight_sweep"]);
    expect(sweep.area).toBe("all");
    expect(sweep.multiplier).toBe(0.6);
    expect(resolveSkill({ main: "knight_slash", subs: ["knight_sweep"] })!.target).toBe("none");
    expect(dmg("knight_slash", ["knight_combo"])).toMatchObject({ hits: 2, multiplier: 0.6 });
  });

  it("고정 피해·치명·방어 무시는 레벨을 따르고 더해진다", () => {
    expect(dmg("knight_human_main", ["knight_human_sub"])).toMatchObject({ bonus: 2, pierce: 0.2 });
    expect(dmg("knight_human_main", ["knight_human_sub"], { knight_human_sub: 3 }).bonus).toBe(5);
    expect(dmg("gs_human_main", ["gs_human_sub"], { gs_human_sub: 3 })).toMatchObject({ bonus: 3, critBonus: 0.2 });
  });

  it("상한: 같은 종류 부 조각 효과의 합은 잘린다 (위력 25%, 치명 30%, 고정 15)", () => {
    // 합치기는 직업 제한을 보지 않는다 (제한은 validateSkill). 그래서 여러 직업의 조각으로 상한을 시험한다
    const twoPower = resolveSkill({ main: "gs_strike", subs: ["gs_recoil", "gs_pierce"] })!;
    expect((twoPower.effects[0] as DamageEffect).multiplier).toBeCloseTo(1.4 * 1.2);
    // 치명: 치명 노림(15%) + 정확한 자세 Lv3(20%) = 35% → 30%. 같은 용병이 낄 수는 없지만 합산 규칙은 같다
    const crit = dmg("as_throw", ["as_aim", "gs_human_sub"], { gs_human_sub: 3 });
    expect(crit.critBonus).toBeCloseTo(0.1 + SUB_CAPS.crit);
    // 위력: 반동 강타(20%) + 급소 타격(20%) = 40% → 25%. 대가(-10%)는 자르지 않는다
    const power = dmg("monk_punch", ["monk_vital", "gs_recoil"]);
    expect(power.multiplier).toBeCloseTo(1.2 * (1 + SUB_CAPS.power));
    const withCost = dmg("monk_punch", ["monk_vital", "as_aim"]);
    expect(withCost.multiplier).toBeCloseTo(1.2 * (1 + 0.2 - 0.1));
    // 고정: 오러 Lv3(5) + 정밀 화살촉 Lv3(4) = 9 (상한 아래)
    expect(dmg("knight_slash", ["knight_human_sub", "ar_human_sub"], { knight_human_sub: 3, ar_human_sub: 3 }).bonus).toBe(9);
  });

  it("덧붙는 상태: 공격 스킬에만 붙는 것, 대상이 따라가는 것", () => {
    // 출혈 부 조각은 공격 스킬에 붙고, 그림자 걸음(자기 강화)에는 붙지 않는다
    expect(resolveSkill({ main: "as_throw", subs: ["as_bleed"] })!.effects.some((e) => e.kind === "applyStatus" && e.status === "bleed")).toBe(true);
    expect(resolveSkill({ main: "as_shadow", subs: ["as_bleed"] })!.effects.some((e) => e.kind === "applyStatus" && e.status === "bleed")).toBe(false);
    // 축복: 아군 하나를 고르는 치유의 기도면 그 아군, 광휘(아군 전체)면 아군 전체
    const one = resolveSkill({ main: "pr_heal", subs: ["pr_bless"] })!.effects.find((e) => e.kind === "applyStatus")!;
    expect(one).toMatchObject({ status: "attackUp" });
    expect("who" in one && one.who).toBeFalsy();
    const all = resolveSkill({ main: "pr_radiance", subs: ["pr_bless"] })!.effects.find((e) => e.kind === "applyStatus")!;
    expect(all).toMatchObject({ status: "attackUp", who: "allies" });
  });

  it("바드: 앙코르는 지속 +1, 독주는 대상 하나에 2배, 빠른 박자는 효과 -30%", () => {
    const encore = resolveSkill({ main: "mn_courage", subs: ["mn_encore"] })!.effects[0];
    expect(encore).toMatchObject({ status: "attackUp", turns: 3 });
    const solo = resolveSkill({ main: "mn_courage", subs: ["mn_solo"] })!;
    expect(solo.target).toBe("ally");
    expect(solo.effects[0]).toMatchObject({ status: "attackUp", value: 4 });
    expect(resolveSkill({ main: "mn_courage", subs: ["mn_tempo"] })!.effects[0]).toMatchObject({ value: 1 });
  });

  it("정령 공명: 원소 조각이 없으면 위력, 있으면 원소 수치가 오른다", () => {
    expect(dmg("mg_bolt", ["mg_elf_sub"]).multiplier).toBeCloseTo(1.05);
    // 바람(방어 20% 무시) + 공명 Lv1(+10%) → 22%
    expect(dmg("mg_bolt", ["mg_wind", "mg_elf_sub"]).pierce).toBeCloseTo(0.22);
  });

  it("id는 부 조각 순서와 상관없이 같다", () => {
    expect(skillKey({ main: "knight_slash", subs: ["knight_combo", "knight_sweep"] })).toBe(skillKey({ main: "knight_slash", subs: ["knight_sweep", "knight_combo"] }));
    expect(normalize({ main: "a", subs: [] })).toEqual({ main: "a", subs: [] });
    expect(getSkill("knight_slash+knight_sweep")!.name).toContain("휩쓸기");
    expect(getSkill("m_web")).toBeDefined();
    expect(getSkill("nope")).toBeUndefined();
  });
});

describe("조각 규칙", () => {
  it("부 조각 개수: 동 1개, 은부터 2개", () => {
    const build = { main: "knight_slash", subs: ["knight_sweep", "knight_grit"] };
    expect(validateSkill(human("knight", "bronze"), build)).toBe("부 조각은 1개까지");
    expect(validateSkill(human("knight", "bronze"), { ...build, subs: ["knight_sweep"] })).toBeNull();
    expect(validateSkill(human("knight", "silver"), build)).toBeNull();
    expect(validateSkill(human("knight", "silver"), { ...build, subs: ["knight_sweep", "knight_sweep"] })).not.toBeNull();
  });

  it("다른 직업·다른 종족의 조각은 쓸 수 없다", () => {
    expect(validateSkill(human("knight"), { main: "gs_strike", subs: [] })).toBe("쓸 수 없는 메인 조각");
    expect(validateSkill(human("knight"), { main: "knight_elf_main", subs: [] })).toBe("쓸 수 없는 메인 조각");
    expect(validateSkill(human("knight"), { main: "knight_slash", subs: ["knight_dwarf_sub"] })).toBe("쓸 수 없는 부 조각");
    // 종족 공통 조각은 직업과 상관없다
    expect(validateSkill(human("mage"), { main: "rc_human_cut", subs: [] })).toBeNull();
    expect(validateSkill(human("mage"), { main: "rc_elf_spirit", subs: [] })).not.toBeNull();
    // 궁극기는 스킬로 조립할 수 없다
    expect(validateSkill(human("knight"), { main: "ult_knight", subs: [] })).not.toBeNull();
  });

  it("원소: 한 스킬에 하나. 드워프 마법사는 불+흙, 원소술사는 고른 원소 둘", () => {
    const two = { main: "mg_bolt", subs: ["mg_fire", "mg_earth"] };
    expect(validateSkill({ job: "mage", race: "human", level: "silver" }, two)).toBe("원소 조각은 한 스킬에 하나까지");
    expect(validateSkill({ job: "mage", race: "dwarf", level: "silver" }, two)).toBeNull();
    expect(validateSkill({ job: "mage", race: "dwarf", level: "silver" }, { main: "mg_bolt", subs: ["mg_fire", "mg_water"] })).not.toBeNull();
    const elementalist = { job: "mage", race: "human", level: "gold" as const, branch: "elementalist", elements: ["fire" as const, "wind" as const] };
    expect(validateSkill(elementalist, { main: "mg_bolt", subs: ["mg_fire", "mg_wind"] })).toBeNull();
    expect(validateSkill(elementalist, { main: "mg_bolt", subs: ["mg_fire", "mg_earth"] })).not.toBeNull();
    expect(elementsAllowed({ ...elementalist, branch: "warlock" }, ["fire", "wind"])).toBe(false);
  });

  it("궁극기는 금 등급부터, 자기 직업 것만", () => {
    expect(validateUltimate(human("knight", "silver"), "ult_knight")).not.toBeNull();
    expect(validateUltimate(human("knight", "gold"), "ult_knight")).toBeNull();
    expect(validateUltimate(human("knight", "gold"), "ult_mage")).not.toBeNull();
  });

  it("장착 목록: 4개까지, 겹치지 않게", () => {
    const owner = human("knight");
    const s = (main: string) => ({ main, subs: [] });
    expect(validateLoadout(owner, [s("knight_slash"), s("knight_bulwark"), s("knight_duel"), s("knight_charge")])).toBeNull();
    expect(validateLoadout(owner, [s("knight_slash"), s("knight_bulwark"), s("knight_duel"), s("knight_charge"), s("rc_human_cut")])).not.toBeNull();
    expect(validateLoadout(owner, [s("knight_slash"), s("knight_slash")])).not.toBeNull();
  });

  it("시작 스킬: 쓸 수 있는 메인 중에서 겹치지 않게, 부 조각은 0~1개", () => {
    for (let i = 0; i < 50; i++) {
      const owner: SkillOwner = { job: "archer", race: "elf", level: "bronze" };
      const skills = rollStartSkills(owner, seededRandom(i));
      expect(skills.length).toBeGreaterThan(0);
      expect(validateLoadout(owner, skills)).toBeNull();
      for (const b of skills) expect(b.subs.length).toBeLessThanOrEqual(1);
    }
  });

  it("2단계 효과(later)는 데이터에만 있고 설명에 '준비 중'으로 나온다", () => {
    const duel = getFragment("knight_duel") as MainFragment;
    expect(duel.effects.every((e) => e.kind === "later")).toBe(true);
    expect(resolveSkill({ main: "knight_duel", subs: [] })!.description).toContain("준비 중");
  });
});
