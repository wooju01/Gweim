import type { ChoiceTone } from "../lib/schemas";

/** 반응 세기. 1칸당 변화량은 affinity.ts의 STEP */
export type Level = -2 | -1 | 0 | 1 | 2;

/**
 * 어떤 태도의 말을 들었을 때의 반응.
 * 호감도(마음)와 고용 의향(계약)은 따로 움직인다.
 * 예: 겁쟁이 소리에 기분은 상하지만(호감 -) 증명하고 싶어진다(의향 +).
 */
export type Reaction = {
  affinity: Level;
  willingness: Level;
  /** AI에게 주는 속마음 힌트. 대사에 그대로 쓰이지 않는다. */
  note?: string;
};

export type Merc = {
  id: string;
  name: string;
  /** 카드에 붙는 짧은 호칭 */
  title: string;
  /** 프롬프트용 성격 요약 */
  persona: string;
  /** 플레이어가 대화로 알 수 있는 과거 */
  background: string;
  /** 높은 호감도에서만 드러나는 비밀. 지금은 프롬프트에만 쓰고 UI엔 노출하지 않는다. */
  secret: string;
  speechStyle: string;
  exampleLines: string[];
  /** 태도별 반응표. 빠진 태도는 아무 반응 없음(0, 0) */
  reactions: Partial<Record<ChoiceTone, Reaction>>;
  startAffinity: number;
  /** 시작 고용 의향. 동행 제안 성공 확률(%)이기도 하다. */
  startWillingness: number;
};
