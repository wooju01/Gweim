// 던전 맵 수치. 규칙(game/dungeon/map.ts)과 분리해 여기서만 만진다.

export type RoomKind = "start" | "battle" | "rest" | "event" | "treasure" | "goal";

/** 입구에서 목적지까지 걷는 칸 수. 마지막 칸이 목적지다 */
export const PATH_LENGTH = 7;

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
// 목적지에 닿으면 돌아가거나 더 내려간다. 내려가면 체력·물자·전리품을 그대로 들고 다음 층 새 지도로.

/** 가장 깊은 층 (지금은 여기까지 열려 있다) */
export const MAX_DEPTH = 5;

/** 층이 하나 깊어질 때마다 적: 체력 +15%, 공격 +1, 2층마다 방어 +1 */
export const DEPTH_ENEMY = { hpPerDepth: 0.15, attackPerDepth: 1, defenseEvery: 2 } as const;

/** 층이 하나 깊어질 때마다 금화 보상 +50% (전투·보물·목적지) */
export const DEPTH_GOLD = 0.5;

export function depthGold(depth: number, gold: number): number {
  return Math.round(gold * (1 + DEPTH_GOLD * (depth - 1)));
}
