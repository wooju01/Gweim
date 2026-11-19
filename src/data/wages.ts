// 보수와 조건 제시 수치.
// 보수: 원정이 끝날 때마다 살아 있는 동행 용병에게 준다. 모자라면 체불 (호감이 떨어진다).
// 조건 제시: 길드 대화에서 용병마다 한 번씩. 선금(지금 금화를 낸다)과 몫 약속(앞으로 보수를 더 준다).
// 돈 얘기를 어떻게 받아들이는지는 성격·배경이 정한다.
import type { MercLevel } from "../lib/schemas";

export const WAGE = {
  /**
   * 등급별 원정 1회 보수. 낮게 둔다: 나중에 스킬·단련장·대장간에서 금화가 많이 나가기 때문 (2026-11-19)
   */
  base: { apprentice: 3, skilled: 5, veteran: 8, legend: 13 } as Record<MercLevel, number>,
  /** 특성별 보수 추가 (탐욕스러우면 더 달라고 한다) */
  extra: { greedy: 1, debtor: 1 } as Record<string, number>,
  /** 선금 = 보수 × 이 배수 */
  advanceMultiple: 2,
  /** 몫 약속: 앞으로 보수 배율 */
  shareMultiplier: 1.5,
  /** 조건 제시의 기본 고용 의향 상승 */
  advanceWillingness: 20,
  shareWillingness: 15,
  /** 보수를 못 받으면 호감 변화 */
  unpaidAffinity: -10,
} as const;

/**
 * 돈 얘기에 대한 반응. mult: 고용 의향 상승 배율, affinity: 호감 변화, note: 속마음 (AI에게 준다).
 * 성격 1~2개와 배경의 배율은 곱하고, 호감은 더한다. 없는 특성은 그대로(배율 1, 호감 0).
 */
export const PAY_TEMPER: Record<string, { mult: number; affinity: number; note?: string }> = {
  greedy: { mult: 1.6, affinity: 3, note: "돈 얘기라면 언제든 환영이다." },
  debtor: { mult: 1.5, affinity: 2, note: "빚을 갚을 돈이 절실하다." },
  cynical: { mult: 1.2, affinity: 0, note: "말보다 돈이 정직하다." },
  jovial: { mult: 1.0, affinity: 1 },
  rude: { mult: 1.1, affinity: 0 },
  cruel: { mult: 1.1, affinity: 0 },
  timid: { mult: 1.1, affinity: 0 },
  kind: { mult: 0.8, affinity: 0, note: "돈 때문에 가는 건 아니다." },
  paranoid: { mult: 0.7, affinity: -2, note: "공짜 돈에는 꿍꿍이가 있다." },
  proud: { mult: 0.7, affinity: -3, note: "돈으로 사려 드는 게 불쾌하다." },
  devout: { mult: 0.6, affinity: -2, note: "재물로 마음을 사려 한다." },
  honorable: { mult: 0.5, affinity: -4, note: "약속은 돈이 아니라 말로 하는 것이다." },
};
