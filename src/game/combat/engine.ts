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
  DEFAULT_SKILL,
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
  onHit?: OnHit;
  statuses: Status[];
  /** 용병만: 직업 스킬 */
  skill?: SkillId;
  /** 스킬을 다시 쓸 수 있을 때까지 남은 자기 턴 수 (0이면 사용 가능) */
  cooldown: number;
  /** 막아서기 중 (자기 다음 차례가 오면 풀린다) */
  guarding: boolean;
};

export type Outcome = "victory" | "defeat";

/** "guide"는 길안내자 */
export type Actor = string | "guide";

export type BattleEvent =
  | { type: "round"; round: number }
  | { type: "attack"; actor: string; target: string; damage: number; crit: boolean }
  | { type: "status"; target: string; kind: StatusKind }
  | { type: "tick"; target: string; kind: StatusKind; damage: number }
  /** via: 무엇으로 치료했나 */
  | { type: "cure"; target: string; kind: StatusKind; by: Actor; via: "bandage" | "antidote" | "skill" }
  | { type: "heal"; target: string; amount: number; by: Actor }
  | { type: "skill"; actor: string; skill: SkillId; target?: string }
  | { type: "recoil"; target: string; damage: number }
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

function mercUnit(merc: Merc): Unit {
  const stats = (merc.job && JOB_STATS[merc.job]) || DEFAULT_STATS;
  return {
    id: merc.id,
    side: "merc",
    name: merc.name,
    title: merc.title,
    hp: stats.hp,
    maxHp: stats.hp,
    attack: stats.attack,
    onHit: stats.onHit,
    statuses: [],
    skill: (merc.job && JOB_SKILL[merc.job]) || DEFAULT_SKILL,
    cooldown: 0,
    guarding: false,
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
      onHit: k.onHit,
      statuses: [],
      cooldown: 0,
      guarding: false,
    };
  });
}

/** 전투를 시작한다. 첫 용병의 차례까지 진행된 상태로 돌려준다 */
export function startBattle(mercs: Merc[], seed: number, enemies?: Unit[]): Battle {
  const rng = createRng(seed);
  const b: Battle = {
    round: 0,
    units: [...mercs.map(mercUnit), ...(enemies ?? rollEncounter(rng))],
    order: [],
    turn: -1,
    supplies: { ...START_SUPPLIES },
    guideUsed: false,
    rng: 0,
    outcome: null,
    log: [],
  };
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

  switch (action.type) {
    case "attack":
      attack(b, rng, actor, unitById(b, action.target)!);
      advance(b, rng);
      break;
    case "bandage":
      b.supplies.bandage--;
      cure(b, actor, "bleed", actor.id, "bandage");
      advance(b, rng);
      break;
    case "skill":
      castSkill(b, rng, actor, action.target ? unitById(b, action.target) : undefined);
      advance(b, rng);
      break;
    case "guide": {
      const target = unitById(b, action.target)!;
      b.supplies[action.item]--;
      b.guideUsed = true;
      if (action.item === "bandage") cure(b, target, "bleed", "guide", "bandage");
      if (action.item === "antidote") cure(b, target, "poison", "guide", "antidote");
      if (action.item === "potion") {
        heal(b, target, POTION_HEAL, "guide");
      }
      break;
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

function applyStatus(b: Battle, target: Unit, kind: StatusKind) {
  const turns = STATUS[kind].turns;
  const existing = target.statuses.find((s) => s.kind === kind);
  if (existing) existing.turns = turns; // 다시 걸리면 지속 시간만 새로 고친다
  else target.statuses.push({ kind, turns });
  b.log.push({ type: "status", target: target.id, kind });
}

function cure(b: Battle, target: Unit, kind: StatusKind, by: Actor, via: "bandage" | "antidote" | "skill") {
  target.statuses = target.statuses.filter((s) => s.kind !== kind);
  b.log.push({ type: "cure", target: target.id, kind, by, via });
}

/**
 * 한 번의 타격. base에 치명타와 막아서기를 적용한다.
 * onHit이 true면 공격자의 상태이상 부여 확률도 굴린다.
 */
function strike(b: Battle, rng: Rng, actor: Unit, target: Unit, base: number, onHit = true) {
  const crit = rng.next() < CRIT_CHANCE;
  let amount = crit ? Math.round(base * CRIT_MULTIPLIER) : base;
  if (target.guarding) amount = Math.ceil(amount * GUARD_MULTIPLIER);
  b.log.push({ type: "attack", actor: actor.id, target: target.id, damage: amount, crit });
  damage(b, target, amount);
  if (onHit && target.hp > 0 && actor.onHit && rng.next() < actor.onHit.chance) {
    applyStatus(b, target, actor.onHit.status);
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
      strike(b, rng, actor, target!, roll() + PIERCE_BONUS, false);
      if (target!.hp > 0) applyStatus(b, target!, "bleed");
      break;
    case "pray":
      heal(b, target!, PRAY_HEAL, actor.id);
      for (const s of [...target!.statuses]) cure(b, target!, s.kind, actor.id, "skill");
      break;
    case "volley":
      for (const enemy of living(b, "enemy")) {
        if (b.outcome) break;
        strike(b, rng, actor, enemy, rollInt(rng.next, VOLLEY_DAMAGE[0], VOLLEY_DAMAGE[1]), false);
      }
      break;
    case "cleave": {
      strike(b, rng, actor, target!, Math.round(roll() * CLEAVE_MULTIPLIER));
      // 반동은 체력 1 아래로는 깎지 않는다 (스킬로 자멸하지 않게)
      const recoil = Math.min(CLEAVE_RECOIL, actor.hp - 1);
      if (recoil > 0 && !b.outcome) {
        actor.hp -= recoil;
        b.log.push({ type: "recoil", target: actor.id, damage: recoil });
      }
      break;
    }
    case "miasma":
      for (const enemy of living(b, "enemy")) applyStatus(b, enemy, "poison");
      break;
    case "power":
      strike(b, rng, actor, target!, Math.round(roll() * POWER_MULTIPLIER));
      break;
  }
}

/** 턴 시작: 상태이상 피해 */
function tick(b: Battle, unit: Unit) {
  for (const s of [...unit.statuses]) {
    if (unit.hp <= 0) break;
    const amount = STATUS[s.kind].damage;
    b.log.push({ type: "tick", target: unit.id, kind: s.kind, damage: amount });
    s.turns--;
    damage(b, unit, amount);
  }
  unit.statuses = unit.statuses.filter((s) => s.turns > 0);
}

function newRound(b: Battle) {
  b.round++;
  b.order = [...living(b, "merc"), ...living(b, "enemy")].map((u) => u.id);
  b.turn = -1;
  b.guideUsed = false;
  b.log.push({ type: "round", round: b.round });
}

/** 다음 용병 차례가 오거나 전투가 끝날 때까지 진행한다 */
function advance(b: Battle, rng: Rng) {
  for (let guard = 0; guard < 10_000; guard++) {
    if (b.outcome) return;
    b.turn++;
    if (b.turn >= b.order.length) {
      newRound(b);
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
    attack(b, rng, unit, targets[Math.floor(rng.next() * targets.length)]);
  }
  throw new Error("전투가 끝나지 않는다 (무한 루프 방지)");
}
