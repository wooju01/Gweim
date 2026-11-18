import { describe, expect, it } from "vitest";
import { POTION_HEAL, START_SUPPLIES, STATUS } from "../../data/combat";
import { TEST_MERCS } from "../../test/fixtures";
import type { Merc } from "../types";
import {
  act,
  currentActor,
  living,
  startBattle,
  unitById,
  validate,
  type Battle,
  type BattleAction,
  type Unit,
} from "./engine";
import { SKILLS } from "../../data/combat";
import { describe as describeEvent, josa } from "./text";

/** 밸런스 측정용 단순 정책: 출혈이면 붕대, 스킬이 준비되면 스킬, 아니면 가장 약한 적 공격 */
function simplePolicy(b: Battle, actor: Unit): BattleAction {
  const weakest = [...living(b, "enemy")].sort((x, y) => x.hp - y.hp)[0].id;
  if (actor.statuses.some((s) => s.kind === "bleed") && b.supplies.bandage > 0) return { type: "bandage" };
  if (actor.skill && actor.cooldown === 0) {
    const kind = SKILLS[actor.skill].target;
    if (kind === "none") return { type: "skill" };
    if (kind === "enemy") return { type: "skill", target: weakest };
    const hurt = [...living(b, "merc")].sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
    if (hurt.hp < hurt.maxHp * 0.7) return { type: "skill", target: hurt.id };
  }
  return { type: "attack", target: weakest };
}

const [varn, kass, elke] = TEST_MERCS;
const party: Merc[] = [
  { ...varn, job: "spearman" },
  { ...kass, job: "dagger" },
  { ...elke, job: "nun" },
];

/** 테스트용 고정 적: 공격력이 낮아 금방 끝나지 않는다 */
function dummy(id: string, hp = 30, overrides: Partial<Unit> = {}): Unit {
  return { id, side: "enemy", name: "허수아비", title: "", hp, maxHp: hp, attack: [1, 1], statuses: [], cooldown: 0, guarding: false, ...overrides };
}

/** 상태를 손으로 고친 복사본 */
function edit(b: Battle, fn: (b: Battle) => void): Battle {
  const copy = structuredClone(b);
  fn(copy);
  return copy;
}

describe("시작", () => {
  it("첫 라운드, 첫 용병 차례에서 시작한다", () => {
    const b = startBattle(party, 1, [dummy("e0")]);
    expect(b.round).toBe(1);
    expect(currentActor(b)?.id).toBe(varn.id);
    expect(b.log[0]).toEqual({ type: "round", round: 1 });
    expect(b.supplies).toEqual(START_SUPPLIES);
  });

  it("직업에 따라 체력이 다르다", () => {
    const b = startBattle(party, 1, [dummy("e0")]);
    expect(unitById(b, varn.id)!.maxHp).toBe(32); // 창병
    expect(unitById(b, kass.id)!.maxHp).toBe(24); // 단검수
  });

  it("같은 시드면 같은 적과 같은 결과", () => {
    const play = (seed: number) => {
      let b = startBattle(party, seed);
      for (let i = 0; i < 30 && !b.outcome; i++) b = act(b, { type: "attack", target: living(b, "enemy")[0].id });
      return b.log;
    };
    expect(play(99)).toEqual(play(99));
  });
});

describe("용병 행동", () => {
  it("공격하면 적 체력이 줄고 다음 용병 차례로 넘어간다", () => {
    const b = startBattle(party, 1, [dummy("e0")]);
    const next = act(b, { type: "attack", target: "e0" });
    expect(unitById(next, "e0")!.hp).toBeLessThan(30);
    expect(next.log.at(-1)).toMatchObject({ type: "attack", actor: varn.id, target: "e0" });
    expect(currentActor(next)?.id).toBe(kass.id);
  });

  it("원본 상태는 바뀌지 않는다", () => {
    const b = startBattle(party, 1, [dummy("e0")]);
    const before = JSON.stringify(b);
    act(b, { type: "attack", target: "e0" });
    expect(JSON.stringify(b)).toBe(before);
  });

  it("용병이 모두 행동하면 적이 자동으로 행동하고 다음 라운드가 된다", () => {
    let b = startBattle(party, 1, [dummy("e0", 999)]);
    for (let i = 0; i < 3; i++) b = act(b, { type: "attack", target: "e0" });
    expect(b.round).toBe(2);
    expect(currentActor(b)?.id).toBe(varn.id);
    expect(b.log.some((e) => e.type === "attack" && e.actor === "e0")).toBe(true);
  });

  it("붕대: 출혈이 있어야 쓸 수 있고, 물자를 쓰고 출혈을 멈춘다", () => {
    const b = startBattle(party, 1, [dummy("e0")]);
    expect(validate(b, { type: "bandage" })).toBe("출혈이 없다");

    const bleeding = edit(b, (x) => unitById(x, varn.id)!.statuses.push({ kind: "bleed", turns: 3 }));
    const next = act(bleeding, { type: "bandage" });
    expect(unitById(next, varn.id)!.statuses).toEqual([]);
    expect(next.supplies.bandage).toBe(START_SUPPLIES.bandage - 1);
    expect(currentActor(next)?.id).toBe(kass.id); // 붕대도 턴을 쓴다
  });

  it("할 수 없는 행동은 무시된다", () => {
    const b = startBattle(party, 1, [dummy("e0")]);
    expect(act(b, { type: "attack", target: varn.id })).toBe(b); // 아군 공격
    expect(act(b, { type: "attack", target: "nope" })).toBe(b);
  });
});

describe("길안내자 보조", () => {
  it("라운드에 한 번만, 그리고 용병 차례를 넘기지 않는다", () => {
    const b = edit(startBattle(party, 1, [dummy("e0")]), (x) => {
      unitById(x, kass.id)!.hp = 5;
    });
    const healed = act(b, { type: "guide", item: "potion", target: kass.id });
    expect(unitById(healed, kass.id)!.hp).toBe(5 + POTION_HEAL);
    expect(currentActor(healed)?.id).toBe(varn.id);
    expect(validate(healed, { type: "guide", item: "potion", target: kass.id })).toBe("이번 라운드에는 이미 도왔다");
  });

  it("다음 라운드가 되면 다시 도울 수 있다", () => {
    let b = act(
      edit(startBattle(party, 1, [dummy("e0", 999)]), (x) => (unitById(x, kass.id)!.hp = 5)),
      { type: "guide", item: "potion", target: kass.id },
    );
    for (let i = 0; i < 3; i++) b = act(b, { type: "attack", target: "e0" });
    expect(b.guideUsed).toBe(false);
  });

  it("물약은 최대 체력을 넘기지 않는다", () => {
    const b = edit(startBattle(party, 1, [dummy("e0")]), (x) => (unitById(x, varn.id)!.hp -= 3));
    const next = act(b, { type: "guide", item: "potion", target: varn.id });
    expect(unitById(next, varn.id)!.hp).toBe(unitById(next, varn.id)!.maxHp);
    expect(next.log.at(-1)).toMatchObject({ type: "heal", amount: 3 });
  });

  it("해독제는 중독에만, 붕대는 출혈에만", () => {
    const b = startBattle(party, 1, [dummy("e0")]);
    expect(validate(b, { type: "guide", item: "antidote", target: elke.id })).toBe("중독이 없다");
    expect(validate(b, { type: "guide", item: "bandage", target: elke.id })).toBe("출혈이 없다");
    expect(validate(b, { type: "guide", item: "potion", target: elke.id })).toBe("체력이 가득하다");

    const poisoned = edit(b, (x) => unitById(x, elke.id)!.statuses.push({ kind: "poison", turns: 4 }));
    const next = act(poisoned, { type: "guide", item: "antidote", target: elke.id });
    expect(unitById(next, elke.id)!.statuses).toEqual([]);
    expect(next.supplies.antidote).toBe(START_SUPPLIES.antidote - 1);
  });

  it("물자가 떨어지면 쓸 수 없다", () => {
    const b = edit(startBattle(party, 1, [dummy("e0")]), (x) => {
      x.supplies.potion = 0;
      unitById(x, varn.id)!.hp = 1;
    });
    expect(validate(b, { type: "guide", item: "potion", target: varn.id })).toBe("물자가 없다");
  });
});

describe("상태이상", () => {
  it("턴 시작에 피해를 주고, 지속 시간이 끝나면 사라진다", () => {
    let b = edit(startBattle(party, 1, [dummy("e0", 999)]), (x) => {
      unitById(x, kass.id)!.statuses.push({ kind: "poison", turns: 1 });
    });
    const hpBefore = unitById(b, kass.id)!.hp;
    b = act(b, { type: "attack", target: "e0" }); // 바른 → 카스 차례 시작, 중독 피해
    expect(unitById(b, kass.id)!.hp).toBe(hpBefore - STATUS.poison.damage);
    expect(unitById(b, kass.id)!.statuses).toEqual([]);
    expect(b.log).toContainEqual({ type: "tick", target: kass.id, kind: "poison", damage: STATUS.poison.damage });
  });

  it("상태이상으로 쓰러지면 그 턴은 건너뛴다", () => {
    let b = edit(startBattle(party, 1, [dummy("e0", 999)]), (x) => {
      const k = unitById(x, kass.id)!;
      k.hp = 1;
      k.statuses.push({ kind: "bleed", turns: 3 });
    });
    b = act(b, { type: "attack", target: "e0" });
    expect(unitById(b, kass.id)!.hp).toBe(0);
    expect(b.log).toContainEqual({ type: "down", target: kass.id });
    expect(currentActor(b)?.id).toBe(elke.id);
  });

  it("단검수의 공격은 출혈을 걸 수 있다", () => {
    let seenBleed = false;
    for (let seed = 0; seed < 50 && !seenBleed; seed++) {
      let b = startBattle(party, seed, [dummy("e0", 999)]);
      b = act(b, { type: "attack", target: "e0" }); // 바른
      b = act(b, { type: "attack", target: "e0" }); // 카스(단검수)
      seenBleed = b.log.some((e) => e.type === "status" && e.target === "e0" && e.kind === "bleed");
    }
    expect(seenBleed).toBe(true);
  });
});

describe("승패", () => {
  it("적을 모두 쓰러뜨리면 승리", () => {
    const b = act(startBattle(party, 1, [dummy("e0", 1)]), { type: "attack", target: "e0" });
    expect(b.outcome).toBe("victory");
    expect(b.log.at(-1)).toEqual({ type: "end", outcome: "victory" });
    expect(currentActor(b)).toBeNull();
    expect(validate(b, { type: "attack", target: "e0" })).toBe("전투가 끝났다");
  });

  it("용병이 모두 쓰러지면 패배", () => {
    let b = edit(startBattle(party, 1, [dummy("e0", 999, { attack: [99, 99] })]), (x) => {
      for (const u of living(x, "merc")) u.hp = 1;
    });
    // 적 하나는 라운드마다 한 명씩만 공격하므로 여러 라운드가 걸린다
    for (let i = 0; i < 30 && !b.outcome; i++) b = act(b, { type: "attack", target: "e0" });
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
        if (hurt && !b.guideUsed && b.supplies.potion > 0) b = act(b, { type: "guide", item: "potion", target: hurt.id });
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
  /** 막아서기를 확인하려고 바른(창병)이 아닌 순서도 필요해 직업을 바꿔 가며 쓴다 */
  const withJob = (job: string): Merc[] => [{ ...varn, job }, { ...kass, job: "dagger" }, { ...elke, job: "nun" }];

  it("직업마다 스킬이 정해지고, 직업이 없으면 전력 공격", () => {
    const b = startBattle([...party, { ...varn, id: "nojob", job: undefined }], 1, [dummy("e0")]);
    expect(unitById(b, varn.id)!.skill).toBe("guard");
    expect(unitById(b, kass.id)!.skill).toBe("pierce");
    expect(unitById(b, elke.id)!.skill).toBe("pray");
    expect(unitById(b, "nojob")!.skill).toBe("power");
  });

  it("쓰고 나면 대기 시간이 생기고, 자기 턴이 지나면 다시 쓸 수 있다", () => {
    let b = startBattle(withJob("greatsword"), 1, [dummy("e0", 999)]);
    b = act(b, { type: "skill", target: "e0" });
    expect(b.log.some((e) => e.type === "skill" && e.skill === "cleave")).toBe(true);
    // 다음 라운드까지 진행
    b = act(b, { type: "attack", target: "e0" });
    b = act(b, { type: "attack", target: "e0" });
    expect(validate(b, { type: "skill", target: "e0" })).toBe("1턴 뒤에 쓸 수 있다");
    for (let i = 0; i < 3; i++) b = act(b, { type: "attack", target: "e0" });
    expect(validate(b, { type: "skill", target: "e0" })).toBeNull();
  });

  it("대상 규칙: 기도는 아군에게만, 막아서기는 대상 없이", () => {
    const nunFirst = startBattle([{ ...elke, job: "nun" }, ...party.slice(0, 2)], 1, [dummy("e0")]);
    expect(validate(nunFirst, { type: "skill", target: "e0" })).toBe("아군에게만 쓸 수 있다");
    expect(validate(nunFirst, { type: "skill" })).toBe("대상을 골라야 한다");

    const spearFirst = startBattle(party, 1, [dummy("e0")]);
    expect(validate(spearFirst, { type: "skill", target: "e0" })).toBe("대상을 고르지 않는 스킬");
    expect(validate(spearFirst, { type: "skill" })).toBeNull();
  });

  it("막아서기: 적이 막아선 용병만 공격하고, 피해가 절반이 된다", () => {
    let b = startBattle(party, 1, [dummy("e0", 999, { attack: [10, 10] }), dummy("e1", 999, { attack: [10, 10] })]);
    b = act(b, { type: "skill" }); // 바른 막아서기
    b = act(b, { type: "attack", target: "e0" });
    b = act(b, { type: "attack", target: "e0" }); // 적 턴 진행
    const enemyHits = b.log.filter((e) => e.type === "attack" && ["e0", "e1"].includes(e.actor));
    expect(enemyHits.length).toBe(2);
    for (const hit of enemyHits) {
      expect(hit).toMatchObject({ target: varn.id });
      expect([5, 8]).toContain((hit as { damage: number }).damage); // 10의 절반, 치명타면 15의 절반 올림
    }
  });

  it("막아서기는 자기 다음 차례에 풀린다", () => {
    let b = startBattle(party, 1, [dummy("e0", 999)]);
    b = act(b, { type: "skill" });
    expect(unitById(b, varn.id)!.guarding).toBe(true);
    b = act(b, { type: "attack", target: "e0" });
    b = act(b, { type: "attack", target: "e0" });
    expect(currentActor(b)?.id).toBe(varn.id);
    expect(unitById(b, varn.id)!.guarding).toBe(false);
  });

  it("급소 찌르기: 살아남은 대상에게 반드시 출혈", () => {
    let b = startBattle([{ ...kass, job: "dagger" }, ...party.slice(0, 1)], 1, [dummy("e0", 999)]);
    b = act(b, { type: "skill", target: "e0" });
    expect(hasBleed(b, "e0")).toBe(true);
  });

  it("기도: 아군 체력 회복과 상태이상 해제, 자신에게도 쓸 수 있다", () => {
    const b = edit(startBattle([{ ...elke, job: "nun" }, ...party.slice(0, 2)], 1, [dummy("e0")]), (x) => {
      const me = unitById(x, elke.id)!;
      me.hp = 10;
      me.statuses.push({ kind: "bleed", turns: 3 }, { kind: "poison", turns: 4 });
    });
    const next = act(b, { type: "skill", target: elke.id });
    // 기도 직후 다음 용병 차례로 넘어간다. 엘케 체력은 10 + 8
    expect(unitById(next, elke.id)!.hp).toBe(18);
    expect(unitById(next, elke.id)!.statuses).toEqual([]);
    const text = describeEvent(next.log.find((e) => e.type === "skill")!, next);
    expect(text).toBe("엘케가 자신에게 기도를 썼다.");
  });

  it("화살비: 모든 적이 피해를 입는다", () => {
    let b = startBattle(withJob("archer"), 1, [dummy("e0", 999), dummy("e1", 999), dummy("e2", 999)]);
    b = act(b, { type: "skill" });
    for (const id of ["e0", "e1", "e2"]) expect(unitById(b, id)!.hp).toBeLessThan(999);
  });

  it("내려찍기: 반동을 받지만 반동으로 쓰러지지는 않는다", () => {
    const b = edit(startBattle(withJob("greatsword"), 1, [dummy("e0", 999)]), (x) => (unitById(x, varn.id)!.hp = 2));
    const next = act(b, { type: "skill", target: "e0" });
    expect(next.log).toContainEqual({ type: "recoil", target: varn.id, damage: 1 });
    expect(unitById(next, varn.id)!.hp).toBeGreaterThanOrEqual(1);
  });

  it("독안개: 모든 적이 중독된다", () => {
    const b = act(startBattle(withJob("herbalist"), 1, [dummy("e0", 999), dummy("e1", 999)]), { type: "skill" });
    for (const id of ["e0", "e1"]) {
      expect(b.log).toContainEqual({ type: "status", target: id, kind: "poison" });
    }
  });
});

function hasBleed(b: Battle, id: string): boolean {
  return b.log.some((e) => e.type === "status" && e.target === id && e.kind === "bleed");
}

describe("전투 문장", () => {
  it("받침에 맞게 조사를 붙인다", () => {
    expect(josa("바른", "이", "가")).toBe("바른이");
    expect(josa("카스", "이", "가")).toBe("카스가");
    expect(josa("잿빛 쥐떼 A", "이", "가")).toBe("잿빛 쥐떼 A가");
  });

  it("이벤트를 문장으로 바꾼다", () => {
    const b = startBattle(party, 1, [dummy("e0")]);
    expect(describeEvent({ type: "attack", actor: varn.id, target: "e0", damage: 7, crit: true }, b)).toBe(
      "바른이 허수아비를 공격했다. 7 피해 (치명타!)",
    );
    expect(describeEvent({ type: "tick", target: kass.id, kind: "bleed", damage: 3 }, b)).toBe(
      "카스가 출혈로 3 피해를 입었다.",
    );
    expect(describeEvent({ type: "tick", target: kass.id, kind: "poison", damage: 2 }, b)).toBe(
      "카스가 중독으로 2 피해를 입었다.",
    );
  });
});
