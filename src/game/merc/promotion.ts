// 등급 승급 (순수 함수). 등급의 1단계(마지막 레벨)를 채우면 길드 창구에서 다음 등급으로 승급한다 (조건은 game/state/state.ts의 promotionBlocks).
// 패시브: 은으로 오를 때 은 A/B 중 하나, 금(2차 전직)으로 오를 때 금 A/B 중 하나 (2차 갈래와 상관없이).
// 금으로 오를 때 2차 전직 갈래를 하나 고르고(원소술사면 원소 둘도) 직업 궁극기가 열린다.
// 후보는 직업·종족·등급으로 정해져서 언제 다시 봐도 같다.
import { JOB_ULTIMATE } from "@/data/fragments";
import { BRANCHES, type Branch, type JobId } from "@/data/jobs";
import { fusionChoices } from "@/data/passives";
import { RANKS, nextRank } from "@/data/ranks";
import { Element, type MercLevel, type MercSeed } from "@/lib/schemas";

export { nextRank };

/** 다음 등급으로 오르는 비용. 마지막 등급이면 null */
export function promoteCost(level: MercLevel): number | null {
  const next = nextRank(level);
  return next ? RANKS[next].promoteCost : null;
}

export type PromotionChoices = {
  next: MercLevel | null;
  /** 패시브 후보: 은이면 은 A/B, 금이면 금 A/B (그 직업·종족). 그 밖의 등급이면 비어 있다 */
  passives: string[];
  /** 2차 전직 갈래 (금으로 오를 때만) */
  branches: Branch[];
};

export function promotionChoices(seed: MercSeed): PromotionChoices {
  const next = nextRank(seed.level);
  if (!next) return { next: null, passives: [], branches: [] };
  const tier = next === "silver" ? "silver" : next === "gold" ? "gold" : null;
  const has = tier === "silver" ? seed.passiveSilver : tier === "gold" ? seed.passiveGold : undefined;
  const passives = tier && !has ? fusionChoices(seed.traits.job, seed.traits.race, tier).map((p) => p.id) : [];
  const branches = RANKS[next].tier >= 2 && !seed.branch ? [...(BRANCHES[seed.traits.job as JobId] ?? [])] : [];
  return { next, passives, branches };
}

/**
 * 승급을 적용한 새 시드. 후보가 있으면 그중에서 골라야 한다. 안 되면 null.
 * elements: 원소술사를 고를 때 함께 고르는 원소 둘
 */
export function promote(seed: MercSeed, choice: { passive?: string; branch?: string; elements?: Element[] }): MercSeed | null {
  const options = promotionChoices(seed);
  const next = options.next;
  if (!next) return null;
  if (options.passives.length > 0 && (!choice.passive || !options.passives.includes(choice.passive))) return null;
  let branch = seed.branch;
  let elements = seed.elements;
  if (options.branches.length > 0) {
    const picked = options.branches.find((b) => b.id === choice.branch);
    if (!picked) return null;
    branch = picked.id;
    if (picked.dualElement) {
      const els = choice.elements ?? [];
      if (els.length !== 2 || els[0] === els[1] || !els.every((e) => Element.options.includes(e))) return null;
      elements = [...els];
    }
  }
  return {
    ...seed,
    level: next,
    ...(choice.passive && options.passives.length > 0 ? (next === "silver" ? { passiveSilver: choice.passive } : { passiveGold: choice.passive }) : {}),
    ...(branch ? { branch } : {}),
    ...(elements ? { elements } : {}),
    // 궁극기 칸이 열리면 직업 궁극기
    ultimate: seed.ultimate ?? (RANKS[next].ultimate ? JOB_ULTIMATE[seed.traits.job] : undefined),
  };
}
