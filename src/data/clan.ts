// 시간 · 비용 · 숙소/클랜 수치. 규칙은 game/state/state.ts(귀환 처리)와 game/clan.ts.
// 하루는 던전에서만 흐른다 (도달한 층수만큼). 마을 시설은 시간이 들지 않는다.
// 수치는 초안이다. 밸런스는 나중에 조정한다.

/** 고용할 수 있는 용병·클랜원 수 (원정 파티는 4명, data: game/merc/party.ts의 MERC_SLOTS) */
export const ROSTER_LIMIT = 12;

/** 귀환할 때마다 집(숙소·클랜 본부)에서 1:1로 이야기할 수 있는 사람 수 */
export const HOME_TALKS = 2;

/** 정산 주기 (일) */
export const SETTLEMENT_DAYS = 7;

/**
 * 유지비 (정산마다): base + 클랜원 수 × perMember + facility.
 * 숙소 시절에는 유지비가 없다. perMember는 용병 보수(원정마다 3~24)보다 훨씬 싸다
 */
export const UPKEEP = {
  inn: { base: 0, perMember: 0, facility: 0 },
  clanHall: { base: 100, perMember: 10, facility: 0 },
} as const;

/** 연체: 1주 연체면 클랜원 전원 호감 하락, 2주 이상이면 정산마다 호감이 가장 낮은 클랜원 한 명이 떠난다 */
export const ARREARS = {
  affinity: -5,
  leaveFrom: 2,
} as const;

/** 클랜 창설에 필요한 가입 의사 (용병 수) */
export const CLAN_FOUNDERS = 8;

/**
 * 클랜 가입 제안 수락 확률: 호감 단계 신뢰(75) 이상에서만 제안할 수 있고,
 * 75면 base, 100이면 base + perAffinity × 25. 성격·배경이 더하거나 뺀다 (0~1로 자른다)
 */
export const CLAN_JOIN = {
  minAffinity: 75,
  base: 0.5,
  perAffinity: 0.02,
  temper: {
    honorable: 0.2,
    kind: 0.15,
    devout: 0.1,
    jovial: 0.1,
    easygoing: 0.1,
    optimistic: 0.05,
    greedy: -0.1,
    proud: -0.1,
    cynical: -0.15,
    paranoid: -0.15,
    // 배경
    wanderer: -0.2,
    deserter: -0.1,
    guild_apprentice: 0.1,
  } as Record<string, number>,
} as const;

/** 귀환할 때 집에서 용병 둘의 짧은 일상 장면이 나올 확률 */
export const DAILY_SCENE_CHANCE = 0.4;
