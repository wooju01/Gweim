// 스킬 조각. 스킬 하나 = 메인 조각 1 + 부 조각 0~2 ({ main, subs }로 저장).
// 효과는 game/skills.ts가 조각을 합쳐 계산한다 (resolveSkill). 수치는 전부 여기 있다.
//
// 조각 풀: 직업마다 공통 메인 4 + 공통 부 4 + 종족 전용 메인 1 + 부 1, 종족마다 공통 메인 4 (직업 상관없이).
// 용병은 자기 직업의 공통 조각, 자기 종족의 전용·공통 조각만 쓸 수 있다.
// 메인 조각은 레벨이 없고, 부 조각은 Lv1~3 (전수관 강화, 100% 성공).
//
// 대기(wait): 쓰고 나서 쓸 수 없는 자기 차례 수. 0이면 매 차례 쓸 수 있다.
// "N턴" 지속은 그 유닛의 행동 N번이다. 자기에게 건 강화는 쓴 행동이 끝나도 줄지 않는다 (엔진 규칙).
// later 효과는 아직 엔진이 처리하지 않는다 (2단계). 설명에만 나온다.
// 수치는 초안이다. 밸런스는 나중에 시뮬레이션으로 조정한다.
import type { Element } from "@/lib/schemas";
import type { StatusKind } from "./combat";
import type { PowerStat } from "./growth";
import { JOB_MATERIAL, RACE_MATERIAL, type JobId, type RaceId } from "./jobs";
import type { DamageEffect, SkillEffect, SkillTarget, StatusRoll } from "./skills";

/** 부 조각 수치: 숫자 하나면 레벨과 상관없고, [Lv1, Lv3]면 Lv2는 그 가운데 */
export type Scaled = number | readonly [number, number];

/** 덧붙는 효과가 붙는 조건: attack 적을 치는 스킬일 때만 / ally 아군을 고르는 스킬일 때만 / 없으면 언제나 */
export type When = "attack" | "ally";

/**
 * 덧붙는 효과의 대상.
 * auto: 아군 하나를 고르는 스킬이면 그 아군, 아군 전체에 거는 스킬이면 아군 전체, 아니면 자신.
 * foe: 스킬이 치는 적 (적 하나 또는 적 전체). self: 자신. allFoes: 적 전체
 */
export type AddTo = "auto" | "self" | "foe" | "allFoes";

/** 부 조각이 스킬을 바꾸는 방법 */
export type SubMod =
  /** 피해 위력 ±비율 (모든 피해 효과의 배율에 곱한다) */
  | { kind: "power"; pct: Scaled }
  /** 대기 ± */
  | { kind: "cooldown"; turns: number }
  /** 고정 피해 + */
  | { kind: "flat"; amount: Scaled }
  /** 치명 확률 + */
  | { kind: "crit"; pct: Scaled }
  /** 방어 무시 + */
  | { kind: "pierce"; pct: Scaled }
  /** 준 피해의 비율만큼 회복 */
  | { kind: "lifesteal"; pct: Scaled }
  /** 적 하나 공격을 적 전체로 (배율 × mult) */
  | { kind: "area"; mult: number }
  /** 타격 수 + add (타격당 배율 × mult) */
  | { kind: "hits"; add: number; mult: number }
  /** 스킬이 거는 상태의 지속 + */
  | { kind: "duration"; turns: number }
  /** 효과 수치(상태 수치·회복·보호막) ±비율 */
  | { kind: "effect"; pct: number }
  /** 회복량 ±비율 */
  | { kind: "heal"; pct: Scaled }
  /** 아군 전체·적 전체에 거는 효과를 대상 하나로 좁힌다 */
  | { kind: "narrow" }
  /** 자기 최대 체력의 비율만큼 소모 */
  | { kind: "selfCost"; pctMaxHp: number }
  /** 기절 확률 + (기절을 거는 스킬이 아니면 이 확률로 기절을 덧붙인다) */
  | { kind: "stunChance"; pct: Scaled; when?: When }
  /** 회복량의 비율만큼 같은 대상에게 보호막 */
  | { kind: "shieldFromHeal"; pct: number }
  /** 상태이상을 덧붙인다. lv가 있으면 수치가 레벨을 따른다 */
  | { kind: "status"; roll: StatusRoll; lv?: readonly [number, number]; to: AddTo; when?: When }
  | { kind: "addHeal"; amount: Scaled; to: AddTo; when?: When }
  | { kind: "addShield"; amount: number; to: AddTo; when?: When }
  /** 옆 아군에게 보호막 */
  | { kind: "support"; shield: number }
  /** 정령 공명: 원소 조각이 없으면 위력 +power, 있으면 원소 조각 수치 +boost */
  | { kind: "resonance"; power: Scaled; boost: Scaled }
  /** 아직 엔진이 처리하지 않는 효과. {v}에 레벨 수치 */
  | { kind: "later"; text: string; lv?: readonly [number, number]; pct?: boolean };

type Base = {
  id: string;
  name: string;
  /** 직업 조각이면 그 직업. 없으면 종족 공통 조각 */
  job?: JobId;
  /** 종족 전용·종족 공통 조각이면 그 종족 */
  race?: RaceId;
  /** 화면용 한 줄 (없으면 효과에서 만든다) */
  hint?: string;
  /** 전수관에서 뚫어 주는 비용 (그 용병에게만). 궁극기는 null (승급으로 얻는다) */
  cost: { gold: number; salvage: Record<string, number> } | null;
  maxLevel: 1 | 3;
};

export type MainFragment = Base & {
  kind: "main";
  target: SkillTarget;
  wait: number;
  effects: SkillEffect[];
  stat?: PowerStat;
  ultimate?: boolean;
};

export type SubFragment = Base & {
  kind: "sub";
  mods: SubMod[];
  /** 마법사 원소 조각 */
  element?: Element;
};

export type Fragment = MainFragment | SubFragment;
export type FragmentId = string;

// ── 규칙 수치 ──────────────────────────────────────────

/** 부 조각 최대 레벨 */
export const MAX_SUB_LEVEL = 3;

/**
 * 한 스킬 안 부 조각 효과 상한 (효과 종류별 합). 지금은 단순 합산 후 자른다.
 * power·pierce는 퍼센트 효과, crit은 치명 확률, flat은 고정 피해. 대가(음수)는 자르지 않는다
 */
export const SUB_CAPS = { power: 0.25, pierce: 0.25, crit: 0.3, flat: 15 } as const;

/** 조립 비용 (금화) */
export const CRAFT_COST = 10;

/** 해금 비용: 금화와 재료 개수 (재료는 data/jobs.ts의 직업·종족 재료) */
export const UNLOCK_COST = {
  main: { gold: 10, job: 2, race: 0 },
  sub: { gold: 8, job: 1, race: 0 },
  raceMain: { gold: 15, job: 1, race: 2 },
  raceSub: { gold: 12, job: 1, race: 1 },
  raceCommon: { gold: 10, job: 0, race: 2 },
} as const;

/** 부 조각 강화 비용 (오를 레벨별). 재료는 그 조각의 재료 */
export const UPGRADE_COST: Record<2 | 3, { gold: number; material: number }> = {
  2: { gold: 12, material: 2 },
  3: { gold: 25, material: 4 },
};

/** 모집 때 받는 시작 스킬 수와, 스킬마다 부 조각이 하나 붙을 확률 */
export const START_SKILLS = 2;
export const START_SUB_CHANCE = 0.5;

// ── 만드는 도구 ────────────────────────────────────────

const hit = (multiplier: number, x: Omit<DamageEffect, "kind" | "multiplier"> = {}): DamageEffect => ({ kind: "damage", multiplier, ...x });
const mixed = (a: [PowerStat, number], b: [PowerStat, number], x: Omit<DamageEffect, "kind" | "scaling"> = {}): DamageEffect => ({
  kind: "damage",
  scaling: [
    { stat: a[0], mult: a[1] },
    { stat: b[0], mult: b[1] },
  ],
  ...x,
});
type At = { area?: "one" | "all"; who?: "self" | "allies" };
const st = (status: StatusKind, x: Omit<StatusRoll, "status"> & At = {}): SkillEffect => ({ kind: "applyStatus", status, ...x });
const later = (text: string): SkillEffect => ({ kind: "later", text });

function cost(kind: keyof typeof UNLOCK_COST, job?: JobId, race?: RaceId): Base["cost"] {
  const c = UNLOCK_COST[kind];
  const salvage: Record<string, number> = {};
  if (job && c.job) salvage[JOB_MATERIAL[job]] = (salvage[JOB_MATERIAL[job]] ?? 0) + c.job;
  if (race && c.race) salvage[RACE_MATERIAL[race]] = (salvage[RACE_MATERIAL[race]] ?? 0) + c.race;
  return { gold: c.gold, salvage };
}

type MainIn = Omit<MainFragment, "kind" | "cost" | "maxLevel" | "job" | "race">;
type SubIn = Omit<SubFragment, "kind" | "cost" | "maxLevel" | "job" | "race">;

/** 직업 하나의 조각: 공통 메인·부, 종족 전용 (메인, 부), 궁극기 */
function jobSet(
  job: JobId,
  set: { mains: MainIn[]; subs: SubIn[]; races: Partial<Record<RaceId, [MainIn, SubIn]>>; ultimate: MainIn },
): Fragment[] {
  return [
    ...set.mains.map((m): Fragment => ({ ...m, kind: "main", job, cost: cost("main", job), maxLevel: 1 })),
    ...set.subs.map((s): Fragment => ({ ...s, kind: "sub", job, cost: cost("sub", job), maxLevel: MAX_SUB_LEVEL })),
    ...Object.entries(set.races).flatMap(([race, [m, s]]): Fragment[] => [
      { ...m, kind: "main", job, race: race as RaceId, cost: cost("raceMain", job, race as RaceId), maxLevel: 1 },
      { ...s, kind: "sub", job, race: race as RaceId, cost: cost("raceSub", job, race as RaceId), maxLevel: MAX_SUB_LEVEL },
    ]),
    { ...set.ultimate, kind: "main", job, ultimate: true, wait: 0, cost: null, maxLevel: 1 },
  ];
}

/** 종족 공통 메인 조각 (직업 상관없이) */
function raceSet(race: RaceId, mains: MainIn[]): Fragment[] {
  return mains.map((m) => ({ ...m, kind: "main", race, cost: cost("raceCommon", undefined, race), maxLevel: 1 }));
}

// ── 직업 조각 ──────────────────────────────────────────

const KNIGHT = jobSet("knight", {
  mains: [
    { id: "knight_slash", name: "검격", target: "enemy", wait: 0, effects: [hit(1)] },
    { id: "knight_bulwark", name: "방벽", target: "none", wait: 1, effects: [st("armorUp", { value: 3, turns: 2, who: "self" })] },
    {
      id: "knight_duel",
      name: "결투 신청",
      target: "enemy",
      wait: 2,
      effects: [later("적 하나가 2턴 동안 기사만 공격하고, 그 적에게 받는 피해 -2")],
    },
    { id: "knight_charge", name: "돌진 베기", target: "enemy", wait: 1, effects: [hit(1.2)] },
  ],
  subs: [
    { id: "knight_sweep", name: "휩쓸기", mods: [{ kind: "area", mult: 0.6 }] },
    { id: "knight_grit", name: "투지", mods: [{ kind: "lifesteal", pct: 0.3 }, { kind: "power", pct: -0.1 }] },
    { id: "knight_chivalry", name: "기사도", mods: [{ kind: "support", shield: 3 }, { kind: "cooldown", turns: 1 }] },
    { id: "knight_combo", name: "연격", mods: [{ kind: "hits", add: 1, mult: 0.6 }] },
  ],
  races: {
    human: [
      { id: "knight_human_main", name: "오러 블레이드", target: "enemy", wait: 1, effects: [hit(1, { pierce: 0.2 })] },
      { id: "knight_human_sub", name: "오러", mods: [{ kind: "flat", amount: [2, 5] }] },
    ],
    elf: [
      { id: "knight_elf_main", name: "정령 검격", target: "enemy", wait: 1, effects: [mixed(["str", 1], ["mag", 0.3])] },
      {
        id: "knight_elf_sub",
        name: "바람 정령",
        mods: [{ kind: "status", roll: { status: "evadeUp", value: 0.15, turns: 1 }, to: "self" }, { kind: "power", pct: -0.1 }],
      },
    ],
    dwarf: [
      { id: "knight_dwarf_main", name: "룬 새김", target: "enemy", wait: 1, effects: [hit(1.1), st("armorDown", { value: 2, turns: 3 })] },
      {
        id: "knight_dwarf_sub",
        name: "보호의 룬",
        mods: [{ kind: "status", roll: { status: "armorUp", value: 2, turns: 2 }, to: "self" }, { kind: "cooldown", turns: 1 }],
      },
    ],
  },
  ultimate: {
    id: "ult_knight",
    name: "기사의 맹세",
    target: "none",
    wait: 0,
    effects: [hit(1.5, { area: "all" }), st("armorUp", { value: 2, turns: 2, who: "allies" })],
  },
});

// 가디언: 전부 방어형. 반사·반격 위력은 체력 기준 (2단계)
const GUARDIAN = jobSet("guardian", {
  mains: [
    { id: "guardian_vow", name: "수호 선언", target: "none", wait: 2, effects: [later("2턴 동안 적마다 확률로 가디언을 공격한다")] },
    { id: "guardian_cover", name: "감싸기", target: "ally", wait: 2, effects: [later("아군 하나 대신 2턴 동안 맞는다")] },
    {
      id: "guardian_bash",
      name: "방패 강타",
      target: "enemy",
      wait: 1,
      stat: "str",
      effects: [hit(0.8), st("stun", { chance: 0.3 }), later("기절 확률이 힘에 비례")],
    },
    { id: "guardian_wall", name: "철벽", target: "none", wait: 1, effects: [st("armorUp", { value: 3, turns: 2, who: "self" })] },
  ],
  subs: [
    { id: "guardian_sturdy", name: "견고", mods: [{ kind: "duration", turns: 1 }, { kind: "cooldown", turns: 1 }] },
    { id: "guardian_thorns", name: "가시 방패", mods: [{ kind: "later", text: "받은 공격을 반사" }, { kind: "power", pct: -0.1 }] },
    { id: "guardian_ward", name: "수호막", mods: [{ kind: "addShield", amount: 4, to: "auto" }, { kind: "cooldown", turns: 1 }] },
    {
      id: "guardian_resolve",
      name: "결의",
      mods: [{ kind: "status", roll: { status: "armorUp", value: 1, turns: 2 }, to: "self" }, { kind: "power", pct: -0.1 }],
    },
  ],
  races: {
    human: [
      { id: "guardian_human_main", name: "수호의 깃발", target: "none", wait: 2, effects: [st("armorUp", { value: 1, turns: 2, who: "allies" })] },
      {
        id: "guardian_human_sub",
        name: "굳은 의지",
        mods: [{ kind: "status", roll: { status: "toughen", turns: 2 }, lv: [0.05, 0.15], to: "self" }],
      },
    ],
    dwarf: [
      {
        id: "guardian_dwarf_main",
        name: "방벽의 룬",
        target: "none",
        wait: 2,
        effects: [st("armorUp", { value: 3, turns: 2, who: "self" }), st("stunResUp", { value: 0.4, turns: 2, who: "self" })],
      },
      {
        id: "guardian_dwarf_sub",
        name: "대지의 룬",
        mods: [{ kind: "status", roll: { status: "armorUp", value: 1, turns: 2 }, to: "auto" }, { kind: "cooldown", turns: 1 }],
      },
    ],
    barbarian: [
      {
        id: "guardian_barbarian_main",
        name: "버티는 함성",
        target: "none",
        wait: 2,
        effects: [later("2턴 동안 매 턴 최대 체력 5% 회복, 적의 공격을 더 끌어온다")],
      },
      {
        id: "guardian_barbarian_sub",
        name: "문신의 맹세",
        mods: [{ kind: "status", roll: { status: "toughen", turns: 1 }, lv: [0.1, 0.2], to: "self" }, { kind: "power", pct: -0.1 }],
      },
    ],
  },
  ultimate: {
    id: "ult_guardian",
    name: "최후의 보루",
    target: "none",
    wait: 0,
    effects: [later("무조건 먼저 움직여, 1턴 동안 아군이 받을 피해를 전부 대신 받고 체력에 비례해 반드시 반격한다")],
  },
});

const GREATSWORD = jobSet("greatsword", {
  mains: [
    { id: "gs_strike", name: "대검 일섬", target: "enemy", wait: 2, effects: [hit(1.4)] },
    { id: "gs_whirl", name: "회전 베기", target: "none", wait: 3, effects: [hit(0.7, { area: "all" })] },
    { id: "gs_breaker", name: "갑옷 부수기", target: "enemy", wait: 2, effects: [hit(1), st("crack", { value: 2, turns: 3 })] },
    { id: "gs_stance", name: "자세 잡기", target: "none", wait: 2, effects: [st("charge", { value: 1, turns: 1, who: "self" })] },
  ],
  subs: [
    { id: "gs_recoil", name: "반동 강타", mods: [{ kind: "power", pct: 0.2 }, { kind: "selfCost", pctMaxHp: 0.05 }] },
    { id: "gs_pierce", name: "관통", mods: [{ kind: "pierce", pct: 0.2 }] },
    { id: "gs_shock", name: "충격", mods: [{ kind: "stunChance", pct: 0.2, when: "attack" }, { kind: "cooldown", turns: 1 }] },
    { id: "gs_vamp", name: "흡혈 일격", mods: [{ kind: "lifesteal", pct: 0.2 }, { kind: "power", pct: -0.1 }] },
  ],
  races: {
    human: [
      { id: "gs_human_main", name: "검기 날리기", target: "enemy", wait: 1, effects: [hit(1, { bonus: 3 })] },
      { id: "gs_human_sub", name: "정확한 자세", mods: [{ kind: "crit", pct: [0.1, 0.2] }] },
    ],
    dwarf: [
      { id: "gs_dwarf_main", name: "룬 각인 대검", target: "enemy", wait: 1, effects: [hit(1.3), later("기절 중인 대상에게 위력 +50%")] },
      { id: "gs_dwarf_sub", name: "무게의 룬", mods: [{ kind: "stunChance", pct: [0.1, 0.2], when: "attack" }, { kind: "cooldown", turns: 1 }] },
    ],
    beastfolk: [
      {
        id: "gs_beastfolk_main",
        name: "야수의 난도질",
        target: "enemy",
        wait: 1,
        effects: [hit(0.6, { hits: 3, perHit: { status: "bleed", chance: 0.3 } })],
      },
      { id: "gs_beastfolk_sub", name: "광폭", mods: [{ kind: "later", text: "체력 50% 이하일 때 위력 +{v}", lv: [0.15, 0.25], pct: true }] },
    ],
    barbarian: [
      { id: "gs_barbarian_main", name: "분쇄 일격", target: "enemy", wait: 2, effects: [hit(1.6), { kind: "selfCost", pctMaxHp: 0.08 }] },
      {
        id: "gs_barbarian_sub",
        name: "전사의 함성",
        mods: [
          { kind: "status", roll: { status: "attackUp", value: 2, turns: 2 }, to: "self" },
          { kind: "status", roll: { status: "armorDown", value: 2, turns: 1 }, to: "self" },
        ],
      },
    ],
  },
  ultimate: { id: "ult_greatsword", name: "대지 가르기", target: "none", wait: 0, effects: [hit(1.5, { area: "all" }), { kind: "selfCost", hp: 6 }] },
});

const ASSASSIN = jobSet("assassin", {
  mains: [
    { id: "as_flurry", name: "연속 찌르기", target: "enemy", wait: 1, effects: [hit(0.5, { hits: 3 })] },
    { id: "as_vital", name: "급소 찌르기", target: "enemy", wait: 1, effects: [hit(0.9, { pierce: 0.2 })] },
    { id: "as_throw", name: "단검 던지기", target: "enemy", wait: 0, effects: [hit(1.2, { critBonus: 0.1 })] },
    {
      id: "as_shadow",
      name: "그림자 걸음",
      target: "none",
      wait: 1,
      effects: [st("evadeUp", { value: 0.15, turns: 2, who: "self" }), st("critUp", { value: 0.05, turns: 2, who: "self" })],
    },
  ],
  subs: [
    {
      id: "as_bleed",
      name: "출혈",
      mods: [{ kind: "status", roll: { status: "bleed", value: 2 }, to: "foe", when: "attack" }, { kind: "power", pct: -0.1 }],
    },
    {
      id: "as_venom",
      name: "맹독",
      mods: [
        { kind: "status", roll: { status: "poison", value: 4, turns: 2 }, to: "foe", when: "attack" },
        { kind: "later", text: "중독이 매 턴 30% 약해진다" },
        { kind: "cooldown", turns: 1 },
      ],
    },
    { id: "as_aim", name: "치명 노림", mods: [{ kind: "crit", pct: 0.15 }, { kind: "power", pct: -0.1 }] },
    {
      id: "as_finisher",
      name: "마무리 일격",
      mods: [{ kind: "later", text: "2턴 동안 체력 50% 이하인 적에게 위력 +10%·치명 +10%" }, { kind: "cooldown", turns: 1 }],
    },
  ],
  races: {
    human: [
      { id: "as_human_main", name: "약점 찌르기", target: "enemy", wait: 1, effects: [hit(0.8, { bonus: 4 })] },
      { id: "as_human_sub", name: "이어지는 칼끝", mods: [{ kind: "status", roll: { status: "charge", turns: 1 }, lv: [0.1, 0.2], to: "self" }] },
    ],
    elf: [
      { id: "as_elf_main", name: "정령의 비수", target: "enemy", wait: 1, effects: [mixed(["str", 1], ["mag", 0.3], { critBonus: 0.1 })] },
      {
        id: "as_elf_sub",
        name: "바람 걸음",
        mods: [{ kind: "status", roll: { status: "evadeUp", turns: 1 }, lv: [0.1, 0.2], to: "self" }, { kind: "power", pct: -0.1 }],
      },
    ],
    beastfolk: [
      { id: "as_beastfolk_main", name: "덮치기", target: "enemy", wait: 1, effects: [hit(0.5, { hits: 3 }), later("대상 체력이 50% 이하면 4번")] },
      { id: "as_beastfolk_sub", name: "피 냄새", mods: [{ kind: "later", text: "출혈 중인 적에게 위력 +{v}", lv: [0.1, 0.2], pct: true }] },
    ],
  },
  ultimate: {
    id: "ult_assassin",
    name: "그림자 난무",
    target: "none",
    wait: 0,
    effects: [later("무조건 먼저 움직인다"), hit(0.6, { area: "all", hits: 2 }), st("bleed", { area: "all" })],
  },
});

const MONK = jobSet("monk", {
  mains: [
    { id: "monk_punch", name: "정권 지르기", target: "enemy", wait: 0, effects: [hit(1.2)] },
    { id: "monk_upper", name: "어퍼컷", target: "enemy", wait: 1, effects: [hit(0.8), st("stun", { chance: 1 })] },
    { id: "monk_counter", name: "카운터", target: "none", wait: 1, effects: [later("2턴 동안 공격받으면 반드시 1.2배로 반격")] },
    { id: "monk_breath", name: "호흡 가다듬기", target: "none", wait: 1, effects: [later("2턴 동안 공격 횟수 +1")] },
  ],
  subs: [
    { id: "monk_vital", name: "급소 타격", mods: [{ kind: "power", pct: 0.2 }] },
    { id: "monk_breathe", name: "호흡", mods: [{ kind: "addHeal", amount: 5, to: "self" }, { kind: "cooldown", turns: 1 }] },
    {
      id: "monk_iron",
      name: "철신",
      mods: [{ kind: "status", roll: { status: "armorUp", value: 2, turns: 1 }, to: "self" }, { kind: "cooldown", turns: 1 }],
    },
    { id: "monk_chain", name: "연계", mods: [{ kind: "later", text: "다음 공격 횟수 +1" }, { kind: "power", pct: -0.2 }] },
  ],
  races: {
    human: [
      { id: "monk_human_main", name: "발경", target: "enemy", wait: 1, effects: [hit(0.9, { bonus: 4 })] },
      {
        id: "monk_human_sub",
        name: "경락 타격",
        mods: [{ kind: "status", roll: { status: "shaken", turns: 2 }, lv: [0.2, 0.3], to: "foe", when: "attack" }, { kind: "cooldown", turns: 1 }],
      },
    ],
    dwarf: [
      { id: "monk_dwarf_main", name: "강철 철권", target: "enemy", wait: 2, effects: [hit(1.5), st("slow", { value: 2, turns: 2 })] },
      {
        id: "monk_dwarf_sub",
        name: "강철 피부",
        mods: [{ kind: "status", roll: { status: "toughen", turns: 1 }, lv: [0.05, 0.15], to: "self" }, { kind: "power", pct: -0.1 }],
      },
    ],
    beastfolk: [
      { id: "monk_beastfolk_main", name: "발톱 연격", target: "enemy", wait: 1, effects: [hit(0.4, { hits: 4 })] },
      { id: "monk_beastfolk_sub", name: "야성의 리듬", mods: [{ kind: "later", text: "3타 이상이면 마지막 타격 +{v}", lv: [0.15, 0.25], pct: true }] },
    ],
    barbarian: [
      { id: "monk_barbarian_main", name: "메치기", target: "enemy", wait: 1, effects: [hit(1.3), st("armorDown", { value: 3, turns: 1 })] },
      { id: "monk_barbarian_sub", name: "투혼", mods: [{ kind: "later", text: "체력 30% 이하일 때 위력 +{v}", lv: [0.2, 0.25], pct: true }] },
    ],
  },
  ultimate: {
    id: "ult_monk",
    name: "천붕격",
    target: "enemy",
    wait: 0,
    effects: [hit(0.5, { hits: 6 }), st("stun", { sure: true })],
  },
});

const ARCHER = jobSet("archer", {
  mains: [
    { id: "ar_rapid", name: "속사", target: "enemy", wait: 0, effects: [hit(1.2)] },
    { id: "ar_rain", name: "화살비", target: "none", wait: 1, effects: [hit(0.6, { area: "all" })] },
    { id: "ar_aimed", name: "조준 사격", target: "enemy", wait: 1, effects: [hit(1.3, { critBonus: 0.15 })] },
    {
      id: "ar_focus",
      name: "집중",
      target: "none",
      wait: 1,
      effects: [st("critUp", { value: 0.1, turns: 2, who: "self" }), st("pierceUp", { value: 0.2, turns: 2, who: "self" })],
    },
  ],
  subs: [
    { id: "ar_pierce", name: "꿰뚫기", mods: [{ kind: "later", text: "무작위 적 하나에게도 50% 피해" }, { kind: "power", pct: -0.1 }] },
    { id: "ar_multi", name: "연발", mods: [{ kind: "hits", add: 1, mult: 0.7 }] },
    {
      id: "ar_mark",
      name: "표적 지정",
      mods: [{ kind: "status", roll: { status: "mark", value: 0.1, turns: 2 }, to: "foe", when: "attack" }, { kind: "cooldown", turns: 1 }],
    },
    {
      id: "ar_keep",
      name: "거리 유지",
      mods: [{ kind: "status", roll: { status: "evadeUp", value: 0.15, turns: 1 }, to: "self" }, { kind: "cooldown", turns: 1 }],
    },
  ],
  races: {
    human: [
      { id: "ar_human_main", name: "다리 쏘기", target: "enemy", wait: 1, effects: [hit(0.9), st("slow", { value: 3, turns: 2 })] },
      { id: "ar_human_sub", name: "정밀 화살촉", mods: [{ kind: "flat", amount: [2, 4] }] },
    ],
    elf: [
      {
        id: "ar_elf_main",
        name: "정령의 화살",
        target: "enemy",
        wait: 1,
        effects: [mixed(["str", 1], ["mag", 0.3]), st("evadeDown", { value: 0.1, turns: 2 })],
      },
      { id: "ar_elf_sub", name: "바람의 인도", mods: [{ kind: "crit", pct: [0.1, 0.2] }] },
    ],
    beastfolk: [
      { id: "ar_beastfolk_main", name: "추적 사격", target: "enemy", wait: 1, effects: [hit(1.1), later("출혈 중인 대상에게 치명 +20%")] },
      {
        id: "ar_beastfolk_sub",
        name: "사냥꾼의 표식",
        mods: [{ kind: "status", roll: { status: "bleedVuln", turns: 2 }, lv: [0.2, 0.3], to: "foe", when: "attack" }, { kind: "cooldown", turns: 1 }],
      },
    ],
    barbarian: [
      { id: "ar_barbarian_main", name: "강궁 관통", target: "enemy", wait: 2, effects: [hit(1.5, { pierce: 0.2 })] },
      {
        id: "ar_barbarian_sub",
        name: "위압의 화살",
        mods: [{ kind: "status", roll: { status: "weaken", value: 2, turns: 2 }, to: "foe", when: "attack" }, { kind: "power", pct: -0.1 }],
      },
    ],
  },
  ultimate: { id: "ult_archer", name: "폭풍 화살", target: "none", wait: 0, effects: [hit(0.6, { area: "random", hits: 6 })] },
});

const PRIEST = jobSet("priest", {
  mains: [
    { id: "pr_heal", name: "치유의 기도", target: "ally", wait: 0, effects: [{ kind: "heal", amount: 6 }] },
    {
      id: "pr_purify",
      name: "정화",
      target: "ally",
      wait: 1,
      effects: [{ kind: "cure", kinds: ["bleed", "poison", "weaken"] }, { kind: "heal", amount: 3 }],
    },
    { id: "pr_smite", name: "신성 일격", target: "enemy", wait: 0, stat: "faith", effects: [hit(1)] },
    { id: "pr_radiance", name: "광휘", target: "none", wait: 1, effects: [{ kind: "heal", amount: 3, who: "allies" }] },
  ],
  subs: [
    {
      id: "pr_bless",
      name: "축복",
      mods: [{ kind: "status", roll: { status: "attackUp", value: 2, turns: 2 }, to: "auto" }, { kind: "cooldown", turns: 1 }],
    },
    { id: "pr_grace", name: "은총", mods: [{ kind: "heal", pct: 0.1 }] },
    { id: "pr_barrier", name: "신성 방벽", mods: [{ kind: "shieldFromHeal", pct: 0.5 }, { kind: "cooldown", turns: 1 }] },
    {
      id: "pr_punish",
      name: "징벌",
      mods: [{ kind: "status", roll: { status: "weaken", value: 2, turns: 2 }, to: "foe", when: "attack" }, { kind: "power", pct: -0.1 }],
    },
  ],
  races: {
    human: [
      { id: "pr_human_main", name: "신성한 심판", target: "enemy", wait: 1, stat: "faith", effects: [hit(0.8, { bonus: 4 })] },
      {
        id: "pr_human_sub",
        name: "수호의 축언",
        mods: [{ kind: "status", roll: { status: "stunResUp", turns: 2 }, lv: [0.2, 0.3], to: "auto" }, { kind: "cooldown", turns: 1 }],
      },
    ],
    elf: [
      {
        id: "pr_elf_main",
        name: "정령의 축복",
        target: "ally",
        wait: 1,
        effects: [{ kind: "heal", amount: 4 }, st("evadeUp", { value: 0.1, turns: 2 })],
      },
      { id: "pr_elf_sub", name: "생명의 숨결", mods: [{ kind: "later", text: "다음 차례 시작에 체력 {v} 추가 회복", lv: [3, 6] }, { kind: "cooldown", turns: 1 }] },
    ],
    dwarf: [
      {
        id: "pr_dwarf_main",
        name: "화로의 룬",
        target: "ally",
        wait: 1,
        effects: [st("armorUp", { value: 3, turns: 2 }), { kind: "heal", amount: 3 }],
      },
      {
        id: "pr_dwarf_sub",
        name: "불씨의 룬",
        mods: [{ kind: "status", roll: { status: "armorDown", value: 2, turns: 2 }, to: "foe", when: "attack" }, { kind: "power", pct: -0.1 }],
      },
    ],
    beastfolk: [
      {
        id: "pr_beastfolk_main",
        name: "가시 덩굴",
        target: "enemy",
        wait: 1,
        stat: "faith",
        effects: [hit(0.7), st("slow", { value: 2, turns: 2 })],
      },
      {
        id: "pr_beastfolk_sub",
        name: "독초의 축언",
        mods: [{ kind: "status", roll: { status: "poisonVuln", turns: 2 }, lv: [0.2, 0.3], to: "foe", when: "attack" }, { kind: "cooldown", turns: 1 }],
      },
    ],
    barbarian: [
      { id: "pr_barbarian_main", name: "선조의 토템", target: "none", wait: 2, effects: [st("regen", { value: 2, turns: 2, who: "allies" })] },
      {
        id: "pr_barbarian_sub",
        name: "선조의 힘",
        mods: [{ kind: "status", roll: { status: "attackUp", value: 2, turns: 2 }, to: "self" }, { kind: "cooldown", turns: 1 }],
      },
    ],
  },
  ultimate: {
    id: "ult_priest",
    name: "기적",
    target: "none",
    wait: 0,
    effects: [later("빈사인 아군 하나를 체력 50%로 일으킨다 (없으면 아래 회복)"), { kind: "heal", amount: 12, who: "allies" }],
  },
});

// 마법사의 부 조각은 모두 원소 조각이다 (한 스킬에 하나까지. 예외는 game/skills.ts)
const MAGE = jobSet("mage", {
  mains: [
    { id: "mg_bolt", name: "마력탄", target: "enemy", wait: 0, effects: [hit(1)] },
    { id: "mg_burst", name: "마력 폭발", target: "none", wait: 1, effects: [hit(0.6, { area: "all" })] },
    { id: "mg_focus", name: "마력 응축", target: "none", wait: 1, effects: [st("charge", { value: 0.5, turns: 1, who: "self" })] },
    { id: "mg_barrier", name: "마력 방벽", target: "ally", wait: 1, effects: [{ kind: "shield", amount: 5, stat: "mag" }] },
  ],
  subs: [
    { id: "mg_fire", name: "불", element: "fire", mods: [{ kind: "power", pct: 0.1 }, { kind: "selfCost", pctMaxHp: 0.05 }] },
    {
      id: "mg_water",
      name: "물",
      element: "water",
      mods: [
        { kind: "status", roll: { status: "weaken", value: 2, turns: 2 }, to: "foe", when: "attack" },
        { kind: "addHeal", amount: 3, to: "auto", when: "ally" },
        { kind: "power", pct: -0.1 },
      ],
    },
    { id: "mg_wind", name: "바람", element: "wind", mods: [{ kind: "pierce", pct: 0.2 }] },
    { id: "mg_earth", name: "흙", element: "earth", mods: [{ kind: "stunChance", pct: 1, when: "attack" }, { kind: "cooldown", turns: 1 }] },
  ],
  races: {
    human: [
      { id: "mg_human_main", name: "마력 화살", target: "enemy", wait: 1, effects: [hit(0.7, { bonus: 5 })] },
      { id: "mg_human_sub", name: "비전 각인", mods: [{ kind: "later", text: "2턴 동안 대상이 받는 마법 피해 +{v}", lv: [0.1, 0.2], pct: true }, { kind: "cooldown", turns: 1 }] },
    ],
    elf: [
      {
        id: "mg_elf_main",
        name: "정령 폭풍",
        target: "none",
        wait: 2,
        effects: [hit(0.5, { area: "all" }), st("evadeDown", { value: 0.1, turns: 2, area: "all" })],
      },
      { id: "mg_elf_sub", name: "정령 공명", mods: [{ kind: "resonance", power: [0.05, 0.1], boost: [0.1, 0.2] }] },
    ],
    dwarf: [
      { id: "mg_dwarf_main", name: "용암 분출", target: "enemy", wait: 1, effects: [hit(1.2), st("armorDown", { value: 2, turns: 2 })] },
      {
        id: "mg_dwarf_sub",
        name: "바위 각인",
        mods: [{ kind: "status", roll: { status: "slow", turns: 2 }, lv: [2, 4], to: "foe", when: "attack" }, { kind: "cooldown", turns: 1 }],
      },
    ],
  },
  ultimate: {
    id: "ult_mage",
    name: "유성 낙하",
    target: "none",
    wait: 0,
    effects: [hit(1.6, { area: "all" }), st("stun", { who: "self", sure: true })],
  },
});

// 바드: 노래(아군 전체에 거는 강화)는 앙코르·잔향·화음과 어울린다
const MINSTREL = jobSet("minstrel", {
  mains: [
    { id: "mn_discord", name: "불협화음", target: "enemy", wait: 0, stat: "mag", effects: [hit(0.9)] },
    { id: "mn_courage", name: "용기의 노래", target: "none", wait: 1, effects: [st("attackUp", { value: 2, turns: 2, who: "allies" })] },
    { id: "mn_guard", name: "수호의 노래", target: "none", wait: 1, effects: [st("armorUp", { value: 2, turns: 2, who: "allies" })] },
    { id: "mn_lullaby", name: "자장가", target: "enemy", wait: 2, effects: [st("stun", { chance: 0.5 })] },
  ],
  subs: [
    { id: "mn_encore", name: "앙코르", mods: [{ kind: "duration", turns: 1 }, { kind: "cooldown", turns: 1 }] },
    { id: "mn_chord", name: "화음", mods: [{ kind: "addHeal", amount: 2, to: "auto" }, { kind: "power", pct: -0.1 }] },
    { id: "mn_solo", name: "독주", mods: [{ kind: "narrow" }, { kind: "effect", pct: 1 }] },
    { id: "mn_tempo", name: "빠른 박자", mods: [{ kind: "cooldown", turns: -1 }, { kind: "effect", pct: -0.3 }] },
  ],
  races: {
    human: [
      { id: "mn_human_main", name: "행진곡", target: "none", wait: 1, effects: [st("speedUp", { value: 2, turns: 2, who: "allies" })] },
      { id: "mn_human_sub", name: "박자 맞추기", mods: [{ kind: "later", text: "노래를 받은 아군의 다음 공격 고정 피해 +{v}", lv: [2, 4] }, { kind: "cooldown", turns: 1 }] },
    ],
    elf: [
      {
        id: "mn_elf_main",
        name: "정령의 선율",
        target: "ally",
        wait: 1,
        effects: [{ kind: "heal", amount: 4 }, { kind: "cure", count: 1 }],
      },
      {
        id: "mn_elf_sub",
        name: "잔향",
        mods: [{ kind: "status", roll: { status: "regen", turns: 2 }, lv: [1, 3], to: "auto" }, { kind: "cooldown", turns: 1 }],
      },
    ],
    beastfolk: [
      { id: "mn_beastfolk_main", name: "울부짖는 노래", target: "none", wait: 2, effects: [st("slow", { value: 2, turns: 2, area: "all" })] },
      {
        id: "mn_beastfolk_sub",
        name: "불안의 메아리",
        mods: [{ kind: "status", roll: { status: "shaken", turns: 2 }, lv: [0.15, 0.25], to: "allFoes" }, { kind: "cooldown", turns: 1 }],
      },
    ],
    barbarian: [
      {
        id: "mn_barbarian_main",
        name: "전쟁 북",
        target: "none",
        wait: 2,
        effects: [st("attackUp", { value: 3, turns: 2, who: "allies" }), st("armorDown", { value: 1, turns: 2, who: "allies" })],
      },
      {
        id: "mn_barbarian_sub",
        name: "뿔피리",
        mods: [{ kind: "status", roll: { status: "weaken", turns: 1 }, lv: [1, 2], to: "allFoes" }, { kind: "cooldown", turns: 1 }],
      },
    ],
  },
  ultimate: {
    id: "ult_minstrel",
    name: "영웅의 서사시",
    target: "none",
    wait: 0,
    effects: [later("아군 전체가 이번 라운드에 한 번 더 행동하고, 바드는 다음 차례를 쉰다")],
  },
});

// ── 종족 공통 메인 조각 ────────────────────────────────

const RACE_COMMON = [
  ...raceSet("human", [
    { id: "rc_human_aid", name: "응급 처치", target: "ally", wait: 1, effects: [{ kind: "heal", amount: 5 }] },
    { id: "rc_human_sweep", name: "후리기", target: "enemy", wait: 1, effects: [hit(0.7, { area: "two", stat: "str" })] },
    { id: "rc_human_cut", name: "베기", target: "enemy", wait: 0, effects: [hit(1, { stat: "str" })] },
    { id: "rc_human_block", name: "막기", target: "none", wait: 1, effects: [st("toughen", { value: 0.5, turns: 1, who: "self" })] },
  ]),
  ...raceSet("beastfolk", [
    { id: "rc_beast_lick", name: "턴당 회복", hint: "짧고 빠르게", target: "none", wait: 1, effects: [st("regen", { value: 3, turns: 2, who: "self" })] },
    { id: "rc_beast_claw", name: "할퀴기", target: "enemy", wait: 0, effects: [hit(0.8, { stat: "str" }), st("bleed", { chance: 0.4 })] },
    { id: "rc_beast_howl", name: "울부짖기", target: "enemy", wait: 1, effects: [st("weaken", { value: 2, turns: 2 })] },
    {
      id: "rc_beast_dodge",
      name: "회피",
      target: "none",
      wait: 1,
      effects: [st("evadeUp", { value: 0.15, turns: 1, who: "self" }), later("피하면 반격")],
    },
  ]),
  // 드워프 공통에는 회복이 없다
  ...raceSet("dwarf", [
    { id: "rc_dwarf_smash", name: "내려찍기", target: "enemy", wait: 1, effects: [hit(1.4, { stat: "str" })] },
    { id: "rc_dwarf_shove", name: "밀치기", target: "enemy", wait: 1, effects: [hit(0.8, { stat: "str" }), st("slow", { value: 3, turns: 1 })] },
    { id: "rc_dwarf_guard", name: "가드", target: "none", wait: 2, effects: [{ kind: "taunt" }, st("armorUp", { value: 3, turns: 1, who: "self" })] },
    { id: "rc_dwarf_head", name: "머리 치기", target: "enemy", wait: 2, effects: [hit(0.7, { stat: "str" }), st("stun", { chance: 0.5 })] },
  ]),
  ...raceSet("elf", [
    { id: "rc_elf_heal", name: "정령의 치유", target: "ally", wait: 1, effects: [{ kind: "heal", amount: 6 }] },
    { id: "rc_elf_thrust", name: "찌르기", target: "enemy", wait: 0, effects: [hit(1, { stat: "str", critBonus: 0.15 })] },
    {
      id: "rc_elf_dodge",
      name: "회피",
      target: "none",
      wait: 1,
      effects: [st("evadeUp", { value: 0.15, turns: 1, who: "self" }), later("피하면 다음 공격 강화")],
    },
    { id: "rc_elf_spirit", name: "정령 공격", target: "enemy", wait: 0, effects: [hit(1, { stat: "mag" })] },
  ]),
  ...raceSet("barbarian", [
    { id: "rc_barb_regen", name: "턴당 회복", hint: "길고 꾸준하게", target: "none", wait: 2, effects: [st("regen", { value: 2, turns: 4, who: "self" })] },
    { id: "rc_barb_roar", name: "포효", target: "none", wait: 1, effects: [st("weaken", { value: 1, turns: 2, area: "all" })] },
    { id: "rc_barb_sweep", name: "후리기", target: "none", wait: 1, effects: [hit(0.6, { area: "all", stat: "str" })] },
    { id: "rc_barb_swing", name: "휘두르기", target: "enemy", wait: 0, effects: [hit(1.3, { stat: "str" }), { kind: "selfCost", hp: 3 }] },
  ]),
];

/** 직업이 없는 용병(테스트용 등)의 기본 조각. 전수관에서는 다루지 않는다 */
export const NEUTRAL_MAIN: MainFragment = {
  id: "power",
  name: "전력 공격",
  kind: "main",
  target: "enemy",
  wait: 2,
  effects: [hit(1.5)],
  cost: null,
  maxLevel: 1,
};

export const FRAGMENTS: Fragment[] = [...KNIGHT, ...GUARDIAN, ...GREATSWORD, ...ASSASSIN, ...MONK, ...ARCHER, ...PRIEST, ...MAGE, ...MINSTREL, ...RACE_COMMON, NEUTRAL_MAIN];

const BY_ID = new Map(FRAGMENTS.map((f) => [f.id, f]));

export function getFragment(id: string): Fragment | undefined {
  return BY_ID.get(id);
}

/** 직업의 궁극기 조각 id */
export const JOB_ULTIMATE: Record<string, FragmentId> = Object.fromEntries(
  FRAGMENTS.filter((f) => f.kind === "main" && f.ultimate && f.job).map((f) => [f.job!, f.id]),
);

/** 직업의 기본 조각 (스킬이 하나도 없는 용병이 쓴다): 공통 메인의 첫 번째 */
export const JOB_BASIC: Record<string, FragmentId> = Object.fromEntries(
  FRAGMENTS.filter((f) => f.kind === "main" && f.job && !f.race && !f.ultimate)
    .reverse()
    .map((f) => [f.job!, f.id]),
);

/** 부 조각 수치를 레벨에 맞게 (Lv2는 Lv1과 Lv3의 가운데) */
export function scaled(v: Scaled, lv: number): number {
  if (typeof v === "number") return v;
  const [a, b] = v;
  const t = (Math.min(Math.max(lv, 1), MAX_SUB_LEVEL) - 1) / (MAX_SUB_LEVEL - 1);
  return Math.round((a + (b - a) * t) * 1000) / 1000;
}

/** 조각의 재료 (강화 비용에 쓴다): 직업 조각은 직업 재료, 종족 공통 조각은 종족 재료 */
export function materialOf(f: Fragment): string | undefined {
  return f.job ? JOB_MATERIAL[f.job] : f.race ? RACE_MATERIAL[f.race] : undefined;
}

/** 부 조각을 lv로 올리는 비용. 올릴 수 없으면 null */
export function upgradeCost(f: Fragment, lv: number): { gold: number; salvage: Record<string, number> } | null {
  if (f.kind !== "sub" || lv < 2 || lv > MAX_SUB_LEVEL) return null;
  const c = UPGRADE_COST[lv as 2 | 3];
  const material = materialOf(f);
  return { gold: c.gold, salvage: material ? { [material]: c.material } : {} };
}
