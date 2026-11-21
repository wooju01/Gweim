// 쓰러짐·사망 (2026-11-22, 하드코어 방향).
// 체력이 0이 된 용병은 바로 죽지 않고 쓰러진다 (downed). 쓰러진 용병의 차례가 돌아올 때마다 1 줄고, 0이 되면 영구 사망.
// 버티는 차례: 기본 1, 호감 신뢰 +1, 적대 -1 (0이면 쓰러지는 즉시 사망). 종족·등급 보정은 없다.
// 일으키기: 쓰러진 아군에게 한 명 대상 회복 스킬이나 물약을 쓰면 그 회복량으로 일어난다 (전체 회복·붕대로는 못 일으킨다).
// 버티는 동안 전투를 이기면 체력 1로 산다. 전투 중 후퇴하면 쓰러진 용병은 남겨져 죽는다. 서 있는 용병이 0명이면 전멸, 쓰러진 용병도 모두 죽는다.
import type { Stage } from "@/lib/schemas";

export const DEATH = {
  /** 쓰러진 채 버티는 차례 (기본) */
  downedTurns: 1,
  /** 호감에 따른 버티는 차례 보정 */
  bond: { trusted: 1, hostile: -1 } as Partial<Record<Stage, number>>,
  /** 사제 궁극기 "기적": 쓰러진 아군을 최대 체력의 이만큼으로 일으킨다 */
  miracleRevive: 0.5,
  /** 동료가 죽으면 함께 있던 용병들의 호감 변화 (지켜 주지 못했다) */
  allyAffinity: -5,
} as const;

/** 쓰러진 채 버티는 차례 (0이면 쓰러지는 즉시 사망) */
export function downedTurns(u: { bond?: Stage }): number {
  return Math.max(0, DEATH.downedTurns + (u.bond ? (DEATH.bond[u.bond] ?? 0) : 0));
}
