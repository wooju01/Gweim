import { describe, expect, it } from "vitest";
import { POTION_HEAL, START_SUPPLIES, STATUS } from "../../data/combat";
import { TEST_MERCS } from "../../test/fixtures";
import { PASSIVES } from "../../data/passives";
import { survivalChance } from "../../data/death";
import { createRng } from "../random";
import type { Merc } from "../types";
import {
  act,
  currentActor,
  giftsReceived,
  mercenaryEnemy,
  mercUnit,
  neighbors,
  previewAction,
  startBattleFrom,
  startBattleWithUnits,
  hasStatus,
  living,
  startBattle,
  unitById,
  validate,
  type Battle,
  type BattleAction,
  type BattleEvent,
  type Unit,
} from "./engine";
import { SKILLS, getSkill } from "../../data/combat";
import { comboId } from "../../data/combo";
import { JOB_SKILL, skillsFrom } from "../../data/skills";
import { describe as describeEvent, josa } from "./text";

/** 밸런스 측정용 단순 정책: 출혈이면 붕대, 스킬이 준비되면 스킬, 아니면 가장 약한 적 공격 */
function simplePolicy(b: Battle, actor: Unit): BattleAction {
  const weakest = [...living(b, "enemy")].sort((x, y) => x.hp - y.hp)[0].id;
  if (actor.statuses.some((s) => s.kind === "bleed") && b.supplies.bandage > 0)
    return { type: "bandage" };
  const sk = actor.skills[0];
  if (sk && !(actor.cooldowns[sk] > 0)) {
    const kind = getSkill(sk)!.target;
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
  { ...elke, job: "nun" },
];

/**
 * 규칙 테스트용 전투 시작. 용병의 방어력은 0, 속도는 파티 순서대로 높게 고정해서
 * 용병이 파티 순서대로 행동하고 피해 계산이 단순해진다. 방어력·속도 자체는 따로 테스트한다.
 */
function start(
  mercs: Merc[],
  seed: number,
  enemies?: Unit[],
  depth = 1,
): Battle {
  if (!enemies) return startBattle(mercs, seed, undefined, depth);
  const units = mercs.map((m, i) => ({
    ...mercUnit(m),
    defense: 0,
    speed: 100 - i * 10,
  }));
  return startBattleWithUnits([...units, ...enemies], seed, depth);
}

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
  it("턴 시작에 피해를 주고, 지속 시간이 끝나면 사라진다", () => {
    let b = edit(start(party, 1, [dummy("e0", 999)]), (x) => {
      unitById(x, kass.id)!.statuses.push({ kind: "poison", turns: 1 });
    });
    const hpBefore = unitById(b, kass.id)!.hp;
    b = act(b, { type: "attack", target: "e0" }); // 바른 → 카스 차례 시작, 중독 피해
    expect(unitById(b, kass.id)!.hp).toBe(hpBefore - STATUS.poison.damage);
    expect(unitById(b, kass.id)!.statuses).toEqual([]);
    expect(b.log).toContainEqual({
      type: "tick",
      target: kass.id,
      kind: "poison",
      damage: STATUS.poison.damage,
    });
  });

  it("상태이상으로 쓰러지면 그 턴은 건너뛴다", () => {
    let b = edit(start(party, 1, [dummy("e0", 999)]), (x) => {
      const k = unitById(x, kass.id)!;
      k.hp = 1;
      k.statuses.push({ kind: "bleed", turns: 3 });
    });
    b = act(b, { type: "attack", target: "e0" });
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
  });
});

describe("스킬", () => {
  /** 막아서기를 확인하려고 바른(기사)이 아닌 순서도 필요해 직업을 바꿔 가며 쓴다 */
  const withJob = (job: string): Merc[] => [
    { ...varn, job },
    { ...kass, job: "assassin" },
    { ...elke, job: "nun" },
  ];

  it("직업마다 스킬이 정해지고, 직업이 없으면 전력 공격", () => {
    const b = start([...party, { ...varn, id: "nojob", job: undefined }], 1, [
      dummy("e0"),
    ]);
    expect(unitById(b, varn.id)!.skills[0]).toBe("guard");
    expect(unitById(b, kass.id)!.skills[0]).toBe("pierce");
    expect(unitById(b, elke.id)!.skills[0]).toBe("pray");
    expect(unitById(b, "nojob")!.skills[0]).toBe("power");
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
    const nunFirst = start([{ ...elke, job: "nun" }, ...party.slice(0, 2)], 1, [
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
      start([{ ...elke, job: "nun" }, ...party.slice(0, 2)], 1, [dummy("e0")]),
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
      start(withJob("herbalist"), 1, [dummy("e0", 999), dummy("e1", 999)]),
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

describe("마법사·정령사", () => {
  const first = (job: string): Merc[] => [
    { ...varn, job },
    { ...kass, job: "assassin" },
    { ...elke, job: "nun" },
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
      const b = act(start(first("spiritcaller"), seed, [dummy("e0", 999)]), {
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

  it("마법사·정령사가 섞인 파티도 전투 한 번은 쉽게 이긴다", () => {
    // 탱커·딜러 + 마법사 + 정령사 (보조 직업이 하나인 흔한 조합)
    const mixed: Merc[] = [
      { ...varn, job: "knight" },
      { ...kass, job: "greatsword" },
      { ...elke, job: "mage" },
      { ...varn, id: "m4", job: "spiritcaller" },
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

describe("종족 패시브", () => {
  type AttackEvent = Extract<BattleEvent, { type: "attack" }>;
  const P = (passives: string[], id = "p1", job = "knight"): Merc => ({
    ...varn,
    id,
    job,
    passives,
  });
  const hitsBy = (b: Battle, actor: string) =>
    b.log.filter(
      (e): e is AttackEvent => e.type === "attack" && e.actor === actor,
    );
  const fix = (b: Battle, id: string, patch: Partial<Unit>) =>
    edit(b, (c) => Object.assign(unitById(c, id)!, patch));

  /** 시드를 바꿔 가며 치명타가 아닌 첫 공격 피해를 찾는다 */
  function plainHit(make: (seed: number) => Battle, actor = "p1"): number {
    for (let seed = 1; seed < 200; seed++) {
      const hit = hitsBy(make(seed), actor).find((h) => !h.crit);
      if (hit) return hit.damage;
    }
    throw new Error("치명타가 아닌 공격이 없다");
  }
  /** 용병 p1이 공격력 5로 e0를 한 번 때린 피해 */
  const myHit = (
    passives: string[],
    enemies: Unit[] = [dummy("e0", 999)],
    patch: Partial<Unit> = {},
    depth = 1,
    extra: Merc[] = [],
  ) =>
    plainHit((seed) =>
      act(
        fix(start([P(passives), ...extra], seed, enemies, depth), "p1", {
          attack: [5, 5],
          ...patch,
        }),
        {
          type: "attack",
          target: "e0",
        },
      ),
    );
  /** 적 e0(공격력 4)이 p1을 때린 피해 */
  const enemyHit = (passives: string[], patch: Partial<Unit> = {}) =>
    plainHit(
      (seed) =>
        act(
          fix(
            start([P(passives)], seed, [dummy("e0", 999, { attack: [4, 4] })]),
            "p1",
            patch,
          ),
          { type: "attack", target: "e0" },
        ),
      "e0",
    );

  it("패시브가 없으면 공격력 5는 5 피해", () => {
    expect(myHit([])).toBe(5);
    expect(enemyHit([])).toBe(4);
  });

  it("바위의 뿌리: 받는 피해 -1 / 고통 망각: 잃은 체력에 비례해 최대 -3", () => {
    expect(enemyHit(["rock_root"])).toBe(3);
    expect(enemyHit(["pain_oblivion"], { hp: 32 })).toBe(4);
    expect(enemyHit(["pain_oblivion"], { hp: 2 })).toBe(1);
  });

  it("피의 갈증·무쌍의 투혼·깊은 곳의 피·추격 본능·결속", () => {
    expect(myHit(["blood_thirst"], undefined, { hp: 1 })).toBe(5 + 5);
    expect(
      myHit(
        ["peerless_spirit"],
        [dummy("e0", 999), dummy("e1", 999), dummy("e2", 999)],
      ),
    ).toBe(5 + 3);
    const walkedHit = (walked: number) =>
      plainHit((seed) => {
        const units = [
          {
            ...mercUnit(P(["deep_blood"])),
            attack: [5, 5] as const,
            defense: 0,
            speed: 100,
          },
          dummy("e0", 999),
        ];
        const b = startBattleFrom(units, seed, {
          depth: 1,
          supplies: START_SUPPLIES,
          walked,
          enemies: [],
        });
        return act(b, { type: "attack", target: "e0" });
      });
    expect(walkedHit(0)).toBe(5);
    expect(walkedHit(5)).toBe(5 + 2);
    expect(walkedHit(20)).toBe(5 + 3);
    expect(myHit(["chase_instinct"], [dummy("e0", 999, { hp: 10 })])).toBe(
      5 + 3,
    );
    const others = [kass, elke, { ...varn, id: "v4" }];
    expect(myHit(["solidarity"], undefined, {}, 1, others)).toBe(5 + 1);
    expect(myHit(["solidarity"], undefined, {}, 1, others.slice(0, 2))).toBe(5);
  });

  it("선제 일격: 첫 공격만 1.5배", () => {
    let b = fix(start([P(["first_strike"])], 4, [dummy("e0", 999)]), "p1", {
      attack: [6, 6],
    });
    b = act(b, { type: "attack", target: "e0" });
    b = act(b, { type: "attack", target: "e0" });
    const [first, second] = hitsBy(b, "p1");
    if (!first.crit) expect(first.damage).toBe(9);
    if (!second.crit) expect(second.damage).toBe(6);
    expect(
      b.log.filter((e) => e.type === "passive" && e.passive === "first_strike"),
    ).toHaveLength(1);
  });

  it("사냥꾼의 집념: 같은 적을 연속으로 때리면 +1씩 (최대 +3), 대상을 바꾸면 초기화", () => {
    let b = fix(
      start([P(["hunters_focus"])], 2, [dummy("e0", 999), dummy("e1", 999)]),
      "p1",
      { attack: [5, 5] },
    );
    for (const t of ["e0", "e0", "e0", "e0", "e0", "e1"])
      b = act(b, { type: "attack", target: t });
    const plain = hitsBy(b, "p1").map((h) => (h.crit ? null : h.damage));
    expect(plain).toEqual(
      [5, 6, 7, 8, 8, 5].map((d, i) => (plain[i] === null ? null : d)),
    );
  });

  it("예리한 눈: 치명타 확률이 오른다", () => {
    const rate = (passives: string[]) => {
      let crits = 0;
      for (let seed = 0; seed < 1500; seed++) {
        const b = act(start([P(passives)], seed, [dummy("e0", 999)]), {
          type: "attack",
          target: "e0",
        });
        if (hitsBy(b, "p1")[0].crit) crits++;
      }
      return crits / 1500;
    };
    expect(rate(["keen_eye"]) - rate([])).toBeGreaterThan(0.04);
  });

  it("강철 심장: 출혈에 걸릴 확률 절반 / 임기응변: 출혈 지속 1턴 감소", () => {
    const bleedRate = (passives: string[]) => {
      let n = 0;
      for (let seed = 0; seed < 600; seed++) {
        const b = act(
          start([P(passives)], seed, [
            dummy("e0", 999, { onHit: { status: "bleed", chance: 1 } }),
          ]),
          { type: "attack", target: "e0" },
        );
        if (
          b.log.some(
            (e) =>
              e.type === "status" && e.target === "p1" && e.kind === "bleed",
          )
        )
          n++;
      }
      return n / 600;
    };
    expect(bleedRate([])).toBe(1);
    expect(bleedRate(["steel_heart"])).toBeGreaterThan(0.35);
    expect(bleedRate(["steel_heart"])).toBeLessThan(0.65);

    const b = act(
      start([P(["improvise"])], 1, [
        dummy("e0", 999, { onHit: { status: "bleed", chance: 1 } }),
      ]),
      { type: "attack", target: "e0" },
    );
    // 걸릴 때 1턴 줄고(3→2), 다음 자기 턴 시작에 한 번 피해를 입어 1이 남는다 (임기응변이 없으면 2)
    expect(
      unitById(b, "p1")!.statuses.find((s) => s.kind === "bleed")?.turns,
    ).toBe(STATUS.bleed.turns - 2);
  });

  it("적응: 같은 적에게 맞을수록 받는 피해가 줄어든다 (최대 -2)", () => {
    let b = start([P(["adapt"])], 3, [dummy("e0", 999, { attack: [6, 6] })]);
    for (let i = 0; i < 5; i++) b = act(b, { type: "attack", target: "e0" });
    const plain = hitsBy(b, "e0")
      .filter((h) => !h.crit)
      .map((h) => h.damage);
    expect(plain[0]).toBe(6);
    expect(Math.min(...plain)).toBe(4);
  });

  it("흥이 오른다: 세 번 맞으면 다음 공격 2배", () => {
    let b = fix(
      start([P(["rising_cheer"])], 5, [dummy("e0", 999, { attack: [1, 1] })]),
      "p1",
      { attack: [5, 5] },
    );
    for (let i = 0; i < 5; i++) b = act(b, { type: "attack", target: "e0" });
    expect(
      b.log.some((e) => e.type === "passive" && e.passive === "rising_cheer"),
    ).toBe(true);
    const idx = b.log.findIndex(
      (e) => e.type === "passive" && e.passive === "rising_cheer",
    );
    const boosted = b.log
      .slice(idx)
      .find((e): e is AttackEvent => e.type === "attack" && e.actor === "p1")!;
    expect(boosted.damage).toBe(boosted.crit ? 15 : 10);
  });

  it("사선 돌파: 체력 25% 이하로 떨어지면 한 번 각성해 공격 +4", () => {
    let b = fix(
      start([P(["last_stand"])], 1, [dummy("e0", 999, { attack: [2, 2] })]),
      "p1",
      { hp: 9, attack: [5, 5] },
    );
    b = act(b, { type: "attack", target: "e0" }); // 적에게 맞아 7 → 각성
    expect(hasStatus(unitById(b, "p1")!, "awaken")).toBe(true);
    b = act(b, { type: "attack", target: "e0" });
    const second = hitsBy(b, "p1")[1];
    expect(second.damage).toBe(second.crit ? 14 : 9);
    expect(
      b.log.filter((e) => e.type === "passive" && e.passive === "last_stand"),
    ).toHaveLength(1);
  });

  it("포효: 전투 시작 시 적이 위축돼 공격력 -2", () => {
    const b = start([P(["war_cry"])], 1, [
      dummy("e0", 999, { attack: [4, 4] }),
    ]);
    expect(hasStatus(unitById(b, "e0")!, "weaken")).toBe(true);
    expect(enemyHit(["war_cry"])).toBe(2);
  });

  it("장인의 눈썰미: 가끔 균열을 걸고, 균열 난 적은 피해 +2", () => {
    let cracked = 0;
    for (let seed = 0; seed < 500; seed++) {
      const b = act(start([P(["crafters_eye"])], seed, [dummy("e0", 999)]), {
        type: "attack",
        target: "e0",
      });
      if (b.log.some((e) => e.type === "status" && e.kind === "crack"))
        cracked++;
    }
    expect(cracked / 500).toBeGreaterThan(0.12);
    expect(cracked / 500).toBeLessThan(0.28);
    expect(
      myHit(
        [],
        [dummy("e0", 999, { statuses: [{ kind: "crack", turns: 2 }] })],
      ),
    ).toBe(7);
  });

  it("손발이 맞는다: 길안내자가 건넨 물약이 1.5배", () => {
    let b = fix(start([P(["in_sync"])], 1, [dummy("e0", 999)]), "p1", {
      hp: 5,
    });
    b = act(b, { type: "guide", item: "potion", target: "p1" });
    expect(b.log).toContainEqual({
      type: "heal",
      target: "p1",
      amount: 18,
      by: "guide",
    });
  });

  it("야생의 회복력: 라운드 시작마다 체력 1 회복", () => {
    let b = fix(start([P(["wild_recovery"])], 1, [dummy("e0", 999)]), "p1", {
      hp: 10,
    });
    b = act(b, { type: "attack", target: "e0" });
    expect(b.log).toContainEqual({
      type: "heal",
      target: "p1",
      amount: 1,
      by: "p1",
    });
  });

  it("깃털의 발걸음: 가끔 피한다 / 바람의 춤: 피하면 다음 공격 +3 / 야수의 반사신경: 피하면 반격", () => {
    let evades = 0;
    let danced = false;
    let countered = false;
    for (let seed = 0; seed < 400; seed++) {
      let b = fix(
        start([P(["feather_step", "wind_dance", "beast_reflex"])], seed, [
          dummy("e0", 999),
        ]),
        "p1",
        { attack: [5, 5] },
      );
      b = act(b, { type: "attack", target: "e0" });
      const evaded = b.log.some((e) => e.type === "evade");
      if (!evaded) continue;
      evades++;
      if (
        b.log.some((e) => e.type === "passive" && e.passive === "beast_reflex")
      )
        countered = true;
      b = act(b, { type: "attack", target: "e0" });
      const next = hitsBy(b, "p1").at(-1)!;
      if (!next.crit && next.damage === 8) danced = true;
    }
    expect(evades / 400).toBeGreaterThan(0.1);
    expect(evades / 400).toBeLessThan(0.26);
    expect(danced).toBe(true);
    expect(countered).toBe(true);
  });

  it("전사의 긍지: 체력 30% 이하 아군 대신 공격을 맞는다", () => {
    // 적이 위태로운 아군을 고른 라운드에만 발동한다. 여러 라운드 동안 약한 아군은 한 번도 맞지 않는다
    let b = start([P([], "weak"), P(["warrior_pride"], "barb")], 1, [
      dummy("e0", 999, { attack: [1, 1] }),
    ]);
    b = fix(b, "weak", { hp: 5 });
    for (let i = 0; i < 16; i++) b = act(b, { type: "attack", target: "e0" });
    expect(b.log).toContainEqual({
      type: "passive",
      unit: "barb",
      passive: "warrior_pride",
      target: "weak",
    });
    expect(hitsBy(b, "e0").some((h) => h.target === "weak")).toBe(false);
  });

  it("숨통 끊기: 적을 쓰러뜨리면 라운드당 한 번 바로 다시 행동", () => {
    let b = fix(
      start([P(["finishing_bite"]), P([], "p2")], 1, [
        dummy("e0", 1),
        dummy("e1", 1),
        dummy("e2", 999),
      ]),
      "p1",
      { attack: [5, 5] },
    );
    b = act(b, { type: "attack", target: "e0" });
    expect(currentActor(b)!.id).toBe("p1");
    b = act(b, { type: "attack", target: "e1" }); // 같은 라운드 두 번째 처치는 추가 행동 없음
    expect(currentActor(b)!.id).toBe("p2");
  });

  it("바람 정령의 가호: 속도 +3, 같은 직업이면 대개 먼저 행동한다", () => {
    let first = 0;
    for (let seed = 0; seed < 300; seed++) {
      const b = startBattle(
        [P([], "slow"), P(["wind_blessing"], "fast")],
        seed,
        [dummy("e0", 999)],
      );
      if (b.order.indexOf("fast") < b.order.indexOf("slow")) first++;
    }
    expect(first / 300).toBeGreaterThan(0.75);
  });

  it("기도는 출혈·중독만 씻고 각성 같은 강화는 남긴다", () => {
    let b = start([{ ...elke, job: "nun" }], 1, [dummy("e0", 999)]);
    b = edit(b, (c) => {
      unitById(c, elke.id)!.statuses = [
        { kind: "bleed", turns: 2 },
        { kind: "awaken", turns: 2 },
      ];
    });
    b = act(b, { type: "skill", target: elke.id });
    expect(unitById(b, elke.id)!.statuses.map((s) => s.kind)).toEqual([
      "awaken",
    ]);
  });
});

describe("방어력과 속도", () => {
  it("방어력만큼 받는 피해가 줄고, 최소 1은 들어간다", () => {
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
    expect(hitOn(0, 6)).toBe(6);
    expect(hitOn(2, 6)).toBe(4);
    expect(hitOn(9, 6)).toBe(1);
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
  const JOBS_ = [
    "knight",
    "assassin",
    "nun",
    "archer",
    "greatsword",
    "herbalist",
    "mage",
    "spiritcaller",
  ];

  it("실제 피해는 언제나 미리보기 범위 안이다 (무작위 파티·패시브·스킬 수천 번)", () => {
    let checked = 0;
    for (let seed = 0; seed < 300; seed++) {
      const r = createRng(seed);
      const RACES_ = ["human", "dwarf", "elf", "beastfolk", "barbarian"];
      const party: Merc[] = [0, 1, 2, 3].map((i) => {
        const job = JOBS_[Math.floor(r.next() * JOBS_.length)];
        const race = RACES_[Math.floor(r.next() * RACES_.length)];
        // 대표 스킬, 조합 스킬 두 개, 종족 스킬 하나
        const skills = [
          JOB_SKILL[job],
          comboId(job, race, 1),
          comboId(job, race, 2),
          skillsFrom({ race })[Math.floor(r.next() * 4)],
        ];
        return {
          ...varn,
          id: `m${i}`,
          job,
          race,
          skills,
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
          ? getSkill(ready[Math.floor(r.next() * ready.length)])!
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
        // 이 행동에서 나온 이 용병의 타격 (반격 등 나중 일은 빼고, 미리보기한 대상 수만큼)
        const hits = b.log
          .slice(before)
          .filter(
            (e): e is AttackEvent =>
              e.type === "attack" && e.actor === actor.id,
          )
          .slice(0, preview!.damage.length);
        hits.forEach((hit, i) => {
          // 미리보기는 타격 순서대로 (연타·전체 공격도)
          const p = preview!.damage[i];
          expect(p.target).toBe(hit.target);
          const total = hit.damage + (hit.absorbed ?? 0);
          const [lo, hi] = hit.crit ? [p.critMin, p.critMax] : [p.min, p.max];
          expect(
            total,
            `${actor.id} ${JSON.stringify(action)} seed ${seed}`,
          ).toBeGreaterThanOrEqual(lo);
          expect(total).toBeLessThanOrEqual(hi);
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

    const w = start([{ ...varn, job: "spiritcaller" }], 1, [dummy("e0", 999)]);
    const ward = previewAction(w, { type: "skill", target: varn.id })!;
    expect(ward).toMatchObject({
      failChance: 0.2,
      shield: { target: varn.id, amount: 6 },
    });

    const n = fix2(
      start([{ ...varn, job: "nun" }], 1, [dummy("e0", 999)]),
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
    expect(SKILLS.firelance.description).toContain("2.5배");
    expect(SKILLS.firelance.description).toContain("자기 체력 4");
    expect(SKILLS.ward.description).toContain("20% 확률로 실패");
    expect(SKILLS.volley.description).toContain("모든 적에게 3~5 피해");
  });
});

function fix2(b: Battle, id: string, patch: Partial<Unit>): Battle {
  return edit(b, (c) => Object.assign(unitById(c, id)!, patch));
}

describe("장착 슬롯", () => {
  const multi: Merc = {
    ...varn,
    job: "knight",
    skills: ["cleave", "pray", "volley", "guard", "power"],
  };

  it("최대 4칸까지 장착하고, 장착하지 않은 스킬은 쓸 수 없다", () => {
    const b = start([multi], 1, [dummy("e0", 999)]);
    expect(unitById(b, varn.id)!.skills).toEqual([
      "cleave",
      "pray",
      "volley",
      "guard",
    ]);
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
          attack: [5, 5] as const,
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

  it("호의 이상: 건네받은 물약 +25%, 손발이 맞는다와 겹친다", () => {
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
    expect(potion("warm", ["in_sync"])).toBe(23);
  });

  it("적대: 가끔(약 10%) 명령을 무시하고 아무 적이나 공격한다", () => {
    let disobeyed = 0;
    for (let seed = 0; seed < 600; seed++) {
      const units = [
        {
          ...mercUnit({ ...varn, job: "nun" }),
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
    const merc: Merc = {
      ...varn,
      job: "assassin",
      skills: ["human_resolve", "assassin_smoke"],
    };
    let b = start([merc], 1, [dummy("e0", 999)]);
    expect(
      previewAction(b, { type: "skill", skill: "human_resolve" })!.applies,
    ).toEqual([{ target: varn.id, kind: "awaken" }]);
    b = act(b, { type: "skill", skill: "human_resolve" });
    expect(hasStatus(unitById(b, varn.id)!, "awaken")).toBe(true);
    b = act(b, { type: "skill", skill: "assassin_smoke" });
    expect(b.log).toContainEqual({
      type: "shield",
      target: varn.id,
      amount: 5,
      by: varn.id,
    });
  });
});

describe("조합 스킬 변형", () => {
  const go = (merc: Merc, enemies: Unit[], seed = 1) =>
    start([merc], seed, enemies);

  it("수인 연타: 같은 대상을 두 번, 각 60%", () => {
    const id = comboId("knight", "beastfolk", 1); // 막아서기는 피해가 없으니 회복·보호막 변형이 된다
    expect(getSkill(id)!.name).toContain("막아서기");
    const pierce2 = comboId("assassin", "beastfolk", 1);
    const b = act(
      go({ ...varn, job: "assassin", race: "beastfolk", skills: [pierce2] }, [
        dummy("e0", 999),
      ]),
      { type: "skill", skill: pierce2, target: "e0" },
    );
    expect(
      b.log.filter((e) => e.type === "attack" && e.actor === varn.id),
    ).toHaveLength(2);
    expect(
      previewAction(
        go({ ...varn, job: "assassin", race: "beastfolk", skills: [pierce2] }, [
          dummy("e0", 999),
        ]),
        { type: "skill", skill: pierce2, target: "e0" },
      )!.damage,
    ).toHaveLength(2);
  });

  it("수인 사냥: 처치하면 그 스킬을 바로 다시 쓸 수 있다", () => {
    const id = comboId("greatsword", "beastfolk", 2);
    let b = go(
      { ...varn, job: "greatsword", race: "beastfolk", skills: [id] },
      [dummy("e0", 1), dummy("e1", 999)],
    );
    b = act(b, { type: "skill", skill: id, target: "e0" });
    expect(b.log.some((e) => e.type === "refresh")).toBe(true);
    expect(validate(b, { type: "skill", skill: id, target: "e1" })).toBeNull();
  });

  it("인간 지원: 아군 스킬은 대상의 옆 아군도 절반 받는다", () => {
    const id = comboId("nun", "human", 1);
    let b = start(
      [{ ...elke, job: "nun", race: "human", skills: [id] }, varn, kass],
      1,
      [dummy("e0", 999)],
    );
    b = edit(b, (c) => c.units.forEach((u) => u.side === "merc" && (u.hp = 5)));
    b = act(b, { type: "skill", skill: id, target: varn.id }); // 바른의 옆: 엘케, 카스
    const heals = b.log.filter((e) => e.type === "heal" && e.by === elke.id);
    expect(
      heals.map((e) => (e.type === "heal" ? [e.target, e.amount] : null)),
    ).toEqual([
      [varn.id, 8],
      [elke.id, 4],
      [kass.id, 4],
    ]);
  });

  it("드워프 버팀: 방어 +2 / 엘프 선제: 다음 라운드에 맨 먼저", () => {
    const brace = comboId("archer", "dwarf", 2);
    let b = start(
      [{ ...varn, job: "archer", race: "dwarf", skills: [brace] }],
      1,
      [dummy("e0", 999, { attack: [6, 6] })],
    );
    b = act(b, { type: "skill", skill: brace });
    const hit = b.log.find((e) => e.type === "attack" && e.actor === "e0");
    if (hit?.type === "attack" && !hit.crit) expect(hit.damage).toBe(4);

    const haste = comboId("archer", "elf", 1);
    let h = start(
      [varn, { ...kass, job: "archer", race: "elf", skills: [haste] }],
      1,
      [dummy("e0", 999)],
    );
    h = act(h, { type: "attack", target: "e0" });
    h = act(h, { type: "skill", skill: haste });
    expect(h.order[0]).toBe(kass.id);
  });

  it("바바리안 광기는 위력 +80%와 자기 체력 -3, 드워프 강화는 대기 +1", () => {
    const frenzy = getSkill(comboId("mage", "barbarian", 1))!;
    expect(frenzy.effects).toContainEqual({ kind: "selfCost", hp: 3 });
    expect(frenzy.effects.find((e) => e.kind === "damage")).toMatchObject({
      multiplier: 4.5,
    });
    expect(getSkill(comboId("mage", "dwarf", 1))!.cooldown).toBe(
      SKILLS.firelance.cooldown + 1,
    );
  });
});

describe("용병형 적", () => {
  it("용병 데이터로 적을 만들 수 있고, 적도 스킬과 패시브를 쓴다", () => {
    const raider = mercenaryEnemy(
      {
        ...kass,
        job: "greatsword",
        race: "barbarian",
        skills: ["cleave", "barb_frenzy"],
        passives: ["blood_thirst"],
      },
      "e0",
    );
    expect(raider).toMatchObject({
      side: "enemy",
      skills: ["cleave", "barb_frenzy"],
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

describe("빈사와 죽음", () => {
  /** 바른은 체력 1, 적은 공격력 5로 바로 쓰러뜨린다. 엘케가 함께 있어 전투가 이어진다 */
  const setup = (seed: number, bond?: Unit["bond"]) => {
    let b = start([varn, elke], seed, [dummy("e0", 999, { attack: [5, 5] })]);
    b = edit(b, (c) => {
      const v = unitById(c, varn.id)!;
      v.hp = 1;
      v.bond = bond;
      unitById(c, elke.id)!.hp = 999;
      unitById(c, elke.id)!.maxHp = 999;
    });
    return b;
  };
  /** 적이 바른을 칠 때까지 진행 */
  const untilDying = (b: Battle) => {
    for (let i = 0; i < 20 && !unitById(b, varn.id)!.dying; i++) {
      const actor = currentActor(b);
      if (!actor) break;
      b = act(b, { type: "attack", target: "e0" });
    }
    return b;
  };

  it("체력 0이 되면 죽지 않고 빈사로 쓰러진다", () => {
    const b = untilDying(setup(1));
    // 적의 차례에 쓰러지면, 다음 용병 차례가 올 때는 다음 라운드가 시작되어 1라운드가 남는다
    expect(unitById(b, varn.id)!).toMatchObject({ hp: 0, dying: 1 });
    expect(b.log).toContainEqual({ type: "dying", target: varn.id, rounds: 2 });
  });

  it("길안내자가 물약이나 붕대로 일으킬 수 있다 (해독제는 안 된다)", () => {
    const b = untilDying(setup(1));
    expect(
      validate(b, { type: "guide", item: "antidote", target: varn.id }),
    ).toBe("건넬 수 없는 대상");
    const p = act(b, { type: "guide", item: "potion", target: varn.id });
    expect(unitById(p, varn.id)!.hp).toBe(12);
    expect(unitById(p, varn.id)!.dying).toBeUndefined();
    expect(p.log.some((e) => e.type === "rescue")).toBe(true);
    const g = act(b, { type: "guide", item: "bandage", target: varn.id });
    expect(unitById(g, varn.id)!.hp).toBe(3);
  });

  it("구하지 못하면 2라운드 뒤 생존 판정. 신뢰가 깊을수록 잘 버틴다", () => {
    const deathRate = (bond: Unit["bond"]) => {
      let died = 0;
      for (let seed = 0; seed < 300; seed++) {
        let b = untilDying(setup(seed, bond));
        for (
          let i = 0;
          i < 30 &&
          !b.outcome &&
          !b.log.some(
            (e) =>
              (e.type === "death" || e.type === "survive") &&
              e.target === varn.id,
          );
          i++
        ) {
          b = act(b, { type: "attack", target: "e0" });
        }
        if (unitById(b, varn.id)!.dead) died++;
      }
      return died / 300;
    };
    const hostile = deathRate("hostile");
    const trusted = deathRate("trusted");
    expect(hostile).toBeGreaterThan(0.6); // 생존 25%
    expect(trusted).toBeLessThan(0.4); // 생존 75%
  });

  it("죽은 용병은 물자를 받을 수 없다", () => {
    let b = untilDying(setup(1));
    b = edit(b, (c) => {
      const v = unitById(c, varn.id)!;
      v.dead = true;
      v.dying = undefined;
    });
    expect(
      validate(b, { type: "guide", item: "potion", target: varn.id }),
    ).toBe("건넬 수 없는 대상");
  });

  it("생존 확률: 기본 50%, 호감·종족·등급으로 오르내리고 5~95% 안", () => {
    expect(survivalChance({})).toBe(0.5);
    expect(
      survivalChance({ bond: "trusted", race: "barbarian", level: "legend" }),
    ).toBe(0.95);
    expect(survivalChance({ bond: "hostile", race: "elf" })).toBeCloseTo(0.2);
  });
});

describe("성장 스탯", () => {
  it("체력·방어·속도는 능력치에, 힘·마법·신성은 위력에, 치명·회피는 확률에 더해진다", () => {
    const u = mercUnit({ ...varn, job: "knight", stats: { hp: 2, defense: 1, speed: 3, str: 2, mag: 1, faith: 4, crit: 5, evade: 2 } });
    expect(u).toMatchObject({ maxHp: 32 + 6, hp: 38, defense: 2 + 1, speed: 4 + 3, power: { str: 2, mag: 1, faith: 4 } });
    expect(u.critBonus).toBeCloseTo(0.1);
    expect(u.evadeBonus).toBeCloseTo(0.04);
  });

  it("힘은 기본 공격에, 마법은 마법 기술에만 더해진다", () => {
    const mage: Merc = { ...varn, job: "mage", stats: { str: 2, mag: 5 } };
    const b = start([mage], 1, [dummy("e0", 999)]);
    const plain = start([{ ...varn, job: "mage" }], 1, [dummy("e0", 999)]);
    const atk = previewAction(b, { type: "attack", target: "e0" })!.damage[0];
    const base = previewAction(plain, { type: "attack", target: "e0" })!.damage[0];
    expect(atk.min).toBe(base.min + 2);
    const fire = previewAction(b, { type: "skill", skill: "firelance", target: "e0" })!.damage[0];
    const fireBase = previewAction(plain, { type: "skill", skill: "firelance", target: "e0" })!.damage[0];
    expect(fire.min).toBe(fireBase.min + 5);
  });

  it("신성은 회복량을 올린다", () => {
    const nun = (faith: number) => fix2(start([{ ...varn, job: "nun", stats: { faith } }], 1, [dummy("e0", 999)]), varn.id, { hp: 1 });
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
