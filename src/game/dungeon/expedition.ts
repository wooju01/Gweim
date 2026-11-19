// 던전 탐험 한 번의 규칙. 맵 위를 칸 단위로 이동하며, 체력·상태이상·물자가 다음 칸으로 이어진다.
// 쓰러진 용병은 이번 탐험이 끝날 때까지 빠지고, 귀환하면 회복한다 (영구 사망은 나중에).
// 순수 함수만 둔다. 난수는 시드로 받는다.
import {
  HARMFUL,
  POTION_HEAL,
  START_SUPPLIES,
  type SupplyKind,
} from "../../data/combat";
import {
  REST_HEAL_RATIO,
  TREASURE_COUNT,
  TREASURE_WEIGHTS,
  type RoomKind,
} from "../../data/dungeon";
import {
  BATTLE_GOLD,
  BATTLE_RELIC_CHANCE,
  CURRENCY,
  GOAL_GOLD,
  TREASURE_GOLD,
  TREASURE_RELIC_CHANCE,
} from "../../data/economy";
import { rollRelic } from "../../data/relics";
import {
  EVENTS,
  getEvent,
  type EventEffect,
  type EventOutcome,
  type EventRequirement,
  type EventUnlock,
} from "../../data/events";
import type { ChoiceTone, Stage } from "../../lib/schemas";
import { BOND } from "../../data/bond";
import {
  mercUnit,
  startBattleFrom,
  type Battle,
  type Status,
  type Unit,
} from "../combat/engine";
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
  /** 이번 탐험에서 한 번이라도 쓰러졌나 (데리고 귀환하면 호감이 오른다) */
  fell?: boolean;
  /** 죽었다 (생존 판정 실패). 탐험에서 영영 빠진다 */
  dead?: boolean;
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
      /** unlocks: 이 선택이 연 숨겨진 칸·이어지는 사건 (아직 맵이 읽지 않는다) */
      result: {
        choiceId: string;
        text: string;
        lines: string[];
        tone: ChoiceTone | null;
        unlocks: EventUnlock[];
      } | null;
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
  /** 이번 원정에서 얻은 금화와 유물 id (살아서 돌아와야 내 것이 된다) */
  gold: number;
  loot: string[];
};

// ── 시작 ────────────────────────────────────────────────

/** pack: 짐에 넣어 가는 물자 (마을 상점에서 산 것) */
export function startExpedition(
  mercs: Merc[],
  seed: number,
  pack: Record<SupplyKind, number> = START_SUPPLIES,
): Expedition {
  const map = generateMap(seed);
  return {
    map,
    at: map.startId,
    visited: [map.startId],
    members: mercs.map((m) => {
      const unit = mercUnit(m);
      return {
        id: m.id,
        name: m.name,
        job: m.job,
        race: m.race,
        hp: unit.hp,
        maxHp: unit.maxHp,
        statuses: [],
        down: false,
      };
    }),
    supplies: { ...pack },
    depth: 1,
    room: null,
    gold: 0,
    loot: [],
  };
}

export const alive = (exp: Expedition) =>
  exp.members.filter((m) => !m.down && !m.dead);

/** 전투에서 이기면 쓰러졌던 용병이 이 체력으로 일어난다 */
export const REVIVE_HP = 1;

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
  const next: Expedition = structuredClone({
    ...exp,
    at: nodeId,
    visited: [...exp.visited, nodeId],
  });
  const rng = createRng(seed);

  switch (node.kind) {
    case "battle":
      return {
        exp: next,
        battle: battleFor(next, mercs, seed, bonds),
        kind: node.kind,
      };
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
      next.gold += GOAL_GOLD;
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
  // 쓰러졌다가 일어난 용병도 포함한다 (체력 1로 일어나도 데려온 건 동료들이다)
  // 죽은 용병은 데려올 수 없다
  const living = exp.members.filter((m) => !m.dead);
  const fallen = living.filter((m) => m.down || m.fell);
  if (fallen.length === 0) return {};
  return Object.fromEntries(
    living.map((m) => [
      m.id,
      m.down || m.fell
        ? BOND.rescuedAffinity
        : BOND.rescuerAffinity * fallen.length,
    ]),
  );
}

/** 칸에서 할 일을 마치고 맵으로 돌아간다 */
export function leaveRoom(exp: Expedition): Expedition {
  if (!exp.room || exp.room.kind === "goal" || exp.room.kind === "defeat")
    return exp;
  if (exp.room.kind === "event" && !exp.room.result) return exp;
  return { ...exp, room: null };
}

// ── 전투 ────────────────────────────────────────────────

/** 살아 있는 용병만, 남은 체력과 상태이상, 지금 호감 단계를 들고 전투에 들어간다 */
export function battleFor(
  exp: Expedition,
  mercs: Merc[],
  seed: number,
  bonds: Record<string, Stage> = {},
): Battle {
  const units: Unit[] = alive(exp).flatMap((m) => {
    const merc = mercs.find((x) => x.id === m.id);
    if (!merc) return [];
    return [
      {
        ...mercUnit(merc),
        hp: m.hp,
        maxHp: m.maxHp,
        statuses: structuredClone(m.statuses),
        bond: bonds[m.id],
      },
    ];
  });
  return startBattleFrom(units, seed, {
    depth: exp.depth,
    supplies: exp.supplies,
    walked: exp.visited.length - 1,
  });
}

/**
 * 전투 결과를 탐험에 반영한다. 강화·약화는 사라진다.
 * 이기면 쓰러졌던 용병은 체력 1로 일어난다 (전멸하면 모두 쓰러진 채로).
 */
export function finishBattle(exp: Expedition, battle: Battle): Expedition {
  const won = battle.outcome === "victory";
  const members = exp.members.map((m) => {
    const unit = battle.units.find((u) => u.id === m.id && u.side === "merc");
    if (!unit) return m;
    const fellNow = unit.hp <= 0;
    if (unit.dead)
      return { ...m, hp: 0, statuses: [], down: true, fell: true, dead: true };
    return {
      ...m,
      hp: fellNow && won ? REVIVE_HP : unit.hp,
      statuses: unit.statuses.filter((s) => HARMFUL.includes(s.kind)),
      down: fellNow && !won,
      fell: m.fell || fellNow,
    };
  });
  const next: Expedition = {
    ...exp,
    members,
    supplies: { ...battle.supplies },
  };
  if (battle.outcome === "defeat" || members.every((m) => m.down))
    next.room = { kind: "defeat" };
  return next;
}

// ── 휴식과 보물 ─────────────────────────────────────────

function rest(exp: Expedition): string[] {
  const lines: string[] = [];
  for (const m of alive(exp)) {
    const amount = Math.min(
      Math.round(m.maxHp * REST_HEAL_RATIO),
      m.maxHp - m.hp,
    );
    m.hp += amount;
    const cured = m.statuses.length > 0;
    m.statuses = [];
    if (amount > 0 || cured)
      lines.push(`${m.name} 체력 +${amount}${cured ? ", 상처를 돌봤다" : ""}`);
  }
  return lines.length ? lines : ["모두 기운이 넘친다."];
}

/** 금화와 유물을 얻는다. 화면에 보일 줄을 돌려준다 */
function gain(
  exp: Expedition,
  gold: number,
  relics: number,
  rng: Rng,
): string[] {
  const lines: string[] = [];
  if (gold > 0) {
    exp.gold += gold;
    lines.push(`${CURRENCY} +${gold}`);
  }
  for (let i = 0; i < relics; i++) {
    const relic = rollRelic(rng);
    exp.loot.push(relic.id);
    lines.push(`유물: ${relic.name}`);
  }
  return lines;
}

/** 전투에서 이기면: 적 한 마리당 금화, 가끔 유물 */
export function battleSpoils(
  exp: Expedition,
  battle: Battle,
  seed: number,
): { exp: Expedition; lines: string[] } {
  if (battle.outcome !== "victory") return { exp, lines: [] };
  const rng = createRng(seed);
  const next = structuredClone(exp);
  const enemies = battle.units.filter((u) => u.side === "enemy").length;
  let gold = 0;
  for (let i = 0; i < enemies; i++)
    gold += rollInt(rng.next, BATTLE_GOLD[0], BATTLE_GOLD[1]);
  const lines = gain(next, gold, rng.next() < BATTLE_RELIC_CHANCE ? 1 : 0, rng);
  return { exp: next, lines };
}

function treasure(exp: Expedition, rng: Rng): string[] {
  const count = rollInt(rng.next, TREASURE_COUNT[0], TREASURE_COUNT[1]);
  const kinds = Object.keys(
    TREASURE_WEIGHTS,
  ) as (keyof typeof TREASURE_WEIGHTS)[];
  const total = kinds.reduce((s, k) => s + TREASURE_WEIGHTS[k], 0);
  const found: Partial<Record<SupplyKind, number>> = {};
  for (let i = 0; i < count; i++) {
    let roll = rng.next() * total;
    const kind =
      kinds.find((k) => (roll -= TREASURE_WEIGHTS[k]) < 0) ?? kinds[0];
    found[kind] = (found[kind] ?? 0) + 1;
  }
  const gold = rollInt(rng.next, TREASURE_GOLD[0], TREASURE_GOLD[1]);
  return [
    ...supplyLines(exp, found),
    ...gain(exp, gold, rng.next() < TREASURE_RELIC_CHANCE ? 1 : 0, rng),
  ];
}

const SUPPLY_NAME: Record<SupplyKind, string> = {
  bandage: "붕대",
  antidote: "해독제",
  potion: "물약",
};

function supplyLines(
  exp: Expedition,
  delta: Partial<Record<SupplyKind, number>>,
): string[] {
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
export function supplyProblem(
  exp: Expedition,
  item: SupplyKind,
  target: string,
): string | null {
  if (exp.room?.kind === "defeat" || exp.room?.kind === "goal")
    return "탐험이 끝났다";
  if (exp.supplies[item] <= 0) return "물자가 없다";
  const m = exp.members.find((x) => x.id === target);
  if (!m || m.down) return "건넬 수 없는 대상";
  if (item === "bandage" && !m.statuses.some((s) => s.kind === "bleed"))
    return "출혈이 없다";
  if (item === "antidote" && !m.statuses.some((s) => s.kind === "poison"))
    return "중독이 없다";
  if (item === "potion" && m.hp >= m.maxHp) return "체력이 가득하다";
  return null;
}

/** bond: 받는 용병의 호감 단계 (호의 이상이면 물약 +25%) */
export function giveSupply(
  exp: Expedition,
  item: SupplyKind,
  target: string,
  bond?: Stage,
): Expedition {
  if (supplyProblem(exp, item, target)) return exp;
  const next = structuredClone(exp);
  const m = next.members.find((x) => x.id === target)!;
  next.supplies[item]--;
  if (item === "bandage")
    m.statuses = m.statuses.filter((s) => s.kind !== "bleed");
  if (item === "antidote")
    m.statuses = m.statuses.filter((s) => s.kind !== "poison");
  const multiplier =
    bond === "warm" || bond === "trusted" ? BOND.supplyMultiplier : 1;
  if (item === "potion")
    m.hp = Math.min(m.maxHp, m.hp + Math.round(POTION_HEAL * multiplier));
  return next;
}

// ── 사건 ────────────────────────────────────────────────

const STAGE_ORDER: Stage[] = ["hostile", "wary", "neutral", "warm", "trusted"];
const STAGE_NAME: Record<Stage, string> = {
  hostile: "적대",
  wary: "경계",
  neutral: "중립",
  warm: "호의",
  trusted: "신뢰",
};
const JOB_NAME: Record<string, string> = {
  knight: "기사",
  assassin: "암살자",
  nun: "수녀",
  archer: "궁수",
  greatsword: "대검사",
  herbalist: "약초꾼",
  mage: "마법사",
  spiritcaller: "정령사",
};
const RACE_NAME: Record<string, string> = {
  human: "인간",
  dwarf: "드워프",
  elf: "엘프",
  beastfolk: "수인",
  barbarian: "바바리안",
};

/** 조건(직업·종족·호감)에 맞아 나설 살아 있는 동료. 조건이 없으면 undefined */
export function helperFor(
  exp: Expedition,
  req: EventRequirement | undefined,
  bonds: Record<string, Stage> = {},
): Member | undefined {
  if (!req || (!req.job && !req.race && !req.bond)) return undefined;
  return alive(exp).find(
    (m) =>
      (!req.job || m.job === req.job) &&
      (!req.race || m.race === req.race) &&
      (!req.bond ||
        STAGE_ORDER.indexOf(bonds[m.id] ?? "neutral") >=
          STAGE_ORDER.indexOf(req.bond)),
  );
}

/** 이 선택지를 지금 고를 수 없는 이유. 고를 수 있으면 null */
export function choiceProblem(
  exp: Expedition,
  eventId: string,
  choiceId: string,
  bonds: Record<string, Stage> = {},
): string | null {
  const choice = getEvent(eventId)?.choices.find((c) => c.id === choiceId);
  if (!choice) return "없는 선택지";
  const req = choice.requires;
  const need = { ...req?.items };
  for (const [k, n] of Object.entries(choice.consumes ?? {}))
    need[k as SupplyKind] = Math.max(need[k as SupplyKind] ?? 0, n ?? 0);
  for (const [k, n] of Object.entries(need) as [SupplyKind, number][]) {
    if (exp.supplies[k] < n) return `${SUPPLY_NAME[k]} ${n} 필요`;
  }
  if (req && (req.job || req.race || req.bond) && !helperFor(exp, req, bonds)) {
    if (req.job) return `${JOB_NAME[req.job] ?? req.job}이(가) 있어야 한다`;
    if (req.race)
      return `${RACE_NAME[req.race] ?? req.race} 동료가 있어야 한다`;
    return `${STAGE_NAME[req.bond!]} 단계인 동료가 있어야 한다`;
  }
  return null;
}

export function choiceAvailable(
  exp: Expedition,
  eventId: string,
  choiceId: string,
  bonds: Record<string, Stage> = {},
): boolean {
  return choiceProblem(exp, eventId, choiceId, bonds) === null;
}

/** 이름에 붙는 조사까지 맞춰 {who}, {helper}를 채운다 */
function fill(
  text: string,
  who: string | undefined,
  helper: string | undefined,
): string {
  let out = text;
  for (const [key, name] of [
    ["who", who],
    ["helper", helper],
  ] as const) {
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
  return (
    outcomes.find((o) => (roll -= o.weight) < 0) ??
    outcomes[outcomes.length - 1]
  );
}

function applyEffect(
  exp: Expedition,
  effect: EventEffect,
  rng: Rng,
): { lines: string[]; who?: string } {
  const lines: string[] = [];
  const living = alive(exp);
  const target = living.length
    ? living[Math.floor(rng.next() * living.length)]
    : undefined;
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
    target.statuses = [
      ...target.statuses.filter((s) => s.kind !== effect.status),
      { kind: effect.status, turns },
    ];
    lines.push(`${target.name} ${effect.status === "bleed" ? "출혈" : "중독"}`);
  }
  if (effect.supply) lines.push(...supplyLines(exp, effect.supply));
  lines.push(...gain(exp, effect.gold ?? 0, effect.relics ?? 0, rng));
  return { lines, who: target?.name };
}

/**
 * 사건 선택지를 고른다. 파티에 맞는 직업·종족이 있으면 그 결과 표를 쓴다.
 * tone은 돌려주기만 한다 (용병 호감도·고용 의향 반영은 상태를 가진 쪽에서 한다).
 */
export function chooseEvent(
  exp: Expedition,
  choiceId: string,
  seed: number,
  bonds: Record<string, Stage> = {},
): Expedition {
  const room = exp.room;
  if (room?.kind !== "event" || room.result) return exp;
  const choice = getEvent(room.eventId)?.choices.find((c) => c.id === choiceId);
  if (!choice || !choiceAvailable(exp, room.eventId, choiceId, bonds))
    return exp;

  const next = structuredClone(exp);
  const rng = createRng(seed);
  const helper = helperFor(next, choice.requires, bonds);
  const lines: string[] = [];
  // 소모 → 고정 보상 → 결과 순서
  if (choice.consumes) {
    lines.push(
      ...supplyLines(
        next,
        Object.fromEntries(
          Object.entries(choice.consumes).map(([k, n]) => [k, -(n ?? 0)]),
        ),
      ),
    );
  }
  if (choice.rewards)
    lines.push(...applyEffect(next, choice.rewards, rng).lines);
  const outcome = pickOutcome(choice.outcomes, rng);
  const applied = applyEffect(next, outcome.effect, rng);
  lines.push(...applied.lines);
  next.room = {
    kind: "event",
    eventId: room.eventId,
    result: {
      choiceId,
      text: fill(outcome.text, applied.who, helper?.name),
      lines,
      tone: choice.tone,
      unlocks: choice.unlocks ?? [],
    },
  };
  return next;
}
