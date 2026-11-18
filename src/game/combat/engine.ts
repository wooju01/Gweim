// 턴제 전투 규칙. AI 없이 코드로만 돌아간다.
// 모든 결과는 이벤트(BattleEvent)로 남긴다. 지금은 텍스트로, 나중에는 같은 이벤트로 애니메이션을 재생한다.
//
// 흐름: 라운드마다 살아 있는 용병이 한 명씩 행동(공격, 붕대, 직업 스킬) → 적들이 자동으로 행동.
// 길안내자는 싸우지 않고, 라운드마다 한 번 물자(붕대·해독제·물약)를 용병에게 건넬 수 있다.
// 출혈·중독은 그 유닛의 턴이 시작될 때 피해를 준다.
import {
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  SPEED_JITTER,
  DEFAULT_SKILL,
  DEFAULT_STATS,
  GUARD_MULTIPLIER,
  JOB_SKILL,
  SKILLS,
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
import type { SkillEffect } from "../../data/skills";
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
  /** 적만: 정보에 보이는 특징 한 줄 */
  note?: string;
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
      note: k.note,
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
  opts: { depth: number; supplies: Record<SupplyKind, number>; walked?: number; enemies?: Unit[] },
): Battle {
  const rng = createRng(seed);
  return begin([...mercs, ...(opts.enemies ?? rollEncounter(rng))], rng, opts.depth, opts.supplies, opts.walked);
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
  /** 행동을 시작할 때 살아 있던 적 수 (무쌍의 투혼). 없으면 지금 수 */
  enemiesAtStart?: number;
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
  /** 공격자 쪽 덧셈 보정 (종족 패시브, 각성, 위축) */
  bonus: number;
  /** 공격자 쪽 곱셈 보정 (선제 일격, 흥이 오른다) */
  multiplier: number;
  critChance: number;
  /** 맞는 쪽이 피할 확률 */
  evadeChance: number;
  crack: boolean;
  guard: boolean;
  /** 맞는 쪽 감소 (방어력, 바위의 뿌리, 고통 망각, 적응) */
  reduce: number;
  /** 맞히면 소모·갱신되는 패시브 기록 */
  uses: {
    firstStrike: boolean;
    cheer: boolean;
    dance: boolean;
    focus: { target: string; stacks: number } | null;
    adapt: boolean;
  };
};

export function strikeFactors(b: Battle, actor: Unit, target: Unit, opts: StrikeOptions = {}): StrikeFactors {
  const fx = actor.fx ?? {};
  let bonus = 0;
  if (has(actor, "blood_thirst")) bonus += Math.round(PASSIVE.bloodThirstMax * lostRatio(actor));
  if (has(actor, "peerless_spirit")) bonus += opts.enemiesAtStart ?? living(b, "enemy").length;
  // 깊은 곳의 피: 층 구조가 생기기 전까지는 지나온 칸 2칸마다 +1 (최대 +3)
  if (has(actor, "deep_blood")) bonus += Math.min(PASSIVE.deepBloodMax, Math.floor(b.walked / PASSIVE.deepBloodStep));
  if (has(actor, "solidarity") && living(b, "merc").length >= 4) bonus += PASSIVE.solidarityBonus;
  if (hasStatus(actor, "awaken")) bonus += PASSIVE.awakenBonus;
  if (hasStatus(actor, "weaken")) bonus -= PASSIVE.weakenAmount;
  if (has(actor, "chase_instinct") && target.hp <= target.maxHp * PASSIVE.chaseRatio) bonus += PASSIVE.chaseBonus;
  let focus: StrikeFactors["uses"]["focus"] = null;
  if (has(actor, "hunters_focus") && !opts.aoe) {
    const stacks = fx.focus?.target === target.id ? Math.min(PASSIVE.huntersFocusMax, fx.focus.stacks + 1) : 0;
    focus = { target: target.id, stacks };
    bonus += stacks;
  }
  const dance = has(actor, "wind_dance") && !!fx.dance;
  if (dance) bonus += PASSIVE.windDanceBonus;

  let multiplier = 1;
  const firstStrike = has(actor, "first_strike") && !fx.firstDone;
  if (firstStrike) multiplier *= PASSIVE.firstStrikeMultiplier;
  const cheer = has(actor, "rising_cheer") && (fx.cheer ?? 0) >= PASSIVE.cheerMax;
  if (cheer) multiplier *= PASSIVE.cheerMultiplier;

  let reduce = target.defense;
  if (has(target, "rock_root")) reduce += PASSIVE.rockRootReduce;
  if (has(target, "pain_oblivion")) reduce += Math.round(PASSIVE.painOblivionMax * lostRatio(target));
  if (has(target, "adapt")) reduce += Math.min(PASSIVE.adaptMax, target.fx?.adapt?.[actor.id] ?? 0);

  return {
    bonus,
    multiplier,
    critChance: CRIT_CHANCE + (has(actor, "keen_eye") ? PASSIVE.keenEyeCrit : 0),
    evadeChance: evadeChance(target),
    crack: hasStatus(target, "crack"),
    guard: target.guarding,
    reduce,
    uses: { firstStrike, cheer, dance, focus, adapt: has(target, "adapt") },
  };
}

/** 보정값을 적용한 최종 피해 (보호막 전). base는 굴린 기본 피해 */
export function strikeAmount(base: number, f: StrikeFactors, crit: boolean): number {
  let amount = Math.max(1, base + f.bonus);
  amount = Math.round(amount * f.multiplier);
  if (crit) amount = Math.round(amount * CRIT_MULTIPLIER);
  if (f.crack) amount += PASSIVE.crackBonus;
  if (f.guard) amount = Math.ceil(amount * GUARD_MULTIPLIER);
  return f.reduce > 0 ? Math.max(1, amount - f.reduce) : amount;
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
  return (
    (has(target, "feather_step") ? PASSIVE.featherEvade : 0) +
    (has(target, "beast_reflex") ? PASSIVE.reflexEvade : 0) +
    (has(target, "wind_dance") ? PASSIVE.windDanceEvade : 0)
  );
}

/** 공격자의 상태이상 부여 확률 (강철 심장이면 절반) */
function onHitChance(actor: Unit, target: Unit): number {
  if (!actor.onHit) return 0;
  return actor.onHit.chance * (has(target, "steel_heart") ? PASSIVE.steelHeartFactor : 1);
}

/** 한 번의 타격. 회피 → 보정 → 치명타 → 보호막 → 피해 → 맞은 뒤 효과 */
function strike(b: Battle, rng: Rng, actor: Unit, target: Unit, base: number, opts: StrikeOptions = {}) {
  const { onHit = true, counter = false } = opts;
  const f = strikeFactors(b, actor, target, opts);

  // 회피 (깃털의 발걸음, 야수의 반사신경, 바람의 춤)
  if (f.evadeChance > 0 && rng.next() < f.evadeChance) {
    b.log.push({ type: "evade", actor: actor.id, target: target.id });
    if (has(target, "wind_dance")) {
      target.fx ??= {};
      target.fx.dance = true;
    }
    if (has(target, "beast_reflex") && !counter && actor.hp > 0 && target.hp > 0) {
      b.log.push({ type: "passive", unit: target.id, passive: "beast_reflex", target: actor.id });
      strike(b, rng, target, actor, rollInt(rng.next, target.attack[0], target.attack[1]), { counter: true });
    }
    return;
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
  if (target.hp <= 0) return;

  afterHit(b, target, amount);
  // 장인의 눈썰미: 20% 확률로 균열
  if (has(actor, "crafters_eye") && rng.next() < PASSIVE.crackChance) applyStatus(b, target, "crack");
  if (onHit && actor.onHit && rng.next() < onHitChance(actor, target)) applyStatus(b, target, actor.onHit.status);
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

type DamageEffect = Extract<SkillEffect, { kind: "damage" }>;

/** 기본 공격은 배율 1, 추가 0인 피해 조각과 같다 */
const BASIC_ATTACK: DamageEffect = { kind: "damage" };

/** 피해 조각의 기본 피해 범위 [최소, 최대] (보정 전) */
export function baseRange(actor: Unit, e: DamageEffect): [number, number] {
  if (e.fixed) return [e.fixed[0], e.fixed[1]];
  const m = e.multiplier ?? 1;
  const bonus = e.bonus ?? 0;
  return [Math.round(actor.attack[0] * m) + bonus, Math.round(actor.attack[1] * m) + bonus];
}

/** 피해 조각의 기본 피해를 굴린다 */
function rollBase(rng: Rng, actor: Unit, e: DamageEffect): number {
  if (e.fixed) return rollInt(rng.next, e.fixed[0], e.fixed[1]);
  return Math.round(rollInt(rng.next, actor.attack[0], actor.attack[1]) * (e.multiplier ?? 1)) + (e.bonus ?? 0);
}

function attack(b: Battle, rng: Rng, actor: Unit, target: Unit) {
  strike(b, rng, actor, target, rollBase(rng, actor, BASIC_ATTACK), { enemiesAtStart: living(b, "enemy").length });
}

function heal(b: Battle, target: Unit, amount: number, by: Actor) {
  const healed = Math.min(amount, target.maxHp - target.hp);
  target.hp += healed;
  b.log.push({ type: "heal", target: target.id, amount: healed, by });
}

/** 스킬의 효과 조각을 차례로 처리한다. 스킬마다 코드를 따로 짜지 않는다 */
function castSkill(b: Battle, rng: Rng, actor: Unit, target: Unit | undefined) {
  const skill = SKILLS[actor.skill!];
  actor.cooldown = skill.cooldown;
  b.log.push({ type: "skill", actor: actor.id, skill: skill.id, ...(target ? { target: target.id } : {}) });
  const enemiesAtStart = living(b, "enemy").length;

  for (const e of skill.effects) {
    switch (e.kind) {
      case "fail":
        if (rng.next() < e.chance) {
          b.log.push({ type: "fizzle", actor: actor.id, skill: skill.id });
          return;
        }
        break;
      case "damage":
        if (e.area === "all") {
          for (const enemy of living(b, "enemy")) {
            if (b.outcome) break;
            strike(b, rng, actor, enemy, rollBase(rng, actor, e), { onHit: e.onHit ?? true, aoe: true, enemiesAtStart });
          }
        } else if (target && target.hp > 0) {
          strike(b, rng, actor, target, rollBase(rng, actor, e), { onHit: e.onHit ?? true, enemiesAtStart });
        }
        break;
      case "applyStatus":
        for (const t of e.area === "all" ? living(b, "enemy") : target && target.hp > 0 ? [target] : []) applyStatus(b, t, e.status);
        break;
      case "heal":
        if (target) heal(b, target, e.amount, actor.id);
        break;
      case "cure":
        if (target) for (const s of target.statuses.filter((x) => HARMFUL.includes(x.kind))) cure(b, target, s.kind, actor.id, "skill");
        break;
      case "shield":
        if (target) {
          target.shield = Math.max(target.shield ?? 0, e.amount);
          b.log.push({ type: "shield", target: target.id, amount: e.amount, by: actor.id });
        }
        break;
      case "taunt":
        actor.guarding = true;
        break;
      case "selfCost":
        recoil(b, actor, e.hp);
        break;
    }
  }
}

// ── 미리보기 ────────────────────────────────────────────

export type TargetPreview = {
  target: string;
  /** 치명타가 아닐 때 피해 범위 */
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
  /** 반드시 걸리는 상태이상 (급소 찌르기, 독안개 등) */
  applies: { target: string; kind: StatusKind }[];
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
 * 여러 적을 치는 스킬은 앞의 타격이 소모하는 패시브(선제 일격 등)를 반영해 차례로 계산한다.
 */
export function previewAction(battle: Battle, action: BattleAction): ActionPreview | null {
  if (action.type !== "attack" && action.type !== "skill") return null;
  if (validate(battle, action)) return null;
  const b = structuredClone(battle);
  const actor = currentActor(b)!;
  const target = action.target ? unitById(b, action.target) : undefined;
  const effects = action.type === "attack" ? [BASIC_ATTACK] : SKILLS[actor.skill!].effects;
  const enemiesAtStart = living(b, "enemy").length;
  const out: ActionPreview = { damage: [], applies: [], heal: null, shield: null, cures: null, taunt: false, selfCost: 0, failChance: 0 };

  for (const e of effects) {
    switch (e.kind) {
      case "fail":
        out.failChance = e.chance;
        break;
      case "damage": {
        const targets = e.area === "all" ? living(b, "enemy") : target ? [target] : [];
        for (const t of targets) {
          const f = strikeFactors(b, actor, t, { aoe: e.area === "all", enemiesAtStart });
          const [lo, hi] = baseRange(actor, e);
          const p: TargetPreview = {
            target: t.id,
            min: strikeAmount(lo, f, false),
            max: strikeAmount(hi, f, false),
            critMin: strikeAmount(lo, f, true),
            critMax: strikeAmount(hi, f, true),
            critChance: f.critChance,
            hitChance: 1 - f.evadeChance,
            kill: "no",
            statuses: [],
          };
          const toughness = t.hp + (t.shield ?? 0);
          p.kill = p.min >= toughness && p.hitChance >= 1 ? "sure" : p.critMax >= toughness ? "maybe" : "no";
          if ((e.onHit ?? true) && actor.onHit) p.statuses.push({ kind: actor.onHit.status, chance: onHitChance(actor, t) });
          if (has(actor, "crafters_eye")) p.statuses.push({ kind: "crack", chance: PASSIVE.crackChance });
          out.damage.push(p);
          consume(b, actor, t, f, false);
        }
        break;
      }
      case "applyStatus":
        for (const t of e.area === "all" ? living(b, "enemy") : target ? [target] : []) out.applies.push({ target: t.id, kind: e.status });
        break;
      case "heal":
        if (target) out.heal = { target: target.id, amount: Math.min(e.amount, target.maxHp - target.hp) };
        break;
      case "cure":
        if (target) out.cures = { target: target.id, kinds: target.statuses.filter((s) => HARMFUL.includes(s.kind)).map((s) => s.kind) };
        break;
      case "shield":
        if (target) out.shield = { target: target.id, amount: e.amount };
        break;
      case "taunt":
        out.taunt = true;
        break;
      case "selfCost":
        out.selfCost = Math.max(0, Math.min(e.hp, actor.hp - 1));
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
      return `공격 +${living(b, "enemy").length}`;
    case "deep_blood": {
      const n = Math.min(PASSIVE.deepBloodMax, Math.floor(b.walked / PASSIVE.deepBloodStep));
      return n > 0 ? `공격 +${n}` : null;
    }
    case "solidarity":
      return living(b, "merc").length >= 4 ? "공격 +1" : null;
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

/** 화면 표시용 능력치 (속도는 보여 주지 않는다) */
export function unitStats(u: Unit) {
  return {
    attack: u.attack,
    defense: u.defense,
    critChance: CRIT_CHANCE + (has(u, "keen_eye") ? PASSIVE.keenEyeCrit : 0),
    evadeChance: evadeChance(u),
  };
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
