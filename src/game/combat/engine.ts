// 턴제 전투 규칙. AI 없이 코드로만 돌아간다.
// 모든 결과는 이벤트(BattleEvent)로 남긴다. 지금은 텍스트로, 나중에는 같은 이벤트로 애니메이션을 재생한다.
//
// 흐름: 라운드마다 살아 있는 용병이 한 명씩 행동(공격, 붕대, 직업 스킬) → 적들이 자동으로 행동.
// 길안내자는 싸우지 않고, 라운드마다 한 번 물자(붕대·해독제·물약)를 용병에게 건넬 수 있다.
// 출혈·중독은 그 유닛의 턴이 시작될 때 피해를 준다.
import {
  BASIC_ATTACK_MULT,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  RANK_SCALE,
  REGION_SCALE,
  SPEED_JITTER,
  DEFAULT_STATS,
  GUARD_MULTIPLIER,
  ENCOUNTER_SIZE,
  ENEMIES,
  DEBUFFS,
  HARMFUL,
  PASSIVE,
  JOB_STATS,
  POTION_HEAL,
  RESIST,
  START_SUPPLIES,
  STATUS,
  type EnemyKind,
  type OnHit,
  type ResistKind,
  type StatusKind,
  type SupplyKind,
} from "@/data/combat";
import { SKILL_SLOTS, type DamageEffect, type Scaling, type Skill, type SkillId, type StatusRoll } from "@/data/skills";
import { BOND } from "@/data/bond";
import { JOB_STAT, PER_POINT, type PowerStat, type StatKey } from "@/data/growth";
import { DEATH, survivalChance } from "@/data/death";
import { ELITE_TRAITS, MAX_ENEMIES, getMonster, type Ability, type EliteTrait, type Monster, type MonsterRank, type MonsterTag } from "@/data/monsters";
import type { Region } from "@/data/regions";
import type { MercLevel, Stage } from "@/lib/schemas";
import { createRng, rollInt, type Rng } from "@/game/random";
import { basicBuild, getSkill, resolveSkill, skillKey, validateUltimate } from "@/game/skills";
import type { Merc } from "@/game/types";

export type Side = "merc" | "enemy";
/** value: 수치 (공격 -2, 회피 +15% 등). 없으면 STATUS의 기본값 */
/** source: 이 상태를 건 유닛 (결투 상대) */
export type Status = { kind: StatusKind; turns: number; value?: number; source?: string };

export type Unit = {
  id: string;
  side: Side;
  name: string;
  /** 용병은 호칭, 적은 빈 문자열 */
  title: string;
  hp: number;
  maxHp: number;
  attack: readonly [number, number];
  defense: number;
  speed: number;
  onHit?: OnHit;
  statuses: Status[];
  /** 장착한 스킬 id (용병은 최대 SKILL_SLOTS개). 공격과 붕대는 슬롯을 차지하지 않는 기본 행동 */
  skills: SkillId[];
  /** 용병만: 부 조각 레벨까지 반영한 스킬 (id별). 없는 id는 getSkill로 찾는다 (몬스터 스킬) */
  book?: Record<SkillId, Skill>;
  /** 용병만: 궁극기 (전투당 1번. 쓰면 fx.ultimateUsed) */
  ultimate?: SkillId;
  /** 스킬별로 다시 쓸 수 있을 때까지 남은 자기 턴 수 (없거나 0이면 사용 가능) */
  cooldowns: Record<SkillId, number>;
  /** 막아서기 중 (자기 다음 차례가 오면 풀린다) */
  guarding: boolean;
  /** 보호막. 공격 피해를 체력보다 먼저 받아 낸다. 전투가 끝날 때까지 남는다 (상태이상 피해는 못 막는다) */
  shield?: number;
  /** 용병만: 종족 패시브 id (data/passives.ts) */
  passives?: string[];
  /** 용병만: 길안내자에 대한 호감 단계 (전투 시작 때 정해진다) */
  bond?: Stage;
  /** 용병만: 등급 (생존 판정에 쓴다) */
  level?: MercLevel;
  /** 용병만: 빈사. 생존 판정까지 남은 라운드 시작 수 */
  dying?: number;
  /** 용병만: 생존 판정을 넘겨 의식 없이 버티는 중 (이기면 일어난다) */
  stable?: boolean;
  /** 용병만: 죽었다 (되돌릴 수 없다) */
  dead?: boolean;
  /** 적만: 정보에 보이는 특징 한 줄 */
  note?: string;
  /** 성장 스탯에서 오는 기술 위력 (힘·마법·신성 1점당 +1) */
  power?: Partial<Record<PowerStat, number>>;
  /** 성장 스탯에서 오는 치명타·회피 확률 추가 */
  critBonus?: number;
  evadeBonus?: number;
  /** 적만: 종류 id (data/combat.ts의 ENEMIES 또는 data/monsters.ts). 유실물 드롭표에 쓴다 */
  kind?: string;
  /** 적만: 몬스터 태그와 등급, 특수 능력 (data/monsters.ts) */
  tags?: MonsterTag[];
  rank?: MonsterRank;
  abilities?: Ability[];
  /** 적만: 정예 특성 id */
  elite?: string;
  /** 적만: 전투에서 달아났다 (쓰러진 것으로 치지만 처치 보상은 없다) */
  fled?: boolean;
  /** 용병만: 화면에 그릴 때 쓰는 직업·종족 id (규칙에는 쓰지 않는다) */
  job?: string;
  race?: string;
  /** 패시브가 쓰는 전투 중 기록 */
  fx?: PassiveState;
};

export type PassiveState = {
  /** 몬스터 능력: 자기 차례 수(부화·낳기), 떼어 낸 단계(분열), 부른 횟수(소환·다시 부르기) */
  age?: number;
  splitStage?: number;
  summoned?: number;
  /** 흥이 오른다: 맞은 횟수 */
  cheer?: number;
  /** 사냥꾼의 집념: 마지막으로 때린 적과 연속 횟수 */
  focus?: { target: string; stacks: number };
  /** 선제 일격을 이미 썼나 */
  firstDone?: boolean;
  /** 사선 돌파를 이미 썼나 */
  lastStandDone?: boolean;
  /** 바람의 춤: 다음 공격 강화 대기 */
  dance?: boolean;
  /** 적응: 적 id별로 맞은 횟수 */
  adapt?: Record<string, number>;
  /** 이번 전투에서 궁극기를 썼나 */
  ultimateUsed?: boolean;
  /** 기절에 걸린 횟수 (걸릴 때마다 기절 저항이 쌓인다) */
  stunCount?: number;
  /** 숨통 끊기·전사의 긍지를 마지막으로 쓴 라운드 */
  biteRound?: number;
  prideRound?: number;
};

export type Outcome = "victory" | "defeat";

/** "guide"는 길안내자 */
export type Actor = string | "guide";

export type BattleEvent =
  | { type: "round"; round: number }
  /** damage: 실제로 깎인 체력. absorbed: 보호막이 막은 양 */
  | { type: "attack"; actor: string; target: string; damage: number; crit: boolean; absorbed?: number }
  | { type: "status"; target: string; kind: StatusKind }
  | { type: "tick"; target: string; kind: StatusKind; damage: number }
  /** via: 무엇으로 치료했나 */
  | { type: "cure"; target: string; kind: StatusKind; by: Actor; via: "bandage" | "antidote" | "skill" }
  | { type: "heal"; target: string; amount: number; by: Actor }
  | { type: "skill"; actor: string; skill: SkillId; target?: string }
  /** skill: 반동을 낸 스킬 (문장에 쓴다) */
  | { type: "recoil"; target: string; damage: number; skill?: SkillId }
  | { type: "shield"; target: string; amount: number; by: string }
  /** 종족 패시브 발동. target은 패시브마다 뜻이 다르다 (전사의 긍지: 지켜 준 아군) */
  | { type: "passive"; unit: string; passive: string; target?: string }
  | { type: "evade"; actor: string; target: string }
  /** 처치해서 스킬 대기 시간이 초기화됐다 (조합 스킬 사냥) */
  | { type: "refresh"; actor: string; skill: SkillId }
  /** 빈사 상태로 쓰러졌다 / 길안내자가 구했다 / 생존 판정을 넘겼다 / 죽었다 */
  | { type: "dying"; target: string; rounds: number }
  | { type: "rescue"; target: string; via: "potion" | "bandage" }
  | { type: "survive"; target: string; chance: number }
  | { type: "death"; target: string; chance: number }
  /** 차례를 넘겼다 */
  | { type: "wait"; unit: string }
  /** 달아났다 */
  | { type: "fled"; unit: string }
  /** 자폭했다 */
  | { type: "explode"; unit: string }
  /** unit이 target 대신 공격을 맞았다 (감싸기) */
  | { type: "cover"; unit: string; target: string }
  /** 적대 단계 용병이 명령을 무시했다 */
  | { type: "disobey"; unit: string }
  /** 스킬이 실패했다 (정령이 답하지 않음 등) */
  | { type: "fizzle"; actor: string; skill: SkillId }
  | { type: "down"; target: string }
  /** 속박돼 차례를 쉬었다 */
  | { type: "bound"; target: string }
  /** 기절해서 차례를 쉬었다 */
  | { type: "stunned"; target: string }
  /** 저항해서 상태이상에 걸리지 않았다 */
  | { type: "resist"; target: string; kind: StatusKind }
  /** 몬스터가 늘었다 (분열·부화·낳기·부르기). by: 원인이 된 유닛 */
  | { type: "spawn"; unit: string; by: string; how: "split" | "hatch" | "brood" | "summon" }
  | { type: "end"; outcome: Outcome };

export type Battle = {
  round: number;
  units: Unit[];
  /** 이번 라운드의 행동 순서 (유닛 id) */
  order: string[];
  /** order 안에서 지금 행동할 차례의 위치 */
  turn: number;
  supplies: Record<SupplyKind, number>;
  /** 던전 층 (1부터). 깊은 곳의 피 패시브가 쓴다 */
  depth: number;
  /** 지역 이름 (화면 표시용) */
  place?: string;
  /** 이 전투 몬스터의 구역 배율 (체력, 공격·방어). 전투 중에 생기는 몬스터에도 쓴다 */
  scale?: { hp: number; atk: number };
  /** 이번 탐험에서 지나온 칸 수. 층 구조가 생기기 전까지 깊은 곳의 피가 쓴다 */
  walked: number;
  /** 이번 라운드에 길안내자가 이미 물자를 건넸나 */
  guideUsed: boolean;
  /** 난수 상태. 같은 상태면 같은 결과가 나온다 */
  rng: number;
  outcome: Outcome | null;
  log: BattleEvent[];
};

export type BattleAction =
  | { type: "attack"; target: string }
  /** 차례 넘기기 (쓸 스킬이 없을 때) */
  | { type: "wait" }
  | { type: "bandage" }
  /** skill을 생략하면 첫 번째 칸의 스킬 */
  | { type: "skill"; skill?: SkillId; target?: string }
  | { type: "guide"; item: SupplyKind; target: string };

// ── 조회 ────────────────────────────────────────────────

export function unitById(b: Battle, id: string): Unit | undefined {
  return b.units.find((u) => u.id === id);
}

export function living(b: Battle, side: Side): Unit[] {
  return b.units.filter((u) => u.side === side && u.hp > 0);
}

/** 지금 행동을 기다리는 용병. 전투가 끝났으면 null */
export function currentActor(b: Battle): Unit | null {
  if (b.outcome) return null;
  const u = unitById(b, b.order[b.turn]);
  return u && u.side === "merc" && u.hp > 0 ? u : null;
}

/** u의 상대편 중 살아 있는 유닛 (용병이면 적, 적이면 용병) */
export function foes(b: Battle, u: Unit): Unit[] {
  return living(b, u.side === "merc" ? "enemy" : "merc");
}

/** u의 같은 편 중 살아 있는 유닛 */
export function friends(b: Battle, u: Unit): Unit[] {
  return living(b, u.side);
}

export function hasStatus(u: Unit, kind: StatusKind): boolean {
  return u.statuses.some((s) => s.kind === kind);
}

/** 이 행동을 지금 할 수 없는 이유. 할 수 있으면 null */
export function validate(b: Battle, action: BattleAction): string | null {
  const actor = currentActor(b);
  if (!actor) return "전투가 끝났다";

  switch (action.type) {
    case "attack": {
      const target = unitById(b, action.target);
      if (!target || target.side === actor.side || target.hp <= 0) return "공격할 수 없는 대상";
      return null;
    }
    case "wait":
      return null;
    case "bandage":
      if (b.supplies.bandage <= 0) return "붕대가 없다";
      if (!hasStatus(actor, "bleed")) return "출혈이 없다";
      return null;
    case "skill": {
      const id = skillOf(actor, action);
      const isUltimate = !!id && id === actor.ultimate;
      if (!id || (!actor.skills.includes(id) && !isUltimate) || !skillDef(actor, id)) return "장착하지 않은 스킬";
      if (isUltimate && actor.fx?.ultimateUsed) return "궁극기는 전투당 한 번";
      const wait = actor.cooldowns[id] ?? 0;
      if (wait > 0) return `${wait}턴 뒤에 쓸 수 있다`;
      const kind = skillDef(actor, id)!.target;
      const target = action.target ? unitById(b, action.target) : undefined;
      if (kind === "none") return action.target ? "대상을 고르지 않는 스킬" : null;
      if (!target || target.hp <= 0) return "대상을 골라야 한다";
      if (kind === "enemy" && target.side === actor.side) return "적에게만 쓸 수 있다";
      if (kind === "ally" && target.side !== actor.side) return "아군에게만 쓸 수 있다";
      return null;
    }
    case "guide": {
      if (b.guideUsed) return "이번 라운드에는 이미 도왔다";
      if (b.supplies[action.item] <= 0) return "물자가 없다";
      const target = unitById(b, action.target);
      if (!target || target.side !== "merc" || target.dead) return "건넬 수 없는 대상";
      // 빈사인 용병은 물약이나 붕대로 일으킬 수 있다
      if (target.hp <= 0) return isDying(target) && action.item !== "antidote" ? null : "건넬 수 없는 대상";
      if (action.item === "bandage" && !hasStatus(target, "bleed")) return "출혈이 없다";
      if (action.item === "antidote" && !hasStatus(target, "poison")) return "중독이 없다";
      if (action.item === "potion" && target.hp >= target.maxHp) return "체력이 가득하다";
      return null;
    }
  }
}

// ── 시작 ────────────────────────────────────────────────

/** 길안내자가 건넨 물약의 효과 배율 (손발이 맞는다, 호의·신뢰) */
export function potionMultiplier(u: Unit): number {
  return (has(u, "in_sync") ? PASSIVE.inSyncMultiplier : 1) * (u.bond === "warm" || u.bond === "trusted" ? BOND.supplyMultiplier : 1);
}

/** 이 전투에서 길안내자에게 물자를 받은 횟수 (용병 id별) */
export function giftsReceived(b: Battle): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of b.log) {
    if ((e.type === "heal" || e.type === "cure") && e.by === "guide") out[e.target] = (out[e.target] ?? 0) + 1;
  }
  return out;
}

/** 행동이 쓰려는 스킬. 생략하면 첫 번째 칸 */
export function skillOf(actor: Unit, action: { skill?: SkillId }): SkillId | undefined {
  return action.skill ?? actor.skills[0];
}

/** 유닛이 쓰는 스킬 정의: 용병은 부 조각 레벨까지 반영한 book, 없으면 id로 찾는다 (몬스터 스킬) */
export function skillDef(u: Unit, id: SkillId): Skill | undefined {
  return u.book?.[id] ?? getSkill(id);
}

/**
 * 장착 스킬과 스킬 책. 용병이 정해 둔 게 없으면 직업 기본 조각 (직업이 없으면 전력 공격).
 * 부 조각 레벨(merc.subLevels)을 반영해 미리 합쳐 둔다
 */
function loadout(merc: Merc): { skills: SkillId[]; book: Record<SkillId, Skill>; ultimate?: SkillId } {
  const builds = merc.skills?.length ? merc.skills : [basicBuild(merc.job)];
  const book: Record<SkillId, Skill> = {};
  const skills: SkillId[] = [];
  for (const b of builds) {
    const skill = resolveSkill(b, merc.subLevels);
    if (!skill || skills.length >= SKILL_SLOTS || book[skill.id]) continue;
    book[skill.id] = skill;
    skills.push(skill.id);
  }
  let ultimate: SkillId | undefined;
  if (merc.ultimate && !validateUltimate({ job: merc.job, race: merc.race, level: merc.level ?? "gold" }, merc.ultimate)) {
    const ult = resolveSkill({ main: merc.ultimate, subs: [] });
    if (ult) {
      ultimate = skillKey({ main: merc.ultimate, subs: [] });
      book[ultimate] = ult;
    }
  }
  return { skills, book, ultimate };
}

/**
 * "옆 아군": 지금은 파티 순서의 바로 앞뒤 사람.
 * 나중에 진형(전열·중열·후열)이 생기면 같은 열의 동료로 이 함수만 바꾼다.
 */
export function neighbors(b: Battle, unit: Unit): Unit[] {
  const side = b.units.filter((u) => u.side === unit.side);
  const i = side.indexOf(unit);
  return [side[i - 1], side[i + 1]].filter((u): u is Unit => !!u && u.hp > 0);
}

export function mercUnit(merc: Merc): Unit {
  const stats = (merc.job && JOB_STATS[merc.job]) || DEFAULT_STATS;
  // 성장 스탯 (레벨업·단련장)
  const g = (k: StatKey) => (merc.stats?.[k] ?? 0) * PER_POINT[k];
  const maxHp = stats.hp + g("hp");
  const kit = loadout(merc);
  return {
    id: merc.id,
    side: "merc",
    name: merc.name,
    title: merc.title,
    hp: maxHp,
    maxHp,
    attack: stats.attack,
    defense: stats.defense + g("defense"),
    speed: stats.speed + g("speed"),
    power: { str: g("str"), mag: g("mag"), faith: g("faith") },
    critBonus: g("crit"),
    evadeBonus: g("evade"),
    onHit: stats.onHit,
    statuses: [],
    skills: kit.skills,
    book: kit.book,
    ultimate: kit.ultimate,
    cooldowns: {},
    guarding: false,
    passives: merc.passives ?? [],
    level: merc.level,
    fx: {},
    job: merc.job,
    race: merc.race,
  };
}

function pickEnemy(rng: Rng): EnemyKind {
  const total = ENEMIES.reduce((s, e) => s + e.rarity, 0);
  let roll = rng.next() * total;
  for (const e of ENEMIES) {
    roll -= e.rarity;
    if (roll < 0) return e;
  }
  return ENEMIES[ENEMIES.length - 1];
}

/** 적 종류(기존 적 또는 지역 몬스터) 하나를 유닛으로 */
export function enemyUnit(k: EnemyKind | Monster, id: string, name = k.name, scale?: { hp: number; atk: number }): Unit {
  const m = "tags" in k ? k : undefined;
  const u: Unit = {
    id,
    side: "enemy",
    name,
    title: "",
    hp: k.hp,
    maxHp: k.hp,
    attack: k.attack,
    defense: k.defense,
    speed: k.speed,
    onHit: k.onHit,
    note: k.note,
    kind: k.id,
    tags: m?.tags,
    rank: m?.rank,
    abilities: m?.abilities,
    ...(m?.evade ? { evadeBonus: m.evade } : {}),
    ...(m?.crit ? { critBonus: m.crit } : {}),
    statuses: [],
    skills: m?.skills ?? [],
    cooldowns: {},
    guarding: false,
  };
  // 던전 몬스터: 기본 수치 × 구역 배율 × 등급 배율
  return scale ? scaleUnit(u, { hp: scale.hp * RANK_SCALE[u.rank ?? "normal"].hp, atk: scale.atk * RANK_SCALE[u.rank ?? "normal"].atk, def: scale.atk }) : u;
}

/** 수치에 배율을 곱한다 (체력은 가득 찬 채로) */
function scaleUnit(u: Unit, k: { hp: number; atk: number; def: number }): Unit {
  const hp = Math.max(1, Math.round(u.maxHp * k.hp));
  return {
    ...u,
    hp,
    maxHp: hp,
    attack: [Math.round(u.attack[0] * k.atk), Math.round(u.attack[1] * k.atk)],
    defense: Math.round(u.defense * k.def),
  };
}

/** 일반 몬스터 유닛에 정예 특성을 붙인다 (이름 앞에 특성, 특징 줄에 효과) */
export function makeElite(u: Unit, trait: EliteTrait): Unit {
  return {
    ...u,
    name: `${trait.prefix} ${u.name}`,
    rank: "elite",
    elite: trait.id,
    note: `${u.note ?? ""} 정예: ${trait.description}`.trim(),
    attack: [u.attack[0] + (trait.attack ?? 0), u.attack[1] + (trait.attack ?? 0)],
    defense: Math.max(0, u.defense + (trait.defense ?? 0)),
    speed: u.speed + (trait.speed ?? 0),
    evadeBonus: (u.evadeBonus ?? 0) + (trait.evade ?? 0),
    onHit: trait.onHit ?? u.onHit,
    abilities: trait.ability ? [...(u.abilities ?? []), trait.ability] : u.abilities,
  };
}

/** 같은 종류가 여럿이면 이름 뒤에 A, B…를 붙여 유닛으로 만든다 */
function nameUnits(kinds: (EnemyKind | Monster)[], scale?: { hp: number; atk: number }): Unit[] {
  return kinds.map((k, i) => {
    const same = kinds.filter((o) => o.id === k.id);
    const suffix = same.length > 1 ? ` ${String.fromCharCode(65 + kinds.slice(0, i).filter((o) => o.id === k.id).length)}` : "";
    return enemyUnit(k, `e${i}`, k.name + suffix, scale);
  });
}

/** 구역의 몬스터 배율 */
export function regionScale(region?: Region): { hp: number; atk: number } | undefined {
  return region?.scale ? REGION_SCALE[region.scale] : undefined;
}

/**
 * 적 무리를 뽑는다. 지역이 있으면 그 지역 몬스터 목록(가중치)과 마릿수로, 없으면 기존 적 목록으로.
 * 깊은 층의 난이도는 수치가 아니라 지역의 적 구성으로 올린다
 */
export function rollEncounter(rng: Rng, region?: Region, elites = 0): Unit[] {
  if (!region) {
    const count = rollInt(rng.next, ENCOUNTER_SIZE[0], ENCOUNTER_SIZE[1]);
    return nameUnits(Array.from({ length: count }, () => pickEnemy(rng)));
  }
  const count = rollInt(rng.next, region.size[0], region.size[1]);
  const total = region.monsters.reduce((s, m) => s + m.weight, 0);
  const picks = Array.from({ length: count }, () => {
    let roll = rng.next() * total;
    return region.monsters.find((m) => (roll -= m.weight) < 0) ?? region.monsters[region.monsters.length - 1];
  });
  // 일반 몬스터는 지역의 정예 확률로 정예가 된다 (특성 하나 무작위). 지역에서 elite로 정한 몬스터는 늘 정예.
  // 앞에서 elites마리는 반드시 정예 (정예 목적지)
  let forced = 0;
  const scale = regionScale(region);
  return nameUnits(picks.map((p) => getMonster(p.id)!), scale).map((u, i) => {
    if (u.rank !== "normal") return u;
    const must = picks[i].elite || forced < elites;
    if (!must && !(region.eliteChance > 0 && rng.next() < region.eliteChance)) return u;
    if (must && !picks[i].elite) forced++;
    const elite = makeElite(u, ELITE_TRAITS[Math.floor(rng.next() * ELITE_TRAITS.length)]);
    // 구역 배율이 있으면 정예 등급 배율도 (일반 → 정예)
    return scale ? scaleUnit(elite, { hp: RANK_SCALE.elite.hp, atk: RANK_SCALE.elite.atk, def: 1 }) : elite;
  });
}

/** 보스 전투: 보스와 호위 */
export function bossEncounter(bossId: string, scale?: { hp: number; atk: number }): Unit[] {
  const boss = getMonster(bossId);
  if (!boss) return [];
  return nameUnits([boss, ...(boss.escort ?? []).flatMap((id) => getMonster(id) ?? [])], scale);
}

/** 전투를 시작한다. 첫 용병의 차례까지 진행된 상태로 돌려준다 */
export function startBattle(mercs: Merc[], seed: number, enemies?: Unit[], depth = 1): Battle {
  const rng = createRng(seed);
  return begin([...mercs.map(mercUnit), ...(enemies ?? rollEncounter(rng))], rng, depth, START_SUPPLIES);
}

/** 이미 만든 유닛으로 전투를 시작한다 (테스트에서 능력치를 고정할 때 쓴다) */
export function startBattleWithUnits(units: Unit[], seed: number, depth = 1): Battle {
  return begin(units, createRng(seed), depth, START_SUPPLIES);
}

/**
 * 던전 안의 전투. 용병 유닛(이전 전투의 체력·상태이상이 남아 있다)과 들고 있는 물자로 시작하고,
 * 적 무리는 시드로 뽑는다.
 */
export function startBattleFrom(
  mercs: Unit[],
  seed: number,
  opts: { depth: number; supplies: Record<SupplyKind, number>; walked?: number; enemies?: Unit[]; region?: Region; boss?: string; elites?: number },
): Battle {
  const rng = createRng(seed);
  const scale = regionScale(opts.region);
  const enemies = opts.enemies ?? (opts.boss ? bossEncounter(opts.boss, scale) : rollEncounter(rng, opts.region, opts.elites));
  const b = begin([...mercs, ...enemies], rng, opts.depth, opts.supplies, opts.walked);
  if (opts.region) b.place = opts.region.name;
  if (scale) b.scale = scale;
  return b;
}

function begin(units: Unit[], rng: Rng, depth: number, supplies: Record<SupplyKind, number>, walked = 0): Battle {
  const b: Battle = {
    round: 0,
    units,
    order: [],
    turn: -1,
    supplies: { ...supplies },
    depth,
    walked,
    guideUsed: false,
    rng: 0,
    outcome: null,
    log: [],
  };
  // 싸울 용병이 없으면 바로 끝난다
  checkOutcome(b);
  // 포효: 전투 시작 시 적 전체 위축
  for (const u of b.units.filter((x) => x.hp > 0 && has(x, "war_cry"))) {
    b.log.push({ type: "passive", unit: u.id, passive: "war_cry" });
    for (const foe of foes(b, u)) applyStatus(b, foe, "weaken");
  }
  advance(b, rng);
  b.rng = rng.state();
  return b;
}

// ── 행동 ────────────────────────────────────────────────

/**
 * 행동 하나를 처리하고 새 전투 상태를 돌려준다 (원본은 바꾸지 않는다).
 * 할 수 없는 행동이면 원본을 그대로 돌려준다.
 * 용병 행동 뒤에는 다음 용병 차례가 올 때까지 적 턴과 상태이상을 자동으로 진행한다.
 * 길안내자 행동은 용병 차례를 넘기지 않는다.
 */
export function act(battle: Battle, action: BattleAction): Battle {
  if (validate(battle, action)) return battle;
  const b = structuredClone(battle);
  const rng = createRng(b.rng);
  const actor = currentActor(b)!;
  const enemiesBefore = foes(b, actor).length;

  // 적대 단계: 가끔 명령을 무시하고 아무 적이나 공격한다
  if (action.type !== "guide" && action.type !== "wait" && actor.bond === "hostile" && rng.next() < BOND.disobeyChance) {
    const others = foes(b, actor);
    b.log.push({ type: "disobey", unit: actor.id });
    action = { type: "attack", target: others[Math.floor(rng.next() * others.length)].id };
  }

  switch (action.type) {
    case "attack":
      attack(b, rng, actor, unitById(b, action.target)!);
      break;
    case "wait":
      b.log.push({ type: "wait", unit: actor.id });
      break;
    case "bandage":
      b.supplies.bandage--;
      cure(b, actor, "bleed", actor.id, "bandage");
      break;
    case "skill":
      castSkill(b, rng, actor, skillOf(actor, action)!, action.target ? unitById(b, action.target) : undefined);
      break;
    case "guide": {
      const target = unitById(b, action.target)!;
      b.supplies[action.item]--;
      b.guideUsed = true;
      if (target.hp <= 0) {
        // 빈사 구출: 물약은 원래 회복량, 붕대는 조금
        const amount = action.item === "potion" ? Math.round(POTION_HEAL * potionMultiplier(target)) : DEATH.bandageRevive;
        heal(b, target, amount, "guide");
        target.dying = undefined;
        target.stable = undefined;
        b.log.push({ type: "rescue", target: target.id, via: action.item === "potion" ? "potion" : "bandage" });
        break;
      }
      if (action.item === "bandage") cure(b, target, "bleed", "guide", "bandage");
      if (action.item === "antidote") cure(b, target, "poison", "guide", "antidote");
      if (action.item === "potion") {
        // 손발이 맞는다: 길안내자가 건넨 물약 효과 +50%
        // 호의 이상이면 +25%
        const amount = Math.round(POTION_HEAL * potionMultiplier(target));
        heal(b, target, amount, "guide");
      }
      break;
    }
  }

  if (action.type !== "guide") {
    endTurn(actor);
    // 숨통 끊기: 적을 쓰러뜨리면 라운드당 한 번 즉시 다시 행동
    const killed = foes(b, actor).length < enemiesBefore;
    if (killed && !b.outcome && actor.hp > 0 && has(actor, "finishing_bite") && actor.fx!.biteRound !== b.round) {
      actor.fx!.biteRound = b.round;
      b.log.push({ type: "passive", unit: actor.id, passive: "finishing_bite" });
    } else {
      advance(b, rng);
    }
  }

  b.rng = rng.state();
  return b;
}

// ── 내부 처리 (b를 직접 바꾼다) ─────────────────────────

function checkOutcome(b: Battle) {
  if (b.outcome) return;
  const outcome = living(b, "enemy").length === 0 ? "victory" : living(b, "merc").length === 0 ? "defeat" : null;
  if (outcome) {
    b.outcome = outcome;
    b.log.push({ type: "end", outcome });
  }
}

function damage(b: Battle, target: Unit, amount: number) {
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) {
    target.statuses = [];
    b.log.push({ type: "down", target: target.id });
    // 용병은 바로 죽지 않고 빈사로 쓰러진다
    if (target.side === "merc" && !target.dead) {
      target.dying = DEATH.dyingRounds;
      b.log.push({ type: "dying", target: target.id, rounds: DEATH.dyingRounds });
    }
    // 몬스터: 쓰러지면 갈라지거나, 부리는 쪽이 다시 부른다 (승패 판정 전에)
    if (target.side === "enemy") onMonsterDown(b, target);
    checkOutcome(b);
  } else if (target.side === "enemy") {
    onMonsterHurt(b, target);
  }
}

// ── 몬스터 특수 능력 ───────────────────────────────────

function ability<K extends Ability["kind"]>(u: Unit, kind: K): Extract<Ability, { kind: K }> | undefined {
  return u.abilities?.find((a): a is Extract<Ability, { kind: K }> => a.kind === kind);
}

/** 몬스터를 새로 세운다 (source 바로 뒤 자리). 살아 있는 적이 MAX_ENEMIES면 더 늘지 않는다 */
function spawn(b: Battle, kind: string, count: number, source: Unit, how: "split" | "hatch" | "brood" | "summon") {
  const m = getMonster(kind);
  if (!m) return;
  for (let n = 0; n < count && living(b, "enemy").length < MAX_ENEMIES; n++) {
    const unit = enemyUnit(m, `e${b.units.length}`, m.name, b.scale);
    b.units.splice(b.units.indexOf(source) + 1 + n, 0, unit);
    b.log.push({ type: "spawn", unit: unit.id, by: source.id, how });
  }
}

function onMonsterDown(b: Battle, target: Unit) {
  const split = ability(target, "split");
  if (split) spawn(b, split.into, split.count, target, "split");
  // 늑대 조련사 등: 같은 종류 아군이 쓰러지면 다시 부른다
  for (const u of living(b, "enemy")) {
    const re = ability(u, "resummon");
    if (!re || re.into !== target.kind || (u.fx?.summoned ?? 0) >= re.times) continue;
    u.fx = { ...u.fx, summoned: (u.fx?.summoned ?? 0) + 1 };
    spawn(b, re.into, 1, u, "summon");
    break;
  }
}

function onMonsterHurt(b: Battle, target: Unit) {
  const ratio = target.hp / target.maxHp;
  const at = ability(target, "splitAt");
  if (at) {
    target.fx ??= {};
    while ((target.fx.splitStage ?? 0) < at.at.length && ratio <= at.at[target.fx.splitStage ?? 0]) {
      target.fx.splitStage = (target.fx.splitStage ?? 0) + 1;
      spawn(b, at.into, at.count, target, "split");
    }
  }
  const call = ability(target, "summon");
  if (call && ratio <= call.below && (target.fx?.summoned ?? 0) < call.times) {
    target.fx = { ...target.fx, summoned: (target.fx?.summoned ?? 0) + 1 };
    spawn(b, call.into, call.count, target, "summon");
  }
}

/** 몬스터 능력에서 오는 공격 보정 (무리, 광폭) */
function monsterBonus(b: Battle, u: Unit): number {
  let bonus = 0;
  const pack = ability(u, "pack");
  if (pack) bonus += pack.bonus * friends(b, u).filter((f) => f !== u && f.tags?.includes(pack.tag)).length;
  const rage = ability(u, "enrage");
  if (rage && u.hp <= u.maxHp * rage.below) bonus += rage.bonus;
  return bonus;
}

/** 우두머리(정예) 곁의 같은 종류 아군이 받는 공격 보정 */
function leaderBonus(b: Battle, u: Unit): number {
  return friends(b, u)
    .filter((f) => f !== u && f.kind === u.kind)
    .reduce((s, f) => s + (ability(f, "lead")?.bonus ?? 0), 0);
}

/**
 * 차례가 온 몬스터의 능력 행동 (부화, 낳기). 행동을 써 버렸으면 true (공격하지 않는다)
 */
function monsterTurn(b: Battle, rng: Rng, unit: Unit): boolean {
  unit.fx ??= {};
  unit.fx.age = (unit.fx.age ?? 0) + 1;
  // 재생: 차례마다 체력 회복 (나무 거인 등)
  const regen = ability(unit, "regen");
  if (regen && unit.hp < unit.maxHp) heal(b, unit, regen.amount, unit.id);
  const hatch = ability(unit, "hatch");
  if (hatch) {
    if (unit.fx.age >= hatch.turns) {
      spawn(b, hatch.into, hatch.count, unit, "hatch");
      unit.hp = 0;
      unit.statuses = [];
      b.log.push({ type: "down", target: unit.id });
      checkOutcome(b);
    }
    return true; // 알은 공격하지 않는다
  }
  // 도망: 정해진 차례에 전투에서 빠진다 (처치 보상 없음)
  const flee = ability(unit, "flee");
  if (flee && unit.fx.age >= flee.turns) {
    unit.hp = 0;
    unit.statuses = [];
    unit.fled = true;
    b.log.push({ type: "fled", unit: unit.id });
    checkOutcome(b);
    return true;
  }
  // 자폭: 정해진 차례에 터진다. 자신은 쓰러지고 모든 적이 피해를 입는다
  const boom = ability(unit, "explode");
  if (boom && unit.fx.age >= boom.turns) {
    b.log.push({ type: "explode", unit: unit.id });
    for (const foe of foes(b, unit)) {
      if (b.outcome) break;
      strike(b, rng, unit, foe, rollInt(rng.next, boom.damage[0], boom.damage[1]), { aoe: true, onHit: false });
    }
    if (unit.hp > 0) {
      unit.hp = 0;
      unit.statuses = [];
      b.log.push({ type: "down", target: unit.id });
      checkOutcome(b);
    }
    return true;
  }
  const brood = ability(unit, "brood");
  if (brood && unit.fx.age % brood.every === 0 && living(b, "enemy").length < MAX_ENEMIES) {
    spawn(b, brood.into, brood.count, unit, "brood");
    return true;
  }
  return false;
}

/** 빈사인가 (아직 구할 수 있다) */
export function isDying(u: Unit): boolean {
  return u.hp <= 0 && !u.dead && (u.dying !== undefined || !!u.stable);
}

/** 라운드 시작: 빈사 시간이 다 된 용병은 생존 판정 */
function rollDeaths(b: Battle, rng: Rng) {
  for (const u of b.units) {
    if (u.side !== "merc" || u.hp > 0 || u.dead || u.dying === undefined) continue;
    u.dying--;
    if (u.dying > 0) continue;
    u.dying = undefined;
    const chance = survivalChance(u);
    if (rng.next() < chance) {
      u.stable = true;
      b.log.push({ type: "survive", target: u.id, chance });
    } else {
      u.dead = true;
      b.log.push({ type: "death", target: u.id, chance });
    }
  }
}

function has(u: Unit, passive: string): boolean {
  return u.passives?.includes(passive) ?? false;
}

/** 걸려 있는 상태의 수치 (없으면 0) */
export function statusValue(u: Unit, kind: StatusKind): number {
  const s = u.statuses.find((x) => x.kind === kind);
  return s ? (s.value ?? STATUS[kind].value ?? 0) : 0;
}

/**
 * 상태이상을 건다. 다시 걸리면 지속 시간은 새로 고치고 수치는 큰 쪽.
 * self: 자기 행동 중에 자신에게 건다 (그 행동이 끝날 때 줄지 않도록 1을 더한다)
 */
function applyStatus(b: Battle, target: Unit, kind: StatusKind, opts: { value?: number; turns?: number; self?: boolean; source?: string } = {}) {
  let turns = (opts.turns ?? STATUS[kind].turns) + (opts.self && STATUS[kind].damage === 0 && kind !== "regen" ? 1 : 0);
  // 임기응변: 출혈·중독 지속 1턴 감소
  if (HARMFUL.includes(kind) && has(target, "improvise")) turns = Math.max(1, turns - 1);
  const existing = target.statuses.find((s) => s.kind === kind);
  if (existing) {
    existing.turns = turns;
    if (opts.value !== undefined) existing.value = Math.max(existing.value ?? STATUS[kind].value ?? 0, opts.value);
    if (opts.source) existing.source = opts.source;
  } else {
    target.statuses.push({ kind, turns, ...(opts.value !== undefined ? { value: opts.value } : {}), ...(opts.source ? { source: opts.source } : {}) });
  }
  b.log.push({ type: "status", target: target.id, kind });
}

/** 저항 (0~1, 음수면 더 잘 걸린다). 기절: 몬스터 기본 저항 + 걸린 횟수 × 0.4 + 굳건함 - 흔들림 */
export function resistOf(u: Unit, kind: ResistKind): number {
  switch (kind) {
    case "stun":
      return (
        (u.side === "enemy" ? (RESIST.stunBase[u.rank ?? "normal"] ?? 0) : 0) +
        (u.fx?.stunCount ?? 0) * RESIST.stunStep +
        statusValue(u, "stunResUp") -
        statusValue(u, "shaken")
      );
    case "bleed":
      return -statusValue(u, "bleedVuln");
    case "poison":
      return -statusValue(u, "poisonVuln");
    case "healReduction":
      return 0;
  }
}

function isResistKind(kind: StatusKind): kind is ResistKind {
  return kind === "stun" || kind === "bleed" || kind === "poison" || kind === "healReduction";
}

/** 실제로 걸릴 확률: 거는 확률 - 저항 (강철 심장이면 출혈·중독 절반). 확정이면 그대로 */
export function statusChance(target: Unit, roll: StatusRoll): number {
  const chance = roll.chance ?? 1;
  if (roll.sure || !isResistKind(roll.status)) return chance;
  const steel = HARMFUL.includes(roll.status) && has(target, "steel_heart") ? PASSIVE.steelHeartFactor : 1;
  return Math.max(0, Math.min(1, chance * steel - resistOf(target, roll.status)));
}

/** 확률을 굴려 상태이상을 건다. 기절은 걸릴 때마다 기절 저항이 쌓인다 (확정 기절과 자기에게 건 기절은 빼고) */
function tryStatus(b: Battle, rng: Rng, actor: Unit, target: Unit, roll: StatusRoll) {
  if (target.hp <= 0) return;
  const self = target === actor;
  const chance = self ? 1 : statusChance(target, roll);
  if (chance < 1 && rng.next() >= chance) {
    b.log.push({ type: "resist", target: target.id, kind: roll.status });
    return;
  }
  applyStatus(b, target, roll.status, { value: roll.value, turns: roll.turns, self, ...(roll.status === "duel" || roll.status === "cover" ? { source: actor.id } : {}) });
  if (roll.status === "stun" && !roll.sure && !self) {
    target.fx ??= {};
    target.fx.stunCount = (target.fx.stunCount ?? 0) + 1;
  }
}

function cure(b: Battle, target: Unit, kind: StatusKind, by: Actor, via: "bandage" | "antidote" | "skill") {
  target.statuses = target.statuses.filter((s) => s.kind !== kind);
  b.log.push({ type: "cure", target: target.id, kind, by, via });
}

type StrikeOptions = {
  /** 공격자의 상태이상 부여 확률을 굴리나 */
  onHit?: boolean;
  /** 여러 적을 한꺼번에 치는 공격 (사냥꾼의 집념을 쌓지 않는다) */
  aoe?: boolean;
  /** 반격으로 나간 공격 (다시 반격하지 않는다) */
  counter?: boolean;
  /** 행동을 시작할 때 살아 있던 적 수 (무쌍의 투혼). 없으면 지금 수 */
  enemiesAtStart?: number;
  /** 이 공격의 치명타 확률 추가 */
  critBonus?: number;
  /** 이 공격이 따르는 스탯과 배율 (공격자의 그 스탯 × 배율만큼 피해 +) */
  scaling?: Scaling[];
  /** 대상 방어 무시 비율 */
  pierce?: number;
  /** 행동을 시작할 때 쌓여 있던 응축 (다음 공격 위력 +) */
  charge?: number;
  /** 준 피해의 이 비율만큼 회복 */
  lifesteal?: number;
  /** 타격마다 거는 상태이상 */
  perHit?: StatusRoll;
};

/** 잃은 체력 비율 (0~1) */
function lostRatio(u: Unit): number {
  return (u.maxHp - u.hp) / u.maxHp;
}

/**
 * 한 번의 타격에 들어가는 보정값. 상태를 읽기만 한다.
 * 실제 타격(strike)과 미리보기(previewAction)가 같은 함수를 쓰므로 둘이 어긋나지 않는다.
 */
export type StrikeFactors = {
  /** 공격자 쪽 덧셈 보정 (종족 패시브, 각성, 위축, 스탯) */
  bonus: number;
  /** 공격자 쪽 곱셈 보정 (선제 일격, 흥이 오른다, 응축) */
  multiplier: number;
  critChance: number;
  /** 맞는 쪽이 피할 확률 */
  evadeChance: number;
  /** 균열로 더 받는 피해 (없으면 0) */
  crack: number;
  guard: boolean;
  /** 맞는 쪽 감소 (방어력, 바위의 뿌리, 고통 망각, 적응, 방어 강화·감소) */
  reduce: number;
  /** 방어 무시 비율 (0~1) */
  pierce: number;
  /** 맞는 쪽 받는 피해 배율 (표적 +, 단단함 -) */
  taken: number;
  /** 맞히면 소모·갱신되는 패시브 기록 */
  uses: {
    firstStrike: boolean;
    cheer: boolean;
    dance: boolean;
    focus: { target: string; stacks: number } | null;
    adapt: boolean;
  };
};

/** 스탯 배율에서 오는 피해 (성장 스탯 × 배율) */
function scalingBonus(actor: Unit, scaling: Scaling[] | undefined): number {
  return (scaling ?? []).reduce((sum, s) => sum + Math.round((actor.power?.[s.stat] ?? 0) * s.mult), 0);
}

export function strikeFactors(b: Battle, actor: Unit, target: Unit, opts: StrikeOptions = {}): StrikeFactors {
  const fx = actor.fx ?? {};
  let bonus = 0;
  if (has(actor, "blood_thirst")) bonus += Math.round(PASSIVE.bloodThirstMax * lostRatio(actor));
  if (has(actor, "peerless_spirit")) bonus += opts.enemiesAtStart ?? foes(b, actor).length;
  // 깊은 곳의 피: 층 구조가 생기기 전까지는 지나온 칸 2칸마다 +1 (최대 +3)
  if (has(actor, "deep_blood")) bonus += Math.min(PASSIVE.deepBloodMax, Math.floor(b.walked / PASSIVE.deepBloodStep));
  if (has(actor, "solidarity") && friends(b, actor).length >= 4) bonus += PASSIVE.solidarityBonus;
  // 성장 스탯: 이 공격이 따르는 스탯(힘·마법·신성) × 배율만큼 피해 +
  bonus += scalingBonus(actor, opts.scaling);
  bonus += statusValue(actor, "awaken") + statusValue(actor, "attackUp") - statusValue(actor, "weaken");
  if (actor.abilities) bonus += monsterBonus(b, actor);
  if (actor.side === "enemy") bonus += leaderBonus(b, actor);
  if (actor.bond === "trusted") bonus += BOND.trustAttack;
  if (has(actor, "chase_instinct") && target.hp <= target.maxHp * PASSIVE.chaseRatio) bonus += PASSIVE.chaseBonus;
  let focus: StrikeFactors["uses"]["focus"] = null;
  if (has(actor, "hunters_focus") && !opts.aoe) {
    const stacks = fx.focus?.target === target.id ? Math.min(PASSIVE.huntersFocusMax, fx.focus.stacks + 1) : 0;
    focus = { target: target.id, stacks };
    bonus += stacks;
  }
  const dance = has(actor, "wind_dance") && !!fx.dance;
  if (dance) bonus += PASSIVE.windDanceBonus;

  let multiplier = 1 + (opts.charge ?? 0);
  const firstStrike = has(actor, "first_strike") && !fx.firstDone;
  if (firstStrike) multiplier *= PASSIVE.firstStrikeMultiplier;
  const cheer = has(actor, "rising_cheer") && (fx.cheer ?? 0) >= PASSIVE.cheerMax;
  if (cheer) multiplier *= PASSIVE.cheerMultiplier;

  let reduce = target.defense + statusValue(target, "brace") + statusValue(target, "armorUp") - statusValue(target, "armorDown");
  if (has(target, "rock_root")) reduce += PASSIVE.rockRootReduce;
  if (has(target, "pain_oblivion")) reduce += Math.round(PASSIVE.painOblivionMax * lostRatio(target));
  if (has(target, "adapt")) reduce += Math.min(PASSIVE.adaptMax, target.fx?.adapt?.[actor.id] ?? 0);
  // 결투: 결투를 건 상대에게 받는 피해가 준다
  const duel = actor.statuses.find((x) => x.kind === "duel" && x.source === target.id);
  if (duel) reduce += duel.value ?? STATUS.duel.value ?? 0;

  return {
    bonus,
    multiplier,
    critChance: critChanceOf(actor) + (opts.critBonus ?? 0),
    evadeChance: evadeChance(target),
    crack: statusValue(target, "crack"),
    guard: target.guarding,
    reduce,
    pierce: Math.min(1, (opts.pierce ?? 0) + statusValue(actor, "pierceUp")),
    taken: (1 + statusValue(target, "mark")) * (1 - statusValue(target, "toughen")),
    uses: { firstStrike, cheer, dance, focus, adapt: has(target, "adapt") },
  };
}

/** 치명타 확률 (기본 + 예리한 눈 + 성장 + 집중) */
function critChanceOf(u: Unit): number {
  return CRIT_CHANCE + (has(u, "keen_eye") ? PASSIVE.keenEyeCrit : 0) + (u.critBonus ?? 0) + statusValue(u, "critUp");
}

/** 보정값을 적용한 최종 피해 (보호막 전). base는 굴린 기본 피해 */
export function strikeAmount(base: number, f: StrikeFactors, crit: boolean): number {
  let amount = Math.max(1, base + f.bonus);
  amount = Math.round(amount * f.multiplier);
  if (crit) amount = Math.round(amount * CRIT_MULTIPLIER);
  amount += f.crack;
  if (f.guard) amount = Math.ceil(amount * GUARD_MULTIPLIER);
  if (f.taken !== 1) amount = Math.max(1, Math.round(amount * f.taken));
  // 방어 무시: 방어(감소)의 그 비율만큼은 빼지 않는다
  const reduce = f.reduce > 0 ? Math.round(f.reduce * (1 - f.pierce)) : f.reduce;
  return reduce > 0 ? Math.max(1, amount - reduce) : amount;
}

/** 맞힌 뒤 패시브 기록을 갱신한다. log가 false면 미리보기용 (기록을 남기지 않는다) */
function consume(b: Battle, actor: Unit, target: Unit, f: StrikeFactors, log = true) {
  actor.fx ??= {};
  if (f.uses.firstStrike) {
    actor.fx.firstDone = true;
    if (log) b.log.push({ type: "passive", unit: actor.id, passive: "first_strike" });
  }
  if (f.uses.cheer) {
    actor.fx.cheer = 0;
    if (log) b.log.push({ type: "passive", unit: actor.id, passive: "rising_cheer" });
  }
  if (f.uses.dance) actor.fx.dance = false;
  if (f.uses.focus) actor.fx.focus = f.uses.focus;
  if (f.uses.adapt) {
    target.fx ??= {};
    const seen = target.fx.adapt?.[actor.id] ?? 0;
    target.fx.adapt = { ...target.fx.adapt, [actor.id]: seen + 1 };
  }
}

function evadeChance(target: Unit): number {
  return Math.max(
    0,
    (has(target, "feather_step") ? PASSIVE.featherEvade : 0) +
      (has(target, "beast_reflex") ? PASSIVE.reflexEvade : 0) +
      (has(target, "wind_dance") ? PASSIVE.windDanceEvade : 0) +
      (target.evadeBonus ?? 0) +
      statusValue(target, "evadeUp") -
      statusValue(target, "evadeDown"),
  );
}

/** 이 효과가 따르는 스탯: 효과 조각 → 스킬 → 쓰는 용병의 직업 스탯 순서 */
export function statOf(skill: { stat?: PowerStat }, effect: { stat?: PowerStat } | undefined, actor: Unit): PowerStat {
  return effect?.stat ?? skill.stat ?? (actor.job ? JOB_STAT[actor.job] : undefined) ?? "str";
}

/** 피해 효과의 스탯 배율: scaling이 있으면 그대로, 없으면 (따르는 스탯, 배율) 하나. 고정 범위 피해는 없음 */
export function scalingOf(skill: { stat?: PowerStat }, e: DamageEffect, actor: Unit): Scaling[] {
  if (e.fixed) return [];
  return e.scaling ?? [{ stat: statOf(skill, e, actor), mult: e.multiplier ?? 1 }];
}

/** 공격자의 상태이상 부여 확률 (저항·강철 심장 반영) */
function onHitChance(actor: Unit, target: Unit): number {
  if (!actor.onHit) return 0;
  return statusChance(target, { status: actor.onHit.status, chance: actor.onHit.chance });
}

/** 한 번의 타격. 회피 → 보정 → 치명타 → 보호막 → 피해 → 맞은 뒤 효과. 준 피해(체력)를 돌려준다 */
function strike(b: Battle, rng: Rng, actor: Unit, target: Unit, base: number, opts: StrikeOptions = {}): number {
  const { onHit = true, counter = false } = opts;
  const f = strikeFactors(b, actor, target, opts);

  // 회피 (깃털의 발걸음, 야수의 반사신경, 바람의 춤, 회피 강화)
  if (f.evadeChance > 0 && rng.next() < f.evadeChance) {
    b.log.push({ type: "evade", actor: actor.id, target: target.id });
    if (has(target, "wind_dance")) {
      target.fx ??= {};
      target.fx.dance = true;
    }
    if (has(target, "beast_reflex") && !counter && actor.hp > 0 && target.hp > 0) {
      b.log.push({ type: "passive", unit: target.id, passive: "beast_reflex", target: actor.id });
      const basic = basicAttack(target);
      strike(b, rng, target, actor, rollBase(rng, target, basic), { counter: true, scaling: [{ stat: "str", mult: basic.multiplier ?? 1 }] });
    }
    return 0;
  }

  consume(b, actor, target, f);
  const crit = rng.next() < f.critChance;
  let amount = strikeAmount(base, f, crit);

  const absorbed = Math.min(target.shield ?? 0, amount);
  if (absorbed > 0) {
    target.shield! -= absorbed;
    amount -= absorbed;
  }
  b.log.push({
    type: "attack",
    actor: actor.id,
    target: target.id,
    damage: amount,
    crit,
    ...(absorbed > 0 ? { absorbed } : {}),
  });
  damage(b, target, amount);
  // 흡혈: 준 피해(보호막 포함)의 비율만큼
  if (opts.lifesteal && actor.hp > 0) {
    const gain = Math.round((amount + absorbed) * opts.lifesteal);
    if (gain > 0 && actor.hp < actor.maxHp) heal(b, actor, gain, actor.id);
  }
  if (target.hp <= 0) return amount;

  afterHit(b, target, amount);
  // 장인의 눈썰미: 20% 확률로 균열
  if (has(actor, "crafters_eye") && rng.next() < PASSIVE.crackChance) applyStatus(b, target, "crack");
  if (onHit && actor.onHit && rng.next() < onHitChance(actor, target)) applyStatus(b, target, actor.onHit.status);
  if (opts.perHit) tryStatus(b, rng, actor, target, opts.perHit);
  return amount;
}

/** 맞고 살아남은 뒤: 흥이 오른다, 사선 돌파 */
function afterHit(b: Battle, target: Unit, amount: number) {
  if (amount > 0 && has(target, "rising_cheer")) {
    target.fx ??= {};
    target.fx.cheer = Math.min(PASSIVE.cheerMax, (target.fx.cheer ?? 0) + 1);
  }
  if (has(target, "last_stand") && !target.fx?.lastStandDone && target.hp <= target.maxHp * PASSIVE.lastStandRatio) {
    target.fx ??= {};
    target.fx.lastStandDone = true;
    b.log.push({ type: "passive", unit: target.id, passive: "last_stand" });
    applyStatus(b, target, "awaken");
  }
}

/** 기본 공격은 배율 1, 추가 0인 피해 효과와 같다 (힘을 따른다). 용병 평타는 BASIC_ATTACK_MULT배 */
const BASIC_ATTACK: DamageEffect = { kind: "damage", stat: "str" };
const MERC_BASIC_ATTACK: DamageEffect = { kind: "damage", stat: "str", multiplier: BASIC_ATTACK_MULT };
const basicAttack = (u: Unit): DamageEffect => (u.side === "merc" ? MERC_BASIC_ATTACK : BASIC_ATTACK);

/** 배율 합 (여러 스탯을 섞으면 더한다) */
function totalMult(e: DamageEffect): number {
  return e.scaling ? e.scaling.reduce((s, x) => s + x.mult, 0) : (e.multiplier ?? 1);
}

/** 피해 효과의 기본 피해 범위 [최소, 최대] (보정 전) */
export function baseRange(actor: Unit, e: DamageEffect): [number, number] {
  if (e.fixed) return [e.fixed[0], e.fixed[1]];
  const m = totalMult(e);
  const bonus = e.bonus ?? 0;
  return [Math.round(actor.attack[0] * m) + bonus, Math.round(actor.attack[1] * m) + bonus];
}

/** 피해 효과의 기본 피해를 굴린다 */
function rollBase(rng: Rng, actor: Unit, e: DamageEffect): number {
  if (e.fixed) return rollInt(rng.next, e.fixed[0], e.fixed[1]);
  return Math.round(rollInt(rng.next, actor.attack[0], actor.attack[1]) * totalMult(e)) + (e.bonus ?? 0);
}

/**
 * 감싸기: 대상에게 "보호받음"을 건 동료가 살아 있으면 그 동료가 대신 맞는다 (적 하나를 노리는 공격만).
 * 가디언의 감싸기와 몬스터(세계수 근위병)가 같은 규칙을 쓴다
 */
function coverFor(b: Battle, target: Unit): Unit {
  const c = target.statuses.find((x) => x.kind === "cover");
  const guard = c && b.units.find((u) => u.id === c.source && u.hp > 0 && u !== target && u.side === target.side);
  if (!guard) return target;
  b.log.push({ type: "cover", unit: guard.id, target: target.id });
  return guard;
}

/** 응축을 꺼낸다 (이번 행동의 공격에 쓰고 사라진다) */
function takeCharge(actor: Unit): number {
  const charge = statusValue(actor, "charge");
  if (charge) actor.statuses = actor.statuses.filter((s) => s.kind !== "charge");
  return charge;
}

function attack(b: Battle, rng: Rng, actor: Unit, aimed: Unit) {
  const charge = takeCharge(actor);
  const target = coverFor(b, aimed);
  const basic = basicAttack(actor);
  strike(b, rng, actor, target, rollBase(rng, actor, basic), {
    enemiesAtStart: foes(b, actor).length,
    scaling: [{ stat: "str", mult: basic.multiplier ?? 1 }],
    charge,
  });
}

/** 회복. 치유 감소가 걸려 있으면 받는 양이 준다 */
function heal(b: Battle, target: Unit, amount: number, by: Actor) {
  const cut = statusValue(target, "healReduction");
  const healed = Math.min(Math.round(amount * (1 - cut)), target.maxHp - target.hp);
  target.hp += healed;
  b.log.push({ type: "heal", target: target.id, amount: healed, by });
}

/** 보호막. 겹쳐 쌓지 않고 큰 쪽으로 채운다 */
function giveShield(b: Battle, t: Unit, amount: number, by: string) {
  if (amount <= 0 || t.hp <= 0) return;
  t.shield = Math.max(t.shield ?? 0, amount);
  b.log.push({ type: "shield", target: t.id, amount, by });
}

/** 효과의 대상들: 자신 / 아군 전체 / 고른 대상 (살아 있는 유닛만) */
function recipients(b: Battle, actor: Unit, target: Unit | undefined, who: "self" | "allies" | undefined): Unit[] {
  const list = who === "self" ? [actor] : who === "allies" ? friends(b, actor) : target ? [target] : [];
  return list.filter((u) => u.hp > 0);
}

/** 스킬의 효과를 차례로 처리한다. 스킬마다 코드를 따로 짜지 않는다 */
function castSkill(b: Battle, rng: Rng, actor: Unit, skillId: SkillId, target: Unit | undefined) {
  const skill = skillDef(actor, skillId)!;
  if (skill.ultimate) {
    actor.fx ??= {};
    actor.fx.ultimateUsed = true;
  } else {
    // 대기 N: 다음 N번의 자기 차례에는 쓸 수 없다 (차례가 올 때마다 1씩 준다)
    actor.cooldowns[skillId] = skill.cooldown > 0 ? skill.cooldown + 1 : 0;
  }
  b.log.push({ type: "skill", actor: actor.id, skill: skill.id, ...(target ? { target: target.id } : {}) });
  const enemiesAtStart = foes(b, actor).length;
  // 응축은 이 스킬이 공격일 때만 쓴다
  const charge = skill.effects.some((e) => e.kind === "damage") ? takeCharge(actor) : 0;
  const healPower = actor.power?.faith ?? 0;

  for (const e of skill.effects) {
    switch (e.kind) {
      case "fail":
        if (rng.next() < e.chance) {
          b.log.push({ type: "fizzle", actor: actor.id, skill: skill.id });
          return;
        }
        break;
      case "damage": {
        const opts: StrikeOptions = {
          onHit: e.onHit ?? true,
          enemiesAtStart,
          critBonus: e.critBonus,
          scaling: scalingOf(skill, e, actor),
          pierce: e.pierce,
          charge,
          lifesteal: e.lifesteal,
          perHit: e.perHit,
        };
        const hits = e.hits ?? 1;
        if (e.area === "all") {
          for (const enemy of foes(b, actor)) {
            for (let h = 0; h < hits && enemy.hp > 0 && !b.outcome; h++) strike(b, rng, actor, enemy, rollBase(rng, actor, e), { ...opts, aoe: true });
          }
        } else if (e.area === "random") {
          for (let h = 0; h < hits && !b.outcome; h++) {
            const pool = foes(b, actor);
            if (pool.length === 0) break;
            strike(b, rng, actor, pool[Math.floor(rng.next() * pool.length)], rollBase(rng, actor, e), { ...opts, aoe: true });
          }
        } else {
          // 감싸기: 적 하나를 노리는 공격이면 보호하는 동료가 대신 맞는다
          const hitTarget = target && target.side !== actor.side ? coverFor(b, target) : target;
          for (let h = 0; h < hits; h++) {
            if (!hitTarget || hitTarget.hp <= 0 || b.outcome) break;
            strike(b, rng, actor, hitTarget, rollBase(rng, actor, e), opts);
          }
          // 적 둘: 대상 말고 무작위 적 하나도
          if (e.area === "two" && !b.outcome) {
            const others = foes(b, actor).filter((u) => u !== target);
            if (others.length > 0) strike(b, rng, actor, others[Math.floor(rng.next() * others.length)], rollBase(rng, actor, e), { ...opts, aoe: true });
          }
        }
        break;
      }
      case "applyStatus": {
        const list = e.area === "all" ? foes(b, actor) : recipients(b, actor, target, e.who);
        for (const t of list) tryStatus(b, rng, actor, t, e);
        break;
      }
      case "heal":
        for (const t of recipients(b, actor, target, e.who)) heal(b, t, e.amount + healPower, actor.id);
        break;
      case "cure": {
        const t = e.who === "self" ? actor : target;
        if (!t) break;
        const kinds = e.count ? DEBUFFS : (e.kinds ?? HARMFUL);
        const found = t.statuses.filter((x) => kinds.includes(x.kind)).slice(0, e.count ?? Infinity);
        for (const s of found) cure(b, t, s.kind, actor.id, "skill");
        break;
      }
      case "shield":
        for (const t of recipients(b, actor, target, e.who)) giveShield(b, t, e.amount + (actor.power?.[statOf(skill, e, actor)] ?? 0), actor.id);
        break;
      case "taunt":
        actor.guarding = true;
        break;
      case "selfCost":
        recoil(b, actor, e.hp ?? Math.round(actor.maxHp * (e.pctMaxHp ?? 0)), skill.id);
        break;
      case "resetOnKill":
        if (target && target.side !== actor.side && target.hp <= 0) {
          actor.cooldowns[skill.id] = 0;
          b.log.push({ type: "refresh", actor: actor.id, skill: skill.id });
        }
        break;
      case "support":
        if (skill.target === "ally" && target) {
          // 대상의 옆 아군이 이 스킬의 회복·보호막을 절반 받는다
          for (const n of neighbors(b, target)) {
            for (const x of skill.effects) {
              if (x.kind === "heal" && !x.who) heal(b, n, Math.floor(x.amount / 2), actor.id);
              if (x.kind === "shield" && !x.who) giveShield(b, n, Math.floor(x.amount / 2), actor.id);
            }
          }
        } else {
          for (const n of neighbors(b, actor)) giveShield(b, n, e.shield, actor.id);
        }
        break;
      case "later":
        // 2단계 효과: 아직 처리하지 않는다
        break;
    }
  }
}

// ── 미리보기 ────────────────────────────────────────────

export type TargetPreview = {
  target: string;
  /** 치명타가 아닐 때 피해 범위 (타격 하나) */
  min: number;
  max: number;
  /** 치명타일 때 피해 범위 */
  critMin: number;
  critMax: number;
  critChance: number;
  /** 맞힐 확률 (대상의 회피) */
  hitChance: number;
  /** 체력+보호막 기준. sure: 맞히면 반드시 처치, maybe: 운이 좋으면 처치 */
  kill: "sure" | "maybe" | "no";
  /** 맞히면 걸릴 수 있는 상태이상과 확률 */
  statuses: { kind: StatusKind; chance: number }[];
};

export type ActionPreview = {
  damage: TargetPreview[];
  /** 거는 상태이상과 걸릴 확률 (저항 반영) */
  applies: { target: string; kind: StatusKind; chance: number }[];
  heal: { target: string; amount: number } | null;
  shield: { target: string; amount: number } | null;
  cures: { target: string; kinds: StatusKind[] } | null;
  taunt: boolean;
  /** 자기 체력 소모 (실제로 깎이는 양) */
  selfCost: number;
  /** 스킬이 실패할 확률 */
  failChance: number;
};

/**
 * 지금 차례인 용병의 행동(공격 또는 스킬)이 어떤 결과를 낼지 미리 계산한다.
 * 실제 처리와 같은 함수(strikeFactors, strikeAmount, baseRange)를 쓴다. 할 수 없는 행동이면 null.
 * 여러 번·여러 적을 치는 스킬은 앞의 타격이 소모하는 패시브(선제 일격 등)를 반영해 차례로 계산한다.
 * 무작위 대상(random)·적 둘(two)의 두 번째 대상은 미리 알 수 없어서 고른 대상만 보여 준다
 */
export function previewAction(battle: Battle, action: BattleAction): ActionPreview | null {
  if (action.type !== "attack" && action.type !== "skill") return null;
  if (validate(battle, action)) return null;
  const b = structuredClone(battle);
  const actor = currentActor(b)!;
  const target = action.target ? unitById(b, action.target) : undefined;
  const skill = action.type === "attack" ? null : skillDef(actor, skillOf(actor, action)!)!;
  const effects = skill ? skill.effects : [basicAttack(actor)];
  const enemiesAtStart = foes(b, actor).length;
  const charge = effects.some((e) => e.kind === "damage") ? statusValue(actor, "charge") : 0;
  const out: ActionPreview = { damage: [], applies: [], heal: null, shield: null, cures: null, taunt: false, selfCost: 0, failChance: 0 };

  for (const e of effects) {
    switch (e.kind) {
      case "fail":
        out.failChance = e.chance;
        break;
      case "damage": {
        const hits = e.hits ?? 1;
        const targets =
          e.area === "all"
            ? foes(b, actor).flatMap((t) => Array.from({ length: hits }, () => t))
            : e.area === "random"
              ? []
              : target
                ? Array.from({ length: hits }, () => target)
                : [];
        // 같은 대상을 여러 번 치면 앞 타격으로 체력이 깎여 있을 수 있다 (추격 본능 등 체력에 따른 보정).
        // 그래서 처음 체력과 "앞 타격이 모두 최대로 들어간" 체력 두 경우를 계산해 범위를 넓힌다
        const dealt: Record<string, number> = {};
        for (const t of targets) {
          const opts: StrikeOptions = {
            aoe: e.area === "all",
            enemiesAtStart,
            critBonus: e.critBonus,
            scaling: skill ? scalingOf(skill, e, actor) : [{ stat: "str", mult: e.multiplier ?? 1 }],
            pierce: e.pierce,
            charge,
          };
          const f = strikeFactors(b, actor, t, opts);
          const hp0 = t.hp;
          t.hp = Math.max(1, hp0 - (dealt[t.id] ?? 0));
          const fLow = strikeFactors(b, actor, t, opts);
          t.hp = hp0;
          const [lo, hi] = baseRange(actor, e);
          const amt = (base: number, crit: boolean, pick: (a: number, b: number) => number) => pick(strikeAmount(base, f, crit), strikeAmount(base, fLow, crit));
          const p: TargetPreview = {
            target: t.id,
            min: amt(lo, false, Math.min),
            max: amt(hi, false, Math.max),
            critMin: amt(lo, true, Math.min),
            critMax: amt(hi, true, Math.max),
            critChance: f.critChance,
            hitChance: 1 - f.evadeChance,
            kill: "no",
            statuses: [],
          };
          const toughness = t.hp + (t.shield ?? 0);
          p.kill = p.min >= toughness && p.hitChance >= 1 ? "sure" : p.critMax >= toughness ? "maybe" : "no";
          if ((e.onHit ?? true) && actor.onHit) p.statuses.push({ kind: actor.onHit.status, chance: onHitChance(actor, t) });
          if (has(actor, "crafters_eye")) p.statuses.push({ kind: "crack", chance: PASSIVE.crackChance });
          if (e.perHit) p.statuses.push({ kind: e.perHit.status, chance: statusChance(t, e.perHit) });
          out.damage.push(p);
          dealt[t.id] = (dealt[t.id] ?? 0) + p.critMax;
          consume(b, actor, t, f, false);
        }
        break;
      }
      case "applyStatus": {
        const list = e.area === "all" ? foes(b, actor) : recipients(b, actor, target, e.who);
        for (const t of list) out.applies.push({ target: t.id, kind: e.status, chance: t === actor ? 1 : statusChance(t, e) });
        break;
      }
      case "heal": {
        const t = recipients(b, actor, target, e.who)[0];
        if (t) out.heal = { target: t.id, amount: Math.min(Math.round((e.amount + (actor.power?.faith ?? 0)) * (1 - statusValue(t, "healReduction"))), t.maxHp - t.hp) };
        break;
      }
      case "cure": {
        const t = e.who === "self" ? actor : target;
        const kinds = e.count ? DEBUFFS : (e.kinds ?? HARMFUL);
        if (t) out.cures = { target: t.id, kinds: t.statuses.filter((s) => kinds.includes(s.kind)).slice(0, e.count ?? Infinity).map((s) => s.kind) };
        break;
      }
      case "shield": {
        const t = recipients(b, actor, target, e.who)[0];
        if (t) out.shield = { target: t.id, amount: e.amount + (skill ? (actor.power?.[statOf(skill, e, actor)] ?? 0) : 0) };
        break;
      }
      case "taunt":
        out.taunt = true;
        break;
      case "selfCost":
        out.selfCost = Math.max(0, Math.min(e.hp ?? Math.round(actor.maxHp * (e.pctMaxHp ?? 0)), actor.hp - 1));
        break;
    }
  }
  return out;
}

/** 패시브가 지금 어떤 상태인지 짧게 (화면 표시용). 조건이 안 맞아 꺼져 있으면 null */
export function passiveNote(b: Battle, u: Unit, passive: string): string | null {
  const fx = u.fx ?? {};
  switch (passive) {
    case "blood_thirst": {
      const n = Math.round(PASSIVE.bloodThirstMax * lostRatio(u));
      return n > 0 ? `공격 +${n}` : null;
    }
    case "pain_oblivion": {
      const n = Math.round(PASSIVE.painOblivionMax * lostRatio(u));
      return n > 0 ? `피해 -${n}` : null;
    }
    case "peerless_spirit":
      return `공격 +${foes(b, u).length}`;
    case "deep_blood": {
      const n = Math.min(PASSIVE.deepBloodMax, Math.floor(b.walked / PASSIVE.deepBloodStep));
      return n > 0 ? `공격 +${n}` : null;
    }
    case "solidarity":
      return friends(b, u).length >= 4 ? "공격 +1" : null;
    case "first_strike":
      return fx.firstDone ? null : "준비됨";
    case "rising_cheer":
      return `흥 ${fx.cheer ?? 0}/${PASSIVE.cheerMax}`;
    case "wind_dance":
      return fx.dance ? "다음 공격 +3" : null;
    case "hunters_focus":
      return fx.focus ? `연속 ${fx.focus.stacks + 1}` : null;
    case "last_stand":
      return fx.lastStandDone ? null : "대기";
    case "finishing_bite":
      return fx.biteRound === b.round ? null : "준비됨";
    case "warrior_pride":
      return fx.prideRound === b.round ? null : "준비됨";
    default:
      return "상시";
  }
}

/** 화면 표시용 능력치 (속도는 보여 주되, 행동 순서는 보여 주지 않는다) */
export function unitStats(u: Unit) {
  return {
    attack: u.attack,
    defense: u.defense,
    speed: speedOf(u),
    critChance: critChanceOf(u),
    evadeChance: evadeChance(u),
  };
}

/** 스킬 반동. 체력 1 아래로는 깎지 않는다 (스킬로 자멸하지 않게) */
function recoil(b: Battle, actor: Unit, amount: number, skill?: SkillId) {
  const dealt = Math.min(amount, actor.hp - 1);
  if (dealt > 0 && !b.outcome) {
    actor.hp -= dealt;
    b.log.push({ type: "recoil", target: actor.id, damage: dealt, ...(skill ? { skill } : {}) });
  }
}

/** 턴 시작에 효과를 내는 상태 (출혈·중독 피해, 재생 회복). 이 상태들은 턴 시작에 1턴 줄어든다 */
function ticks(kind: StatusKind): boolean {
  return STATUS[kind].damage > 0 || kind === "regen";
}

/** 턴 시작: 상태이상 피해, 재생 회복 */
function tick(b: Battle, unit: Unit) {
  for (const s of [...unit.statuses]) {
    if (unit.hp <= 0) break;
    if (!ticks(s.kind)) continue; // 강화·약화는 행동을 마칠 때 줄어든다
    s.turns--;
    if (s.kind === "regen") {
      if (unit.hp < unit.maxHp) heal(b, unit, s.value ?? STATUS.regen.value ?? 0, unit.id);
      continue;
    }
    const amount = s.value ?? STATUS[s.kind].damage;
    b.log.push({ type: "tick", target: unit.id, kind: s.kind, damage: amount });
    damage(b, unit, amount);
  }
  unit.statuses = unit.statuses.filter((s) => s.turns > 0);
}

/** 행동을 마칠 때: 강화·약화 지속 1턴 감소 */
function endTurn(unit: Unit) {
  for (const s of unit.statuses) if (!ticks(s.kind)) s.turns--;
  unit.statuses = unit.statuses.filter((s) => s.turns > 0);
}

/** 속도 (바람 정령의 가호, 선제, 가속·둔화 포함) */
export function speedOf(u: Unit): number {
  return (
    u.speed +
    (has(u, "wind_blessing") ? PASSIVE.windBlessingSpeed : 0) +
    (hasStatus(u, "haste") ? PASSIVE.hasteSpeed : 0) +
    statusValue(u, "speedUp") -
    statusValue(u, "slow")
  );
}

function newRound(b: Battle, rng: Rng) {
  b.round++;
  const mercs = living(b, "merc");
  // 행동 순서: 속도 + 무작위(0~SPEED_JITTER)가 높은 순. 같으면 원래 속도가 높은 쪽, 그다음 용병이 먼저
  const rolled = [...mercs, ...living(b, "enemy")].map((u, i) => ({ u, i, init: speedOf(u) + rollInt(rng.next, 0, SPEED_JITTER) }));
  rolled.sort(
    (x, y) =>
      y.init - x.init ||
      speedOf(y.u) - speedOf(x.u) ||
      (x.u.side === y.u.side ? 0 : x.u.side === "merc" ? -1 : 1) ||
      x.i - y.i,
  );
  b.order = rolled.map((r) => r.u.id);
  b.turn = -1;
  b.guideUsed = false;
  b.log.push({ type: "round", round: b.round });
  rollDeaths(b, rng);
  // 야생의 회복력: 라운드 시작마다 체력 회복
  for (const u of b.units) {
    if (u.hp > 0 && has(u, "wild_recovery") && u.hp < u.maxHp) heal(b, u, PASSIVE.wildRecovery, u.id);
  }
}

/** 전사의 긍지: 위태로운 아군 대신 맞아 줄 바바리안이 있으면 그쪽으로 */
function protector(b: Battle, target: Unit): Unit {
  if (target.hp > target.maxHp * PASSIVE.prideAllyRatio) return target;
  const guard = friends(b, target).find(
    (u) =>
      u !== target &&
      has(u, "warrior_pride") &&
      u.hp >= u.maxHp * PASSIVE.prideSelfRatio &&
      u.fx!.prideRound !== b.round,
  );
  if (!guard) return target;
  guard.fx!.prideRound = b.round;
  b.log.push({ type: "passive", unit: guard.id, passive: "warrior_pride", target: target.id });
  return guard;
}

/** 적이 노릴 용병: 막아선 용병이 있으면 그쪽, 없으면 무작위 (전사의 긍지가 가로챌 수 있다) */
function pickVictim(b: Battle, rng: Rng, unit: Unit): Unit | null {
  // 결투: 결투를 건 상대가 살아 있으면 그 상대만 노린다
  const duel = unit.statuses.find((x) => x.kind === "duel");
  const rival = duel && foes(b, unit).find((u) => u.id === duel.source);
  if (rival) return rival;
  const guards = foes(b, unit).filter((u) => u.guarding);
  const targets = guards.length > 0 ? guards : foes(b, unit);
  if (targets.length === 0) return null;
  return protector(b, targets[Math.floor(rng.next() * targets.length)]);
}

/**
 * 적의 차례. 스킬이 있는 적(용병형 적 등)은 이 확률로 준비된 스킬을 쓰고, 아니면 공격한다.
 * 스킬이 없는 몬스터는 늘 공격한다 (난수를 더 쓰지 않는다).
 */
function enemyTurn(b: Battle, rng: Rng, unit: Unit) {
  // 쓸모없는 지원은 고르지 않는다: 다친 아군이 없으면 회복 스킬, 지켜 줄 동료가 없으면 감싸기
  const hurt = friends(b, unit).some((f) => f.hp < f.maxHp);
  const others = friends(b, unit).filter((f) => f !== unit);
  const useful = (id: string) => {
    const sk = skillDef(unit, id)!;
    if (sk.effects.every((e) => e.kind === "heal") && !hurt) return false;
    if (sk.effects.some((e) => e.kind === "applyStatus" && e.status === "cover") && others.length === 0) return false;
    return true;
  };
  const ready = unit.skills.filter((id) => !(unit.cooldowns[id] > 0) && skillDef(unit, id) && useful(id));
  if (ready.length > 0 && rng.next() < ENEMY_SKILL_CHANCE) {
    const skill = skillDef(unit, ready[Math.floor(rng.next() * ready.length)])!;
    const covers = skill.effects.some((e) => e.kind === "applyStatus" && e.status === "cover");
    const target =
      skill.target === "enemy"
        ? pickVictim(b, rng, unit)
        : skill.target === "ally"
          ? [...(covers ? others : friends(b, unit))].sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0]
          : undefined;
    if (skill.target !== "enemy" || target) {
      castSkill(b, rng, unit, skill.id, target ?? undefined);
      return;
    }
  }
  const victim = pickVictim(b, rng, unit);
  if (!victim) return checkOutcome(b);
  attack(b, rng, unit, victim);
}

/** 스킬이 있는 적이 차례마다 스킬을 쓸 확률 */
export const ENEMY_SKILL_CHANCE = 0.5;

/**
 * 용병형 적: 용병과 같은 능력치·스킬·패시브 구조를 가진 적 (탐험가 무리 등, 나중에 쓴다).
 * 용병 데이터를 그대로 쓰되 적 편에 세운다.
 */
export function mercenaryEnemy(merc: Merc, id: string): Unit {
  return { ...mercUnit(merc), id, side: "enemy" };
}

/** 다음 용병 차례가 오거나 전투가 끝날 때까지 진행한다 */
function advance(b: Battle, rng: Rng) {
  for (let guard = 0; guard < 10_000; guard++) {
    if (b.outcome) return;
    b.turn++;
    if (b.turn >= b.order.length) {
      newRound(b, rng);
      continue;
    }
    const unit = unitById(b, b.order[b.turn]);
    if (!unit || unit.hp <= 0) continue;

    // 자기 차례가 오면 막아서기가 풀리고 스킬 대기가 줄어든다
    unit.guarding = false;
    for (const id of Object.keys(unit.cooldowns)) if (unit.cooldowns[id] > 0) unit.cooldowns[id]--;

    tick(b, unit);
    if (b.outcome || unit.hp <= 0) continue;
    // 속박·기절: 이번 차례를 쉬고 풀린다
    const skip = hasStatus(unit, "stun") ? "stun" : hasStatus(unit, "bind") ? "bind" : null;
    if (skip) {
      unit.statuses = unit.statuses.filter((s) => s.kind !== skip);
      b.log.push(skip === "stun" ? { type: "stunned", target: unit.id } : { type: "bound", target: unit.id });
      endTurn(unit);
      continue;
    }
    if (unit.side === "merc") return; // 플레이어 입력을 기다린다

    if (!monsterTurn(b, rng, unit)) enemyTurn(b, rng, unit);
    endTurn(unit);
  }
  throw new Error("전투가 끝나지 않는다 (무한 루프 방지)");
}
