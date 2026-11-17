// 호감도 규칙. React/Next/AI에 의존하지 않는 순수 함수만 둔다.
import type { Stage, Tone } from "../schemas";
import type { Merc } from "./types";

export const AFFINITY_MIN = 0;
export const AFFINITY_MAX = 100;

export const LIKE_GAIN = 8;
export const DISLIKE_LOSS = 10;
export const REFUSAL_PENALTY = 5;

/** 최근 몇 턴의 성향을 기억해 같은 성향 반복을 막을지 */
export const REPEAT_WINDOW = 3;
/** 최근 창 안에서 같은 성향이 n번 나왔을 때 증가량 배율 */
const REPEAT_MULTIPLIER = [1, 0.5, 0.25, 0] as const;

/** 단계의 하한값. 위에서부터 검사한다. */
const STAGE_FLOORS: [Stage, number][] = [
  ["trusted", 75],
  ["warm", 55],
  ["neutral", 35],
  ["wary", 15],
  ["hostile", 0],
];

export function clampAffinity(value: number): number {
  return Math.min(AFFINITY_MAX, Math.max(AFFINITY_MIN, Math.round(value)));
}

export function getStage(affinity: number): Stage {
  for (const [stage, floor] of STAGE_FLOORS) {
    if (affinity >= floor) return stage;
  }
  return "hostile";
}

/** 반복 감쇠를 적용하기 전 기본 변화량 */
export function baseDelta(merc: Merc, tone: Tone): number {
  if (tone === "neutral") return 0;
  if (merc.likes.includes(tone)) return LIKE_GAIN;
  if (merc.dislikes.includes(tone)) return -DISLIKE_LOSS;
  return 0;
}

/** 반복 감쇠까지 적용한 변화량. 감점은 감쇠하지 않는다. */
export function toneDelta(merc: Merc, tone: Tone, recentTones: readonly Tone[]): number {
  const base = baseDelta(merc, tone);
  if (base <= 0) return base;
  const repeats = recentTones.slice(-REPEAT_WINDOW).filter((t) => t === tone).length;
  const multiplier = REPEAT_MULTIPLIER[Math.min(repeats, REPEAT_MULTIPLIER.length - 1)];
  return Math.round(base * multiplier);
}

export type ToneResult = {
  affinity: number;
  /** clamp 이후 실제로 바뀐 양 */
  delta: number;
  recentTones: Tone[];
};

export function applyTone(
  merc: Merc,
  state: { affinity: number; recentTones: readonly Tone[] },
  tone: Tone,
): ToneResult {
  const next = clampAffinity(state.affinity + toneDelta(merc, tone, state.recentTones));
  return {
    affinity: next,
    delta: next - state.affinity,
    recentTones: [...state.recentTones, tone].slice(-REPEAT_WINDOW),
  };
}

export type ProposeResult = {
  joined: boolean;
  affinity: number;
  delta: number;
};

export function proposeJoin(merc: Merc, affinity: number): ProposeResult {
  if (affinity >= merc.joinThreshold) {
    return { joined: true, affinity, delta: 0 };
  }
  const next = clampAffinity(affinity - REFUSAL_PENALTY);
  return { joined: false, affinity: next, delta: next - affinity };
}
