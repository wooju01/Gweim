// API 키 없이 흐름을 테스트하기 위한 가짜 AI.
// 실제 AI와 같은 인터페이스(MercAI)를 구현하고, 같은 Zod 스키마로 검증된다.
import { ChoiceTone, type Choice, type Emotion, type Stage, type Tone } from "../../lib/schemas";
import { dislikedTones, likedTones } from "../../game/affinity";
import type { Merc } from "../../game/types";
import type { MercAI, ReplyContext } from "./types";

type MercLines = {
  open: Record<Stage, string>;
  liked: string[];
  disliked: string[];
  indifferent: string[];
  accept: string;
  refuse: string;
  refuseEmotion: Emotion;
};

const LINES: Record<string, MercLines> = {
  varn: {
    open: {
      hostile: "또 너냐. 꺼져.",
      wary: "...할 말 있으면 짧게 해.",
      neutral: "앉아. 한 잔 정도는 들어주지.",
      warm: "왔나. 오늘은 무슨 얘기지.",
      trusted: "...네 등 뒤 정도는 지켜줄 수 있겠지.",
    },
    liked: ["...그래. 그런 말이면 들을 만하군.", "흥. 적어도 거짓말은 아니군."],
    disliked: ["입 조심해. 창끝은 아직 무뎌지지 않았어.", "그런 소리 할 거면 딴 데 가서 해."],
    indifferent: ["...그래서?", "용병한테 꿈 같은 건 사치야."],
    accept: "...좋아. 이번 한 번만 창을 들지. 죽지 마라. 시체 묻는 건 질렸으니까.",
    refuse: "너랑 땅굴에 기어들어 갈 이유가 없어. 아직은.",
    refuseEmotion: "annoyed",
  },
  kass: {
    open: {
      hostile: "어이쿠, 또 오셨네. 이번엔 주머니 단속 잘 하라고.",
      wary: "뭐야, 의뢰야? 보수부터 말해.",
      neutral: "앉아, 앉아. 듣는 건 공짜니까.",
      warm: "왔어? 오늘은 재밌는 얘기 있어?",
      trusted: "너한테는 특별히 할인해 줄게. 농담 아냐... 반쯤은.",
    },
    liked: ["하! 이제야 말이 좀 통하네.", "그거 마음에 든다. 계속 해 봐."],
    disliked: ["착한 척은 딴 데 가서 해. 그런 놈들이 제일 먼저 죽더라.", "오, 감동적이네. 그래서 지갑은 어디 있고?"],
    indifferent: ["그래서, 돈 얘기는 언제 나와?", "흐응. 지루한데."],
    accept: "좋아, 계약 성립. 대신 내 몫 떼먹으면 자는 동안 목 조심해.",
    refuse: "미안, 난 손해 보는 장사는 안 해. 조건 다시 가져와.",
    refuseEmotion: "suspicious",
  },
  elke: {
    open: {
      hostile: "...가까이 오지 마십시오.",
      wary: "무슨 용건이신지요.",
      neutral: "앉으세요. 촛불이 꺼지기 전까지는 들어드리겠습니다.",
      warm: "오셨군요. 오늘은 다친 데가 없으신가요.",
      trusted: "당신을 위해 기도하는 것이, 요즘은 그리 어렵지 않습니다.",
    },
    liked: ["...그 말씀, 오래 기억하겠습니다.", "아직 그런 말을 하는 분이 계시는군요."],
    disliked: [
      "그런 말로 사람을 움직이려 하시는군요. 저도... 그런 명령을 따른 적이 있습니다.",
      "...잠시 기도할 시간을 주십시오. 당신을 위해서요.",
    ],
    indifferent: ["...듣고 있습니다.", "말씀하세요. 시간은 많지 않지만."],
    accept: "함께 가겠습니다. 누군가는 쓰러진 이들의 이름을 기억해야 하니까요.",
    refuse: "죄송합니다. 아직 당신에게 제 등을 맡길 수 없습니다.",
    refuseEmotion: "sad",
  },
};

const CHOICE_POOL: Record<ChoiceTone, string[]> = {
  respect: ["당신 같은 노련한 사람이 필요하오.", "명성은 들었소. 직접 이야기해 보고 싶었소.", "당신의 판단을 믿겠소."],
  honesty: ["솔직히 말하지. 살아 돌아온다는 보장은 없어.", "숨기지 않겠소. 이번 의뢰는 위험하오.", "나도 겁이 나. 그래서 사람이 필요해."],
  mercy: ["다친 데는 괜찮소? 치료부터 받으시오.", "싸우지 않아도 될 자들은 살려 보내고 싶소.", "당신 몫의 짐까지 내가 지겠소."],
  greed: ["던전 밑바닥엔 금이 쌓여 있다더군. 반씩 나누지.", "보수는 넉넉히 주겠소. 그거면 충분하지 않소?", "살아 나오면 평생 술값 걱정은 없을 거요."],
  threat: ["거절하면 이 마을에서 일감 구하기 힘들 거요.", "내 말을 무시하면 후회하게 될 거다.", "선택권이 있다고 생각하나?"],
  mockery: ["그 몸으로 무기는 들 수 있겠소?", "소문보다 별거 없군.", "여기 앉아 술이나 축내는 게 용병인가?"],
};

/** 자유 입력 분류용 키워드. 실제 AI 분류기가 들어오기 전까지의 근사치다. */
const KEYWORDS: [ChoiceTone, string[]][] = [
  ["threat", ["죽여", "죽인", "죽을", "베어", "협박", "가만 안", "후회", "각오"]],
  ["mockery", ["겁쟁이", "늙은이", "한심", "하찮", "웃기", "별거 없", "약해 빠"]],
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

/** 좋아하는 성향 1개, 싫어하는 성향 1개를 반드시 포함한 선택지 4개 */
export function mockChoices(merc: Merc, rand: () => number = Math.random): Choice[] {
  const liked = pick(likedTones(merc), rand);
  const disliked = pick(dislikedTones(merc), rand);
  const others = shuffle(
    ChoiceTone.options.filter((t) => t !== liked && t !== disliked),
    rand,
  ).slice(0, 2);
  return shuffle([liked, disliked, ...others], rand).map((tone) => ({
    tone,
    text: pick(CHOICE_POOL[tone], rand),
  }));
}

export function mockClassify(text: string): Tone {
  const normalized = text.replace(/\s+/g, " ");
  for (const [tone, words] of KEYWORDS) {
    if (words.some((w) => normalized.includes(w))) return tone;
  }
  return "neutral";
}

function linesFor(merc: Merc): MercLines {
  const lines = LINES[merc.id];
  if (!lines) throw new Error(`mock 대사가 없는 용병: ${merc.id}`);
  return lines;
}

export function createMockAI(rand: () => number = Math.random): MercAI {
  return {
    mode: "mock",
    async classify(text) {
      return mockClassify(text);
    },
    async reply({ merc, stage, event }: ReplyContext) {
      const lines = linesFor(merc);
      const choices = mockChoices(merc, rand);

      switch (event.kind) {
        case "open":
          return {
            message: lines.open[stage],
            emotion: stage === "hostile" ? "annoyed" : stage === "wary" ? "suspicious" : "neutral",
            choices,
          };
        case "talk": {
          // mock은 호감도 방향만 보고 대사를 고른다
          const kind = { up: "liked", down: "disliked", none: "indifferent" } as const;
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
        case "propose":
          return event.joined
            ? { message: lines.accept, emotion: "pleased", choices }
            : { message: lines.refuse, emotion: lines.refuseEmotion, choices };
      }
    },
  };
}
