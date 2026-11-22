// 던전 사건 틀. 결과(확률·효과)는 여기 코드가 정한다.
// AI는 상황 묘사와 선택지 문장만 파티에 맞게 다시 쓴다. AI가 없으면 여기 기본 문장을 그대로 쓴다.
// 결과 문장의 {who}는 효과를 받은 용병, {helper}는 조건에 맞아 나선 용병 이름으로 바뀐다.
//
// 해결 방법은 기본 세 갈래: 아이템을 쓴다(item) / 맞는 사람이 나선다(person) / 위험을 감수한다(risk).
// 그 밖에 태도가 드러나는 선택(묻어 준다, 비웃는다 등)과 지나치기(other)를 더할 수 있다.
import type { ChoiceTone, Stage } from "@/lib/schemas";
import type { StatusKind, SupplyKind } from "./combat";
import type { MonsterTag } from "./monsters";
import type { Element } from "@/lib/schemas";

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
  // ── 2026-11-22 사건 확장 ──
  /** 유실물·재료 (id별 개수, 살아 돌아와야 창고로) */
  items?: Record<string, number>;
  /** 정해진 유물 (relics.ts의 id) */
  relic?: string;
  /** 이번 층 칸 +1 (지금 칸 다음에 전투 칸 하나가 끼어든다) */
  extraCell?: boolean;
  /** 다음 칸이 보물 칸이 된다 (지금 칸 다음에 보물 칸이 끼어든다) */
  treasureNext?: boolean;
  /** 다음 칸을 건너뛴다 */
  skipNext?: boolean;
  /** 다음 칸에 이 보스가 반드시 나온다 (보상 배율 ↑) */
  forceBoss?: { monsterId: string; rewardMul: number };
  /** 다음 전투: 공격 강화 / 회피 감소 / 우리가 기습 (적이 첫 차례를 쉰다) / 적이 기습 (우리가 첫 차례를 쉰다) / 정예 하나 더 */
  nextBattle?: NextBattle;
  /** 이번 층 몬스터 변화 (monster나 tag 중 하나) */
  floorMod?: FloorMod;
  /** 이번 층의 아직 안 간 전투 칸 하나가 보물 칸으로 드러난다 */
  revealTreasure?: boolean;
  /** 정보 해금 (data/quests.ts의 QUEST_INFO) */
  info?: string;
  /** 명성 ± (돌아올 때 반영) */
  fame?: number;
  /** 호감 ± (all: 살아 있는 모두, chooser: 나선 동료(없으면 무작위 한 명), random: 무작위 한 명) */
  affinity?: { target: "all" | "chooser" | "random"; delta: number };
  /** 돌아오면 용병이 고용비 없이 합류한다 (명 수) */
  recruit?: number;
  /** 돌아오면 시설 이용료 할인 */
  discount?: { facility: "forge" | "shop"; days: number };
  /** 저주: 앞으로 battles번의 전투 동안 이 상태로 시작한다 */
  curse?: { status: StatusKind; battles: number };
  /** 바로 전투 (몬스터 id, 앞에서 elites마리는 정예) */
  battle?: { monsters: string[]; elites?: number };
  /** 가진 유실물(팔 수 있는 것)을 판매가의 priceMul로 금화로 바꾼다 */
  sellLoot?: { priceMul: number };
};

/** 다음 전투 보정 (사건) */
export type NextBattle = "buff" | "debuff" | "ambush" | "enemyAmbush" | "elite";
/** 이번 층 몬스터 변화: 나오지 않음 / 전투마다 하나 줄어듦 / 회복 스킬 못 씀 / 강화 스킬 못 씀 / 적 기습 없음 */
export type FloorMod = { monster?: string; tag?: MonsterTag; mode: "disable" | "reduce" | "noHeal" | "noBuff" | "noAmbush" };
/** 몰래 통과: 살아 있는 동료 속도 합이 이 이상이어야 한다 */
export const SNEAK_SPEED_SUM = 22;

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
  /** 이 원소 조각을 낀 마법사 (스킬 부 조각 또는 원소술사 원소) */
  element?: Element;
  /** 살아 있는 동료 속도 합 (몰래 통과) */
  speedSum?: number;
  /** 이 중 하나라도 맞으면 (예: 사제 또는 엘프) */
  any?: EventRequirement[];
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
  /** 구출 의뢰: 이 선택을 고르면 사람을 구한 것으로 친다 */
  rescue?: boolean;
  /** 원정에서 번 금화를 낸다 (떠돌이 상인, 늪 마녀) */
  costGold?: number;
  /** 원정에서 찾은 유물을 낸다 */
  costRelic?: number;
  /** 원정에서 찾은 유실물·재료를 낸다 */
  costItems?: Record<string, number>;
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
  /** 의뢰 사건: 무작위 사건으로는 나오지 않고, 구출 의뢰를 받았을 때 정해진 지역에서만 나온다 (data/quests.ts) */
  quest?: boolean;
  /** 나오는 지역 (data/regions.ts의 id). 없으면 공용 (어느 지역에서나) */
  region?: string;
};

const once = (text: string, effect: EventEffect = {}): EventOutcome[] => [{ weight: 1, text, effect }];

/** 나쁜 결과 (다치거나, 상태이상·저주·싸움·불리한 다음 전투) */
export function badOutcome(e: EventEffect): boolean {
  return !!(e.damageOne || e.damageAll || e.status || e.curse || e.battle || e.nextBattle === "debuff" || e.nextBattle === "enemyAmbush" || (e.affinity && e.affinity.delta < 0));
}

/** 선택지 성공 확률 (전술실 3레벨): 결과가 여럿일 때 나쁘지 않은 결과의 가중치 비율. 결과가 하나면 null */
export function choiceSuccess(choice: EventChoice): number | null {
  if (choice.outcomes.length < 2) return null;
  const total = choice.outcomes.reduce((s, o) => s + o.weight, 0);
  return choice.outcomes.filter((o) => !badOutcome(o.effect)).reduce((s, o) => s + o.weight, 0) / total;
}
/** 무너지는 통로: 무사히 지나면 30% 확률로 유실물 하나 */
const safeFind = (text: string): EventOutcome[] => [
  { weight: 7, text, effect: {} },
  { weight: 3, text: `${text} 무너진 돌 틈에서 반짝이는 것을 주웠다.`, effect: { items: { shiny_trinket: 1 } } },
];
/** 확률이 나뉘는 결과 [가중치, 문장, 효과] */
const odds = (...xs: [number, string, EventEffect?][]): EventOutcome[] => xs.map(([weight, text, effect]) => ({ weight, text, effect: effect ?? {} }));
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
        outcomes: safeFind("묶은 기둥이 버티는 사이 모두 통로를 빠져나왔다."),
      },
      {
        id: "read",
        text: "돌을 아는 동료에게 버틸 기둥을 찾게 한다.",
        approach: "person",
        tone: null,
        requires: { race: "dwarf" },
        outcomes: safeFind("{helper}이(가) 버틸 기둥을 짚어 주었다. 모두 무사히 지났다."),
      },
      {
        id: "lead",
        text: "가장 믿는 동료에게 앞장서 길을 살피게 한다.",
        approach: "person",
        tone: "respect",
        requires: { bond: "trusted" },
        outcomes: safeFind("{helper}이(가) 망설임 없이 앞장섰다. 그 뒤를 따라 모두 무사히 지났다."),
      },
      {
        id: "careful",
        text: "기둥을 살피며 조심히 지난다.",
        approach: "risk",
        tone: null,
        outcomes: [
          { weight: 0.7, text: "무사히 통로를 지났다.", effect: {} },
          { weight: 0.3, text: "무사히 통로를 지났다. 무너진 돌 틈에서 반짝이는 것을 주웠다.", effect: { items: { shiny_trinket: 1 } } },
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

  // ══ 2026-11-22 사건 확장: 공용 5개 ══
  {
    id: "wandering_merchant",
    title: "떠돌이 상인",
    intro: "등에 커다란 짐을 진 상인이 모닥불 옆에서 손짓한다. \"던전 안에서도 장사는 하는 법이지!\"",
    facts: "던전을 떠도는 상인. 물약과 해독제를 비싸게 팔고, 유실물을 싸게 사 준다. 바드가 흥정하면 값을 깎아 준다. 짐을 훔칠 수도 있지만 들키면 소문이 난다.",
    choices: [
      { id: "potion", text: "물약을 산다 (금화 50).", approach: "other", tone: null, costGold: 50, outcomes: once("상인이 물약 한 병을 건넸다.", { supply: { potion: 1 } }) },
      { id: "antidote", text: "해독제를 산다 (금화 35).", approach: "other", tone: null, costGold: 35, outcomes: once("상인이 해독제를 건넸다.", { supply: { antidote: 1 } }) },
      { id: "sell", text: "들고 있는 유실물을 판다 (판매가의 80%).", approach: "other", tone: "greed", outcomes: once("상인이 유실물을 하나하나 살피더니 값을 쳐주었다.", { sellLoot: { priceMul: 0.8 } }) },
      { id: "haggle", text: "바드에게 흥정을 맡겨 물약을 산다 (금화 40).", approach: "person", tone: "honesty", requires: { job: "minstrel" }, costGold: 40, outcomes: once("{helper}의 너스레에 상인이 웃으며 값을 깎아 주었다.", { supply: { potion: 1 } }) },
      { id: "steal", text: "상인이 한눈파는 사이 짐을 턴다.", approach: "risk", tone: "greed", outcomes: odds([1, "물약 두 병을 슬쩍 챙겼다.", { supply: { potion: 2 } }], [1, "상인이 소리를 질렀다. 도둑 길드라는 소문이 퍼질 것이다.", { fame: -3 }]) },
      leave("상인에게 고개만 끄덕이고 지나쳤다."),
    ],
  },
  {
    id: "dying_campfire",
    title: "꺼진 모닥불",
    intro: "누군가 쓰고 간 모닥불 자리. 재가 아직 따뜻하다.",
    facts: "쉬어 갈 수 있는 자리. 마음 놓고 쉬면 많이 회복하지만 기습당할 수 있다. 경계하며 쉬면 덜 회복한다. 바드가 노래하면 모두의 마음이 풀린다.",
    choices: [
      { id: "rest", text: "불을 다시 지피고 푹 쉰다.", approach: "risk", tone: null, outcomes: odds([7, "모두 몸을 녹였다.", { healAll: 8 }], [3, "모두 몸을 녹였지만, 불빛을 보고 무언가 다가오는 기척이 있다.", { healAll: 8, nextBattle: "enemyAmbush" }]) },
      { id: "watch", text: "번갈아 경계하며 잠깐 쉰다.", approach: "other", tone: null, outcomes: once("짧게 숨을 돌렸다.", { healAll: 4 }) },
      { id: "song", text: "바드에게 노래를 청한다.", approach: "person", tone: "respect", requires: { job: "minstrel" }, outcomes: once("{helper}의 노래에 모두 웃음을 되찾았다.", { healAll: 4, affinity: { target: "all", delta: 2 } }) },
    ],
  },
  {
    id: "abandoned_gear",
    title: "버려진 장비 더미",
    intro: "녹슨 칼과 찢어진 가죽 갑옷이 무더기로 쌓여 있다. 누군가 급히 버리고 간 것 같다.",
    facts: "버려진 장비 더미. 뒤지면 쓸 만한 조각(기술 파편)이 나오지만 녹슨 날에 베일 수 있다. 드워프는 안전하게 골라낸다.",
    choices: [
      { id: "dig", text: "더미를 뒤진다.", approach: "risk", tone: null, outcomes: odds([7, "쓸 만한 조각을 골라냈다.", { items: { tech_shard: 1 } }], [3, "쓸 만한 조각을 골라냈지만, {who}이(가) 녹슨 날에 베였다.", { items: { tech_shard: 2 }, status: "bleed" }]) },
      { id: "dwarf", text: "드워프 동료에게 골라 달라고 한다.", approach: "person", tone: null, requires: { race: "dwarf" }, outcomes: once("{helper}이(가) 눈 깜짝할 새 쓸 만한 것만 추려 냈다.", { items: { tech_shard: 2 } }) },
      leave("장비 더미를 지나쳤다."),
    ],
  },
  {
    id: "old_map_scrap",
    title: "낡은 지도 조각",
    intro: "바위틈에 끼인 양피지 한 장. 이 층의 길이 그려져 있는 것 같다.",
    facts: "이 층의 지도 조각. 궁수나 엘프가 읽으면 숨은 보물 칸을 찾을 수 있다. 그냥 챙기면 팔 수 있는 유실물이 된다.",
    choices: [
      { id: "read", text: "궁수나 엘프에게 지도를 읽게 한다.", approach: "person", tone: null, requires: { any: [{ job: "archer" }, { race: "elf" }] }, outcomes: once("{helper}이(가) 지도의 표시를 짚었다. 이 층 어딘가에 숨은 보물이 있다.", { revealTreasure: true }) },
      { id: "keep", text: "그냥 챙긴다.", approach: "other", tone: null, outcomes: once("지도 조각을 품에 넣었다. 수집가가 살지도 모른다.", { items: { old_map: 1 } }) },
      { id: "guess", text: "대충 짐작해서 표시된 곳을 찾아간다.", approach: "risk", tone: null, outcomes: odds([1, "짐작이 맞았다! 숨은 보물 칸을 찾았다.", { revealTreasure: true }], [1, "엉뚱한 곳을 헤맸다. 길이 한 칸 늘어났다.", { extraCell: true }]) },
    ],
  },
  {
    id: "comrade_worry",
    title: "동료의 고민",
    intro: "동료 하나가 걸음을 늦추더니, 할 말이 있는 듯 머뭇거린다.",
    facts: "동료 하나가 고민을 털어놓으려 한다. 들어 주면 호감이 오르고, 무시하면 내려간다. 다른 동료에게 맡기면 둘 다 조금 가까워진다.",
    choices: [
      { id: "listen", text: "걸음을 멈추고 이야기를 들어 준다.", approach: "other", tone: "mercy", outcomes: once("{who}이(가) 한결 가벼운 얼굴이 되었다.", { affinity: { target: "chooser", delta: 6 } }) },
      { id: "ignore", text: "지금은 그럴 때가 아니라고 자른다.", approach: "risk", tone: "threat", outcomes: once("{who}이(가) 입을 다물었다.", { affinity: { target: "chooser", delta: -5 } }) },
      { id: "pass", text: "믿을 만한 동료에게 들어 주라고 부탁한다.", approach: "person", tone: "respect", requires: { bond: "warm" }, outcomes: once("{helper}이(가) 곁으로 가 어깨를 두드렸다.", { affinity: { target: "all", delta: 2 } }) },
    ],
  },

  // ══ 1층 미지의 숲 ══
  {
    id: "suspicious_chest",
    region: "uf_forest",
    title: "수상한 보물 상자",
    intro: "덤불 속에 반쯤 묻힌 상자. 자물쇠 주변에 수상한 긁힌 자국이 있다.",
    facts: "덫이 걸린 상자. 그냥 열면 덫이 튈 수 있다. 암살자는 덫을 풀 수 있다. 안에는 금화와 숫돌이 들어 있다.",
    choices: [
      { id: "open", text: "그냥 연다.", approach: "risk", tone: "greed", outcomes: odds([6, "상자 안에 금화와 숫돌이 들어 있었다.", { gold: 20, items: { mat_whetstone: 1 } }], [4, "철컥! 덫이 튀어 {who}이(가) 다쳤다.", { damageOne: 6 }]) },
      { id: "disarm", text: "암살자에게 덫을 풀게 한다.", approach: "person", tone: null, requires: { job: "assassin" }, outcomes: once("{helper}이(가) 덫을 조용히 풀었다. 안에는 금화와 숫돌이 있었다.", { gold: 20, items: { mat_whetstone: 1 } }) },
      leave("상자를 그대로 두고 지나쳤다."),
    ],
  },
  {
    id: "mushroom_patch",
    region: "uf_forest",
    title: "버섯 군락",
    intro: "알록달록한 버섯이 빽빽이 자라 있다. 몇몇은 먹음직스럽고, 몇몇은 수상하다.",
    facts: "먹을 수 있는 버섯과 독버섯이 섞여 있다. 아무거나 먹으면 회복하거나 중독된다. 사제나 엘프는 골라낼 수 있다. 채집하면 약재상에 팔 수 있다.",
    choices: [
      { id: "eat", text: "아무거나 먹어 본다.", approach: "risk", tone: null, outcomes: odds([1, "고소한 맛이다. 기운이 났다.", { healAll: 5 }], [1, "{who}이(가) 배를 움켜쥐었다. 독버섯이었다.", { status: "poison" }]) },
      { id: "sort", text: "사제나 엘프에게 먹을 것을 골라 달라고 한다.", approach: "person", tone: null, requires: { any: [{ job: "priest" }, { race: "elf" }] }, outcomes: once("{helper}이(가) 골라 준 버섯으로 배를 채웠다.", { healAll: 5 }) },
      { id: "pick", text: "먹지 말고 채집만 한다.", approach: "other", tone: null, outcomes: once("버섯을 한 움큼 땄다.", { items: { wild_mushroom: 2 } }) },
    ],
  },
  {
    id: "broken_cart",
    region: "uf_forest",
    title: "부서진 행상 수레",
    intro: "바퀴가 빠진 수레 옆에 행상인이 다리를 절며 서 있다.",
    facts: "다친 행상인. 붕대로 치료해 주면 금화와 물약으로 답례한다. 드워프가 수레를 고쳐 주면 다음 귀환 때 상점 할인을 약속한다. 수레를 털 수도 있지만 소문이 난다.",
    choices: [
      { id: "bandage", text: "붕대로 행상인의 다리를 감아 준다.", approach: "item", tone: "mercy", requires: { items: { bandage: 1 } }, consumes: { bandage: 1 }, outcomes: once("행상인이 고맙다며 금화와 물약을 내밀었다.", { gold: 20, supply: { potion: 1 } }) },
      { id: "fix", text: "드워프 동료에게 수레를 고쳐 달라고 한다.", approach: "person", tone: "mercy", requires: { race: "dwarf" }, outcomes: once("{helper}이(가) 바퀴를 끼워 넣었다. 행상인이 마을에 오면 싸게 주겠다고 했다.", { gold: 20, supply: { potion: 1 }, discount: { facility: "shop", days: 3 } }) },
      { id: "rob", text: "수레를 턴다.", approach: "risk", tone: "greed", outcomes: once("금화 주머니를 챙겼다. 행상인의 원망 어린 눈빛이 등에 꽂힌다.", { gold: 30, fame: -2 }) },
    ],
  },

  // ══ 2층 깊은 숲 ══
  {
    id: "vine_trial",
    region: "uf_deep_forest",
    title: "덩굴 정령의 시험",
    intro: "덩굴이 길을 막고 사람 모양으로 일어선다. \"숲에 무엇을 바치겠느냐.\"",
    facts: "덩굴 정령이 시험을 낸다. 물약을 바치면 수액을 준다. 엘프가 말을 걸면 수액과 정령석을 준다. 거절하면 싸운다.",
    choices: [
      { id: "offer", text: "물약 한 병을 바친다.", approach: "item", tone: "respect", requires: { items: { potion: 1 } }, consumes: { potion: 1 }, outcomes: once("정령이 물약을 삼키고 빛나는 수액을 내주었다.", { items: { mat_sap: 2 } }) },
      { id: "elf", text: "엘프 동료에게 정령과 이야기하게 한다.", approach: "person", tone: "respect", requires: { race: "elf" }, outcomes: odds([4, "{helper}의 말에 정령이 수액을 내주었다.", { items: { mat_sap: 2 } }], [1, "{helper}의 말에 정령이 웃으며 수액과 정령석을 내주었다.", { items: { mat_sap: 2, relic_spirit: 1 } }]) },
      { id: "fight", text: "길을 비키라고 칼을 뽑는다.", approach: "risk", tone: "threat", outcomes: once("덩굴이 사방에서 덤벼든다!", { battle: { monsters: ["vine_spirit", "vine_spirit"] } }) },
    ],
  },
  {
    id: "fallen_giant_tree",
    region: "uf_deep_forest",
    title: "쓰러진 거목",
    intro: "아름드리나무가 쓰러져 있다. 갈라진 틈에서 빛나는 수액이 흘러나온다.",
    facts: "쓰러진 거목의 수액. 그냥 채취하면 뿌리에 발이 묶여 다칠 수 있다. 드워프는 안전하게 더 많이 받아 낸다.",
    choices: [
      { id: "tap", text: "수액을 받아 낸다.", approach: "risk", tone: null, outcomes: odds([7, "수액을 병에 담았다.", { items: { mat_sap: 2 } }], [3, "수액을 담았지만, {who}의 발이 뿌리에 감겨 다쳤다.", { items: { mat_sap: 2 }, damageOne: 4 }]) },
      { id: "dwarf", text: "드워프 동료에게 맡긴다.", approach: "person", tone: null, requires: { race: "dwarf" }, outcomes: once("{helper}이(가) 나뭇결을 따라 홈을 파 수액을 넉넉히 받아 냈다.", { items: { mat_sap: 3 } }) },
      leave("거목을 넘어 지나갔다."),
    ],
  },
  {
    id: "firefly_path",
    region: "uf_deep_forest",
    title: "반딧불 길",
    intro: "반딧불이 줄지어 숲 안쪽으로 날아간다. 마치 길을 안내하는 것 같다.",
    facts: "반딧불을 따라가면 보물이 있는 곳에 닿거나 길을 헤맨다. 엘프는 반딧불의 뜻을 읽는다.",
    choices: [
      { id: "follow", text: "반딧불을 따라간다.", approach: "risk", tone: null, outcomes: odds([1, "반딧불이 멈춘 곳에 무언가 숨겨져 있다!", { treasureNext: true }], [1, "반딧불이 흩어졌다. 길을 헤매 한 칸을 더 걸었다.", { extraCell: true }]) },
      { id: "elf", text: "엘프 동료에게 반딧불의 뜻을 묻는다.", approach: "person", tone: null, requires: { race: "elf" }, outcomes: once("{helper}이(가) 반딧불이 가리키는 곳을 정확히 짚었다.", { treasureNext: true }) },
      leave("반딧불을 무시하고 원래 길로 갔다.", "무시한다."),
    ],
  },
  {
    id: "trap_field",
    region: "uf_deep_forest",
    title: "사냥꾼의 덫밭",
    intro: "풀숲 곳곳에 녹슨 덫이 입을 벌리고 있다. 누군가 버리고 간 사냥터다.",
    facts: "덫이 깔린 길. 궁수나 암살자는 덫을 해체해 부품과 화살촉을 얻는다. 조심히 지나면 다칠 수 있다. 돌아가면 한 칸 더 걷는다.",
    choices: [
      { id: "disarm", text: "궁수나 암살자에게 덫을 해체하게 한다.", approach: "person", tone: null, requires: { any: [{ job: "archer" }, { job: "assassin" }] }, outcomes: once("{helper}이(가) 덫을 하나하나 풀어 부품을 챙겼다.", { items: { mat_arrowhead: 2, trap_parts: 1 } }) },
      { id: "careful", text: "덫을 피해 조심히 지난다.", approach: "risk", tone: null, outcomes: odds([7, "무사히 덫밭을 빠져나왔다."], [3, "{who}이(가) 덫에 발을 물렸다.", { status: "bleed" }]) },
      { id: "around", text: "덫밭을 돌아간다.", approach: "other", tone: null, outcomes: once("빙 돌아가느라 길이 한 칸 늘어났다.", { extraCell: true }) },
    ],
  },

  // ══ 2층 미지의 동굴 ══
  {
    id: "kobold_vein",
    region: "uf_cave",
    title: "코볼트 광맥",
    intro: "코볼트들이 캐다 버린 광맥이 반짝인다. 천장이 위태롭다.",
    facts: "쓸 만한 광석이 박힌 벽. 캐면 화살촉 재료를 얻지만 돌이 떨어질 수 있다. 드워프가 캐면 안전하고 가끔 룬석이 나온다.",
    choices: [
      { id: "mine", text: "광맥을 캔다.", approach: "risk", tone: null, outcomes: odds([3, "단단한 광석을 캐냈다.", { items: { mat_arrowhead: 2 } }], [1, "광석을 캐냈지만 천장에서 돌이 쏟아졌다.", { items: { mat_arrowhead: 2 }, damageAll: 3 }]) },
      { id: "dwarf", text: "드워프 동료에게 맡긴다.", approach: "person", tone: null, requires: { race: "dwarf" }, outcomes: odds([4, "{helper}이(가) 광맥을 따라 단단한 광석만 캐냈다.", { items: { mat_arrowhead: 2 } }], [1, "{helper}이(가) 광석 사이에서 룬이 새겨진 돌을 찾아냈다!", { items: { mat_arrowhead: 2, relic_rune: 1 } }]) },
      leave("광맥을 지나쳤다."),
    ],
  },
  {
    id: "bat_swarm",
    region: "uf_cave",
    title: "박쥐 떼",
    intro: "천장 가득 박쥐가 매달려 있다. 조금만 소리를 내도 깰 것 같다.",
    facts: "잠든 박쥐 떼. 붕대로 발소리를 죽이면 무사히 지난다. 싸우면 박쥐 날개를 얻는다. 숨죽여 지나면 물릴 수 있다.",
    choices: [
      { id: "muffle", text: "붕대로 신발을 감싸 발소리를 죽인다.", approach: "item", tone: null, requires: { items: { bandage: 1 } }, consumes: { bandage: 1 }, outcomes: once("발소리 없이 박쥐 떼 아래를 지났다.") },
      { id: "fight", text: "먼저 덤벼 박쥐를 쫓는다.", approach: "risk", tone: "threat", outcomes: once("박쥐 떼가 깨어 달려든다!", { battle: { monsters: ["vampire_bat", "vampire_bat", "vampire_bat"] } }) },
      { id: "sneak", text: "숨죽여 지난다.", approach: "other", tone: null, outcomes: odds([1, "무사히 지났다."], [1, "박쥐 한 마리가 깨어 {who}을(를) 물었다.", { status: "bleed" }]) },
      { id: "archer", text: "궁수에게 앞장서 박쥐가 없는 길을 찾게 한다.", approach: "person", tone: null, requires: { job: "archer" }, outcomes: once("{helper}이(가) 어둠 속에서 박쥐가 없는 틈을 찾아냈다.") },
    ],
  },
  {
    id: "underground_lake",
    region: "uf_cave",
    title: "지하 호수",
    intro: "검은 물이 고인 지하 호수. 바닥에서 무언가 반짝인다.",
    facts: "호수 바닥의 유물. 헤엄쳐 가져오면 다칠 수 있다. 물 원소를 다루는 마법사는 물을 갈라 안전하게 꺼낸다.",
    choices: [
      { id: "swim", text: "헤엄쳐 들어간다.", approach: "risk", tone: null, outcomes: odds([1, "{who}이(가) 바닥의 유물을 건져 올렸다.", { relics: 1 }], [1, "{who}이(가) 차가운 물에 쥐가 나 허우적거렸다.", { damageOne: 5 }]) },
      { id: "water", text: "물 원소 마법사에게 물을 가르게 한다.", approach: "person", tone: null, requires: { element: "water" }, outcomes: once("{helper}의 주문에 물이 갈라졌다. 유물을 손쉽게 주웠다.", { relics: 1 }) },
      leave("호수를 지나쳤다."),
    ],
  },
  {
    id: "echo_cave",
    region: "uf_cave",
    title: "메아리 동굴",
    intro: "소리가 끝없이 울리는 넓은 동굴. 어딘가 깊은 곳에서 커다란 날갯짓 소리가 들린다.",
    facts: "크게 외치면 동굴의 주인(거대 동굴 박쥐)이 다음 칸에 반드시 나타난다. 이기면 보상이 크다. 조용히 지나면 아무 일도 없다.",
    choices: [
      { id: "shout", text: "크게 외쳐 동굴의 주인을 부른다.", approach: "risk", tone: "threat", outcomes: once("메아리가 잦아들자, 거대한 날갯짓이 다가온다.", { forceBoss: { monsterId: "giant_cave_bat", rewardMul: 2 } }) },
      { id: "quiet", text: "조용히 지난다.", approach: "other", tone: null, outcomes: once("숨을 죽이고 동굴을 지났다.") },
      { id: "bard", text: "바드에게 메아리를 흉내 내 주인을 다른 데로 꾀어내게 한다.", approach: "person", tone: null, requires: { job: "minstrel" }, outcomes: once("{helper}의 노랫소리가 동굴 저편으로 울려 퍼졌다. 이 층의 박쥐들이 그쪽으로 몰려갔다.", { floorMod: { tag: "bat", mode: "reduce" } }) },
    ],
  },

  // ══ 3층 고블린 마을 ══
  {
    id: "captured_merchant",
    region: "uf_goblin_village",
    title: "붙잡힌 상인",
    intro: "고블린 우리 안에 상인 하나가 갇혀 있다. 우리 옆에서 고블린 전사가 졸고 있다.",
    facts: "붙잡힌 상인. 구출하면 금화와 명성을 얻지만 다음 전투에 정예 고블린이 더 나온다. 물약을 건네면 고블린 킹의 버릇을 알려 준다.",
    choices: [
      { id: "rescue", text: "우리를 부수고 상인을 구한다.", approach: "risk", tone: "mercy", outcomes: once("상인을 구했다! 소란에 고블린들이 몰려든다.", { gold: 30, fame: 3, nextBattle: "elite" }) },
      { id: "potion", text: "우리 틈으로 물약을 건넨다.", approach: "item", tone: "mercy", requires: { items: { potion: 1 } }, consumes: { potion: 1 }, outcomes: once("상인이 물약을 마시고 속삭였다. \"왕이 왕홀을 들면 조심하시오…\"", { info: "info_goblin_king" }) },
      { id: "thief", text: "암살자에게 몰래 자물쇠를 따게 한다.", approach: "person", tone: "mercy", requires: { job: "assassin" }, outcomes: once("{helper}이(가) 소리 없이 상인을 빼냈다.", { gold: 30, fame: 3 }) },
      leave("상인을 외면하고 지나쳤다.", "외면한다."),
    ],
  },
  {
    id: "goblin_armory",
    region: "uf_goblin_village",
    title: "고블린 무기고",
    intro: "고블린들의 무기고. 숫돌과 화약 통이 아무렇게나 쌓여 있다.",
    facts: "고블린 무기고. 털면 숫돌을 얻지만 화약이 터질 수 있다. 암살자는 안전하게 턴다. 불태우면 이번 층의 폭탄병이 나오지 않는다.",
    choices: [
      { id: "loot", text: "무기고를 턴다.", approach: "risk", tone: "greed", outcomes: odds([7, "숫돌을 잔뜩 챙겼다.", { items: { mat_whetstone: 3 } }], [3, "숫돌을 챙기다 화약 통이 터졌다!", { items: { mat_whetstone: 3 }, damageAll: 4 }]) },
      { id: "assassin", text: "암살자에게 털게 한다.", approach: "person", tone: null, requires: { job: "assassin" }, outcomes: once("{helper}이(가) 화약을 피해 숫돌만 골라 왔다.", { items: { mat_whetstone: 3 } }) },
      { id: "burn", text: "무기고에 불을 지른다.", approach: "other", tone: null, outcomes: once("화약이 연달아 터졌다. 이번 층 폭탄병들은 폭탄이 없다.", { floorMod: { monster: "goblin_bomber", mode: "disable" } }) },
    ],
  },
  {
    id: "shaman_totem",
    region: "uf_goblin_village",
    title: "주술사의 토템",
    intro: "깃털과 뼈로 장식된 토템이 흐릿한 빛을 낸다. 고블린 주술사들의 힘의 원천 같다.",
    facts: "주술사의 토템. 부수면 이번 층 고블린 주술사가 회복 주술을 못 쓴다. 마법사는 토템에서 기술 파편을 뽑아낸다.",
    choices: [
      { id: "smash", text: "토템을 부순다.", approach: "risk", tone: "threat", outcomes: once("토템이 산산조각 났다. 주술의 기운이 흩어진다.", { floorMod: { monster: "goblin_shaman", mode: "noHeal" } }) },
      { id: "mage", text: "마법사에게 토템의 힘을 뽑아내게 한다.", approach: "person", tone: null, requires: { job: "mage" }, outcomes: once("{helper}이(가) 토템의 힘을 조각으로 굳혀 냈다.", { items: { tech_shard: 2 } }) },
      leave("토템을 지나쳤다."),
    ],
  },

  // ══ 3층 늑대 굴 ══
  {
    id: "wounded_cub",
    region: "uf_wolf_den",
    title: "상처 입은 새끼 늑대",
    intro: "다리를 다친 새끼 늑대가 낑낑거린다. 멀리서 어미의 울음이 들린다.",
    facts: "다친 새끼 늑대. 붕대로 치료해 주면 이번 층 늑대가 덜 덤벼든다. 수인은 무리의 말로 달래 더 가까워진다.",
    choices: [
      { id: "bandage", text: "붕대로 다리를 감아 준다.", approach: "item", tone: "mercy", requires: { items: { bandage: 1 } }, consumes: { bandage: 1 }, outcomes: once("새끼 늑대가 절룩이며 어미에게 돌아갔다. 늑대 울음이 잦아들었다.", { floorMod: { tag: "beast", mode: "reduce" } }) },
      { id: "beastfolk", text: "수인 동료에게 달래게 한다.", approach: "person", tone: "mercy", requires: { race: "beastfolk" }, outcomes: once("{helper}이(가) 낮게 으르렁거리자 새끼가 꼬리를 흔들었다. 무리가 물러난다.", { floorMod: { tag: "beast", mode: "reduce" }, affinity: { target: "chooser", delta: 5 } }) },
      { id: "shoo", text: "쫓아 버린다.", approach: "risk", tone: "threat", outcomes: odds([1, "새끼 늑대가 달아났다."], [1, "새끼 늑대의 비명에 어미가 달려든다!", { nextBattle: "enemyAmbush" }]) },
      leave("외면하고 지나쳤다.", "외면한다."),
    ],
  },
  {
    id: "bone_pile",
    region: "uf_wolf_den",
    title: "뼈 더미",
    intro: "늑대들이 먹고 남긴 뼈가 산처럼 쌓여 있다. 그 사이로 송곳니가 보인다.",
    facts: "뼈 더미 속 송곳니. 뒤지면 늑대 송곳니를 얻지만 늑대가 돌아와 기습할 수 있다. 궁수는 망을 보며 안전하게 뒤진다.",
    choices: [
      { id: "dig", text: "뼈 더미를 뒤진다.", approach: "risk", tone: null, outcomes: odds([7, "쓸 만한 송곳니를 골라냈다.", { items: { mat_fang: 2 } }], [3, "송곳니를 골라냈지만, 늑대들의 발소리가 다가온다.", { items: { mat_fang: 2 }, nextBattle: "enemyAmbush" }]) },
      { id: "watch", text: "궁수에게 망을 보게 하고 뒤진다.", approach: "person", tone: null, requires: { job: "archer" }, outcomes: once("{helper}이(가) 망을 보는 사이 송곳니를 챙겼다.", { items: { mat_fang: 2 } }) },
      leave("뼈 더미를 지나쳤다."),
    ],
  },
  {
    id: "moon_rock",
    region: "uf_wolf_den",
    title: "달빛 바위",
    intro: "동굴 틈으로 달빛이 내려와 커다란 바위를 비춘다. 늑대들이 숭배하는 곳 같다.",
    facts: "달빛 바위. 수인이 그 앞에서 울부짖으면 다음 전투에서 힘이 솟고 동료와 가까워진다. 그냥 기대어 쉬면 조금 회복한다.",
    choices: [
      { id: "howl", text: "수인 동료에게 달을 향해 울부짖게 한다.", approach: "person", tone: "respect", requires: { race: "beastfolk" }, outcomes: once("{helper}의 울음에 피가 끓는다.", { nextBattle: "buff", affinity: { target: "chooser", delta: 4 } }) },
      { id: "rest", text: "바위에 기대어 쉰다.", approach: "other", tone: null, outcomes: once("달빛 아래 잠시 숨을 돌렸다.", { healAll: 3 }) },
      { id: "climb", text: "바위 위로 올라가 주변을 살핀다.", approach: "risk", tone: null, outcomes: odds([1, "위에서 보니 지름길이 보인다.", { skipNext: true }], [1, "{who}이(가) 미끄러져 떨어졌다.", { damageOne: 5 }]) },
    ],
  },

  // ══ 3층 거미 둥지 ══
  {
    id: "cocooned_adventurer",
    region: "uf_spider_nest",
    title: "고치에 싸인 모험가",
    intro: "거미줄 고치 속에서 사람 손이 꿈틀거린다.",
    facts: "거미줄에 싸인 모험가. 구하면 해독제와 거미 여왕의 독액 주기를 알려 주지만 거미줄의 독에 중독될 수 있다. 사제가 정화하며 꺼내면 안전하다.",
    choices: [
      { id: "cut", text: "고치를 찢어 꺼낸다.", approach: "risk", tone: "mercy", outcomes: odds([6, "모험가를 구했다. 해독제와 여왕의 습성을 알려 주었다.", { supply: { antidote: 2 }, info: "info_spider_queen" }], [4, "모험가를 구했지만, {who}이(가) 끈적한 독에 중독되었다.", { supply: { antidote: 2 }, info: "info_spider_queen", status: "poison" }]) },
      { id: "priest", text: "사제에게 독을 정화하며 꺼내게 한다.", approach: "person", tone: "mercy", requires: { job: "priest" }, outcomes: once("{helper}의 기도 속에 모험가를 무사히 꺼냈다.", { supply: { antidote: 2 }, info: "info_spider_queen" }) },
      leave("고치를 외면했다.", "외면한다."),
    ],
  },
  {
    id: "egg_mound",
    region: "uf_spider_nest",
    title: "알 무더기",
    intro: "끈적한 거미 알이 무더기로 쌓여 꿈틀거린다.",
    facts: "거미 알 무더기. 불태우면 이번 층 거미가 줄어든다. 채취하면 독샘을 얻지만 알이 깨어날 수 있다.",
    choices: [
      { id: "burn", text: "알을 불태운다.", approach: "other", tone: null, outcomes: once("알이 타들어 갔다. 둥지의 기척이 줄었다.", { floorMod: { tag: "insect", mode: "reduce" } }) },
      { id: "harvest", text: "알에서 독샘을 채취한다.", approach: "risk", tone: "greed", outcomes: odds([1, "독샘을 조심히 떼어 냈다.", { items: { mat_venom: 2 } }], [1, "독샘을 떼어 내는 순간 알이 깨어났다!", { items: { mat_venom: 2 }, battle: { monsters: ["cave_spider", "cave_spider"] } }]) },
      { id: "fire", text: "불 원소 마법사에게 한 번에 태우게 한다.", approach: "person", tone: null, requires: { element: "fire" }, outcomes: once("{helper}의 불길이 알을 남김없이 삼켰다. 남은 독샘도 챙겼다.", { floorMod: { tag: "insect", mode: "reduce" }, items: { mat_venom: 1 } }) },
      leave("알 무더기를 지나쳤다."),
    ],
  },
  {
    id: "web_bridge",
    region: "uf_spider_nest",
    title: "거미줄 다리",
    intro: "깊은 틈 위로 굵은 거미줄이 다리처럼 걸쳐 있다.",
    facts: "거미줄 다리. 건너면 줄에 걸려 묶이고 다칠 수 있다. 불 원소 마법사가 줄을 그슬리면 안전하고, 이번 층 거미의 기습도 막는다. 돌아가면 한 칸 더 걷는다.",
    choices: [
      { id: "cross", text: "거미줄 다리를 건넌다.", approach: "risk", tone: null, outcomes: odds([1, "무사히 건넜다."], [1, "{who}이(가) 줄에 걸려 버둥대다 다쳤다.", { damageOne: 4 }]) },
      { id: "fire", text: "불 원소 마법사에게 끈적한 줄을 그슬리게 한다.", approach: "person", tone: null, requires: { element: "fire" }, outcomes: once("{helper}이(가) 끈끈한 줄만 태워 안전한 다리를 만들었다. 거미들이 겁을 먹었다.", { floorMod: { tag: "insect", mode: "noAmbush" } }) },
      { id: "around", text: "돌아간다.", approach: "other", tone: null, outcomes: once("빙 돌아가느라 길이 한 칸 늘어났다.", { extraCell: true }) },
    ],
  },

  // ══ 3층 늪지대 ══
  {
    id: "sinking_comrade",
    region: "uf_swamp",
    title: "늪에 빠진 동료",
    intro: "동료 하나가 발을 헛디뎌 늪에 허리까지 빠졌다!",
    facts: "늪에 빠진 동료. 물약을 먹여 힘을 내게 하거나, 힘센 가디언·바바리안이 끌어올리면 안전하다. 혼자 빠져나오게 두면 다치고 서운해한다.",
    choices: [
      { id: "potion", text: "물약을 던져 주어 힘을 내게 한다.", approach: "item", tone: "mercy", requires: { items: { potion: 1 } }, consumes: { potion: 1 }, outcomes: once("{who}이(가) 물약을 마시고 늪에서 기어 나왔다.") },
      { id: "pull", text: "가디언이나 바바리안에게 끌어올리게 한다.", approach: "person", tone: "mercy", requires: { any: [{ job: "guardian" }, { race: "barbarian" }] }, outcomes: once("{helper}이(가) 단숨에 끌어올렸다.") },
      { id: "self", text: "혼자 빠져나오라고 한다.", approach: "risk", tone: "threat", outcomes: odds([1, "{who}이(가) 혼자 기어 나왔다."], [1, "{who}이(가) 한참을 버둥대다 겨우 나왔다. 원망스러운 눈빛이다.", { damageOne: 6, affinity: { target: "chooser", delta: -4 } }]) },
    ],
  },
  {
    id: "jelly_pool",
    region: "uf_swamp",
    title: "젤 웅덩이",
    intro: "끈적한 슬라임 젤이 고인 웅덩이. 퍼 담기 좋아 보인다.",
    facts: "슬라임 젤 웅덩이. 퍼 담으면 젤을 얻지만 산성 젤이 갑옷을 녹인다. 마법사는 젤을 굳혀 안전하게 담는다.",
    choices: [
      { id: "scoop", text: "젤을 퍼 담는다.", approach: "risk", tone: null, outcomes: once("젤을 잔뜩 담았지만, 산성 젤이 {who}의 갑옷을 녹였다.", { items: { mat_jelly: 3 }, nextBattle: "debuff" }) },
      { id: "mage", text: "마법사에게 젤을 굳혀 담게 한다.", approach: "person", tone: null, requires: { job: "mage" }, outcomes: once("{helper}이(가) 젤을 굳혀 깔끔하게 담았다.", { items: { mat_jelly: 3 } }) },
      leave("웅덩이를 지나쳤다."),
    ],
  },
  {
    id: "swamp_witch",
    region: "uf_swamp",
    title: "늪 마녀의 오두막",
    intro: "물 위에 떠 있는 오두막. 늙은 마녀가 솥을 젓다가 히죽 웃는다.",
    facts: "늪 마녀. 유물을 주면 해독제를, 금화를 주면 치료를 해 준다. 물약을 훔칠 수도 있지만 들키면 저주를 받는다 (두 번의 전투 동안 회복이 줄어든다).",
    choices: [
      { id: "trade", text: "유물 하나를 해독제와 바꾼다.", approach: "other", tone: null, costRelic: 1, outcomes: once("마녀가 유물을 품에 넣고 해독제를 내밀었다.", { supply: { antidote: 3 } }) },
      { id: "heal", text: "금화 30을 내고 치료를 받는다.", approach: "other", tone: null, costGold: 30, outcomes: once("마녀의 탕약에 상처가 아물었다.", { healAll: 10 }) },
      { id: "steal", text: "마녀가 돌아선 사이 물약을 훔친다.", approach: "risk", tone: "greed", outcomes: odds([1, "물약 두 병을 챙겼다.", { supply: { potion: 2 } }], [1, "마녀가 손가락을 튕겼다. 몸이 무거워진다…", { curse: { status: "healReduction", battles: 2 } }]) },
      { id: "priest", text: "사제에게 마녀와 이야기하게 한다.", approach: "person", tone: "respect", requires: { job: "priest" }, outcomes: once("{helper}과(와) 이야기하던 마녀가 탕약 한 사발을 공짜로 내주었다.", { healAll: 6 }) },
    ],
  },

  // ══ 3층 더 깊은 숲 ══
  {
    id: "orc_scout_camp",
    region: "uf_deeper_forest",
    title: "오크 정찰대 야영지",
    intro: "오크 정찰대가 모닥불 주위에서 고기를 굽고 있다. 아직 우리를 못 봤다.",
    facts: "오크 정찰대 야영지. 기습하면 정예 오크와 싸우고 철퇴 조각을 얻는다. 파티가 날래면 몰래 지날 수 있다. 우회하면 다음 칸을 건너뛴다.",
    choices: [
      { id: "raid", text: "먼저 덮친다.", approach: "risk", tone: "threat", outcomes: once("오크들이 놀라 무기를 집어 든다!", { items: { mat_mace: 2 }, battle: { monsters: ["orc_warrior", "orc_archer"], elites: 1 } }) },
      { id: "sneak", text: "발소리를 죽이고 몰래 지난다.", approach: "person", tone: null, requires: { speedSum: SNEAK_SPEED_SUM }, outcomes: once("오크들은 끝내 눈치채지 못했다.") },
      { id: "detour", text: "멀리 우회한다.", approach: "other", tone: null, outcomes: once("우회하다 지름길을 찾았다.", { skipNext: true }) },
    ],
  },
  {
    id: "nameless_grave",
    region: "uf_deeper_forest",
    title: "이름 없는 기사의 묘비",
    intro: "이끼 낀 묘비 하나. 이름은 지워졌고, 녹슨 방패가 기대어 있다.",
    facts: "이름 없는 기사의 묘. 기도하면 동료들의 마음이 모인다. 인간 동료가 예를 갖추면 기사의 문장을 물려받는다. 도굴하면 유실물을 얻지만 모두 실망한다.",
    choices: [
      { id: "pray", text: "묘비 앞에서 잠시 기도한다.", approach: "other", tone: "respect", outcomes: once("모두 고개를 숙였다. 묘한 숙연함이 감돈다.", { affinity: { target: "all", delta: 2 } }) },
      { id: "human", text: "인간 동료에게 기사의 예를 갖추게 한다.", approach: "person", tone: "respect", requires: { race: "human" }, outcomes: once("{helper}이(가) 예를 갖추자, 방패 뒤에서 빛바랜 문장이 굴러 나왔다.", { items: { relic_crest: 1 } }) },
      { id: "rob", text: "묘를 파헤친다.", approach: "risk", tone: "greed", outcomes: once("녹슨 장신구 몇 개를 챙겼다. 동료들의 시선이 차갑다.", { items: { crude_iron: 2, shiny_trinket: 1 }, affinity: { target: "all", delta: -3 } }) },
    ],
  },
  {
    id: "owlbear_nest",
    region: "uf_deeper_forest",
    title: "오울베어 둥지",
    intro: "커다란 둥지 안에 얼룩 알 두 개가 놓여 있다. 어미는 보이지 않는다.",
    facts: "오울베어 둥지. 알을 챙기면 비싼 유실물이지만 어미가 돌아와 습격한다. 조용히 지나면 아무 일도 없다.",
    choices: [
      { id: "take", text: "알을 챙긴다.", approach: "risk", tone: "greed", outcomes: once("알을 품에 넣는 순간, 등 뒤에서 거친 숨소리가 들린다!", { items: { owlbear_egg: 1 }, battle: { monsters: ["owlbear"] } }) },
      { id: "quiet", text: "조용히 지난다.", approach: "other", tone: null, outcomes: once("둥지를 건드리지 않고 지났다.") },
      { id: "ranger", text: "궁수에게 어미가 오는지 살피게 하고 알 하나만 챙긴다.", approach: "person", tone: "greed", requires: { job: "archer" }, outcomes: odds([1, "{helper}의 신호에 맞춰 알 하나를 챙기고 빠져나왔다.", { items: { owlbear_egg: 1 } }], [1, "{helper}이(가) 외쳤다. 어미가 벌써 와 있다!", { items: { owlbear_egg: 1 }, battle: { monsters: ["owlbear"] } }]) },
    ],
  },
  {
    id: "hermit_archer",
    region: "uf_deeper_forest",
    title: "숲의 은둔 궁수",
    intro: "나무 위에서 활을 겨눈 은둔자가 내려다본다. \"무슨 볼일이지?\"",
    facts: "숲의 은둔 궁수. 같은 궁수와는 말이 통해 기술과 오크 대장의 버릇을 알려 준다. 숫돌을 주면 화살촉과 바꿔 준다.",
    choices: [
      { id: "archer", text: "궁수 동료에게 말을 걸게 한다.", approach: "person", tone: "respect", requires: { job: "archer" }, outcomes: once("{helper}과(와) 활 이야기를 나누던 은둔자가 요령과 오크 대장 이야기를 들려주었다.", { items: { tech_shard: 2 }, info: "info_orc_captain" }) },
      { id: "trade", text: "숫돌 2개를 화살촉 3개와 바꾼다.", approach: "other", tone: null, costItems: { mat_whetstone: 2 }, outcomes: once("은둔자가 숫돌을 받고 화살촉을 던져 주었다.", { items: { mat_arrowhead: 3 } }) },
      { id: "threaten", text: "물건을 내놓으라고 위협한다.", approach: "risk", tone: "threat", outcomes: odds([1, "은둔자가 혀를 차며 화살촉 몇 개를 던졌다.", { items: { mat_arrowhead: 1 } }], [1, "화살이 {who}의 발 앞에 꽂혔다. 다음 화살은 빗나가지 않았다.", { damageOne: 6 }]) },
      leave("은둔자를 지나쳤다."),
    ],
  },

  // ══ 4층 오크 마을 ══
  {
    id: "prison_cage",
    region: "uf_orc_village",
    title: "포로 우리",
    intro: "오크들의 포로 우리. 붙잡힌 모험가가 쇠창살을 붙잡고 있다. \"꺼내 주면 은혜는 갚겠소!\"",
    facts: "붙잡힌 모험가. 구출하면 돌아가서 고용비 없이 길드에 합류한다. 우리를 부수는 소리에 오크가 몰려올 수 있다.",
    choices: [
      { id: "break", text: "우리를 부순다.", approach: "risk", tone: "mercy", outcomes: odds([6, "모험가를 구했다. 돌아가면 함께하겠다고 한다.", { recruit: 1 }], [4, "모험가를 구했지만 소란에 오크들이 몰려온다!", { recruit: 1, nextBattle: "enemyAmbush" }]) },
      { id: "pick", text: "암살자에게 조용히 자물쇠를 따게 한다.", approach: "person", tone: "mercy", requires: { job: "assassin" }, outcomes: once("{helper}이(가) 소리 없이 문을 열었다. 모험가가 고개를 숙였다.", { recruit: 1 }) },
      { id: "potion", text: "물약만 건네고 지나간다.", approach: "item", tone: null, requires: { items: { potion: 1 } }, consumes: { potion: 1 }, outcomes: once("모험가가 물약을 받아 들고 고맙다고 했다. 스스로 빠져나갈 것이다.", { fame: 2 }) },
      leave("포로를 무시하고 지나쳤다.", "무시한다."),
    ],
  },
  {
    id: "war_drum_post",
    region: "uf_orc_village",
    title: "전쟁 북",
    intro: "커다란 전쟁 북이 마을 한가운데 서 있다. 북소리가 울릴 때마다 오크들이 사나워진다.",
    facts: "오크의 전쟁 북. 부수면 이번 층 오크가 기세를 올리지 못한다. 바드가 엉뚱한 박자로 치면 오크들이 혼란에 빠져 다음 전투에 기습할 수 있다.",
    choices: [
      { id: "smash", text: "북을 부순다.", approach: "risk", tone: "threat", outcomes: once("북가죽이 찢어졌다. 마을의 북소리가 멎었다.", { floorMod: { tag: "orc", mode: "noBuff" } }) },
      { id: "bard", text: "바드에게 엉뚱한 박자로 북을 치게 한다.", approach: "person", tone: null, requires: { job: "minstrel" }, outcomes: once("{helper}의 북소리에 오크들이 우왕좌왕한다. 틈이 생겼다.", { nextBattle: "ambush" }) },
      leave("북을 지나쳤다."),
    ],
  },
  {
    id: "orc_brewery",
    region: "uf_orc_village",
    title: "오크 술 창고",
    intro: "독한 술 냄새가 진동하는 창고. 술통이 줄지어 있다.",
    facts: "오크 술 창고. 마시면 기운이 나지만 다음 전투에서 몸이 둔하다. 바바리안은 술에 강해 기운만 얻고 기분이 크게 좋아진다. 불태우면 다음 전투에 오크들을 기습할 수 있다.",
    choices: [
      { id: "drink", text: "한 모금씩 마신다.", approach: "risk", tone: null, outcomes: once("독한 술에 몸이 후끈해졌다. 다리가 조금 풀린다.", { healAll: 5, nextBattle: "debuff" }) },
      { id: "barbarian", text: "바바리안 동료에게 술맛을 보게 한다.", approach: "person", tone: "respect", requires: { race: "barbarian" }, outcomes: once("{helper}이(가) 통째로 들이켜고 크게 웃었다. 모두 기운이 났다.", { healAll: 5, affinity: { target: "chooser", delta: 8 } }) },
      { id: "burn", text: "술 창고에 불을 지른다.", approach: "other", tone: null, outcomes: once("불길이 치솟자 오크들이 우왕좌왕한다.", { nextBattle: "ambush" }) },
    ],
  },
  {
    id: "orc_smithy",
    region: "uf_orc_village",
    title: "오크 대장간",
    intro: "시뻘건 화로 옆에 철퇴 조각이 쌓여 있다. 대장장이 오크는 자리를 비웠다.",
    facts: "오크 대장간. 털면 철퇴 조각을 얻지만 정예 오크가 돌아올 수 있다. 드워프는 쓸 만한 것을 골라내고 대장간 기술을 익혀 와 마을 대장간 할인을 얻는다.",
    choices: [
      { id: "loot", text: "철퇴 조각을 턴다.", approach: "risk", tone: "greed", outcomes: odds([6, "철퇴 조각을 잔뜩 챙겼다.", { items: { mat_mace: 3 } }], [4, "조각을 챙기는데 대장장이 오크가 돌아왔다!", { items: { mat_mace: 3 }, battle: { monsters: ["orc_warrior", "orc_berserker"], elites: 1 } }]) },
      { id: "dwarf", text: "드워프 동료에게 골라내게 한다.", approach: "person", tone: null, requires: { race: "dwarf" }, outcomes: once("{helper}이(가) 쓸 만한 조각을 골라내고 화로의 쓰임새를 눈여겨봤다.", { items: { mat_mace: 3 }, discount: { facility: "forge", days: 5 } }) },
      leave("대장간을 지나쳤다."),
    ],
  },

  // ══ 히든 타락한 엘프의 숲 ══
  {
    id: "sick_spirit",
    region: "uf_corrupted_forest",
    title: "병든 정령",
    intro: "검게 물든 작은 정령이 웅크려 떨고 있다.",
    facts: "타락에 병든 정령. 해독제로 정화하면 세계수 수액을 준다. 사제나 엘프가 돌보면 모두의 상처도 함께 아문다.",
    choices: [
      { id: "antidote", text: "해독제로 정령을 씻어 준다.", approach: "item", tone: "mercy", requires: { items: { antidote: 1 } }, consumes: { antidote: 1 }, outcomes: once("정령이 맑은 빛을 되찾고 수액을 남겼다.", { items: { mat_sap: 2 } }) },
      { id: "tend", text: "사제나 엘프에게 정령을 돌보게 한다.", approach: "person", tone: "mercy", requires: { any: [{ job: "priest" }, { race: "elf" }] }, outcomes: once("{helper}의 손길에 정령이 빛을 되찾았다. 그 빛이 모두를 감쌌다.", { items: { mat_sap: 2 }, healAll: 5 }) },
      { id: "take", text: "정령의 빛을 뽑아 간다.", approach: "risk", tone: "greed", outcomes: once("정령이 비명을 지르며 사라졌다. 숲이 술렁인다.", { items: { mat_sap: 1 }, affinity: { target: "all", delta: -2 }, nextBattle: "enemyAmbush" }) },
      leave("정령을 외면했다.", "외면한다."),
    ],
  },
  {
    id: "elf_ghost",
    region: "uf_corrupted_forest",
    title: "엘프의 망령",
    intro: "희미한 엘프의 망령이 길을 막아선다. \"돌아가라… 여왕은… 아직…\"",
    facts: "타락한 숲의 망령. 엘프 동료가 이야기를 들어 주면 보스의 약점을 알려 주고 그 동료와 가까워진다. 쫓아내려 하면 싸운다.",
    choices: [
      { id: "elf", text: "엘프 동료에게 망령의 말을 듣게 한다.", approach: "person", tone: "respect", requires: { race: "elf" }, outcomes: once("{helper}이(가) 망령의 마지막 말을 받아 적었다.", { info: "info_spirit_king", affinity: { target: "chooser", delta: 5 } }) },
      { id: "banish", text: "망령을 쫓아낸다.", approach: "risk", tone: "threat", outcomes: once("망령이 비명을 지르자 숲의 그림자들이 일어선다!", { battle: { monsters: ["corrupted_ranger", "shadow_wolf"] } }) },
      { id: "pray", text: "사제에게 망령을 위해 기도하게 한다.", approach: "person", tone: "mercy", requires: { job: "priest" }, outcomes: once("{helper}의 기도에 망령이 조용히 흩어졌다. 숲의 기운이 조금 맑아졌다.", { floorMod: { monster: "corrupted_shaman", mode: "noHeal" } }) },
    ],
  },
  {
    id: "withered_root",
    region: "uf_corrupted_forest",
    title: "시든 세계수의 뿌리",
    intro: "세계수의 뿌리가 검게 썩어 땅 위로 드러나 있다. 아직 수액이 조금 흐른다.",
    facts: "시든 세계수의 뿌리. 사제가 정화하며 받아 내면 수액을 많이 얻는다. 그냥 받아 내면 썩은 수액에 중독될 수 있다.",
    choices: [
      { id: "priest", text: "사제에게 뿌리를 정화하며 수액을 받게 한다.", approach: "person", tone: "respect", requires: { job: "priest" }, outcomes: once("{helper}의 기도에 썩은 기운이 물러났다. 맑은 수액이 흘러나왔다.", { items: { mat_sap: 3 } }) },
      { id: "tap", text: "수액을 받아 낸다.", approach: "risk", tone: null, outcomes: once("수액을 받아 냈지만, {who}이(가) 썩은 기운에 중독되었다.", { items: { mat_sap: 2 }, status: "poison" }) },
      leave("뿌리를 지나쳤다."),
    ],
  },
  // ── 의뢰 사건 (구출 의뢰를 받았을 때만. data/quests.ts의 rescue 목표) ──
  {
    id: "rescue_herbalist",
    title: "길 잃은 약초꾼",
    quest: true,
    intro: "덤불 너머에서 희미한 신음이 들린다. 약초 바구니를 끌어안은 사내가 발목을 감싸 쥐고 쓰러져 있다. 주위에 덩굴이 꿈틀거린다.",
    facts: "가족이 찾던 약초꾼. 발목을 다쳐 걷지 못한다. 덩굴이 가까이 있어 오래 머물면 위험하다. 붕대로 발목을 감거나, 힘센 동료가 업거나, 덩굴을 베고 억지로 데려갈 수 있다.",
    choices: [
      { id: "bandage", text: "붕대로 발목을 단단히 감고 부축해 데려간다.", approach: "item", tone: "mercy", requires: { items: { bandage: 1 } }, consumes: { bandage: 1 }, rescue: true, outcomes: once("붕대를 감자 약초꾼이 일어섰다. 연신 고맙다며 약초 몇 줌을 쥐여 주었다.", { supply: { antidote: 1 } }) },
      { id: "carry", text: "힘센 동료가 약초꾼을 업는다.", approach: "person", tone: "mercy", requires: { job: "guardian" }, rescue: true, outcomes: once("{helper}이(가) 약초꾼을 가볍게 들쳐 업었다. 약초꾼이 눈물을 글썽인다.") },
      { id: "cut", text: "덩굴을 베어 길을 내고 억지로 데려간다.", approach: "risk", tone: null, rescue: true, outcomes: [{ weight: 2, text: "덩굴을 베어 내고 약초꾼을 끌어냈다.", effect: {} }, { weight: 1, text: "덩굴이 휘감겨 {who}이(가) 다쳤지만, 약초꾼은 구했다.", effect: { damageOne: 5 } }] },
      leave("약초꾼을 두고 지나쳤다. 신음이 등 뒤로 멀어진다.", "지금은 구할 여유가 없다. 지나친다."),
    ],
  },
  {
    id: "rescue_apprentice",
    title: "갇힌 견습생",
    quest: true,
    intro: "무너진 갱도 틈에서 망치 두드리는 소리가 들린다. 바위 사이로 앳된 얼굴이 보인다. 대장간 견습생이다.",
    facts: "광석을 캐러 왔다가 낙석에 갇힌 대장간 견습생. 바위를 치우면 꺼낼 수 있지만 또 무너질 수 있다. 물약을 먹여 기운을 차리게 하거나, 드워프가 바위 결을 읽거나, 그냥 힘으로 치울 수 있다.",
    choices: [
      { id: "potion", text: "틈으로 물약을 건네 기운을 차리게 하고 함께 바위를 민다.", approach: "item", tone: "mercy", requires: { items: { potion: 1 } }, consumes: { potion: 1 }, rescue: true, outcomes: once("물약을 마신 견습생이 힘을 보태 바위가 굴러갔다. \"대장장이 어른께 꼭 말씀드릴게요!\"") },
      { id: "dwarf", text: "드워프 동료가 바위 결을 읽어 무너지지 않게 치운다.", approach: "person", tone: null, requires: { race: "dwarf" }, rescue: true, outcomes: once("{helper}이(가) 바위 하나를 툭 치자 나머지가 얌전히 무너져 길이 났다.") },
      { id: "force", text: "힘으로 바위를 치운다.", approach: "risk", tone: null, rescue: true, outcomes: [{ weight: 2, text: "바위를 치우고 견습생을 끌어냈다.", effect: {} }, { weight: 1, text: "돌이 쏟아져 모두 조금씩 다쳤지만, 견습생은 무사하다.", effect: { damageAll: 3 } }] },
      leave("견습생을 두고 지나쳤다. 망치 소리가 점점 작아진다.", "지금은 구할 여유가 없다. 지나친다."),
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
