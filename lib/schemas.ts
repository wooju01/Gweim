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

export const TalkRequest = z.object({
  mercId: z.string(),
  state: TalkState,
  action: TalkAction,
});
export type TalkRequest = z.infer<typeof TalkRequest>;

export type TalkResponse = {
  mode: "mock" | "live";
  /** 이번 턴에 적용된 성향 (open/propose면 null) */
  tone: Tone | null;
  delta: number;
  affinity: number;
  stage: Stage;
  recentTones: Tone[];
  message: string;
  emotion: Emotion;
  /** 대화가 끝났으면 빈 배열 */
  choices: Choice[];
  /** propose일 때만 의미 있음 */
  joined: boolean | null;
};
