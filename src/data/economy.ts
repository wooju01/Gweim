// 금화와 상점 수치.
// 원정 전에 상점에서 물자를 사서 짐에 넣고 떠난다. 돌아오면 남은 물자는 짐으로 돌아온다.
// 던전에서 얻은 금화와 유물은 살아서 돌아와야(목적지 귀환·후퇴) 내 것이 된다. 전멸하면 잃는다.
import type { SupplyKind } from "./combat";

export const CURRENCY = "금화";

export const START_GOLD = 120;
/** 처음 짐은 비어 있다 (상점에서 산다) */
export const START_PACK: Record<SupplyKind, number> = { bandage: 0, antidote: 0, potion: 0 };

export const PRICE: Record<SupplyKind, number> = { bandage: 10, antidote: 15, potion: 20 };
/** 원정 짐에 넣을 수 있는 물자 수 */
export const PACK_LIMIT = 10;

/** 상점 재고 [최소, 최대]. 원정에서 돌아올 때마다 새로 들어온다 */
export const STOCK_RANGE: Record<SupplyKind, readonly [number, number]> = {
  bandage: [3, 6],
  antidote: [1, 4],
  potion: [1, 4],
};
export const START_STOCK: Record<SupplyKind, number> = { bandage: 5, antidote: 3, potion: 3 };

/** 전투에서 이기면 적 한 마리당 금화 [최소, 최대] */
export const BATTLE_GOLD = [4, 8] as const;
/** 보물 칸: 금화 [최소, 최대]와 유물 확률 */
export const TREASURE_GOLD = [10, 25] as const;
export const TREASURE_RELIC_CHANCE = 0.4;
/** 목적지에 닿으면 받는 금화 */
export const GOAL_GOLD = 40;
