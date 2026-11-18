// 던전 사건 틀. 결과(확률·효과)는 여기 코드가 정한다.
// AI는 상황 묘사와 선택지 문장만 파티에 맞게 다시 쓴다. AI가 없으면 여기 기본 문장을 그대로 쓴다.
// 결과 문장의 {who}는 효과를 받은 용병, {helper}는 조건에 맞아 나선 용병 이름으로 바뀐다.
//
// 해결 방법은 기본 세 갈래: 아이템을 쓴다(item) / 맞는 사람이 나선다(person) / 위험을 감수한다(risk).
// 그 밖에 태도가 드러나는 선택(묻어 준다, 비웃는다 등)과 지나치기(other)를 더할 수 있다.
import type { ChoiceTone, Stage } from "../lib/schemas";
import type { StatusKind, SupplyKind } from "./combat";

export type EventEffect = {
  /** 살아 있는 모두 회복 */
  healAll?: number;
  /** 무작위 한 명 피해 (사건 피해로는 쓰러지지 않는다, 최소 체력 1) */
  damageOne?: number;
  /** 살아 있는 모두 피해 (쓰러지지 않는다) */
  damageAll?: number;
  /** 무작위 한 명에게 상태이상 */
  status?: StatusKind;
  /** 모두의 출혈·중독을 씻는다 */
  cureAll?: boolean;
  /** 물자 증감 */
  supply?: Partial<Record<SupplyKind, number>>;
};

export type EventOutcome = {
  weight: number;
  text: string;
  effect: EventEffect;
};

/** 해결 방식. 화면에 표시하고, 사건을 짤 때 세 갈래가 다 있는지 확인한다 */
export type Approach = "item" | "person" | "risk" | "other";

/**
 * 선택지를 고르기 위한 조건. 맞지 않으면 고를 수 없다 (화면에 이유가 보인다).
 * items: 들고 있어야 하는 물자 (나중에 아이템이 생기면 아이템 id도 받는다)
 * job·race: 살아 있는 동료 중 이 직업·종족이 있어야 한다 (그 사람이 {helper}가 된다)
 * bond: 살아 있는 동료 중 이 호감 단계 이상인 사람이 있어야 한다
 */
export type EventRequirement = {
  items?: Partial<Record<SupplyKind, number>>;
  job?: string;
  race?: string;
  bond?: Stage;
};

/** 숨겨진 칸·이어지는 사건 (구조만 있다. 맵 쪽이 아직 읽지 않는다) */
export type EventUnlock = { kind: "hiddenNode"; id: string } | { kind: "followUp"; eventId: string };

export type EventChoice = {
  id: string;
  /** 기본 선택지 문장 (AI가 다시 쓸 수 있다) */
  text: string;
  approach: Approach;
  /** 이 선택의 태도. 용병들이 반응표대로 반응한다. null이면 반응 없음 */
  tone: ChoiceTone | null;
  requires?: EventRequirement;
  /** 고르면 결과와 상관없이 쓰는 물자 */
  consumes?: Partial<Record<SupplyKind, number>>;
  /** 고르면 결과와 상관없이 받는 고정 보상 (나중에 아이템 보상도) */
  rewards?: EventEffect;
  unlocks?: EventUnlock[];
  outcomes: EventOutcome[];
};

export type EventTemplate = {
  id: string;
  title: string;
  /** 기본 상황 묘사 (AI가 다시 쓸 수 있다) */
  intro: string;
  /** AI에게 주는 상황 요약. 이 사실은 바꾸지 말라고 한다 */
  facts: string;
  choices: EventChoice[];
};

const once = (text: string, effect: EventEffect = {}): EventOutcome[] => [{ weight: 1, text, effect }];
const leave = (text: string, said = "그냥 지나친다."): EventChoice => ({
  id: "leave",
  text: said,
  approach: "other",
  tone: null,
  outcomes: once(text),
});

export const EVENTS: EventTemplate[] = [
  {
    id: "fallen_adventurer",
    title: "쓰러진 모험가",
    intro: "통로 구석에 모험가 하나가 벽에 기댄 채 죽어 있다. 허리춤의 가방이 아직 불룩하다.",
    facts: "죽은 지 얼마 안 된 모험가의 시체. 가방이 있다. 시체가 다시 움직일 수도 있다. 해독제로 정화하거나 성직자가 잠재우면 안전하다.",
    choices: [
      {
        id: "purify",
        text: "해독제를 뿌려 시체를 정화한 뒤 가방을 연다.",
        approach: "item",
        tone: null,
        requires: { items: { antidote: 1 } },
        consumes: { antidote: 1 },
        outcomes: once("정화된 시체는 끝내 움직이지 않았다. 가방에서 물약과 붕대를 찾았다.", { supply: { potion: 1, bandage: 1 } }),
      },
      {
        id: "rite",
        text: "성직자에게 짧은 장례 기도를 부탁한다.",
        approach: "person",
        tone: "mercy",
        requires: { job: "nun" },
        outcomes: once("{helper}의 기도가 끝나자 시체가 편히 눈을 감았다. 남은 물약을 챙기고 모두 숨을 골랐다.", { healAll: 3, supply: { potion: 1 } }),
      },
      {
        id: "loot",
        text: "그냥 가방을 뒤진다.",
        approach: "risk",
        tone: "greed",
        outcomes: [
          { weight: 7, text: "가방 안에서 물약과 붕대를 찾았다.", effect: { supply: { potion: 1, bandage: 1 } } },
          { weight: 3, text: "손을 뻗는 순간 시체가 눈을 떴다! {who}이(가) 할퀴어 피를 흘린다.", effect: { damageOne: 5, status: "bleed" } },
        ],
      },
      {
        id: "bury",
        text: "돌을 덮어 묻어 준다.",
        approach: "other",
        tone: "mercy",
        outcomes: once("돌무덤을 쌓는 동안 모두 숨을 골랐다.", { healAll: 3 }),
      },
    ],
  },
  {
    id: "strange_spring",
    title: "수상한 샘",
    intro: "바위틈에서 맑은 물이 솟는다. 던전 한가운데라기엔 지나치게 깨끗하다.",
    facts: "던전 안의 맑은 샘. 약효가 있을 수도, 독이 있을 수도 있다. 해독제를 섞거나 약초를 아는 사람이 살피면 안전하다.",
    choices: [
      {
        id: "dose",
        text: "해독제를 몇 방울 섞어 마신다.",
        approach: "item",
        tone: null,
        requires: { items: { antidote: 1 } },
        consumes: { antidote: 1 },
        outcomes: once("독기가 가라앉은 물이 몸에 스며든다. 상처가 아물기 시작했다.", { healAll: 6 }),
      },
      {
        id: "check",
        text: "약초를 아는 동료에게 물을 살펴보게 한다.",
        approach: "person",
        tone: null,
        requires: { job: "herbalist" },
        outcomes: once("{helper}이(가) 물 냄새를 맡고 괜찮다고 했다. 모두 마시고 기운을 차렸다.", { healAll: 6 }),
      },
      {
        id: "drink",
        text: "모두 한 모금씩 마신다.",
        approach: "risk",
        tone: null,
        outcomes: [
          { weight: 1, text: "몸에 힘이 돈다. 상처가 아물기 시작했다.", effect: { healAll: 6 } },
          { weight: 1, text: "물맛이 쓰다. {who}이(가) 배를 움켜쥔다.", effect: { status: "poison" } },
        ],
      },
      leave("샘을 지나쳤다. 등 뒤에서 물소리가 오래 들렸다.", "손대지 않는다."),
    ],
  },
  {
    id: "trapped_child",
    title: "덫에 걸린 아이",
    intro: "쇠덫에 발이 물린 수인 아이가 이를 드러내며 떨고 있다. 목에 작은 꾸러미가 걸려 있다.",
    facts: "덫에 걸린 어린 수인. 맨손으로 풀면 다치기 쉽다. 붕대로 이빨을 감싸거나, 덫을 아는 드워프가 풀면 안전하다. 아이는 약초 꾸러미를 지니고 있다.",
    choices: [
      {
        id: "wrap",
        text: "붕대로 덫의 이빨을 감싸 벌린다.",
        approach: "item",
        tone: "mercy",
        requires: { items: { bandage: 1 } },
        consumes: { bandage: 1 },
        outcomes: once("덫이 힘없이 벌어졌다. 아이는 꾸러미를 던져 주고 어둠 속으로 사라졌다.", { supply: { antidote: 1 } }),
      },
      {
        id: "disarm",
        text: "덫을 아는 동료에게 맡긴다.",
        approach: "person",
        tone: "mercy",
        requires: { race: "dwarf" },
        outcomes: once("{helper}이(가) 덫의 이음새를 단숨에 풀었다. 아이는 꾸러미를 던져 주고 사라졌다.", { supply: { antidote: 1 } }),
      },
      {
        id: "rescue",
        text: "맨손으로 덫을 벌린다.",
        approach: "risk",
        tone: "mercy",
        outcomes: once("덫을 벌리다 {who}의 손이 찢어졌다. 아이는 꾸러미를 던져 주고 사라졌다.", { damageOne: 4, supply: { antidote: 1 } }),
      },
      {
        id: "extort",
        text: "꾸러미를 내놓으면 풀어 주겠다고 한다.",
        approach: "other",
        tone: "threat",
        outcomes: once("아이가 이를 갈며 꾸러미를 내밀었다.", { supply: { antidote: 1, bandage: 1 } }),
      },
      leave("등 뒤에서 아이의 울음소리가 멀어졌다.", "모른 척 지나간다."),
    ],
  },
  {
    id: "sealed_door",
    title: "봉인된 문",
    intro: "낯선 문양이 새겨진 돌문이 길을 막고 있다. 틈새로 차가운 바람이 새어 나온다.",
    facts: "오래된 봉인이 걸린 돌문. 부수면 몸이 상한다. 문양에 물약을 부으면 봉인이 녹고, 정령사는 봉인의 정령과 말을 나눠 연다. 안에 물자가 있을 수 있다.",
    choices: [
      {
        id: "pour",
        text: "문양에 물약을 부어 봉인을 녹인다.",
        approach: "item",
        tone: null,
        requires: { items: { potion: 1 } },
        consumes: { potion: 1 },
        outcomes: once("문양이 붉게 빛나다 스르르 꺼졌다. 안쪽 선반에 물약과 붕대가 남아 있었다.", { supply: { potion: 2, bandage: 1 } }),
      },
      {
        id: "commune",
        text: "정령과 말을 나눌 줄 아는 동료에게 맡긴다.",
        approach: "person",
        tone: "respect",
        requires: { job: "spiritcaller" },
        outcomes: once("{helper}이(가) 봉인에 깃든 정령과 말을 나누자 문이 열렸다. 안에 물약이 있었다.", { supply: { potion: 2 } }),
      },
      {
        id: "force",
        text: "힘으로 부순다.",
        approach: "risk",
        tone: null,
        outcomes: [
          { weight: 3, text: "문이 무너지며 파편이 튀었다. 안쪽 선반에 물자가 남아 있었다.", effect: { damageAll: 2, supply: { potion: 1, bandage: 1 } } },
          { weight: 2, text: "문은 부쉈지만 안은 텅 비어 있었다. 파편에 모두 긁혔다.", effect: { damageAll: 2 } },
        ],
      },
      leave("문을 두고 발길을 돌렸다.", "다른 길을 찾는다."),
    ],
  },
  {
    id: "wounded_digger",
    title: "다친 도굴꾼",
    intro: "다리를 다친 도굴꾼이 자루를 끌어안고 앉아 있다. 당신을 보자 살려 달라고 손을 뻗는다.",
    facts: "다리를 다친 인간 도굴꾼. 붕대나 약초가 있으면 살릴 수 있다. 자루에 물자가 있다. 도와주면 답례하고, 빼앗으려 하면 칼을 뽑을 수도 있다.",
    choices: [
      {
        id: "help",
        text: "붕대를 감아 준다.",
        approach: "item",
        tone: "mercy",
        requires: { items: { bandage: 1 } },
        consumes: { bandage: 1 },
        outcomes: once("도굴꾼은 고맙다며 자루에서 물약 두 병을 꺼내 주었다.", { supply: { potion: 2 } }),
      },
      {
        id: "treat",
        text: "약초를 아는 동료에게 치료를 부탁한다.",
        approach: "person",
        tone: "mercy",
        requires: { job: "herbalist" },
        outcomes: once("{helper}이(가) 들풀로 상처를 싸매 주었다. 도굴꾼은 물약 두 병을 내밀었다.", { supply: { potion: 2 } }),
      },
      {
        id: "rob",
        text: "자루를 빼앗는다.",
        approach: "risk",
        tone: "greed",
        outcomes: [
          { weight: 7, text: "도굴꾼의 자루를 빼앗았다. 그는 욕설을 퍼부으며 기어서 멀어졌다.", effect: { supply: { bandage: 1, antidote: 1 } } },
          { weight: 3, text: "도굴꾼이 숨겨 둔 칼을 휘둘렀다. {who}이(가) 베였다. 자루는 챙겼다.", effect: { damageOne: 4, status: "bleed", supply: { bandage: 1 } } },
        ],
      },
      {
        id: "mock",
        text: "도굴꾼 주제에 운이 다했다고 비웃는다.",
        approach: "other",
        tone: "mockery",
        outcomes: once("도굴꾼의 저주를 뒤로하고 떠났다."),
      },
    ],
  },
  {
    id: "old_shrine",
    title: "오래된 제단",
    intro: "무너진 벽 사이에 작은 제단이 남아 있다. 누군가 최근에 초를 밝힌 흔적이 있다.",
    facts: "이름 모를 신의 작은 제단. 공물을 바치거나 성직자가 기도하면 확실히 응답한다. 그냥 기도하면 응답할 수도, 안 할 수도 있다. 공물을 훔치면 벌을 받을 수 있다.",
    choices: [
      {
        id: "offer",
        text: "물약 한 병을 공물로 바친다.",
        approach: "item",
        tone: "respect",
        requires: { items: { potion: 1 } },
        consumes: { potion: 1 },
        outcomes: once("제단이 희미하게 빛났다. 상처와 독이 씻겨 나갔다.", { healAll: 6, cureAll: true }),
      },
      {
        id: "liturgy",
        text: "성직자에게 기도를 맡긴다.",
        approach: "person",
        tone: "respect",
        requires: { job: "nun" },
        outcomes: once("{helper}의 기도에 제단이 희미하게 빛났다. 상처와 독이 씻겨 나갔다.", { healAll: 5, cureAll: true }),
      },
      {
        id: "pray",
        text: "잠시 기도를 올린다.",
        approach: "risk",
        tone: "respect",
        outcomes: [
          { weight: 1, text: "따뜻한 기운이 스쳐 갔다.", effect: { healAll: 5 } },
          { weight: 1, text: "아무 일도 일어나지 않았다.", effect: {} },
        ],
      },
      {
        id: "steal",
        text: "공물을 챙긴다.",
        approach: "other",
        tone: "mockery",
        outcomes: [
          { weight: 1, text: "공물 사이에서 물약을 찾았다.", effect: { supply: { potion: 1 } } },
          { weight: 1, text: "공물을 집자 촛불이 꺼졌다. {who}의 몸에 한기가 스며든다.", effect: { supply: { potion: 1 }, status: "poison" } },
        ],
      },
      leave("제단의 촛불이 일행의 뒷모습을 비췄다."),
    ],
  },
  {
    id: "collapsing_tunnel",
    title: "무너지는 통로",
    intro: "천장에서 돌가루가 쏟아진다. 통로 전체가 곧 무너질 듯 삐걱거린다.",
    facts: "곧 무너질 통로. 붕대를 꼬아 기둥을 묶거나, 드워프가 버틸 기둥을 짚거나, 길안내자가 깊이 믿는 동료가 앞장서면 무사하다. 그냥 지나면 다칠 수 있다.",
    choices: [
      {
        id: "brace",
        text: "붕대를 꼬아 흔들리는 기둥을 묶는다.",
        approach: "item",
        tone: null,
        requires: { items: { bandage: 1 } },
        consumes: { bandage: 1 },
        outcomes: once("묶은 기둥이 버티는 사이 모두 통로를 빠져나왔다."),
      },
      {
        id: "read",
        text: "돌을 아는 동료에게 버틸 기둥을 찾게 한다.",
        approach: "person",
        tone: null,
        requires: { race: "dwarf" },
        outcomes: once("{helper}이(가) 버틸 기둥을 짚어 주었다. 모두 무사히 지났다."),
      },
      {
        id: "lead",
        text: "가장 믿는 동료에게 앞장서 길을 살피게 한다.",
        approach: "person",
        tone: "respect",
        requires: { bond: "trusted" },
        outcomes: once("{helper}이(가) 망설임 없이 앞장섰다. 그 뒤를 따라 모두 무사히 지났다."),
      },
      {
        id: "careful",
        text: "기둥을 살피며 조심히 지난다.",
        approach: "risk",
        tone: null,
        outcomes: [
          { weight: 1, text: "무사히 통로를 지났다.", effect: {} },
          { weight: 1, text: "마지막 순간 천장이 내려앉았다. {who}이(가) 돌에 깔렸다가 겨우 빠져나왔다.", effect: { damageOne: 7 } },
        ],
      },
      {
        id: "rush",
        text: "전력으로 달려 빠져나간다.",
        approach: "other",
        tone: null,
        outcomes: once("떨어지는 돌을 맞으며 간신히 빠져나왔다.", { damageAll: 3 }),
      },
    ],
  },
];

export function getEvent(id: string): EventTemplate | undefined {
  return EVENTS.find((e) => e.id === id);
}
