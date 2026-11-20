// 스킬 규칙 (순수 함수): 조각 { main, subs }을 검증하고, 효과를 합쳐 엔진이 쓰는 SkillDef로 만든다.
// 조각 데이터와 수치는 data/fragments.ts에 있다.
//
// 엔진·화면은 스킬을 문자열 id(skillKey: "메인+부+부")로 가리킨다. id만 있으면 언제든 다시 만들 수 있고,
// 부 조각 레벨이 들어간 실제 효과는 전투 유닛이 따로 들고 있다 (combat/engine.ts의 Unit.book).
import { STATUS } from "@/data/combat";
import {
  FRAGMENTS,
  JOB_BASIC,
  NEUTRAL_MAIN,
  START_SKILLS,
  START_SUB_CHANCE,
  SUB_CAPS,
  getFragment,
  scaled,
  type AddTo,
  type Fragment,
  type MainFragment,
  type SubFragment,
  type When,
} from "@/data/fragments";
import { getBranch } from "@/data/jobs";
import { MONSTER_SKILLS } from "@/data/monsters";
import { RANKS } from "@/data/ranks";
import { SKILL_SLOTS, describeSkill, statusText, type DamageEffect, type Skill, type SkillDef, type SkillEffect, type StatusRoll } from "@/data/skills";
import type { Element, MercLevel, SkillBuild } from "@/lib/schemas";

/** 용병이 아는 부 조각 레벨 (없으면 1) */
export type SubLevels = Record<string, number>;

/** 스킬 규칙에 필요한 용병 정보 */
export type SkillOwner = {
  job?: string;
  race?: string;
  level: MercLevel;
  branch?: string;
  elements?: Element[];
};

// ── id ─────────────────────────────────────────────────

const ORDER = new Map(FRAGMENTS.map((f, i) => [f.id, i]));

/** 같은 조합이면 같은 모양이 되도록 부 조각을 조각 목록 순서로 정렬한다 */
export function normalize(build: SkillBuild): SkillBuild {
  return { main: build.main, subs: [...build.subs].sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0)) };
}

/** 스킬 id: "메인+부+부" (부 조각은 정렬) */
export function skillKey(build: SkillBuild): string {
  const n = normalize(build);
  return [n.main, ...n.subs].join("+");
}

export function parseKey(key: string): SkillBuild | null {
  const [main, ...subs] = key.split("+");
  return main ? { main, subs } : null;
}

export function sameBuild(a: SkillBuild, b: SkillBuild): boolean {
  return skillKey(a) === skillKey(b);
}

// ── 쓸 수 있는 조각 ────────────────────────────────────

/** 이 용병이 이 조각을 쓸 수 있나: 자기 직업의 조각, 자기 종족의 조각만 (기본 조각은 직업이 없을 때만) */
export function canUseFragment(owner: { job?: string; race?: string }, f: Fragment): boolean {
  if (f === NEUTRAL_MAIN) return !owner.job;
  if (f.job && f.job !== owner.job) return false;
  if (f.race && f.race !== owner.race) return false;
  return true;
}

/** 용병이 쓸 수 있는 조각 (궁극기·기본 조각 제외, 조각 목록 순서) */
export function fragmentsFor(owner: { job?: string; race?: string }): Fragment[] {
  return FRAGMENTS.filter((f) => f !== NEUTRAL_MAIN && !(f.kind === "main" && f.ultimate) && canUseFragment(owner, f));
}

/** 스킬이 하나도 없는 용병의 기본 스킬 */
export function basicBuild(job: string | undefined): SkillBuild {
  return { main: (job && JOB_BASIC[job]) || NEUTRAL_MAIN.id, subs: [] };
}

// ── 검증 ───────────────────────────────────────────────

/** 한 스킬에 같이 낄 수 있는 원소인가. 기본은 하나까지 */
export function elementsAllowed(owner: SkillOwner, elements: Element[]): boolean {
  if (elements.length <= 1) return true;
  if (elements.length > 2 || elements[0] === elements[1]) return false;
  const pair = new Set(elements);
  // 드워프 마법사: 처음부터 불+흙
  if (owner.race === "dwarf" && owner.job === "mage" && pair.has("fire") && pair.has("earth")) return true;
  // 원소술사: 전직 때 고른 원소 둘
  if (getBranch(owner.job ?? "", owner.branch)?.dualElement && owner.elements && elements.every((e) => owner.elements!.includes(e))) return true;
  return false;
}

/** 스킬 하나를 이 용병이 쓸 수 있는 이유가 없으면 null, 있으면 그 이유 */
export function validateSkill(owner: SkillOwner, build: SkillBuild): string | null {
  const main = getFragment(build.main);
  if (!main || main.kind !== "main") return "메인 조각이 없다";
  if (main.ultimate) return "궁극기는 스킬로 조립할 수 없다";
  if (!canUseFragment(owner, main)) return "쓸 수 없는 메인 조각";
  if (new Set(build.subs).size !== build.subs.length) return "같은 부 조각을 두 번 낄 수 없다";
  const limit = RANKS[owner.level].subLimit;
  if (build.subs.length > limit) return `부 조각은 ${limit}개까지`;
  const subs = build.subs.map(getFragment);
  if (subs.some((s) => !s || s.kind !== "sub")) return "부 조각이 없다";
  if (subs.some((s) => !canUseFragment(owner, s!))) return "쓸 수 없는 부 조각";
  const elements = subs.flatMap((s) => ((s as SubFragment).element ? [(s as SubFragment).element!] : []));
  if (!elementsAllowed(owner, elements)) return "원소 조각은 한 스킬에 하나까지";
  return null;
}

/** 궁극기가 이 용병 것이고, 궁극기 칸이 열린 등급인가 */
export function validateUltimate(owner: SkillOwner, id: string): string | null {
  const f = getFragment(id);
  if (!f || f.kind !== "main" || !f.ultimate) return "궁극기가 아니다";
  if (f.job !== owner.job) return "다른 직업의 궁극기";
  if (!RANKS[owner.level].ultimate) return "아직 궁극기 칸이 없다";
  return null;
}

/** 장착 스킬 목록: 칸 수 이하, 겹치지 않고, 모두 쓸 수 있다 */
export function validateLoadout(owner: SkillOwner, builds: SkillBuild[]): string | null {
  if (builds.length > SKILL_SLOTS) return `스킬은 ${SKILL_SLOTS}개까지`;
  if (new Set(builds.map(skillKey)).size !== builds.length) return "같은 스킬을 두 번 낄 수 없다";
  for (const b of builds) {
    const why = validateSkill(owner, b);
    if (why) return why;
  }
  return null;
}

// ── 합치기 ─────────────────────────────────────────────

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function scaleDamage(e: DamageEffect, k: number): DamageEffect {
  return e.scaling
    ? { ...e, scaling: e.scaling.map((s) => ({ ...s, mult: round3(s.mult * k) })) }
    : { ...e, multiplier: round3((e.multiplier ?? 1) * k) };
}

/** 상태이상 수치 (없으면 기본값) */
function statusValue(roll: StatusRoll): number | undefined {
  return roll.value ?? STATUS[roll.status].value;
}

/**
 * 조각을 합쳐 스킬을 만든다. 부 조각 효과는 종류별로 합산한 뒤 상한(SUB_CAPS)으로 자른다.
 * levels: 부 조각 레벨 (없으면 Lv1). 잘못된 조각이면 undefined
 */
export function resolveSkill(build: SkillBuild, levels: SubLevels = {}): Skill | undefined {
  const main = getFragment(build.main);
  if (!main || main.kind !== "main") return undefined;
  const subs = build.subs.map(getFragment);
  if (subs.some((s) => !s || s.kind !== "sub")) return undefined;
  return combine(main, subs as SubFragment[], levels, skillKey(build));
}

function combine(main: MainFragment, subs: SubFragment[], levels: SubLevels, id: string): Skill {
  let effects: SkillEffect[] = structuredClone(main.effects);
  let target = main.target;
  const lvOf = (f: Fragment) => levels[f.id] ?? 1;
  const mods = subs.flatMap((s) => s.mods.map((m) => ({ m, sub: s })));

  // 정령 공명: 원소 조각이 있으면 그 수치 보너스, 없으면 위력 보너스
  const hasElement = subs.some((s) => s.element);
  let elementBoost = 0;
  let resonance = 0;
  for (const { m, sub } of mods) {
    if (m.kind !== "resonance") continue;
    if (hasElement) elementBoost += scaled(m.boost, lvOf(sub));
    else resonance += scaled(m.power, lvOf(sub));
  }
  /** 부 조각 수치 (레벨, 원소 보너스 반영) */
  const val = (v: Parameters<typeof scaled>[0], sub: SubFragment) => round3(scaled(v, lvOf(sub)) * (sub.element ? 1 + elementBoost : 1));

  // ── 모양을 바꾸는 조각 먼저 (좁히기 → 전체로 → 타격 수) ──
  if (mods.some(({ m }) => m.kind === "narrow")) {
    const wasAllies = effects.some((e) => "who" in e && e.who === "allies");
    const wasFoes = effects.some((e) => "area" in e && e.area === "all");
    effects = effects.map((e) => {
      if ((e.kind === "applyStatus" || e.kind === "heal" || e.kind === "shield") && e.who === "allies") return { ...e, who: undefined };
      if ((e.kind === "damage" || e.kind === "applyStatus") && e.area === "all") return { ...e, area: "one" };
      return e;
    });
    if (target === "none") target = wasAllies ? "ally" : wasFoes ? "enemy" : target;
  }
  for (const { m } of mods) {
    if (m.kind === "area" && target === "enemy" && effects.some((e) => e.kind === "damage")) {
      effects = effects.map((e) =>
        e.kind === "damage" && (!e.area || e.area === "one") ? { ...scaleDamage(e, m.mult), area: "all" } : e.kind === "applyStatus" && !e.who ? { ...e, area: "all" } : e,
      );
      target = "none";
    }
    if (m.kind === "hits") {
      effects = effects.map((e) => (e.kind === "damage" && !e.fixed ? { ...scaleDamage(e, m.mult), hits: (e.hits ?? 1) + m.add } : e));
    }
  }

  // 이 스킬의 모양
  const isAttack = effects.some((e) => e.kind === "damage");
  const allFoes = effects.some((e) => e.kind === "damage" && (e.area === "all" || e.area === "random"));
  const toAlly = target === "ally";
  const toAllies = effects.some((e) => (e.kind === "applyStatus" || e.kind === "heal" || e.kind === "shield") && e.who === "allies");
  const fits = (when: When | undefined) => !when || (when === "attack" ? isAttack : toAlly || toAllies);
  /** 덧붙는 효과의 대상 → 효과의 who/area. 붙일 수 없으면 null */
  const place = (to: AddTo): { who?: "self" | "allies"; area?: "all" } | null => {
    switch (to) {
      case "self":
        return { who: "self" };
      case "auto":
        return toAlly ? {} : toAllies ? { who: "allies" } : { who: "self" };
      case "foe":
        return !isAttack ? null : allFoes ? { area: "all" } : {};
      case "allFoes":
        return { area: "all" };
    }
  };

  // ── 수치 합산 (상한은 양수 쪽만) ──
  const sum = { powerUp: resonance, powerDown: 0, crit: 0, flat: 0, pierce: 0, lifesteal: 0, cooldown: 0, duration: 0, effect: 0, heal: 0 };
  const added: SkillEffect[] = [];
  let shieldFromHeal = 0;
  for (const { m, sub } of mods) {
    switch (m.kind) {
      case "power": {
        const v = val(m.pct, sub);
        if (v >= 0) sum.powerUp += v;
        else sum.powerDown += v;
        break;
      }
      case "crit":
        sum.crit += val(m.pct, sub);
        break;
      case "flat":
        sum.flat += val(m.amount, sub);
        break;
      case "pierce":
        sum.pierce += val(m.pct, sub);
        break;
      case "lifesteal":
        sum.lifesteal += val(m.pct, sub);
        break;
      case "cooldown":
        sum.cooldown += m.turns;
        break;
      case "duration":
        sum.duration += m.turns;
        break;
      case "effect":
        sum.effect += m.pct;
        break;
      case "heal":
        sum.heal += val(m.pct, sub);
        break;
      case "selfCost":
        added.push({ kind: "selfCost", pctMaxHp: m.pctMaxHp });
        break;
      case "stunChance": {
        if (!fits(m.when)) break;
        const p = val(m.pct, sub);
        const stun = effects.find((e): e is Extract<SkillEffect, { kind: "applyStatus" }> => e.kind === "applyStatus" && e.status === "stun" && e.who !== "self");
        if (stun) stun.chance = Math.min(1, round3((stun.chance ?? 1) + p));
        else {
          const at = place("foe");
          if (at) added.push({ kind: "applyStatus", status: "stun", chance: Math.min(1, p), ...at });
        }
        break;
      }
      case "shieldFromHeal":
        shieldFromHeal += m.pct;
        break;
      case "status": {
        const at = fits(m.when) ? place(m.to) : null;
        if (at) added.push({ kind: "applyStatus", ...m.roll, ...(m.lv ? { value: val(m.lv, sub) } : m.roll.value !== undefined ? { value: val(m.roll.value, sub) } : {}), ...at });
        break;
      }
      case "addHeal": {
        const at = fits(m.when) ? place(m.to) : null;
        if (at) added.push({ kind: "heal", amount: Math.round(val(m.amount, sub)), ...(at.who ? { who: at.who } : {}) });
        break;
      }
      case "addShield": {
        const at = fits(m.when) ? place(m.to) : null;
        if (at) added.push({ kind: "shield", amount: m.amount, ...(at.who ? { who: at.who } : {}) });
        break;
      }
      case "support":
        added.push({ kind: "support", shield: m.shield });
        break;
      case "later": {
        const v = m.lv ? scaled(m.lv, lvOf(sub)) : undefined;
        const shown = v === undefined ? "" : m.pct ? `${Math.round(v * 100)}%` : String(v);
        added.push({ kind: "later", text: m.text.replace("{v}", shown) });
        break;
      }
      case "resonance":
      case "narrow":
      case "area":
      case "hits":
        break;
    }
  }
  const power = Math.min(sum.powerUp, SUB_CAPS.power) + sum.powerDown;
  const crit = Math.min(sum.crit, SUB_CAPS.crit);
  const flat = Math.min(sum.flat, SUB_CAPS.flat);
  const pierce = Math.min(sum.pierce, SUB_CAPS.pierce);

  effects = [...effects, ...added].map((e): SkillEffect => {
    switch (e.kind) {
      case "damage": {
        let d = power ? scaleDamage(e, 1 + power) : { ...e };
        if (flat && !d.fixed) d = { ...d, bonus: (d.bonus ?? 0) + Math.round(flat) };
        if (crit) d = { ...d, critBonus: round3((d.critBonus ?? 0) + crit) };
        if (pierce) d = { ...d, pierce: Math.min(1, round3((d.pierce ?? 0) + pierce)) };
        if (sum.lifesteal) d = { ...d, lifesteal: round3((d.lifesteal ?? 0) + sum.lifesteal) };
        return d;
      }
      case "applyStatus": {
        const info = STATUS[e.status];
        const out = { ...e };
        if (sum.duration && e.status !== "stun") out.turns = (e.turns ?? info.turns) + sum.duration;
        const v = statusValue(e);
        if (sum.effect && v !== undefined) out.value = info.pct ? round3(v * (1 + sum.effect)) : Math.max(1, Math.round(v * (1 + sum.effect)));
        return out;
      }
      case "heal":
        return { ...e, amount: Math.max(1, Math.round(e.amount * (1 + sum.heal) * (1 + sum.effect))) };
      case "shield":
        return { ...e, amount: Math.max(1, Math.round(e.amount * (1 + sum.effect))) };
      default:
        return e;
    }
  });
  if (shieldFromHeal) {
    effects = effects.flatMap((e): SkillEffect[] =>
      e.kind === "heal" ? [e, { kind: "shield", amount: Math.max(1, Math.round(e.amount * shieldFromHeal)), ...(e.who ? { who: e.who } : {}) }] : [e],
    );
  }

  const def: SkillDef = {
    id,
    name: subs.length ? `${main.name} (${subs.map((s) => s.name).join("·")})` : main.name,
    cooldown: main.ultimate ? 0 : Math.max(0, main.wait + sum.cooldown),
    target,
    effects,
    ...(main.stat ? { stat: main.stat } : {}),
    ...(main.ultimate ? { ultimate: true } : {}),
  };
  return { ...def, description: describeSkill(def) };
}

// ── 조회 ───────────────────────────────────────────────

const cache = new Map<string, Skill | undefined>();

/**
 * 스킬 id로 스킬 조회 (이름·대상·설명용). 몬스터 스킬이거나, 조각 id("메인+부")면 Lv1로 합쳐서.
 * 부 조각 레벨이 들어간 실제 효과는 전투 유닛의 book에 있다. 없으면 undefined
 */
export function getSkill(id: string): Skill | undefined {
  if (MONSTER_SKILLS[id]) return MONSTER_SKILLS[id];
  if (!cache.has(id)) {
    const build = parseKey(id);
    cache.set(id, build ? resolveSkill(build) : undefined);
  }
  return cache.get(id);
}

// ── 모집 ───────────────────────────────────────────────

/**
 * 시작 스킬: 쓸 수 있는 메인 조각 중 무작위로 START_SKILLS개 (겹치지 않게),
 * 스킬마다 START_SUB_CHANCE 확률로 부 조각 하나 (등급 규칙 안에서)
 */
export function rollStartSkills(owner: SkillOwner, rand: () => number): SkillBuild[] {
  const pool = fragmentsFor(owner);
  const mains = pool.filter((f) => f.kind === "main").map((f) => f.id);
  const subs = pool.filter((f) => f.kind === "sub").map((f) => f.id);
  if (mains.length === 0) return [basicBuild(owner.job)];
  const out: SkillBuild[] = [];
  const left = [...mains];
  while (out.length < START_SKILLS && left.length > 0) {
    const main = left.splice(Math.floor(rand() * left.length), 1)[0];
    const build: SkillBuild = { main, subs: [] };
    if (subs.length > 0 && RANKS[owner.level].subLimit > 0 && rand() < START_SUB_CHANCE) build.subs = [subs[Math.floor(rand() * subs.length)]];
    out.push(normalize(build));
  }
  return out;
}

/** 스킬 안에 든 조각 id (메인 + 부) */
export function fragmentsIn(build: SkillBuild): string[] {
  return [build.main, ...build.subs];
}

// ── 설명 ───────────────────────────────────────────────

const pctText = (n: number) => `${Math.round(n * 100)}%`;
const signed = (n: number, f: (x: number) => string = String) => `${n >= 0 ? "+" : "-"}${f(Math.abs(n))}`;
const TO_TEXT: Record<AddTo, string> = { auto: "대상", self: "자신", foe: "적", allFoes: "모든 적" };

/** 조각 하나의 설명 (화면용). 부 조각은 레벨 수치로 */
export function describeFragment(f: Fragment, lv = 1): string {
  if (f.hint && f.kind === "main") return `${f.hint}. ${resolveSkill({ main: f.id, subs: [] })?.description ?? ""}`;
  if (f.kind === "main") return resolveSkill({ main: f.id, subs: [] })?.description ?? "";
  const v = (x: Parameters<typeof scaled>[0]) => scaled(x, lv);
  return f.mods
    .map((m): string => {
      const when = "when" in m && m.when === "attack" ? "공격하면 " : "when" in m && m.when === "ally" ? "아군에게 쓰면 " : "";
      switch (m.kind) {
        case "power":
          return `위력 ${signed(v(m.pct), pctText)}`;
        case "cooldown":
          return `대기 ${signed(m.turns)}`;
        case "flat":
          return `고정 피해 +${v(m.amount)}`;
        case "crit":
          return `치명 +${pctText(v(m.pct))}`;
        case "pierce":
          return `방어 ${pctText(v(m.pct))} 무시`;
        case "lifesteal":
          return `준 피해 ${pctText(v(m.pct))} 회복`;
        case "area":
          return `적 하나 공격을 모든 적에게 (위력 ×${m.mult})`;
        case "hits":
          return `타격 +${m.add} (타격마다 위력 ×${m.mult})`;
        case "duration":
          return `거는 효과 지속 +${m.turns}턴`;
        case "effect":
          return `효과 ${signed(m.pct, pctText)}`;
        case "heal":
          return `회복량 +${pctText(v(m.pct))}`;
        case "narrow":
          return "전체에 거는 효과를 대상 하나로 좁힌다";
        case "selfCost":
          return `자기 최대 체력 ${pctText(m.pctMaxHp)} 소모`;
        case "stunChance":
          return `${when}기절 확률 +${pctText(v(m.pct))}`;
        case "shieldFromHeal":
          return `회복량의 ${pctText(m.pct)}만큼 보호막`;
        case "status": {
          const roll = m.lv ? { ...m.roll, value: v(m.lv) } : m.roll;
          return `${when}${TO_TEXT[m.to]}에게 ${statusText(roll)}`;
        }
        case "addHeal":
          return `${when}${TO_TEXT[m.to]} 체력 ${v(m.amount)} 회복`;
        case "addShield":
          return `${when}${TO_TEXT[m.to]}에게 보호막 ${m.amount}`;
        case "support":
          return `옆 아군에게 보호막 ${m.shield}`;
        case "resonance":
          return `원소 조각이 없으면 위력 +${pctText(v(m.power))}, 있으면 원소 효과 +${pctText(v(m.boost))}`;
        case "later": {
          const x = m.lv ? v(m.lv) : undefined;
          return `${m.text.replace("{v}", x === undefined ? "" : m.pct ? pctText(x) : String(x))} (준비 중)`;
        }
      }
    })
    .join(" · ");
}
