import { describe, expect, it } from "vitest";
import { START_SUPPLIES } from "../../data/combat";
import { EVENTS } from "../../data/events";
import { TEST_MERCS } from "../../test/fixtures";
import { act, currentActor, living } from "../combat/engine";
import type { Merc } from "../types";
import {
  battleFor,
  canMove,
  chooseEvent,
  finishBattle,
  giveSupply,
  leaveRoom,
  moveTo,
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
    for (const m of after.members) {
      const unit = battle.units.find((u) => u.id === m.id)!;
      expect(m.hp).toBe(unit.hp);
      expect(m.down).toBe(unit.hp <= 0);
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
    const choice = event.choices.find((c) => !c.needs)!;
    const done = chooseEvent(entered, choice.id, 7);
    expect(done.room).toMatchObject({ kind: "event", result: { choiceId: choice.id, tone: choice.tone } });
    expect(leaveRoom(done).room).toBeNull();
  });

  it("사건 피해로는 쓰러지지 않고, 전문가가 있으면 그 결과 표를 쓴다", () => {
    const base = startExpedition(mercs, 5);
    for (let seed = 0; seed < 50; seed++) {
      const exp: Expedition = { ...structuredClone(base), room: { kind: "event", eventId: "collapsing_tunnel", result: null } };
      exp.members.forEach((m) => (m.hp = 2));
      const done = chooseEvent(exp, "rush", seed);
      for (const m of done.members) expect(m.hp).toBeGreaterThanOrEqual(1);
    }
    // 약초꾼이 있으면 수상한 샘은 언제나 안전하다
    for (let seed = 0; seed < 30; seed++) {
      const exp: Expedition = { ...structuredClone(base), room: { kind: "event", eventId: "strange_spring", result: null } };
      const done = chooseEvent(exp, "drink", seed);
      expect(done.members.every((m) => m.statuses.length === 0)).toBe(true);
      if (done.room?.kind === "event") expect(done.room.result!.text).toContain(varn.name);
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
