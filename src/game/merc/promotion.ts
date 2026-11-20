// 등급 승급 (순수 함수). 등급의 1단계(마지막 레벨)를 채우면 단련장에서 다음 등급으로 승급한다.
// 패시브는 종족 후보 2개 중 하나 (등급의 패시브 칸이 남아 있으면).
// 금으로 오를 때 2차 전직 갈래를 하나 고르고(원소술사면 원소 둘도) 직업 궁극기가 열린다.
// 후보는 용병 id와 지금 등급으로 정해져서 언제 다시 봐도 같다.
import { JOB_ULTIMATE } from "@/data/fragments";
import { BRANCHES, type Branch, type JobId } from "@/data/jobs";
import { passivesOf } from "@/data/passives";
import { RANKS, nextRank } from "@/data/ranks";
import { Element, type MercLevel, type MercSeed } from "@/lib/schemas";
import { createRng } from "@/game/random";

export { nextRank };

/** 다음 등급으로 오르는 비용. 마지막 등급이면 null */
export function promoteCost(level: MercLevel): number | null {
  const next = nextRank(level);
  return next ? RANKS[next].promoteCost : null;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

export type PromotionChoices = {
  next: MercLevel | null;
  /** 패시브 후보 (최대 2개, 이미 가진 것 제외. 다음 등급의 칸이 꽉 찼으면 비어 있다) */
  passives: string[];
  /** 2차 전직 갈래 (금으로 오를 때만) */
  branches: Branch[];
};

export function promotionChoices(seed: MercSeed): PromotionChoices {
  const next = nextRank(seed.level);
  if (!next) return { next: null, passives: [], branches: [] };
  const rng = createRng(hash(`${seed.id}:${seed.level}`));
  const shuffle = <T,>(xs: T[]) =>
    xs
      .map((x) => ({ x, k: rng.next() }))
      .sort((a, b) => a.k - b.k)
      .map((p) => p.x);
  const room = seed.passives.length < RANKS[next].maxPassives;
  const passives = room ? shuffle(passivesOf(seed.traits.race).map((p) => p.id).filter((id) => !seed.passives.includes(id))).slice(0, 2) : [];
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
    passives: choice.passive && options.passives.length > 0 ? [...seed.passives, choice.passive] : seed.passives,
    ...(branch ? { branch } : {}),
    ...(elements ? { elements } : {}),
    // 궁극기 칸이 열리면 직업 궁극기
    ultimate: seed.ultimate ?? (RANKS[next].ultimate ? JOB_ULTIMATE[seed.traits.job] : undefined),
  };
}
