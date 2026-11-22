// 금화와 상점 수치.
// 원정 전에 상점에서 물자를 사서 짐에 넣고 떠난다. 돌아오면 남은 물자는 짐으로 돌아온다.
// 던전에서 얻은 금화와 유물은 살아서 돌아와야(목적지 귀환·후퇴) 내 것이 된다. 전멸하면 잃는다.
import type { SupplyKind } from "./combat";

export const CURRENCY = "금화";

export const START_GOLD = 120;
/** 처음 짐은 비어 있다 (상점에서 산다) */
export const START_PACK: Record<SupplyKind, number> = { bandage: 0, antidote: 0, potion: 0, greaterPotion: 0 };

// 2026-11-22 밸런스 2차: 붕대 12, 해독제 20, 물약 28, 중급 물약 70 (은 상점부터)
export const PRICE: Record<SupplyKind, number> = { bandage: 12, antidote: 20, potion: 28, greaterPotion: 70 };
/** 원정에 들고 갈 수 있는 물자 수 (떠날 때 창고에서 이만큼까지 챙긴다) */
export const PACK_LIMIT = 10;

/**
 * 창고 (2026-11-22 밸런스 1차): 재료·유실물은 종류별 99개, 물자는 모두 합쳐 20개.
 * 확장할 때마다 종류별 +10칸, 물자 +20개. 확장 비용은 100에서 시작해 한 번마다 +50
 */
export const STORAGE = { itemCap: 99, supplyCap: 20, itemPerLevel: 10, supplyPerLevel: 20, baseCost: 100, costStep: 50 } as const;
export const storageCaps = (level: number) => ({ item: STORAGE.itemCap + STORAGE.itemPerLevel * level, supply: STORAGE.supplyCap + STORAGE.supplyPerLevel * level });
export const storageCost = (level: number) => STORAGE.baseCost + STORAGE.costStep * level;
/** 떠날 때 짐에 챙기는 순서 */
export const PACK_ORDER = ["greaterPotion", "potion", "antidote", "bandage"] as const;

/** 상점 재고 [최소, 최대]. 원정에서 돌아올 때마다 새로 들어온다 */
export const STOCK_RANGE: Record<SupplyKind, readonly [number, number]> = {
  bandage: [3, 6],
  antidote: [1, 4],
  potion: [1, 4],
  // 중급 물약: 길드가 은 이상일 때만 들어온다 (아니면 0)
  greaterPotion: [1, 2],
};

/** 중급 물약이 상점에 나오는 길드 등급 */
export const GREATER_POTION_GRADE = "silver";
export const START_STOCK: Record<SupplyKind, number> = { bandage: 5, antidote: 3, potion: 3, greaterPotion: 0 };

/** 전투에서 이기면 적 한 마리당 금화 [최소, 최대] */
export const BATTLE_GOLD = [4, 8] as const;
/** 보물 칸: 금화 [최소, 최대]와 유물 확률 */
export const TREASURE_GOLD = [10, 25] as const;
export const TREASURE_RELIC_CHANCE = 0.4;
/** 목적지에 닿으면 받는 금화 */
export const GOAL_GOLD = 40;
/** 1층 금화 배율 (목적지 금화, 적 금화): 2026-11-22 밸런스 2차 */
export const FIRST_FLOOR_GOLD = 1.25;

/**
 * 귀환길 습격 (밸런스 2차, 3차에서 확률 조정): 목적지에 닿기 전에 맵에서 후퇴하면 마을로 가기 전에 한 번 판정한다.
 * 후퇴한 층 기준 확률 (1층부터), 그 층 일반 몬스터 [최소, 최대]마리
 */
export const RETREAT_AMBUSH = { chance: [0.05, 0.15, 0.15, 0.15], size: [2, 3] as const };
