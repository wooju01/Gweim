// 던전 탐험 한 번의 규칙. 맵 위를 칸 단위로 이동하며, 체력·상태이상·물자가 다음 칸으로 이어진다.
// 쓰러진 용병은 이번 탐험이 끝날 때까지 빠지고, 귀환하면 회복한다 (영구 사망은 나중에).
// 순수 함수만 둔다. 난수는 시드로 받는다.
import {
  HARMFUL,
  DOT,
  isDot,
  POTION_HEAL,
  POTION_POWER,
  isPotion,
  START_SUPPLIES,
  type StatusKind,
  type SupplyKind,
} from "@/data/combat";
import {
  depthGold,
  floorCells,
  GOAL_ELITES,
  GOAL_FALLBACK,
  GOAL_TREASURE,
  REST_HEAL_RATIO,
  TREASURE_SUPPLY_CHANCE,
  TREASURE_WEIGHTS,
  XP_RATE_BY_GAP,
  type GoalContent,
  type RoomKind,
} from "@/data/dungeon";
import {
  BATTLE_GOLD,
  CURRENCY,
  GOAL_GOLD,
  FIRST_FLOOR_GOLD,
  RETREAT_AMBUSH,
  TREASURE_GOLD,
  TREASURE_RELIC_CHANCE,
} from "@/data/economy";
import { getRelic, rollRelic } from "@/data/relics";
import { BAG_BASE, STACK } from "@/data/facilities";
import { PRICE } from "@/data/economy";
import { XP_GOAL_BONUS, XP_PER_SQUARE } from "@/data/growth";
import { FIRST_DUNGEON, getDungeon, getRegion, hiddenFrom, recommendedGrade, type Region } from "@/data/regions";
import type { BossFeat } from "@/game/quests";
import { ELITE_DROP_ROLLS, getMonster } from "@/data/monsters";
import { RANK_DROPS, rollMonsterDrops } from "@/data/drops";
import { KEY_ITEMS, isKeyItem, type KeyItemId } from "@/data/keyItems";
import { RANK_ORDER } from "@/data/ranks";
import { TREASURE_TRINKET_CHANCE, rollTrinket } from "@/data/trinkets";
import { addSalvage, getSalvage, rollDrops } from "@/data/loot";
import {
  EVENTS,
  getEvent,
  type EventEffect,
  type EventOutcome,
  type EventRequirement,
  type EventUnlock,
  type FloorMod,
  type NextBattle,
} from "@/data/events";
import type { ChoiceTone, Element, MercLevel, Stage } from "@/lib/schemas";
import { getFragment } from "@/data/fragments";
import { BOND } from "@/data/bond";
import { JOBS } from "@/data/traits";
import {
  eventEncounter,
  rollEncounter,
  mercUnit,
  startBattleFrom,
  type Battle,
  type Status,
  type Unit,
} from "@/game/combat/engine";
import { josa } from "@/game/combat/text";
import { createRng, rollInt, type Rng } from "@/game/random";
import type { Merc } from "@/game/types";
import { generateMap, insertAfter, nodeById, revealTreasureCell, skipAfter, type DungeonMap } from "./map";

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
  /** 마지막 숨결 펜던트를 이번 원정에서 쓴 횟수 */
  breathUsed?: number;
  /** 사건 조건용: 낀 원소 조각(마법사), 속도 */
  elements?: Element[];
  speed?: number;
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
  /** lines: 목적지에서 찾은 것 (보물 목적지) */
  | { kind: "goal"; lines?: string[] }
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
  /** 이번 원정에서 얻은 유실물 (id별 개수) */
  salvage: Record<string, number>;
  /** 이번 원정에서 찾은 장신구 id (1단계. 살아서 돌아와야 내 것이 된다) */
  trinkets?: string[];
  /** 죽은 용병과 함께 던전에 남은 장신구 이름 (결산에 보여 준다) */
  lostTrinkets?: string[];
  /** 던전과 지금 지역 (data/regions.ts). 이전 저장에는 없다 → 미지의 숲 1층 */
  dungeon?: string;
  region?: string;
  /** 이 층 목적지의 보스를 쓰러뜨렸다 */
  cleared?: boolean;
  /** 이 층 목적지에 무엇이 있나 (층을 만들 때 정한다) */
  goal?: GoalContent;
  /** 앞 층들에서 걸은 칸 수 (깊은 곳의 피 패시브) */
  walked?: number;
  /** 이번 원정에서 쌓인 경험치 합 (칸마다 층 수만큼, 목적지마다 보너스 × 층) */
  xp?: number;
  /** 권장 등급별로 쌓인 경험치. 귀환할 때 용병 등급과 비교해 배율을 곱한다 (xpFor) */
  xpBy?: Partial<Record<MercLevel, number>>;
  /** 원정을 시작할 때 클랜 창고에 있던 히든 열쇠 */
  keys?: KeyItemId[];
  /** 이번 원정에서 얻은 히든 열쇠 (살아 돌아와야 창고에 들어간다) */
  keyFound?: KeyItemId[];
  /** 이 층에서 히든 사건이 이미 나왔나 (층마다 한 번) */
  hiddenOffered?: boolean;
  /** 히든 사건으로 열린 다음 갈래 (이 층의 다음 갈래가 이 지역으로 바뀐다) */
  hiddenNext?: string;
  /** 히든 층에 들어갔다: 쓴 열쇠 (보스를 잡고 나오면 소모, 후퇴하면 유지, 전멸하면 잃는다) */
  keyUsed?: KeyItemId;
  /** 이번 원정에서 쓰러뜨린 몬스터 (종류별)와 그중 정예 (직접 의뢰 목표) */
  kills?: Record<string, number>;
  eliteKills?: Record<string, number>;
  /** 의뢰 기록: 들어선 지역, 끝 칸(목적지)까지 간 지역, 보스 전투(조건부 목표), 구출한 사건 */
  regions?: string[];
  goals?: string[];
  feats?: BossFeat[];
  rescued?: string[];
  /** 사건: 이번 원정에서 본 사건 (다시 나오지 않는다) / 전에 본 적 있는 사건 (처음 보는 사건이 조금 잘 나온다) */
  seenEvents?: string[];
  seenEver?: string[];
  /** 사건 효과: 다음 전투 보정, 이번 층 몬스터 변화, 저주, 바로 시작할 사건 전투, 다음 전투 보상 배율 */
  nextBattle?: NextBattle;
  floorMods?: FloorMod[];
  curse?: { status: StatusKind; battles: number };
  pendingBattle?: { monsters: string[]; elites?: number };
  rewardMul?: number;
  /** 사건 효과: 돌아가면 반영할 것 (정보, 명성, 합류 용병, 할인) */
  infos?: string[];
  fameDelta?: number;
  recruits?: number;
  discounts?: { facility: "forge" | "shop"; days: number }[];
  /** 귀환길: 후퇴해서 마을로 가는 중 (습격 판정을 이미 했다) / 습격을 당했다 */
  returning?: boolean;
  ambushed?: boolean;
  /** 사건 효과: 상태 쪽에서 바로 반영할 호감 변화 (반영하면 비운다) */
  affinityDeltas?: Record<string, number>;
  /** 받아 둔 구출 의뢰의 사건 (그 지역 사건 칸에 먼저 나온다) / 이미 나온 것 */
  questEvents?: { eventId: string; regionId: string }[];
  questOffered?: string[];
  /** 가방 칸 수 (data/facilities.ts의 bagSlots). 없으면 기본 */
  bag?: number;
  /** 가방에서 버린 히든 열쇠 (창고에서 가져온 것이면 귀환할 때 창고에서도 사라진다) */
  keysLost?: KeyItemId[];
  /** 가방이 꽉 차서 버린 것 (개수, 시뮬레이션·결산용) */
  discarded?: number;
  /** 길잡이 능력: 다음 칸의 내용을 미리 알 확률과, 미리 알아 둔 칸 (몬스터 구성·사건) */
  scoutChance?: number;
  scouted?: Record<string, Scout>;
};

/** 길잡이가 미리 알아 둔 칸의 내용. 그 칸에 들어가면 이대로 나온다 */
export type Scout = { kind: "battle"; enemies: Unit[] } | { kind: "event"; eventId: string };

// ── 시작 ────────────────────────────────────────────────

/** pack: 짐에 넣어 가는 물자 (마을 상점에서 산 것) */
export function startExpedition(
  mercs: Merc[],
  seed: number,
  pack: Record<SupplyKind, number> = START_SUPPLIES,
  dungeonId: string = FIRST_DUNGEON,
  keys: KeyItemId[] = [],
  questEvents: { eventId: string; regionId: string }[] = [],
  seenEver: string[] = [],
  opts: { bag?: number; scoutChance?: number } = {},
): Expedition {
  const dungeon = getDungeon(dungeonId) ?? getDungeon(FIRST_DUNGEON)!;
  const region = getRegion(dungeon.entry)!;
  // 1층 첫 칸에는 휴식이 나오지 않는다 (2층부터는 그대로)
  const map = generateMap(seed, cellsOf(region), { noRestFirst: region.depth === 1 });
  // 첫 칸에서 다음 칸들을 살핀다 (길잡이 능력)
  return scoutAhead({
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
        elements: elementsOf(m),
        speed: unit.speed,
      };
    }),
    supplies: { ...pack },
    depth: 1,
    room: null,
    gold: 0,
    loot: [],
    salvage: {},
    trinkets: [],
    xp: 0,
    xpBy: {},
    walked: 0,
    keys: [...keys],
    keyFound: [],
    dungeon: dungeon.id,
    region: region.id,
    goal: planGoal(region, seed),
    regions: [region.id],
    goals: [],
    feats: [],
    rescued: [],
    questEvents,
    questOffered: [],
    seenEvents: [],
    seenEver: [...seenEver],
    bag: opts.bag ?? BAG_BASE,
    keysLost: [],
    discarded: 0,
    scoutChance: opts.scoutChance ?? 0,
    scouted: {},
  }, seed);
}

/** 원정을 시작했다: 첫 칸에서 다음 칸들을 살핀다 (길잡이 능력) */
export function scoutAhead(exp: Expedition, seed: number): Expedition {
  const chance = exp.scoutChance ?? 0;
  const here = nodeById(exp.map, exp.at);
  if (!here || chance <= 0) return exp;
  const rng = createRng(seed ^ 0x5c0);
  const scouted = { ...(exp.scouted ?? {}) };
  for (const id of here.next) {
    if (scouted[id] || exp.visited.includes(id)) continue;
    const node = nodeById(exp.map, id);
    if (!node || rng.next() >= chance) continue;
    if (node.kind === "battle" && !node.boss) scouted[id] = { kind: "battle", enemies: rollEncounter(rng, regionOf(exp), 0, exp.floorMods ?? []) };
    else if (node.kind === "event") {
      const eventId = pickEvent(Math.floor(rng.next() * 2 ** 31), exp.region, [...(exp.seenEvents ?? []), ...Object.values(scouted).flatMap((x) => (x.kind === "event" ? [x.eventId] : []))], exp.seenEver);
      scouted[id] = { kind: "event", eventId };
    }
  }
  return { ...exp, scouted };
}

// ── 가방 ────────────────────────────────────────────────
// 칸을 차지하는 것: 물자(한 칸 STACK.supply개), 재료·유실물(한 칸 STACK.item개), 유물·히든 열쇠(한 칸에 하나). 금화·장신구는 칸이 없다

/** 가방에 든 것 한 줄 (가방 창) */
export type BagItem = { kind: "supply" | "salvage" | "relic" | "key"; id: string; n: number; slots: number; value: number };

/** 가방에 든 히든 열쇠 (창고에서 가져온 것 + 이번에 찾은 것) */
export function bagKeys(exp: Expedition): KeyItemId[] {
  return [...(exp.keys ?? []), ...(exp.keyFound ?? [])];
}

export function bagItems(exp: Expedition): BagItem[] {
  const out: BagItem[] = [];
  for (const [k, n] of Object.entries(exp.supplies) as [SupplyKind, number][])
    if (n > 0) out.push({ kind: "supply", id: k, n, slots: Math.ceil(n / STACK.supply), value: n * (PRICE[k] ?? 0) });
  for (const [id, n] of Object.entries(exp.salvage ?? {}))
    if (n > 0) out.push({ kind: "salvage", id, n, slots: Math.ceil(n / STACK.item), value: n * (getSalvage(id)?.value ?? 0) });
  const relics: Record<string, number> = {};
  for (const id of exp.loot) relics[id] = (relics[id] ?? 0) + 1;
  for (const [id, n] of Object.entries(relics)) out.push({ kind: "relic", id, n, slots: n, value: n * (getRelic(id)?.value ?? 0) });
  for (const id of bagKeys(exp)) out.push({ kind: "key", id, n: 1, slots: 1, value: 0 });
  return out;
}

export function bagUsed(exp: Expedition): number {
  return bagItems(exp).reduce((s, x) => s + x.slots, 0);
}

/** 가방이 넘쳤다 (버릴 것을 고르기 전에는 움직일 수 없다) */
export function bagOver(exp: Expedition): boolean {
  return bagUsed(exp) > (exp.bag ?? BAG_BASE);
}

/** 가방에서 n개를 버린다 (히든 열쇠를 버리면 사라진다). 버릴 수 없으면 null */
export function discardItem(exp: Expedition, item: { kind: BagItem["kind"]; id: string; n?: number }): Expedition | null {
  const n = Math.max(1, item.n ?? 1);
  const count = { ...exp, discarded: (exp.discarded ?? 0) + n };
  switch (item.kind) {
    case "supply": {
      const k = item.id as SupplyKind;
      if ((exp.supplies[k] ?? 0) < n) return null;
      return { ...count, supplies: { ...exp.supplies, [k]: exp.supplies[k] - n } };
    }
    case "salvage": {
      const have = exp.salvage?.[item.id] ?? 0;
      if (have < n) return null;
      const salvage = { ...exp.salvage, [item.id]: have - n };
      if (salvage[item.id] <= 0) delete salvage[item.id];
      return { ...count, salvage };
    }
    case "relic": {
      const loot = [...exp.loot];
      for (let i = 0; i < n; i++) {
        const at = loot.indexOf(item.id);
        if (at < 0) return null;
        loot.splice(at, 1);
      }
      return { ...count, loot };
    }
    case "key": {
      const id = item.id as KeyItemId;
      if (exp.keyFound?.includes(id)) return { ...count, discarded: (exp.discarded ?? 0) + 1, keyFound: exp.keyFound.filter((k) => k !== id) };
      if (!exp.keys?.includes(id)) return null;
      return { ...count, discarded: (exp.discarded ?? 0) + 1, keys: exp.keys.filter((k) => k !== id), keysLost: [...(exp.keysLost ?? []), id] };
    }
  }
}

/** 자동 정리 (시뮬레이션): 가방이 넘치면 한 칸씩, 그 칸의 가치가 가장 낮은 것부터 버린다 (히든 열쇠·전수관 재료는 마지막) */
export function autoDiscard(exp: Expedition): Expedition {
  let next = exp;
  for (let guard = 0; guard < 100 && bagOver(next); guard++) {
    const items = bagItems(next).filter((x) => x.kind !== "key");
    if (!items.length) break;
    const worth = (x: BagItem) => {
      const unit = x.value / x.n;
      const sal = x.kind === "salvage" ? getSalvage(x.id) : undefined;
      // 교본·종족 유물·보스 증표는 값이 0이지만 귀하다
      const precious = sal && (sal.kind === "book" || sal.kind === "raceRelic" || sal.kind === "bossToken") ? 1000 : 0;
      const n = x.kind === "relic" ? 1 : x.n % (x.kind === "supply" ? STACK.supply : STACK.item) || (x.kind === "supply" ? STACK.supply : STACK.item);
      return { n: Math.min(n, x.n), cost: (unit + precious) * Math.min(n, x.n) };
    };
    const pick = items.map((x) => ({ x, ...worth(x) })).sort((a, b) => a.cost - b.cost)[0];
    next = discardItem(next, { kind: pick.x.kind, id: pick.x.id, n: pick.n }) ?? next;
  }
  return next;
}

/** 용병이 낀 원소 (스킬의 원소 부 조각 + 원소술사의 원소) */
function elementsOf(m: Merc): Element[] {
  const fromSkills = (m.skills ?? []).flatMap((b) => b.subs.flatMap((id) => {
    const f = getFragment(id);
    return f?.kind === "sub" && f.element ? [f.element] : [];
  }));
  return [...new Set([...fromSkills, ...(m.elements ?? [])])];
}

/** 층 칸 수 범위: 지역에 정해져 있으면 그것, 아니면 층 기본값 */
export function cellsOf(region: Region): { min: number; max: number } {
  return region.cells ?? floorCells(region.depth);
}

/**
 * 목적지에 무엇이 있을지 정한다 (층을 만들 때 한 번).
 * 보스 확률에 걸리면 후보 중 가중치로 하나 (가중치 0은 나오지 않는다), 아니면 보물이나 정예 전투.
 * force를 주면 반드시 그 보스 (나중에 의뢰의 "필수 적")
 */
export function planGoal(region: Region, seed: number, force?: string): GoalContent {
  const rng = createRng(seed ^ 0x5bd1e995);
  if (force) return { kind: "boss", id: force };
  const pool = (region.boss?.pool ?? []).filter((p) => p.weight > 0 && getMonster(p.monsterId));
  if (pool.length && rng.next() < region.boss!.chance) {
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let roll = rng.next() * total;
    const pick = pool.find((p) => (roll -= p.weight) < 0) ?? pool[pool.length - 1];
    return { kind: "boss", id: pick.monsterId, ...(pick.warn ? { warn: true } : {}) };
  }
  const t = GOAL_FALLBACK.treasure;
  return rng.next() * (t + GOAL_FALLBACK.elite) < t ? { kind: "treasure" } : { kind: "elite" };
}

/** 보스 직전 칸(다음 칸이 목적지)에 서 있고, 목적지 보스가 경고 대상인가 */
export function bossWarning(exp: Expedition): boolean {
  if (exp.goal?.kind !== "boss" || !exp.goal.warn || exp.room) return false;
  return nodeById(exp.map, exp.at)?.next.includes(exp.map.goalId) ?? false;
}

/** 지금 지역 (이전 저장은 첫 던전의 입구 지역) */
export function regionOf(exp: Expedition): Region {
  return getRegion(exp.region ?? "") ?? getRegion(getDungeon(FIRST_DUNGEON)!.entry)!;
}

/** 목적지에서 고를 수 있는 다음 갈래 (끝 지역이면 없다). 히든 사건으로 열렸으면 히든 지역 하나 */
export function nextRegions(exp: Expedition): Region[] {
  if (exp.hiddenNext) return [getRegion(exp.hiddenNext)].flatMap((r) => r ?? []);
  return regionOf(exp).next.flatMap((id) => getRegion(id) ?? []);
}

export const alive = (exp: Expedition) =>
  exp.members.filter((m) => !m.down && !m.dead);

/** 전투에서 이기면 쓰러졌던 용병이 이 체력으로 일어난다 */
export const REVIVE_HP = 1;

// ── 이동 ────────────────────────────────────────────────

export function canMove(exp: Expedition, nodeId: string): boolean {
  // 가방이 넘치면 버릴 것을 먼저 고른다
  if (exp.room || bagOver(exp)) return false;
  return nodeById(exp.map, exp.at)?.next.includes(nodeId) ?? false;
}

/**
 * 사건 칸에 어떤 사건이 나올지 (히든·의뢰 사건은 빼고). 같은 시드면 같은 사건.
 * 지역 전용 풀 EVENT_REGION_SHARE / 공용 풀 나머지. 이번 원정에서 본 사건은 다시 나오지 않고,
 * 한 번도 본 적 없는 사건은 가중치가 EVENT_NEW_WEIGHT배
 */
export function pickEvent(seed: number, region?: string, seenRun: string[] = [], seenEver: string[] = []): string {
  const rng = createRng(seed);
  const usable = EVENTS.filter((e) => !e.hidden && !e.quest);
  const fresh = usable.filter((e) => !seenRun.includes(e.id));
  const local = fresh.filter((e) => e.region && e.region === region);
  const common = fresh.filter((e) => !e.region);
  let pool = rng.next() < EVENT_REGION_SHARE ? local : common;
  if (pool.length === 0) pool = local.length ? local : common;
  // 다 봤으면 공용 사건에서 다시 (지역 사건도 다 봤을 때)
  if (pool.length === 0) pool = usable.filter((e) => !e.region);
  const w = (id: string) => (seenEver.includes(id) ? 1 : EVENT_NEW_WEIGHT);
  let roll = rng.next() * pool.reduce((a, e) => a + w(e.id), 0);
  return (pool.find((e) => (roll -= w(e.id)) < 0) ?? pool[pool.length - 1]).id;
}

/** 사건 칸에서 지역 전용 사건이 나올 몫, 처음 보는 사건 가중치 */
export const EVENT_REGION_SHARE = 0.6;
export const EVENT_NEW_WEIGHT = 1.5;

/**
 * 이 층에서 나올 수 있는 히든 사건: 이 지역에서 열리는 히든 지역이 있고, 그 열쇠가 창고에 있고,
 * 이 층에서 아직 나오지 않았으면
 */
export function hiddenEventFor(exp: Expedition): Region | undefined {
  if (exp.hiddenOffered || exp.hiddenNext) return undefined;
  // 열쇠가 가방에 있어야 한다 (창고에 두고 오면 나오지 않는다)
  const keys = bagKeys(exp);
  return hiddenFrom(regionOf(exp).id).find((r) => keys.includes(r.hidden!.keyItem));
}

/** 권장 등급별로 경험치를 쌓는다 */
function addXp(exp: Expedition, amount: number) {
  const grade = recommendedGrade(regionOf(exp));
  exp.xpBy = { ...exp.xpBy, [grade]: (exp.xpBy?.[grade] ?? 0) + amount };
  exp.xp = expeditionXp(exp) + amount;
}

/** 경험치 배율: 용병 등급이 권장 등급보다 몇 등급 위인가 (같거나 낮으면 1) */
export function xpRate(level: MercLevel, recommended: MercLevel): number {
  const gap = Math.max(0, RANK_ORDER.indexOf(level) - RANK_ORDER.indexOf(recommended));
  return XP_RATE_BY_GAP[Math.min(gap, XP_RATE_BY_GAP.length - 1)];
}

/** 이 등급의 용병이 받을 경험치 (권장 등급별로 배율을 곱해 합친다). 등급이 없으면 동 */
export function xpFor(exp: Expedition, level: MercLevel = "bronze"): number {
  if (!exp.xpBy || Object.keys(exp.xpBy).length === 0) return expeditionXp(exp);
  const total = (Object.entries(exp.xpBy) as [MercLevel, number][]).reduce((s, [g, n]) => s + n * xpRate(level, g), 0);
  return Math.round(total);
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
  const moved = enterNode(exp, mercs, nodeId, seed, bonds);
  // 들어선 칸에서 다음 칸들을 살핀다 (길잡이 능력)
  return moved && { ...moved, exp: scoutAhead(moved.exp, seed) };
}

function enterNode(
  exp: Expedition,
  mercs: Merc[],
  nodeId: string,
  seed: number,
  bonds: Record<string, Stage>,
): { exp: Expedition; battle: Battle | null; kind: RoomKind } | null {
  if (!canMove(exp, nodeId)) return null;
  const node = nodeById(exp.map, nodeId)!;
  const next: Expedition = structuredClone({
    ...exp,
    at: nodeId,
    visited: [...exp.visited, nodeId],
  });
  addXp(next, XP_PER_SQUARE * exp.depth);
  const rng = createRng(seed);

  switch (node.kind) {
    case "battle": {
      // 사건으로 끼어든 칸: 정해진 보스 (보상 배율). 길잡이가 미리 본 칸이면 본 그대로
      const seen = next.scouted?.[nodeId];
      const battle = battleFor(next, mercs, seed, bonds, node.boss, 0, undefined, seen?.kind === "battle" ? seen.enemies : undefined);
      if (node.rewardMul) next.rewardMul = node.rewardMul;
      return { exp: spendBattleMods(next), battle, kind: node.kind };
    }
    case "rest":
      next.room = { kind: "rest", lines: rest(next), talked: false };
      break;
    case "treasure":
      next.room = { kind: "treasure", lines: treasure(next, rng) };
      break;
    case "event": {
      // 받아 둔 구출 의뢰의 사건이 이 지역에 있으면 먼저 나온다 (의뢰를 받은 상태에서만)
      const rescue = next.questEvents?.find((q) => q.regionId === next.region && !next.questOffered?.includes(q.eventId));
      // 열쇠가 있으면 히든 사건이 나올 수 있다 (층마다 한 번)
      const hidden = hiddenEventFor(next);
      if (rescue) {
        next.questOffered = [...(next.questOffered ?? []), rescue.eventId];
        next.room = { kind: "event", eventId: rescue.eventId, result: null };
      } else if (hidden && rng.next() < hidden.hidden!.triggerChance) {
        next.hiddenOffered = true;
        next.room = { kind: "event", eventId: hidden.hidden!.event, result: null };
      } else {
        const seen = next.scouted?.[nodeId];
        const id = seen?.kind === "event" ? seen.eventId : pickEvent(seed, next.region, next.seenEvents, next.seenEver);
        next.seenEvents = [...(next.seenEvents ?? []), id];
        next.room = { kind: "event", eventId: id, result: null };
      }
      break;
    }
    case "goal": {
      // 끝 칸 도달 기록 (탐사 의뢰)
      if (next.region && !next.goals?.includes(next.region)) next.goals = [...(next.goals ?? []), next.region];
      // 목적지: 보스 전투 / 정예 전투 (이기면 finishBattle에서 목적지 처리) / 보물
      const goal = next.goal ?? { kind: "treasure" };
      if (goal.kind === "boss" && !next.cleared)
        return { exp: next, battle: battleFor(next, mercs, seed, bonds, goal.id), kind: node.kind };
      if (goal.kind === "elite")
        return { exp: next, battle: battleFor(next, mercs, seed, bonds, undefined, GOAL_ELITES), kind: node.kind };
      reachGoal(next, goal.kind === "treasure" ? goalTreasure(next, rng) : []);
      break;
    }
  }
  return { exp: next, battle: null, kind: node.kind };
}

/** 쌓인 경험치 (xp 칸이 없는 이전 저장은 지나온 칸 수로) */
export function expeditionXp(exp: Expedition): number {
  return exp.xp ?? (exp.visited.length - 1) * XP_PER_SQUARE + (exp.room?.kind === "goal" ? XP_GOAL_BONUS : 0);
}

/** 목적지에 닿았다: 금화·경험치 보너스 (exp를 바꾼다) */
function reachGoal(exp: Expedition, lines: string[] = []) {
  exp.room = { kind: "goal", ...(lines.length ? { lines } : {}) };
  exp.gold += Math.round(depthGold(exp.depth, GOAL_GOLD) * (exp.depth === 1 ? FIRST_FLOOR_GOLD : 1));
  addXp(exp, XP_GOAL_BONUS * exp.depth);
}

/** 보물 목적지: 물자 여럿과 유물 */
function goalTreasure(exp: Expedition, rng: Rng): string[] {
  const kinds = Object.keys(TREASURE_WEIGHTS) as (keyof typeof TREASURE_WEIGHTS)[];
  const found: Partial<Record<SupplyKind, number>> = {};
  for (let i = 0; i < rollInt(rng.next, GOAL_TREASURE.supplies[0], GOAL_TREASURE.supplies[1]); i++) {
    const k = kinds[Math.floor(rng.next() * kinds.length)];
    found[k] = (found[k] ?? 0) + 1;
  }
  return ["보물 상자를 찾았다.", ...supplyLines(exp, found), ...gain(exp, 0, GOAL_TREASURE.relics, rng)];
}

/** 목적지에서 더 내려갈 수 있나 (다음 갈래가 있고, 일어서 있는 동료가 있다) */
export function canDescend(exp: Expedition): boolean {
  return exp.room?.kind === "goal" && nextRegions(exp).length > 0 && alive(exp).length > 0;
}

/**
 * 고른 갈래(다음 지역)로 내려간다. 체력·상태이상·물자·전리품은 그대로 이어지고, 새 지도의 입구에서 시작한다.
 * 쉬는 일은 없다 (지친 채로 내려간다)
 */
export function descend(exp: Expedition, seed: number, regionId: string): Expedition | null {
  if (!canDescend(exp)) return null;
  const region = nextRegions(exp).find((r) => r.id === regionId);
  if (!region) return null;
  const map = generateMap(seed, cellsOf(region));
  return scoutAhead({
    ...exp,
    xp: expeditionXp(exp),
    walked: (exp.walked ?? 0) + exp.visited.length - 1,
    map,
    at: map.startId,
    visited: [map.startId],
    depth: region.depth,
    region: region.id,
    regions: [...(exp.regions ?? []), region.id],
    // 이번 층 몬스터 변화는 층이 바뀌면 사라진다
    floorMods: [],
    room: null,
    cleared: false,
    goal: planGoal(region, seed),
    hiddenOffered: false,
    hiddenNext: undefined,
    scouted: {},
    // 히든 층에 들어가면 그 열쇠를 쓴다
    ...(region.hidden ? { keyUsed: region.hidden.keyItem } : {}),
  }, seed);
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
  boss?: string,
  elites = 0,
  event?: { monsters: string[]; elites?: number },
  /** 길잡이가 미리 본 적 구성 (그대로 나온다) */
  preset?: Unit[],
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
        // 마지막 숨결: 원정에서 이미 쓴 만큼 뺀다
        ...(merc.gear?.lastBreath ? { breath: Math.max(0, merc.gear.lastBreath - (m.breathUsed ?? 0)) } : {}),
      },
    ];
  });
  // 사건 효과: 저주 (전투를 시작할 때 걸린다), 다음 전투 보정 (용병 쪽)
  if (exp.curse && exp.curse.battles > 0) for (const u of units) u.statuses.push({ kind: exp.curse.status, turns: 99 });
  if (exp.nextBattle === "buff") for (const u of units) u.statuses.push({ kind: "attackUp", turns: 1, value: 2 });
  if (exp.nextBattle === "debuff") for (const u of units) u.statuses.push({ kind: "evadeDown", turns: 2, value: 0.1 });
  const mods = exp.floorMods ?? [];
  const extraElite = exp.nextBattle === "elite" ? 1 : 0;
  const b = startBattleFrom(units, seed, {
    depth: exp.depth,
    supplies: exp.supplies,
    // 지나온 칸 수 (앞 층들을 포함)
    walked: (exp.walked ?? 0) + exp.visited.length - 1,
    region: regionOf(exp),
    // 목적지 보스
    boss,
    elites: elites + extraElite,
    floorMods: mods,
    ...(preset ? { enemies: structuredClone(preset) } : event ? { enemies: eventEncounter(event.monsters, regionOf(exp), event.elites ?? 0, createRng(seed ^ 0xe7e)) } : {}),
    // 기습: 기습당한 쪽이 첫 차례를 쉰다 (전투를 시작하기 전에 건다)
    ambush: exp.nextBattle === "ambush" ? "enemy" : exp.nextBattle === "enemyAmbush" && !mods.some((m) => m.mode === "noAmbush") ? "merc" : undefined,
  });
  return b;
}

/**
 * 귀환길 습격: 목적지에 닿기 전에 후퇴하면 한 번 판정. 습격이면 그 층 일반 몬스터 2~3마리 (id), 아니면 null.
 * 목적지를 마쳤거나 전멸했거나 이미 습격을 치렀으면 없다
 */
export function retreatAmbush(exp: Expedition, seed: number): string[] | null {
  if (exp.returning || exp.room?.kind === "goal" || exp.room?.kind === "defeat") return null;
  const rng = createRng(seed ^ 0xa5b);
  const chance = RETREAT_AMBUSH.chance[Math.min(RETREAT_AMBUSH.chance.length, exp.depth) - 1] ?? 0;
  if (rng.next() >= chance) return null;
  const pool = regionOf(exp).monsters.filter((m) => !m.elite && getMonster(m.id)?.rank === "normal");
  if (!pool.length) return null;
  const total = pool.reduce((a, m) => a + m.weight, 0);
  const n = rollInt(rng.next, RETREAT_AMBUSH.size[0], RETREAT_AMBUSH.size[1]);
  return Array.from({ length: n }, () => {
    let roll = rng.next() * total;
    return (pool.find((m) => (roll -= m.weight) < 0) ?? pool[pool.length - 1]).id;
  });
}

/** 전투를 시작했으니 한 번 쓰는 사건 효과를 줄인다 (다음 전투 보정, 저주 남은 전투) */
export function spendBattleMods(exp: Expedition): Expedition {
  const out = { ...exp, nextBattle: undefined };
  if (exp.curse) out.curse = exp.curse.battles > 1 ? { ...exp.curse, battles: exp.curse.battles - 1 } : undefined;
  return out;
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
    const breathUsed = (m.breathUsed ?? 0) + (unit.fx?.breathUsed ?? 0);
    if (unit.dead)
      return { ...m, hp: 0, statuses: [], down: true, fell: true, dead: true };
    return {
      ...m,
      ...(breathUsed ? { breathUsed } : {}),
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
  // 목적지 전투(보스·정예)를 이겼다
  else if (won && exp.at === exp.map.goalId) {
    if (exp.goal?.kind === "boss") next.cleared = true;
    reachGoal(next);
  }
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

/** 전투에서 이기면: 적 한 마리당 금화, 그리고 적 종류별 유실물 (유물은 사건·보물 칸에서만) */
export function battleSpoils(
  exp: Expedition,
  battle: Battle,
  seed: number,
): { exp: Expedition; lines: string[] } {
  if (battle.outcome !== "victory") return { exp, lines: [] };
  const rng = createRng(seed);
  const next = structuredClone(exp);
  // 보상이 없는 적: 달아난 적, 자폭한 적, 부화한 알, 분열로 생긴 적
  const noDrop = new Set<string>();
  for (const e of battle.log) {
    if (e.type === "explode") noDrop.add(e.unit);
    if (e.type === "spawn" && e.how === "hatch") noDrop.add(e.by);
    if (e.type === "spawn" && e.how === "split") noDrop.add(e.unit);
  }
  const enemies = battle.units.filter((u) => u.side === "enemy" && !u.fled);
  const rewarded = enemies.filter((u) => !noDrop.has(u.id));
  // 보스 전투 기록 (조건부 목표): 파티 직업, 이 전투에서 누가 쓰러졌나
  const mercJobs = battle.units.filter((u) => u.side === "merc" && u.job).map((u) => u.job!);
  const downed = battle.log.some((e) => e.type === "downed" || e.type === "death");
  for (const e of enemies)
    if (e.kind && (e.rank === "floorBoss" || e.rank === "dungeonBoss") && e.hp <= 0)
      next.feats = [...(next.feats ?? []), { monsterId: e.kind, jobs: mercJobs, downed }];
  // 쓰러뜨린 몬스터 기록 (직접 의뢰)
  for (const e of enemies) {
    if (!e.kind) continue;
    next.kills = { ...next.kills, [e.kind]: (next.kills?.[e.kind] ?? 0) + 1 };
    if (e.rank === "elite") next.eliteKills = { ...next.eliteKills, [e.kind]: (next.eliteKills?.[e.kind] ?? 0) + 1 };
  }
  // 금화: 적 한 마리당 기본 금화 × 등급 배율 (자폭한 폭탄병 등도 금화는 준다)
  let gold = 0;
  for (const enemy of enemies) gold += rollInt(rng.next, BATTLE_GOLD[0], BATTLE_GOLD[1]) * RANK_DROPS[enemy.rank ?? "normal"].gold;
  // 현상금: 황금 숲 쥐 등 (층 배율 없이)
  let bounty = 0;
  for (const enemy of enemies) {
    const b = getMonster(enemy.kind ?? "")?.bounty;
    if (b) bounty += rollInt(rng.next, b[0], b[1]);
  }
  // 사건으로 불러낸 보스: 보상 배율 (금화)
  const mul = exp.rewardMul ?? 1;
  next.rewardMul = undefined;
  // 1층은 적 금화 ×FIRST_FLOOR_GOLD
  const floorMul = exp.depth === 1 ? FIRST_FLOOR_GOLD : 1;
  const lines = gain(next, Math.round(depthGold(exp.depth, gold) * mul * floorMul) + bounty, 0, rng);
  const dropped: Record<string, number> = {};
  const materials: Record<string, number> = {};
  for (const enemy of rewarded) {
    // 유실물 (팔 것). 정예는 두 번 굴린다
    const rolls = enemy.rank === "elite" ? ELITE_DROP_ROLLS : 1;
    for (let r = 0; r < rolls; r++) for (const id of rollDrops(enemy.kind, rng)) dropped[id] = (dropped[id] ?? 0) + 1;
    // 전수관 재료 (등급 기본 + 계열 재료·종족 유물·특수)
    const drop = rollMonsterDrops(enemy.kind, enemy.rank, rng);
    for (const [id, n] of Object.entries(drop.items)) materials[id] = (materials[id] ?? 0) + n;
    // 히든 열쇠 (나무 거인의 세계수의 가지 등)
    const key = getMonster(enemy.kind ?? "")?.keyDrop;
    if (key && isKeyItem(key.item) && rng.next() < key.chance) {
      next.keyFound = [...(next.keyFound ?? []), key.item];
      lines.push(`열쇠: ${KEY_ITEMS[key.item].name}`);
    }
    // 장신구 (층 보스·던전 보스)
    if (drop.trinket) {
      const t = rollTrinket(rng);
      next.trinkets = [...(next.trinkets ?? []), t.id];
      lines.push(`장신구: ${t.name}`);
    }
  }
  next.salvage = addSalvage(addSalvage(next.salvage ?? {}, dropped), materials);
  const names = (items: Record<string, number>) => Object.entries(items).map(([id, n]) => `${getSalvage(id)?.name ?? id}${n > 1 ? ` ×${n}` : ""}`);
  if (Object.keys(materials).length) lines.push(`재료: ${names(materials).join(", ")}`);
  if (Object.keys(dropped).length) lines.push(`유실물: ${names(dropped).join(", ")}`);
  return { exp: next, lines };
}

function treasure(exp: Expedition, rng: Rng): string[] {
  const count = rng.next() < TREASURE_SUPPLY_CHANCE ? 1 : 0;
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
  const gold = depthGold(exp.depth, rollInt(rng.next, TREASURE_GOLD[0], TREASURE_GOLD[1]));
  const lines = [...supplyLines(exp, found), ...gain(exp, gold, rng.next() < TREASURE_RELIC_CHANCE ? 1 : 0, rng)];
  // 낮은 확률로 장신구
  if (rng.next() < TREASURE_TRINKET_CHANCE) {
    const t = rollTrinket(rng);
    exp.trinkets = [...(exp.trinkets ?? []), t.id];
    lines.push(`장신구: ${t.name}`);
  }
  return lines;
}

const SUPPLY_NAME: Record<SupplyKind, string> = {
  bandage: "붕대",
  antidote: "해독제",
  potion: "물약",
  greaterPotion: "중급 물약",
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
  if (isPotion(item) && m.hp >= m.maxHp) return "체력이 가득하다";
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
  if (isPotion(item))
    m.hp = Math.min(m.maxHp, m.hp + Math.round(POTION_HEAL * (POTION_POWER[item] ?? 1) * multiplier));
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
/** 직업 이름 (data/traits.ts) */
const JOB_NAME: Record<string, string> = Object.fromEntries(JOBS.map((j) => [j.id, j.name]));
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
  if (!req) return undefined;
  // 이 중 하나 (사제 또는 엘프 등): 맞는 첫 동료
  if (req.any) {
    for (const r of req.any) {
      const m = helperFor(exp, r, bonds);
      if (m) return m;
    }
    return undefined;
  }
  if (!req.job && !req.race && !req.bond && !req.element) return undefined;
  return alive(exp).find(
    (m) =>
      (!req.job || m.job === req.job) &&
      (!req.race || m.race === req.race) &&
      (!req.element || (m.job === "mage" && !!m.elements?.includes(req.element))) &&
      (!req.bond ||
        STAGE_ORDER.indexOf(bonds[m.id] ?? "neutral") >=
          STAGE_ORDER.indexOf(req.bond)),
  );
}

const ELEMENT_NAME: Record<Element, string> = { fire: "불", water: "물", wind: "바람", earth: "흙" };

/** 조건 하나를 글로 ("사제", "엘프 동료", "물 원소 마법사") */
function reqText(req: EventRequirement): string {
  if (req.any) return req.any.map(reqText).join(" 또는 ");
  if (req.element) return `${ELEMENT_NAME[req.element]} 원소 마법사`;
  if (req.job) return JOB_NAME[req.job] ?? req.job;
  if (req.race) return `${RACE_NAME[req.race] ?? req.race} 동료`;
  if (req.bond) return `${STAGE_NAME[req.bond]} 단계인 동료`;
  return "";
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
  if (req && (req.job || req.race || req.bond || req.element || req.any) && !helperFor(exp, req, bonds)) return `${josa(reqText(req), "이", "가")} 있어야 한다`;
  if (req?.speedSum) {
    const sum = alive(exp).reduce((a, m) => a + (m.speed ?? 0), 0);
    if (sum < req.speedSum) return `동료 속도 합 ${req.speedSum} 필요 (지금 ${sum})`;
  }
  if (choice.costGold && exp.gold < choice.costGold) return `금화 ${choice.costGold} 필요`;
  if (choice.costRelic && exp.loot.length < choice.costRelic) return `유물 ${choice.costRelic}개 필요`;
  for (const [id, n] of Object.entries(choice.costItems ?? {}))
    if ((exp.salvage?.[id] ?? 0) < n) return `${getSalvage(id)?.name ?? id} ${n}개 필요`;
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
  helper?: Member,
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
    // 출혈·중독은 수치가 쌓인다 (data/combat.ts의 DOT)
    const was = target.statuses.find((s) => s.kind === effect.status)?.value ?? 0;
    target.statuses = [
      ...target.statuses.filter((s) => s.kind !== effect.status),
      { kind: effect.status, turns: 1, value: was + (isDot(effect.status) ? DOT[effect.status].stack : 0) },
    ];
    lines.push(`${target.name} ${effect.status === "bleed" ? "출혈" : "중독"}`);
  }
  if (effect.supply) lines.push(...supplyLines(exp, effect.supply));
  lines.push(...gain(exp, effect.gold ?? 0, effect.relics ?? 0, rng));
  lines.push(...applyEventExtras(exp, effect, rng, helper ?? target));
  return { lines, who: target?.name };
}

/** 사건 확장 효과 (2026-11-22): 유실물, 맵 변화, 다음 전투, 이번 층 몬스터, 정보·명성·호감·합류·할인·저주, 사건 전투, 즉석 판매 */
function applyEventExtras(exp: Expedition, effect: EventEffect, rng: Rng, chooser: Member | undefined): string[] {
  const lines: string[] = [];
  if (effect.items) {
    exp.salvage = addSalvage(exp.salvage ?? {}, effect.items);
    for (const [id, n] of Object.entries(effect.items)) lines.push(`${getSalvage(id)?.name ?? id} ${n}개`);
  }
  if (effect.relic) {
    exp.loot.push(effect.relic);
    lines.push(`유물: ${getRelic(effect.relic)?.name ?? effect.relic}`);
  }
  if (effect.extraCell) {
    exp.map = insertAfter(exp.map, exp.at, "battle");
    lines.push("길이 한 칸 늘어났다");
  }
  if (effect.treasureNext) {
    exp.map = insertAfter(exp.map, exp.at, "treasure");
    lines.push("다음 칸에 숨은 보물이 있다");
  }
  if (effect.skipNext) {
    exp.map = skipAfter(exp.map, exp.at);
    lines.push("한 칸을 건너뛰는 길을 찾았다");
  }
  if (effect.forceBoss) {
    exp.map = insertAfter(exp.map, exp.at, "battle", { boss: effect.forceBoss.monsterId, rewardMul: effect.forceBoss.rewardMul });
    lines.push(`다음 칸에 ${getMonster(effect.forceBoss.monsterId)?.name ?? "무언가"}이(가) 기다린다`);
  }
  if (effect.revealTreasure) {
    exp.map = revealTreasureCell(exp.map, exp.visited, rng);
    lines.push("이 층의 숨은 보물 칸이 드러났다");
  }
  if (effect.nextBattle) {
    exp.nextBattle = effect.nextBattle;
    lines.push(NEXT_BATTLE_TEXT[effect.nextBattle]);
  }
  if (effect.floorMod) {
    exp.floorMods = [...(exp.floorMods ?? []), effect.floorMod];
    lines.push(FLOOR_MOD_TEXT[effect.floorMod.mode]);
  }
  if (effect.info) {
    exp.infos = [...new Set([...(exp.infos ?? []), effect.info])];
    lines.push("새로운 정보를 알아냈다 (게시판 \"알아낸 것\")");
  }
  if (effect.fame) {
    exp.fameDelta = (exp.fameDelta ?? 0) + effect.fame;
    lines.push(`명성 ${effect.fame > 0 ? "+" : ""}${effect.fame}`);
  }
  if (effect.affinity) {
    const living = alive(exp);
    const targets =
      effect.affinity.target === "all" ? living : effect.affinity.target === "chooser" && chooser ? [chooser] : living.length ? [living[Math.floor(rng.next() * living.length)]] : [];
    const d = { ...exp.affinityDeltas };
    for (const m of targets) d[m.id] = (d[m.id] ?? 0) + effect.affinity.delta;
    exp.affinityDeltas = d;
  }
  if (effect.recruit) {
    exp.recruits = (exp.recruits ?? 0) + effect.recruit;
    lines.push("돌아가면 합류하겠다는 사람이 있다");
  }
  if (effect.discount) {
    exp.discounts = [...(exp.discounts ?? []), effect.discount];
    lines.push(`돌아가면 ${effect.discount.facility === "forge" ? "대장간" : "상점"} 할인 ${effect.discount.days}일`);
  }
  if (effect.curse) {
    exp.curse = { ...effect.curse };
    lines.push(`저주: 앞으로 ${effect.curse.battles}번의 전투 동안 몸이 무겁다`);
  }
  if (effect.sellLoot) {
    let got = 0;
    for (const [id, n] of Object.entries(exp.salvage ?? {})) {
      const item = getSalvage(id);
      if (!item || (item.kind ?? "loot") !== "loot" || n <= 0) continue;
      got += Math.round(item.value * n * effect.sellLoot.priceMul);
      delete exp.salvage![id];
    }
    exp.gold += got;
    lines.push(got ? `유실물을 팔았다: 금화 +${got}` : "팔 유실물이 없다");
  }
  if (effect.battle) {
    exp.pendingBattle = effect.battle;
    lines.push("싸움이 벌어진다!");
  }
  return lines;
}

const NEXT_BATTLE_TEXT: Record<NextBattle, string> = {
  buff: "다음 전투 첫 라운드에 공격 +2",
  debuff: "다음 전투에서 몸놀림이 둔하다 (회피 -10%)",
  ambush: "다음 전투는 우리가 먼저 덮친다 (적이 첫 차례를 쉰다)",
  enemyAmbush: "다음 전투에서 기습을 당할 것 같다 (우리가 첫 차례를 쉰다)",
  elite: "다음 전투에 정예가 하나 더 나온다",
};
const FLOOR_MOD_TEXT: Record<FloorMod["mode"], string> = {
  disable: "이번 층에서는 그 적이 나오지 않는다",
  reduce: "이번 층에서는 그 적이 전투마다 하나 줄어든다",
  noHeal: "이번 층에서는 그 적이 회복하지 못한다",
  noBuff: "이번 층에서는 그 적이 기세를 올리지 못한다",
  noAmbush: "이번 층에서는 기습을 당하지 않는다",
};

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
  // 원정에서 번 금화·유물·유실물을 낸다
  if (choice.costGold) {
    next.gold -= choice.costGold;
    lines.push(`금화 -${choice.costGold}`);
  }
  if (choice.costRelic) {
    const gave = next.loot.splice(next.loot.length - choice.costRelic, choice.costRelic);
    lines.push(`유물을 내주었다 (${gave.length}개)`);
  }
  for (const [id, n] of Object.entries(choice.costItems ?? {})) {
    next.salvage = { ...next.salvage, [id]: (next.salvage?.[id] ?? 0) - n };
    if (next.salvage[id] <= 0) delete next.salvage[id];
    lines.push(`${getSalvage(id)?.name ?? id} -${n}`);
  }
  if (choice.rewards)
    lines.push(...applyEffect(next, choice.rewards, rng, helper).lines);
  const outcome = pickOutcome(choice.outcomes, rng);
  const applied = applyEffect(next, outcome.effect, rng, helper);
  lines.push(...applied.lines);
  // 히든 지역으로 가는 길이 열렸다: 이 층의 다음 갈래가 그 지역이 된다
  for (const u of choice.unlocks ?? []) if (u.kind === "hiddenRegion" && getRegion(u.region)) next.hiddenNext = u.region;
  // 구출 의뢰: 이 선택으로 사람을 구했다
  if (choice.rescue && !next.rescued?.includes(room.eventId)) next.rescued = [...(next.rescued ?? []), room.eventId];
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
