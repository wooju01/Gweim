// 원정 한 번 (지도 이동·사건·전투, 목적지까지). 후퇴 정책: 전투 뒤 파티 체력 35% 이하이거나 쓰러진 용병이 나오면 맵에서 후퇴
// (목적지 전 후퇴는 귀환길 습격 판정, 습격 전투는 끝까지 싸운다)
import { type SupplyKind } from "@/data/combat";
import { getEvent } from "@/data/events";
import { alive, battleFor, retreatAmbush, battleSpoils, canDescend, chooseEvent, choiceAvailable, descend, finishBattle, leaveRoom, moveTo, startExpedition, type Expedition } from "@/game/dungeon/expedition";
import { nodeById } from "@/game/dungeon/map";
import type { Merc } from "@/game/types";
import { fight, patchUp, pickNext, ROUTES } from "./lib";

const KINDS: SupplyKind[] = ["bandage", "antidote", "potion", "greaterPotion"];

/** bossDeaths: 목적지(보스·정예) 전투에서 죽은 수 */
export type Result = { ok: boolean; exp: Expedition; used: Record<SupplyKind, number>; retreated: boolean; ambushed: boolean; ambushDeaths: number; bossDeaths: number };
export type Pack = Record<SupplyKind, number>;
export const PACKS: Record<string, Pack> = {
  "8": { bandage: 4, antidote: 2, potion: 2, greaterPotion: 0 },
  "5": { bandage: 2, antidote: 1, potion: 2, greaterPotion: 0 },
};

/** 원정 하나. retreat: 파티 체력 35% 이하이거나 이번 전투에서 쓰러진 용병이 나오면 맵에서 후퇴 (목적지 전이면 귀환길 습격 판정) */
export function run(p: Merc[], depth: number, seed: number, retreat: boolean, pack: Pack): Result {
  const route = ROUTES[seed % ROUTES.length].slice(0, depth);
  let s = seed * 7919 + 1;
  const ns = () => (s = (s * 48271) % 2147483647);
  let exp: Expedition = startExpedition(p, ns(), { ...pack });
  const used: Record<SupplyKind, number> = { bandage: 0, antidote: 0, potion: 0, greaterPotion: 0 };
  const spend = (before: Record<SupplyKind, number>, after: Record<SupplyKind, number>) => {
    for (const k of KINDS) if (before[k] > after[k]) used[k] += before[k] - after[k];
  };
  let bossDeaths = 0;
  const done = (ok: boolean, retreated = false, ambushed = false, ambushDeaths = 0): Result => ({ ok, exp, used, retreated, ambushed, ambushDeaths, bossDeaths });
  let floor = 0;
  for (let guard = 0; guard < 600; guard++) {
    const b0 = { ...exp.supplies };
    exp = patchUp(exp);
    spend(b0, exp.supplies);
    if (exp.room?.kind === "defeat") return done(false);
    if (exp.room?.kind === "goal") {
      if (floor + 1 >= route.length || !canDescend(exp)) return done(true);
      floor++;
      exp = descend(exp, ns(), route[floor])!;
      continue;
    }
    if (exp.room?.kind === "event" && !exp.room.result) {
      const ev = getEvent(exp.room.eventId)!;
      const c = ev.choices.find((c) => c.id === "leave" && choiceAvailable(exp, ev.id, c.id)) ?? ev.choices.find((c) => choiceAvailable(exp, ev.id, c.id))!;
      const e0 = { ...exp.supplies };
      exp = chooseEvent(exp, c.id, ns());
      spend(e0, exp.supplies);
    }
    if (exp.room) {
      exp = leaveRoom(exp);
      continue;
    }
    const node = nodeById(exp.map, exp.at)!;
    const r = moveTo(exp, p, pickNext(exp, node.next), ns())!;
    exp = r.exp;
    if (r.battle) {
      const atGoal = exp.at === exp.map.goalId;
      const deadBefore = exp.members.filter((m) => m.dead).length;
      const s0 = { ...r.battle.supplies };
      let b = fight(r.battle);
      if (!b.outcome) b = { ...b, outcome: "defeat" };
      spend(s0, b.supplies);
      exp = finishBattle(exp, b);
      if (atGoal) bossDeaths += exp.members.filter((m) => m.dead).length - deadBefore;
      exp = battleSpoils(exp, b, ns()).exp;
      if (retreat && exp.room?.kind !== "defeat") {
        const al = alive(exp);
        const ratio = al.reduce((a, m) => a + m.hp, 0) / exp.members.reduce((a, m) => a + m.maxHp, 0);
        const fell = b.log.some((e) => e.type === "downed");
        if (ratio <= 0.35 || fell) {
          // 맵에서 후퇴: 귀환길 습격 판정 (목적지 전이니까). 습격이면 끝까지 싸운다 (전투 중 후퇴는 하지 않는다)
          exp = { ...exp, room: null };
          const b1 = { ...exp.supplies };
          exp = patchUp(exp);
          spend(b1, exp.supplies);
          const monsters = retreatAmbush(exp, ns());
          if (!monsters) return done(true, true);
          const deadBefore = exp.members.filter((m) => m.dead).length;
          const ab = battleFor({ ...exp, returning: true }, p, ns(), {}, undefined, 0, { monsters });
          const a0 = { ...ab.supplies };
          let fb = fight(ab);
          if (!fb.outcome) fb = { ...fb, outcome: "defeat" };
          spend(a0, fb.supplies);
          exp = finishBattle(exp, fb);
          exp = battleSpoils(exp, fb, ns()).exp;
          const ambushDeaths = exp.members.filter((m) => m.dead).length - deadBefore;
          return done(exp.room?.kind !== "defeat", true, true, ambushDeaths);
        }
      }
    }
  }
  throw new Error("run did not finish");
}

