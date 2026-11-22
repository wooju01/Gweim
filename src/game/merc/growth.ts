// 성장 규칙 (순수 함수): 경험치를 받아 레벨업하고, 직업 성장표대로 스탯이 붙는다. 단련장 배분 검사.
import {
  DEFAULT_GROWTH,
  GROWTH,
  LEVELS_PER_RANK,
  STAT_ORDER,
  TRAINING_POINTS,
  XP_TO_NEXT,
  type StatBlock,
  type StatKey,
} from "@/data/growth";

/** 용병 하나의 성장 상태 (등급 안의 레벨, 남은 경험치, 쌓인 스탯, 남은 단련 기회) */
export type Growth = { xp: number; lv: number; stats: StatBlock; trainable: number };

export const NO_GROWTH: Growth = { xp: 0, lv: 0, stats: {}, trainable: 0 };

export function addStats(a: StatBlock, b: StatBlock): StatBlock {
  const out: StatBlock = { ...a };
  for (const k of STAT_ORDER) if (b[k]) out[k] = (out[k] ?? 0) + b[k]!;
  return out;
}

/** 다음 레벨까지 필요한 경험치. 등급의 마지막 레벨(1단계)이면 다음 등급 승급에 필요한 경험치 */
export function xpToNext(lv: number): number {
  return XP_TO_NEXT[Math.min(lv, LEVELS_PER_RANK)];
}

/** 등급의 마지막 단계(1단계)인가 */
export function atLastStage(g: Growth): boolean {
  return g.lv >= LEVELS_PER_RANK;
}

/** 승급할 수 있을 만큼 경험치를 채웠나 (등급의 마지막 단계 + 승급용 경험치) */
export function canPromote(g: Growth): boolean {
  return g.lv >= LEVELS_PER_RANK && g.xp >= xpToNext(g.lv);
}

/**
 * 경험치를 더하고, 넘치면 레벨업한다. 레벨업마다 직업 성장표의 스탯이 붙고 단련 기회가 1번 생긴다.
 * 등급의 마지막 레벨에 닿으면 경험치는 더 쌓이지 않는다 (승급 전까지).
 */
export function gainXp(g: Growth, amount: number, job: string | undefined): { growth: Growth; gained: StatBlock[] } {
  const growthTable = (job && GROWTH[job]) || DEFAULT_GROWTH;
  let { xp, lv, stats, trainable } = g;
  const gained: StatBlock[] = [];
  xp += amount;
  for (let need = xpToNext(lv); lv < LEVELS_PER_RANK && xp >= need; need = xpToNext(lv)) {
    xp -= need;
    lv++;
    stats = addStats(stats, growthTable);
    trainable++;
    gained.push(growthTable);
  }
  // 마지막 단계에서는 승급용 경험치까지만 쌓인다
  if (lv >= LEVELS_PER_RANK) xp = Math.min(xp, xpToNext(lv));
  return { growth: { xp, lv, stats, trainable }, gained };
}

/** 단련장 배분이 올바른가: 음이 아닌 정수, 합이 정확히 TRAINING_POINTS */
export function validTraining(alloc: StatBlock): boolean {
  const values = Object.entries(alloc) as [StatKey, number][];
  if (values.some(([k, n]) => !STAT_ORDER.includes(k) || !Number.isInteger(n) || n < 0)) return false;
  return values.reduce((s, [, n]) => s + n, 0) === TRAINING_POINTS;
}

/** "방어 +2, 체력 +1" 같은 줄 */
export function statLine(block: StatBlock, names: Record<StatKey, string>): string {
  return STAT_ORDER.filter((k) => block[k])
    .map((k) => `${names[k]} +${block[k]}`)
    .join(", ");
}
