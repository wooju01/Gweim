// 던전 맵 수치. 규칙(game/dungeon/map.ts)과 분리해 여기서만 만진다.

export type RoomKind = "start" | "battle" | "rest" | "event" | "treasure" | "goal";

/** 목적지에 무엇이 있나 (층을 만들 때 정한다). warn: 보스 직전 칸에서 경고 */
export type GoalContent = { kind: "boss"; id: string; warn?: boolean } | { kind: "elite" } | { kind: "treasure" };

/**
 * 입구에서 목적지까지 걷는 칸 수 [최소, 최대] (층마다 무작위). 마지막 칸이 목적지다.
 * 층 번호별 기본값이고, 지역(data/regions.ts)의 cells가 있으면 그쪽을 쓴다
 */
export const FLOOR_CELLS: Record<number, { min: number; max: number }> = {
  1: { min: 7, max: 10 },
  2: { min: 9, max: 12 },
  3: { min: 11, max: 15 },
};
export function floorCells(depth: number): { min: number; max: number } {
  return FLOOR_CELLS[Math.min(depth, 3)] ?? FLOOR_CELLS[3];
}

/** 입구와 목적지 사이 한 단계에 놓이는 갈림길 수 [최소, 최대] */
export const LANES = [2, 3] as const;

/** 어떤 길로 가도 전투가 이 횟수보다 많이 연달아 나오지 않는다 */
export const MAX_BATTLE_RUN = 2;
/** 휴식·사건·보물을 합쳐 이 횟수보다 많이 연달아 나오지 않는다 */
export const MAX_QUIET_RUN = 2;

/** 한 칸에서 다음 단계의 칸 두 곳으로 갈라질 확률 */
export const SPLIT_CHANCE = 0.45;

/** 칸 종류 등장 가중치 (연속 제한을 지키는 안에서 뽑는다) */
export const ROOM_WEIGHTS: Record<"battle" | "rest" | "event" | "treasure", number> = {
  battle: 5,
  rest: 1.5,
  event: 2,
  treasure: 1.5,
};

export const ROOM_NAME: Record<RoomKind, string> = {
  start: "입구",
  battle: "전투",
  rest: "휴식",
  event: "사건",
  treasure: "보물",
  goal: "목적지",
};

/** 휴식: 살아 있는 용병이 최대 체력의 이 비율만큼 회복하고, 출혈·중독이 낫는다 */
export const REST_HEAL_RATIO = 0.3;

/** 보물 칸에서 찾는 물자 수 [최소, 최대]와 종류 가중치 */
export const TREASURE_COUNT = [1, 2] as const;
export const TREASURE_WEIGHTS = { bandage: 4, potion: 3, antidote: 3 } as const;

// ── 층 ──────────────────────────────────────────────────
// 목적지에 닿으면 돌아가거나 다음 갈래(data/regions.ts)로 내려간다. 체력·물자·전리품을 그대로 들고 다음 층 새 지도로.
// 깊은 층의 난이도는 지역의 적 구성으로 올리고, 보상은 층마다 커진다.

// ── 목적지 (층 마지막 칸) ─────────────────────────────
// 지역에 보스가 있으면 boss.chance 확률로 보스 (후보 중 가중치로 하나). 안 나오면 보물이나 정예 전투.
// 무엇이 나올지는 층을 만들 때 미리 정한다 (보스 직전 경고를 띄우려고).

/** 보스가 안 나온 목적지: 보물 / 정예 전투 가중치 */
export const GOAL_FALLBACK = { treasure: 1, elite: 1 } as const;
/** 정예 목적지 전투에서 반드시 정예가 되는 적 수 */
export const GOAL_ELITES = 1;
/** 보물 목적지에서 찾는 물자 수 [최소, 최대]와 유물 수 */
export const GOAL_TREASURE = { supplies: [2, 3] as const, relics: 1 };

// ── 경험치 ─────────────────────────────────────────────
/**
 * 용병 등급이 그 층의 권장 등급보다 몇 등급 위인지에 따른 경험치 배율 (단계는 무시하고 등급만).
 * 같거나 낮음 1.0 / 한 등급 위 0.5 / 두 등급 위 0.1 / 세 등급 이상 0
 */
export const XP_RATE_BY_GAP = [1, 0.5, 0.1, 0] as const;

/** 층이 하나 깊어질 때마다 금화 보상 +50% (전투·보물·목적지) */
export const DEPTH_GOLD = 0.5;

export function depthGold(depth: number, gold: number): number {
  return Math.round(gold * (1 + DEPTH_GOLD * (depth - 1)));
}
