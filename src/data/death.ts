// 죽음 저항. 체력이 0이 된 용병은 바로 죽지 않고 "빈사"로 쓰러진다.
// 정해진 라운드 안에 길안내자가 물약·붕대로 구하거나 전투를 이기면 산다.
// 못 구하면 생존 판정. 확률은 호감·종족·등급이 정한다 (믿는 사람일수록 끝까지 버틴다).
import type { MercLevel, Stage } from "@/lib/schemas";

export const DEATH = {
  /** 쓰러진 뒤 이만큼의 라운드가 시작되면 생존 판정 */
  dyingRounds: 2,
  baseSurvival: 0.5,
  bond: { trusted: 0.25, warm: 0.1, neutral: 0, wary: -0.1, hostile: -0.25 } as Record<Stage, number>,
  race: { barbarian: 0.1, dwarf: 0.05, beastfolk: 0.05, human: 0, elf: -0.05 } as Record<string, number>,
  level: { bronze: 0, silver: 0.03, gold: 0.06, mithril: 0.09, diamond: 0.12, radiant: 0.15 } as Record<MercLevel, number>,
  minSurvival: 0.05,
  maxSurvival: 0.95,
  /** 빈사인 용병에게 붕대를 감아 일으키면 이 체력으로 (물약은 원래 회복량) */
  bandageRevive: 3,
  /** 동료가 죽으면 함께 있던 용병들의 호감 변화 (지켜 주지 못했다) */
  allyAffinity: -5,
} as const;

/** 생존 판정 성공 확률 */
export function survivalChance(u: { bond?: Stage; race?: string; level?: MercLevel }): number {
  const p =
    DEATH.baseSurvival +
    (u.bond ? DEATH.bond[u.bond] : 0) +
    (u.race ? (DEATH.race[u.race] ?? 0) : 0) +
    (u.level ? DEATH.level[u.level] : 0);
  return Math.max(DEATH.minSurvival, Math.min(DEATH.maxSurvival, p));
}
