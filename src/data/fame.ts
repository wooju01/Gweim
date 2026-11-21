// 명성 (2026-11-22). 길드(길안내자)의 이름값. 의뢰를 마치면 오르고, 실패·기한 초과면 내려간다.
// 효과: 의뢰 생성 가중치, 동시 수락 칸, 지명 의뢰 등장, 고용 시장(좋은 용병·고용비 할인), 클랜 가입 확률.
// 수치는 초안이다.

export type FameTier = "unknown" | "known" | "renowned" | "eminent" | "legendary";

/** 명성 단계와 들어서는 값 (낮은 것부터) */
export const FAME_TIERS: { id: FameTier; name: string; min: number }[] = [
  { id: "unknown", name: "무명", min: 0 },
  { id: "known", name: "알려진", min: 20 },
  { id: "renowned", name: "이름난", min: 50 },
  { id: "eminent", name: "명망 있는", min: 100 },
  { id: "legendary", name: "전설적인", min: 200 },
];

/** 명성 소·중·대 */
export const FAME_S = 3;
export const FAME_M = 6;
export const FAME_L = 12;

export const FAME = {
  /** 보스를 처음 쓰러뜨렸다 (보스마다 한 번) */
  bossFirstKill: 5,
  /** 히든 지역을 처음 찾았다 (지역마다 한 번) */
  hiddenFirst: 10,
  /** 의뢰 실패 (포기) */
  fail: -4,
  /** 기한 초과 */
  overdue: -6,
} as const;

/** 동시에 받아 둘 수 있는 직접 의뢰 수 (명성 단계별) */
export const QUEST_SLOTS: Record<FameTier, number> = { unknown: 2, known: 3, renowned: 4, eminent: 4, legendary: 4 };

/** 명성 단계가 하나 오를 때마다: 좋은 의뢰(도전·중요) 가중치 +, 고용 시장 좋은 용병 +, 고용비 할인, 클랜 가입 확률 + */
export const FAME_EFFECT = {
  questWeightPerTier: 0.5,
  recruitTopPerTier: 0.05,
  hireDiscountPerTier: 0.03,
  clanJoinPerTier: 0.03,
} as const;

export function fameTier(fame: number): FameTier {
  let tier: FameTier = "unknown";
  for (const t of FAME_TIERS) if (fame >= t.min) tier = t.id;
  return tier;
}

/** 단계 순서 (무명 0) */
export function fameRank(tier: FameTier): number {
  return FAME_TIERS.findIndex((t) => t.id === tier);
}

export function fameName(fame: number): string {
  return FAME_TIERS.find((t) => t.id === fameTier(fame))!.name;
}
