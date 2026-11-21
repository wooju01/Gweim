// API 키 없이 흐름을 테스트하기 위한 가짜 AI.
// 실제 AI와 같은 인터페이스(MercAI)를 구현하고, 같은 Zod 스키마로 검증된다.
import {
  ChoiceTone,
  type Choice,
  type Emotion,
  type MercProfile,
  type Stage,
  type Tone,
} from "@/lib/schemas";
import { dislikedTones, likedTones } from "@/game/merc/affinity";
import type { Merc } from "@/game/types";
import { MEMORY_MAX_CHARS } from "@/game/merc/memory";
import type { EventInput, FarewellInput, MercAI, ProfileInput, ReactInput, ReplyContext, StoryInput, SummaryInput } from "./types";

type MercLines = {
  open: Record<Stage, string>;
  liked: string[];
  disliked: string[];
  indifferent: string[];
  accept: string;
  refuse: string;
  refuseEmotion: Emotion;
};

const CHOICE_POOL: Record<ChoiceTone, string[]> = {
  respect: [
    "당신 같은 노련한 사람이 필요하오.",
    "명성은 들었소. 직접 이야기해 보고 싶었소.",
    "당신의 판단을 믿겠소.",
  ],
  honesty: [
    "솔직히 말하지. 살아 돌아온다는 보장은 없어.",
    "숨기지 않겠소. 이번 의뢰는 위험하오.",
    "나도 겁이 나. 그래서 사람이 필요해.",
  ],
  mercy: [
    "다친 데는 괜찮소? 치료부터 받으시오.",
    "싸우지 않아도 될 자들은 살려 보내고 싶소.",
    "당신 몫의 짐까지 내가 지겠소.",
  ],
  greed: [
    "던전 밑바닥엔 금이 쌓여 있다더군. 반씩 나누지.",
    "보수는 넉넉히 주겠소. 그거면 충분하지 않소?",
    "살아 나오면 평생 술값 걱정은 없을 거요.",
  ],
  threat: [
    "거절하면 이 마을에서 일감 구하기 힘들 거요.",
    "내 말을 무시하면 후회하게 될 거다.",
    "선택권이 있다고 생각하나?",
  ],
  mockery: [
    "그 몸으로 무기는 들 수 있겠소?",
    "소문보다 별거 없군.",
    "여기 앉아 술이나 축내는 게 용병인가?",
  ],
};

/** 자유 입력 분류용 키워드. 실제 AI 분류기가 들어오기 전까지의 근사치다. */
const KEYWORDS: [ChoiceTone, string[]][] = [
  [
    "threat",
    ["죽여", "죽인", "죽을", "베어", "협박", "가만 안", "후회", "각오"],
  ],
  [
    "mockery",
    ["겁쟁이", "늙은이", "한심", "하찮", "웃기", "별거 없", "약해 빠"],
  ],
  ["greed", ["돈", "금화", "보수", "보물", "몫", "값", "냥"]],
  ["mercy", ["살려", "용서", "불쌍", "다친", "치료", "괜찮", "지켜"]],
  ["honesty", ["솔직", "사실", "진실", "거짓말 안", "숨기지"]],
  ["respect", ["존경", "부탁", "감사", "고맙", "명성", "실력"]],
];

function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)];
}

function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** 좋아하는 성향 1개, 싫어하는 성향 1개를 (있으면) 포함한 서로 다른 선택지 4개 */
export function mockChoices(
  merc: Merc,
  rand: () => number = Math.random,
): Choice[] {
  const liked = likedTones(merc);
  const disliked = dislikedTones(merc);
  const must = [
    ...(liked.length ? [pick(liked, rand)] : []),
    ...(disliked.length ? [pick(disliked, rand)] : []),
  ];
  const others = shuffle(
    ChoiceTone.options.filter((t) => !must.includes(t)),
    rand,
  ).slice(0, 4 - must.length);
  return shuffle([...must, ...others], rand).map((tone) => ({
    tone,
    text: pick(CHOICE_POOL[tone], rand),
  }));
}

/** mock 모드에서 모든 용병이 쓰는 공통 대사 */
const GENERIC_LINES: MercLines = {
  open: {
    hostile: "...볼일 없으면 가.",
    wary: "용건이 뭐지?",
    neutral: "앉아. 얘기는 들어 주지.",
    warm: "또 왔군. 이번엔 무슨 얘기야?",
    trusted: "너라면 들을 가치가 있지.",
  },
  liked: ["...나쁘지 않군.", "그런 말이면 들어 줄 만하지."],
  disliked: ["말조심해.", "그런 소리 들으려고 앉아 있는 거 아냐."],
  indifferent: ["...그래서?", "흠."],
  accept: "좋아. 같이 가지. 대신 날 실망시키지 마.",
  refuse: "아직은 아니야.",
  refuseEmotion: "suspicious",
};

const MOCK_NAMES = [
  "로칸",
  "세브린",
  "이르마",
  "드레크",
  "말루",
  "토르비",
  "헤사",
  "가론",
  "네일라",
  "오스크",
  "비렌",
  "무린",
  "에셀",
  "카델",
];

/** API 키 없이 쓰는 가짜 프로필. 특성 설명을 이어 붙여 만든다. */
export function mockProfile(
  { traits, avoidNames }: ProfileInput,
  rand: () => number = Math.random,
): MercProfile {
  const job = traits.find((t) => t.kind === "job")!;
  const personalities = traits.filter((t) => t.kind === "personality");
  const background = traits.find((t) => t.kind === "background")!;
  const names = MOCK_NAMES.filter((n) => !avoidNames.includes(n));
  const adjectives = personalities.map((p) => p.adjective ?? p.name).join(" ");

  return {
    name: pick(names.length ? names : MOCK_NAMES, rand),
    title: `${personalities[0].adjective ?? personalities[0].name} ${job.name}`,
    persona: `${adjectives} ${job.name}. ${personalities.map((p) => p.description).join(" ")}`,
    background: `${background.name}. ${background.description}`,
    secret: background.secretHint ?? "아무에게도 말하지 않은 과거가 있다.",
    speechStyle: "짧고 무뚝뚝한 반말.",
    exampleLines: ["...용건이 뭐지?", "보수 얘기부터 하자고."],
  };
}

/** API 키 없이 쓰는 가짜 요약. 기존 기억에 마지막으로 한 말 정도만 덧붙인다. */
export function mockSummary({ merc, memory, lines }: SummaryInput): string {
  const said = lines.filter((l) => l.speaker === "player").map((l) => l.text);
  const last = said.at(-1);
  const parts = [
    memory.trim(),
    `${merc.name}은(는) 플레이어와 ${said.length}마디를 나눴다.`,
    last ? `플레이어가 "${last.slice(0, 40)}"라고 말했다.` : "",
  ];
  // 넘치면 오래된 앞부분부터 버린다
  return parts.filter(Boolean).join(" ").slice(-MEMORY_MAX_CHARS);
}

export function mockClassify(text: string): Tone {
  const normalized = text.replace(/\s+/g, " ");
  for (const [tone, words] of KEYWORDS) {
    if (words.some((w) => normalized.includes(w))) return tone;
  }
  return "neutral";
}

/** 호감 단계에 따른 기본 마지막 말 */
export function mockFarewell({ stage }: FarewellInput): string {
  return {
    hostile: "…결국 이렇게 되는군. 당신을 따라온 게 잘못이었어.",
    wary: "여기까지인가… 길은… 당신이 알아서 찾아.",
    neutral: "먼저 간다. 끝까지… 살아서 나가.",
    warm: "괜찮아… 당신 탓이 아니야. 남은 녀석들을 부탁해.",
    trusted: "당신과 걸어서… 나쁘지 않았어. 멈추지 마.",
  }[stage];
}

/** 상황 반응 기본 한마디 */
export function mockReact({ situation, feeling }: ReactInput): string {
  const lines = {
    flee: { up: "휴, 살았다. 잘 물러났어.", down: "칫… 등을 보이다니, 다음엔 끝까지 간다.", none: "됐어, 다음에 다시 오면 되지." },
    omen: { up: "오, 저 안에 뭔가 대단한 게 있겠는데?", down: "저건 아니야. 지금은 물러나자.", none: "…어떻게 할지는 당신이 정해." },
    clanJoin: { up: "좋아, 같이 가 보자고. 오래오래.", down: "고맙지만… 아직은 아니야. 조금만 더 지켜볼게.", none: "음, 생각해 볼게." },
  } as const;
  return lines[situation][feeling];
}

/** 짧은 이야기 기본 문장 */
export function mockStory(input: StoryInput): string {
  if (input.kind === "scene") {
    const [a, b] = input.mercs;
    return `${a.name}이(가) 난롯가에서 무기를 손질하는 동안, ${b.name}이(가) 옆에 앉아 지난 원정 이야기를 늘어놓았다. 둘은 누가 더 많이 쓰러뜨렸는지를 두고 한참 티격태격했다.`;
  }
  const names = input.members.map((m) => m.merc.name).join(", ");
  const dead = input.members.filter((m) => m.outcome === "dead").map((m) => m.merc.name);
  return `${names}이(가) 「${input.title}」에서 돌아왔다. ${input.success ? "의뢰는 무사히 마쳤다." : "의뢰는 끝내 실패했다."}${dead.length ? ` ${dead.join(", ")}은(는) 돌아오지 못했다.` : ""}`;
}

/** 사건 틀의 기본 문장을 그대로 쓴다 */
export function mockNarration({ event }: EventInput) {
  return { intro: event.intro, choices: event.choices.map((c) => ({ id: c.id, text: c.text })) };
}

export function createMockAI(rand: () => number = Math.random): MercAI {
  return {
    mode: "mock",
    async classify(text) {
      return mockClassify(text);
    },
    async createProfile(input) {
      return mockProfile(input, rand);
    },
    async summarize(input) {
      return mockSummary(input);
    },
    async narrateEvent(input) {
      return mockNarration(input);
    },
    async farewell(input) {
      return mockFarewell(input);
    },
    async react(input) {
      return mockReact(input);
    },
    async story(input) {
      return mockStory(input);
    },
    async reply({ merc, stage, event }: ReplyContext) {
      const lines = GENERIC_LINES;
      const choices = mockChoices(merc, rand);

      switch (event.kind) {
        case "open":
          return {
            message: lines.open[stage],
            emotion:
              stage === "hostile"
                ? "annoyed"
                : "neutral",
            choices,
          };
        case "talk": {
          // mock은 호감도 방향만 보고 대사를 고른다
          const kind = {
            up: "liked",
            down: "disliked",
            none: "indifferent",
          } as const;
          const reaction = pick(lines[kind[event.affinity]], rand);
          const emotion: Emotion =
            event.affinity === "up"
              ? "pleased"
              : event.affinity === "down"
                ? event.willingness === "up"
                  ? "suspicious"
                  : stage === "hostile"
                    ? "angry"
                    : "annoyed"
                : "neutral";
          return { message: reaction, emotion, choices };
        }
        case "offer":
          return event.affinity === "down"
            ? { message: "돈이면 다 되는 줄 아나 보군.", emotion: "annoyed", choices }
            : { message: "좋아. 그 말, 잊지 마.", emotion: "pleased", choices };
        case "propose":
          return event.joined
            ? { message: lines.accept, emotion: "pleased", choices }
            : { message: lines.refuse, emotion: lines.refuseEmotion, choices };
      }
    },
  };
}
