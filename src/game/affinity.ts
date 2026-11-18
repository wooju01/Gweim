// 호감도·고용 의향 규칙. React/Next/AI에 의존하지 않는 순수 함수만 둔다.
import { ChoiceTone, type Stage, type Tone } from "../lib/schemas";
import type { Merc, Reaction } from "./types";

export const STAT_MIN = 0;
export const STAT_MAX = 100;

/** 반응 세기 1칸당 변화량. 호감도(마음)는 천천히, 고용 의향(계약)은 크게 움직인다.
 *  대화가 용병당 TALK_LIMIT번뿐이라 고용 의향은 한 번에 크게 오르내린다. */
export const AFFINITY_STEP = 5;
export const WILLINGNESS_STEP = 15;
/** 동행 제안이 거절되면 고용 의향이 이만큼 떨어진다 */
export const REFUSAL_PENALTY = 15;

/** 최근 몇 턴의 성향을 기억해 같은 성향 반복을 막을지 */
export const REPEAT_WINDOW = 3;

/** 한 용병과 말을 주고받을 수 있는 횟수 (선택지·직접 입력). 동행 제안은 세지 않는다 */
export const TALK_LIMIT = 5;

/** 이번 행동이 대화 횟수를 쓰는지 */
export function usesTalk(action: { type: string }): boolean {
  return action.type === "choice" || action.type === "free";
}
/**
 * 최근 창 안에서 같은 성향이 n번 나왔을 때 증가량 배율. 감소량은 줄어들지 않는다.
 * 호감도는 같은 말 반복이 금방 안 통하고, 고용 의향은 덜 민감하다.
 */
const AFFINITY_REPEAT = [1, 0.5, 0.25, 0] as const;
const WILLINGNESS_REPEAT = [1, 0.75, 0.5, 0.25] as const;

/** 호감도 단계의 하한값. 위에서부터 검사한다. */
const STAGE_FLOORS: [Stage, number][] = [
  ["trusted", 75],
  ["warm", 55],
  ["neutral", 35],
  ["wary", 15],
  ["hostile", 0],
];

/** 고용 의향 단계. AI에게 숫자 대신 이걸 넘긴다. */
export type Resolve = "unwilling" | "doubtful" | "leaning" | "eager";
const RESOLVE_FLOORS: [Resolve, number][] = [
  ["eager", 75],
  ["leaning", 50],
  ["doubtful", 20],
  ["unwilling", 0],
];

export type Stats = { affinity: number; willingness: number };

export function clampStat(value: number): number {
  return Math.min(STAT_MAX, Math.max(STAT_MIN, Math.round(value)));
}

export function getStage(affinity: number): Stage {
  return STAGE_FLOORS.find(([, floor]) => affinity >= floor)?.[0] ?? "hostile";
}

export function getResolve(willingness: number): Resolve {
  return RESOLVE_FLOORS.find(([, floor]) => willingness >= floor)?.[0] ?? "unwilling";
}

const NO_REACTION: Reaction = { affinity: 0, willingness: 0 };

export function reactionTo(merc: Merc, tone: Tone): Reaction {
  if (tone === "neutral") return NO_REACTION;
  return merc.reactions[tone] ?? NO_REACTION;
}

/** 호감도를 올려 주는 태도 */
export function likedTones(merc: Merc): ChoiceTone[] {
  return ChoiceTone.options.filter((t) => reactionTo(merc, t).affinity > 0);
}

/** 호감도를 떨어뜨리는 태도 */
export function dislikedTones(merc: Merc): ChoiceTone[] {
  return ChoiceTone.options.filter((t) => reactionTo(merc, t).affinity < 0);
}

function decay(delta: number, repeats: number, table: readonly number[]): number {
  if (delta <= 0) return delta;
  return Math.round(delta * table[Math.min(repeats, table.length - 1)]);
}

/** 반복 감쇠까지 적용한 두 수치의 변화량 (clamp 전) */
export function toneDeltas(merc: Merc, tone: Tone, recentTones: readonly Tone[]): Stats {
  const reaction = reactionTo(merc, tone);
  const repeats = recentTones.slice(-REPEAT_WINDOW).filter((t) => t === tone).length;
  return {
    affinity: decay(reaction.affinity * AFFINITY_STEP, repeats, AFFINITY_REPEAT),
    willingness: decay(reaction.willingness * WILLINGNESS_STEP, repeats, WILLINGNESS_REPEAT),
  };
}

export type ToneResult = Stats & {
  /** clamp 이후 실제로 바뀐 양 */
  delta: Stats;
  recentTones: Tone[];
};

export function applyTone(
  merc: Merc,
  state: Stats & { recentTones: readonly Tone[] },
  tone: Tone,
): ToneResult {
  const raw = toneDeltas(merc, tone, state.recentTones);
  const affinity = clampStat(state.affinity + raw.affinity);
  const willingness = clampStat(state.willingness + raw.willingness);
  return {
    affinity,
    willingness,
    delta: { affinity: affinity - state.affinity, willingness: willingness - state.willingness },
    recentTones: [...state.recentTones, tone].slice(-REPEAT_WINDOW),
  };
}

export type ProposeResult = {
  joined: boolean;
  willingness: number;
  delta: number;
};

/** 동행 제안 성공 확률 (0~1). 고용 의향이 곧 확률이다. */
/** 고용 의향이 이 이상이면 확률 없이 바로 합류한다 */
export const SURE_JOIN = 80;

export function joinChance(willingness: number): number {
  if (willingness >= SURE_JOIN) return 1;
  return clampStat(willingness) / STAT_MAX;
}

/**
 * 고용 의향% 확률로 합류한다. 실패하면 고용 의향이 조금 떨어져서 연타할수록 손해다.
 * rand는 테스트에서 결과를 고정하려고 주입받는다.
 */
export function proposeJoin(willingness: number, rand: () => number = Math.random): ProposeResult {
  // 확정 구간에서는 주사위를 굴리지 않는다
  if (willingness >= SURE_JOIN || rand() < joinChance(willingness)) {
    return { joined: true, willingness, delta: 0 };
  }
  const next = clampStat(willingness - REFUSAL_PENALTY);
  return { joined: false, willingness: next, delta: next - willingness };
}
