import { describe, expect, it } from "vitest";
import { START_SUPPLIES } from "@/data/combat";
import { EVENTS, getEvent } from "@/data/events";
import { TEST_MERCS } from "@/test/fixtures";
import { act, currentActor, enemyUnit, living, rollEncounter } from "@/game/combat/engine";
import { MONSTER_MATERIAL } from "@/data/drops";
import { createRng } from "@/game/random";
import { PLANNED_BOSSES, REGIONS, getDungeon, getRegion } from "@/data/regions";
import { QUEST_INFO } from "@/data/quests";
import { getMonster } from "@/data/monsters";
import { getSalvage } from "@/data/loot";
import type { Merc } from "@/game/types";
import {
  autoDiscard,
  bagOver,
  bagUsed,
  discardItem,
  battleFor,
  battleSpoils,
  canDescend,
  canMove,
  choiceProblem,
  chooseEvent,
  descend,
  finishBattle,
  giveSupply,
  leaveRoom,
  markRestTalk,
  moveTo,
  nextRegions,
  regionOf,
  rescueBonds,
  startExpedition,
  supplyProblem,
  type Expedition,
  planGoal,
  xpRate,
  xpFor,
  hiddenEventFor,
  bossWarning,
  pickEvent,
  spendBattleMods,
} from "./expedition";
import { generateMap, nodeById } from "./map";

const [varn, kass, elke] = TEST_MERCS;
const mercs: Merc[] = [
  { ...varn, job: "knight" },
  { ...kass, job: "assassin" },
  { ...elke, job: "priest" },
  { ...varn, id: "v2", job: "archer" },
];

/** 원하는 종류의 칸이 입구 바로 다음에 있는 맵을 찾는다 */
function expeditionWithFirst(kind: string): { exp: Expedition; target: string } {
  for (let seed = 0; seed < 500; seed++) {
    // 1층 첫 칸에는 휴식이 없으니, 휴식을 찾을 때는 제한 없는 맵으로 바꿔 끼운다
    const base = startExpedition(mercs, seed);
    const map = kind === "rest" ? generateMap(seed, 7) : base.map;
    const exp = { ...base, map, at: map.startId, visited: [map.startId] };
    const first = nodeById(exp.map, exp.at)!.next.find((id) => nodeById(exp.map, id)!.kind === kind);
    if (first) return { exp, target: first };
  }
  throw new Error(`${kind} 칸으로 시작하는 맵이 없다`);
}

/** 용병이 가장 약한 적을 계속 때리는 단순한 전투 진행 */
function fight(exp: Expedition, seed: number) {
  let b = battleFor(exp, mercs, seed);
  for (let i = 0; i < 500 && !b.outcome; i++) {
    const weakest = [...living(b, "enemy")].sort((x, y) => x.hp - y.hp)[0];
    if (!currentActor(b)) break;
    b = act(b, { type: "attack", target: weakest.id });
  }
  return b;
}

describe("탐험", () => {
  it("입구에서 시작하고, 이어진 칸으로만 이동할 수 있다", () => {
    const exp = startExpedition(mercs, 1);
    expect(exp.members).toHaveLength(4);
    expect(exp.supplies).toEqual(START_SUPPLIES);
    const start = nodeById(exp.map, exp.at)!;
    expect(canMove(exp, start.next[0])).toBe(true);
    expect(canMove(exp, exp.map.goalId)).toBe(false);
    expect(moveTo(exp, mercs, exp.map.goalId, 1)).toBeNull();
  });

  it("전투 후 체력과 물자가 이어지고, 다음 전투는 그 체력으로 시작한다", () => {
    const { exp, target } = expeditionWithFirst("battle");
    const moved = moveTo(exp, mercs, target, 3)!;
    expect(moved.battle).not.toBeNull();
    const battle = fight(moved.exp, 3);
    const after = finishBattle(moved.exp, battle);
    const won = battle.outcome === "victory";
    for (const m of after.members) {
      const unit = battle.units.find((u) => u.id === m.id)!;
      // 죽은 용병은 빠지고, 이기면 쓰러졌던 용병은 체력 1로 일어나고, 지면 쓰러진 채로 남는다
      if (unit.dead) {
        expect(m).toMatchObject({ hp: 0, dead: true, down: true });
        continue;
      }
      expect(m.hp).toBe(unit.hp <= 0 && won ? 1 : unit.hp);
      expect(m.down).toBe(unit.hp <= 0 && !won);
      expect(m.fell ?? false).toBe(unit.hp <= 0);
    }
    expect(after.supplies).toEqual(battle.supplies);

    const hurt = { ...after, members: after.members.map((m) => ({ ...m, hp: m.down ? 0 : 5 })) };
    const next = battleFor(hurt, mercs, 9);
    for (const u of next.units.filter((x) => x.side === "merc")) expect(u.hp).toBeLessThanOrEqual(5);
  });

  it("쓰러진 용병은 다음 전투에 나오지 않고 물자도 받을 수 없다", () => {
    const exp = startExpedition(mercs, 2);
    exp.members[1].down = true;
    exp.members[1].hp = 0;
    const b = battleFor(exp, mercs, 5);
    expect(b.units.some((u) => u.id === kass.id)).toBe(false);
    expect(supplyProblem(exp, "potion", kass.id)).toBe("건넬 수 없는 대상");
  });

  it("모두 쓰러지면 패배 칸이 된다", () => {
    const exp = startExpedition(mercs, 3);
    const b = battleFor(exp, mercs, 3);
    const wiped = { ...b, outcome: "defeat" as const, units: b.units.map((u) => (u.side === "merc" ? { ...u, hp: 0 } : u)) };
    expect(finishBattle(exp, wiped).room).toEqual({ kind: "defeat" });
  });

  it("휴식: 체력 30% 회복과 상처 치료, 보물: 물자 0~1개 (50%)", () => {
    const { exp, target } = expeditionWithFirst("rest");
    exp.members[0].hp = 5;
    exp.members[0].statuses = [{ kind: "bleed", turns: 2 }];
    const rested = moveTo(exp, mercs, target, 1)!.exp;
    expect(rested.members[0].hp).toBe(5 + Math.round(32 * 0.3));
    expect(rested.members[0].statuses).toEqual([]);
    expect(rested.room?.kind).toBe("rest");
    expect(leaveRoom(rested).room).toBeNull();

    const t = expeditionWithFirst("treasure");
    const found = moveTo(t.exp, mercs, t.target, 1)!.exp;
    const gained = Object.values(found.supplies).reduce((a, b) => a + b, 0) - Object.values(START_SUPPLIES).reduce((a, b) => a + b, 0);
    expect(gained).toBeGreaterThanOrEqual(0);
    expect(gained).toBeLessThanOrEqual(1);
    // 여러 시드로 보면 절반쯤 물자를 찾는다
    let hits = 0;
    for (let seed = 0; seed < 200; seed++) {
      const f = moveTo(t.exp, mercs, t.target, seed)!.exp;
      if (Object.values(f.supplies).reduce((a, b) => a + b, 0) > Object.values(START_SUPPLIES).reduce((a, b) => a + b, 0)) hits++;
    }
    expect(hits / 200).toBeGreaterThan(0.35);
    expect(hits / 200).toBeLessThan(0.65);
  });

  it("맵 위에서 물자를 건넬 수 있다", () => {
    const exp = startExpedition(mercs, 4);
    exp.members[0].hp = 10;
    const next = giveSupply(exp, "potion", exp.members[0].id);
    expect(next.members[0].hp).toBe(22);
    expect(next.supplies.potion).toBe(START_SUPPLIES.potion - 1);
    expect(giveSupply(exp, "bandage", exp.members[0].id)).toBe(exp); // 출혈이 없다
  });

  it("사건: 결과가 나오기 전에는 맵으로 못 돌아가고, 고르면 효과와 태도가 남는다", () => {
    const { exp, target } = expeditionWithFirst("event");
    const entered = moveTo(exp, mercs, target, 1)!.exp;
    expect(entered.room?.kind).toBe("event");
    expect(leaveRoom(entered)).toBe(entered);
    if (entered.room?.kind !== "event") throw new Error();
    const event = EVENTS.find((e) => e.id === (entered.room as { eventId: string }).eventId)!;
    const choice = event.choices.find((c) => !c.requires && !c.consumes)!;
    const done = chooseEvent(entered, choice.id, 7);
    expect(done.room).toMatchObject({ kind: "event", result: { choiceId: choice.id, tone: choice.tone } });
    expect(leaveRoom(done).room).toBeNull();
  });

  it("사건 피해로는 쓰러지지 않는다", () => {
    const base = startExpedition(mercs, 5);
    for (let seed = 0; seed < 50; seed++) {
      const exp: Expedition = { ...structuredClone(base), room: { kind: "event", eventId: "collapsing_tunnel", result: null } };
      exp.members.forEach((m) => (m.hp = 2));
      const done = chooseEvent(exp, "rush", seed);
      for (const m of done.members) expect(m.hp).toBeGreaterThanOrEqual(1);
    }
  });

  it("맞는 사람이 있으면 그 사람이 나서고, 없으면 이유가 보인다", () => {
    const base = startExpedition(mercs, 5); // 궁수(v2) 있음, 드워프 없음
    const spring: Expedition = { ...structuredClone(base), room: { kind: "event", eventId: "strange_spring", result: null } };
    expect(choiceProblem(spring, "strange_spring", "check")).toBeNull();
    const done = chooseEvent(spring, "check", 1);
    expect(done.room?.kind === "event" && done.room.result!.text).toContain(varn.name);
    expect(done.members.every((m) => m.statuses.length === 0)).toBe(true);
    expect(choiceProblem(spring, "collapsing_tunnel", "read")).toBe("드워프 동료가 있어야 한다");
  });

  it("호감 단계 조건: 그 단계 이상인 동료가 있어야 한다", () => {
    const exp: Expedition = { ...startExpedition(mercs, 6), room: { kind: "event", eventId: "collapsing_tunnel", result: null } };
    expect(choiceProblem(exp, "collapsing_tunnel", "lead", {})).toBe("신뢰 단계인 동료가 있어야 한다");
    expect(choiceProblem(exp, "collapsing_tunnel", "lead", { [kass.id]: "trusted" })).toBeNull();
    const done = chooseEvent(exp, "lead", 1, { [kass.id]: "trusted" });
    expect(done.room?.kind === "event" && done.room.result!.text).toContain(kass.name);
  });

  it("아이템 선택은 물자를 쓰고, 없으면 고를 수 없다", () => {
    const exp: Expedition = { ...startExpedition(mercs, 7), room: { kind: "event", eventId: "sealed_door", result: null } };
    const potions = exp.supplies.potion;
    const done = chooseEvent(exp, "pour", 1);
    // 물약 1을 쓰고 2를 얻는다
    expect(done.supplies.potion).toBe(potions - 1 + 2);
    exp.supplies.potion = 0;
    expect(choiceProblem(exp, "sealed_door", "pour")).toBe("물약 1 필요");
  });

  it("모든 사건에 아이템·사람·위험 세 갈래가 있다 (히든 사건은 빼고)", () => {
    // 사건 50개: 공용 12, 지역 전용 34, 의뢰 2, 히든 2
    expect(EVENTS).toHaveLength(50);
    expect(EVENTS.filter((e) => e.region && !e.hidden && !e.quest)).toHaveLength(34);
    for (const event of EVENTS.filter((e) => !e.hidden)) {
      // 조건 있는 선택(동료)과 운에 맡기는 선택(위험)이 있다 (2026-11-22: 세 갈래 규칙 완화)
      const approaches = new Set(event.choices.map((c) => c.approach));
      expect(approaches.has("person") || approaches.has("risk"), event.id).toBe(true);
      for (const c of event.choices) {
        if (c.approach === "item") expect(c.requires?.items ?? c.consumes, `${event.id}/${c.id}`).toBeDefined();
        if (c.approach === "person") {
          const r = c.requires;
          expect(r?.job ?? r?.race ?? r?.bond ?? r?.element ?? r?.any ?? r?.speedSum, `${event.id}/${c.id}`).toBeDefined();
        }
        // 효과가 가리키는 것이 모두 있다
        for (const o of c.outcomes) {
          for (const id of Object.keys(o.effect.items ?? {})) expect(getSalvage(id), `${event.id}/${c.id} ${id}`).toBeDefined();
          for (const id of o.effect.battle?.monsters ?? []) expect(getMonster(id), `${event.id}/${c.id} ${id}`).toBeDefined();
          if (o.effect.forceBoss) expect(getMonster(o.effect.forceBoss.monsterId)).toBeDefined();
          if (o.effect.info) expect(QUEST_INFO[o.effect.info], `${event.id} ${o.effect.info}`).toBeDefined();
        }
      }
      if (event.region) expect(getRegion(event.region), event.id).toBeDefined();
      expect(event.choices.length).toBeLessThanOrEqual(6);
    }
  });

  it("필요한 물자가 없으면 그 선택지는 고를 수 없다", () => {
    const exp: Expedition = { ...startExpedition(mercs, 6), room: { kind: "event", eventId: "wounded_digger", result: null } };
    exp.supplies.bandage = 0;
    expect(chooseEvent(exp, "help", 1)).toBe(exp);
  });

  it("모든 사건 결과 문장에서 이름 자리가 채워진다", () => {
    const base = startExpedition(mercs, 8);
    for (const event of EVENTS) {
      for (const choice of event.choices) {
        for (let seed = 0; seed < 20; seed++) {
          const exp: Expedition = { ...structuredClone(base), room: { kind: "event", eventId: event.id, result: null } };
          const done = chooseEvent(exp, choice.id, seed);
          if (done.room?.kind !== "event" || !done.room.result) continue;
          expect(done.room.result.text, `${event.id}/${choice.id}`).not.toMatch(/[{}]/);
        }
      }
    }
  });
});

describe("탐험과 호감", () => {
  it("쓰러진 동료를 데리고 돌아오면 그 용병과 동료들 호감이 오른다 (전멸은 제외)", () => {
    const exp = startExpedition(mercs, 1);
    expect(rescueBonds(exp)).toEqual({});
    exp.members[1].down = true;
    const bonds = rescueBonds(exp);
    expect(bonds[kass.id]).toBe(8);
    expect(bonds[varn.id]).toBe(3);
    expect(rescueBonds({ ...exp, room: { kind: "defeat" } })).toEqual({});
  });

  it("호의 이상이면 지도 위에서 건넨 물약도 +25%", () => {
    const exp = startExpedition(mercs, 2);
    exp.members[0].hp = 1;
    expect(giveSupply(exp, "potion", varn.id).members[0].hp).toBe(13);
    expect(giveSupply(exp, "potion", varn.id, "warm").members[0].hp).toBe(16);
  });

  it("휴식 대화는 휴식마다 한 번", () => {
    const exp: Expedition = { ...startExpedition(mercs, 3), room: { kind: "rest", lines: [], talked: false } };
    const once = markRestTalk(exp);
    expect(once.room).toMatchObject({ talked: true });
    expect(markRestTalk(once)).toBe(once);
  });
});

describe("쓰러진 용병", () => {
  it("전투에서 이기면 체력 1로 일어나고, 데려온 호감은 그대로 받는다", () => {
    const exp = startExpedition(mercs, 9);
    const b = battleFor(exp, mercs, 9);
    const won = {
      ...b,
      outcome: "victory" as const,
      units: b.units.map((u) => (u.id === kass.id ? { ...u, hp: 0 } : u.side === "enemy" ? { ...u, hp: 0 } : u)),
    };
    const after = finishBattle(exp, won);
    const k = after.members.find((m) => m.id === kass.id)!;
    expect(k).toMatchObject({ hp: 1, down: false, fell: true });
    expect(rescueBonds(after)[kass.id]).toBe(8);
    expect(battleFor(after, mercs, 10).units.some((u) => u.id === kass.id)).toBe(true);
  });
});

describe("전리품", () => {
  it("전투에서 이기면 적 한 마리당 금화 4~8, 지면 없다", () => {
    const exp = startExpedition(mercs, 11);
    const b = battleFor(exp, mercs, 11);
    const enemies = b.units.filter((u) => u.side === "enemy").length;
    const won = battleSpoils(exp, { ...b, outcome: "victory" }, 3);
    expect(won.exp.gold).toBeGreaterThanOrEqual(4 * enemies);
    expect(won.exp.gold).toBeLessThanOrEqual(8 * enemies);
    expect(won.lines[0]).toContain("금화");
    expect(battleSpoils(exp, { ...b, outcome: "defeat" }, 3).exp.gold).toBe(0);
  });

  it("보물 칸은 물자와 금화, 가끔 유물을 준다. 목적지는 금화 40", () => {
    let relics = 0;
    for (let seed = 0; seed < 200; seed++) {
      const t = expeditionWithFirst("treasure");
      const found = moveTo(t.exp, mercs, t.target, seed)!.exp;
      expect(found.gold).toBeGreaterThanOrEqual(10);
      relics += found.loot.length;
    }
    expect(relics / 200).toBeGreaterThan(0.25);
    expect(relics / 200).toBeLessThan(0.55);
  });
});

describe("전투 유실물", () => {
  it("이기면 쓰러뜨린 적 종류의 유실물이 떨어지고, 유물은 나오지 않는다", () => {
    let salvage = 0;
    for (let seed = 0; seed < 100; seed++) {
      const exp = startExpedition(mercs, seed);
      const b = battleFor(exp, mercs, seed);
      expect(b.units.filter((u) => u.side === "enemy").every((u) => !!u.kind)).toBe(true);
      const won = battleSpoils(exp, { ...b, outcome: "victory" }, seed);
      expect(won.exp.loot).toEqual([]);
      // 유실물만 센다 (전수관 재료는 data/drops.test.ts)
      salvage += Object.entries(won.exp.salvage).reduce((a, [id, n]) => a + ((getSalvage(id)?.kind ?? "loot") === "loot" ? n : 0), 0);
    }
    // 적 3~4마리 × (0.5 + 0.15) ≈ 한 번에 2개 남짓
    expect(salvage / 100).toBeGreaterThan(1.5);
    expect(salvage / 100).toBeLessThan(3.2);
  });
});

describe("층과 갈래", () => {
  it("지역이 있으면 그 지역 몬스터로만, 정해진 마릿수로 나온다 (같은 시드면 같은 무리)", () => {
    const region = getRegion("uf_forest")!;
    const ids = region.monsters.map((m) => m.id);
    for (let seed = 0; seed < 50; seed++) {
      const units = rollEncounter(createRng(seed), region);
      expect(units.length).toBeGreaterThanOrEqual(region.size[0]);
      expect(units.length).toBeLessThanOrEqual(region.size[1]);
      for (const u of units) expect(ids).toContain(u.kind);
      expect(rollEncounter(createRng(seed), region)).toEqual(units);
    }
  });

  it("열린 던전의 몬스터·보스·갈래는 있는 것을 가리키고, 갈래는 한 층씩 내려간다", () => {
    for (const r of REGIONS) {
      const open = getDungeon(r.dungeon)!.open;
      for (const m of [...r.monsters.map((x) => x.id), ...(r.boss?.pool.map((p) => p.monsterId) ?? [])]) {
        if (!open) {
          // 닫힌 던전(안개 늪)은 보스 이름 자리만 있어도 된다
          expect(getMonster(m) ?? PLANNED_BOSSES[m], `${r.id}: ${m}`).toBeDefined();
          continue;
        }
        expect(getMonster(m), `${r.id}: ${m}`).toBeDefined();
        for (const e of getMonster(m)!.escort ?? []) expect(getMonster(e), e).toBeDefined();
      }
      if (open) expect(r.monsters.length, r.id).toBeGreaterThan(0);
      for (const n of r.next) expect(getRegion(n)!.depth).toBe(r.depth + 1);
      // 히든 지역은 갈래에 없고, 출발 지역 바로 아래 층이며, 사건이 있다
      if (r.hidden) {
        expect(REGIONS.some((x) => x.next.includes(r.id))).toBe(false);
        expect(r.depth).toBe(getRegion(r.hidden.from)!.depth + 1);
        expect(getEvent(r.hidden.event)?.hidden, r.hidden.event).toBe(true);
        expect(r.boss?.chance).toBe(1);
      }
    }
  });

  it("목적지에서 고른 갈래로 내려간다. 갈래에 없는 지역이나 목적지가 아니면 안 된다", () => {
    const exp = startExpedition(mercs, 1);
    expect(regionOf(exp).id).toBe("uf_forest");
    expect(canDescend(exp)).toBe(false);
    const atGoal: Expedition = { ...exp, room: { kind: "goal" } };
    expect(nextRegions(atGoal).map((r) => r.id)).toEqual(["uf_deep_forest", "uf_cave"]);
    const down = descend(atGoal, 2, "uf_cave")!;
    expect(down).toMatchObject({ depth: 2, region: "uf_cave", room: null });
    expect(descend(atGoal, 2, "uf_swamp")).toBeNull();
    expect(descend({ ...atGoal, members: atGoal.members.map((m) => ({ ...m, down: true })) }, 2, "uf_cave")).toBeNull();
  });

  it("끝 지역은 목적지가 보스 전투이고, 이기면 그 갈래는 끝 (귀환만)", () => {
    let exp: Expedition = { ...startExpedition(mercs, 1), region: "uf_wolf_den", depth: 3 };
    exp = { ...exp, goal: planGoal(getRegion("uf_wolf_den")!, 1) };
    const goal = exp.map.goalId;
    const before = exp.map.nodes.find((n) => n.next.includes(goal))!;
    exp = { ...exp, at: before.id };
    const moved = moveTo(exp, mercs, goal, 5)!;
    expect(moved.battle).not.toBeNull();
    const boss = moved.battle!.units.find((u) => u.side === "enemy" && u.rank === "dungeonBoss")!;
    expect(boss.kind).toBe("alpha_wolf");
    // 이긴 것으로 친다
    const won = { ...moved.battle!, outcome: "victory" as const, units: moved.battle!.units.map((u) => (u.side === "enemy" ? { ...u, hp: 0 } : u)) };
    const after = finishBattle(moved.exp, won);
    expect(after.room).toEqual({ kind: "goal" });
    expect(after.cleared).toBe(true);
    expect(canDescend(after)).toBe(false);
  });

  it("목적지 보스는 호위와 함께 나오고, 정예 목적지는 정예가 섞이고, 보물 목적지는 바로 보물", () => {
    const base = startExpedition(mercs, 1);
    const goal = base.map.goalId;
    const before = base.map.nodes.find((n) => n.next.includes(goal))!;
    const at = { ...base, at: before.id };
    const boss = moveTo({ ...at, goal: { kind: "boss", id: "goblin_glutton" } }, mercs, goal, 4)!;
    const enemies = boss.battle!.units.filter((u) => u.side === "enemy");
    expect(enemies.map((u) => u.kind)).toEqual(["goblin_glutton", "goblin_grunt", "goblin_grunt"]);
    const elite = moveTo({ ...at, goal: { kind: "elite" } }, mercs, goal, 4)!;
    expect(elite.battle!.units.some((u) => u.side === "enemy" && u.rank === "elite")).toBe(true);
    const chest = moveTo({ ...at, goal: { kind: "treasure" } }, mercs, goal, 4)!;
    expect(chest.battle).toBeNull();
    expect(chest.exp.room?.kind === "goal" && chest.exp.room.lines?.[0]).toBe("보물 상자를 찾았다.");
    // 중간 층 보스(나무 거인)를 잡아도 다음 갈래로 내려갈 수 있다
    const deep: Expedition = { ...at, region: "uf_deep_forest", depth: 2, goal: { kind: "boss", id: "tree_giant" } };
    const fought = moveTo(deep, mercs, goal, 4)!;
    const won = { ...fought.battle!, outcome: "victory" as const, units: fought.battle!.units.map((u) => (u.side === "enemy" ? { ...u, hp: 0 } : u)) };
    const after = finishBattle(fought.exp, won);
    expect(after.cleared).toBe(true);
    expect(canDescend(after)).toBe(true);
  });

  it("깊은 층의 전투는 금화를 더 준다", () => {
    const { exp } = expeditionWithFirst("battle");
    const b = fight(exp, 3);
    if (b.outcome !== "victory") return;
    // 1층은 금화 ×FIRST_FLOOR_GOLD (밸런스 2차)
    const g1 = battleSpoils(exp, b, 9).exp.gold;
    const g2 = battleSpoils({ ...exp, depth: 2 }, b, 9).exp.gold;
    const g3 = battleSpoils({ ...exp, depth: 3 }, b, 9).exp.gold;
    expect(g3).toBeGreaterThan(g2);
    expect(g2).toBeGreaterThan(g1);
    // 3층은 기본의 2배, 1층은 기본의 1.25배
    expect(Math.abs(g1 - (g3 / 2) * 1.25)).toBeLessThanOrEqual(1.5);
  });
});

describe("경험치 배율", () => {
  it("용병 등급이 층의 권장 등급보다 높을수록 줄어든다 (같거나 낮음 1 / 한 등급 0.5 / 두 등급 0.1 / 세 등급 0)", () => {
    expect(xpRate("bronze", "bronze")).toBe(1);
    expect(xpRate("bronze", "silver")).toBe(1);
    expect(xpRate("silver", "bronze")).toBe(0.5);
    expect(xpRate("gold", "bronze")).toBe(0.1);
    expect(xpRate("mithril", "bronze")).toBe(0);
    expect(xpRate("radiant", "bronze")).toBe(0);
  });

  it("층마다 그 층의 권장 등급(높은 쪽)으로 쌓고, 귀환할 때 등급별로 계산한다", () => {
    const exp: Expedition = { ...startExpedition(mercs, 1), xpBy: { bronze: 10, silver: 20 } };
    expect(xpFor(exp, "bronze")).toBe(30);
    expect(xpFor(exp, "silver")).toBe(5 + 20);
    expect(xpFor(exp, "gold")).toBe(1 + 10);
    // 이동하면 지금 층의 권장 등급으로 쌓인다
    const { exp: start, target } = expeditionWithFirst("rest");
    const moved = moveTo(start, mercs, target, 1)!.exp;
    expect(moved.xpBy).toEqual({ bronze: 1 });
  });
});

describe("히든 층", () => {
  const atDeeper = (keys: Expedition["keys"]): Expedition => {
    const exp = startExpedition(mercs, 1, START_SUPPLIES, "unknown_forest", keys);
    return { ...exp, region: "uf_deeper_forest", depth: 3 };
  };

  it("열쇠가 있으면 그 지역의 사건 칸에서 확률로 히든 사건이 나온다 (층마다 한 번). 열쇠가 없으면 안 나온다", () => {
    expect(hiddenEventFor(atDeeper([]))).toBeUndefined();
    expect(hiddenEventFor(atDeeper(["world_tree_branch"]))?.id).toBe("uf_corrupted_forest");
    expect(hiddenEventFor({ ...atDeeper(["world_tree_branch"]), hiddenOffered: true })).toBeUndefined();
    let seen = 0;
    for (let seed = 0; seed < 300; seed++) {
      const { exp, target } = expeditionWithFirst("event");
      const withKey: Expedition = { ...exp, region: "uf_deeper_forest", depth: 3, keys: ["world_tree_branch"] };
      const room = moveTo(withKey, mercs, target, seed)!.exp.room;
      if (room?.kind === "event" && room.eventId === "whispering_grove") seen++;
    }
    expect(seen / 300).toBeGreaterThan(0.4);
    expect(seen / 300).toBeLessThan(0.6);
    // 무작위 사건으로는 히든 사건이 나오지 않는다
    for (let seed = 0; seed < 300; seed++) expect(getEvent(pickEvent(seed))!.hidden).toBeFalsy();
  });

  it("따라가면 이 층의 다음 갈래가 히든 지역이 되고, 내려가면 열쇠를 쓴 것으로 남는다", () => {
    const exp: Expedition = { ...atDeeper(["world_tree_branch"]), room: { kind: "event", eventId: "whispering_grove", result: null } };
    // 엘프가 없으면 '듣게 한다'는 고를 수 없다
    expect(choiceProblem(exp, "whispering_grove", "listen")).toBe("엘프 동료가 있어야 한다");
    const chosen = chooseEvent(exp, "follow", 1);
    expect(chosen.hiddenNext).toBe("uf_corrupted_forest");
    const atGoal: Expedition = { ...chosen, room: { kind: "goal" } };
    expect(nextRegions(atGoal).map((r) => r.id)).toEqual(["uf_corrupted_forest"]);
    const down = descend(atGoal, 3, "uf_corrupted_forest")!;
    expect(down).toMatchObject({ region: "uf_corrupted_forest", depth: 4, keyUsed: "world_tree_branch", hiddenNext: undefined });
    expect(down.map.length).toBe(12);
    expect(down.goal).toEqual({ kind: "boss", id: "corrupted_spirit_king" });
    // 무시하면 원래 길
    expect(chooseEvent(exp, "leave", 1).hiddenNext).toBeUndefined();
  });

  it("자폭·분열·부화로 사라진 적은 재료를 떨어뜨리지 않는다 (금화는 준다)", () => {
    const { exp } = expeditionWithFirst("battle");
    const boss = { ...battleFor(exp, mercs, 1, {}, "alpha_wolf"), outcome: "victory" as const };
    const bossId = boss.units.find((u) => u.kind === "alpha_wolf")!.id;
    expect(battleSpoils(exp, boss, 1).exp.salvage.boss_token).toBe(1);
    const cases = [
      { type: "explode" as const, unit: bossId },
      { type: "spawn" as const, unit: bossId, by: "x", how: "split" as const },
      { type: "spawn" as const, unit: "x", by: bossId, how: "hatch" as const },
    ];
    for (const e of cases) {
      const got = battleSpoils(exp, { ...boss, log: [...boss.log, e] }, 1).exp;
      expect(got.salvage.boss_token, e.type).toBeUndefined();
      expect(got.gold).toBeGreaterThan(0);
    }
  });

  it("고블린 폭탄병: 터지기 전에 잡으면 숫돌이 떨어질 수 있고, 자폭하면 아무것도 없다", () => {
    expect(MONSTER_MATERIAL.goblin_bomber?.id).toBe("mat_whetstone");
    const { exp } = expeditionWithFirst("battle");
    const b = battleFor(exp, mercs, 1);
    const bomber = { ...enemyUnit(getMonster("goblin_bomber")!, "eb"), hp: 0 };
    const won = { ...b, outcome: "victory" as const, units: [...b.units.filter((u) => u.side === "merc"), bomber] };
    let got = 0;
    for (let seed = 0; seed < 200; seed++) got += battleSpoils(exp, won, seed).exp.salvage.mat_whetstone ?? 0;
    expect(got).toBeGreaterThan(0);
    const exploded = { ...won, log: [...won.log, { type: "explode" as const, unit: "eb" }] };
    for (let seed = 0; seed < 200; seed++) expect(battleSpoils(exp, exploded, seed).exp.salvage.mat_whetstone).toBeUndefined();
  });

  it("던전 보스는 일반 몬스터보다 금화를 훨씬 많이 준다", () => {
    const { exp } = expeditionWithFirst("battle");
    const boss = { ...battleFor(exp, mercs, 1, {}, "alpha_wolf"), outcome: "victory" as const };
    const onlyBoss = { ...boss, units: boss.units.filter((u) => u.side === "merc" || u.kind === "alpha_wolf") };
    const asNormal = { ...onlyBoss, units: onlyBoss.units.map((u) => (u.side === "enemy" ? { ...u, rank: "normal" as const } : u)) };
    const deep = { ...exp, depth: 3 }; // 층 배율이 정수(×2)인 3층으로 비교 (1층 금화 배율의 반올림을 피한다)
    expect(battleSpoils(deep, onlyBoss, 5).exp.gold).toBe(battleSpoils(deep, asNormal, 5).exp.gold * 10);
  });

  it("나무 거인은 세계수의 가지를 반드시 떨어뜨린다", () => {
    const { exp } = expeditionWithFirst("battle");
    const giant = { ...battleFor(exp, mercs, 1, {}, "tree_giant"), outcome: "victory" as const };
    for (let seed = 0; seed < 50; seed++) expect(battleSpoils(exp, giant, seed).exp.keyFound).toContain("world_tree_branch");
  });
});

describe("보스 직전 경고", () => {
  it("경고 보스로 정해진 층에서 목적지 바로 앞 칸에 서면 경고한다", () => {
    const base = startExpedition(mercs, 1);
    const before = base.map.nodes.find((n) => n.next.includes(base.map.goalId))!;
    const warned: Expedition = { ...base, at: before.id, goal: { kind: "boss", id: "goblin_king", warn: true } };
    expect(bossWarning(warned)).toBe(true);
    expect(bossWarning({ ...warned, goal: { kind: "boss", id: "goblin_king" } })).toBe(false);
    expect(bossWarning({ ...warned, at: base.map.startId })).toBe(false);
    // 뱀파이어 성의 로드는 경고 대상 (안개 늪은 아직 닫혀 있다)
    expect(getRegion("fm_vampire_castle")!.boss!.pool.find((p) => p.monsterId === "vampire_lord")).toMatchObject({ warn: true, weight: 3 });
  });
});

describe("구출 의뢰 사건", () => {
  it("의뢰 사건은 무작위 사건으로 나오지 않는다", () => {
    for (let seed = 0; seed < 300; seed++) expect(getEvent(pickEvent(seed))?.quest).toBeFalsy();
  });

  it("구출 의뢰를 받았을 때만 그 지역 사건 칸에 나오고, 구하면 기록된다", () => {
    const { exp, target } = expeditionWithFirst("event");
    const here = exp.region!;
    // 의뢰 없음: 의뢰 사건이 나오지 않는다
    const plain = moveTo(exp, mercs, target, 1)!.exp;
    expect(getEvent((plain.room as { eventId: string }).eventId)?.quest).toBeFalsy();
    // 의뢰 있음 (이 지역): 의뢰 사건이 먼저 나온다
    const withQuest = { ...exp, questEvents: [{ eventId: "rescue_herbalist", regionId: here }] };
    const moved = moveTo(withQuest, mercs, target, 1)!.exp;
    expect(moved.room).toMatchObject({ kind: "event", eventId: "rescue_herbalist" });
    // 다른 지역 의뢰면 나오지 않는다
    const elsewhere = moveTo({ ...exp, questEvents: [{ eventId: "rescue_herbalist", regionId: "uf_cave" }] }, mercs, target, 1)!.exp;
    expect((elsewhere.room as { eventId: string }).eventId).not.toBe("rescue_herbalist");
    // 구하는 선택 → 기록
    const saved = chooseEvent(moved, "cut", 3);
    expect(saved.rescued).toContain("rescue_herbalist");
    const left = chooseEvent(moved, "leave", 3);
    expect(left.rescued ?? []).not.toContain("rescue_herbalist");
  });
});

describe("사건 확장 (50개)", () => {
  const regionExp = (region: string, seed = 1): Expedition => ({ ...startExpedition(mercs, seed), region });

  it("한 원정 안에서 같은 사건이 다시 나오지 않고, 지역 사건 약 60% / 공용 약 40%", () => {
    let local = 0, total = 0;
    for (let seed = 0; seed < 300; seed++) {
      const seen: string[] = [];
      for (let i = 0; i < 4; i++) {
        const id = pickEvent(seed * 10 + i, "uf_cave", seen);
        expect(seen).not.toContain(id);
        seen.push(id);
        if (i === 0) {
          total++;
          if (getEvent(id)!.region === "uf_cave") local++;
        }
      }
    }
    expect(local / total).toBeGreaterThan(0.5);
    expect(local / total).toBeLessThan(0.7);
    // 다른 지역 전용 사건은 나오지 않는다
    for (let seed = 0; seed < 200; seed++) {
      const r = getEvent(pickEvent(seed, "uf_cave"))!.region;
      expect(r === undefined || r === "uf_cave").toBe(true);
    }
  });

  it("조건부 선택지: 종족·직업·원소·호감·속도 합이 맞아야 고를 수 있다", () => {
    const exp = regionExp("uf_cave");
    // 물 원소 마법사가 없으면 지하 호수의 물 가르기는 못 고른다
    const room = { ...exp, room: { kind: "event" as const, eventId: "underground_lake", result: null } };
    expect(choiceProblem(room, "underground_lake", "water")).toContain("물 원소 마법사");
    const withMage = { ...room, members: room.members.map((m, i) => (i === 0 ? { ...m, job: "mage", elements: ["water" as const] } : m)) };
    expect(choiceProblem(withMage, "underground_lake", "water")).toBeNull();
    // 사제 또는 엘프
    const mush = { ...exp, members: exp.members.map((m) => ({ ...m, job: "knight", race: "human" })) };
    expect(choiceProblem(mush, "mushroom_patch", "sort")).toContain("사제 또는 엘프 동료");
    // 호감 단계
    expect(choiceProblem(exp, "comrade_worry", "pass", {})).toContain("호의");
    expect(choiceProblem(exp, "comrade_worry", "pass", { [exp.members[0].id]: "trusted" })).toBeNull();
    // 몰래 통과: 속도 합
    const slow = { ...exp, members: exp.members.map((m) => ({ ...m, speed: 1 })) };
    expect(choiceProblem(slow, "orc_scout_camp", "sneak")).toContain("속도 합");
    // 금화가 모자라면 상인에게 못 산다
    expect(choiceProblem({ ...exp, gold: 10 }, "wandering_merchant", "potion")).toContain("금화");
  });

  it("칸 +1, 다음 칸 보물, 보스 확정 출현 (보상 배율)", () => {
    const { exp, target } = expeditionWithFirst("event");
    const at = moveTo(exp, mercs, target, 1)!.exp;
    const len = at.map.length;
    const ev = (eventId: string, choiceId: string, seed = 1) => chooseEvent({ ...at, room: { kind: "event", eventId, result: null } }, choiceId, seed);
    const longer = ev("trap_field", "around");
    expect(longer.map.length).toBe((len ?? 0) + 1);
    expect(nodeById(longer.map, longer.at)!.next).toHaveLength(1);
    const treasure = ev("firefly_path", "follow", 0);
    const nextKinds = nodeById(treasure.map, treasure.at)!.next.map((id) => nodeById(treasure.map, id)!.kind);
    expect(nextKinds.length === 1).toBe(true);
    const boss = ev("echo_cave", "shout");
    const bossNode = nodeById(boss.map, nodeById(boss.map, boss.at)!.next[0])!;
    expect(bossNode).toMatchObject({ kind: "battle", boss: "giant_cave_bat", rewardMul: 2 });
    const moved = moveTo(leaveRoom(boss), mercs, bossNode.id, 2)!;
    expect(moved.battle!.units.some((u) => u.kind === "giant_cave_bat")).toBe(true);
    expect(moved.exp.rewardMul).toBe(2);
  });

  it("이번 층 몬스터 비활성·감소, 다음 전투 기습", () => {
    const exp = { ...startExpedition(mercs, 3), region: "uf_goblin_village", depth: 3 };
    // 폭탄병 비활성
    const off = { ...exp, floorMods: [{ monster: "goblin_bomber", mode: "disable" as const }] };
    for (let seed = 0; seed < 60; seed++) expect(battleFor(off, mercs, seed).units.some((u) => u.kind === "goblin_bomber")).toBe(false);
    // 주술사 회복 불가
    const noHeal = { ...exp, floorMods: [{ monster: "goblin_shaman", mode: "noHeal" as const }] };
    for (let seed = 0; seed < 60; seed++)
      for (const u of battleFor(noHeal, mercs, seed).units.filter((x) => x.kind === "goblin_shaman")) expect(u.skills.some((id) => id.includes("mend"))).toBe(false);
    // 우리가 기습 / 적이 기습
    const ambush = battleFor({ ...exp, nextBattle: "ambush" }, mercs, 1);
    for (const u of ambush.units.filter((x) => x.side === "enemy"))
      expect(u.statuses.some((s) => s.kind === "bind") || ambush.log.some((e) => e.type === "bound" && e.target === u.id)).toBe(true);
    // 적은 아직 아무도 공격하지 못했다
    expect(ambush.log.some((e) => e.type === "attack")).toBe(false);
    const caught = battleFor({ ...exp, nextBattle: "enemyAmbush" }, mercs, 1);
    expect(caught.log.some((e) => e.type === "bound" && caught.units.find((u) => u.id === e.target)?.side === "merc")).toBe(true);
    // 전투를 시작하면 한 번 쓰는 보정은 사라진다
    expect(spendBattleMods({ ...exp, nextBattle: "buff", curse: { status: "healReduction", battles: 1 } })).toMatchObject({ nextBattle: undefined, curse: undefined });
    // 층이 바뀌면 이번 층 변화는 사라진다
    expect(descend({ ...off, room: { kind: "goal" } }, 1, "uf_deeper_forest")?.floorMods ?? []).toEqual([]);
  });
});

describe("1층 첫 칸", () => {
  it("1층 첫 칸(입구 다음)에는 휴식이 나오지 않는다. 2층부터는 그대로", () => {
    for (let seed = 0; seed < 300; seed++) {
      const exp = startExpedition(mercs, seed);
      const first = nodeById(exp.map, exp.map.startId)!.next.map((id) => nodeById(exp.map, id)!.kind);
      expect(first, `seed ${seed}`).not.toContain("rest");
    }
    // 2층: 첫 칸 휴식이 나올 수 있다
    let rest = 0;
    for (let seed = 0; seed < 300; seed++) {
      const down = descend({ ...startExpedition(mercs, 1), room: { kind: "goal" } }, seed, "uf_deep_forest")!;
      if (nodeById(down.map, down.map.startId)!.next.some((id) => nodeById(down.map, id)!.kind === "rest")) rest++;
    }
    expect(rest).toBeGreaterThan(0);
  });
});

describe("장신구: 마지막 숨결 (원정 동안 이어진다)", () => {
  it("전투에서 쓴 횟수가 원정에 남고, 다음 전투에서는 그만큼 빠진다", () => {
    const withBreath = mercs.map((m) => (m.id === varn.id ? { ...m, gear: { lastBreath: 2 } } : m));
    const exp = startExpedition(withBreath, 1);
    const b = battleFor(exp, withBreath, 1);
    const unit = b.units.find((u) => u.id === varn.id)!;
    expect(unit.breath).toBe(2);
    const used = { ...b, outcome: "victory" as const, units: b.units.map((u) => (u.id === varn.id ? { ...u, breath: 1, fx: { ...u.fx, breathUsed: 1 } } : u)) };
    const after = finishBattle(exp, used);
    expect(after.members.find((m) => m.id === varn.id)!.breathUsed).toBe(1);
    expect(battleFor(after, withBreath, 2).units.find((u) => u.id === varn.id)!.breath).toBe(1);
  });
});

describe("가방 (2026-11-22)", () => {
  it("겹치기: 물자 한 칸 3개, 재료·유실물 한 칸 5개, 유물·열쇠는 한 칸에 하나. 넘치면 움직일 수 없다", () => {
    const base = startExpedition(mercs, 1, { bandage: 4, antidote: 0, potion: 3, greaterPotion: 0 }, undefined, ["world_tree_branch"]);
    expect(base.bag).toBe(8);
    // 붕대 4 = 2칸, 물약 3 = 1칸, 열쇠 1칸
    expect(bagUsed(base)).toBe(4);
    const full = { ...base, salvage: { soft_pelt: 6, mat_fang: 5 }, loot: ["crystal_eye"] };
    // + 털가죽 6 = 2칸, 송곳니 5 = 1칸, 유물 1칸
    expect(bagUsed(full)).toBe(8);
    expect(bagOver(full)).toBe(false);
    const over = { ...full, salvage: { ...full.salvage, rat_fang: 1 } };
    expect(bagOver(over)).toBe(true);
    const next = nodeById(over.map, over.at)!.next[0];
    expect(canMove(over, next)).toBe(false);
    // 하나 버리면 다시 움직일 수 있다
    const fixed = discardItem(over, { kind: "salvage", id: "rat_fang" })!;
    expect(bagOver(fixed)).toBe(false);
    expect(fixed.discarded).toBe(1);
    expect(canMove(fixed, next)).toBe(true);
  });

  it("자동 정리는 가치가 낮은 칸부터 버리고, 열쇠는 남긴다", () => {
    const base = startExpedition(mercs, 1, { bandage: 0, antidote: 0, potion: 0, greaterPotion: 0 }, undefined, ["world_tree_branch"]);
    const over = { ...base, salvage: { rat_fang: 5, owlbear_egg: 5, boss_token: 1, soft_pelt: 30 } };
    const out = autoDiscard(over);
    expect(bagOver(out)).toBe(false);
    expect(out.keys).toEqual(["world_tree_branch"]);
    expect(out.salvage.owlbear_egg).toBe(5);
    expect(out.salvage.boss_token).toBe(1);
  });

  it("히든 사건은 열쇠가 가방에 있어야 나온다", () => {
    const withKey = startExpedition(mercs, 1, undefined, undefined, ["world_tree_branch"]);
    const without = startExpedition(mercs, 1, undefined, undefined, []);
    const deep = (e: Expedition) => ({ ...e, region: "uf_deeper_forest" });
    expect(hiddenEventFor(deep(withKey))).toBeDefined();
    expect(hiddenEventFor(deep(without))).toBeUndefined();
    expect(hiddenEventFor(deep({ ...without, keyFound: ["world_tree_branch"] }))).toBeDefined();
  });
});

describe("길잡이 능력 (2026-11-22)", () => {
  it("확률 1이면 다음 칸을 모두 미리 알고, 들어가면 본 그대로 나온다. 확률 0이면 모른다", () => {
    const sure = startExpedition(mercs, 3, undefined, undefined, [], [], [], { scoutChance: 1 });
    const none = startExpedition(mercs, 3, undefined, undefined, [], [], [], { scoutChance: 0 });
    expect(Object.keys(none.scouted ?? {})).toEqual([]);
    const next = nodeById(sure.map, sure.at)!.next.filter((id) => ["battle", "event"].includes(nodeById(sure.map, id)!.kind));
    expect(Object.keys(sure.scouted ?? {}).sort()).toEqual([...next].sort());
    const battleId = next.find((id) => sure.scouted![id].kind === "battle");
    if (battleId) {
      const seen = sure.scouted![battleId];
      const r = moveTo(sure, mercs, battleId, 99)!;
      const kinds = r.battle!.units.filter((u) => u.side === "enemy").map((u) => u.kind);
      expect(kinds).toEqual(seen.kind === "battle" ? seen.enemies.map((u) => u.kind) : []);
    }
  });
});
