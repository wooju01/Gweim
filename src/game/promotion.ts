// 등급 승급 (순수 함수). 레벨 3을 채우면 단련장에서 승급한다.
// 패시브는 종족 후보 2개 중 하나, 스킬은 후보 2개 중 하나를 고른다. 숙련이 되면 직업 궁극기가 열린다.
// 후보는 용병 id와 지금 등급으로 정해져서 언제 다시 봐도 같다.
import { comboId, VARIANTS } from "../data/combo";
import { PROMOTE_COST } from "../data/growth";
import { passivesOf } from "../data/passives";
import { JOB_ULTIMATE, skillsFrom } from "../data/skills";
import type { MercLevel, MercSeed } from "../lib/schemas";
import { createRng } from "./random";

const RANKS: MercLevel[] = ["apprentice", "skilled", "veteran", "legend"];

/** 다음 등급. 전설은 승급으로 오르지 않는다 (null) */
export function nextRank(level: MercLevel): Exclude<MercLevel, "apprentice" | "legend"> | null {
  const next = RANKS[RANKS.indexOf(level) + 1];
  return next === "skilled" || next === "veteran" ? next : null;
}

export function promoteCost(level: MercLevel): number | null {
  const next = nextRank(level);
  return next ? PROMOTE_COST[next] : null;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 승급 후보: 패시브 최대 2개, 스킬 최대 2개 (이미 가진 것은 빼고) */
export function promotionChoices(seed: MercSeed, learned: string[] = []): { passives: string[]; skills: string[] } {
  const rng = createRng(hash(`${seed.id}:${seed.level}`));
  const shuffle = <T,>(xs: T[]) =>
    xs
      .map((x) => ({ x, k: rng.next() }))
      .sort((a, b) => a.k - b.k)
      .map((p) => p.x);
  const { job, race } = seed.traits;

  const passives = shuffle(passivesOf(race).map((p) => p.id).filter((id) => !seed.passives.includes(id))).slice(0, 2);

  const owned = new Set([...seed.skills, ...learned]);
  // 첫 후보: 아직 없는 조합 변형 (등급이 오를 때 배우는 쪽을 먼저)
  const early = VARIANTS[race]?.early ?? 2;
  const combos = [comboId(job, race, early === 1 ? 2 : 1), comboId(job, race, early)].filter((id) => !owned.has(id));
  const others = shuffle([...skillsFrom({ job }), ...skillsFrom({ race })].filter((id) => !owned.has(id)));
  const skills = [...combos.slice(0, 1), ...others].slice(0, 2);
  return { passives, skills };
}

/**
 * 승급을 적용한 새 시드와 배운 스킬 목록.
 * 고른 스킬은 장착 칸에 자리가 있으면 바로 장착, 없으면 배운 스킬로 보관 (전수관에서 바꿔 낀다).
 */
export function promote(
  seed: MercSeed,
  learned: string[],
  choice: { passive?: string; skill?: string },
): { seed: MercSeed; learned: string[] } | null {
  const next = nextRank(seed.level);
  if (!next) return null;
  const options = promotionChoices(seed, learned);
  if (options.passives.length > 0 && (!choice.passive || !options.passives.includes(choice.passive))) return null;
  if (options.skills.length > 0 && (!choice.skill || !options.skills.includes(choice.skill))) return null;

  const skills = [...seed.skills];
  const kept = [...learned];
  if (choice.skill) {
    if (skills.length < 4) skills.push(choice.skill);
    else kept.push(choice.skill);
  }
  return {
    seed: {
      ...seed,
      level: next,
      passives: choice.passive ? [...seed.passives, choice.passive] : seed.passives,
      skills,
      // 숙련이 되면 직업 궁극기가 열린다
      ultimate: seed.ultimate ?? JOB_ULTIMATE[seed.traits.job],
    },
    learned: kept,
  };
}
