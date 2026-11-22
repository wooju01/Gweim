// 클랜 시설 (2026-11-22 클랜 내실). 숙소 시절 3칸, 클랜 본부 7칸 (칸이 차면 새로 지을 수 없다. 레벨 올리기는 칸을 쓰지 않는다).
// 레벨 1~3 (대장간만 5). 2레벨은 길드 은, 3레벨은 길드 금 이상. 시설 유지비는 없다 (클랜 유지비로 대신한다).
// 규칙은 game/state/state.ts(buildFacility, 출발·귀환), 효과를 쓰는 곳은 각 줄의 주석.
import type { SupplyKind } from "./combat";
import type { MercLevel } from "@/lib/schemas";

export type FacilityId = "infirmary" | "training" | "bag" | "warRoom" | "tavern" | "memorial" | "forge";

export type Facility = {
  id: FacilityId;
  name: string;
  /** 레벨별 효과 한 줄 (1레벨부터) */
  levels: string[];
  /** 레벨별 비용 (1레벨부터) */
  cost: number[];
  /** 레벨별 필요한 길드 등급 (1레벨부터) */
  grade: MercLevel[];
};

/** 시설 칸 */
export const FACILITY_SLOTS = { inn: 3, clanHall: 7 } as const;
/** 기본 시설 가격 (1~3레벨) */
export const FACILITY_COST = [300, 800, 2000] as const;
/** 기본 시설 필요 길드 등급 (1~3레벨) */
export const FACILITY_GRADE: MercLevel[] = ["bronze", "silver", "gold"];

/** 의무실: 원정 출발 때 무료 물자 (가방에 넣는다) */
export const INFIRMARY: Partial<Record<SupplyKind, number>>[] = [{ bandage: 1 }, { bandage: 1, potion: 1 }, { bandage: 2, potion: 1 }];
/** 훈련장: 새로 고용한 용병(고용 NEW_HIRE_DAYS일 안)이 받는 경험치 + */
export const TRAINING_XP = [0.2, 0.35, 0.5] as const;
export const NEW_HIRE_DAYS = 20;
/** 가방: 기본 칸 수, 시설 레벨별 칸 수 */
export const BAG_BASE = 8;
export const BAG_SLOTS = [10, 13, 16] as const;
/** 주점 확장: 모집 때 더 오는 용병, 좋은 성격이 잘 나온다(2레벨~), 높은 등급이 잘 나온다(3레벨) */
export const TAVERN = [
  { extra: 1, goodTemper: false, topBonus: 0 },
  { extra: 2, goodTemper: true, topBonus: 0 },
  { extra: 3, goodTemper: true, topBonus: 0.2 },
] as const;
/** 위령비: 동료가 죽었을 때 다른 용병의 호감 하락 배율(1레벨~), 유산 전수 가능 횟수 (레벨별 누적) */
export const MEMORIAL = { allyAffinityMul: 0.5, legacies: [0, 1, 2] } as const;
/** 대장간: 레벨별로 만들 수 있는 장비 등급 (레벨 0 = 마을 대장간, 동 등급만) */
export const FORGE_TIER: MercLevel[] = ["bronze", "silver", "gold", "mithril", "diamond", "radiant"];

export const FACILITIES: Facility[] = [
  { id: "infirmary", name: "의무실", levels: ["원정 출발 때 무료 붕대 1", "붕대 1 + 물약 1", "붕대 2 + 물약 1"], cost: [...FACILITY_COST], grade: FACILITY_GRADE },
  { id: "training", name: "훈련장", levels: ["새로 고용한 용병 경험치 +20%", "+35%", "+50%"], cost: [...FACILITY_COST], grade: FACILITY_GRADE },
  { id: "bag", name: "가방", levels: ["가방 10칸 (기본 8칸)", "13칸", "16칸"], cost: [...FACILITY_COST], grade: FACILITY_GRADE },
  { id: "warRoom", name: "전술실", levels: ["만난 보스의 예고 패턴 미리 보기", "+ 보스 약점 정보", "+ 사건 선택지 성공 확률 표시"], cost: [...FACILITY_COST], grade: FACILITY_GRADE },
  { id: "tavern", name: "주점 확장", levels: ["고용 시장 용병 +1명", "+2명, 좋은 성격이 잘 나온다", "+3명, 높은 등급이 잘 나온다"], cost: [...FACILITY_COST], grade: FACILITY_GRADE },
  {
    id: "memorial",
    name: "위령비",
    levels: ["죽은 용병의 이름·사망 장소·마지막 전투를 새긴다. 동료가 죽어도 호감 하락이 절반", "유산 1개: 죽은 용병의 강화된 부 조각을 같은 직업 용병에게 전수", "유산 2개까지"],
    cost: [...FACILITY_COST],
    grade: FACILITY_GRADE,
  },
  {
    id: "forge",
    name: "대장간",
    levels: ["은 등급 장비 제작", "금 등급 장비 제작", "미스릴 등급 장비 제작", "다이아 등급 장비 제작", "성휘 등급 장비 제작"],
    cost: [300, 800, 2000, 4000, 7000],
    grade: ["silver", "gold", "mithril", "diamond", "radiant"],
  },
];

export function getFacility(id: FacilityId): Facility {
  return FACILITIES.find((f) => f.id === id)!;
}

/** 시설 레벨 (지은 적 없으면 0) */
export type FacilityLevels = Partial<Record<FacilityId, number>>;

/** 가방 칸 수 */
export function bagSlots(levels: FacilityLevels): number {
  const lv = levels.bag ?? 0;
  return lv > 0 ? BAG_SLOTS[lv - 1] : BAG_BASE;
}

/** 가방 겹치기: 재료·유실물 한 칸 STACK.item개, 물약·붕대·해독제 한 칸 STACK.supply개. 유물·히든 열쇠는 한 칸에 하나 */
export const STACK = { item: 5, supply: 3 } as const;

/** 길잡이 능력: 다음 칸의 내용(몬스터 구성·사건)을 미리 알 확률. 칸마다 판정, 길드 등급 기준 */
export const SCOUT_CHANCE: Record<MercLevel, number> = { bronze: 0.15, silver: 0.25, gold: 0.4, mithril: 0.6, diamond: 0.8, radiant: 1 };
