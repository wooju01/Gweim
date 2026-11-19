import { describe, expect, it } from "vitest";
import { START_SUPPLIES } from "../../data/combat";
import { EVENTS } from "../../data/events";
import { TEST_MERCS } from "../../test/fixtures";
import { act, currentActor, living } from "../combat/engine";
import type { Merc } from "../types";
import {
  battleFor,
  canMove,
  choiceProblem,
  chooseEvent,
  finishBattle,
  giveSupply,
  leaveRoom,
  markRestTalk,
  moveTo,
  rescueBonds,
  startExpedition,
  supplyProblem,
  type Expedition,
} from "./expedition";
import { nodeById } from "./map";

const [varn, kass, elke] = TEST_MERCS;
const mercs: Merc[] = [
  { ...varn, job: "spearman" },
  { ...kass, job: "dagger" },
  { ...elke, job: "nun" },
  { ...varn, id: "v2", job: "herbalist" },
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
    const base = startExpedition(mercs, 5); // 약초꾼(v2) 있음, 드워프 없음
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

  it("모든 사건에 아이템·사람·위험 세 갈래가 있다", () => {
    for (const event of EVENTS) {
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
