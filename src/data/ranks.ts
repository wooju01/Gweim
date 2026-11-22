// 용병 등급: 동 → 은 → 금 → 미스릴 → 다이아 → 성휘. 등급마다 3단계(3 → 2 → 1), 모두 18단계.
// 단계 오름 = 레벨업, 1단계에서 다음 등급으로 = 승급 (길드 창구, data/guild.ts).
// 수치는 초안이다. 밸런스는 나중에 시뮬레이션으로 조정한다.
import type { MercLevel } from "@/lib/schemas";

export const RANK_ORDER: MercLevel[] = ["bronze", "silver", "gold", "mithril", "diamond", "radiant"];

export type Rank = {
  name: string;
  /** 가질 수 있는 종족 패시브 수 */
  maxPassives: number;
  /** 스킬 하나에 끼울 수 있는 부 조각 수 */
  subLimit: number;
  /** 직업 단계: 1차(기본) / 2차 전직 / 3차 / 4차 최종 */
  tier: 1 | 2 | 3 | 4;
  /** 궁극기 칸이 열려 있나 */
  ultimate: boolean;
  /** 이 등급으로 승급하는 비용 (금화). 처음 등급은 null */
  promoteCost: number | null;
};

export const RANKS: Record<MercLevel, Rank> = {
  bronze: { name: "동", maxPassives: 1, subLimit: 1, tier: 1, ultimate: false, promoteCost: null },
  silver: { name: "은", maxPassives: 2, subLimit: 2, tier: 1, ultimate: false, promoteCost: 150 },
  // 금: 2차 전직(두 갈래 중 선택) + 궁극기 칸
  gold: { name: "금", maxPassives: 3, subLimit: 2, tier: 2, ultimate: true, promoteCost: 400 },
  // 미스릴: 새 궁극기 (목록 미정)
  mithril: { name: "미스릴", maxPassives: 3, subLimit: 2, tier: 2, ultimate: true, promoteCost: 700 },
  diamond: { name: "다이아", maxPassives: 4, subLimit: 2, tier: 3, ultimate: true, promoteCost: 1100 },
  // 성휘: 4차 최종 직업 (+ AI 이명, 나중에)
  radiant: { name: "성휘", maxPassives: 5, subLimit: 2, tier: 4, ultimate: true, promoteCost: 1600 },
};

/** 한 등급의 단계 수 (3 → 2 → 1) */
export const STAGES_PER_RANK = 3;

/** 모집에 나오는 등급. 명성(renown)이 생기면 좋은 등급 확률이 오른다 */
export const RECRUIT_LEVEL: MercLevel = "bronze";

/** 막 모집한 용병이 패시브 하나를 갖고 시작할 확률 (아니면 0개) */
export const RECRUIT_PASSIVE_CHANCE = 0.5;

/** 다음 등급. 마지막 등급이면 null */
export function nextRank(level: MercLevel): MercLevel | null {
  return RANK_ORDER[RANK_ORDER.indexOf(level) + 1] ?? null;
}

/** 등급 안의 레벨(0부터) → 표시 단계 (3, 2, 1) */
export function stageOf(lv: number): number {
  return STAGES_PER_RANK - Math.min(lv, STAGES_PER_RANK - 1);
}

/** "동 3단계" */
export function rankLabel(level: MercLevel, lv = 0): string {
  return `${RANKS[level].name} ${stageOf(lv)}단계`;
}

/** 등급 + 단계 ("bronze2" = 동 2단계). 구역 권장 등급과 몬스터 배율(data/combat.ts의 REGION_SCALE)에 쓴다 */
export type StageKey = `${MercLevel}${1 | 2 | 3}`;

export function parseStage(key: StageKey): { level: MercLevel; stage: number } {
  return { level: key.slice(0, -1) as MercLevel, stage: Number(key.slice(-1)) };
}

/** "동2" */
export function stageName(key: StageKey): string {
  const { level, stage } = parseStage(key);
  return `${RANKS[level].name}${stage}`;
}
