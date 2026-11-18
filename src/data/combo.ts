// 조합 스킬: 직업 대표 스킬에 종족 변형을 적용해 만든다. 종족마다 변형 2개 → 40조합 × 2 = 80개.
// 스킬마다 직접 쓰지 않고 규칙으로 만든다. id는 "combo:직업:종족:번호(1|2)".
// 변형 중 하나는 "초반 스킬"(처음부터 쓸 만하게 맞춘 쪽)로, 모집 때 30% 확률로 마지막 칸에 들어온다.
// 나머지 하나는 등급이 오를 때 배운다 (등급 성장은 아직 없다).
import { JOB_SKILL, SKILLS, type SkillDef, type SkillEffect } from "./skills";

export const COMBO_PREFIX = "combo:";

type Variant = {
  /** 스킬 이름 앞에 붙는 말 */
  prefix: string;
  /** 대표 스킬을 바꾼다 (원본은 건드리지 않고 새로 만든다) */
  apply: (def: SkillDef) => SkillDef;
};

const hasDamage = (d: SkillDef) => d.effects.some((e) => e.kind === "damage");
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 피해·회복·보호막 수치에 배율을 곱한다 */
function scale(effects: SkillEffect[], k: number): SkillEffect[] {
  return effects.map((e) => {
    switch (e.kind) {
      case "damage":
        return e.fixed
          ? { ...e, fixed: [Math.round(e.fixed[0] * k), Math.round(e.fixed[1] * k)] as const }
          : { ...e, multiplier: round2((e.multiplier ?? 1) * k), ...(e.bonus ? { bonus: Math.round(e.bonus * k) } : {}) };
      case "heal":
      case "shield":
        return { ...e, amount: Math.round(e.amount * k) };
      default:
        return e;
    }
  });
}

const withEffects = (def: SkillDef, effects: SkillEffect[], cooldown = def.cooldown): SkillDef => ({ ...def, effects, cooldown });

/** 종족별 변형 [1, 2]와 초반 스킬이 되는 쪽 */
export const VARIANTS: Record<string, { variants: [Variant, Variant]; early: 1 | 2 }> = {
  dwarf: {
    early: 2,
    variants: [
      {
        prefix: "육중한",
        // 강화: 수치 +50%, 대기 +1. 수치가 없는 스킬(막아서기)은 자신에게 보호막 4를 더한다
        apply: (d) =>
          d.effects.some((e) => e.kind === "damage" || e.kind === "heal" || e.kind === "shield")
            ? withEffects(d, scale(d.effects, 1.5), d.cooldown + 1)
            : withEffects(d, [...d.effects, { kind: "shield", amount: 4, who: "self" }], d.cooldown + 1),
      },
      // 버팀: 쓰고 나서 다음 자기 차례까지 방어 +2
      { prefix: "버티는", apply: (d) => withEffects(d, [...d.effects, { kind: "applyStatus", status: "brace", who: "self" }]) },
    ],
  },
  elf: {
    early: 2,
    variants: [
      // 선제: 다음 라운드에 맨 먼저 행동한다
      { prefix: "앞서는", apply: (d) => withEffects(d, [...d.effects, { kind: "applyStatus", status: "haste", who: "self" }]) },
      {
        prefix: "정밀한",
        // 정밀: 치명타 +20%. 피해가 없는 스킬은 실패 확률을 없애고, 실패가 없으면 회복·보호막 +2
        apply: (d) => {
          if (hasDamage(d)) return withEffects(d, d.effects.map((e) => (e.kind === "damage" ? { ...e, critBonus: 0.2 } : e)));
          if (d.effects.some((e) => e.kind === "fail")) return withEffects(d, d.effects.filter((e) => e.kind !== "fail"));
          return withEffects(d, d.effects.map((e) => (e.kind === "heal" || e.kind === "shield" ? { ...e, amount: e.amount + 2 } : e)));
        },
      },
    ],
  },
  beastfolk: {
    early: 2,
    variants: [
      {
        prefix: "몰아치는",
        // 연타: 같은 대상에게 두 번, 각 60%. 피해가 없는 스킬은 회복·보호막 +20%
        apply: (d) =>
          hasDamage(d)
            ? withEffects(
                d,
                d.effects.map((e) => (e.kind === "damage" && e.area !== "all" ? { ...scale([e], 0.6)[0], hits: 2 } as SkillEffect : e.kind === "damage" ? scale([e], 1.2)[0] : e)),
              )
            : withEffects(d, scale(d.effects, 1.2)),
      },
      {
        prefix: "사냥꾼의",
        // 사냥: 처치하면 대기 초기화. 피해가 없는 스킬은 대기 -1
        apply: (d) =>
          hasDamage(d) && d.target === "enemy"
            ? withEffects(d, [...d.effects, { kind: "resetOnKill" }])
            : withEffects(d, d.effects, Math.max(1, d.cooldown - 1)),
      },
    ],
  },
  barbarian: {
    early: 2,
    variants: [
      // 광기: 자기 체력 -3, 위력 +80%
      { prefix: "광기의", apply: (d) => withEffects(d, [...scale(d.effects, 1.8), { kind: "selfCost", hp: 3 }]) },
      {
        prefix: "위압의",
        // 위압: 대상에게 위축. 적을 고르지 않는 스킬은 적 전체에
        apply: (d) =>
          withEffects(d, [
            ...d.effects,
            d.target === "enemy" ? { kind: "applyStatus", status: "weaken" } : { kind: "applyStatus", status: "weaken", area: "all" },
          ]),
      },
    ],
  },
  human: {
    early: 2,
    variants: [
      // 지원: 옆 아군에게도 절반 (공격 스킬이면 옆 아군에게 보호막 3)
      { prefix: "함께하는", apply: (d) => withEffects(d, [...d.effects, { kind: "support", shield: 3 }]) },
      // 임기응변: 대기 -1 (최소 1)
      { prefix: "재빠른", apply: (d) => withEffects(d, d.effects, Math.max(1, d.cooldown - 1)) },
    ],
  },
};

export function comboId(job: string, race: string, n: 1 | 2): string {
  return `${COMBO_PREFIX}${job}:${race}:${n}`;
}

/** 조합 스킬을 만든다. 없는 직업·종족이면 undefined */
export function comboSkill(id: string): SkillDef | undefined {
  if (!id.startsWith(COMBO_PREFIX)) return undefined;
  const [job, race, n] = id.slice(COMBO_PREFIX.length).split(":");
  const base = SKILLS[JOB_SKILL[job] ?? ""];
  const rule = VARIANTS[race];
  if (!base || !rule || (n !== "1" && n !== "2")) return undefined;
  const variant = rule.variants[Number(n) - 1];
  const made = variant.apply({ ...base, effects: structuredClone(base.effects) });
  return { ...made, id, name: `${variant.prefix} ${base.name}`, source: { job, race } };
}

/** 이 직업·종족의 초반 조합 스킬 id */
export function earlyCombo(job: string, race: string): string | undefined {
  const rule = VARIANTS[race];
  return rule && JOB_SKILL[job] ? comboId(job, race, rule.early) : undefined;
}
