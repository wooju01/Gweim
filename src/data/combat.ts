// 전투 수치 데이터. 규칙(engine.ts)과 분리해 두어 밸런스를 여기서만 만진다.

/** bleed·poison은 피해를 주는 상태이상. 나머지는 피해 없는 강화·약화 (패시브가 건다) */
export type StatusKind = "bleed" | "poison" | "crack" | "weaken" | "awaken" | "brace" | "haste";
export type SupplyKind = "bandage" | "antidote" | "potion";

/** 공격이 상태이상을 걸 확률 */
export type OnHit = { status: StatusKind; chance: number };

export type UnitStats = {
  hp: number;
  /** 공격 피해 범위 [최소, 최대] */
  attack: readonly [number, number];
  /** 방어력. 받는 공격 피해에서 그대로 뺀다 (최소 1은 들어간다) */
  defense: number;
  /** 속도. 라운드마다 속도 + 0~SPEED_JITTER가 높은 순서로 행동한다 (용병과 적이 섞인다) */
  speed: number;
  onHit?: OnHit;
};

/**
 * 상태이상. damage가 있으면 그 유닛의 턴 시작에 피해를 주고 1턴 줄어든다.
 * damage가 0인 강화·약화는 그 유닛이 행동을 마칠 때 1턴 줄어든다 (turns번의 행동 동안 유지).
 */
export const STATUS: Record<StatusKind, { name: string; damage: number; turns: number }> = {
  bleed: { name: "출혈", damage: 3, turns: 3 },
  poison: { name: "중독", damage: 2, turns: 4 },
  /** 장인의 눈썰미: 받는 피해 +2 */
  crack: { name: "균열", damage: 0, turns: 2 },
  /** 포효: 공격력 -2 */
  weaken: { name: "위축", damage: 0, turns: 2 },
  /** 사선 돌파: 공격력 +4 */
  awaken: { name: "각성", damage: 0, turns: 2 },
  /** 조합 스킬(드워프 버팀): 방어 +2. 쓴 행동이 끝나면 1이 남아 다음 자기 행동까지 간다 */
  brace: { name: "버팀", damage: 0, turns: 2 },
  /** 조합 스킬(엘프 선제): 다음 라운드에 맨 먼저 행동 */
  haste: { name: "선제", damage: 0, turns: 2 },
};

/** 붕대·해독제·기도로 치료할 수 있는 상태이상 */
export const HARMFUL: StatusKind[] = ["bleed", "poison"];

// ── 종족 패시브 수치 (data/passives.ts의 설명과 맞춘다) ──
export const PASSIVE = {
  rockRootReduce: 1,
  crackChance: 0.2,
  crackBonus: 2,
  steelHeartFactor: 0.5,
  cheerMax: 3,
  cheerMultiplier: 2,
  bloodThirstMax: 5,
  painOblivionMax: 3,
  weakenAmount: 2,
  prideSelfRatio: 0.6,
  prideAllyRatio: 0.3,
  keenEyeCrit: 0.08,
  featherEvade: 0.1,
  firstStrikeMultiplier: 1.5,
  windDanceBonus: 3,
  windDanceEvade: 0.05,
  deepBloodStep: 2,
  deepBloodMax: 3,
  windBlessingSpeed: 3,
  huntersFocusMax: 3,
  chaseRatio: 0.3,
  chaseBonus: 3,
  reflexEvade: 0.08,
  wildRecovery: 1,
  lastStandRatio: 0.25,
  awakenBonus: 4,
  solidarityBonus: 1,
  inSyncMultiplier: 1.5,
  adaptMax: 2,
  braceDefense: 2,
  hasteSpeed: 100,
} as const;

export const CRIT_CHANCE = 0.1;
/** 행동 순서를 정할 때 속도에 더하는 무작위 값의 최대 */
export const SPEED_JITTER = 3;
export const CRIT_MULTIPLIER = 1.5;

/** 직업별 전투 능력 (traits.ts의 직업 id) */
export const JOB_STATS: Record<string, UnitStats> = {
  knight: { hp: 32, attack: [6, 9], defense: 2, speed: 4 },
  assassin: { hp: 24, attack: [5, 8], defense: 0, speed: 8, onHit: { status: "bleed", chance: 0.4 } },
  nun: { hp: 26, attack: [4, 7], defense: 1, speed: 5 },
  archer: { hp: 24, attack: [6, 10], defense: 0, speed: 7 },
  greatsword: { hp: 36, attack: [8, 12], defense: 1, speed: 3 },
  herbalist: { hp: 22, attack: [4, 7], defense: 0, speed: 6, onHit: { status: "poison", chance: 0.5 } },
  mage: { hp: 20, attack: [4, 7], defense: 0, speed: 5 },
  spiritcaller: { hp: 22, attack: [4, 7], defense: 0, speed: 6 },
};

// 스킬은 data/skills.ts에서 효과 조각으로 정의한다
export { DEFAULT_SKILL, JOB_SKILL, JOB_ULTIMATE, SKILLS, SKILL_SLOTS, type Skill, type SkillId, type SkillTarget } from "./skills";
export { getSkill } from "./skillgen";

/** 막아서기 중에 받는 피해 배율 */
export const GUARD_MULTIPLIER = 0.5;

/** 직업 정보가 없는 용병 (테스트용 예시 등) */
export const DEFAULT_STATS: UnitStats = { hp: 28, attack: [5, 8], defense: 1, speed: 5 };

/** 파티 공용 물자. 던전에 들어갈 때 이만큼 들고 간다 */
export const START_SUPPLIES: Record<SupplyKind, number> = {
  bandage: 4,
  antidote: 2,
  potion: 2,
};

export const SUPPLY: Record<SupplyKind, { name: string; description: string }> = {
  bandage: { name: "붕대", description: "출혈을 멈춘다" },
  antidote: { name: "해독제", description: "중독을 푼다" },
  potion: { name: "물약", description: "체력을 12 회복한다" },
};
export const POTION_HEAL = 12;

export type EnemyKind = UnitStats & { id: string; name: string; rarity: number; /** 적 정보에 보이는 특징 한 줄 */ note: string };

/**
 * 오리지널 몬스터. rarity는 등장 가중치.
 * 밸런스 방향: 전투 한 번은 쉽게 이긴다. 난이도는 던전을 이동하며 여러 번 싸우는 동안
 * 체력과 물자가 이어져 깎이는 데서 나온다 (던전 이동 구현 때 체력·물자 이월을 넣는다).
 * 수치를 바꾸면 engine.test.ts의 밸런스 테스트 출력으로 확인한다.
 */
export const ENEMIES: EnemyKind[] = [
  { id: "ash_rat", name: "잿빛 쥐떼", hp: 21, attack: [5, 8], defense: 0, speed: 4, onHit: { status: "bleed", chance: 0.3 }, rarity: 10, note: "떼로 물어뜯어 출혈을 일으킨다." },
  { id: "pit_wretch", name: "구덩이 망자", hp: 29, attack: [6, 10], defense: 1, speed: 1, onHit: { status: "poison", chance: 0.35 }, rarity: 8, note: "썩은 손톱에 독이 묻어 있다." },
  { id: "rust_warden", name: "녹슨 파수병", hp: 37, attack: [8, 12], defense: 3, speed: 0, rarity: 5, note: "녹슬었어도 갑옷이 두껍다. 느리지만 한 방이 무겁다." },
  { id: "hollow_hound", name: "속 빈 사냥개", hp: 25, attack: [7, 11], defense: 0, speed: 5, onHit: { status: "bleed", chance: 0.35 }, rarity: 7, note: "사납게 달려든다. 물리면 피가 잘 멎지 않는다." },
  { id: "spore_husk", name: "포자 껍데기", hp: 27, attack: [4, 7], defense: 1, speed: 0, onHit: { status: "poison", chance: 0.7 }, rarity: 6, note: "굼뜨지만 터지는 포자가 거의 언제나 독을 옮긴다." },
];

/** 한 번 전투에 나오는 적 수 [최소, 최대] */
export const ENCOUNTER_SIZE = [3, 4] as const;
