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
} as const;
