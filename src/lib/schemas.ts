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
  message: z.string().min(1).max(100),
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
  /** 오래된 대화를 요약한 기억. 비어 있을 수 있다 */
  memory: z.string().max(600).default(""),
  /** 지금까지 주고받은 말 횟수. 한도는 game/affinity.ts의 TALK_LIMIT */
  talks: z.number().int().min(0).max(99).default(0),
  /** 이미 제시한 조건 (용병마다 한 번씩) */
  offers: z.object({ advance: z.boolean(), share: z.boolean() }).default({ advance: false, share: false }),
});
export type TalkState = z.infer<typeof TalkState>;

/** 플레이어가 직접 입력하는 말의 최대 글자 수 */
export const FREE_TEXT_MAX = 100;

export const TalkAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open") }),
  z.object({ type: z.literal("choice"), choice: Choice }),
  z.object({ type: z.literal("free"), text: z.string().trim().min(1).max(FREE_TEXT_MAX) }),
  z.object({ type: z.literal("propose") }),
  /** 조건 제시: 선금(지금 금화를 낸다) / 몫 약속(앞으로 보수 +50%) */
  z.object({ type: z.literal("offer"), offer: z.enum(["advance", "share"]) }),
]);
export type TalkAction = z.infer<typeof TalkAction>;

// ── 랜덤 용병 ──────────────────────────────────────────────

export const Gender = z.enum(["female", "male"]);
export type Gender = z.infer<typeof Gender>;

/** 코드가 뽑은 특성 조합 (data/traits.ts의 id) */
export const MercTraits = z.object({
  race: z.string().max(40),
  job: z.string().max(40),
  personalities: z.array(z.string().max(40)).min(1).max(2),
  background: z.string().max(40),
  /** 직업 이름(성녀/성자 등)과 AI 프로필에 쓴다. 없으면 정하지 않은 것 */
  gender: Gender.optional(),
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

/** 용병 등급: 동 / 은 / 금 / 미스릴 / 다이아 / 성휘 (data/ranks.ts의 RANKS). 등급마다 3단계 */
export const MercLevel = z.enum(["bronze", "silver", "gold", "mithril", "diamond", "radiant"]);
export type MercLevel = z.infer<typeof MercLevel>;

/** 스킬 하나 = 메인 조각 1 + 부 조각 0~2 (data/fragments.ts의 id). 효과는 조각을 합쳐 계산한다 */
export const SkillBuild = z.object({
  main: z.string().max(40),
  subs: z.array(z.string().max(40)).max(2).default([]),
});
export type SkillBuild = z.infer<typeof SkillBuild>;

/** 원소 (마법사 원소 조각) */
export const Element = z.enum(["fire", "water", "wind", "earth"]);
export type Element = z.infer<typeof Element>;

/** 랜덤 용병 한 명을 다시 만들 수 있는 최소 정보. 반응표는 traits에서 코드가 다시 계산한다. */
export const MercSeed = z.object({
  id: z.string().min(1).max(40),
  traits: MercTraits,
  start: z.object({
    affinity: z.number().int().min(0).max(100),
    willingness: z.number().int().min(0).max(100),
  }),
  level: MercLevel.default("bronze"),
  /** 종족 패시브 id (data/passives.ts). 개수는 등급이 정한다 */
  passives: z.array(z.string().max(40)).max(5).default([]),
  /** 장착 스킬 (최대 4). 비어 있으면 직업 기본 조각 하나 */
  skills: z.array(SkillBuild).max(4).default([]),
  /** 장착 궁극기 조각 id (금 등급부터) */
  ultimate: z.string().max(40).optional(),
  /** 2차 전직 갈래 id (금 등급부터, data/jobs.ts) */
  branch: z.string().max(40).optional(),
  /** 원소술사가 고른 원소 2개 (한 스킬에 같이 낄 수 있다) */
  elements: z.array(Element).max(2).optional(),
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
  /** 길드 등급: 이 등급까지의 용병이 모인다 (data/guild.ts) */
  guildGrade: MercLevel.default("bronze"),
});
export type RecruitRequest = z.infer<typeof RecruitRequest>;

export type RecruitResponse = {
  /** 한 명이라도 AI 실패로 mock 프로필을 썼으면 fallback */
  mode: AIMode;
  seeds: MercSeed[];
};

// ── 대화 ───────────────────────────────────────────────────

/**
 * 대화 장면. guild: 길드에서 동행을 청하는 대화 (5번 제한, 고용 의향이 움직인다)
 * rest: 던전 휴식 중 짧은 대화 (횟수에 들지 않고, 호감만 움직이고, 동행 제안은 없다)
 * home: 귀환 뒤 숙소·클랜 본부에서 1:1 대화 (rest와 같은 규칙, 귀환마다 2명)
 */
export const TalkScene = z.enum(["guild", "rest", "home"]);
export type TalkScene = z.infer<typeof TalkScene>;

export const TalkRequest = z.object({
  merc: MercRef,
  state: TalkState,
  action: TalkAction,
  scene: TalkScene.default("guild"),
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
  /** 이번 턴 이후의 기억 */
  memory: string;
  /** 기억으로 접혀서 대화 기록 앞에서 지워야 할 줄 수 */
  forget: number;
  /** 이번 턴 이후 주고받은 말 횟수 */
  talks: number;
  /** 이번 턴에 받아들여진 조건 제시 (클라이언트가 선금을 내고 기록한다) */
  offer: "advance" | "share" | null;
};

// ── 던전 사건 ──────────────────────────────────────────────

/** AI가 파티에 맞게 다시 쓴 사건 묘사와 선택지 문장. 선택지 id와 결과는 코드가 정한 그대로다 */
export const EventNarration = z.object({
  intro: z.string().min(1).max(300),
  choices: z
    .array(z.object({ id: z.string().max(40), text: z.string().min(1).max(80) }))
    .min(2)
    .max(5),
});
export type EventNarration = z.infer<typeof EventNarration>;

export const EventRequest = z.object({
  eventId: z.string().max(40),
  /** 지금 살아 있는 용병 (이름과 특성 id) */
  party: z
    .array(z.object({ name: z.string().max(20), race: z.string().max(40).optional(), job: z.string().max(40).optional() }))
    .max(4),
});
export type EventRequest = z.infer<typeof EventRequest>;

export type EventResponse = EventNarration & { mode: AIMode };

// ── 마지막 말 ──────────────────────────────────────────────

export const FarewellRequest = z.object({
  merc: MercRef,
  /** 그 용병이 길안내자와 나눈 대화의 기억 */
  memory: z.string().max(600).default(""),
  stage: Stage,
});
export type FarewellRequest = z.infer<typeof FarewellRequest>;

export const Farewell = z.object({ words: z.string().min(1).max(100) });
export type FarewellResponse = { mode: AIMode; words: string };

// ── 상황 반응 한마디 ───────────────────────────────────────

/**
 * 용병 한마디. flee: 전투 중 후퇴했다 / omen: 보스 직전, 불길한 기운을 느꼈다.
 * feeling: 그 일로 마음이 어떻게 움직였나 (코드가 성격으로 정한다)
 */
export const ReactSituation = z.enum(["flee", "omen", "clanJoin"]);
export type ReactSituation = z.infer<typeof ReactSituation>;

export const ReactRequest = z.object({
  merc: MercRef,
  situation: ReactSituation,
  feeling: z.enum(["up", "down", "none"]),
  stage: Stage,
});
export type ReactRequest = z.infer<typeof ReactRequest>;

export const ReactLine = z.object({ words: z.string().min(1).max(100) });
export type ReactResponse = { mode: AIMode; words: string };

// ── 짧은 이야기 (일상 장면, 파견 보고) ──────────────────────

/** 결과는 코드가 정했다. AI는 그 결과를 바꾸지 않고 이야기로만 쓴다 */
export const StoryRequest = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("scene"), mercs: z.tuple([MercRef, MercRef]) }),
  z.object({
    kind: z.literal("dispatch"),
    title: z.string().max(40),
    success: z.boolean(),
    members: z.array(z.object({ merc: MercRef, outcome: z.enum(["ok", "injured", "dead"]) })).min(1).max(4),
  }),
]);
export type StoryRequest = z.infer<typeof StoryRequest>;

export const Story = z.object({ text: z.string().min(1).max(400) });
export type StoryResponse = { mode: AIMode; text: string };
