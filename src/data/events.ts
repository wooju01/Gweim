// 던전 사건 틀. 결과(확률·효과)는 여기 코드가 정한다.
// AI는 상황 묘사와 선택지 문장만 파티에 맞게 다시 쓴다. AI가 없으면 여기 기본 문장을 그대로 쓴다.
// 결과 문장의 {who}는 효과를 받은 용병, {helper}는 조건에 맞아 도와준 용병 이름으로 바뀐다.
import type { ChoiceTone } from "../lib/schemas";
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

/** 파티에 이 직업이나 종족이 있으면 결과 표가 바뀐다 */
export type Expertise = { job?: string; race?: string; outcomes: EventOutcome[] };

export type EventChoice = {
  id: string;
  /** 기본 선택지 문장 (AI가 다시 쓸 수 있다) */
  text: string;
  /** 이 선택의 태도. 용병들이 반응표대로 반응한다. null이면 반응 없음 */
  tone: ChoiceTone | null;
  /** 이 물자가 있어야 고를 수 있다 */
  needs?: Partial<Record<SupplyKind, number>>;
  outcomes: EventOutcome[];
  expertise?: Expertise;
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

const nothing = (text: string): EventOutcome[] => [{ weight: 1, text, effect: {} }];

export const EVENTS: EventTemplate[] = [
  {
    id: "fallen_adventurer",
    title: "쓰러진 모험가",
    intro: "통로 구석에 모험가 하나가 벽에 기댄 채 죽어 있다. 허리춤의 가방이 아직 불룩하다.",
    facts: "죽은 지 얼마 안 된 모험가의 시체. 가방이 있다. 시체가 다시 움직일 수도 있다.",
    choices: [
      {
        id: "loot",
        text: "가방을 뒤진다.",
        tone: "greed",
        outcomes: [
          { weight: 7, text: "가방 안에서 물약과 붕대를 찾았다.", effect: { supply: { potion: 1, bandage: 1 } } },
          { weight: 3, text: "손을 뻗는 순간 시체가 눈을 떴다! {who}이(가) 할퀴어 피를 흘린다.", effect: { damageOne: 5, status: "bleed" } },
        ],
      },
      {
        id: "bury",
        text: "돌을 덮어 묻어 준다.",
        tone: "mercy",
        outcomes: [{ weight: 1, text: "돌무덤을 쌓는 동안 모두 숨을 골랐다.", effect: { healAll: 3 } }],
      },
      { id: "leave", text: "그냥 지나친다.", tone: null, outcomes: nothing("시체를 뒤로하고 걸음을 옮겼다.") },
    ],
  },
  {
    id: "strange_spring",
    title: "수상한 샘",
    intro: "바위틈에서 맑은 물이 솟는다. 던전 한가운데라기엔 지나치게 깨끗하다.",
    facts: "던전 안의 맑은 샘. 약효가 있을 수도, 독이 있을 수도 있다. 약초를 아는 사람은 구별할 수 있다.",
    choices: [
      {
        id: "drink",
        text: "모두 한 모금씩 마신다.",
        tone: null,
        outcomes: [
          { weight: 1, text: "몸에 힘이 돈다. 상처가 아물기 시작했다.", effect: { healAll: 6 } },
          { weight: 1, text: "물맛이 쓰다. {who}이(가) 배를 움켜쥔다.", effect: { status: "poison" } },
        ],
        expertise: {
          job: "herbalist",
          outcomes: [{ weight: 1, text: "{helper}이(가) 물 냄새를 맡고 괜찮다고 했다. 모두 마시고 기운을 차렸다.", effect: { healAll: 6 } }],
        },
      },
      {
        id: "fill",
        text: "물통에 담아 간다.",
        tone: null,
        outcomes: [
          { weight: 3, text: "샘물을 담았다. 약으로 쓸 수 있겠다.", effect: { supply: { potion: 1 } } },
          { weight: 2, text: "담는 사이 물이 탁해졌다. 버릴 수밖에 없었다.", effect: {} },
        ],
      },
      { id: "leave", text: "손대지 않는다.", tone: null, outcomes: nothing("샘을 지나쳤다. 등 뒤에서 물소리가 오래 들렸다.") },
    ],
  },
  {
    id: "trapped_child",
    title: "덫에 걸린 아이",
    intro: "쇠덫에 발이 물린 수인 아이가 이를 드러내며 떨고 있다. 목에 작은 꾸러미가 걸려 있다.",
    facts: "덫에 걸린 어린 수인. 덫을 풀다 다칠 수 있다. 아이는 약초 꾸러미를 지니고 있다.",
    choices: [
      {
        id: "rescue",
        text: "덫을 풀어 준다.",
        tone: "mercy",
        outcomes: [
          { weight: 1, text: "덫을 벌리다 {who}의 손이 찢어졌다. 아이는 꾸러미를 던져 주고 어둠 속으로 사라졌다.", effect: { damageOne: 4, supply: { antidote: 1 } } },
        ],
        expertise: {
          race: "dwarf",
          outcomes: [{ weight: 1, text: "{helper}이(가) 덫의 이음새를 단숨에 풀었다. 아이는 꾸러미를 던져 주고 사라졌다.", effect: { supply: { antidote: 1 } } }],
        },
      },
      {
        id: "extort",
        text: "꾸러미를 내놓으면 풀어 주겠다고 한다.",
        tone: "threat",
        outcomes: [{ weight: 1, text: "아이가 이를 갈며 꾸러미를 내밀었다.", effect: { supply: { antidote: 1, bandage: 1 } } }],
      },
      { id: "leave", text: "모른 척 지나간다.", tone: null, outcomes: nothing("등 뒤에서 아이의 울음소리가 멀어졌다.") },
    ],
  },
  {
    id: "sealed_door",
    title: "봉인된 문",
    intro: "낯선 문양이 새겨진 돌문이 길을 막고 있다. 틈새로 차가운 바람이 새어 나온다.",
    facts: "오래된 봉인이 걸린 돌문. 부수면 몸이 상하고, 봉인을 읽을 줄 알면 안전하게 열린다. 안에 물자가 있을 수 있다.",
    choices: [
      {
        id: "force",
        text: "힘으로 부순다.",
        tone: null,
        outcomes: [
          { weight: 3, text: "문이 무너지며 파편이 튀었다. 안쪽 선반에 물자가 남아 있었다.", effect: { damageAll: 2, supply: { potion: 1, bandage: 1 } } },
          { weight: 2, text: "문은 부쉈지만 안은 텅 비어 있었다. 파편에 모두 긁혔다.", effect: { damageAll: 2 } },
        ],
      },
      {
        id: "study",
        text: "문양을 살펴본다.",
        tone: null,
        outcomes: [
          { weight: 2, text: "문양을 짚어 가자 문이 스르르 열렸다. 안에 물약이 있었다.", effect: { supply: { potion: 2 } } },
          { weight: 3, text: "잘못 짚은 문양에서 검은 연기가 피어올랐다. {who}이(가) 연기를 들이마셨다.", effect: { status: "poison" } },
        ],
        expertise: {
          job: "spiritcaller",
          outcomes: [{ weight: 1, text: "{helper}이(가) 봉인에 깃든 정령과 말을 나누자 문이 열렸다. 안에 물약이 있었다.", effect: { supply: { potion: 2 } } }],
        },
      },
      { id: "leave", text: "다른 길을 찾는다.", tone: null, outcomes: nothing("문을 두고 발길을 돌렸다.") },
    ],
  },
  {
    id: "wounded_digger",
    title: "다친 도굴꾼",
    intro: "다리를 다친 도굴꾼이 자루를 끌어안고 앉아 있다. 당신을 보자 살려 달라고 손을 뻗는다.",
    facts: "다리를 다친 인간 도굴꾼. 붕대가 필요하다. 자루에 물자가 있다. 도와주면 답례하고, 빼앗을 수도 있다.",
    choices: [
      {
        id: "help",
        text: "붕대를 감아 준다.",
        tone: "mercy",
        needs: { bandage: 1 },
        outcomes: [{ weight: 1, text: "도굴꾼은 고맙다며 자루에서 물약 두 병을 꺼내 주었다.", effect: { supply: { bandage: -1, potion: 2 } } }],
      },
      {
        id: "rob",
        text: "자루를 빼앗는다.",
        tone: "greed",
        outcomes: [{ weight: 1, text: "도굴꾼의 자루를 빼앗았다. 그는 욕설을 퍼부으며 기어서 멀어졌다.", effect: { supply: { bandage: 1, antidote: 1 } } }],
      },
      {
        id: "mock",
        text: "도굴꾼 주제에 운이 다했다고 비웃는다.",
        tone: "mockery",
        outcomes: nothing("도굴꾼의 저주를 뒤로하고 떠났다."),
      },
    ],
  },
  {
    id: "old_shrine",
    title: "오래된 제단",
    intro: "무너진 벽 사이에 작은 제단이 남아 있다. 누군가 최근에 초를 밝힌 흔적이 있다.",
    facts: "이름 모를 신의 작은 제단. 기도하면 가호가 내릴 수도 있다. 공물을 훔칠 수도 있지만 벌을 받을 수 있다. 성직자가 기도하면 확실히 응답한다.",
    choices: [
      {
        id: "pray",
        text: "잠시 기도를 올린다.",
        tone: "respect",
        outcomes: [
          { weight: 1, text: "따뜻한 기운이 스쳐 갔다.", effect: { healAll: 5 } },
          { weight: 1, text: "아무 일도 일어나지 않았다.", effect: {} },
        ],
        expertise: {
          job: "nun",
          outcomes: [{ weight: 1, text: "{helper}의 기도에 제단이 희미하게 빛났다. 상처와 독이 씻겨 나갔다.", effect: { healAll: 5, cureAll: true } }],
        },
      },
      {
        id: "steal",
        text: "공물을 챙긴다.",
        tone: "mockery",
        outcomes: [
          { weight: 1, text: "공물 사이에서 물약을 찾았다.", effect: { supply: { potion: 1 } } },
          { weight: 1, text: "공물을 집자 촛불이 꺼졌다. {who}의 몸에 한기가 스며든다.", effect: { supply: { potion: 1 }, status: "poison" } },
        ],
      },
      { id: "leave", text: "그냥 지나간다.", tone: null, outcomes: nothing("제단의 촛불이 일행의 뒷모습을 비췄다.") },
    ],
  },
  {
    id: "collapsing_tunnel",
    title: "무너지는 통로",
    intro: "천장에서 돌가루가 쏟아진다. 통로 전체가 곧 무너질 듯 삐걱거린다.",
    facts: "곧 무너질 통로. 빨리 뛰면 모두 조금씩 다치고, 조심히 지나면 한 명이 크게 다칠 수 있다. 드워프는 무너질 곳을 알아본다.",
    choices: [
      {
        id: "rush",
        text: "전력으로 달려 빠져나간다.",
        tone: null,
        outcomes: [{ weight: 1, text: "떨어지는 돌을 맞으며 간신히 빠져나왔다.", effect: { damageAll: 3 } }],
      },
      {
        id: "careful",
        text: "기둥을 살피며 조심히 지난다.",
        tone: null,
        outcomes: [
          { weight: 1, text: "무사히 통로를 지났다.", effect: {} },
          { weight: 1, text: "마지막 순간 천장이 내려앉았다. {who}이(가) 돌에 깔렸다가 겨우 빠져나왔다.", effect: { damageOne: 7 } },
        ],
        expertise: {
          race: "dwarf",
          outcomes: [{ weight: 1, text: "{helper}이(가) 버틸 기둥을 짚어 주었다. 모두 무사히 지났다.", effect: {} }],
        },
      },
    ],
  },
];

export function getEvent(id: string): EventTemplate | undefined {
  return EVENTS.find((e) => e.id === id);
}
