// 시간 · 비용 · 숙소/클랜 수치. 규칙은 game/state/state.ts(귀환 처리)와 game/clan.ts.
// 하루는 던전에서만 흐른다 (도달한 층수만큼). 마을 시설은 시간이 들지 않는다.
// 수치는 초안이다. 밸런스는 나중에 조정한다.
import type { MercLevel } from "@/lib/schemas";

/**
 * 인원 (2026-11-22 클랜 내실): 숙소(클랜 전)는 고용 용병 INN_LIMIT명까지.
 * 클랜 본부는 클랜원 CLAN_MEMBER_LIMIT명 + 객실 GUEST_ROOMS명 (새로 고용한 용병의 임시 자리).
 * 객실 용병은 고용일로부터 GUEST_DAYS일 안에 클랜에 가입하지 않으면 떠난다 (guestUntilDay)
 */
export const INN_LIMIT = 6;
export const CLAN_MEMBER_LIMIT = 10;
export const GUEST_ROOMS = 4;
export const GUEST_DAYS = 20;
/** 길드에 둘 수 있는 최대 인원 (화면 표시용: 숙소 6 / 클랜 본부 10 + 객실 4) */
export const ROSTER_LIMIT = CLAN_MEMBER_LIMIT + GUEST_ROOMS;

/** 귀환할 때마다 집(숙소·클랜 본부)에서 1:1로 이야기할 수 있는 사람 수 */
export const HOME_TALKS = 2;

/** 정산 주기 (일) */
export const SETTLEMENT_DAYS = 7;

/**
 * 클랜 유지비 (7일 정산마다): 클랜원 수 × 등급별 금액 (2026-11-22). 숙소 시절에는 없다. 시설 유지비는 없다
 */
export const UPKEEP_PER_GRADE: Record<MercLevel, number> = { bronze: 10, silver: 20, gold: 35, mithril: 55, diamond: 80, radiant: 110 };

/** 연체: 1주 연체면 클랜원 전원 호감 하락, 2주 이상이면 정산마다 호감이 가장 낮은 클랜원 한 명이 떠난다 */
export const ARREARS = {
  affinity: -5,
  leaveFrom: 2,
} as const;

/** 클랜 창설에 필요한 가입 의사 (용병 수) */
export const CLAN_FOUNDERS = 5;

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
