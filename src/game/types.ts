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

/**
 * 랜덤 용병의 재료가 되는 특성 하나 (직업, 성격, 배경).
 * 반응표와 시작 수치 보정을 들고 온다.
 */
export type Trait = {
  id: string;
  kind: "job" | "personality" | "background";
  /** 카드에 보이는 이름. 예: "오만함", "창병", "탈영병" */
  name: string;
  /** 호칭에 쓰는 꾸밈말. 성격에만. 예: "오만한" */
  adjective?: string;
  /** 성격에만. 처음 봤을 때 눈에 띄는 모습. 카드와 첫 대사에 쓴다 */
  impressions?: string[];
  /** AI가 캐릭터를 만들 때 참고하는 설명 */
  description: string;
  /** 등장 가중치. 클수록 자주 나온다 */
  rarity: number;
  /** 같이 나올 수 없는 특성 id */
  excludes?: string[];
  /** 이 중 하나가 있어야 나올 수 있는 특성 id */
  requires?: string[];
  reactions?: Partial<Record<ChoiceTone, Reaction>>;
  affinityMod?: number;
  willingnessMod?: number;
  /** 배경에만. AI가 비밀을 지을 때 쓰는 씨앗 */
  secretHint?: string;
};

export type Merc = {
  id: string;
  /** 카드에 보이는 특성 이름들. 랜덤 용병에만 있다 */
  tags?: string[];
  /** 직업 id (traits.ts). 전투 능력을 정한다 */
  job?: string;
  name: string;
  /** 카드에 붙는 짧은 호칭 */
  title: string;
  /** 첫인상. 성격이 드러나는 관찰 문구 (랜덤 용병은 성격 특성에서 고른다) */
  impression?: string;
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
