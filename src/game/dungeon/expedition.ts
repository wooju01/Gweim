// 던전 탐험 한 번의 규칙. 맵 위를 칸 단위로 이동하며, 체력·상태이상·물자가 다음 칸으로 이어진다.
// 쓰러진 용병은 이번 탐험이 끝날 때까지 빠지고, 귀환하면 회복한다 (영구 사망은 나중에).
// 순수 함수만 둔다. 난수는 시드로 받는다.
import {
  HARMFUL,
  POTION_HEAL,
  START_SUPPLIES,
  type SupplyKind,
} from "@/data/combat";
import {
  depthGold,
  floorCells,
  GOAL_ELITES,
  GOAL_FALLBACK,
  GOAL_TREASURE,
  REST_HEAL_RATIO,
  TREASURE_COUNT,
  TREASURE_WEIGHTS,
  XP_RATE_BY_GAP,
  type GoalContent,
  type RoomKind,
} from "@/data/dungeon";
import {
  BATTLE_GOLD,
  CURRENCY,
  GOAL_GOLD,
  TREASURE_GOLD,
  TREASURE_RELIC_CHANCE,
} from "@/data/economy";
import { rollRelic } from "@/data/relics";
import { XP_GOAL_BONUS, XP_PER_SQUARE } from "@/data/growth";
import { FIRST_DUNGEON, getDungeon, getRegion, hiddenFrom, type Region } from "@/data/regions";
import { ELITE_DROP_ROLLS, FLOOR_BOSS_TRINKET_CHANCE, getMonster } from "@/data/monsters";
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
} from "@/data/events";
import type { ChoiceTone, MercLevel, Stage } from "@/lib/schemas";
import { BOND } from "@/data/bond";
import { JOBS } from "@/data/traits";
import {
  mercUnit,
  startBattleFrom,
  type Battle,
  type Status,
  type Unit,
} from "@/game/combat/engine";
import { josa } from "@/game/combat/text";
import { createRng, rollInt, type Rng } from "@/game/random";
import type { Merc } from "@/game/types";
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
};

// ── 시작 ────────────────────────────────────────────────

/** pack: 짐에 넣어 가는 물자 (마을 상점에서 산 것) */
export function startExpedition(
  mercs: Merc[],
  seed: number,
  pack: Record<SupplyKind, number> = START_SUPPLIES,
  dungeonId: string = FIRST_DUNGEON,
  keys: KeyItemId[] = [],
): Expedition {
  const dungeon = getDungeon(dungeonId) ?? getDungeon(FIRST_DUNGEON)!;
  const region = getRegion(dungeon.entry)!;
  const map = generateMap(seed, cellsOf(region));
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
  };
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
  if (exp.room) return false;
  return nodeById(exp.map, exp.at)?.next.includes(nodeId) ?? false;
}

/** 이벤트 칸에 들어갈 때 어떤 사건이 나올지. 같은 시드면 같은 사건 (히든 사건은 빼고) */
export function pickEvent(seed: number): string {
  const rng = createRng(seed);
  const pool = EVENTS.filter((e) => !e.hidden);
  return pool[Math.floor(rng.next() * pool.length)].id;
}

/**
 * 이 층에서 나올 수 있는 히든 사건: 이 지역에서 열리는 히든 지역이 있고, 그 열쇠가 창고에 있고,
 * 이 층에서 아직 나오지 않았으면
 */
export function hiddenEventFor(exp: Expedition): Region | undefined {
  if (exp.hiddenOffered || exp.hiddenNext) return undefined;
  return hiddenFrom(regionOf(exp).id).find((r) => exp.keys?.includes(r.hidden!.keyItem));
}

/** 권장 등급별로 경험치를 쌓는다 */
function addXp(exp: Expedition, amount: number) {
  const grade = regionOf(exp).recommended[1];
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
    case "event": {
      // 열쇠가 있으면 히든 사건이 나올 수 있다 (층마다 한 번)
      const hidden = hiddenEventFor(next);
      if (hidden && rng.next() < hidden.hidden!.triggerChance) {
        next.hiddenOffered = true;
        next.room = { kind: "event", eventId: hidden.hidden!.event, result: null };
      } else {
        next.room = { kind: "event", eventId: pickEvent(seed), result: null };
      }
      break;
    }
    case "goal": {
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
  exp.gold += depthGold(exp.depth, GOAL_GOLD);
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
  return {
    ...exp,
    xp: expeditionXp(exp),
    walked: (exp.walked ?? 0) + exp.visited.length - 1,
    map,
    at: map.startId,
    visited: [map.startId],
    depth: region.depth,
    region: region.id,
    room: null,
    cleared: false,
    goal: planGoal(region, seed),
    hiddenOffered: false,
    hiddenNext: undefined,
    // 히든 층에 들어가면 그 열쇠를 쓴다
    ...(region.hidden ? { keyUsed: region.hidden.keyItem } : {}),
  };
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
    // 지나온 칸 수 (앞 층들을 포함)
    walked: (exp.walked ?? 0) + exp.visited.length - 1,
    region: regionOf(exp),
    // 목적지 보스
    boss,
    elites,
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
  const enemies = battle.units.filter((u) => u.side === "enemy");
  let gold = 0;
  for (let i = 0; i < enemies.length; i++) gold += rollInt(rng.next, BATTLE_GOLD[0], BATTLE_GOLD[1]);
  const lines = gain(next, depthGold(exp.depth, gold), 0, rng);
  const dropped: Record<string, number> = {};
  for (const enemy of enemies) {
    // 정예는 드롭을 두 번 굴린다
    const rolls = enemy.rank === "elite" ? ELITE_DROP_ROLLS : 1;
    for (let r = 0; r < rolls; r++) for (const id of rollDrops(enemy.kind, rng)) dropped[id] = (dropped[id] ?? 0) + 1;
    // 히든 열쇠 (나무 거인의 세계수의 가지 등)
    const key = getMonster(enemy.kind ?? "")?.keyDrop;
    if (key && isKeyItem(key.item) && rng.next() < key.chance) {
      next.keyFound = [...(next.keyFound ?? []), key.item];
      lines.push(`열쇠: ${KEY_ITEMS[key.item].name}`);
    }
    // 층 보스는 장신구를 떨어뜨리기도 한다
    if (enemy.rank === "floorBoss" && rng.next() < FLOOR_BOSS_TRINKET_CHANCE) {
      const t = rollTrinket(rng);
      next.trinkets = [...(next.trinkets ?? []), t.id];
      lines.push(`장신구: ${t.name}`);
    }
  }
  next.salvage = addSalvage(next.salvage ?? {}, dropped);
  const found = Object.entries(dropped).map(([id, n]) => `${getSalvage(id)?.name ?? id}${n > 1 ? ` ×${n}` : ""}`);
  if (found.length) lines.push(`유실물: ${found.join(", ")}`);
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
  // 히든 지역으로 가는 길이 열렸다: 이 층의 다음 갈래가 그 지역이 된다
  for (const u of choice.unlocks ?? []) if (u.kind === "hiddenRegion" && getRegion(u.region)) next.hiddenNext = u.region;
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
