// 스킬 데이터. 스킬마다 코드를 짜지 않고 "효과 조각"을 조합해서 정의한다.
// 엔진(combat/engine.ts)은 조각 종류별로 한 번씩만 처리하고, 미리보기와 설명 문장도 조각에서 만든다.
import type { StatusKind } from "./combat";

export type SkillTarget = "enemy" | "ally" | "none";

export type SkillEffect =
  /**
   * 피해. 기본은 공격력 굴림 × multiplier + bonus.
   * fixed가 있으면 공격력 대신 그 범위를 쓴다. area "all"이면 살아 있는 적 전체.
   * onHit: 공격자의 상태이상 부여(단검수 출혈 등)를 굴리나 (기본 true)
   */
  | { kind: "damage"; multiplier?: number; bonus?: number; fixed?: readonly [number, number]; area?: "one" | "all"; onHit?: boolean }
  /** 대상(또는 area "all"이면 적 전체)에게 상태이상. 대상이 살아 있을 때만 */
  | { kind: "applyStatus"; status: StatusKind; area?: "one" | "all" }
  | { kind: "heal"; amount: number }
  /** 대상의 출혈·중독을 씻는다 */
  | { kind: "cure" }
  /** 보호막. 겹쳐 쌓지 않고 큰 쪽으로 채운다 */
  | { kind: "shield"; amount: number }
  /** 다음 자기 차례까지 적의 공격을 끌어오고 받는 피해 절반 */
  | { kind: "taunt" }
  /** 자기 체력 소모 (체력 1 아래로는 깎지 않는다) */
  | { kind: "selfCost"; hp: number }
  /** 이 확률로 스킬 전체가 실패한다 (대기 시간은 그대로 든다) */
  | { kind: "fail"; chance: number };

export type SkillSource = { job?: string; race?: string };

export type SkillDef = {
  id: string;
  name: string;
  source: SkillSource;
  /** 쓰고 나서 다시 쓸 수 있을 때까지 기다리는 자기 턴 수 */
  cooldown: number;
  target: SkillTarget;
  effects: SkillEffect[];
};

export type Skill = SkillDef & { description: string };

const DEFS: SkillDef[] = [
  { id: "guard", name: "막아서기", source: { job: "spearman" }, cooldown: 2, target: "none", effects: [{ kind: "taunt" }] },
  {
    id: "pierce",
    name: "급소 찌르기",
    source: { job: "dagger" },
    cooldown: 2,
    target: "enemy",
    effects: [
      { kind: "damage", bonus: 3, onHit: false },
      { kind: "applyStatus", status: "bleed" },
    ],
  },
  {
    id: "pray",
    name: "기도",
    source: { job: "nun" },
    cooldown: 3,
    target: "ally",
    effects: [{ kind: "heal", amount: 8 }, { kind: "cure" }],
  },
  {
    id: "volley",
    name: "화살비",
    source: { job: "archer" },
    cooldown: 3,
    target: "none",
    effects: [{ kind: "damage", fixed: [3, 5], area: "all", onHit: false }],
  },
  {
    id: "cleave",
    name: "내려찍기",
    source: { job: "greatsword" },
    cooldown: 2,
    target: "enemy",
    effects: [
      { kind: "damage", multiplier: 1.8 },
      { kind: "selfCost", hp: 3 },
    ],
  },
  {
    id: "miasma",
    name: "독안개",
    source: { job: "herbalist" },
    cooldown: 3,
    target: "none",
    effects: [{ kind: "applyStatus", status: "poison", area: "all" }],
  },
  {
    id: "firelance",
    name: "불꽃 창",
    source: { job: "mage" },
    cooldown: 3,
    target: "enemy",
    effects: [
      { kind: "damage", multiplier: 2.5, onHit: false },
      { kind: "selfCost", hp: 4 },
    ],
  },
  {
    id: "ward",
    name: "정령의 가호",
    source: { job: "spiritcaller" },
    cooldown: 2,
    target: "ally",
    effects: [
      { kind: "fail", chance: 0.2 },
      { kind: "shield", amount: 6 },
    ],
  },
  /** 직업 정보가 없는 용병의 기본 스킬 */
  { id: "power", name: "전력 공격", source: {}, cooldown: 3, target: "enemy", effects: [{ kind: "damage", multiplier: 1.5 }] },
];

const STATUS_NAME: Record<StatusKind, string> = {
  bleed: "출혈",
  poison: "중독",
  crack: "균열",
  weaken: "위축",
  awaken: "각성",
};

/** 효과 조각에서 설명 문장을 만든다. 스킬 수가 많아져도 설명을 따로 쓰지 않는다 */
export function describeSkill(def: SkillDef): string {
  const one = def.target === "ally" ? "아군 하나" : "적 하나";
  const parts = def.effects.flatMap((e): string[] => {
    switch (e.kind) {
      case "damage": {
        const who = e.area === "all" ? "모든 적에게" : `${one}에게`;
        if (e.fixed) return [`${who} ${e.fixed[0]}~${e.fixed[1]} 피해`];
        const power = e.multiplier && e.multiplier !== 1 ? `${e.multiplier}배` : "공격력";
        return [`${who} ${power}${e.bonus ? ` +${e.bonus}` : ""} 피해`];
      }
      case "applyStatus":
        return [e.area === "all" ? `모든 적을 ${STATUS_NAME[e.status]}시킨다` : `${STATUS_NAME[e.status]}을 반드시 건다`];
      case "heal":
        return [`${one}의 체력 ${e.amount} 회복`];
      case "cure":
        return ["출혈과 중독을 씻어 낸다"];
      case "shield":
        return [`${one}에게 피해를 먼저 막는 보호막 ${e.amount}`];
      case "taunt":
        return ["다음 차례까지 적의 공격을 끌어오고, 받는 피해가 절반"];
      case "selfCost":
        return [`자기 체력 ${e.hp} 소모 (쓰러지지는 않는다)`];
      case "fail":
        return [`${Math.round(e.chance * 100)}% 확률로 실패`];
    }
  });
  return parts.join(". ");
}

export const SKILLS: Record<string, Skill> = Object.fromEntries(DEFS.map((d) => [d.id, { ...d, description: describeSkill(d) }]));

export type SkillId = string;

/** 장착 슬롯 수. 공격과 붕대는 슬롯을 차지하지 않는다 */
export const SKILL_SLOTS = 4;

/** 직업별 스킬 (지금은 한 개씩. 장착 슬롯 4개는 다음 단계) */
export const JOB_SKILL: Record<string, SkillId> = Object.fromEntries(
  DEFS.filter((d) => d.source.job && !d.source.race).map((d) => [d.source.job!, d.id]),
);
export const DEFAULT_SKILL: SkillId = "power";
