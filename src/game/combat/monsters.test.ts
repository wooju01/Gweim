import { describe, expect, it } from "vitest";
import { TEST_MERCS } from "@/test/fixtures";
import { ELITE_TRAITS, MAX_ENEMIES, MONSTERS, getMonster } from "@/data/monsters";
import { getRegion } from "@/data/regions";
import { createRng } from "@/game/random";
import { planGoal } from "@/game/dungeon/expedition";
import { getSkill } from "@/game/skills";
import { act, bossEncounter, currentActor, enemyUnit, living, makeElite, mercUnit, rollEncounter, startBattleWithUnits, strikeFactors, type Battle, type Unit } from "./engine";
import { describe as describeEvent } from "./text";

/** 공격력이 아주 센 용병 하나 (한 방에 쓰러뜨린다). hp를 넉넉히 */
function hero(id = "h", attack: readonly [number, number] = [200, 200]): Unit {
  return { ...mercUnit({ ...TEST_MERCS[0], id }), attack, maxHp: 500, hp: 500, speed: 99 };
}
const mob = (kind: string, id: string, patch: Partial<Unit> = {}): Unit => ({ ...enemyUnit(getMonster(kind)!, id), ...patch });

/** 용병 차례마다 target(없으면 첫 살아 있는 적)을 친다 */
function hit(b: Battle, target?: string): Battle {
  const t = target ?? living(b, "enemy")[0].id;
  return act(b, { type: "attack", target: t });
}

describe("몬스터 데이터", () => {
  it("스킬·소환 대상은 모두 있는 것이고, 전투 문장이 나온다", () => {
    for (const m of MONSTERS) {
      for (const s of m.skills ?? []) expect(getSkill(s), `${m.id}: ${s}`).toBeDefined();
      for (const a of m.abilities ?? []) if ("into" in a) expect(getMonster(a.into), a.into).toBeDefined();
    }
  });
});

describe("몬스터 능력", () => {
  it("분열 슬라임은 쓰러지면 작은 슬라임 둘로 갈라지고, 전투는 끝나지 않는다", () => {
    let b = startBattleWithUnits([hero(), mob("split_slime", "e0")], 1);
    b = hit(b, "e0");
    expect(b.outcome).toBeNull();
    const kids = living(b, "enemy");
    expect(kids.map((u) => u.kind)).toEqual(["slimelet", "slimelet"]);
    expect(b.log.filter((e) => e.type === "spawn")).toHaveLength(2);
    expect(b.log.filter((e) => e.type === "spawn").map((e) => describeEvent(e, b))[0]).toContain("떨어져 나왔다");
  });

  it("알 주머니는 공격하지 않고, 두 번째 차례에 동굴 거미로 부화한다", () => {
    // 용병은 약하게 (알을 깨지 못하게)
    let b = startBattleWithUnits([hero("h", [1, 1]), mob("egg_sac", "e0", { hp: 999, maxHp: 999 })], 2);
    for (let i = 0; i < 6 && !b.log.some((e) => e.type === "spawn"); i++) b = hit(b, "e0");
    expect(b.log.some((e) => e.type === "attack" && e.actor === "e0")).toBe(false);
    expect(living(b, "enemy").map((u) => u.kind)).toEqual(["cave_spider"]);
    expect(b.units.find((u) => u.id === "e0")!.hp).toBe(0);
  });

  it("속박된 유닛은 다음 차례를 쉬고 풀린다", () => {
    const bound = { ...hero(), statuses: [{ kind: "bind" as const, turns: 1 }] };
    const b = startBattleWithUnits([bound, mob("goblin_grunt", "e0")], 3);
    expect(b.log.some((e) => e.type === "bound" && e.target === "h")).toBe(true);
    // 다음 라운드에는 자기 차례가 온다
    expect(currentActor(b)?.id).toBe("h");
    expect(b.units.find((u) => u.id === "h")!.statuses.some((s) => s.kind === "bind")).toBe(false);
  });

  it("거미 여왕의 거미줄은 속박을 건다", () => {
    expect(getSkill("m_web")!.effects).toEqual([{ kind: "applyStatus", status: "bind" }]);
    expect(getSkill("m_web")!.description).toContain("속박");
  });

  it("늑대 조련사는 늑대가 쓰러지면 한 번만 다시 부른다", () => {
    let b = startBattleWithUnits([hero(), mob("wolf_tamer", "e0", { hp: 999, maxHp: 999 }), mob("cave_wolf", "e1")], 4);
    b = hit(b, "e1");
    const wolves = () => living(b, "enemy").filter((u) => u.kind === "cave_wolf");
    expect(wolves()).toHaveLength(1);
    b = hit(b, wolves()[0].id);
    expect(wolves()).toHaveLength(0);
  });

  it("우두머리 늑대: 곁의 짐승 하나당 공격 +1, 체력이 절반 아래면 늑대 둘을 부른다 (한 번)", () => {
    const units = [hero("h", [60, 60]), ...bossEncounter("alpha_wolf")];
    let b = startBattleWithUnits(units, 5);
    const boss = () => b.units.find((u) => u.kind === "alpha_wolf")!;
    expect(strikeFactors(b, boss(), b.units[0]).bonus).toBe(2);
    const before = living(b, "enemy").length;
    b = hit(b, boss().id); // 75 → 15
    expect(living(b, "enemy").length).toBe(before + 2);
  });

  it("광폭: 체력이 절반 아래면 공격 +3", () => {
    const b = startBattleWithUnits([hero(), mob("orc_berserker", "e0")], 6);
    const orc = b.units.find((u) => u.id === "e0")!;
    expect(strikeFactors(b, orc, b.units[0]).bonus).toBe(0);
    orc.hp = 10;
    expect(strikeFactors(b, orc, b.units[0]).bonus).toBe(3);
  });

  it("슬라임 킹은 체력이 3분의 1씩 줄 때마다 분열하고, 적은 MAX_ENEMIES를 넘지 않는다", () => {
    let b = startBattleWithUnits([hero("h", [35, 35]), ...bossEncounter("slime_king")], 7);
    const king = () => b.units.find((u) => u.kind === "slime_king")!;
    b = hit(b, king().id); // 90 → 55 (0.61)
    expect(b.units.filter((u) => u.kind === "split_slime")).toHaveLength(1);
    b = hit(b, king().id); // → 20 (0.22)
    expect(b.units.filter((u) => u.kind === "split_slime")).toHaveLength(2);
    expect(living(b, "enemy").length).toBeLessThanOrEqual(MAX_ENEMIES);
  });
});

describe("정예", () => {
  it("정예 특성은 이름 앞에 붙고 수치를 바꾼다", () => {
    const base = mob("goblin_grunt", "e0");
    const swift = makeElite(base, ELITE_TRAITS.find((t) => t.id === "swift")!);
    expect(swift).toMatchObject({ name: "재빠른 고블린 졸개", rank: "elite", speed: base.speed + 3, evadeBonus: 0.1 });
    const frenzied = makeElite(base, ELITE_TRAITS.find((t) => t.id === "frenzied")!);
    expect(frenzied.attack).toEqual([base.attack[0] + 3, base.attack[1] + 3]);
    expect(frenzied.defense).toBe(0); // 0 아래로는 내려가지 않는다
  });

  it("우두머리 정예 곁의 같은 종류 아군은 공격 +1", () => {
    const leader = makeElite(mob("goblin_grunt", "e0"), ELITE_TRAITS.find((t) => t.id === "leader")!);
    const b = startBattleWithUnits([hero(), leader, mob("goblin_grunt", "e1"), mob("forest_rat", "e2")], 8);
    const [, l, grunt, rat] = b.units;
    expect(strikeFactors(b, grunt, b.units[0]).bonus).toBe(1);
    expect(strikeFactors(b, rat, b.units[0]).bonus).toBe(0);
    expect(strikeFactors(b, l, b.units[0]).bonus).toBe(0);
  });

  it("정예 확률이 있는 지역에서는 가끔 정예가 섞인다", () => {
    const region = getRegion("uf_orc_village")!;
    let elites = 0;
    let total = 0;
    for (let seed = 0; seed < 300; seed++) {
      const units = rollEncounter(createRng(seed), region);
      total += units.length;
      elites += units.filter((u) => u.rank === "elite").length;
    }
    expect(elites / total).toBeGreaterThan(region.eliteChance * 0.6);
    expect(elites / total).toBeLessThan(region.eliteChance * 1.4);
    // 입문 지역은 정예 확률이 0이다 (종 자체가 정예인 황금 숲 쥐만 가끔 나온다)
    for (let seed = 0; seed < 100; seed++)
      for (const u of rollEncounter(createRng(seed), getRegion("uf_forest")!)) if (u.rank === "elite") expect(u.kind).toBe("golden_rat");
  });
});

describe("목적지 보스", () => {
  it("보스 확률에 맞게 목적지에 놓이고, 안 나오면 보물이나 정예. force면 반드시 그 보스", () => {
    const region = getRegion("uf_deep_forest")!; // 나무 거인, 중간 층 확률
    const kinds = { boss: 0, treasure: 0, elite: 0 };
    for (let seed = 0; seed < 600; seed++) {
      const goal = planGoal(region, seed);
      kinds[goal.kind]++;
      if (goal.kind === "boss") expect(goal.id).toBe("tree_giant");
    }
    expect(kinds.boss / 600).toBeGreaterThan(region.boss!.chance - 0.07);
    expect(kinds.boss / 600).toBeLessThan(region.boss!.chance + 0.07);
    expect(kinds.treasure).toBeGreaterThan(0);
    expect(kinds.elite).toBeGreaterThan(0);
    // 보스가 없는 지역은 보물이나 정예
    expect(planGoal(getRegion("uf_forest")!, 1).kind).not.toBe("boss");
    expect(planGoal(getRegion("uf_forest")!, 1, "goblin_glutton")).toEqual({ kind: "boss", id: "goblin_glutton" });
    // 끝 지역 보스는 확정
    for (let seed = 0; seed < 50; seed++) expect(planGoal(getRegion("uf_goblin_village")!, seed)).toEqual({ kind: "boss", id: "goblin_king" });
  });

  it("히든 보스는 확정이고, 가중치 0인 후보(타락한 엘프 여왕)는 나오지 않는다", () => {
    for (let seed = 0; seed < 100; seed++) expect(planGoal(getRegion("uf_corrupted_forest")!, seed)).toEqual({ kind: "boss", id: "corrupted_spirit_king" });
  });

  it("정예 목적지 전투는 반드시 정예가 하나 이상", () => {
    for (let seed = 0; seed < 50; seed++) expect(rollEncounter(createRng(seed), getRegion("uf_forest")!, 1).some((u) => u.rank === "elite")).toBe(true);
  });

  it("나무 거인은 차례마다 체력을 되찾는다", () => {
    let b = startBattleWithUnits([hero("h", [1, 1]), mob("tree_giant", "e0", { hp: 50 })], 1);
    b = hit(b, "e0");
    expect(b.log.some((e) => e.type === "heal" && e.target === "e0" && e.amount === 4)).toBe(true);
  });
});

describe("미지의 숲 추가 몬스터", () => {
  it("황금 숲 쥐: 두 번째 차례에 달아나고, 달아나면 처치 보상이 없다. 잡으면 현상금", () => {
    let b = startBattleWithUnits([hero("h", [1, 1]), mob("golden_rat", "e0", { hp: 999, maxHp: 999 }), mob("goblin_grunt", "e1", { hp: 999, maxHp: 999 })], 1);
    for (let i = 0; i < 6 && !b.log.some((e) => e.type === "fled"); i++) b = hit(b, "e1");
    expect(b.log).toContainEqual({ type: "fled", unit: "e0" });
    expect(b.units.find((u) => u.id === "e0")).toMatchObject({ hp: 0, fled: true });
    expect(describeEvent({ type: "fled", unit: "e0" }, b)).toContain("달아났다");
    expect(getMonster("golden_rat")!.bounty).toBeDefined();
  });

  it("고블린 폭탄병: 두 번째 차례에 자폭해 모두에게 피해. 그전에 쓰러뜨리면 터지지 않는다", () => {
    let b = startBattleWithUnits([hero("h", [1, 1]), mob("goblin_bomber", "e0", { hp: 999, maxHp: 999 })], 1);
    for (let i = 0; i < 6 && !b.log.some((e) => e.type === "explode"); i++) b = hit(b, "e0");
    expect(b.log.some((e) => e.type === "explode")).toBe(true);
    expect(b.log.some((e) => e.type === "attack" && e.actor === "e0" && e.target === "h")).toBe(true);
    expect(b.units.find((u) => u.id === "e0")!.hp).toBe(0);
    // 한 방에 쓰러뜨리면 터지지 않는다
    let c = startBattleWithUnits([hero(), mob("goblin_bomber", "e0")], 1);
    c = hit(c, "e0");
    expect(c.log.some((e) => e.type === "explode")).toBe(false);
  });

  it("세계수 근위병의 방패 막이: 보호받는 동료를 노린 공격을 근위병이 대신 맞는다", () => {
    const shaman = mob("corrupted_shaman", "e1", { hp: 10, maxHp: 24, speed: -5 });
    const guard = mob("worldtree_guard", "e0", { speed: 50 });
    let b = startBattleWithUnits([hero("h", [3, 3]), guard, shaman], 2);
    // 근위병이 방패 막이를 쓸 때까지 진행
    for (let i = 0; i < 10 && !b.units.find((u) => u.id === "e1")!.statuses.some((x) => x.kind === "cover"); i++) b = hit(b, "e0");
    const cover = b.units.find((u) => u.id === "e1")!.statuses.find((x) => x.kind === "cover");
    expect(cover).toMatchObject({ source: "e0" });
    const before = b.log.length;
    b = act(b, { type: "attack", target: "e1" });
    const events = b.log.slice(before);
    expect(events).toContainEqual({ type: "cover", unit: "e0", target: "e1" });
    expect(events.find((e) => e.type === "attack" && e.actor === "h")).toMatchObject({ target: "e0" });
  });

  it("지역에서 정예로 정한 몬스터는 늘 정예로 나온다 (고블린 마을 홉고블린)", () => {
    for (let seed = 0; seed < 200; seed++)
      for (const u of rollEncounter(createRng(seed), getRegion("uf_goblin_village")!)) if (u.kind === "hobgoblin") expect(u.rank).toBe("elite");
  });
});
