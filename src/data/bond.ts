// 호감도의 쓰임. 고용 의향은 "따라올 것인가", 호감도는 "따라온 뒤 어떻게 행동할 것인가".
// 단계(적대·경계·중립·호의·신뢰)는 game/affinity.ts의 getStage가 정한다.

export const BOND = {
  /** 적대: 이 확률로 명령을 무시하고 아무 적이나 공격한다 */
  disobeyChance: 0.1,
  /** 호의 이상: 길안내자가 건넨 물약 효과 배율 */
  supplyMultiplier: 1.25,
  /** 신뢰: 공격 +1 */
  trustAttack: 1,

  /** 길안내자에게 물자를 받으면 호감 + */
  giftAffinity: 2,
  /** 쓰러졌는데 데리고 귀환하면: 그 용병 호감 +, 함께 돌아온 동료들 호감 + */
  rescuedAffinity: 8,
  rescuerAffinity: 3,

  /** 탐험이 끝난 뒤 적대 단계인 용병이 계약을 깨고 떠날 확률 */
  leaveChance: 0.3,

  /** 전투 중 후퇴: 살아 있는 동행 용병의 기본 호감 변화 (성격이 없으면 0) */
  fleeAffinity: 0,
} as const;

/**
 * 전투 중 후퇴에 대한 성격별 반응 (기본 fleeAffinity에 더한다).
 * 신중 계열은 반기고(+), 호전·자존심 계열은 싫어한다(-). 나머지는 0. 대사는 AI가 만든다 (/api/react)
 */
export const FLEE_TEMPER: Record<string, number> = {
  // 신중
  timid: 5,
  paranoid: 4,
  cynical: 2,
  // 호전·자존심
  proud: -5,
  reckless: -5,
  honorable: -4,
  boastful: -4,
  cruel: -3,
};

/** 성격들의 후퇴 반응 합 (+ 신중, - 호전·자존심) */
export function fleeTemper(personalities: string[] = []): number {
  return personalities.reduce((s, id) => s + (FLEE_TEMPER[id] ?? 0), 0);
}
