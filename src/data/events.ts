// 던전 사건 틀. 결과(확률·효과)는 여기 코드가 정한다.
// AI는 상황 묘사와 선택지 문장만 파티에 맞게 다시 쓴다. AI가 없으면 여기 기본 문장을 그대로 쓴다.
// 결과 문장의 {who}는 효과를 받은 용병, {helper}는 조건에 맞아 나선 용병 이름으로 바뀐다.
//
// 해결 방법은 기본 세 갈래: 아이템을 쓴다(item) / 맞는 사람이 나선다(person) / 위험을 감수한다(risk).
// 그 밖에 태도가 드러나는 선택(묻어 준다, 비웃는다 등)과 지나치기(other)를 더할 수 있다.
import type { ChoiceTone, Stage } from "@/lib/schemas";
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
  /** 금화 (살아서 돌아와야 내 것이 된다) */
  gold?: number;
  /** 무작위 유물 개수 */
  relics?: number;
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
/** hiddenRegion: 이 층의 다음 갈래가 히든 지역으로 바뀐다 (data/regions.ts의 hidden) */
export type EventUnlock = { kind: "hiddenNode"; id: string } | { kind: "followUp"; eventId: string } | { kind: "hiddenRegion"; region: string };

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
  /** 히든 사건: 무작위 사건으로는 나오지 않고, 열쇠가 있을 때 정해진 지역에서만 나온다 */
  hidden?: boolean;
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
    title: "포자에 취한 모험가",
    intro: "버섯 더미 옆에 모험가 하나가 쿨쿨 잠들어 있다. 주위에 보랏빛 포자가 둥둥 떠다니고, 허리춤의 가방이 불룩하다.",
    facts: "잠 포자를 들이마시고 깨어나지 못하는 모험가. 가방이 있다. 가까이서 포자를 건드리면 중독될 수 있다. 해독제로 포자를 가라앉히거나 성직자가 정신을 맑게 하면 안전하게 깨울 수 있고, 깨어나면 답례한다.",
    choices: [
      {
        id: "purify",
        text: "해독제를 뿌려 포자를 가라앉히고 모험가를 깨운다.",
        approach: "item",
        tone: null,
        requires: { items: { antidote: 1 } },
        consumes: { antidote: 1 },
        outcomes: once("포자가 가라앉자 모험가가 콜록거리며 깨어났다. 고맙다며 물약과 붕대, 금화 주머니를 내밀었다.", { supply: { potion: 1, bandage: 1 }, gold: 15 }),
      },
      {
        id: "rite",
        text: "성직자에게 정신을 맑게 하는 기도를 부탁한다.",
        approach: "person",
        tone: "mercy",
        requires: { job: "priest" },
        outcomes: once("{helper}의 기도가 끝나자 모험가가 눈을 번쩍 떴다. 물약을 나눠 주고는 꾸벅 인사하고 떠났다. 모두 한숨 돌렸다.", { healAll: 3, supply: { potion: 1 } }),
      },
      {
        id: "loot",
        text: "깨우지 말고 가방만 뒤진다.",
        approach: "risk",
        tone: "greed",
        outcomes: [
          { weight: 7, text: "가방 안에서 물약과 붕대, 금화 주머니를 찾았다.", effect: { supply: { potion: 1, bandage: 1 }, gold: 15 } },
          { weight: 3, text: "가방을 들추다 버섯 더미를 건드렸다! {who}이(가) 포자를 잔뜩 들이마셨다.", effect: { damageOne: 5, status: "poison" } },
        ],
      },
      {
        id: "bury",
        text: "모험가를 포자가 없는 곳으로 옮겨 눕혀 준다.",
        approach: "other",
        tone: "mercy",
        outcomes: once("모험가를 그늘에 눕혀 주는 동안 모두 숨을 골랐다.", { healAll: 3 }),
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
        text: "숲을 잘 아는 궁수에게 물을 살펴보게 한다.",
        approach: "person",
        tone: null,
        requires: { job: "archer" },
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
        outcomes: once("덫이 힘없이 벌어졌다. 아이는 꾸러미를 던져 주고 수풀 속으로 사라졌다.", { supply: { antidote: 1 } }),
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
        outcomes: once("문양이 붉게 빛나다 스르르 꺼졌다. 안쪽 선반에 물약과 붕대, 오래된 유물이 남아 있었다.", { supply: { potion: 2, bandage: 1 }, relics: 1 }),
      },
      {
        id: "commune",
        text: "정령과 말을 나눌 줄 아는 엘프 동료에게 맡긴다.",
        approach: "person",
        tone: "respect",
        requires: { race: "elf" },
        outcomes: once("{helper}이(가) 봉인에 깃든 정령과 말을 나누자 문이 열렸다. 안에 물약과 오래된 유물이 있었다.", { supply: { potion: 2 }, relics: 1 }),
      },
      {
        id: "force",
        text: "힘으로 부순다.",
        approach: "risk",
        tone: null,
        outcomes: [
          { weight: 3, text: "문이 무너지며 파편이 튀었다. 안쪽 선반에 물자와 유물이 남아 있었다.", effect: { damageAll: 2, supply: { potion: 1, bandage: 1 }, relics: 1 } },
          { weight: 2, text: "문은 부쉈지만 안은 텅 비어 있었다. 파편에 모두 긁혔다.", effect: { damageAll: 2 } },
        ],
      },
      leave("문을 두고 발길을 돌렸다.", "다른 길을 찾는다."),
    ],
  },
  {
    id: "wounded_digger",
    title: "다친 보물 사냥꾼",
    intro: "다리를 다친 보물 사냥꾼이 자루를 끌어안고 앉아 있다. 당신을 보자 살려 달라고 손을 뻗는다.",
    facts: "다리를 다친 인간 보물 사냥꾼. 붕대나 약초가 있으면 살릴 수 있다. 자루에 물자가 있다. 도와주면 답례하고, 빼앗으려 하면 칼을 뽑을 수도 있다.",
    choices: [
      {
        id: "help",
        text: "붕대를 감아 준다.",
        approach: "item",
        tone: "mercy",
        requires: { items: { bandage: 1 } },
        consumes: { bandage: 1 },
        outcomes: once("보물 사냥꾼은 고맙다며 자루에서 물약 두 병을 꺼내 주었다.", { supply: { potion: 2 } }),
      },
      {
        id: "treat",
        text: "성직자에게 치료를 부탁한다.",
        approach: "person",
        tone: "mercy",
        requires: { job: "priest" },
        outcomes: once("{helper}이(가) 들풀로 상처를 싸매 주었다. 보물 사냥꾼은 물약 두 병을 내밀었다.", { supply: { potion: 2 } }),
      },
      {
        id: "rob",
        text: "자루를 빼앗는다.",
        approach: "risk",
        tone: "greed",
        outcomes: [
          { weight: 7, text: "보물 사냥꾼의 자루를 빼앗았다. 금화와 유물이 들어 있었다. 그는 욕설을 퍼부으며 기어서 멀어졌다.", effect: { supply: { bandage: 1, antidote: 1 }, gold: 20, relics: 1 } },
          { weight: 3, text: "보물 사냥꾼이 숨겨 둔 칼을 휘둘렀다. {who}이(가) 베였다. 자루는 챙겼다.", effect: { damageOne: 4, status: "bleed", supply: { bandage: 1 } } },
        ],
      },
      {
        id: "mock",
        text: "보물 사냥꾼 주제에 운이 다했다고 비웃는다.",
        approach: "other",
        tone: "mockery",
        outcomes: once("보물 사냥꾼의 투덜거림을 뒤로하고 떠났다."),
      },
    ],
  },
  {
    id: "old_shrine",
    title: "오래된 제단",
    intro: "이끼 낀 바위 사이에 작은 제단이 있다. 누군가 최근에 꽃을 놓고 간 흔적이 있다.",
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
        requires: { job: "priest" },
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
          { weight: 1, text: "공물 사이에서 물약과 금화를 찾았다.", effect: { supply: { potion: 1 }, gold: 20 } },
          { weight: 1, text: "공물을 집자 촛불이 꺼졌다. {who}의 몸에 한기가 스며든다.", effect: { supply: { potion: 1 }, status: "poison" } },
        ],
      },
      leave("제단의 꽃잎이 바람에 살랑거렸다."),
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

  // ── 히든 사건 (열쇠가 있을 때만. data/regions.ts의 hidden.event) ──
  {
    id: "whispering_grove",
    title: "속삭이는 숲",
    hidden: true,
    intro: "짐 속의 세계수의 가지가 희미하게 빛나기 시작한다. 숲 저편에서 누군가 부르는 듯한 속삭임이 들려온다.",
    facts:
      "세계수의 가지가 숲 깊은 곳의 타락한 정령들에게 반응했다. 속삭임을 따라가면 다음 층이 '타락한 엘프의 숲'이 된다 (위험하지만 보상이 크다). 무시하면 원래 길로 간다. 파티에 엘프가 있으면 그 엘프가 속삭임이 고대 엘프어라는 것을 알아듣고 먼저 반응한다. 엘프가 없으면 아무도 말뜻을 모른다.",
    choices: [
      {
        id: "follow",
        text: "가지가 가리키는 쪽으로, 속삭임을 따라간다.",
        approach: "risk",
        tone: null,
        unlocks: [{ kind: "hiddenRegion", region: "uf_corrupted_forest" }],
        outcomes: once("가지의 빛이 점점 짙어진다. 발밑의 풀이 검게 물들기 시작했다. 다음 길은 타락한 숲으로 이어진다."),
      },
      {
        id: "listen",
        text: "엘프 동료에게 속삭임을 들어 보게 한다.",
        approach: "person",
        tone: "respect",
        requires: { race: "elf" },
        unlocks: [{ kind: "hiddenRegion", region: "uf_corrupted_forest" }],
        outcomes: once("{helper}이(가) 눈을 감고 귀를 기울이더니, 숲이 도와 달라고 한다고 말했다. 숲의 축복이 상처를 어루만진다. 다음 길은 타락한 숲으로 이어진다.", { healAll: 5 }),
      },
      leave("빛이 천천히 사그라들었다. 속삭임도 더는 들리지 않는다.", "속삭임을 못 들은 척하고 원래 길로 간다."),
    ],
  },
  {
    id: "crimson_summons",
    title: "핏빛 부름",
    hidden: true,
    intro: "핏빛 초대장의 밀랍이 저절로 녹아내린다. 예배당 제단 뒤로 붉은 융단이 깔린 계단이 나타났다.",
    facts:
      "핏빛 초대장이 뱀파이어 성으로 가는 길을 열었다. 계단을 내려가면 다음 층이 '뱀파이어 성'이 된다 (매우 위험하다). 무시하면 계단이 사라진다.",
    choices: [
      {
        id: "descend",
        text: "초대에 응해 붉은 계단을 내려간다.",
        approach: "risk",
        tone: null,
        unlocks: [{ kind: "hiddenRegion", region: "fm_vampire_castle" }],
        outcomes: once("계단 아래에서 차가운 바람이 올라온다. 다음 길은 뱀파이어 성으로 이어진다."),
      },
      leave("초대장이 다시 굳고, 계단은 그림자 속으로 사라졌다.", "초대를 무시한다."),
    ],
  },
];

export function getEvent(id: string): EventTemplate | undefined {
  return EVENTS.find((e) => e.id === id);
}
