// 성장: 경험치, 레벨업, 스탯 포인트, 단련장.
// 레벨업 스탯은 직업 성장표대로 자동으로 오르고, 단련장 스탯은 플레이어가 직접 배분한다.
// 수치는 초안이다. 밸런스는 나중에 시뮬레이션으로 조정한다.

export type StatKey = "hp" | "defense" | "str" | "speed" | "evade" | "mag" | "faith" | "crit";
export type StatBlock = Partial<Record<StatKey, number>>;

export const STAT_ORDER: StatKey[] = ["hp", "defense", "str", "speed", "evade", "mag", "faith", "crit"];

export const STAT_NAME: Record<StatKey, string> = {
  hp: "체력",
  defense: "방어",
  str: "힘",
  speed: "속도",
  evade: "회피",
  mag: "마법",
  faith: "신성",
  crit: "치명",
};

/**
 * 포인트 1점당 값. 체력·힘·마법·신성·속도는 고정값 그대로.
 * 방어·회피·치명은 포인트(p)를 그대로 쌓고, 효과는 STAT_CURVE의 체감 곡선으로 정한다 (2026-11-22)
 */
export const PER_POINT: Record<StatKey, number> = {
  hp: 3,
  defense: 1,
  str: 1,
  speed: 1,
  evade: 1,
  mag: 1,
  faith: 1,
  crit: 1,
};

/** 체감 곡선을 쓰는 스탯 */
export type CurveStat = "defense" | "evade" | "crit";

/**
 * 방어·회피·치명의 체감 곡선: 효과 = base + max × p / (p + k). p = 직업 기본값 + 찍은 점수 + 장신구 점수 (음수는 0).
 * 장신구의 퍼센트 효과(받는 피해 -%, 회피 +%, 치명 +%)는 곡선 값에 그대로 더하고, 마지막에 cap으로 자른다.
 * 방어: 받는 피해 감소 %. 방어 무시는 이 감소 %에 (1 - 방어 무시)를 곱한다. 몬스터 방어도 같은 곡선
 */
export const STAT_CURVE: Record<CurveStat, { base: number; max: number; k: number; cap: number }> = {
  defense: { base: 0, max: 0.7, k: 15, cap: 0.8 },
  evade: { base: 0, max: 0.5, k: 20, cap: 0.6 },
  crit: { base: 0.1, max: 0.6, k: 25, cap: 0.8 },
};

/** 곡선 효과 (base 포함, cap 전) */
export function curveValue(stat: CurveStat, p: number): number {
  const c = STAT_CURVE[stat];
  const x = Math.max(0, p);
  return c.base + (c.max * x) / (x + c.k);
}

/** 곡선 효과에서 base를 뺀 몫 (회피·치명 보너스, 받는 피해 감소) */
export function curveBonus(stat: CurveStat, p: number): number {
  return curveValue(stat, p) - STAT_CURVE[stat].base;
}

/** 다음 1점을 더 찍으면 오르는 효과 (툴팁용) */
export function nextPointGain(stat: CurveStat, p: number): number {
  return curveValue(stat, p + 1) - curveValue(stat, p);
}

export const STAT_EFFECT: Record<StatKey, string> = {
  hp: "최대 체력 +3",
  defense: "받는 피해 감소 % (체감, 최대 70%)",
  str: "힘 기술·기본 공격 피해 +1",
  speed: "속도 +1",
  evade: "회피 % (체감, 최대 50%)",
  mag: "마법 기술 피해·보호막 +1",
  faith: "신성 기술 피해 +1, 쓰는 회복 +1",
  crit: "치명타 % (기본 10%, 체감, 최대 +60%)",
};

/** 기술이 따르는 스탯 */
export type PowerStat = "str" | "mag" | "faith";

/** 직업별 기술 스탯 (조각에 따로 정하지 않으면 이걸 따른다) */
export const JOB_STAT: Record<string, PowerStat> = {
  knight: "str",
  guardian: "str",
  greatsword: "str",
  assassin: "str",
  monk: "str",
  archer: "str",
  priest: "faith",
  mage: "mag",
  minstrel: "mag",
};

/** 레벨업마다 직업별로 자동으로 오르는 스탯 (합 5, 2026-11-22: 3 → 5). 단련장은 3 그대로 */
export const GROWTH: Record<string, StatBlock> = {
  knight: { str: 2, defense: 1, hp: 2 },
  guardian: { hp: 3, defense: 2 },
  greatsword: { str: 3, hp: 2 },
  assassin: { speed: 2, str: 1, crit: 1, hp: 1 },
  monk: { str: 2, speed: 1, hp: 2 },
  archer: { str: 2, speed: 1, evade: 1, hp: 1 },
  priest: { faith: 2, speed: 1, hp: 2 },
  mage: { mag: 3, speed: 1, hp: 1 },
  minstrel: { mag: 2, speed: 1, evade: 1, hp: 1 },
};
/** 레벨업 성장 합 */
export const GROWTH_POINTS = 5;
/** 직업이 없는 용병 (테스트용 등) */
export const DEFAULT_GROWTH: StatBlock = { hp: 2, str: 2, defense: 1 };

/** 한 등급 안에서 오를 수 있는 레벨 수 (3단계 → 2단계 → 1단계). 다 채우면 승급할 수 있다 */
export const LEVELS_PER_RANK = 2;
/**
 * 레벨 n → n+1에 필요한 경험치. 원정 3번에 한 단계가 목표 (2026-11-21 시뮬레이션):
 * 동3은 1층 목적지 귀환(평균 약 12) × 3, 동2는 2층 목적지 귀환(평균 약 38) × 3
 */
// 2026-11-22 밸런스 2차: 3단계→2단계 15, 2단계→1단계 75, 1단계에서 다음 등급 승급용 170 (1단계에서도 경험치가 쌓인다).
// 은 이후 등급도 같은 방식 (값은 나중에 정한다. 지금은 같은 표를 쓴다). 1회성 보너스는 없앴다
export const XP_TO_NEXT = [15, 75, 170] as const;

/** 경험치: 지나온 칸 1칸당, 목적지에 닿으면 추가 (살아 돌아온 용병만) */
export const XP_PER_SQUARE = 1;
export const XP_GOAL_BONUS = 3;

// 승급 비용은 data/ranks.ts의 promoteCost

/**
 * 승급 보너스 (등급이 바뀔 때만. 같은 등급 안의 레벨업은 성장표 +5와 단련장 +3뿐).
 * 다음 등급 구역은 몬스터 체력 배율이 크게 뛰어서(동1 2.5 → 은3 3.6) 그 차이를 메운다. 수치는 초안 (2026-11-22)
 * hp: 체력 포인트 (1점 = 최대 체력 +3), trainable: 단련 기회 추가 (1번 = 포인트 3, 금화는 따로 든다)
 */
export const PROMOTE_BONUS = { hp: 5, trainable: 1 } as const;

/** 단련장: 레벨업 1번마다 기회 1번. 금화를 내고 스탯을 직접 배분한다 */
export const TRAINING_POINTS = 3;
/** 단련 비용 = TRAINING_COST + 그 용병이 단련한 횟수 × TRAINING_STEP (2026-11-22) */
export const TRAINING_COST = 40;
export const TRAINING_STEP = 10;
export function trainingCost(trainings: number): number {
  return TRAINING_COST + Math.max(0, trainings) * TRAINING_STEP;
}
