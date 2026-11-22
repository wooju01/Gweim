// 원정 한 번 (지도 이동·사건·전투, 목적지까지). 후퇴 정책: 전투 뒤 파티 체력 35% 이하이거나 쓰러진 용병이 나오면 맵에서 후퇴
// (목적지 전 후퇴는 귀환길 습격 판정, 습격 전투는 끝까지 싸운다)
import { type SupplyKind } from "@/data/combat";
import { getEvent } from "@/data/events";
import { alive, autoDiscard, bagOver, battleFor, retreatAmbush, battleSpoils, canDescend, chooseEvent, choiceAvailable, descend, finishBattle, leaveRoom, moveTo, startExpedition, type Expedition } from "@/game/dungeon/expedition";
import { nodeById } from "@/game/dungeon/map";
import { giftsReceived, type Battle } from "@/game/combat/engine";
import type { ChoiceTone } from "@/lib/schemas";
import type { Merc } from "@/game/types";
import { fight, patchUp, pickNext, ROUTES } from "./lib";

const KINDS: SupplyKind[] = ["bandage", "antidote", "potion", "greaterPotion"];

/**
 * bossDeaths: 목적지(보스·정예) 전투에서 죽은 수, discarded: 가방이 꽉 차서 버린 개수,
 * gifts: 전투에서 길안내자에게 물자를 받은 횟수 (용병별, 호감 +), tones: 고른 사건 선택지의 태도 (살아 있는 동료가 반응), bossRetreated: 보스 앞에서 후퇴했다
 */
export type Result = { ok: boolean; exp: Expedition; used: Record<SupplyKind, number>; retreated: boolean; ambushed: boolean; ambushDeaths: number; bossDeaths: number; discarded: number; gifts: Record<string, number>; tones: ChoiceTone[]; bossRetreated: boolean };
export type Pack = Record<SupplyKind, number>;
export const PACKS: Record<string, Pack> = {
  "8": { bandage: 4, antidote: 2, potion: 2, greaterPotion: 0 },
  "5": { bandage: 2, antidote: 1, potion: 2, greaterPotion: 0 },
};

/** 원정 하나. retreat: 파티 체력 35% 이하이거나 이번 전투에서 쓰러진 용병이 나오면 맵에서 후퇴 (목적지 전이면 귀환길 습격 판정) */
/**
 * opts.bag: 가방 칸 (기본 8), opts.scout: 길잡이 능력 확률 (기본 0). 가방이 넘치면 가치가 낮은 칸부터 자동으로 버린다.
 * opts.bossRetreat: 보스 앞 후퇴 정책 — 다음 칸이 목적지 보스인데 파티 체력이 이 비율 아래이거나 죽은 동료가 있으면 맵에서 후퇴
 */
export function run(
  p: Merc[],
  depth: number,
  seed: number,
  retreat: boolean,
  pack: Pack,
  opts: { bag?: number; scout?: number; bossRetreat?: number } = {},
): Result {
  const route = ROUTES[seed % ROUTES.length].slice(0, depth);
  let s = seed * 7919 + 1;
  const ns = () => (s = (s * 48271) % 2147483647);
  let exp: Expedition = startExpedition(p, ns(), { ...pack }, undefined, [], [], [], { bag: opts.bag, scoutChance: opts.scout });
  const used: Record<SupplyKind, number> = { bandage: 0, antidote: 0, potion: 0, greaterPotion: 0 };
  const spend = (before: Record<SupplyKind, number>, after: Record<SupplyKind, number>) => {
    for (const k of KINDS) if (before[k] > after[k]) used[k] += before[k] - after[k];
  };
  let bossDeaths = 0;
  let bossRetreated = false;
  const gifts: Record<string, number> = {};
  const tones: ChoiceTone[] = [];
  const addGifts = (b: Battle) => {
    for (const [id, n] of Object.entries(giftsReceived(b))) gifts[id] = (gifts[id] ?? 0) + n;
  };
  const done = (ok: boolean, retreated = false, ambushed = false, ambushDeaths = 0): Result => {
    // 돌아가기 전에도 가방은 넘칠 수 없다
    if (ok && bagOver(exp)) exp = autoDiscard(exp);
    return { ok, exp, used, retreated, ambushed, ambushDeaths, bossDeaths, discarded: exp.discarded ?? 0, gifts, tones, bossRetreated };
  };
  /** 맵에서 후퇴: 귀환길 습격 판정 (목적지 전이니까). 습격이면 끝까지 싸운다 (전투 중 후퇴는 하지 않는다) */
  const mapRetreat = (): Result => {
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
    addGifts(fb);
    exp = finishBattle(exp, fb);
    exp = battleSpoils(exp, fb, ns()).exp;
    const ambushDeaths = exp.members.filter((m) => m.dead).length - deadBefore;
    return done(exp.room?.kind !== "defeat", true, true, ambushDeaths);
  };
  let floor = 0;
  for (let guard = 0; guard < 600; guard++) {
    // 가방이 넘치면 가치가 낮은 칸부터 버린다
    if (bagOver(exp)) exp = autoDiscard(exp);
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
      if (exp.room?.kind === "event" && exp.room.result?.tone) tones.push(exp.room.result.tone);
    }
    if (exp.room) {
      exp = leaveRoom(exp);
      continue;
    }
    const node = nodeById(exp.map, exp.at)!;
    const nextId = pickNext(exp, node.next);
    // 보스 앞 후퇴: 다음 칸이 보스인데 체력이 모자라거나 죽은 동료가 있으면 돌아간다
    if (retreat && opts.bossRetreat !== undefined && nextId === exp.map.goalId && exp.goal?.kind === "boss" && !exp.cleared) {
      const al = alive(exp);
      const ratio = al.reduce((a, m) => a + m.hp, 0) / exp.members.reduce((a, m) => a + m.maxHp, 0);
      if (ratio < opts.bossRetreat || exp.members.some((m) => m.dead)) {
        bossRetreated = true;
        return mapRetreat();
      }
    }
    const r = moveTo(exp, p, nextId, ns())!;
    exp = r.exp;
    if (r.battle) {
      const atGoal = exp.at === exp.map.goalId;
      const deadBefore = exp.members.filter((m) => m.dead).length;
      const s0 = { ...r.battle.supplies };
      let b = fight(r.battle);
      if (!b.outcome) b = { ...b, outcome: "defeat" };
      spend(s0, b.supplies);
      addGifts(b);
      exp = finishBattle(exp, b);
      if (atGoal) bossDeaths += exp.members.filter((m) => m.dead).length - deadBefore;
      exp = battleSpoils(exp, b, ns()).exp;
      if (retreat && exp.room?.kind !== "defeat") {
        const al = alive(exp);
        const ratio = al.reduce((a, m) => a + m.hp, 0) / exp.members.reduce((a, m) => a + m.maxHp, 0);
        const fell = b.log.some((e) => e.type === "downed");
        if (ratio <= 0.35 || fell) return mapRetreat();
      }
    }
  }
  throw new Error("run did not finish");
}

