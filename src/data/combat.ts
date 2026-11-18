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
};

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
 * 밸런스 기준 (4인 파티, 단순 자동 플레이 2000판): 승률 약 90%, 전투당 쓰러지는 용병 1명 안팎.
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
