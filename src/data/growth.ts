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

/** 포인트 1점당 효과 (회피·치명은 확률) */
export const PER_POINT: Record<StatKey, number> = {
  hp: 3,
  defense: 1,
  str: 1,
  speed: 1,
  evade: 0.02,
  mag: 1,
  faith: 1,
  crit: 0.02,
};

export const STAT_EFFECT: Record<StatKey, string> = {
  hp: "최대 체력 +3",
  defense: "받는 피해 -1",
  str: "힘 기술·기본 공격 피해 +1",
  speed: "속도 +1",
  evade: "회피 +2%",
  mag: "마법 기술 피해·보호막 +1",
  faith: "신성 기술 피해 +1, 쓰는 회복 +1",
  crit: "치명타 확률 +2%",
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

/** 레벨업마다 직업별로 자동으로 오르는 스탯 (합 3) */
export const GROWTH: Record<string, StatBlock> = {
  knight: { str: 1, defense: 1, hp: 1 },
  guardian: { hp: 2, defense: 1 },
  greatsword: { str: 2, hp: 1 },
  assassin: { speed: 2, str: 1 },
  monk: { str: 1, speed: 1, hp: 1 },
  archer: { str: 1, speed: 1, evade: 1 },
  priest: { faith: 1, speed: 1, hp: 1 },
  mage: { mag: 2, speed: 1 },
  minstrel: { mag: 1, speed: 1, evade: 1 },
};
/** 직업이 없는 용병 (테스트용 등) */
export const DEFAULT_GROWTH: StatBlock = { hp: 1, str: 1, defense: 1 };

/** 한 등급 안에서 오를 수 있는 레벨 수 (3단계 → 2단계 → 1단계). 다 채우면 승급할 수 있다 */
export const LEVELS_PER_RANK = 2;
/**
 * 레벨 n → n+1에 필요한 경험치. 원정 3번에 한 단계가 목표 (2026-11-21 시뮬레이션):
 * 동3은 1층 목적지 귀환(평균 약 12) × 3, 동2는 2층 목적지 귀환(평균 약 38) × 3
 */
export const XP_TO_NEXT = [20, 110] as const;

/**
 * 1회성 경험치 보너스 (용병마다 한 번, 2026-11-22 밸런스 1차):
 * 처음 살아 돌아온 원정은 경험치 ×2, 처음 도달한 층마다 +10, 처음 보스(층·던전)를 잡은 원정 +20.
 * 전멸하면 받지 못한다 (다음에 받을 수 있다)
 */
export const XP_BONUS = { firstReturnMult: 2, newFloor: 10, firstBoss: 20 } as const;

/** 경험치: 지나온 칸 1칸당, 목적지에 닿으면 추가 (살아 돌아온 용병만) */
export const XP_PER_SQUARE = 1;
export const XP_GOAL_BONUS = 3;

// 승급 비용은 data/ranks.ts의 promoteCost

/**
 * 승급 보너스 (등급이 바뀔 때만. 같은 등급 안의 레벨업은 성장표 +3과 단련장 +3뿐).
 * 다음 등급 구역은 몬스터 체력 배율이 크게 뛰어서(동1 2.5 → 은3 3.6) 그 차이를 메운다. 수치는 초안 (2026-11-22)
 * hp: 체력 포인트 (1점 = 최대 체력 +3), trainable: 단련 기회 추가 (1번 = 포인트 3, 금화는 따로 든다)
 */
export const PROMOTE_BONUS = { hp: 5, trainable: 1 } as const;

/** 단련장: 레벨업 1번마다 기회 1번. 금화를 내고 스탯을 직접 배분한다 */
export const TRAINING_POINTS = 3;
export const TRAINING_COST = 40;
