import { z } from "zod";

/** 선택지/자유 입력의 성향. AI는 이 태그만 붙이고, 호감도 계산은 코드가 한다. */
export const ChoiceTone = z.enum(["respect", "honesty", "mercy", "greed", "threat", "mockery"]);
export type ChoiceTone = z.infer<typeof ChoiceTone>;

/** 자유 입력은 아무 성향도 아닐 수 있으므로 neutral을 추가로 허용한다. */
export const Tone = z.enum([...ChoiceTone.options, "neutral"]);
export type Tone = z.infer<typeof Tone>;

export const Emotion = z.enum(["neutral", "pleased", "annoyed", "angry", "sad", "suspicious"]);
export type Emotion = z.infer<typeof Emotion>;

/** 프롬프트에는 호감도 숫자 대신 이 단계만 넣는다. */
export const Stage = z.enum(["hostile", "wary", "neutral", "warm", "trusted"]);
export type Stage = z.infer<typeof Stage>;

export const Choice = z.object({
  text: z.string().min(1).max(120),
  tone: ChoiceTone,
});
export type Choice = z.infer<typeof Choice>;

/** AI(또는 mock)가 돌려줘야 하는 한 턴의 응답 */
export const MercReply = z.object({
  message: z.string().min(1),
  emotion: Emotion,
  choices: z.array(Choice).min(3).max(4),
});
export type MercReply = z.infer<typeof MercReply>;

export const HistoryLine = z.object({
  speaker: z.enum(["player", "merc"]),
  text: z.string().max(500),
});
export type HistoryLine = z.infer<typeof HistoryLine>;

/** 클라이언트가 보관하는 용병별 대화 상태 */
export const TalkState = z.object({
  affinity: z.number().int().min(0).max(100),
  willingness: z.number().int().min(0).max(100),
  recentTones: z.array(Tone).max(5),
  history: z.array(HistoryLine).max(20),
});
export type TalkState = z.infer<typeof TalkState>;

export const TalkAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open") }),
  z.object({ type: z.literal("choice"), choice: Choice }),
  z.object({ type: z.literal("free"), text: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal("propose") }),
]);
export type TalkAction = z.infer<typeof TalkAction>;

// ── 랜덤 용병 ──────────────────────────────────────────────

/** 코드가 뽑은 특성 조합 (data/traits.ts의 id) */
export const MercTraits = z.object({
  job: z.string().max(40),
  personalities: z.array(z.string().max(40)).min(1).max(2),
  background: z.string().max(40),
});
export type MercTraits = z.infer<typeof MercTraits>;

/** AI가 특성 조합을 보고 한 번 만드는 캐릭터 설정. 이후 대화에 계속 쓴다. */
export const MercProfile = z.object({
  name: z.string().min(1).max(12),
  title: z.string().min(1).max(24),
  persona: z.string().min(1).max(300),
  background: z.string().min(1).max(300),
  secret: z.string().min(1).max(300),
  speechStyle: z.string().min(1).max(150),
  exampleLines: z.array(z.string().min(1).max(100)).min(2).max(3),
});
export type MercProfile = z.infer<typeof MercProfile>;

/** 랜덤 용병 한 명을 다시 만들 수 있는 최소 정보. 반응표는 traits에서 코드가 다시 계산한다. */
export const MercSeed = z.object({
  id: z.string().min(1).max(40),
  traits: MercTraits,
  start: z.object({
    affinity: z.number().int().min(0).max(100),
    willingness: z.number().int().min(0).max(100),
  }),
  profile: MercProfile,
});
export type MercSeed = z.infer<typeof MercSeed>;

/** 대화 요청에서 용병을 가리키는 방법 */
export const MercRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unique"), id: z.string() }),
  z.object({ kind: z.literal("random"), seed: MercSeed }),
]);
export type MercRef = z.infer<typeof MercRef>;

export type AIMode = "mock" | "live" | "fallback";

export const RecruitRequest = z.object({
  /** 비우면 서버가 1~5명 중 무작위로 정한다 */
  count: z.number().int().min(1).max(5).optional(),
  /** 이미 길드에 있는 이름. 겹치지 않게 한다 */
  avoidNames: z.array(z.string().max(20)).max(40).default([]),
});
export type RecruitRequest = z.infer<typeof RecruitRequest>;

export type RecruitResponse = {
  /** 한 명이라도 AI 실패로 mock 프로필을 썼으면 fallback */
  mode: AIMode;
  seeds: MercSeed[];
};

// ── 대화 ───────────────────────────────────────────────────

export const TalkRequest = z.object({
  merc: MercRef,
  state: TalkState,
  action: TalkAction,
});
export type TalkRequest = z.infer<typeof TalkRequest>;

export type TalkResponse = {
  /** fallback: 실제 AI가 실패해서 이번 턴만 mock 대사를 썼다 */
  mode: AIMode;
  /** 이번 턴에 적용된 성향 (open/propose면 null) */
  tone: Tone | null;
  /** 이번 턴에 실제로 바뀐 양 */
  delta: { affinity: number; willingness: number };
  affinity: number;
  /** 고용 의향. 동행 제안 성공 확률(%) */
  willingness: number;
  stage: Stage;
  recentTones: Tone[];
  message: string;
  emotion: Emotion;
  /** 대화가 끝났으면 빈 배열 */
  choices: Choice[];
  /** propose일 때만 의미 있음 */
  joined: boolean | null;
};
