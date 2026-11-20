// 대화 기억 규칙. 언제, 몇 줄을 요약할지는 코드가 정하고, 요약 문장은 AI가 쓴다.
import type { HistoryLine } from "@/lib/schemas";

/** 대화 기록이 이 줄 수에 닿으면 오래된 부분을 기억으로 요약한다 */
export const MEMORY_TRIGGER = 16;
/** 요약 후에도 그대로 남겨 두는 최근 줄 수 */
export const KEEP_RECENT = 8;
/** 기억 요약의 최대 길이 (글자) */
export const MEMORY_MAX_CHARS = 500;

export type FoldPlan = {
  /** 기억으로 접을 오래된 줄 */
  fold: HistoryLine[];
  /** 접은 뒤 대화 기록 앞에서 지울 줄 수 (= fold.length) */
  forget: number;
};

/** 이번 턴에 기억으로 접을 줄. 아직 짧으면 null */
export function planFold(history: readonly HistoryLine[]): FoldPlan | null {
  if (history.length < MEMORY_TRIGGER) return null;
  const fold = history.slice(0, history.length - KEEP_RECENT);
  return { fold, forget: fold.length };
}
