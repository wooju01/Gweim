import { describe, expect, it } from "vitest";
import { START_SUPPLIES } from "@/data/combat";
import { EVENTS, getEvent } from "@/data/events";
import { TEST_MERCS } from "@/test/fixtures";
import { act, currentActor, living, rollEncounter } from "@/game/combat/engine";
import { createRng } from "@/game/random";
import { PLANNED_BOSSES, REGIONS, getDungeon, getRegion } from "@/data/regions";
import { getMonster } from "@/data/monsters";
import { getSalvage } from "@/data/loot";
import type { Merc } from "@/game/types";
import {
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
} from "./expedition";
import { nodeById } from "./map";

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
    const exp = startExpedition(mercs, seed);
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

  it("휴식: 체력 30% 회복과 상처 치료, 보물: 물자 1~2개", () => {
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
    expect(gained).toBeGreaterThanOrEqual(1);
    expect(gained).toBeLessThanOrEqual(2);
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
    for (const event of EVENTS.filter((e) => !e.hidden)) {
      const approaches = new Set(event.choices.map((c) => c.approach));
      for (const a of ["item", "person", "risk"] as const) expect(approaches.has(a), `${event.id} ${a}`).toBe(true);
      for (const c of event.choices) {
        if (c.approach === "item") expect(c.requires?.items ?? c.consumes, `${event.id}/${c.id}`).toBeDefined();
        if (c.approach === "person") expect(c.requires?.job ?? c.requires?.race ?? c.requires?.bond, `${event.id}/${c.id}`).toBeDefined();
      }
      expect(event.choices.length).toBeLessThanOrEqual(5);
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
    const g1 = battleSpoils(exp, b, 9).exp.gold;
    const g3 = battleSpoils({ ...exp, depth: 3 }, b, 9).exp.gold;
    expect(g3).toBe(Math.round(g1 * 2));
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

  it("던전 보스는 일반 몬스터보다 금화를 훨씬 많이 준다", () => {
    const { exp } = expeditionWithFirst("battle");
    const boss = { ...battleFor(exp, mercs, 1, {}, "alpha_wolf"), outcome: "victory" as const };
    const onlyBoss = { ...boss, units: boss.units.filter((u) => u.side === "merc" || u.kind === "alpha_wolf") };
    const asNormal = { ...onlyBoss, units: onlyBoss.units.map((u) => (u.side === "enemy" ? { ...u, rank: "normal" as const } : u)) };
    expect(battleSpoils(exp, onlyBoss, 5).exp.gold).toBe(battleSpoils(exp, asNormal, 5).exp.gold * 10);
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
