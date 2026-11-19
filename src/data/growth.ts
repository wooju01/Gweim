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

/** 직업별 기술 스탯 (스킬에 따로 정하지 않으면 이걸 따른다) */
export const JOB_STAT: Record<string, PowerStat> = {
  knight: "str",
  greatsword: "str",
  assassin: "str",
  archer: "str",
  nun: "faith",
  herbalist: "mag",
  mage: "mag",
  spiritcaller: "mag",
};

/** 레벨업마다 직업별로 자동으로 오르는 스탯 (합 3) */
export const GROWTH: Record<string, StatBlock> = {
  knight: { defense: 2, hp: 1 },
  greatsword: { str: 2, hp: 1 },
  assassin: { speed: 2, str: 1 },
  archer: { str: 1, speed: 1, evade: 1 },
  nun: { faith: 1, speed: 1, hp: 1 },
  herbalist: { mag: 1, hp: 1, speed: 1 },
  mage: { mag: 2, speed: 1 },
  spiritcaller: { mag: 1, evade: 1, hp: 1 },
};
/** 직업이 없는 용병 (테스트용 등) */
export const DEFAULT_GROWTH: StatBlock = { hp: 1, str: 1, defense: 1 };

/** 한 등급 안에서 오를 수 있는 레벨 수. 다 채우면 승급할 수 있다 */
export const LEVELS_PER_RANK = 3;
/** 레벨 n → n+1에 필요한 경험치 */
export const XP_TO_NEXT = [5, 7, 9] as const;

/** 경험치: 지나온 칸 1칸당, 목적지에 닿으면 추가 (살아 돌아온 용병만) */
export const XP_PER_SQUARE = 1;
export const XP_GOAL_BONUS = 3;

/** 승급 비용 (오를 등급별). 전설은 특별한 일로만 오른다 (여기서는 열지 않는다) */
export const PROMOTE_COST = { skilled: 20, veteran: 40 } as const;

/** 단련장: 레벨업 1번마다 기회 1번. 금화를 내고 스탯을 직접 배분한다 */
export const TRAINING_POINTS = 3;
export const TRAINING_COST = 10;
