// 턴제 전투 규칙. AI 없이 코드로만 돌아간다.
// 모든 결과는 이벤트(BattleEvent)로 남긴다. 지금은 텍스트로, 나중에는 같은 이벤트로 애니메이션을 재생한다.
//
// 흐름: 라운드마다 살아 있는 용병이 한 명씩 행동(공격, 붕대, 직업 스킬) → 적들이 자동으로 행동.
// 길안내자는 싸우지 않고, 라운드마다 한 번 물자(붕대·해독제·물약)를 용병에게 건넬 수 있다.
// 출혈·중독은 그 유닛의 턴이 시작될 때 피해를 준다.
import {
  CLEAVE_MULTIPLIER,
  CLEAVE_RECOIL,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  SPEED_JITTER,
  DEFAULT_SKILL,
  FIRELANCE_COST,
  FIRELANCE_MULTIPLIER,
  WARD_FAIL_CHANCE,
  WARD_SHIELD,
  DEFAULT_STATS,
  GUARD_MULTIPLIER,
  JOB_SKILL,
  PIERCE_BONUS,
  POWER_MULTIPLIER,
  PRAY_HEAL,
  SKILLS,
  VOLLEY_DAMAGE,
  type SkillId,
  ENCOUNTER_SIZE,
  ENEMIES,
  HARMFUL,
  PASSIVE,
  JOB_STATS,
  POTION_HEAL,
  START_SUPPLIES,
  STATUS,
  type EnemyKind,
  type OnHit,
  type StatusKind,
  type SupplyKind,
} from "../../data/combat";
import { createRng, rollInt, type Rng } from "../random";
import type { Merc } from "../types";

export type Side = "merc" | "enemy";
export type Status = { kind: StatusKind; turns: number };

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
  /** 용병만: 직업 스킬 */
  skill?: SkillId;
  /** 스킬을 다시 쓸 수 있을 때까지 남은 자기 턴 수 (0이면 사용 가능) */
  cooldown: number;
  /** 막아서기 중 (자기 다음 차례가 오면 풀린다) */
  guarding: boolean;
  /** 보호막. 공격 피해를 체력보다 먼저 받아 낸다. 전투가 끝날 때까지 남는다 (상태이상 피해는 못 막는다) */
  shield?: number;
  /** 용병만: 종족 패시브 id (data/passives.ts) */
  passives?: string[];
  /** 용병만: 화면에 그릴 때 쓰는 직업·종족 id (규칙에는 쓰지 않는다) */
  job?: string;
  race?: string;
  /** 패시브가 쓰는 전투 중 기록 */
  fx?: PassiveState;
};

export type PassiveState = {
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
  | { type: "recoil"; target: string; damage: number }
  | { type: "shield"; target: string; amount: number; by: string }
  /** 종족 패시브 발동. target은 패시브마다 뜻이 다르다 (전사의 긍지: 지켜 준 아군) */
  | { type: "passive"; unit: string; passive: string; target?: string }
  | { type: "evade"; actor: string; target: string }
  /** 스킬이 실패했다 (정령이 답하지 않음 등) */
  | { type: "fizzle"; actor: string; skill: SkillId }
  | { type: "down"; target: string }
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
  /** 이번 라운드에 길안내자가 이미 물자를 건넸나 */
  guideUsed: boolean;
  /** 난수 상태. 같은 상태면 같은 결과가 나온다 */
  rng: number;
  outcome: Outcome | null;
  log: BattleEvent[];
};

export type BattleAction =
  | { type: "attack"; target: string }
  | { type: "bandage" }
  | { type: "skill"; target?: string }
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
      if (!target || target.side !== "enemy" || target.hp <= 0) return "공격할 수 없는 대상";
      return null;
    }
    case "bandage":
      if (b.supplies.bandage <= 0) return "붕대가 없다";
      if (!hasStatus(actor, "bleed")) return "출혈이 없다";
      return null;
    case "skill": {
      if (!actor.skill) return "스킬이 없다";
      if (actor.cooldown > 0) return `${actor.cooldown}턴 뒤에 쓸 수 있다`;
      const kind = SKILLS[actor.skill].target;
      const target = action.target ? unitById(b, action.target) : undefined;
      if (kind === "none") return action.target ? "대상을 고르지 않는 스킬" : null;
      if (!target || target.hp <= 0) return "대상을 골라야 한다";
      if (kind === "enemy" && target.side !== "enemy") return "적에게만 쓸 수 있다";
      if (kind === "ally" && target.side !== "merc") return "아군에게만 쓸 수 있다";
      return null;
    }
    case "guide": {
      if (b.guideUsed) return "이번 라운드에는 이미 도왔다";
      if (b.supplies[action.item] <= 0) return "물자가 없다";
      const target = unitById(b, action.target);
      if (!target || target.side !== "merc" || target.hp <= 0) return "건넬 수 없는 대상";
      if (action.item === "bandage" && !hasStatus(target, "bleed")) return "출혈이 없다";
      if (action.item === "antidote" && !hasStatus(target, "poison")) return "중독이 없다";
      if (action.item === "potion" && target.hp >= target.maxHp) return "체력이 가득하다";
      return null;
    }
  }
}

// ── 시작 ────────────────────────────────────────────────

export function mercUnit(merc: Merc): Unit {
  const stats = (merc.job && JOB_STATS[merc.job]) || DEFAULT_STATS;
  return {
    id: merc.id,
    side: "merc",
    name: merc.name,
    title: merc.title,
    hp: stats.hp,
    maxHp: stats.hp,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    onHit: stats.onHit,
    statuses: [],
    skill: (merc.job && JOB_SKILL[merc.job]) || DEFAULT_SKILL,
    cooldown: 0,
    guarding: false,
    passives: merc.passives ?? [],
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

/** 적 무리를 뽑는다. 같은 종류가 여럿이면 이름 뒤에 A, B…를 붙인다 */
export function rollEncounter(rng: Rng): Unit[] {
  const count = rollInt(rng.next, ENCOUNTER_SIZE[0], ENCOUNTER_SIZE[1]);
  const kinds = Array.from({ length: count }, () => pickEnemy(rng));
  return kinds.map((k, i) => {
    const same = kinds.filter((o) => o.id === k.id);
    const suffix = same.length > 1 ? ` ${String.fromCharCode(65 + kinds.slice(0, i).filter((o) => o.id === k.id).length)}` : "";
    return {
      id: `e${i}`,
      side: "enemy" as const,
      name: k.name + suffix,
      title: "",
      hp: k.hp,
      maxHp: k.hp,
      attack: k.attack,
      defense: k.defense,
      speed: k.speed,
      onHit: k.onHit,
      statuses: [],
      cooldown: 0,
      guarding: false,
    };
  });
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
  opts: { depth: number; supplies: Record<SupplyKind, number>; enemies?: Unit[] },
): Battle {
  const rng = createRng(seed);
  return begin([...mercs, ...(opts.enemies ?? rollEncounter(rng))], rng, opts.depth, opts.supplies);
}

function begin(units: Unit[], rng: Rng, depth: number, supplies: Record<SupplyKind, number>): Battle {
  const b: Battle = {
    round: 0,
    units,
    order: [],
    turn: -1,
    supplies: { ...supplies },
    depth,
    guideUsed: false,
    rng: 0,
    outcome: null,
    log: [],
  };
  // 싸울 용병이 없으면 바로 끝난다
  checkOutcome(b);
  // 포효: 전투 시작 시 적 전체 위축
  for (const merc of living(b, "merc").filter((u) => has(u, "war_cry"))) {
    b.log.push({ type: "passive", unit: merc.id, passive: "war_cry" });
    for (const enemy of living(b, "enemy")) applyStatus(b, enemy, "weaken");
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
  const enemiesBefore = living(b, "enemy").length;

  switch (action.type) {
    case "attack":
      attack(b, rng, actor, unitById(b, action.target)!);
      break;
    case "bandage":
      b.supplies.bandage--;
      cure(b, actor, "bleed", actor.id, "bandage");
      break;
    case "skill":
      castSkill(b, rng, actor, action.target ? unitById(b, action.target) : undefined);
      break;
    case "guide": {
      const target = unitById(b, action.target)!;
      b.supplies[action.item]--;
      b.guideUsed = true;
      if (action.item === "bandage") cure(b, target, "bleed", "guide", "bandage");
      if (action.item === "antidote") cure(b, target, "poison", "guide", "antidote");
      if (action.item === "potion") {
        // 손발이 맞는다: 길안내자가 건넨 물약 효과 +50%
        const amount = has(target, "in_sync") ? Math.round(POTION_HEAL * PASSIVE.inSyncMultiplier) : POTION_HEAL;
        heal(b, target, amount, "guide");
      }
      break;
    }
  }

  if (action.type !== "guide") {
    endTurn(actor);
    // 숨통 끊기: 적을 쓰러뜨리면 라운드당 한 번 즉시 다시 행동
    const killed = living(b, "enemy").length < enemiesBefore;
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
    checkOutcome(b);
  }
}

function has(u: Unit, passive: string): boolean {
  return u.passives?.includes(passive) ?? false;
}

function applyStatus(b: Battle, target: Unit, kind: StatusKind) {
  let turns = STATUS[kind].turns;
  // 임기응변: 출혈·중독 지속 1턴 감소
  if (HARMFUL.includes(kind) && has(target, "improvise")) turns = Math.max(1, turns - 1);
  const existing = target.statuses.find((s) => s.kind === kind);
  if (existing) existing.turns = turns; // 다시 걸리면 지속 시간만 새로 고친다
  else target.statuses.push({ kind, turns });
  b.log.push({ type: "status", target: target.id, kind });
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
};

/** 잃은 체력 비율 (0~1) */
function lostRatio(u: Unit): number {
  return (u.maxHp - u.hp) / u.maxHp;
}

/** 공격자 쪽 덧셈 보정 (종족 패시브, 각성, 위축) */
function attackBonus(b: Battle, actor: Unit, target: Unit, aoe: boolean): number {
  let bonus = 0;
  if (has(actor, "blood_thirst")) bonus += Math.round(PASSIVE.bloodThirstMax * lostRatio(actor));
  if (has(actor, "peerless_spirit")) bonus += living(b, "enemy").length;
  if (has(actor, "deep_blood")) bonus += b.depth - 1;
  if (has(actor, "solidarity") && living(b, "merc").length >= 4) bonus += PASSIVE.solidarityBonus;
  if (hasStatus(actor, "awaken")) bonus += PASSIVE.awakenBonus;
  if (hasStatus(actor, "weaken")) bonus -= PASSIVE.weakenAmount;
  if (has(actor, "chase_instinct") && target.hp <= target.maxHp * PASSIVE.chaseRatio) bonus += PASSIVE.chaseBonus;
  if (has(actor, "hunters_focus") && !aoe) {
    const focus = actor.fx!.focus;
    const stacks = focus?.target === target.id ? Math.min(PASSIVE.huntersFocusMax, focus.stacks + 1) : 0;
    actor.fx!.focus = { target: target.id, stacks };
    bonus += stacks;
  }
  if (has(actor, "wind_dance") && actor.fx!.dance) {
    actor.fx!.dance = false;
    bonus += PASSIVE.windDanceBonus;
  }
  return bonus;
}

/** 공격자 쪽 곱셈 보정 (선제 일격, 흥이 오른다) */
function attackMultiplier(b: Battle, actor: Unit): number {
  let m = 1;
  if (has(actor, "first_strike") && !actor.fx!.firstDone) {
    actor.fx!.firstDone = true;
    b.log.push({ type: "passive", unit: actor.id, passive: "first_strike" });
    m *= PASSIVE.firstStrikeMultiplier;
  }
  if (has(actor, "rising_cheer") && (actor.fx!.cheer ?? 0) >= PASSIVE.cheerMax) {
    actor.fx!.cheer = 0;
    b.log.push({ type: "passive", unit: actor.id, passive: "rising_cheer" });
    m *= PASSIVE.cheerMultiplier;
  }
  return m;
}

/** 맞는 쪽 감소 보정 (방어력, 바위의 뿌리, 고통 망각, 적응). 최소 1은 들어간다 */
function defense(actor: Unit, target: Unit, amount: number): number {
  let reduce = target.defense;
  if (has(target, "rock_root")) reduce += PASSIVE.rockRootReduce;
  if (has(target, "pain_oblivion")) reduce += Math.round(PASSIVE.painOblivionMax * lostRatio(target));
  if (has(target, "adapt")) {
    const seen = target.fx!.adapt?.[actor.id] ?? 0;
    reduce += Math.min(PASSIVE.adaptMax, seen);
    target.fx!.adapt = { ...target.fx!.adapt, [actor.id]: seen + 1 };
  }
  return reduce > 0 ? Math.max(1, amount - reduce) : amount;
}

function evadeChance(target: Unit): number {
  return (has(target, "feather_step") ? PASSIVE.featherEvade : 0) + (has(target, "beast_reflex") ? PASSIVE.reflexEvade : 0);
}

/**
 * 한 번의 타격. 회피 → 패시브 보정 → 치명타 → 균열 → 막아서기 → 감소 → 보호막 순서로 계산한다.
 */
function strike(b: Battle, rng: Rng, actor: Unit, target: Unit, base: number, opts: StrikeOptions = {}) {
  const { onHit = true, aoe = false, counter = false } = opts;

  // 회피 (깃털의 발걸음, 야수의 반사신경)
  const evade = evadeChance(target);
  if (evade > 0 && rng.next() < evade) {
    b.log.push({ type: "evade", actor: actor.id, target: target.id });
    if (has(target, "wind_dance")) target.fx!.dance = true;
    if (has(target, "beast_reflex") && !counter && actor.hp > 0 && target.hp > 0) {
      b.log.push({ type: "passive", unit: target.id, passive: "beast_reflex", target: actor.id });
      strike(b, rng, target, actor, rollInt(rng.next, target.attack[0], target.attack[1]), { counter: true });
    }
    return;
  }

  let amount = Math.max(1, base + attackBonus(b, actor, target, aoe));
  amount = Math.round(amount * attackMultiplier(b, actor));
  const crit = rng.next() < CRIT_CHANCE + (has(actor, "keen_eye") ? PASSIVE.keenEyeCrit : 0);
  if (crit) amount = Math.round(amount * CRIT_MULTIPLIER);
  if (hasStatus(target, "crack")) amount += PASSIVE.crackBonus;
  if (target.guarding) amount = Math.ceil(amount * GUARD_MULTIPLIER);
  amount = defense(actor, target, amount);

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
  if (target.hp <= 0) return;

  afterHit(b, target, amount);
  // 장인의 눈썰미: 20% 확률로 균열
  if (has(actor, "crafters_eye") && rng.next() < PASSIVE.crackChance) applyStatus(b, target, "crack");
  if (onHit && actor.onHit) {
    // 강철 심장: 출혈·중독에 걸릴 확률 절반
    const chance = actor.onHit.chance * (has(target, "steel_heart") ? PASSIVE.steelHeartFactor : 1);
    if (rng.next() < chance) applyStatus(b, target, actor.onHit.status);
  }
}

/** 맞고 살아남은 뒤: 흥이 오른다, 사선 돌파 */
function afterHit(b: Battle, target: Unit, amount: number) {
  if (amount > 0 && has(target, "rising_cheer")) {
    target.fx!.cheer = Math.min(PASSIVE.cheerMax, (target.fx!.cheer ?? 0) + 1);
  }
  if (has(target, "last_stand") && !target.fx!.lastStandDone && target.hp <= target.maxHp * PASSIVE.lastStandRatio) {
    target.fx!.lastStandDone = true;
    b.log.push({ type: "passive", unit: target.id, passive: "last_stand" });
    applyStatus(b, target, "awaken");
  }
}

function attack(b: Battle, rng: Rng, actor: Unit, target: Unit) {
  strike(b, rng, actor, target, rollInt(rng.next, actor.attack[0], actor.attack[1]));
}

function heal(b: Battle, target: Unit, amount: number, by: Actor) {
  const healed = Math.min(amount, target.maxHp - target.hp);
  target.hp += healed;
  b.log.push({ type: "heal", target: target.id, amount: healed, by });
}

function castSkill(b: Battle, rng: Rng, actor: Unit, target: Unit | undefined) {
  const skill = actor.skill!;
  actor.cooldown = SKILLS[skill].cooldown;
  b.log.push({ type: "skill", actor: actor.id, skill, ...(target ? { target: target.id } : {}) });
  const roll = () => rollInt(rng.next, actor.attack[0], actor.attack[1]);

  switch (skill) {
    case "guard":
      actor.guarding = true;
      break;
    case "pierce":
      strike(b, rng, actor, target!, roll() + PIERCE_BONUS, { onHit: false });
      if (target!.hp > 0) applyStatus(b, target!, "bleed");
      break;
    case "pray":
      heal(b, target!, PRAY_HEAL, actor.id);
      for (const s of target!.statuses.filter((x) => HARMFUL.includes(x.kind))) cure(b, target!, s.kind, actor.id, "skill");
      break;
    case "volley":
      for (const enemy of living(b, "enemy")) {
        if (b.outcome) break;
        strike(b, rng, actor, enemy, rollInt(rng.next, VOLLEY_DAMAGE[0], VOLLEY_DAMAGE[1]), { onHit: false, aoe: true });
      }
      break;
    case "cleave":
      strike(b, rng, actor, target!, Math.round(roll() * CLEAVE_MULTIPLIER));
      recoil(b, actor, CLEAVE_RECOIL);
      break;
    case "firelance":
      strike(b, rng, actor, target!, Math.round(roll() * FIRELANCE_MULTIPLIER), { onHit: false });
      recoil(b, actor, FIRELANCE_COST);
      break;
    case "ward":
      if (rng.next() < WARD_FAIL_CHANCE) {
        b.log.push({ type: "fizzle", actor: actor.id, skill });
        break;
      }
      // 보호막은 겹쳐 쌓지 않고 큰 쪽으로 채운다
      target!.shield = Math.max(target!.shield ?? 0, WARD_SHIELD);
      b.log.push({ type: "shield", target: target!.id, amount: WARD_SHIELD, by: actor.id });
      break;
    case "miasma":
      for (const enemy of living(b, "enemy")) applyStatus(b, enemy, "poison");
      break;
    case "power":
      strike(b, rng, actor, target!, Math.round(roll() * POWER_MULTIPLIER));
      break;
  }
}

/** 스킬 반동. 체력 1 아래로는 깎지 않는다 (스킬로 자멸하지 않게) */
function recoil(b: Battle, actor: Unit, amount: number) {
  const dealt = Math.min(amount, actor.hp - 1);
  if (dealt > 0 && !b.outcome) {
    actor.hp -= dealt;
    b.log.push({ type: "recoil", target: actor.id, damage: dealt });
  }
}

/** 턴 시작: 상태이상 피해 */
function tick(b: Battle, unit: Unit) {
  for (const s of [...unit.statuses]) {
    if (unit.hp <= 0) break;
    if (STATUS[s.kind].damage === 0) continue; // 강화·약화는 행동을 마칠 때 줄어든다
    const amount = STATUS[s.kind].damage;
    b.log.push({ type: "tick", target: unit.id, kind: s.kind, damage: amount });
    s.turns--;
    damage(b, unit, amount);
  }
  unit.statuses = unit.statuses.filter((s) => s.turns > 0);
}

/** 행동을 마칠 때: 강화·약화 지속 1턴 감소 */
function endTurn(unit: Unit) {
  for (const s of unit.statuses) if (STATUS[s.kind].damage === 0) s.turns--;
  unit.statuses = unit.statuses.filter((s) => s.turns > 0);
}

/** 속도 (바람 정령의 가호 포함) */
export function speedOf(u: Unit): number {
  return u.speed + (has(u, "wind_blessing") ? PASSIVE.windBlessingSpeed : 0);
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
  // 야생의 회복력: 라운드 시작마다 체력 회복
  for (const u of mercs) {
    if (has(u, "wild_recovery") && u.hp < u.maxHp) heal(b, u, PASSIVE.wildRecovery, u.id);
  }
}

/** 전사의 긍지: 위태로운 아군 대신 맞아 줄 바바리안이 있으면 그쪽으로 */
function protector(b: Battle, target: Unit): Unit {
  if (target.hp > target.maxHp * PASSIVE.prideAllyRatio) return target;
  const guard = living(b, "merc").find(
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
    if (unit.cooldown > 0) unit.cooldown--;

    tick(b, unit);
    if (b.outcome || unit.hp <= 0) continue;
    if (unit.side === "merc") return; // 플레이어 입력을 기다린다

    // 적: 막아선 용병이 있으면 그쪽을, 없으면 살아 있는 용병 중 무작위로 공격
    const guards = living(b, "merc").filter((u) => u.guarding);
    const targets = guards.length > 0 ? guards : living(b, "merc");
    if (targets.length === 0) {
      checkOutcome(b);
      continue;
    }
    attack(b, rng, unit, protector(b, targets[Math.floor(rng.next() * targets.length)]));
    endTurn(unit);
  }
  throw new Error("전투가 끝나지 않는다 (무한 루프 방지)");
}
