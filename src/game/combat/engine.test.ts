import { describe, expect, it } from "vitest";
import { POTION_HEAL, START_SUPPLIES, STATUS } from "@/data/combat";
import { curveBonus } from "@/data/growth";
import { TEST_MERCS } from "@/test/fixtures";
import { PASSIVES } from "@/data/passives";
import { createRng } from "@/game/random";
import type { Merc } from "@/game/types";
import {
  act,
  currentActor,
  dotStack,
  giftsReceived,
  mercenaryEnemy,
  mercUnit,
  neighbors,
  previewAction,
  startBattleWithUnits,
  strikeFactors,
  strikeAmount,
  takenReduction,
  unitStats,
  hasStatus,
  living,
  resistOf,
  skillDef,
  speedOf,
  statusValue,
  startBattle,
  unitById,
  validate,
  type Battle,
  type BattleAction,
  type BattleEvent,
  type Unit,
} from "./engine";
import { describeSkill, statusTip, type Skill, type SkillDef } from "@/data/skills";
import { JOB_IDS, RACE_IDS, canBe } from "@/data/jobs";
import { RESIST } from "@/data/combat";
import { rollStartSkills, skillKey } from "@/game/skills";
import { describe as describeEvent, josa } from "./text";

/**
 * 엔진 규칙을 시험하려고 직접 정의한 스킬. 조각 데이터와 상관없이 효과만 고정해 두고,
 * 테스트용 유닛의 스킬 책(book)에 넣는다. 대기는 엔진 규칙(쓰고 나서 쉬는 자기 차례 수)
 */
const TEST_SKILL_DEFS: SkillDef[] = [
  { id: "guard", name: "막아서기", cooldown: 1, target: "none", effects: [{ kind: "taunt" }] },
  {
    id: "pierce",
    name: "급소 찌르기",
    cooldown: 1,
    target: "enemy",
    effects: [
      { kind: "damage", bonus: 3, onHit: false },
      { kind: "applyStatus", status: "bleed" },
    ],
  },
  { id: "pray", name: "기도", cooldown: 2, target: "ally", effects: [{ kind: "heal", amount: 8 }, { kind: "cure" }] },
  { id: "volley", name: "화살비", cooldown: 2, target: "none", effects: [{ kind: "damage", fixed: [3, 5], area: "all", onHit: false }] },
  { id: "cleave", name: "내려찍기", cooldown: 1, target: "enemy", effects: [{ kind: "damage", multiplier: 1.8 }, { kind: "selfCost", hp: 3 }] },
  { id: "miasma", name: "독안개", cooldown: 2, target: "none", effects: [{ kind: "applyStatus", status: "poison", area: "all" }] },
  { id: "firelance", name: "불꽃 창", cooldown: 2, target: "enemy", effects: [{ kind: "damage", multiplier: 2.5, onHit: false }, { kind: "selfCost", hp: 4 }] },
  { id: "ward", name: "정령의 가호", cooldown: 1, target: "ally", effects: [{ kind: "fail", chance: 0.2 }, { kind: "shield", amount: 6 }] },
  { id: "power", name: "전력 공격", cooldown: 2, target: "enemy", effects: [{ kind: "damage", multiplier: 1.5 }] },
  { id: "resolve", name: "결의", cooldown: 3, target: "none", effects: [{ kind: "applyStatus", status: "awaken", who: "self" }] },
  { id: "smoke", name: "연막", cooldown: 1, target: "none", effects: [{ kind: "shield", amount: 5, who: "self" }] },
  { id: "mend_all", name: "함께하는 기도", cooldown: 2, target: "ally", effects: [{ kind: "heal", amount: 8 }, { kind: "support", shield: 0 }] },
  { id: "brace", name: "버티기", cooldown: 1, target: "none", effects: [{ kind: "applyStatus", status: "brace", who: "self" }] },
  { id: "haste", name: "앞서기", cooldown: 1, target: "none", effects: [{ kind: "applyStatus", status: "haste", who: "self" }] },
  { id: "hunt", name: "사냥", cooldown: 1, target: "enemy", effects: [{ kind: "damage", multiplier: 1.8 }, { kind: "resetOnKill" }] },
  { id: "twin", name: "연타", cooldown: 1, target: "enemy", effects: [{ kind: "damage", multiplier: 0.6, hits: 2 }] },
];
const TEST_SKILLS: Record<string, Skill> = Object.fromEntries(TEST_SKILL_DEFS.map((d) => [d.id, { ...d, description: describeSkill(d) }]));
/** 직업별 시험용 기본 스킬 */
const TEST_JOB_SKILL: Record<string, string> = {
  knight: "guard",
  assassin: "pierce",
  priest: "pray",
  archer: "volley",
  greatsword: "cleave",
  monk: "miasma",
  mage: "firelance",
  minstrel: "ward",
};

/** 시험용 스킬을 쓰는 용병 (kit: 스킬 id, 없으면 직업 기본) */
type TMerc = Merc & { kit?: string[] };

/** 시험용 스킬을 넣은 용병 유닛. 실제 조각 스킬(merc.skills)이 있으면 그대로 */
function tUnit(m: TMerc): Unit {
  const u = mercUnit(m);
  if (m.skills?.length) return u;
  const ids = (m.kit ?? [TEST_JOB_SKILL[m.job ?? ""] ?? "power"]).slice(0, 4);
  return { ...u, skills: ids, book: { ...u.book, ...Object.fromEntries(ids.map((id) => [id, TEST_SKILLS[id]])) } };
}

/** 밸런스 측정용 단순 정책: 출혈이면 붕대, 스킬이 준비되면 스킬, 아니면 가장 약한 적 공격 */
function simplePolicy(b: Battle, actor: Unit): BattleAction {
  const weakest = [...living(b, "enemy")].sort((x, y) => x.hp - y.hp)[0].id;
  if (actor.statuses.some((s) => s.kind === "bleed") && b.supplies.bandage > 0)
    return { type: "bandage" };
  const sk = actor.skills[0];
  if (sk && !(actor.cooldowns[sk] > 0)) {
    const kind = skillDef(actor, sk)!.target;
    if (kind === "none") return { type: "skill" };
    if (kind === "enemy") return { type: "skill", target: weakest };
    const hurt = [...living(b, "merc")].sort(
      (x, y) => x.hp / x.maxHp - y.hp / y.maxHp,
    )[0];
    if (hurt.hp < hurt.maxHp * 0.7) return { type: "skill", target: hurt.id };
  }
  return { type: "attack", target: weakest };
}

const [varn, kass, elke] = TEST_MERCS;
const party: Merc[] = [
  { ...varn, job: "knight" },
  { ...kass, job: "assassin" },
  { ...elke, job: "priest" },
];

/**
 * 규칙 테스트용 전투 시작. 용병의 방어력은 0, 속도는 파티 순서대로 높게 고정해서
 * 용병이 파티 순서대로 행동하고 피해 계산이 단순해진다. 방어력·속도 자체는 따로 테스트한다.
 */
function start(
  mercs: TMerc[],
  seed: number,
  enemies?: Unit[],
  depth = 1,
): Battle {
  if (!enemies) return startBattle(mercs, seed, undefined, depth);
  const units = mercs.map((m, i) => ({
    ...tUnit(m),
    defense: 0,
    speed: 100 - i * 10,
  }));
  return startBattleWithUnits([...units, ...enemies], seed, depth);
}

/** 용병 평타는 0.8배라서, 테스트에서 "평타 피해 5"를 만들려면 공격력 6 (6 × 0.8 = 4.8 → 5) */

/** 테스트용 고정 적: 공격력이 낮아 금방 끝나지 않는다. 속도 -10이라 언제나 맨 마지막에 행동한다 */
function dummy(id: string, hp = 30, overrides: Partial<Unit> = {}): Unit {
  return {
    id,
    side: "enemy",
    name: "허수아비",
    title: "",
    hp,
    maxHp: hp,
    attack: [1, 1],
    defense: 0,
    speed: -10,
    statuses: [],
    skills: [],
    cooldowns: {},
    guarding: false,
    ...overrides,
  };
}

/** 방어 포인트 p인 대상이 받는 피해 (곡선, 최소 1) */
const taken = (amount: number, p: number) => Math.max(1, Math.round(amount * (1 - curveBonus("defense", p))));

/** 상태를 손으로 고친 복사본 */
function edit(b: Battle, fn: (b: Battle) => void): Battle {
  const copy = structuredClone(b);
  fn(copy);
  return copy;
}

describe("시작", () => {
  it("첫 라운드, 첫 용병 차례에서 시작한다", () => {
    const b = start(party, 1, [dummy("e0")]);
    expect(b.round).toBe(1);
    expect(currentActor(b)?.id).toBe(varn.id);
    expect(b.log[0]).toEqual({ type: "round", round: 1 });
    expect(b.supplies).toEqual(START_SUPPLIES);
  });

  it("직업에 따라 체력이 다르다", () => {
    const b = start(party, 1, [dummy("e0")]);
    expect(unitById(b, varn.id)!.maxHp).toBe(32); // 기사
    expect(unitById(b, kass.id)!.maxHp).toBe(24); // 암살자
  });

  it("같은 시드면 같은 적과 같은 결과", () => {
    const play = (seed: number) => {
      let b = start(party, seed);
      for (let i = 0; i < 30 && !b.outcome; i++)
        b = act(b, { type: "attack", target: living(b, "enemy")[0].id });
      return b.log;
    };
    expect(play(99)).toEqual(play(99));
  });
});

describe("용병 행동", () => {
  it("공격하면 적 체력이 줄고 다음 용병 차례로 넘어간다", () => {
    const b = start(party, 1, [dummy("e0")]);
    const next = act(b, { type: "attack", target: "e0" });
    expect(unitById(next, "e0")!.hp).toBeLessThan(30);
    expect(next.log.at(-1)).toMatchObject({
      type: "attack",
      actor: varn.id,
      target: "e0",
    });
    expect(currentActor(next)?.id).toBe(kass.id);
  });

  it("원본 상태는 바뀌지 않는다", () => {
    const b = start(party, 1, [dummy("e0")]);
    const before = JSON.stringify(b);
    act(b, { type: "attack", target: "e0" });
    expect(JSON.stringify(b)).toBe(before);
  });

  it("용병이 모두 행동하면 적이 자동으로 행동하고 다음 라운드가 된다", () => {
    let b = start(party, 1, [dummy("e0", 999)]);
    for (let i = 0; i < 3; i++) b = act(b, { type: "attack", target: "e0" });
    expect(b.round).toBe(2);
    expect(currentActor(b)?.id).toBe(varn.id);
    expect(b.log.some((e) => e.type === "attack" && e.actor === "e0")).toBe(
      true,
    );
  });

  it("붕대: 출혈이 있어야 쓸 수 있고, 물자를 쓰고 출혈을 멈춘다", () => {
    const b = start(party, 1, [dummy("e0")]);
    expect(validate(b, { type: "bandage" })).toBe("출혈이 없다");

    const bleeding = edit(b, (x) =>
      unitById(x, varn.id)!.statuses.push({ kind: "bleed", turns: 3 }),
    );
    const next = act(bleeding, { type: "bandage" });
    expect(unitById(next, varn.id)!.statuses).toEqual([]);
    expect(next.supplies.bandage).toBe(START_SUPPLIES.bandage - 1);
    expect(currentActor(next)?.id).toBe(kass.id); // 붕대도 턴을 쓴다
  });

  it("할 수 없는 행동은 무시된다", () => {
    const b = start(party, 1, [dummy("e0")]);
    expect(act(b, { type: "attack", target: varn.id })).toBe(b); // 아군 공격
    expect(act(b, { type: "attack", target: "nope" })).toBe(b);
  });
});

describe("길안내자 보조", () => {
  it("라운드에 한 번만, 그리고 용병 차례를 넘기지 않는다", () => {
    const b = edit(start(party, 1, [dummy("e0")]), (x) => {
      unitById(x, kass.id)!.hp = 5;
    });
    const healed = act(b, { type: "guide", item: "potion", target: kass.id });
    expect(unitById(healed, kass.id)!.hp).toBe(5 + POTION_HEAL);
    expect(currentActor(healed)?.id).toBe(varn.id);
    expect(
      validate(healed, { type: "guide", item: "potion", target: kass.id }),
    ).toBe("이번 라운드에는 이미 도왔다");
  });

  it("다음 라운드가 되면 다시 도울 수 있다", () => {
    let b = act(
      edit(
        start(party, 1, [dummy("e0", 999)]),
        (x) => (unitById(x, kass.id)!.hp = 5),
      ),
      { type: "guide", item: "potion", target: kass.id },
    );
    for (let i = 0; i < 3; i++) b = act(b, { type: "attack", target: "e0" });
    expect(b.guideUsed).toBe(false);
  });

  it("물약은 최대 체력을 넘기지 않는다", () => {
    const b = edit(
      start(party, 1, [dummy("e0")]),
      (x) => (unitById(x, varn.id)!.hp -= 3),
    );
    const next = act(b, { type: "guide", item: "potion", target: varn.id });
    expect(unitById(next, varn.id)!.hp).toBe(unitById(next, varn.id)!.maxHp);
    expect(next.log.at(-1)).toMatchObject({ type: "heal", amount: 3 });
  });

  it("해독제는 중독에만, 붕대는 출혈에만", () => {
    const b = start(party, 1, [dummy("e0")]);
    expect(
      validate(b, { type: "guide", item: "antidote", target: elke.id }),
    ).toBe("중독이 없다");
    expect(
      validate(b, { type: "guide", item: "bandage", target: elke.id }),
    ).toBe("출혈이 없다");
    expect(
      validate(b, { type: "guide", item: "potion", target: elke.id }),
    ).toBe("체력이 가득하다");

    const poisoned = edit(b, (x) =>
      unitById(x, elke.id)!.statuses.push({ kind: "poison", turns: 4 }),
    );
    const next = act(poisoned, {
      type: "guide",
      item: "antidote",
      target: elke.id,
    });
    expect(unitById(next, elke.id)!.statuses).toEqual([]);
    expect(next.supplies.antidote).toBe(START_SUPPLIES.antidote - 1);
  });

  it("물자가 떨어지면 쓸 수 없다", () => {
    const b = edit(start(party, 1, [dummy("e0")]), (x) => {
      x.supplies.potion = 0;
      unitById(x, varn.id)!.hp = 1;
    });
    expect(
      validate(b, { type: "guide", item: "potion", target: varn.id }),
    ).toBe("물자가 없다");
  });
});

describe("상태이상", () => {
  /** who의 출혈·중독 피해 기록 (차례가 끝날 때마다) */
  const ticksOf = (b: Battle, who: string, kind: "poison" | "bleed") =>
    b.log.filter((e) => e.type === "tick" && e.target === who && e.kind === kind).map((e) => (e as { damage: number }).damage);
  /** 모두 공격만 하며 rounds 라운드 진행 */
  const play = (b: Battle, rounds: number) => {
    for (let i = 0; i < 200 && !b.outcome && b.round <= rounds; i++) b = act(b, { type: "attack", target: "e0" });
    return b;
  };

  it("중독: 차례가 끝날 때 피해, 그 뒤 30% 줄어든다 (2 → 1 → 0, 총 3)", () => {
    let b = start(party, 1, [dummy("e0", 9999, { attack: [0, 0] })]);
    const me = currentActor(b)!.id;
    b = edit(b, (x) => void unitById(x, me)!.statuses.push({ kind: "poison", turns: 1, value: 2 }));
    b = play(b, 4);
    expect(ticksOf(b, me, "poison")).toEqual([2, 1]);
    expect(unitById(b, me)!.statuses.some((s) => s.kind === "poison")).toBe(false);
  });

  it("출혈: 차례가 끝날 때 피해, 그 뒤 절반 (4 → 2 → 1 → 0, 총 7)", () => {
    let b = start(party, 1, [dummy("e0", 9999, { attack: [0, 0] })]);
    const me = currentActor(b)!.id;
    b = edit(b, (x) => void unitById(x, me)!.statuses.push({ kind: "bleed", turns: 1, value: 4 }));
    b = play(b, 5);
    expect(ticksOf(b, me, "bleed")).toEqual([4, 2, 1]);
  });

  it("반복해서 걸면 수치가 쌓인다 (일반 몬스터 중독 +2씩)", () => {
    let b = start(party, 1, [dummy("e0", 9999, { attack: [1, 1], onHit: { status: "poison", chance: 1 }, rank: "normal", side: "enemy" })]);
    b = play(b, 3);
    const hits = b.log.filter((e) => e.type === "status" && e.kind === "poison").length;
    expect(hits).toBeGreaterThan(1);
    // 쌓이는 양: 일반 +2, 던전 보스 +4 (몬스터마다 덮어쓸 수 있다)
    expect(dotStack({ ...dummy("x"), side: "enemy", rank: "normal" }, "poison")).toBe(2);
    expect(dotStack({ ...dummy("x"), side: "enemy", rank: "dungeonBoss" }, "bleed")).toBe(6);
    expect(dotStack({ ...dummy("x"), side: "enemy", rank: "dungeonBoss", dot: { poison: 9 } }, "poison")).toBe(9);
  });

  it("출혈·중독으로 쓰러질 수 있다 (차례가 끝날 때)", () => {
    let b = edit(start(party, 1, [dummy("e0", 999)]), (x) => {
      const k = unitById(x, kass.id)!;
      k.hp = 1;
      k.statuses.push({ kind: "bleed", turns: 1, value: 4 });
    });
    b = act(b, { type: "attack", target: "e0" }); // 바른
    b = act(b, { type: "attack", target: "e0" }); // 카스: 차례가 끝날 때 출혈로 쓰러진다
    expect(unitById(b, kass.id)!.hp).toBe(0);
    expect(b.log).toContainEqual({ type: "down", target: kass.id });
    expect(currentActor(b)?.id).toBe(elke.id);
  });

  it("암살자의 공격은 출혈을 걸 수 있다", () => {
    let seenBleed = false;
    for (let seed = 0; seed < 50 && !seenBleed; seed++) {
      let b = start(party, seed, [dummy("e0", 999)]);
      b = act(b, { type: "attack", target: "e0" }); // 바른
      b = act(b, { type: "attack", target: "e0" }); // 카스(암살자)
      seenBleed = b.log.some(
        (e) => e.type === "status" && e.target === "e0" && e.kind === "bleed",
      );
    }
    expect(seenBleed).toBe(true);
  });
});

describe("승패", () => {
  it("적을 모두 쓰러뜨리면 승리", () => {
    const b = act(start(party, 1, [dummy("e0", 1)]), {
      type: "attack",
      target: "e0",
    });
    expect(b.outcome).toBe("victory");
    expect(b.log.at(-1)).toEqual({ type: "end", outcome: "victory" });
    expect(currentActor(b)).toBeNull();
    expect(validate(b, { type: "attack", target: "e0" })).toBe("전투가 끝났다");
  });

  it("용병이 모두 쓰러지면 패배", () => {
    let b = edit(
      start(party, 1, [dummy("e0", 999, { attack: [99, 99] })]),
      (x) => {
        for (const u of living(x, "merc")) u.hp = 1;
      },
    );
    // 적 하나는 라운드마다 한 명씩만 공격하므로 여러 라운드가 걸린다
    for (let i = 0; i < 30 && !b.outcome; i++)
      b = act(b, { type: "attack", target: "e0" });
    expect(b.outcome).toBe("defeat");
  });

  it("무작위 전투 2000판이 모두 끝나고, 4인 파티는 한 번의 전투에서 거의 이긴다", () => {
    const four: Merc[] = [...party, { ...varn, id: "v2", job: "greatsword" }];
    let wins = 0;
    for (let seed = 0; seed < 2000; seed++) {
      let b = startBattle(four, seed);
      for (let step = 0; step < 500 && !b.outcome; step++) {
        const actor = currentActor(b)!;
        // 단순한 정책: 다친 용병에게 물약, 출혈이면 붕대, 아니면 체력이 가장 낮은 적 공격
        const hurt = living(b, "merc").find((u) => u.hp < u.maxHp / 2);
        if (hurt && !b.guideUsed && b.supplies.potion > 0)
          b = act(b, { type: "guide", item: "potion", target: hurt.id });
        b = act(b, simplePolicy(b, actor));
      }
      expect(b.outcome, `seed ${seed}`).not.toBeNull();
      if (b.outcome === "victory") wins++;
    }
    console.info(`[밸런스] 4인 파티 승률 ${((wins / 2000) * 100).toFixed(1)}%`);
    // 전투 한 번은 쉽게. 난이도는 던전에서 체력·물자가 이어지며 깎이는 데서 나온다
    expect(wins / 2000).toBeGreaterThan(0.9);
  }, 30_000);
});

describe("스킬", () => {
  /** 막아서기를 확인하려고 바른(기사)이 아닌 순서도 필요해 직업을 바꿔 가며 쓴다 */
  const withJob = (job: string): Merc[] => [
    { ...varn, job },
    { ...kass, job: "assassin" },
    { ...elke, job: "priest" },
  ];

  it("스킬이 없는 용병은 직업 기본 조각, 직업이 없으면 전력 공격", () => {
    expect(mercUnit({ ...varn, job: "knight" }).skills).toEqual(["knight_slash"]);
    expect(mercUnit({ ...kass, job: "assassin" }).skills).toEqual(["as_throw"]);
    expect(mercUnit({ ...elke, job: "priest" }).skills).toEqual(["pr_heal"]);
    expect(mercUnit({ ...varn, job: undefined }).skills).toEqual(["power"]);
  });

  it("쓰고 나면 대기 시간이 생기고, 자기 턴이 지나면 다시 쓸 수 있다", () => {
    let b = start(withJob("greatsword"), 1, [dummy("e0", 999)]);
    b = act(b, { type: "skill", target: "e0" });
    expect(b.log.some((e) => e.type === "skill" && e.skill === "cleave")).toBe(
      true,
    );
    // 다음 라운드까지 진행
    b = act(b, { type: "attack", target: "e0" });
    b = act(b, { type: "attack", target: "e0" });
    expect(validate(b, { type: "skill", target: "e0" })).toBe(
      "1턴 뒤에 쓸 수 있다",
    );
    for (let i = 0; i < 3; i++) b = act(b, { type: "attack", target: "e0" });
    expect(validate(b, { type: "skill", target: "e0" })).toBeNull();
  });

  it("대상 규칙: 기도는 아군에게만, 막아서기는 대상 없이", () => {
    const nunFirst = start([{ ...elke, job: "priest" }, ...party.slice(0, 2)], 1, [
      dummy("e0"),
    ]);
    expect(validate(nunFirst, { type: "skill", target: "e0" })).toBe(
      "아군에게만 쓸 수 있다",
    );
    expect(validate(nunFirst, { type: "skill" })).toBe("대상을 골라야 한다");

    const spearFirst = start(party, 1, [dummy("e0")]);
    expect(validate(spearFirst, { type: "skill", target: "e0" })).toBe(
      "대상을 고르지 않는 스킬",
    );
    expect(validate(spearFirst, { type: "skill" })).toBeNull();
  });

  it("막아서기: 적이 막아선 용병만 공격하고, 피해가 절반이 된다", () => {
    let b = start(party, 1, [
      dummy("e0", 999, { attack: [10, 10] }),
      dummy("e1", 999, { attack: [10, 10] }),
    ]);
    b = act(b, { type: "skill" }); // 바른 막아서기
    b = act(b, { type: "attack", target: "e0" });
    b = act(b, { type: "attack", target: "e0" }); // 적 턴 진행
    const enemyHits = b.log.filter(
      (e) => e.type === "attack" && ["e0", "e1"].includes(e.actor),
    );
    expect(enemyHits.length).toBe(2);
    for (const hit of enemyHits) {
      expect(hit).toMatchObject({ target: varn.id });
      expect([5, 8]).toContain((hit as { damage: number }).damage); // 10의 절반, 치명타면 15의 절반 올림
    }
  });

  it("막아서기는 자기 다음 차례에 풀린다", () => {
    let b = start(party, 1, [dummy("e0", 999)]);
    b = act(b, { type: "skill" });
    expect(unitById(b, varn.id)!.guarding).toBe(true);
    b = act(b, { type: "attack", target: "e0" });
    b = act(b, { type: "attack", target: "e0" });
    expect(currentActor(b)?.id).toBe(varn.id);
    expect(unitById(b, varn.id)!.guarding).toBe(false);
  });

  it("급소 찌르기: 살아남은 대상에게 반드시 출혈", () => {
    let b = start([{ ...kass, job: "assassin" }, ...party.slice(0, 1)], 1, [
      dummy("e0", 999),
    ]);
    b = act(b, { type: "skill", target: "e0" });
    expect(hasBleed(b, "e0")).toBe(true);
  });

  it("기도: 아군 체력 회복과 상태이상 해제, 자신에게도 쓸 수 있다", () => {
    const b = edit(
      start([{ ...elke, job: "priest" }, ...party.slice(0, 2)], 1, [dummy("e0")]),
      (x) => {
        const me = unitById(x, elke.id)!;
        me.hp = 10;
        me.statuses.push(
          { kind: "bleed", turns: 3 },
          { kind: "poison", turns: 4 },
        );
      },
    );
    const next = act(b, { type: "skill", target: elke.id });
    // 기도 직후 다음 용병 차례로 넘어간다. 엘케 체력은 10 + 8
    expect(unitById(next, elke.id)!.hp).toBe(18);
    expect(unitById(next, elke.id)!.statuses).toEqual([]);
    const text = describeEvent(next.log.find((e) => e.type === "skill")!, next);
    expect(text).toBe("엘케가 자신에게 기도를 썼다.");
  });

  it("화살비: 모든 적이 피해를 입는다", () => {
    let b = start(withJob("archer"), 1, [
      dummy("e0", 999),
      dummy("e1", 999),
      dummy("e2", 999),
    ]);
    b = act(b, { type: "skill" });
    for (const id of ["e0", "e1", "e2"])
      expect(unitById(b, id)!.hp).toBeLessThan(999);
  });

  it("내려찍기: 반동을 받지만 반동으로 쓰러지지는 않는다", () => {
    const b = edit(
      start(withJob("greatsword"), 1, [dummy("e0", 999)]),
      (x) => (unitById(x, varn.id)!.hp = 2),
    );
    const next = act(b, { type: "skill", target: "e0" });
    expect(next.log).toContainEqual({
      type: "recoil",
      target: varn.id,
      damage: 1,
      skill: "cleave",
    });
    expect(unitById(next, varn.id)!.hp).toBeGreaterThanOrEqual(1);
  });

  it("독안개: 모든 적이 중독된다", () => {
    const b = act(
      start(withJob("monk"), 1, [dummy("e0", 999), dummy("e1", 999)]),
      { type: "skill" },
    );
    for (const id of ["e0", "e1"]) {
      expect(b.log).toContainEqual({
        type: "status",
        target: id,
        kind: "poison",
      });
    }
  });
});

function hasBleed(b: Battle, id: string): boolean {
  return b.log.some(
    (e) => e.type === "status" && e.target === id && e.kind === "bleed",
  );
}

describe("전투 문장", () => {
  it("받침에 맞게 조사를 붙인다", () => {
    expect(josa("바른", "이", "가")).toBe("바른이");
    expect(josa("카스", "이", "가")).toBe("카스가");
    expect(josa("잿빛 쥐떼 A", "이", "가")).toBe("잿빛 쥐떼 A가");
  });

  it("이벤트를 문장으로 바꾼다", () => {
    const b = start(party, 1, [dummy("e0")]);
    expect(
      describeEvent(
        { type: "attack", actor: varn.id, target: "e0", damage: 7, crit: true },
        b,
      ),
    ).toBe("바른이 허수아비를 공격했다. 7 피해 (치명타!)");
    expect(
      describeEvent(
        { type: "tick", target: kass.id, kind: "bleed", damage: 3 },
        b,
      ),
    ).toBe("카스가 출혈로 3 피해를 입었다.");
    expect(
      describeEvent(
        { type: "tick", target: kass.id, kind: "poison", damage: 2 },
        b,
      ),
    ).toBe("카스가 중독으로 2 피해를 입었다.");
  });
});

describe("반동·실패·보호막 (시험용 스킬)", () => {
  const first = (job: string): Merc[] => [
    { ...varn, job },
    { ...kass, job: "assassin" },
    { ...elke, job: "priest" },
  ];

  it("불꽃 창: 2.5배 피해를 주고 자기 체력 4를 태운다", () => {
    let b = start(first("mage"), 1, [dummy("e0", 999)]);
    expect(unitById(b, varn.id)!.skills[0]).toBe("firelance");
    const hp = unitById(b, varn.id)!.hp;
    b = act(b, { type: "skill", target: "e0" });
    const hit = b.log.find((e) => e.type === "attack" && e.actor === varn.id);
    expect(hit && hit.type === "attack" && hit.damage).toBeGreaterThanOrEqual(
      Math.round(3 * 2.5),
    );
    expect(b.log).toContainEqual({
      type: "recoil",
      target: varn.id,
      damage: 4,
      skill: "firelance",
    });
    expect(unitById(b, varn.id)!.hp).toBeLessThanOrEqual(hp - 4);
  });

  it("정령의 가호: 대개 보호막 6을 주고, 가끔(약 20%) 정령이 답하지 않는다", () => {
    let shields = 0;
    let fizzles = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const b = act(start(first("minstrel"), seed, [dummy("e0", 999)]), {
        type: "skill",
        target: kass.id,
      });
      if (b.log.some((e) => e.type === "shield")) shields++;
      if (b.log.some((e) => e.type === "fizzle")) fizzles++;
      if (b.log.some((e) => e.type === "shield"))
        expect(unitById(b, kass.id)!.shield).toBe(6);
    }
    expect(shields + fizzles).toBe(500);
    expect(fizzles / 500).toBeGreaterThan(0.12);
    expect(fizzles / 500).toBeLessThan(0.28);
  });

  it("보호막이 공격 피해를 먼저 받아 낸다", () => {
    let b = start(party, 1, [dummy("e0", 999, { attack: [4, 4] })]);
    b = edit(b, (c) =>
      c.units.forEach((u) => u.side === "merc" && (u.shield = 6)),
    );
    for (let i = 0; i < 6 && !b.outcome; i++)
      b = act(b, { type: "attack", target: "e0" });
    const hits = b.log.filter((e) => e.type === "attack" && e.actor === "e0");
    const first = hits[0];
    expect(first.type === "attack" && first.absorbed).toBeGreaterThan(0);
    // 막힌 양 + 실제 피해 = 원래 피해 (치명타가 아니면 4)
    if (first.type === "attack" && !first.crit)
      expect(first.damage + (first.absorbed ?? 0)).toBe(4);
  });

  it("마법사·바드가 섞인 파티도 전투 한 번은 쉽게 이긴다", () => {
    // 탱커·딜러 + 마법사 + 바드 (보조 직업이 하나인 흔한 조합)
    const mixed: Merc[] = [
      { ...varn, job: "knight" },
      { ...kass, job: "greatsword" },
      { ...elke, job: "mage" },
      { ...varn, id: "m4", job: "minstrel" },
    ];
    let wins = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      let b = startBattle(mixed, seed);
      for (let n = 0; n < 500 && !b.outcome; n++) {
        const actor = currentActor(b)!;
        const hurt = living(b, "merc").find((u) => u.hp < u.maxHp / 2);
        if (hurt && !b.guideUsed && b.supplies.potion > 0)
          b = act(b, { type: "guide", item: "potion", target: hurt.id });
        b = act(b, simplePolicy(b, actor));
      }
      if (b.outcome === "victory") wins++;
    }
    console.info(
      `[밸런스] 마법사·정령사 파티 승률 ${((wins / 1000) * 100).toFixed(1)}%`,
    );
    expect(wins / 1000).toBeGreaterThan(0.9);
  });
});

describe("패시브 (2026-11-22 개편)", () => {
  /** 직업·패시브를 지정한 바른 */
  const P = (job: string, passives: string[], id = varn.id): Merc => ({ ...varn, id, job, passives });
  const factors = (b: Battle, from: string, to: string, opts: Parameters<typeof strikeFactors>[3] = {}) => strikeFactors(b, unitById(b, from)!, unitById(b, to)!, opts);

  it("오러률: 실제 감소 = 대상 감소 × (1 - 오러) × (1 - 방어 무시). 100 피해, 오러 80%, 감소 30% → 94", () => {
    const f = { bonus: 0, multiplier: 1, critChance: 0, critDamage: 0, evadeChance: 0, crack: 0, guard: false, reduce: 0.3, pierce: 0, aura: 0.8, taken: 1 };
    expect(strikeAmount(100, f, false)).toBe(94);
    // 방어 무시와 함께: 0.3 × 0.2 × 0.5 = 3%
    expect(strikeAmount(100, { ...f, pierce: 0.5 }, false)).toBe(97);
    // 오러 숙련(인간 기사 금 A): 오러률 +20%
    const b = start([P("knight", ["knight_human_gA"])], 1, [dummy("e0", 999, { defense: 15 })]);
    expect(factors(b, varn.id, "e0", { aura: 0.3 }).aura).toBeCloseTo(0.5);
  });

  it("직업 패시브: 단련된 몸(받는 피해 -5%), 거리 감각(첫 라운드 치명 +10%), 무게 실린 일격(대기 2 이상 +10%), 급소 감각(50% 이하 적 치명 +10%)", () => {
    const monk = start([P("monk", ["monk_job"])], 1, [dummy("e0", 999)]);
    expect(factors(monk, "e0", varn.id).taken).toBeCloseTo(0.95);
    const archer = start([P("archer", ["archer_job"])], 1, [dummy("e0", 999)]);
    const plain = start([P("archer", [])], 1, [dummy("e0", 999)]);
    expect(factors(archer, varn.id, "e0").critChance - factors(plain, varn.id, "e0").critChance).toBeCloseTo(0.1);
    expect(factors({ ...archer, round: 2 }, varn.id, "e0").critChance).toBeCloseTo(factors(plain, varn.id, "e0").critChance);
    const gs = start([P("greatsword", ["greatsword_job"])], 1, [dummy("e0", 999)]);
    expect(factors(gs, varn.id, "e0", { skillWait: 2 }).multiplier).toBeCloseTo(1.1);
    expect(factors(gs, varn.id, "e0", { skillWait: 1 }).multiplier).toBeCloseTo(1);
    const as = fix2(start([P("assassin", ["assassin_job"])], 1, [dummy("e0", 100)]), "e0", { hp: 40 });
    expect(factors(as, varn.id, "e0").critChance - factors(start([P("assassin", [])], 1, [dummy("e0", 100)]), varn.id, "e0").critChance).toBeCloseTo(0.1);
  });

  it("기사도: 바로 옆 아군이 받는 피해 -5%", () => {
    const b = start([P("priest", [], "a"), P("knight", ["knight_job"], "k"), P("mage", [], "c")], 1, [dummy("e0", 999)]);
    expect(factors(b, "e0", "a").taken).toBeCloseTo(0.95);
    expect(factors(b, "e0", "k").taken).toBeCloseTo(1);
  });

  it("치명·회피 %는 곡선 없이 그대로, 최대 체력 %, 전투 시작 보호막", () => {
    const u = mercUnit(P("knight", ["knight_elf_sB"]));
    expect(u.critBonus).toBeCloseTo(0.1);
    const tough = mercUnit({ ...P("guardian", ["guardian_barbarian_sA"]), level: "silver" });
    expect(tough.maxHp).toBe(Math.round(38 * 1.1));
    const b = start([P("knight", ["knight_dwarf_sA"])], 1, [dummy("e0", 999)]);
    const v = unitById(b, varn.id)!;
    expect(v.shield).toBe(Math.round(v.maxHp * 0.1));
  });

  it("기사의 의지: 체력이 처음 30% 아래로 떨어지면 2턴 받는 피해 -10% (한 번)", () => {
    let b = edit(start([P("knight", ["knight_human_sA"])], 1, [dummy("e0", 999, { attack: [5, 5] })]), (c) => {
      unitById(c, varn.id)!.hp = 12;
    });
    b = act(b, { type: "wait" });
    expect(statusValue(unitById(b, varn.id)!, "toughen")).toBeCloseTo(0.1);
    expect(unitById(b, varn.id)!.fx?.lastStandDone).toBe(true);
  });

  it("피에 굶주림: 적을 쓰러뜨리면 최대 체력 5% 회복", () => {
    let b = edit(start([P("greatsword", ["greatsword_beastfolk_sA"])], 1, [dummy("e0", 1), dummy("e1", 999)]), (c) => {
      unitById(c, varn.id)!.hp = 10;
    });
    b = act(b, { type: "attack", target: "e0" });
    const v = unitById(b, varn.id)!;
    expect(b.log.some((e) => e.type === "heal" && e.target === varn.id)).toBe(true);
    expect(v.hp).toBeGreaterThan(10);
  });

  it("불굴의 깃발: 가디언이 서 있는 동안 아군 기절 저항 +10%", () => {
    const b = start([P("guardian", ["guardian_human_sA"], "g"), P("mage", [], "m")], 1, [dummy("e0", 999)]);
    expect(resistOf(unitById(b, "m")!, "stun")).toBeCloseTo(0.1);
  });

  it("노래: 울림(직업)·대륙의 노래(효과 +10%, 지속 +1턴), 격려(받은 아군 기절 저항 +10%)", () => {
    const song: Skill = { id: "courage", name: "용기의 노래", cooldown: 1, target: "none", description: "", effects: [{ kind: "applyStatus", status: "evadeUp", value: 0.1, turns: 2, who: "allies" }] };
    const cast = (passives: string[]) => {
      let b = edit(start([P("minstrel", passives)], 1, [dummy("e0", 999)]), (c) => {
        const v = unitById(c, varn.id)!;
        v.skills = ["courage"];
        v.book = { courage: song };
      });
      b = act(b, { type: "skill", skill: "courage" });
      return unitById(b, varn.id)!;
    };
    const plain = cast([]);
    const strong = cast(["minstrel_job", "minstrel_human_gA", "minstrel_human_sB"]);
    expect(statusValue(strong, "evadeUp")).toBeCloseTo(Math.round(0.1 * 1.15 * 100) / 100);
    expect(strong.statuses.find((x) => x.kind === "evadeUp")!.turns).toBe(plain.statuses.find((x) => x.kind === "evadeUp")!.turns + 1);
    expect(statusValue(strong, "stunResUp")).toBeCloseTo(0.1);
  });

  it("여운: 노래 강화가 끝날 때 그 노래를 받은 아군이 최대 체력 5% 회복 (부를 때가 아니라)", () => {
    const song: Skill = { id: "courage", name: "용기의 노래", cooldown: 9, target: "none", description: "", effects: [{ kind: "applyStatus", status: "attackUp", value: 2, turns: 1, who: "allies" }] };
    let b = edit(start([P("minstrel", ["minstrel_elf_sB"])], 1, [dummy("e0", 999)]), (c) => {
      const v = unitById(c, varn.id)!;
      v.skills = ["courage"];
      v.book = { courage: song };
      v.hp = 10;
    });
    b = act(b, { type: "skill", skill: "courage" });
    const healsAtCast = b.log.filter((e) => e.type === "heal" && e.target === varn.id).length;
    expect(unitById(b, varn.id)!.statuses.find((x) => x.kind === "attackUp")?.endHeal).toBe(0.05);
    for (let i = 0; i < 4 && hasStatus(unitById(b, varn.id)!, "attackUp"); i++) b = act(b, { type: "wait" });
    expect(hasStatus(unitById(b, varn.id)!, "attackUp")).toBe(false);
    expect(b.log.filter((e) => e.type === "heal" && e.target === varn.id).length).toBe(healsAtCast + 1);
  });

  it("상대 조건 피해: 독의 왕(중독된 적 +15%), 거인 사냥(정예·보스 +20%)", () => {
    const b = edit(start([P("assassin", ["assassin_human_gB"])], 1, [dummy("e0", 999)]), (c) => unitById(c, "e0")!.statuses.push({ kind: "poison", turns: 1, value: 2 }));
    expect(factors(b, varn.id, "e0").multiplier).toBeCloseTo(1.15);
    const g = start([P("greatsword", ["greatsword_barbarian_gA"])], 1, [dummy("e0", 999, { rank: "dungeonBoss" })]);
    expect(factors(g, varn.id, "e0").multiplier).toBeCloseTo(1.2);
  });
});

describe("방어력과 속도", () => {
  it("방어 곡선만큼 받는 피해가 % 줄고 (70% × p / (p + 15)), 최소 1은 들어간다", () => {
    const hitOn = (defense: number, attack: number) => {
      for (let seed = 1; seed < 100; seed++) {
        const units = [
          { ...mercUnit({ ...varn, job: "knight" }), defense, speed: 100 },
          dummy("e0", 999, { attack: [attack, attack] }),
        ];
        const b = act(startBattleWithUnits(units, seed), {
          type: "attack",
          target: "e0",
        });
        const hit = b.log.find((e) => e.type === "attack" && e.actor === "e0");
        if (hit?.type === "attack" && !hit.crit) return hit.damage;
      }
    };
    expect(hitOn(0, 20)).toBe(20);
    expect(hitOn(2, 20)).toBe(18);
    expect(hitOn(15, 20)).toBe(13);
    expect(hitOn(1000, 20)).toBe(6);
    expect(hitOn(1000, 1)).toBe(1);
  });

  it("직업과 적의 능력치가 유닛에 실린다", () => {
    const b = startBattle(
      [
        { ...varn, job: "knight" },
        { ...kass, job: "assassin" },
      ],
      1,
    );
    expect(unitById(b, varn.id)).toMatchObject({ defense: 2, speed: 4 });
    expect(unitById(b, kass.id)).toMatchObject({ defense: 0, speed: 8 });
    for (const enemy of living(b, "enemy"))
      expect(typeof enemy.speed).toBe("number");
  });

  it("빠른 쪽이 먼저 행동하고, 느린 적이 빠른 용병보다 먼저 행동하는 일은 없다", () => {
    for (let seed = 0; seed < 200; seed++) {
      const units = [
        { ...mercUnit({ ...kass, job: "assassin" }), speed: 10 },
        { ...dummy("e0", 999), speed: 0 },
        { ...dummy("e1", 999), speed: 20 },
      ];
      const b = startBattleWithUnits(units, seed);
      expect(b.order).toEqual(["e1", kass.id, "e0"]);
    }
  });

  it("속도가 비슷하면 라운드마다 순서가 바뀌기도 한다", () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const units = [
        { ...mercUnit({ ...kass, job: "assassin" }), speed: 5 },
        { ...dummy("e0", 999), speed: 5 },
      ];
      orders.add(startBattleWithUnits(units, seed).order.join(","));
    }
    expect(orders.size).toBe(2);
  });
});

describe("빈 전투", () => {
  it("살아 있는 용병 없이 시작하면 바로 패배로 끝난다", () => {
    const b = startBattleWithUnits([dummy("e0", 10)], 1);
    expect(b.outcome).toBe("defeat");
  });
});

describe("미리보기", () => {
  type AttackEvent = Extract<BattleEvent, { type: "attack" }>;
  const ALL_PASSIVES = PASSIVES.map((p) => p.id);

  it("실제 피해는 언제나 미리보기 범위 안이다 (무작위 파티·패시브·조각 스킬 수천 번)", () => {
    let checked = 0;
    for (let seed = 0; seed < 300; seed++) {
      const r = createRng(seed);
      const party: Merc[] = [0, 1, 2, 3].map((i) => {
        const job = JOB_IDS[Math.floor(r.next() * JOB_IDS.length)];
        const races = RACE_IDS.filter((race) => canBe(race, job));
        const race = races[Math.floor(r.next() * races.length)];
        // 은 등급 규칙으로 무작위 조각 스킬 (부 조각 최대 2개), 부 조각 레벨도 무작위
        const skills = [...rollStartSkills({ job, race, level: "silver" }, r.next), ...rollStartSkills({ job, race, level: "silver" }, r.next)]
          .filter((b, k, all) => all.findIndex((x) => skillKey(x) === skillKey(b)) === k)
          .slice(0, 4);
        const subLevels = Object.fromEntries(skills.flatMap((b) => b.subs).map((id) => [id, 1 + Math.floor(r.next() * 3)]));
        return {
          ...varn,
          id: `m${i}`,
          job,
          race,
          skills,
          subLevels,
          // 성장 스탯도 무작위로 (미리보기가 스탯까지 맞게 계산하는지)
          stats: {
            str: Math.floor(r.next() * 4),
            mag: Math.floor(r.next() * 4),
            faith: Math.floor(r.next() * 4),
            crit: Math.floor(r.next() * 3),
            defense: Math.floor(r.next() * 3),
          },
          passives: [ALL_PASSIVES[Math.floor(r.next() * ALL_PASSIVES.length)]],
        };
      });
      let b = startBattle(party, seed);
      for (let step = 0; step < 200 && !b.outcome; step++) {
        const actor = currentActor(b)!;
        const enemies = living(b, "enemy");
        const pick = enemies[Math.floor(r.next() * enemies.length)];
        const ready = actor.skills.filter((id) => !(actor.cooldowns[id] > 0));
        const skill = ready.length
          ? skillDef(actor, ready[Math.floor(r.next() * ready.length)])!
          : null;
        let action: BattleAction = { type: "attack", target: pick.id };
        if (skill && r.next() < 0.6) {
          const ally = living(b, "merc")[0];
          action =
            skill.target === "none"
              ? { type: "skill", skill: skill.id }
              : {
                  type: "skill",
                  skill: skill.id,
                  target: skill.target === "enemy" ? pick.id : ally.id,
                };
        }
        const preview = previewAction(b, action);
        expect(preview, JSON.stringify(action)).not.toBeNull();
        const before = b.log.length;
        b = act(b, action);
        // 이 행동에서 나온 이 용병의 타격 (반격 등 나중 일은 빼고, 미리보기한 대상 수만큼).
        // 행동 중에 확률로 걸린 균열(장인의 눈썰미)은 뒤 타격의 피해를 바꾸므로 거기서 멈춘다 (미리보기가 알 수 없는 운)
        const hits: AttackEvent[] = [];
        for (const e of b.log.slice(before)) {
          if (e.type === "status" && e.kind === "crack") break;
          if (e.type === "attack" && e.actor === actor.id) hits.push(e);
        }
        // 타격을 미리보기 항목과 순서대로 짝짓는다 (앞 대상이 쓰러지면 남은 타격은 건너뛴다)
        let at = 0;
        hits.forEach((hit) => {
          while (at < preview!.damage.length && preview!.damage[at].target !== hit.target) at++;
          if (at >= preview!.damage.length) return;
          const p = preview!.damage[at++];
          const total = hit.damage + (hit.absorbed ?? 0);
          const [lo, hi] = hit.crit ? [p.critMin, p.critMax] : [p.min, p.max];
          expect(
            total,
            `${actor.id} ${JSON.stringify(action)} seed ${seed}`,
          ).toBeGreaterThanOrEqual(lo);
          expect(total, `${actor.id} ${JSON.stringify(action)} seed ${seed}`).toBeLessThanOrEqual(hi);
          checked++;
        });
      }
    }
    expect(checked).toBeGreaterThan(3000);
  });

  it("처치 판정, 자기 소모, 실패 확률, 회복과 보호막을 보여 준다", () => {
    const b = start([{ ...varn, job: "mage" }], 1, [
      dummy("e0", 3),
      dummy("e1", 999),
    ]);
    const fire = previewAction(b, { type: "skill", target: "e0" })!;
    expect(fire.damage[0].kill).toBe("sure");
    expect(fire.selfCost).toBe(4);
    expect(
      previewAction(b, { type: "skill", target: "e1" })!.damage[0].kill,
    ).toBe("no");

    const w = start([{ ...varn, job: "minstrel" }], 1, [dummy("e0", 999)]);
    const ward = previewAction(w, { type: "skill", target: varn.id })!;
    expect(ward).toMatchObject({
      failChance: 0.2,
      shield: { target: varn.id, amount: 6 },
    });

    const n = fix2(
      start([{ ...varn, job: "priest" }], 1, [dummy("e0", 999)]),
      varn.id,
      { hp: 10 },
    );
    expect(previewAction(n, { type: "skill", target: varn.id })!.heal).toEqual({
      target: varn.id,
      amount: 8,
    });
    expect(previewAction(n, { type: "bandage" })).toBeNull();
  });

  it("전체 공격은 적마다 따로 보여 주고, 할 수 없는 행동은 null", () => {
    const b = start([{ ...varn, job: "archer" }], 1, [
      dummy("e0", 999),
      dummy("e1", 999),
      dummy("e2", 999),
    ]);
    expect(
      previewAction(b, { type: "skill" })!.damage.map((d) => d.target),
    ).toEqual(["e0", "e1", "e2"]);
    expect(previewAction(b, { type: "attack", target: varn.id })).toBeNull();
  });

  it("스킬 설명은 효과 조각에서 만들어진다", () => {
    expect(TEST_SKILLS.firelance.description).toContain("2.5배");
    expect(TEST_SKILLS.firelance.description).toContain("자기 체력 4");
    expect(TEST_SKILLS.ward.description).toContain("20% 확률로 실패");
    expect(TEST_SKILLS.volley.description).toContain("모든 적에게 3~5 피해");
  });
});

function fix2(b: Battle, id: string, patch: Partial<Unit>): Battle {
  return edit(b, (c) => Object.assign(unitById(c, id)!, patch));
}

describe("장착 슬롯", () => {
  const multi: TMerc = {
    ...varn,
    job: "knight",
    kit: ["cleave", "pray", "volley", "guard", "power"],
  };

  it("장착하지 않은 스킬은 쓸 수 없다", () => {
    const b = start([multi], 1, [dummy("e0", 999)]);
    expect(unitById(b, varn.id)!.skills).toEqual(["cleave", "pray", "volley", "guard"]);
    // 조각 스킬도 4칸까지만 싣는다
    const five = ["knight_slash", "knight_bulwark", "knight_duel", "knight_charge", "rc_human_cut"].map((main) => ({ main, subs: [] }));
    expect(mercUnit({ ...varn, job: "knight", skills: five }).skills).toHaveLength(4);
    expect(validate(b, { type: "skill", skill: "power", target: "e0" })).toBe(
      "장착하지 않은 스킬",
    );
    expect(
      validate(b, { type: "skill", skill: "firelance", target: "e0" }),
    ).toBe("장착하지 않은 스킬");
  });

  it("스킬마다 대기 시간이 따로 돈다", () => {
    let b = start([multi], 1, [dummy("e0", 999)]);
    b = act(b, { type: "skill", skill: "cleave", target: "e0" });
    expect(
      validate(b, { type: "skill", skill: "cleave", target: "e0" }),
    ).toMatch(/턴 뒤에 쓸 수 있다/);
    expect(validate(b, { type: "skill", skill: "volley" })).toBeNull();
    b = act(b, { type: "skill", skill: "volley" });
    expect(
      b.log
        .filter((e) => e.type === "skill")
        .map((e) => (e.type === "skill" ? e.skill : "")),
    ).toEqual(["cleave", "volley"]);
  });

  it("미리보기도 고른 스킬로 계산한다", () => {
    const b = start([multi], 1, [dummy("e0", 999), dummy("e1", 999)]);
    expect(
      previewAction(b, { type: "skill", skill: "volley" })!.damage,
    ).toHaveLength(2);
    expect(
      previewAction(b, { type: "skill", skill: "pray", target: varn.id })!.heal,
    ).not.toBeNull();
  });

  it("옆 아군은 파티 순서의 바로 앞뒤 사람 (진형이 생기면 바뀐다)", () => {
    const b = start([varn, kass, elke], 1, [dummy("e0", 999)]);
    expect(neighbors(b, unitById(b, kass.id)!).map((u) => u.id)).toEqual([
      varn.id,
      elke.id,
    ]);
    expect(neighbors(b, unitById(b, varn.id)!).map((u) => u.id)).toEqual([
      kass.id,
    ]);
  });
});

describe("호감 단계", () => {
  const withBond = (bond: Unit["bond"], extra: Partial<Unit> = {}) =>
    startBattleWithUnits(
      [
        {
          ...mercUnit(varn),
          defense: 0,
          speed: 100,
          attack: [6, 6] as const,
          bond,
          ...extra,
        },
        dummy("e0", 999),
      ],
      1,
    );

  it("신뢰: 공격 +1 (미리보기에도 반영)", () => {
    expect(
      previewAction(withBond("trusted"), { type: "attack", target: "e0" })!
        .damage[0].min,
    ).toBe(6);
    expect(
      previewAction(withBond("neutral"), { type: "attack", target: "e0" })!
        .damage[0].min,
    ).toBe(5);
  });

  it("호의 이상: 건네받은 물약 +25%", () => {
    const potion = (bond: Unit["bond"], passives: string[] = []) => {
      const b = act(withBond(bond, { hp: 1, passives }), {
        type: "guide",
        item: "potion",
        target: varn.id,
      });
      const e = b.log.find((x) => x.type === "heal");
      return e?.type === "heal" ? e.amount : 0;
    };
    expect(potion("neutral")).toBe(12);
    expect(potion("warm")).toBe(15);
    expect(potion("trusted")).toBe(15);
  });

  it("적대: 가끔(약 10%) 명령을 무시하고 아무 적이나 공격한다", () => {
    let disobeyed = 0;
    for (let seed = 0; seed < 600; seed++) {
      const units = [
        {
          ...tUnit({ ...varn, job: "priest" }),
          defense: 0,
          speed: 100,
          bond: "hostile" as const,
        },
        dummy("e0", 999),
        dummy("e1", 999),
      ];
      const c = act(startBattleWithUnits(units, seed), {
        type: "skill",
        target: varn.id,
      });
      if (c.log.some((e) => e.type === "disobey")) {
        disobeyed++;
        expect(
          c.log.some((e) => e.type === "attack" && e.actor === varn.id),
        ).toBe(true);
        expect(c.log.some((e) => e.type === "skill")).toBe(false);
      }
    }
    expect(disobeyed / 600).toBeGreaterThan(0.06);
    expect(disobeyed / 600).toBeLessThan(0.14);
  });

  it("길안내자에게 받은 물자를 용병별로 센다", () => {
    let b = withBond("neutral", { hp: 1 });
    b = act(b, { type: "guide", item: "potion", target: varn.id });
    expect(giftsReceived(b)).toEqual({ [varn.id]: 1 });
  });
});

describe("자신에게 쓰는 스킬", () => {
  it("결의: 자신에게 각성, 연막: 자신에게 보호막, 미리보기도 자신을 가리킨다", () => {
    const merc: TMerc = { ...varn, job: "assassin", kit: ["resolve", "smoke"] };
    let b = start([merc], 1, [dummy("e0", 999)]);
    expect(previewAction(b, { type: "skill", skill: "resolve" })!.applies).toEqual([{ target: varn.id, kind: "awaken", chance: 1 }]);
    b = act(b, { type: "skill", skill: "resolve" });
    expect(hasStatus(unitById(b, varn.id)!, "awaken")).toBe(true);
    b = act(b, { type: "skill", skill: "smoke" });
    expect(b.log).toContainEqual({
      type: "shield",
      target: varn.id,
      amount: 5,
      by: varn.id,
    });
  });
});

describe("효과 규칙 (시험용 스킬)", () => {
  const go = (merc: TMerc, enemies: Unit[], seed = 1) => start([merc], seed, enemies);

  it("연타: 같은 대상을 두 번, 미리보기도 두 번", () => {
    const merc: TMerc = { ...varn, job: "assassin", kit: ["twin"] };
    const b = act(go(merc, [dummy("e0", 999)]), { type: "skill", skill: "twin", target: "e0" });
    expect(b.log.filter((e) => e.type === "attack" && e.actor === varn.id)).toHaveLength(2);
    expect(previewAction(go(merc, [dummy("e0", 999)]), { type: "skill", skill: "twin", target: "e0" })!.damage).toHaveLength(2);
  });

  it("처치하면 대기 초기화", () => {
    let b = go({ ...varn, job: "greatsword", kit: ["hunt"] }, [dummy("e0", 1), dummy("e1", 999)]);
    b = act(b, { type: "skill", skill: "hunt", target: "e0" });
    expect(b.log.some((e) => e.type === "refresh")).toBe(true);
    expect(validate(b, { type: "skill", skill: "hunt", target: "e1" })).toBeNull();
  });

  it("옆 아군 지원: 아군 스킬은 대상의 옆 아군도 절반 받는다", () => {
    let b = start([{ ...elke, job: "priest", kit: ["mend_all"] }, varn, kass], 1, [dummy("e0", 999)]);
    b = edit(b, (c) => c.units.forEach((u) => u.side === "merc" && (u.hp = 5)));
    b = act(b, { type: "skill", skill: "mend_all", target: varn.id }); // 바른의 옆: 엘케, 카스
    const heals = b.log.filter((e) => e.type === "heal" && e.by === elke.id);
    expect(heals.map((e) => (e.type === "heal" ? [e.target, e.amount] : null))).toEqual([
      [varn.id, 8],
      [elke.id, 4],
      [kass.id, 4],
    ]);
  });

  it("버팀: 방어 +2 / 선제: 다음 라운드에 맨 먼저", () => {
    let b = start([{ ...varn, job: "archer", kit: ["brace"] }], 1, [dummy("e0", 999, { attack: [20, 20] })]);
    b = act(b, { type: "skill", skill: "brace" });
    const hit = b.log.find((e) => e.type === "attack" && e.actor === "e0");
    if (hit?.type === "attack" && !hit.crit) expect(hit.damage).toBe(taken(20, 2));

    let h = start([varn, { ...kass, job: "archer", kit: ["haste"] }], 1, [dummy("e0", 999)]);
    h = act(h, { type: "attack", target: "e0" });
    h = act(h, { type: "skill", skill: "haste" });
    expect(h.order[0]).toBe(kass.id);
  });
});

describe("조각 스킬 (엔진 1단계)", () => {
  const build = (main: string, ...subs: string[]) => ({ main, subs });
  /** 조각 스킬 하나를 든 용병 (방어 0, 맨 먼저 행동) */
  const one = (m: Partial<Merc>, enemies: Unit[], seed = 1) => start([{ ...varn, ...m }], seed, enemies);

  it("두 스탯 혼합 피해: 힘 1.0배 + 마법 0.3배 (스탯도 배율만큼)", () => {
    const merc = { job: "knight", race: "elf", skills: [build("knight_elf_main")], stats: { str: 4, mag: 10 } };
    const b = one(merc, [dummy("e0", 999)]);
    const id = unitById(b, varn.id)!.skills[0];
    const p = previewAction(b, { type: "skill", skill: id, target: "e0" })!.damage[0];
    // 공격력 6~9 × 1.3 = 8~12, + 힘 4 × 1 + 마법 10 × 0.3 = +7
    expect([p.min, p.max]).toEqual([8 + 7, 12 + 7]);
  });

  it("오러률: 오러 블레이드(오러 30%) + 오러 Lv3(+20%) = 50%, 기본 공격은 방어를 다 받는다", () => {
    const merc = { job: "knight", race: "human", skills: [build("knight_human_main", "knight_human_sub")], subLevels: { knight_human_sub: 3 } };
    const armored = dummy("e0", 999, { defense: 10 });
    const b = one(merc, [armored]);
    const id = unitById(b, varn.id)!.skills[0];
    expect(skillDef(unitById(b, varn.id)!, id)!.effects[0]).toMatchObject({ aura: 0.5 });
    const p = previewAction(b, { type: "skill", skill: id, target: "e0" })!.damage[0];
    // (6~9) × (1 - 받는 피해 감소(방어 10) × (1 - 0.5)), 고정 피해는 없다
    const red = curveBonus("defense", 10);
    expect([p.min, p.max]).toEqual([Math.round(6 * (1 - red * 0.5)), Math.round(9 * (1 - red * 0.5))]);
    const plain = previewAction(b, { type: "attack", target: "e0" })!.damage[0];
    expect(plain.min).toBe(Math.round(5 * (1 - red)));
  });


  it("다회 타격: 연격을 낀 검격은 두 번 친다", () => {
    let b = one({ job: "knight", skills: [build("knight_slash", "knight_combo")] }, [dummy("e0", 999)]);
    const id = unitById(b, varn.id)!.skills[0];
    expect(previewAction(b, { type: "skill", skill: id, target: "e0" })!.damage).toHaveLength(2);
    b = act(b, { type: "skill", skill: id, target: "e0" });
    expect(b.log.filter((e) => e.type === "attack" && e.actor === varn.id)).toHaveLength(2);
  });

  it("대기: 대기 1이면 다음 자기 차례 한 번을 쉰다, 대기 0이면 매 차례", () => {
    let b = one({ job: "knight", skills: [build("knight_charge"), build("knight_slash")] }, [dummy("e0", 999)]);
    b = act(b, { type: "skill", skill: "knight_charge", target: "e0" });
    expect(validate(b, { type: "skill", skill: "knight_charge", target: "e0" })).toBe("1턴 뒤에 쓸 수 있다");
    expect(validate(b, { type: "skill", skill: "knight_slash", target: "e0" })).toBeNull();
    b = act(b, { type: "skill", skill: "knight_slash", target: "e0" });
    expect(validate(b, { type: "skill", skill: "knight_slash", target: "e0" })).toBeNull();
    expect(validate(b, { type: "skill", skill: "knight_charge", target: "e0" })).toBeNull();
  });

  it("기절: 걸리면 다음 차례를 쉬고, 걸릴 때마다 기절 저항이 40%씩 쌓인다", () => {
    let b = one({ job: "monk", skills: [build("monk_upper")] }, [dummy("e0", 999, { speed: 50 })]);
    const target = () => unitById(b, "e0")!;
    expect(resistOf(target(), "stun")).toBeCloseTo(RESIST.stunBase.normal);
    // 어퍼컷: 기절 100% (저항 적용) → 첫 번은 90%
    expect(previewAction(b, { type: "skill", skill: "monk_upper", target: "e0" })!.applies[0].chance).toBeCloseTo(1 - RESIST.stunBase.normal);
    let stunned = 0;
    for (let seed = 0; seed < 200; seed++) {
      let c = edit(b, (x) => (x.rng = seed));
      c = act(c, { type: "skill", skill: "monk_upper", target: "e0" });
      if (c.log.some((e) => e.type === "status" && e.kind === "stun")) {
        stunned++;
        expect(unitById(c, "e0")!.fx?.stunCount).toBe(1);
        expect(resistOf(unitById(c, "e0")!, "stun")).toBeCloseTo(RESIST.stunBase.normal + RESIST.stunStep);
        // 허수아비의 다음 차례는 기절로 넘어간다
        c = act(c, { type: "attack", target: "e0" });
        expect(c.log.some((e) => e.type === "stunned" && e.target === "e0")).toBe(true);
      }
    }
    expect(stunned / 200).toBeGreaterThan(0.8);
    // 세 번 걸리면 (0.1 + 1.2) 더는 걸리지 않는다
    b = edit(b, (x) => (unitById(x, "e0")!.fx = { stunCount: 3 }));
    expect(previewAction(b, { type: "skill", skill: "monk_upper", target: "e0" })!.applies[0].chance).toBe(0);
  });

  it("흔들림은 기절 저항을 깎고, 확정 기절은 저항을 무시한다", () => {
    const u = { ...dummy("e0"), rank: "dungeonBoss" as const, statuses: [{ kind: "shaken" as const, turns: 2, value: 0.3 }] };
    expect(resistOf(u, "stun")).toBeCloseTo(RESIST.stunBase.dungeonBoss - 0.3);
    let b = one({ job: "monk", ultimate: "ult_monk" }, [dummy("e0", 999, { rank: "dungeonBoss", fx: { stunCount: 5 } })]);
    b = act(b, { type: "skill", skill: "ult_monk", target: "e0" });
    expect(b.log).toContainEqual({ type: "status", target: "e0", kind: "stun" });
    // 확정 기절은 저항을 쌓지 않는다
    expect(unitById(b, "e0")!.fx?.stunCount).toBe(5);
  });

  it("디버프: 둔화는 속도, 방어 감소는 방어, 회피 감소는 회피를 깎는다", () => {
    let b = one({ job: "monk", race: "dwarf", skills: [build("monk_dwarf_main")] }, [dummy("e0", 999, { speed: 5 })]);
    b = act(b, { type: "skill", skill: "monk_dwarf_main", target: "e0" });
    expect(statusValue(unitById(b, "e0")!, "slow")).toBe(2);
    expect(speedOf(unitById(b, "e0")!)).toBe(3);

    let d = one({ job: "knight", race: "dwarf", skills: [build("knight_dwarf_main")] }, [dummy("e0", 999, { defense: 3 })]);
    const before = previewAction(d, { type: "attack", target: "e0" })!.damage[0].min;
    d = act(d, { type: "skill", skill: "knight_dwarf_main", target: "e0" });
    d = edit(d, (x) => (x.turn = x.order.indexOf(varn.id)));
    // 방어 3 → 1
    expect(before).toBe(taken(5, 3));
    expect(previewAction(d, { type: "attack", target: "e0" })!.damage[0].min).toBe(taken(5, 1));
  });

  it("자기 강화는 쓴 행동이 끝나도 남아 다음 행동까지 간다 (방벽 2턴 → 다음 두 번의 행동)", () => {
    let b = one({ job: "knight", skills: [build("knight_bulwark"), build("knight_slash")] }, [dummy("e0", 999, { attack: [8, 8] })]);
    b = act(b, { type: "skill", skill: "knight_bulwark" });
    const me = () => unitById(b, varn.id)!;
    expect(statusValue(me(), "armorUp")).toBe(3);
    b = act(b, { type: "attack", target: "e0" });
    expect(statusValue(me(), "armorUp")).toBe(3);
    b = act(b, { type: "attack", target: "e0" });
    expect(statusValue(me(), "armorUp")).toBe(0);
  });

  it("응축: 다음 공격 한 번의 위력이 오르고 사라진다", () => {
    let b = one({ job: "greatsword", skills: [build("gs_stance")] }, [dummy("e0", 999)]);
    const plain = previewAction(b, { type: "attack", target: "e0" })!.damage[0];
    b = act(b, { type: "skill", skill: "gs_stance" });
    const charged = previewAction(b, { type: "attack", target: "e0" })!.damage[0];
    expect(charged.min).toBe(plain.min * 2);
    b = act(b, { type: "attack", target: "e0" });
    expect(hasStatus(unitById(b, varn.id)!, "charge")).toBe(false);
  });

  it("흡혈: 준 피해의 비율만큼 회복", () => {
    let b = one({ job: "greatsword", skills: [build("gs_strike", "gs_vamp")] }, [dummy("e0", 999)]);
    b = fix2(b, varn.id, { hp: 10 });
    const id = unitById(b, varn.id)!.skills[0];
    b = act(b, { type: "skill", skill: id, target: "e0" });
    const hit = b.log.find((e) => e.type === "attack" && e.actor === varn.id);
    const healed = b.log.find((e) => e.type === "heal" && e.target === varn.id);
    expect(hit?.type === "attack" && healed?.type === "heal" && healed.amount).toBe(Math.round((hit as { damage: number }).damage * 0.2));
  });

  it("출혈 부 조각(피해 2)과 출혈 취약: 저항이 음수면 더 잘 걸린다", () => {
    let b = one({ job: "assassin", skills: [build("as_throw", "as_bleed")] }, [dummy("e0", 999)]);
    const id = unitById(b, varn.id)!.skills[0];
    b = act(b, { type: "skill", skill: id, target: "e0" });
    expect(unitById(b, "e0")!.statuses.find((x) => x.kind === "bleed")).toMatchObject({ value: 2 });
    const vuln = { ...dummy("e1"), statuses: [{ kind: "bleedVuln" as const, turns: 2, value: 0.3 }] };
    expect(resistOf(vuln, "bleed")).toBeCloseTo(-0.3);
  });

  it("아군 전체 강화와 재생: 용기의 노래, 선조의 토템", () => {
    let b = start([{ ...elke, job: "minstrel", skills: [build("mn_courage")] }, varn, kass], 1, [dummy("e0", 999)]);
    b = act(b, { type: "skill", skill: "mn_courage" });
    for (const id of [elke.id, varn.id, kass.id]) expect(statusValue(unitById(b, id)!, "attackUp")).toBe(2);

    let t = start([{ ...elke, job: "priest", race: "barbarian", skills: [build("pr_barbarian_main")] }, varn], 1, [dummy("e0", 999)]);
    t = edit(t, (x) => x.units.forEach((u) => u.side === "merc" && (u.hp = 5)));
    t = act(t, { type: "skill", skill: "pr_barbarian_main" });
    t = act(t, { type: "attack", target: "e0" }); // 바른 차례 시작에 재생
    t = act(t, { type: "attack", target: "e0" });
    expect(t.log.some((e) => e.type === "heal" && e.target === varn.id && e.amount === 2)).toBe(true);
  });

  it("치유 감소: 받는 회복이 줄고, 미리보기도 같다", () => {
    let b = start([{ ...elke, job: "priest", kit: ["pray"] }], 1, [dummy("e0", 999)]);
    b = edit(b, (x) => {
      const me = unitById(x, elke.id)!;
      me.hp = 1;
      me.statuses.push({ kind: "healReduction", turns: 2, value: 0.5 });
    });
    expect(previewAction(b, { type: "skill", skill: "pray", target: elke.id })!.heal!.amount).toBe(4);
    b = act(b, { type: "skill", skill: "pray", target: elke.id });
    expect(b.log).toContainEqual({ type: "heal", target: elke.id, amount: 4, by: elke.id });
  });

  it("차례 넘기기: 아무것도 하지 않고 다음 차례로, 적대 단계라도 명령 무시가 없다", () => {
    let b = start(party, 1, [dummy("e0", 999)]);
    const first = currentActor(b)!.id;
    b = act(b, { type: "wait" });
    expect(b.log).toContainEqual({ type: "wait", unit: first });
    expect(currentActor(b)!.id).not.toBe(first);
    expect(b.log.some((e) => e.type === "attack" && e.actor === first)).toBe(false);
  });

  it("감싸기(가디언): 2턴 동안 그 아군을 노린 공격을 가디언이 대신 맞는다", () => {
    let b = start([{ ...varn, job: "guardian", skills: [build("guardian_cover")] }, kass], 1, [dummy("e0", 999, { attack: [5, 5], speed: 50 })]);
    b = edit(b, (x) => (x.turn = x.order.indexOf(varn.id)));
    b = act(b, { type: "skill", skill: "guardian_cover", target: kass.id });
    expect(unitById(b, kass.id)!.statuses.find((x) => x.kind === "cover")).toMatchObject({ source: varn.id });
    // 적이 카스를 노려도 바른이 맞는다 (적은 아무나 고르지만, 카스를 고르면 바른에게 간다)
    for (let i = 0; i < 4 && !b.outcome; i++) b = act(b, { type: "attack", target: "e0" });
    for (const e of b.log) if (e.type === "attack" && e.actor === "e0") expect(e.target).toBe(varn.id);
  });

  /** 스킬 id로 행동 */
  const cast = (b: Battle, main: string, target?: string, ...subs: string[]) => {
    const id = skillKey({ main, subs });
    return act(b, { type: "skill", skill: id, ...(target ? { target } : {}) });
  };

  it("수호 선언: 적마다 확률로 도발, 도발당한 적은 가디언만 노린다", () => {
    let hit = false;
    for (let seed = 0; seed < 20 && !hit; seed++) {
      let b = start([{ ...varn, job: "guardian", skills: [build("guardian_vow")] }, kass, elke], seed, [dummy("e0", 999, { attack: [3, 3] })]);
      b = cast(b, "guardian_vow");
      const provoked = unitById(b, "e0")!.statuses.find((x) => x.kind === "provoked");
      if (!provoked) continue;
      hit = true;
      expect(provoked.source).toBe(varn.id);
      for (let i = 0; i < 4 && !b.outcome; i++) b = act(b, { type: "attack", target: "e0" });
      const targets = b.log.filter((e) => e.type === "attack" && e.actor === "e0").map((e) => (e as { target: string }).target);
      expect(targets.length).toBeGreaterThan(0);
      expect(targets.every((t) => t === varn.id)).toBe(true);
    }
    expect(hit).toBe(true);
  });

  it("카운터: 공격받으면 반드시 1.2배로 반격 / 가시 방패: 받은 피해를 되돌린다", () => {
    let b = one({ job: "monk", skills: [build("monk_counter")] }, [dummy("e0", 999, { attack: [5, 5] })]);
    b = cast(b, "monk_counter");
    expect(unitById(b, varn.id)!.statuses.some((x) => x.kind === "counter")).toBe(true);
    const backs = b.log.filter((e) => e.type === "attack" && e.actor === varn.id);
    expect(backs.length).toBeGreaterThan(0); // 적의 공격에 반격했다
    let t = one({ job: "guardian", skills: [build("guardian_bash", "guardian_thorns")] }, [dummy("e0", 999, { attack: [10, 10] })]);
    t = cast(t, "guardian_bash", "e0", "guardian_thorns");
    expect(unitById(t, varn.id)!.statuses.some((x) => x.kind === "thorns")).toBe(true);
    const hitBy = t.log.find((e) => e.type === "attack" && e.actor === "e0" && e.target === varn.id) as { damage: number } | undefined;
    const reflected = t.log.find((e) => e.type === "attack" && e.actor === varn.id && e.target === "e0" && t.log.indexOf(e) > t.log.indexOf(hitBy as never));
    expect(hitBy && reflected).toBeTruthy();
  });

  it("호흡 가다듬기: 2턴 동안 공격 횟수 +1 / 연계: 다음 공격 한 번만 +1", () => {
    let b = start([{ ...varn, job: "monk", skills: [build("monk_breath")] }], 1, [dummy("e0", 999)]);
    b = cast(b, "monk_breath");
    const before = b.log.length;
    b = act(b, { type: "attack", target: "e0" });
    expect(b.log.slice(before).filter((e) => e.type === "attack" && e.actor === varn.id)).toHaveLength(2);
  });

  it("덮치기: 대상 체력이 50% 이하면 4번", () => {
    const hits = (hp: number) => {
      let b = one({ job: "assassin", race: "beastfolk", skills: [build("as_beastfolk_main")] }, [dummy("e0", 999, { hp, maxHp: 999 })]);
      const before = b.log.length;
      b = cast(b, "as_beastfolk_main", "e0");
      return b.log.slice(before).filter((e) => e.type === "attack" && e.actor === varn.id && e.target === "e0").length;
    };
    expect(hits(999)).toBe(3);
    expect(hits(400)).toBe(4);
  });

  it("영웅의 서사시: 아군 모두 이번 라운드에 한 번 더 행동하고, 바드는 다음 차례를 쉰다", () => {
    let b = start([{ ...varn, job: "minstrel", ultimate: "ult_minstrel" }, kass, elke], 1, [dummy("e0", 999, { attack: [0, 0] })]);
    const order = b.order.length;
    b = act(b, { type: "skill", skill: "ult_minstrel" });
    expect(b.order.length).toBe(order + 2);
    expect(unitById(b, varn.id)!.statuses.some((x) => x.kind === "bind")).toBe(true);
  });

  it("최후의 보루: 아군을 감싸고, 공격받으면 최대 체력 비례로 반드시 반격, 다음 라운드 먼저", () => {
    let b = start([{ ...varn, job: "guardian", ultimate: "ult_guardian" }, kass], 1, [dummy("e0", 999, { attack: [3, 3] })]);
    b = act(b, { type: "skill", skill: "ult_guardian" });
    b = act(b, { type: "attack", target: "e0" }); // 카스 → 적 차례
    const g = unitById(b, varn.id)!;
    expect(g.statuses.some((x) => x.kind === "haste")).toBe(true);
    // 적이 누구를 노려도 가디언이 맞고, 최대 체력의 15%로 반격
    const back = b.log.find((e) => e.type === "attack" && e.actor === varn.id && e.target === "e0") as { damage: number } | undefined;
    const hits = b.log.filter((e) => e.type === "attack" && e.actor === "e0").map((e) => (e as { target: string }).target);
    expect(hits.every((t) => t === varn.id)).toBe(true);
    expect(back?.damage).toBe(Math.round(g.maxHp * 0.15));
  });

  it("방패 강타: 기절 확률이 힘에 비례 (힘 1당 +2%)", () => {
    const b = one({ job: "guardian", skills: [build("guardian_bash")], stats: { str: 10 } }, [dummy("e0", 999)]);
    const id = unitById(b, varn.id)!.skills[0];
    const stun = previewAction(b, { type: "skill", skill: id, target: "e0" })!.applies.find((a) => a.kind === "stun");
    expect(stun).toBeDefined();
    // 미리보기는 기본 확률. 실제로는 0.3 + 10 × 0.02 = 0.5 (일반 적 저항 0.1을 빼면 0.4)
    let stunned = 0;
    for (let seed = 0; seed < 300; seed++) {
      const x = cast(one({ job: "guardian", skills: [build("guardian_bash")], stats: { str: 10 } }, [dummy("e0", 999, { rank: "normal" })], seed), "guardian_bash", "e0");
      if (x.log.some((e) => e.type === "status" && e.kind === "stun")) stunned++;
    }
    expect(stunned / 300).toBeGreaterThan(0.33);
  });

  it("꿰뚫기: 대상 말고 무작위 다른 적 하나에게도 50% 피해", () => {
    let b = one({ job: "archer", skills: [build("ar_rapid", "ar_pierce")] }, [dummy("e0", 999), dummy("e1", 999)]);
    b = cast(b, "ar_rapid", "e0", "ar_pierce");
    expect(b.log.some((e) => e.type === "attack" && e.actor === varn.id && e.target === "e1")).toBe(true);
  });

  it("결투 신청: 2턴 동안 그 적은 결투를 건 기사만 노리고, 기사는 그 적을 상대로 방어 +2", () => {
    // 바른(기사)이 결투, 카스·엘케도 파티에 있다. 적은 아무나 노릴 수 있다
    for (let seed = 0; seed < 30; seed++) {
      let b = start([{ ...varn, job: "knight", skills: [build("knight_duel")] }, kass, elke], seed, [dummy("e0", 999, { attack: [10, 10] })]);
      b = act(b, { type: "skill", skill: "knight_duel", target: "e0" });
      const duel = unitById(b, "e0")!.statuses.find((x) => x.kind === "duel");
      expect(duel).toMatchObject({ source: varn.id, value: 2 });
      // 두 라운드 동안 적의 공격은 모두 바른에게, 피해는 방어 2의 곡선만큼 준다 (치명타 15)
      for (let i = 0; i < 6 && !b.outcome; i++) b = act(b, { type: "attack", target: "e0" });
      const hits = b.log.filter((e): e is Extract<BattleEvent, { type: "attack" }> => e.type === "attack" && e.actor === "e0").slice(0, 2);
      expect(hits).toHaveLength(2);
      for (const h of hits) {
        expect(h.target).toBe(varn.id);
        expect([taken(10, 2), taken(15, 2)]).toContain(h.damage);
      }
    }
  });
});

describe("용병형 적", () => {
  it("용병 데이터로 적을 만들 수 있고, 적도 스킬과 패시브를 쓴다", () => {
    const raider = mercenaryEnemy(
      {
        ...kass,
        job: "greatsword",
        race: "barbarian",
        skills: [
          { main: "gs_strike", subs: [] },
          { main: "rc_barb_swing", subs: [] },
        ],
        passives: ["blood_thirst"],
      },
      "e0",
    );
    expect(raider).toMatchObject({
      side: "enemy",
      skills: ["gs_strike", "rc_barb_swing"],
    });
    let used = 0;
    for (let seed = 0; seed < 100; seed++) {
      let b = start([varn, elke], seed, [{ ...raider, hp: 999, maxHp: 999 }]);
      for (let i = 0; i < 6 && !b.outcome; i++)
        b = act(b, { type: "attack", target: "e0" });
      if (b.log.some((e) => e.type === "skill" && e.actor === "e0")) used++;
      // 적의 내려찍기도 용병을 노린다
      for (const e of b.log)
        if (e.type === "attack" && e.actor === "e0")
          expect([varn.id, elke.id]).toContain(e.target);
    }
    expect(used).toBeGreaterThan(50);
  });

  it("스킬이 없는 몬스터는 예전처럼 공격만 한다", () => {
    let b = start([varn], 3, [dummy("e0", 999)]);
    for (let i = 0; i < 5; i++) b = act(b, { type: "attack", target: "e0" });
    expect(b.log.some((e) => e.type === "skill" && e.actor === "e0")).toBe(
      false,
    );
  });

  it("한 전투의 적은 3~4마리", () => {
    for (let seed = 0; seed < 200; seed++) {
      const n = startBattle([varn], seed).units.filter(
        (u) => u.side === "enemy",
      ).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(4);
    }
  });
});

describe("지속 시간 규칙 (걸린 쪽 기준)", () => {
  it("남에게 건 효과는 걸린 쪽의 차례가 끝날 때 줄고, 쓴 쪽의 차례로는 줄지 않는다", () => {
    // 바른(빠름)이 적에게 위축 2턴을 건다 → 바른이 다시 행동해도 그대로, 적이 행동하고 나면 1
    let b = start([varn], 1, [dummy("e0", 999, { statuses: [] })]);
    b = edit(b, (x) => void unitById(x, "e0")!.statuses.push({ kind: "weaken", turns: 2 }));
    const turns = () => unitById(b, "e0")!.statuses.find((s) => s.kind === "weaken")?.turns;
    expect(turns()).toBe(2);
    b = act(b, { type: "attack", target: "e0" }); // 바른 → 적 차례 → 다음 라운드 바른
    expect(turns()).toBe(1);
  });

  it("자기 차례에 자기에게 건 효과는 그 차례 끝에는 줄지 않는다", () => {
    let b = start([{ ...varn, kit: ["resolve"] }], 1, [dummy("e0", 999)]);
    b = act(b, { type: "skill", skill: "resolve" }); // 각성 2턴 (자신)
    expect(unitById(b, varn.id)!.statuses.find((s) => s.kind === "awaken")?.turns).toBe(STATUS.awaken.turns);
  });

  it("기절로 쉰 차례도 센다", () => {
    let b = start([varn, elke], 1, [dummy("e0", 999)]);
    b = edit(b, (x) => {
      const e = unitById(x, elke.id)!;
      e.statuses.push({ kind: "stun", turns: 1 }, { kind: "attackUp", turns: 2, value: 2 });
    });
    b = act(b, { type: "attack", target: "e0" }); // 바른 → 엘케는 기절로 쉰다
    expect(unitById(b, elke.id)!.statuses.find((s) => s.kind === "attackUp")?.turns).toBe(1);
  });

  it("툴팁에 남은 차례를 걸린 쪽 기준으로 보여 준다", () => {
    expect(statusTip({ kind: "attackUp", turns: 2, value: 3 })).toBe("공격 강화: 공격 +3 · 남은 차례: 대상 기준 2");
    expect(statusTip({ kind: "poison", turns: 1, value: 4 })).toContain("줄어든다");
  });
});

describe("쓰러짐과 죽음", () => {
  /** 바른은 체력 1, 적은 공격력 5로 바로 쓰러뜨린다. 엘케(사제, 기도·함께하는 기도)가 먼저 행동하고 체력이 많아 전투가 이어진다 */
  const setup = (seed: number, bond?: Unit["bond"]) => {
    let b = start([{ ...elke, kit: ["pray", "mend_all"] }, varn], seed, [dummy("e0", 999, { attack: [5, 5] })]);
    b = edit(b, (c) => {
      const v = unitById(c, varn.id)!;
      v.hp = 1;
      v.bond = bond;
      unitById(c, elke.id)!.hp = 999;
      unitById(c, elke.id)!.maxHp = 999;
    });
    return b;
  };
  const varnOf = (b: Battle) => unitById(b, varn.id)!;
  /** 적이 바른을 쓰러뜨릴 때까지 진행 */
  const untilDown = (b: Battle) => {
    for (let i = 0; i < 20 && varnOf(b).hp > 0 && !varnOf(b).dead; i++) b = act(b, { type: "attack", target: "e0" });
    return b;
  };
  /** 바른이 죽거나 전투가 끝날 때까지 엘케는 공격만 */
  const untilDeath = (b: Battle) => {
    for (let i = 0; i < 30 && !b.outcome && !varnOf(b).dead; i++) b = act(b, { type: "attack", target: "e0" });
    return b;
  };

  it("체력 0이 되면 바로 죽지 않고 쓰러진다 (기본 1차례 버틴다)", () => {
    const b = untilDown(setup(1));
    expect(varnOf(b)).toMatchObject({ hp: 0, downedTurnsLeft: 1 });
    expect(b.log).toContainEqual({ type: "downed", target: varn.id, turns: 1 });
    // 적은 쓰러진 용병을 노리지 않는다 (엘케만 맞는다)
    const after = untilDeath(b);
    const hitsOnVarn = after.log.slice(b.log.length).filter((e) => e.type === "attack" && e.target === varn.id);
    expect(hitsOnVarn).toHaveLength(0);
  });

  it("자기 차례가 돌아오면 1 줄고, 0이면 죽는다 (쓰러진 직후 첫 차례는 세지 않는다). 신뢰 +1, 적대 -1 (즉시 사망)", () => {
    const down = untilDown(setup(1));
    const died = untilDeath(down);
    expect(varnOf(died).dead).toBe(true);
    expect(died.log).toContainEqual({ type: "death", target: varn.id });
    expect(died.round - down.round).toBe(2);

    // 신뢰: 2차례 버틴다
    const t = untilDown(setup(1, "trusted"));
    expect(varnOf(t).downedTurnsLeft).toBe(2);
    const roundDown = t.round;
    const td = untilDeath(t);
    expect(varnOf(td).dead).toBe(true);
    expect(td.round - roundDown).toBe(3);

    // 적대: 쓰러지는 즉시 사망
    const h = untilDown(setup(1, "hostile"));
    expect(varnOf(h).dead).toBe(true);
    expect(h.log.some((e) => e.type === "downed" && e.target === varn.id)).toBe(false);
  });

  it("라운드 마지막에 쓰러진 가장 빠른 용병도 다음 라운드에 아군이 살릴 기회가 있다", () => {
    // 바른이 맨 먼저 행동하는 순서
    let b = start([varn, elke], 1, [dummy("e0", 999, { attack: [5, 5] })]);
    b = edit(b, (c) => {
      unitById(c, varn.id)!.hp = 1;
      unitById(c, elke.id)!.hp = 999;
      unitById(c, elke.id)!.maxHp = 999;
    });
    b = untilDown(b);
    // 다음 라운드: 바른의 첫 차례는 세지 않아 살아 있고, 엘케 차례에 물약을 건넬 수 있다
    expect(varnOf(b).dead ?? false).toBe(false);
    expect(currentActor(b)?.id).toBe(elke.id);
    const saved = act(b, { type: "guide", item: "potion", target: varn.id });
    expect(varnOf(saved).hp).toBeGreaterThan(0);
  });

  it("물약으로 일으킨다 (회복량만큼). 붕대·해독제로는 못 일으킨다", () => {
    const b = untilDown(setup(1));
    expect(validate(b, { type: "guide", item: "antidote", target: varn.id })).toBe("건넬 수 없는 대상");
    expect(validate(b, { type: "guide", item: "bandage", target: varn.id })).toBe("건넬 수 없는 대상");
    const p = act(b, { type: "guide", item: "potion", target: varn.id });
    expect(varnOf(p).hp).toBe(12);
    expect(varnOf(p).downedTurnsLeft).toBeUndefined();
    expect(p.log.some((e) => e.type === "rescue" && e.via === "potion")).toBe(true);
  });

  it("한 명 대상 회복 스킬로 일으킨다. 전체 회복은 쓰러진 아군을 일으키지 못한다", () => {
    let b = untilDown(setup(1));
    while (currentActor(b)?.id !== elke.id) b = act(b, { type: "attack", target: "e0" });
    expect(validate(b, { type: "skill", skill: "pray", target: varn.id })).toBeNull();
    const healed = act(b, { type: "skill", skill: "pray", target: varn.id });
    expect(varnOf(healed).hp).toBeGreaterThan(0);
    expect(healed.log.some((e) => e.type === "rescue" && e.via === "skill" && e.target === varn.id)).toBe(true);
    // 아군 전체 회복 스킬
    const all: Skill = { id: "all", name: "모두 회복", cooldown: 0, target: "none", effects: [{ kind: "heal", amount: 8, who: "allies" }], description: "" };
    const withAll = edit(b, (c) => {
      const e = unitById(c, elke.id)!;
      e.skills = [...e.skills, "all"];
      e.book = { ...e.book, all };
    });
    const after = act(withAll, { type: "skill", skill: "all" });
    expect(varnOf(after).hp).toBe(0);
  });

  it("사제 궁극기 기적: 쓰러진 아군을 체력 50%로 일으킨다 (그때는 전체 회복을 건너뛴다)", () => {
    let b = untilDown(setup(1));
    while (currentActor(b)?.id !== elke.id) b = act(b, { type: "attack", target: "e0" });
    const miracle: Skill = { id: "miracle", name: "기적", cooldown: 0, target: "none", ultimate: true, effects: [{ kind: "revive", pct: 0.5 }, { kind: "heal", amount: 12, who: "allies" }], description: "" };
    b = edit(b, (c) => {
      const e = unitById(c, elke.id)!;
      e.ultimate = "miracle";
      e.book = { ...e.book, miracle };
      e.hp = 500;
    });
    const m = act(b, { type: "skill", skill: "miracle" });
    expect(varnOf(m).hp).toBe(Math.round(varnOf(m).maxHp * 0.5));
    expect(m.log.some((e) => e.type === "heal" && e.target === elke.id)).toBe(false);
  });

  it("전멸: 서 있는 용병이 없으면 쓰러진 용병도 모두 죽는다", () => {
    let b = start([varn, elke], 1, [dummy("e0", 999, { attack: [50, 50] })]);
    b = edit(b, (c) => {
      for (const u of c.units.filter((x) => x.side === "merc")) u.hp = 1;
    });
    for (let i = 0; i < 20 && !b.outcome; i++) b = act(b, { type: "attack", target: "e0" });
    expect(b.outcome).toBe("defeat");
    expect(b.units.filter((u) => u.side === "merc").every((u) => u.dead)).toBe(true);
  });

  it("죽은 용병은 물자를 받을 수 없다", () => {
    let b = untilDown(setup(1));
    b = edit(b, (c) => {
      const v = unitById(c, varn.id)!;
      v.dead = true;
      v.downedTurnsLeft = undefined;
    });
    expect(validate(b, { type: "guide", item: "potion", target: varn.id })).toBe("건넬 수 없는 대상");
  });
});

describe("성장 스탯", () => {
  it("체력·방어·속도는 능력치에, 힘·마법·신성은 위력에, 치명·회피는 확률에 더해진다", () => {
    const u = mercUnit({ ...varn, job: "knight", stats: { hp: 2, defense: 1, speed: 3, str: 2, mag: 1, faith: 4, crit: 5, evade: 2 } });
    expect(u).toMatchObject({ maxHp: 32 + 6, hp: 38, defense: 2 + 1, speed: 4 + 3, power: { str: 2, mag: 1, faith: 4 } });
    // 치명·회피는 체감 곡선: 치명 5점 = 60% × 5 / 30 = 10%, 회피 2점 = 50% × 2 / 22
    expect(u.critBonus).toBeCloseTo(0.1);
    expect(u.evadeBonus).toBeCloseTo(curveBonus("evade", 2));
  });

  it("힘은 기본 공격에, 마법은 마법 기술에만 더해진다 (스탯도 기술 배율만큼)", () => {
    const mage: Merc = { ...varn, job: "mage", stats: { str: 2, mag: 5 } };
    const b = start([mage], 1, [dummy("e0", 999)]);
    const plain = start([{ ...varn, job: "mage" }], 1, [dummy("e0", 999)]);
    const atk = previewAction(b, { type: "attack", target: "e0" })!.damage[0];
    const base = previewAction(plain, { type: "attack", target: "e0" })!.damage[0];
    expect(atk.min).toBe(base.min + 2);
    const fire = previewAction(b, { type: "skill", skill: "firelance", target: "e0" })!.damage[0];
    const fireBase = previewAction(plain, { type: "skill", skill: "firelance", target: "e0" })!.damage[0];
    // 불꽃 창은 2.5배: 마법 5 × 2.5 = 12.5 → 13
    expect(fire.min).toBe(fireBase.min + 13);
  });

  it("신성은 회복량을 올린다", () => {
    const nun = (faith: number) => fix2(start([{ ...varn, job: "priest", stats: { faith } }], 1, [dummy("e0", 999)]), varn.id, { hp: 1 });
    expect(previewAction(nun(0), { type: "skill", skill: "pray", target: varn.id })!.heal!.amount).toBe(8);
    expect(previewAction(nun(3), { type: "skill", skill: "pray", target: varn.id })!.heal!.amount).toBe(11);
    const b = act(nun(3), { type: "skill", skill: "pray", target: varn.id });
    expect(b.log).toContainEqual({ type: "heal", target: varn.id, amount: 11, by: varn.id });
  });
});

describe("궁극기", () => {
  it("전투당 한 번만 쓰고, 대기 시간 없이 다른 스킬과 따로 간다", () => {
    let b = start([{ ...varn, job: "greatsword", ultimate: "ult_greatsword" }], 1, [dummy("e0", 999), dummy("e1", 999)]);
    expect(validate(b, { type: "skill", skill: "ult_greatsword" })).toBeNull();
    expect(previewAction(b, { type: "skill", skill: "ult_greatsword" })!.damage).toHaveLength(2);
    b = act(b, { type: "skill", skill: "ult_greatsword" });
    expect(b.log.some((e) => e.type === "skill" && e.skill === "ult_greatsword")).toBe(true);
    expect(validate(b, { type: "skill", skill: "ult_greatsword" })).toBe("궁극기는 전투당 한 번");
    expect(validate(b, { type: "skill", skill: "cleave", target: "e0" })).toBeNull();
  });

  it("장착하지 않은 궁극기는 쓸 수 없다", () => {
    const b = start([{ ...varn, job: "greatsword" }], 1, [dummy("e0", 999)]);
    expect(validate(b, { type: "skill", skill: "ult_greatsword" })).toBe("장착하지 않은 스킬");
  });
});

describe("장신구 효과 (2026-11-22 개편)", () => {
  /** 바른(기사)에게 장신구 효과를 직접 단다 */
  const geared = (gear: Unit["gear"], enemies: Unit[] = [dummy("e0", 999)], others: TMerc[] = []) =>
    start([{ ...varn, job: "knight", gear }, ...others], 1, enemies);
  const varnOf = (b: Battle) => unitById(b, varn.id)!;

  it("기본 스탯: 최대 체력·방어·속도·마력·치명·회피·공격, 저항", () => {
    const u = mercUnit({ ...varn, job: "knight", gear: { maxHp: 18, defense: 3, speed: 1, mag: 2, crit: 0.06, evade: 0.08, attack: 3, bleedRes: 0.3, poisonRes: 0.3 } });
    expect(u).toMatchObject({ maxHp: 32 + 18, defense: 2 + 3, speed: 4 + 1, power: { mag: 2 }, attack: [9, 12], resist: { bleed: 0.3, poison: 0.3 } });
    expect(u.critBonus).toBeCloseTo(0.06);
    expect(u.evadeBonus).toBeCloseTo(0.08);
    expect(resistOf(u, "bleed")).toBeCloseTo(0.3);
  });

  it("위력: 단일 공격 +12%는 평타에, 치명 피해 +15%는 치명타에", () => {
    const plain = previewAction(geared({}), { type: "attack", target: "e0" })!.damage[0];
    const single = previewAction(geared({ singlePower: 0.5 }), { type: "attack", target: "e0" })!.damage[0];
    expect(single.max).toBe(Math.round(plain.max * 1.5));
    const crit = previewAction(geared({ critDamage: 0.5 }), { type: "attack", target: "e0" })!.damage[0];
    expect(crit.critMax).toBeGreaterThan(plain.critMax);
    expect(crit.max).toBe(plain.max);
  });

  it("흡혈: 준 피해의 비율만큼 회복", () => {
    let b = edit(geared({ lifesteal: 0.5 }), (c) => (varnOf(c).hp = 1));
    b = act(b, { type: "attack", target: "e0" });
    const hit = b.log.find((e) => e.type === "attack" && e.actor === varn.id);
    expect(hit && hit.type === "attack" && hit.damage).toBeGreaterThan(0);
    expect(b.log.some((e) => e.type === "heal" && e.target === varn.id && e.by === varn.id)).toBe(true);
  });

  it("마지막 숨결: 쓰러질 피해를 체력 1로 버틴다 (남은 횟수만큼), 버틴 뒤 받는 피해 -", () => {
    let b = edit(geared({ lastBreath: 1, breathGuard: 0.5 }, [dummy("e0", 999, { attack: [50, 50] })]), (c) => (varnOf(c).hp = 10));
    expect(varnOf(b).breath).toBe(1);
    b = act(b, { type: "wait" });
    expect(varnOf(b)).toMatchObject({ hp: 1, breath: 0 });
    expect(varnOf(b).fx?.breathUsed).toBe(1);
    expect(b.log).toContainEqual({ type: "passive", unit: varn.id, passive: "last_breath" });
    expect(hasStatus(varnOf(b), "toughen")).toBe(true);
    // 다음 쓰러질 피해는 버티지 못한다
    b = act(b, { type: "wait" });
    expect(varnOf(b).hp).toBe(0);
  });

  it("버팀 팔찌: 전투당 1번, 체력이 30% 아래로 떨어지면 최대 체력 비율 회복", () => {
    let b = edit(geared({ braceHeal: 0.15 }, [dummy("e0", 999, { attack: [10, 10] })]), (c) => {
      varnOf(c).maxHp = 40;
      varnOf(c).hp = 20;
    });
    b = act(b, { type: "wait" });
    // 20 - 10 = 10 (< 12) → +6
    expect(varnOf(b).hp).toBe(16);
    expect(varnOf(b).fx?.braceUsed).toBe(true);
    b = act(b, { type: "wait" });
    expect(varnOf(b).hp).toBe(6);
  });

  /** 엘케(체력 999)가 먼저 행동하고, 적은 바른만 노린다 (도발) */
  const pair = (gear: Unit["gear"], atk: number) => {
    const b = start([{ ...elke, kit: ["pray"] }, { ...varn, job: "knight", gear }], 1, [dummy("e0", 999, { attack: [atk, atk] })]);
    return edit(b, (c) => {
      unitById(c, elke.id)!.hp = 999;
      unitById(c, elke.id)!.maxHp = 999;
      unitById(c, "e0")!.statuses.push({ kind: "provoked", turns: 9, source: varn.id });
    });
  };

  it("생명의 부적: 쓰러져 버티는 차례 +1, 일어날 때 회복 +", () => {
    let b = edit(pair({ downedTurns: 1, riseHeal: 0.2 }, 50), (c) => (varnOf(c).hp = 1));
    for (let i = 0; i < 5 && varnOf(b).hp > 0; i++) b = act(b, { type: "wait" });
    expect(varnOf(b).downedTurnsLeft).toBe(2);
    // 길안내자 물약: 기본 회복 × 1.2
    const potion = act(b, { type: "guide", item: "potion", target: varn.id });
    expect(varnOf(potion).hp).toBe(Math.round(POTION_HEAL * 1.2));
  });

  it("구급 허리띠: 받는 물약 회복 +, 3단계는 쓰러진 채 받으면 +10", () => {
    const hurt = edit(pair({ potionPower: 0.6, potionReviveFlat: 10 }, 1), (c) => (varnOf(c).hp = 1));
    const healed = act(hurt, { type: "guide", item: "potion", target: varn.id });
    expect(varnOf(healed).hp).toBe(1 + Math.round(POTION_HEAL * 1.6));
    const down = edit(hurt, (c) => {
      varnOf(c).hp = 0;
      varnOf(c).downedTurnsLeft = 1;
    });
    expect(varnOf(act(down, { type: "guide", item: "potion", target: varn.id })).hp).toBe(Math.round(POTION_HEAL * 1.6) + 10);
  });

  it("반사 피해 +%: 가시 상태의 반사 비율에 더한다 (가시 방패테 3단계 15%)", () => {
    const run = (gear: Unit["gear"]) => {
      let b = edit(geared(gear, [dummy("e0", 999, { attack: [40, 40] })]), (c) => {
        varnOf(c).statuses.push({ kind: "thorns", turns: 2, value: 0.3 });
        varnOf(c).hp = 999;
        varnOf(c).maxHp = 999;
        varnOf(c).defense = 0;
      });
      b = act(b, { type: "wait" });
      const taken = 999 - varnOf(b).hp;
      return { back: 999 - unitById(b, "e0")!.hp, taken };
    };
    const plain = run({});
    const rim = run({ thornsPct: 0.15 });
    expect(plain.back).toBe(Math.round(plain.taken * 0.3));
    expect(rim.back).toBe(Math.round(rim.taken * 0.45));
  });

  it("균열: 받는 피해 +10% (고정 피해가 아니다)", () => {
    const b = edit(geared({}), (c) => unitById(c, "e0")!.statuses.push({ kind: "crack", turns: 2, value: 0.1 }));
    expect(strikeFactors(b, varnOf(b), unitById(b, "e0")!).taken).toBeCloseTo(1.1);
  });

  it("결투 상대에게 방어 + (서약의 망토)", () => {
    const hit = (gear: Unit["gear"]) => {
      let b = edit(geared(gear, [dummy("e0", 999, { attack: [40, 40] })]), (c) => {
        varnOf(c).defense = 0;
        varnOf(c).hp = 999;
        varnOf(c).maxHp = 999;
        unitById(c, "e0")!.statuses.push({ kind: "duel", turns: 2, value: 2, source: varn.id });
      });
      b = act(b, { type: "wait" });
      return varnOf(b).maxHp - varnOf(b).hp;
    };
    expect(hit({})).toBe(taken(40, 2));
    expect(hit({ duelReduce: 2 })).toBe(taken(40, 4));
  });

  it("독샘 반지: 거는 중독 +", () => {
    const u = mercUnit({ ...varn, job: "assassin", gear: { poisonStack: 2 } });
    expect(dotStack(u, "poison")).toBe(2 + 2);
    expect(dotStack(u, "bleed")).toBe(dotStack(mercUnit({ ...varn, job: "assassin" }), "bleed"));
  });

  it("위력 보정: 범위 +, 체력 50% 이하 +, 신성 +, 원소 +, 반격 +", () => {
    const b = geared({ areaPower: 0.1, lowHpPower: 0.2, holyPower: 0.3, elementPower: 0.4, counterPower: 0.5 });
    const v = unitById(b, varn.id)!;
    const foe = unitById(b, "e0")!;
    expect(strikeFactors(b, v, foe).multiplier).toBeCloseTo(1);
    expect(strikeFactors(b, v, foe, { aoe: true }).multiplier).toBeCloseTo(1.1);
    expect(strikeFactors(b, v, foe, { scaling: [{ stat: "faith", mult: 1 }] }).multiplier).toBeCloseTo(1.3);
    expect(strikeFactors(b, v, foe, { elemental: true }).multiplier).toBeCloseTo(1.4);
    expect(strikeFactors(b, v, foe, { counter: true }).multiplier).toBeCloseTo(1.5);
    expect(strikeFactors(b, { ...v, hp: 1 }, foe).multiplier).toBeCloseTo(1.2);
  });

  it("거는 상태이상: 기절 확률 +, 비율 약화 +%p, 약화 효과 ×, 약화 지속 +, 건 적은 흔들림", () => {
    const hex: Skill = {
      id: "hex",
      name: "저주",
      cooldown: 0,
      target: "enemy",
      description: "",
      effects: [
        { kind: "applyStatus", status: "mark", value: 0.1, turns: 2 },
        { kind: "applyStatus", status: "weaken", value: 2, turns: 2 },
        { kind: "applyStatus", status: "stun", chance: 0.9 },
      ],
    };
    const cast = (gear: Unit["gear"]) => {
      const b = edit(geared(gear), (c) => {
        const v = varnOf(c);
        v.skills = ["hex"];
        v.book = { hex };
      });
      // 적 차례가 오기 전 상태를 본다 (기절은 적 차례에 풀린다)
      const after = act(b, { type: "skill", skill: "hex", target: "e0" });
      return { ...unitById(after, "e0")!, stunned: after.log.some((e) => e.type === "stunned" && e.target === "e0") };
    };
    const plain = cast({});
    expect(statusValue(plain, "mark")).toBeCloseTo(0.1);
    const g = cast({ markPlus: 0.05, debuffPower: 0.5, debuffTurns: 1, stunChance: 0.1, songStunResDown: 0.1 });
    expect(statusValue(g, "mark")).toBeCloseTo(0.23); // (0.1 + 0.05) × 1.5, 1% 단위 반올림
    expect(statusValue(g, "weaken")).toBeCloseTo(3);
    expect(g.statuses.find((x) => x.kind === "weaken")!.turns).toBe(plain.statuses.find((x) => x.kind === "weaken")!.turns + 1);
    expect(statusValue(g, "shaken")).toBeCloseTo(0.1);
    // 기절: 0.9 + 0.1 - 일반 몬스터 저항 0.1 + 흔들림 0.1 = 반드시 걸린다 (적 차례를 쉰다)
    expect(g.stunned).toBe(true);
  });

  it("회복량 ×, 일으킬 때 +, 보호막 +", () => {
    const nun = (gear: Unit["gear"]) => fix2(start([{ ...varn, job: "priest", gear, kit: ["pray", "ward"] }], 1, [dummy("e0", 999)]), varn.id, { hp: 1 });
    expect(previewAction(nun({}), { type: "skill", skill: "pray", target: varn.id })!.heal!.amount).toBe(8);
    expect(previewAction(nun({ healPower: 0.25 }), { type: "skill", skill: "pray", target: varn.id })!.heal!.amount).toBe(10);
    expect(previewAction(nun({ shieldPower: 0.5 }), { type: "skill", skill: "ward", target: varn.id })!.shield!.amount).toBe(9);
  });

  it("첫 라운드 회피 +, 감싸기로 대신 맞을 때 받는 피해 -", () => {
    const b = geared({ firstRoundEvade: 0.3, coverTaken: 0.5 });
    const foe = unitById(b, "e0")!;
    const v = unitById(b, varn.id)!;
    expect(strikeFactors(b, foe, v).evadeChance).toBeCloseTo(0.3);
    expect(strikeFactors({ ...b, round: 2 }, foe, v).evadeChance).toBeCloseTo(0);
    expect(strikeFactors(b, foe, v, { covered: true }).taken).toBeCloseTo(0.5);
    expect(strikeFactors(b, foe, v).taken).toBeCloseTo(1);
  });

});

describe("깨우기", () => {
  it("자기 차례를 써서 쓰러진 아군을 체력 1로 일으킨다 (같은 대상은 전투당 1번)", () => {
    let b = start([{ ...elke, kit: ["pray"] }, varn], 1, [dummy("e0", 999)]);
    b = edit(b, (c) => {
      const v = unitById(c, varn.id)!;
      v.hp = 0;
      v.downedTurnsLeft = 1;
    });
    expect(validate(b, { type: "wake", target: "e0" })).toBe("깨울 수 없는 대상");
    const woke = act(b, { type: "wake", target: varn.id });
    expect(unitById(woke, varn.id)).toMatchObject({ hp: 1, downedTurnsLeft: undefined });
    expect(woke.log).toContainEqual({ type: "rescue", target: varn.id, via: "wake", by: elke.id });
    const again = edit(woke, (c) => {
      const v = unitById(c, varn.id)!;
      v.hp = 0;
      v.downedTurnsLeft = 1;
      c.turn = c.order.indexOf(elke.id);
    });
    expect(validate(again, { type: "wake", target: varn.id })).toBe("이번 전투에서 이미 깨웠다");
  });
});


describe("스탯 곡선 (방어·회피·치명)", () => {
  it("장신구 %는 곡선 값에 더하고, 상한: 받는 피해 감소 80%, 회피 60%, 치명 80%", () => {
    expect(takenReduction(3, 0.08)).toBeCloseTo(curveBonus("defense", 3) + 0.08);
    expect(takenReduction(1000, 0.5)).toBe(0.8);
    const u = mercUnit({ ...varn, job: "knight", stats: { evade: 1000, crit: 1000 }, gear: { evade: 0.3, crit: 0.3 } });
    expect(unitStats(u).evadeChance).toBe(0.6);
    expect(unitStats(u).critChance).toBe(0.8);
    expect(unitStats(mercUnit({ ...varn, job: "knight", gear: { defensePct: 0.08 } })).damageReduction).toBeCloseTo(curveBonus("defense", 2) + 0.08);
  });

  it("몬스터 방어도 같은 곡선, 방어 무시는 감소 %에 (1 - 방어 무시)를 곱한다", () => {
    const b = start([varn], 1, [dummy("e0", 999, { defense: 15 })]);
    const v = unitById(b, varn.id)!;
    const e = unitById(b, "e0")!;
    expect(strikeFactors(b, v, e).reduce).toBeCloseTo(0.35);
    const f = { ...strikeFactors(b, v, e, { pierce: 0.5 }), multiplier: 1, bonus: 0 };
    expect(f.pierce).toBe(0.5);
    // 100 × (1 - 0.35 × 0.5)
    expect(strikeAmount(100, f, false)).toBe(83);
    // 방어 무시는 모든 출처를 합해 100%까지
    expect(strikeFactors(b, v, e, { pierce: 3 }).pierce).toBe(1);
  });
});

describe("회복 횟수 (타격 수 부 조각)", () => {
  it("회복을 횟수만큼 하고, 쓰러진 아군은 첫 회복으로 일으킨 뒤 나머지를 더한다. 미리보기도 합계", () => {
    const twice: Skill = { id: "twin_heal", name: "연속 치유", cooldown: 0, target: "ally", description: "", effects: [{ kind: "heal", amount: 3, hits: 2 }] };
    const setup = (hp: number, downed = false) =>
      edit(start([{ ...elke, job: "priest" }, varn], 1, [dummy("e0", 999)]), (c) => {
        const e = unitById(c, elke.id)!;
        e.skills = ["twin_heal"];
        e.book = { twin_heal: twice };
        const v = unitById(c, varn.id)!;
        v.hp = hp;
        if (downed) v.downedTurnsLeft = 1;
      });
    const b = setup(5);
    expect(previewAction(b, { type: "skill", skill: "twin_heal", target: varn.id })!.heal!.amount).toBe(6);
    const after = act(b, { type: "skill", skill: "twin_heal", target: varn.id });
    expect(after.log.filter((e) => e.type === "heal" && e.target === varn.id)).toHaveLength(2);
    expect(unitById(after, varn.id)!.hp).toBe(11);
    const up = act(setup(0, true), { type: "skill", skill: "twin_heal", target: varn.id });
    expect(unitById(up, varn.id)!.hp).toBe(6);
  });
});
