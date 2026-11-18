// 전투 수치 데이터. 규칙(engine.ts)과 분리해 두어 밸런스를 여기서만 만진다.

export type StatusKind = "bleed" | "poison";
export type SupplyKind = "bandage" | "antidote" | "potion";

/** 공격이 상태이상을 걸 확률 */
export type OnHit = { status: StatusKind; chance: number };

export type UnitStats = {
  hp: number;
  /** 공격 피해 범위 [최소, 최대] */
  attack: readonly [number, number];
  onHit?: OnHit;
};

/** 상태이상: 매 턴 시작에 damage만큼 피해, turns번 지속 */
export const STATUS: Record<StatusKind, { name: string; damage: number; turns: number }> = {
  bleed: { name: "출혈", damage: 3, turns: 3 },
  poison: { name: "중독", damage: 2, turns: 4 },
};

export const CRIT_CHANCE = 0.1;
export const CRIT_MULTIPLIER = 1.5;

/** 직업별 전투 능력 (traits.ts의 직업 id) */
export const JOB_STATS: Record<string, UnitStats> = {
  spearman: { hp: 32, attack: [6, 9] },
  dagger: { hp: 24, attack: [5, 8], onHit: { status: "bleed", chance: 0.4 } },
  nun: { hp: 26, attack: [4, 7] },
  archer: { hp: 24, attack: [6, 10] },
  greatsword: { hp: 36, attack: [8, 12] },
  herbalist: { hp: 22, attack: [4, 7], onHit: { status: "poison", chance: 0.5 } },
  mage: { hp: 20, attack: [4, 7] },
  spiritcaller: { hp: 22, attack: [4, 7] },
};

export type SkillId = "guard" | "pierce" | "pray" | "volley" | "cleave" | "miasma" | "firelance" | "ward" | "power";

/** 스킬 대상: 적 하나, 아군 하나(자신 포함), 대상 없음(자신 또는 적 전체) */
export type SkillTarget = "enemy" | "ally" | "none";

export type Skill = {
  name: string;
  description: string;
  target: SkillTarget;
  /** 쓰고 나서 다시 쓸 수 있을 때까지 기다리는 자기 턴 수 */
  cooldown: number;
};

export const SKILLS: Record<SkillId, Skill> = {
  guard: { name: "막아서기", description: "다음 차례까지 적의 공격을 자신에게 끌어오고, 받는 피해가 절반이 된다", target: "none", cooldown: 2 },
  pierce: { name: "급소 찌르기", description: "적 하나를 공격력 +3으로 찌르고 반드시 출혈을 건다", target: "enemy", cooldown: 2 },
  pray: { name: "기도", description: "아군 하나의 체력을 8 회복하고 출혈과 중독을 씻어 낸다", target: "ally", cooldown: 3 },
  volley: { name: "화살비", description: "모든 적에게 3~5 피해", target: "none", cooldown: 3 },
  cleave: { name: "내려찍기", description: "적 하나에게 1.8배 피해. 반동으로 자신도 3 피해 (쓰러지지는 않는다)", target: "enemy", cooldown: 2 },
  miasma: { name: "독안개", description: "모든 적을 중독시킨다", target: "none", cooldown: 3 },
  firelance: { name: "불꽃 창", description: "적 하나에게 2.5배 피해. 자기 체력 4를 태운다 (쓰러지지는 않는다)", target: "enemy", cooldown: 3 },
  ward: { name: "정령의 가호", description: "아군 하나에게 피해를 먼저 막는 보호막 6. 정령이 답하지 않을 때도 있다 (20%)", target: "ally", cooldown: 2 },
  power: { name: "전력 공격", description: "적 하나에게 1.5배 피해", target: "enemy", cooldown: 3 },
};

export const PIERCE_BONUS = 3;
export const PRAY_HEAL = 8;
export const VOLLEY_DAMAGE = [3, 5] as const;
export const CLEAVE_MULTIPLIER = 1.8;
export const CLEAVE_RECOIL = 3;
export const POWER_MULTIPLIER = 1.5;
export const FIRELANCE_MULTIPLIER = 2.5;
export const FIRELANCE_COST = 4;
export const WARD_SHIELD = 6;
export const WARD_FAIL_CHANCE = 0.2;
/** 막아서기 중에 받는 피해 배율 */
export const GUARD_MULTIPLIER = 0.5;

/** 직업별 스킬 */
export const JOB_SKILL: Record<string, SkillId> = {
  spearman: "guard",
  dagger: "pierce",
  nun: "pray",
  archer: "volley",
  greatsword: "cleave",
  herbalist: "miasma",
  mage: "firelance",
  spiritcaller: "ward",
};
export const DEFAULT_SKILL: SkillId = "power";

/** 직업 정보가 없는 용병 (테스트용 예시 등) */
export const DEFAULT_STATS: UnitStats = { hp: 28, attack: [5, 8] };

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

export type EnemyKind = UnitStats & { id: string; name: string; rarity: number };

/**
 * 오리지널 몬스터. rarity는 등장 가중치.
 * 밸런스 방향: 전투 한 번은 쉽게 이긴다. 난이도는 던전을 이동하며 여러 번 싸우는 동안
 * 체력과 물자가 이어져 깎이는 데서 나온다 (던전 이동 구현 때 체력·물자 이월을 넣는다).
 * 수치를 바꾸면 engine.test.ts의 밸런스 테스트 출력으로 확인한다.
 */
export const ENEMIES: EnemyKind[] = [
  { id: "ash_rat", name: "잿빛 쥐떼", hp: 21, attack: [5, 8], onHit: { status: "bleed", chance: 0.3 }, rarity: 10 },
  { id: "pit_wretch", name: "구덩이 망자", hp: 29, attack: [6, 10], onHit: { status: "poison", chance: 0.35 }, rarity: 8 },
  { id: "rust_warden", name: "녹슨 파수병", hp: 37, attack: [8, 12], rarity: 5 },
  { id: "hollow_hound", name: "속 빈 사냥개", hp: 25, attack: [7, 11], onHit: { status: "bleed", chance: 0.35 }, rarity: 7 },
  { id: "spore_husk", name: "포자 껍데기", hp: 27, attack: [4, 7], onHit: { status: "poison", chance: 0.7 }, rarity: 6 },
];

/** 한 번 전투에 나오는 적 수 [최소, 최대] */
export const ENCOUNTER_SIZE = [3, 5] as const;
