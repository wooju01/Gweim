// 던전 탐험 한 번의 규칙. 맵 위를 칸 단위로 이동하며, 체력·상태이상·물자가 다음 칸으로 이어진다.
// 쓰러진 용병은 이번 탐험이 끝날 때까지 빠지고, 귀환하면 회복한다 (영구 사망은 나중에).
// 순수 함수만 둔다. 난수는 시드로 받는다.
import { HARMFUL, POTION_HEAL, START_SUPPLIES, type SupplyKind } from "../../data/combat";
import { REST_HEAL_RATIO, TREASURE_COUNT, TREASURE_WEIGHTS, type RoomKind } from "../../data/dungeon";
import { EVENTS, getEvent, type EventEffect, type EventOutcome } from "../../data/events";
import type { ChoiceTone, Stage } from "../../lib/schemas";
import { BOND } from "../../data/bond";
import { mercUnit, startBattleFrom, type Battle, type Status, type Unit } from "../combat/engine";
import { josa } from "../combat/text";
import { createRng, rollInt, type Rng } from "../random";
import type { Merc } from "../types";
import { generateMap, nodeById, type DungeonMap } from "./map";

export type Member = {
  id: string;
  name: string;
  job?: string;
  race?: string;
  hp: number;
  maxHp: number;
  /** 출혈·중독만 다음 칸으로 이어진다 */
  statuses: Status[];
  down: boolean;
};

/** 지금 들어와 있는 칸에서 벌어진 일. null이면 맵에서 다음 칸을 고르는 중 */
export type Room =
  /** talked: 이번 휴식에서 누군가와 이미 이야기했나 (휴식마다 한 번) */
  | { kind: "rest"; lines: string[]; talked: boolean }
  | { kind: "treasure"; lines: string[] }
  | {
      kind: "event";
      eventId: string;
      /** 결과가 나오기 전에는 null */
      result: { choiceId: string; text: string; lines: string[]; tone: ChoiceTone | null } | null;
    }
  | { kind: "goal" }
  /** 전투에서 전멸했다 */
  | { kind: "defeat" };

export type Expedition = {
  map: DungeonMap;
  /** 지금 있는 칸 */
  at: string;
  visited: string[];
  members: Member[];
  supplies: Record<SupplyKind, number>;
  depth: number;
  room: Room | null;
};

// ── 시작 ────────────────────────────────────────────────

export function startExpedition(mercs: Merc[], seed: number): Expedition {
  const map = generateMap(seed);
  return {
    map,
    at: map.startId,
    visited: [map.startId],
    members: mercs.map((m) => {
      const unit = mercUnit(m);
      return { id: m.id, name: m.name, job: m.job, race: m.race, hp: unit.hp, maxHp: unit.maxHp, statuses: [], down: false };
    }),
    supplies: { ...START_SUPPLIES },
    depth: 1,
    room: null,
  };
}

export const alive = (exp: Expedition) => exp.members.filter((m) => !m.down);

// ── 이동 ────────────────────────────────────────────────

export function canMove(exp: Expedition, nodeId: string): boolean {
  if (exp.room) return false;
  return nodeById(exp.map, exp.at)?.next.includes(nodeId) ?? false;
}

/** 이벤트 칸에 들어갈 때 어떤 사건이 나올지. 같은 시드면 같은 사건 */
export function pickEvent(seed: number): string {
  const rng = createRng(seed);
  return EVENTS[Math.floor(rng.next() * EVENTS.length)].id;
}

/**
 * 다음 칸으로 이동한다. 전투 칸이면 battle을 돌려준다 (전투가 끝나면 finishBattle).
 * 휴식·보물은 바로 처리되고, 사건은 선택을 기다린다.
 */
export function moveTo(
  exp: Expedition,
  mercs: Merc[],
  nodeId: string,
  seed: number,
  bonds: Record<string, Stage> = {},
): { exp: Expedition; battle: Battle | null; kind: RoomKind } | null {
  if (!canMove(exp, nodeId)) return null;
  const node = nodeById(exp.map, nodeId)!;
  const next: Expedition = structuredClone({ ...exp, at: nodeId, visited: [...exp.visited, nodeId] });
  const rng = createRng(seed);

  switch (node.kind) {
    case "battle":
      return { exp: next, battle: battleFor(next, mercs, seed, bonds), kind: node.kind };
    case "rest":
      next.room = { kind: "rest", lines: rest(next), talked: false };
      break;
    case "treasure":
      next.room = { kind: "treasure", lines: treasure(next, rng) };
      break;
    case "event":
      next.room = { kind: "event", eventId: pickEvent(seed), result: null };
      break;
    case "goal":
      next.room = { kind: "goal" };
      break;
  }
  return { exp: next, battle: null, kind: node.kind };
}

/** 휴식 칸에서 한 명과 이야기했다고 표시한다 (휴식마다 한 번) */
export function markRestTalk(exp: Expedition): Expedition {
  if (exp.room?.kind !== "rest" || exp.room.talked) return exp;
  return { ...exp, room: { ...exp.room, talked: true } };
}

/**
 * 탐험을 끝낼 때(귀환·후퇴) 쓰러진 동료를 데리고 돌아왔으면 호감이 오른다.
 * 쓰러진 용병 본인과, 함께 돌아온 동료들. 전멸했으면 없다. 용병 id → 호감 변화
 */
export function rescueBonds(exp: Expedition): Record<string, number> {
  if (exp.room?.kind === "defeat") return {};
  const downed = exp.members.filter((m) => m.down);
  if (downed.length === 0) return {};
  return Object.fromEntries(
    exp.members.map((m) => [m.id, m.down ? BOND.rescuedAffinity : BOND.rescuerAffinity * downed.length]),
  );
}

/** 칸에서 할 일을 마치고 맵으로 돌아간다 */
export function leaveRoom(exp: Expedition): Expedition {
  if (!exp.room || exp.room.kind === "goal" || exp.room.kind === "defeat") return exp;
  if (exp.room.kind === "event" && !exp.room.result) return exp;
  return { ...exp, room: null };
}

// ── 전투 ────────────────────────────────────────────────

/** 살아 있는 용병만, 남은 체력과 상태이상, 지금 호감 단계를 들고 전투에 들어간다 */
export function battleFor(exp: Expedition, mercs: Merc[], seed: number, bonds: Record<string, Stage> = {}): Battle {
  const units: Unit[] = alive(exp).flatMap((m) => {
    const merc = mercs.find((x) => x.id === m.id);
    if (!merc) return [];
    return [{ ...mercUnit(merc), hp: m.hp, maxHp: m.maxHp, statuses: structuredClone(m.statuses), bond: bonds[m.id] }];
  });
  return startBattleFrom(units, seed, { depth: exp.depth, supplies: exp.supplies, walked: exp.visited.length - 1 });
}

/** 전투 결과를 탐험에 반영한다. 쓰러진 용병은 빠지고, 강화·약화는 사라진다 */
export function finishBattle(exp: Expedition, battle: Battle): Expedition {
  const members = exp.members.map((m) => {
    const unit = battle.units.find((u) => u.id === m.id && u.side === "merc");
    if (!unit) return m;
    return {
      ...m,
      hp: unit.hp,
      statuses: unit.statuses.filter((s) => HARMFUL.includes(s.kind)),
      down: unit.hp <= 0,
    };
  });
  const next: Expedition = { ...exp, members, supplies: { ...battle.supplies } };
  if (battle.outcome === "defeat" || members.every((m) => m.down)) next.room = { kind: "defeat" };
  return next;
}

// ── 휴식과 보물 ─────────────────────────────────────────

function rest(exp: Expedition): string[] {
  const lines: string[] = [];
  for (const m of alive(exp)) {
    const amount = Math.min(Math.round(m.maxHp * REST_HEAL_RATIO), m.maxHp - m.hp);
    m.hp += amount;
    const cured = m.statuses.length > 0;
    m.statuses = [];
    if (amount > 0 || cured) lines.push(`${m.name} 체력 +${amount}${cured ? ", 상처를 돌봤다" : ""}`);
  }
  return lines.length ? lines : ["모두 기운이 넘친다."];
}

function treasure(exp: Expedition, rng: Rng): string[] {
  const count = rollInt(rng.next, TREASURE_COUNT[0], TREASURE_COUNT[1]);
  const kinds = Object.keys(TREASURE_WEIGHTS) as (keyof typeof TREASURE_WEIGHTS)[];
  const total = kinds.reduce((s, k) => s + TREASURE_WEIGHTS[k], 0);
  const found: Partial<Record<SupplyKind, number>> = {};
  for (let i = 0; i < count; i++) {
    let roll = rng.next() * total;
    const kind = kinds.find((k) => (roll -= TREASURE_WEIGHTS[k]) < 0) ?? kinds[0];
    found[kind] = (found[kind] ?? 0) + 1;
  }
  return supplyLines(exp, found);
}

const SUPPLY_NAME: Record<SupplyKind, string> = { bandage: "붕대", antidote: "해독제", potion: "물약" };

function supplyLines(exp: Expedition, delta: Partial<Record<SupplyKind, number>>): string[] {
  const lines: string[] = [];
  for (const [kind, n] of Object.entries(delta) as [SupplyKind, number][]) {
    if (!n) continue;
    exp.supplies[kind] = Math.max(0, exp.supplies[kind] + n);
    lines.push(`${SUPPLY_NAME[kind]} ${n > 0 ? "+" : ""}${n}`);
  }
  return lines;
}

// ── 맵 위에서 물자 쓰기 ─────────────────────────────────

/** 이동 중에 길안내자가 물자를 건넨다. 할 수 없으면 이유, 할 수 있으면 null */
export function supplyProblem(exp: Expedition, item: SupplyKind, target: string): string | null {
  if (exp.room?.kind === "defeat" || exp.room?.kind === "goal") return "탐험이 끝났다";
  if (exp.supplies[item] <= 0) return "물자가 없다";
  const m = exp.members.find((x) => x.id === target);
  if (!m || m.down) return "건넬 수 없는 대상";
  if (item === "bandage" && !m.statuses.some((s) => s.kind === "bleed")) return "출혈이 없다";
  if (item === "antidote" && !m.statuses.some((s) => s.kind === "poison")) return "중독이 없다";
  if (item === "potion" && m.hp >= m.maxHp) return "체력이 가득하다";
  return null;
}

/** bond: 받는 용병의 호감 단계 (호의 이상이면 물약 +25%) */
export function giveSupply(exp: Expedition, item: SupplyKind, target: string, bond?: Stage): Expedition {
  if (supplyProblem(exp, item, target)) return exp;
  const next = structuredClone(exp);
  const m = next.members.find((x) => x.id === target)!;
  next.supplies[item]--;
  if (item === "bandage") m.statuses = m.statuses.filter((s) => s.kind !== "bleed");
  if (item === "antidote") m.statuses = m.statuses.filter((s) => s.kind !== "poison");
  const multiplier = bond === "warm" || bond === "trusted" ? BOND.supplyMultiplier : 1;
  if (item === "potion") m.hp = Math.min(m.maxHp, m.hp + Math.round(POTION_HEAL * multiplier));
  return next;
}

// ── 사건 ────────────────────────────────────────────────

/** 이 선택지를 지금 고를 수 있는가 (필요한 물자) */
export function choiceAvailable(exp: Expedition, eventId: string, choiceId: string): boolean {
  const choice = getEvent(eventId)?.choices.find((c) => c.id === choiceId);
  if (!choice) return false;
  return Object.entries(choice.needs ?? {}).every(([k, n]) => exp.supplies[k as SupplyKind] >= (n ?? 0));
}

/** 이름에 붙는 조사까지 맞춰 {who}, {helper}를 채운다 */
function fill(text: string, who: string | undefined, helper: string | undefined): string {
  let out = text;
  for (const [key, name] of [["who", who], ["helper", helper]] as const) {
    if (!name) continue;
    out = out
      .replaceAll(`{${key}}이(가)`, josa(name, "이", "가"))
      .replaceAll(`{${key}}을(를)`, josa(name, "을", "를"))
      .replaceAll(`{${key}}`, name);
  }
  return out;
}

function pickOutcome(outcomes: EventOutcome[], rng: Rng): EventOutcome {
  const total = outcomes.reduce((s, o) => s + o.weight, 0);
  let roll = rng.next() * total;
  return outcomes.find((o) => (roll -= o.weight) < 0) ?? outcomes[outcomes.length - 1];
}

function applyEffect(exp: Expedition, effect: EventEffect, rng: Rng): { lines: string[]; who?: string } {
  const lines: string[] = [];
  const living = alive(exp);
  const target = living.length ? living[Math.floor(rng.next() * living.length)] : undefined;
  // 사건 피해로는 쓰러지지 않는다 (최소 체력 1)
  const hurt = (m: Member, n: number) => {
    const dealt = Math.min(n, m.hp - 1);
    m.hp -= dealt;
    if (dealt > 0) lines.push(`${m.name} 체력 -${dealt}`);
  };
  if (effect.damageAll) for (const m of living) hurt(m, effect.damageAll);
  if (effect.damageOne && target) hurt(target, effect.damageOne);
  if (effect.healAll) {
    for (const m of living) {
      const amount = Math.min(effect.healAll, m.maxHp - m.hp);
      m.hp += amount;
      if (amount > 0) lines.push(`${m.name} 체력 +${amount}`);
    }
  }
  if (effect.cureAll) for (const m of living) m.statuses = [];
  if (effect.status && target) {
    const turns = effect.status === "bleed" ? 3 : 4;
    target.statuses = [...target.statuses.filter((s) => s.kind !== effect.status), { kind: effect.status, turns }];
    lines.push(`${target.name} ${effect.status === "bleed" ? "출혈" : "중독"}`);
  }
  if (effect.supply) lines.push(...supplyLines(exp, effect.supply));
  return { lines, who: target?.name };
}

/**
 * 사건 선택지를 고른다. 파티에 맞는 직업·종족이 있으면 그 결과 표를 쓴다.
 * tone은 돌려주기만 한다 (용병 호감도·고용 의향 반영은 상태를 가진 쪽에서 한다).
 */
export function chooseEvent(exp: Expedition, choiceId: string, seed: number): Expedition {
  const room = exp.room;
  if (room?.kind !== "event" || room.result) return exp;
  const template = getEvent(room.eventId);
  const choice = template?.choices.find((c) => c.id === choiceId);
  if (!choice || !choiceAvailable(exp, room.eventId, choiceId)) return exp;

  const next = structuredClone(exp);
  const rng = createRng(seed);
  const expert = choice.expertise
    ? alive(next).find((m) => (choice.expertise!.job && m.job === choice.expertise!.job) || (choice.expertise!.race && m.race === choice.expertise!.race))
    : undefined;
  const outcome = pickOutcome(expert ? choice.expertise!.outcomes : choice.outcomes, rng);
  const { lines, who } = applyEffect(next, outcome.effect, rng);
  next.room = {
    kind: "event",
    eventId: room.eventId,
    result: { choiceId, text: fill(outcome.text, who, expert?.name), lines, tone: choice.tone },
  };
  return next;
}
