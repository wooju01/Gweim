// 랜덤 용병 생성 규칙. 특성 뽑기, 반응표 합치기, 시작 수치 계산.
// React/Next/AI에 의존하지 않는 순수 함수만 둔다. 난수는 주입받는다.
import { BACKGROUNDS, JOBS, PERSONALITIES, getTrait } from "../data/traits";
import { ChoiceTone, type MercSeed, type MercTraits } from "../lib/schemas";
import { clampStat } from "./affinity";
import type { Level, Merc, Reaction, Trait } from "./types";

export type Rand = () => number;

/** 두 번째 성격이 붙을 확률 */
export const SECOND_PERSONALITY_CHANCE = 0.3;

export const BASE_AFFINITY = 20;
export const BASE_WILLINGNESS = 40;
const AFFINITY_JITTER = 5;
const WILLINGNESS_JITTER = 10;
/** 시작 수치 범위 */
export const START_AFFINITY_RANGE = [5, 40] as const;
export const START_WILLINGNESS_RANGE = [30, 70] as const;

/** 한 번 모집할 때 오는 인원 (최소, 최대) */
export const RECRUIT_COUNT_RANGE = [1, 5] as const;

/** 이번 모집 인원. 1~5명 균등 확률 */
export function rollRecruitCount(rand: Rand): number {
  const [min, max] = RECRUIT_COUNT_RANGE;
  return min + Math.floor(rand() * (max - min + 1));
}

/** 테스트용 고정 시드 난수 (mulberry32) */
export function seededRandom(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** a와 b가 서로를 제외하지 않는가 */
function compatible(a: Trait, b: Trait): boolean {
  return !a.excludes?.includes(b.id) && !b.excludes?.includes(a.id);
}

/** 이미 뽑은 특성들과 함께 나올 수 있는가 */
export function fits(candidate: Trait, chosen: Trait[]): boolean {
  if (chosen.some((c) => c.id === candidate.id || !compatible(candidate, c))) return false;
  if (candidate.requires && !candidate.requires.some((id) => chosen.some((c) => c.id === id))) return false;
  return true;
}

/** 희귀도 가중치로 하나 뽑는다. 후보가 없으면 undefined */
export function weightedPick(items: Trait[], rand: Rand): Trait | undefined {
  const total = items.reduce((sum, t) => sum + t.rarity, 0);
  if (total <= 0) return undefined;
  let roll = rand() * total;
  for (const item of items) {
    roll -= item.rarity;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

/** 직업 1, 성격 1~2, 배경 1을 뽑는다 */
export function rollTraits(rand: Rand): MercTraits {
  const job = weightedPick(JOBS, rand)!;
  const chosen: Trait[] = [job];

  const first = weightedPick(PERSONALITIES.filter((p) => fits(p, chosen)), rand)!;
  chosen.push(first);
  const personalities = [first.id];

  if (rand() < SECOND_PERSONALITY_CHANCE) {
    const second = weightedPick(PERSONALITIES.filter((p) => fits(p, chosen)), rand);
    if (second) {
      chosen.push(second);
      personalities.push(second.id);
    }
  }

  // 모든 배경을 제외하는 조합은 없도록 데이터를 짜 두었다 (떠돌이는 제외 규칙이 없다)
  const background = weightedPick(BACKGROUNDS.filter((b) => fits(b, chosen)), rand)!;
  return { job: job.id, personalities, background: background.id };
}

/** id를 실제 특성으로 바꾸고, 종류와 조합 규칙까지 검사한다. 잘못됐으면 null */
export function resolveTraits(traits: MercTraits): Trait[] | null {
  const job = getTrait(traits.job);
  const personalities = traits.personalities.map(getTrait);
  const background = getTrait(traits.background);
  if (job?.kind !== "job" || background?.kind !== "background") return null;
  if (personalities.some((p) => p?.kind !== "personality")) return null;

  const all = [job, ...(personalities as Trait[]), background];
  for (let i = 1; i < all.length; i++) {
    if (!fits(all[i], all.slice(0, i))) return null;
  }
  return all;
}

function clampLevel(n: number): Level {
  return Math.max(-2, Math.min(2, n)) as Level;
}

/** 여러 특성의 반응을 더해 하나의 반응표로 만든다 */
export function combineReactions(traits: Trait[]): Partial<Record<ChoiceTone, Reaction>> {
  const table: Partial<Record<ChoiceTone, Reaction>> = {};
  for (const tone of ChoiceTone.options) {
    const parts = traits.flatMap((t) => (t.reactions?.[tone] ? [t.reactions[tone]] : []));
    if (parts.length === 0) continue;
    const affinity = clampLevel(parts.reduce((s, r) => s + r.affinity, 0));
    const willingness = clampLevel(parts.reduce((s, r) => s + r.willingness, 0));
    if (affinity === 0 && willingness === 0) continue;
    const notes = parts.flatMap((r) => (r.note ? [r.note] : []));
    table[tone] = { affinity, willingness, ...(notes.length ? { note: notes.join(" ") } : {}) };
  }
  return table;
}

function jitter(range: number, rand: Rand): number {
  return Math.round((rand() * 2 - 1) * range);
}

function clampTo(value: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, clampStat(value)));
}

/** 시작 호감도와 고용 의향. 특성 보정 + 약간의 흔들림 */
export function rollStart(traits: Trait[], rand: Rand): MercSeed["start"] {
  const affinityMod = traits.reduce((s, t) => s + (t.affinityMod ?? 0), 0);
  const willingnessMod = traits.reduce((s, t) => s + (t.willingnessMod ?? 0), 0);
  return {
    affinity: clampTo(BASE_AFFINITY + affinityMod + jitter(AFFINITY_JITTER, rand), START_AFFINITY_RANGE),
    willingness: clampTo(
      BASE_WILLINGNESS + willingnessMod + jitter(WILLINGNESS_JITTER, rand),
      START_WILLINGNESS_RANGE,
    ),
  };
}

/** 카드에 보이는 특성 이름: [직업, 성격..., 배경] */
export function traitTags(traits: Trait[]): string[] {
  return traits.map((t) => t.name);
}

/**
 * 시드에서 게임에 쓰는 용병을 만든다.
 * 반응표는 시드에 저장하지 않고 특성에서 매번 다시 계산하므로, 클라이언트가 바꿔치기할 수 없다.
 */
export function buildMerc(seed: MercSeed): Merc | null {
  const traits = resolveTraits(seed.traits);
  if (!traits) return null;
  const { profile } = seed;
  return {
    id: seed.id,
    tags: traitTags(traits),
    job: seed.traits.job,
    name: profile.name,
    title: profile.title,
    persona: profile.persona,
    background: profile.background,
    secret: profile.secret,
    speechStyle: profile.speechStyle,
    exampleLines: profile.exampleLines,
    reactions: combineReactions(traits),
    startAffinity: seed.start.affinity,
    startWillingness: seed.start.willingness,
  };
}
