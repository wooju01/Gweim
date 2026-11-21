import { MERCS, getMerc } from "@/data/mercs";
import { USE_SAMPLE_ROSTER, sampleSeeds } from "@/data/sampleRoster";
import type { SupplyKind } from "@/data/combat";
import { BOND, fleeTemper } from "@/data/bond";
import { MERC_SLOTS } from "@/game/merc/party";
import { DEATH } from "@/data/death";
import { MEMORY_MAX_CHARS } from "@/game/merc/memory";
import { applyTone, clampStat, getStage } from "@/game/merc/affinity";
import { createRng, rollInt } from "@/game/random";
import { CURRENCY, PACK_LIMIT, PRICE, START_GOLD, START_PACK, START_STOCK, STOCK_RANGE } from "@/data/economy";
import { getRelic } from "@/data/relics";
import { addSalvage, getSalvage, salvageCount, sellable } from "@/data/loot";
import { WAGE } from "@/data/wages";
import { PROMOTE_BONUS, STAT_NAME, TRAINING_COST, type StatBlock } from "@/data/growth";
import { NO_GROWTH, addStats, canPromote, gainXp, statLine, validTraining, type Growth } from "@/game/merc/growth";
import { promote, promoteCost } from "@/game/merc/promotion";
import { craft, forgetSkill, knownFragments, paySalvage, swapSkills, unlockBlock, upgradeBlock } from "@/game/merc/skillhall";
import { CRAFT_COST, getFragment, upgradeCost } from "@/data/fragments";
import { FIRST_DUNGEON, getDungeon } from "@/data/regions";
import { RANK_ORDER, stageOf } from "@/data/ranks";
import { TRINKET_MAX_LV, forgeCost, getTrinket, trinketStats, type OwnedTrinket } from "@/data/trinkets";
import { advanceCost, wageOf } from "@/game/merc/wages";
import { act, giftsReceived, isDowned, type Battle, type BattleAction } from "@/game/combat/engine";
import {
  chooseEvent,
  finishBattle,
  giveSupply,
  battleSpoils,
  descend,
  expeditionXp,
  leaveRoom,
  markRestTalk,
  moveTo,
  regionOf,
  rescueBonds,
  startExpedition,
  xpFor,
  type Expedition,
} from "@/game/dungeon/expedition";
import { KEY_ITEMS, type KeyItemId } from "@/data/keyItems";
import { ARREARS, CLAN_FOUNDERS, DAILY_SCENE_CHANCE, HOME_TALKS, SETTLEMENT_DAYS } from "@/data/clan";
import { DISPATCH, MAX_ACTIVE_DIRECT, getQuest } from "@/data/quests";
import { clanJoinChance, objectiveDone, resolveDispatch, rollBoard, settlementsDue, upkeepCost, type DispatchOutcome } from "@/game/quests";
import { buildMerc } from "@/game/merc/generate";
import type { Merc } from "@/game/types";
import type { Element, EventResponse, HistoryLine, MercLevel, MercRef, MercSeed, SkillBuild, Stage, TalkResponse, TalkState } from "@/lib/schemas";

const HISTORY_LIMIT = 20;

/** wage: 고용할 때 정해진 원정 1회 보수 (몫 약속을 했으면 더 많다). 고용 전에는 없다 */
/** learned: 배웠지만 장착하지 않은 스킬 (장착 칸이 꽉 찼을 때, 전수관에서 바꿔 낀다) */
/** pieces: 전수관에서 이 용병에게 뚫어 준 조각 (가진 스킬 안에 든 조각은 따로 저장하지 않는다) */
/** levels: 부 조각 레벨 (전수관 강화. 없으면 Lv1) */
/** trinket: 끼고 있는 장신구 (대장간) */
export type MercProgress = TalkState & {
  hired: boolean;
  wage?: number;
  learned: SkillBuild[];
  pieces: string[];
  levels: Record<string, number>;
  trinket?: OwnedTrinket;
  /** 용병(원정마다 보수) / 클랜원(보수 없음, 파견 가능). 없으면 용병 */
  kind?: "merc" | "member";
  /** 클랜 가입 의사를 밝혔다 (창설 전) */
  pledged?: boolean;
  /** 이 날까지 파견·부상으로 원정 파티에 넣을 수 없다 */
  busyUntilDay?: number;
  /** 마지막으로 클랜 가입을 제안한 날 (거절당하면 다음 귀환까지 다시 못 한다) */
  clanAskedDay?: number;
} & Growth;

/** 진행 중인 파견 */
export type Dispatch = { questId: string; members: string[]; endDay: number };
/** 끝난 파견의 보고 (story는 AI가 쓴 이야기. 기다리는 중이면 null) */
export type DispatchReport = {
  questId: string;
  title: string;
  day: number;
  success: boolean;
  members: { id: string; name: string; outcome: DispatchOutcome }[];
  lines: string[];
  story: string | null;
};
/** 귀환 때 집에서 벌어진 용병 둘의 짧은 장면 (text는 AI. 기다리는 중이면 null) */
export type HomeScene = { ids: [string, string]; text: string | null; day: number };

/** 길드 명단의 한 칸. 고유 용병은 id만, 랜덤 용병은 다시 만들 수 있는 시드를 들고 있다. */
export type RosterEntry = MercRef;

export type TalkScreen = {
  kind: "talk";
  mercId: string;
  /** 마지막으로 받은 응답. 첫 응답 전에는 null */
  reply: TalkResponse | null;
  pending: boolean;
  error: string | null;
  /** 동행 수락 등으로 대화가 끝났는지 */
  ended: boolean;
};

export type GameState = {
  roster: RosterEntry[];
  progress: Record<string, MercProgress>;
  party: string[];
  recruit: { pending: boolean; error: string | null };
  screen: { kind: TownPlace } | { kind: "report" } | TalkScreen | { kind: "dungeon" } | { kind: "battle"; battle: Battle };
  /** 방금 마친 원정의 결산 (결산 화면에서 보여 주고, 저장하지 않는다) */
  report: Report | null;
  /** 날짜. 원정 1번 = 하루 (상점 재고·급여가 하루에 묶인다) */
  day: number;
  /** 던전 탐험 중이면 그 상태 */
  expedition: Expedition | null;
  /** 지금 사건 칸의 AI 묘사. 기다리는 중이면 data가 null */
  narration: { eventId: string; pending: boolean; data: EventResponse | null } | null;
  /** 마지막 사건 선택에 대한 용병들의 반응 (예: "케쉬: 호감 ↓") */
  reactions: string[];
  /** 휴식 칸에서 한 명과 나누는 짧은 대화 */
  restTalk: RestTalk | null;
  /** 길드에 돌아왔을 때 알릴 일 (계약 파기, 감사 등) */
  notices: string[];
  /** 길안내자의 명성 (나중: 생환·깊은 층으로 오르고, 좋은 등급 용병이 모인다). 지금은 자리만 */
  renown: number;
  /** 용병을 어떻게 대했는가 (나중: 낮으면 시작 고용 의향 감소). 지금은 자리만 */
  reputation: number;
  /** 저장을 읽고 나서 true (그전에는 화면을 그리지 않고 저장도 하지 않는다). 저장하지 않는 칸 */
  booted: boolean;
  /** 던전에서 잃은 동료 (추모 명단). words는 마지막 말 (기다리는 중이면 null) */
  memorial: Fallen[];
  /** 가진 금화 (원정에서 얻은 금화는 살아 돌아와야 여기에 더해진다) */
  gold: number;
  /** 원정 짐: 다음 원정에 들고 갈 물자 */
  pack: Record<SupplyKind, number>;
  /** 가진 유물 id (마을에서 판다) */
  relics: string[];
  /** 가진 유실물 (id별 개수). 팔거나, 나중에 대장간·전수관 재료로 */
  salvage: Record<string, number>;
  /** 상점 재고 (원정에서 돌아올 때마다 새로 들어온다) */
  stock: Record<SupplyKind, number>;
  /** 아무도 끼지 않은 장신구 (대장간 보관함) */
  trinkets: OwnedTrinket[];
  /** 한 번이라도 들어가 본 지역 id (지도에 이름이 보인다) */
  explored: string[];
  /** 던전 보스를 한 번이라도 쓰러뜨린 지역 id (지도 기록일 뿐. 보스는 원정마다 다시 나오고, 원정은 언제나 1층부터) */
  conquered: string[];
  /** 클랜 창고의 히든 열쇠 (종류마다 최대 1개, 원정을 넘어 유지) */
  keyItems: KeyItemId[];
  /** 집: 숙소 → 클랜 본부 (가입 의사 8명이 모이면 창설) */
  home: "inn" | "clanHall";
  /** 마지막 정산일과 연체 (주 수, 밀린 금화) */
  lastSettlementDay: number;
  arrearsWeeks: number;
  clanDebt: number;
  /** 이번 귀환에 집에서 1:1로 이야기할 수 있는 남은 사람 수 */
  talksLeft: number;
  /** 게시판에 붙은 의뢰 id, 받아 둔 직접 의뢰, 진행 중인 파견, 끝난 파견 보고 (최근 것부터) */
  board: string[];
  activeQuests: string[];
  dispatches: Dispatch[];
  dispatchLog: DispatchReport[];
  homeScene: HomeScene | null;
  /** 방금 한 클랜 가입 제안의 대답 (저장하지 않는다) */
  clanAnswer: { mercId: string; accepted: boolean; words: string | null } | null;
};

/** day: 죽은 날 (결산에서 이번 원정의 사망자를 찾는다) */
export type Fallen = { id: string; name: string; title: string; words: string | null; depth: number; day?: number };

/** 원정 결산 */
export type Report = {
  /** 가장 깊이 내려간 층 */
  depth: number;
  outcome: "goal" | "retreat" | "defeat";
  /** 전투 중에 도망쳤다 (후퇴의 한 갈래) */
  fled?: boolean;
  /** 원정한 날 */
  day: number;
  /** 가지고 돌아온 금화·유물·남은 물자 (전멸이면 0과 빈 목록) */
  gold: number;
  relics: string[];
  salvage: Record<string, number>;
  supplies: Record<SupplyKind, number>;
  /** 찾아 온 장신구 id */
  trinkets: string[];
  /** 전멸해서 두고 온 것 */
  lost: { gold: number; relics: number; salvage: number; supplies: number } | null;
  /** 죽은 용병과 함께 잃은 장신구 이름 */
  lostTrinkets: string[];
  /** 쓰러졌다가 살아 돌아온 용병 이름 */
  fallen: string[];
  /** 보수 지급·체불, 호감 변화, 떠난 용병 (한 줄씩) */
  wages: string[];
  bonds: string[];
  left: string[];
  /** 경험치·레벨업 (한 줄씩) */
  growth: string[];
  /** 히든 열쇠: 얻음·소모·잃음 (한 줄씩) */
  keys?: string[];
  /** 지난 날 수 */
  days?: number;
  /** 의뢰: 직접 의뢰 완료, 파견 결과 (한 줄씩) */
  quests?: string[];
  /** 정산 (한 줄씩) */
  clan?: string[];
};

/** 마을 안의 화면: 마을(홈), 용병 길드, 상점, 숙소(파티 편성), 던전 입구 */
export type TownPlace = "town" | "guild" | "shop" | "inn" | "gate" | "yard" | "hall" | "forge" | "board";

export type RestTalk = {
  mercId: string;
  reply: TalkResponse | null;
  pending: boolean;
  error: string | null;
  /** 플레이어가 한 번 말하고 답을 들었으면 끝 */
  done: boolean;
};

export type GameAction =
  | { type: "enterTalk"; mercId: string }
  | { type: "pending" }
  | { type: "resolved"; mercId: string; playerText: string | null; res: TalkResponse }
  | { type: "failed"; mercId: string; error: string }
  | { type: "leave" }
  | { type: "dismiss"; mercId: string }
  | { type: "recruitStart" }
  | { type: "recruited"; seeds: MercSeed[] }
  | { type: "recruitFailed"; error: string }
  /** seed: 맵·전투·사건 난수 시드. 리듀서를 순수하게 유지하려고 밖에서 굴려 넘긴다 */
  | { type: "enterDungeon"; seed: number; dungeon?: string }
  | { type: "move"; nodeId: string; seed: number }
  | { type: "narrated"; eventId: string; data: EventResponse | null }
  | { type: "chooseEvent"; choiceId: string; seed: number }
  | { type: "leaveRoom" }
  /** 목적지에서 고른 갈래(다음 지역)로 내려간다. seed: 새 지도 */
  | { type: "descend"; seed: number; region: string }
  | { type: "giveSupply"; item: SupplyKind; target: string }
  | { type: "battleAct"; action: BattleAction }
  /** 전투 중 후퇴: 전투를 버리고 원정을 끝낸다 (동료들의 호감이 떨어진다) */
  | { type: "fleeBattle"; seed: number }
  /** 전투가 끝나고 맵으로 돌아간다. seed: 전리품 (없으면 전투의 난수 상태. 결과 화면 미리보기와 같다) */
  | { type: "battleFinish"; seed?: number }
  /** 상점: 물자 하나 사기, 유물 하나 팔기 */
  | { type: "buy"; item: SupplyKind }
  | { type: "sell"; index: number }
  /** 단련장: 금화를 내고 스탯 3을 직접 배분 (레벨업으로 생긴 기회를 하나 쓴다) */
  | { type: "train"; mercId: string; alloc: StatBlock }
  /** 단련장: 등급 승급 (등급의 1단계에서). 패시브 후보에서 하나, 금으로 오를 때는 전직 갈래(원소술사면 원소 둘)도 */
  | { type: "promote"; mercId: string; passive?: string; branch?: string; elements?: Element[] }
  /** 전수관: 금화·유실물을 내고 이 용병에게 조각 하나를 뚫어 준다 */
  | { type: "unlockPiece"; mercId: string; piece: string }
  /** 전수관: 부 조각 강화 (한 단계, 100% 성공) */
  | { type: "upgradePiece"; mercId: string; piece: string }
  /** 전수관: 아는 조각으로 스킬을 조립한다 (메인 하나 + 부 조각) */
  | { type: "craftSkill"; mercId: string; build: SkillBuild }
  /** 전수관: 장착 바꾸기 (스킬 id: 배운 스킬 equip ↔ 장착 스킬 unequip) */
  | { type: "swapSkill"; mercId: string; equip?: string; unequip?: string }
  /** 보관 중인 스킬을 잊는다 (보관함이 꽉 찼을 때) */
  | { type: "forgetSkill"; mercId: string; key: string }
  /** 대장간: 장신구를 새로 만든다 (보관함으로) */
  | { type: "forgeTrinket"; trinket: string }
  /** 대장간: 장신구 강화 (용병이 낀 것은 mercId, 보관함 것은 index). 무조건 성공 */
  | { type: "upgradeTrinket"; mercId?: string; index?: number }
  /** 대장간: 보관함의 장신구를 용병에게 낀다 (끼던 것은 보관함으로) */
  | { type: "equipTrinket"; mercId: string; index: number }
  | { type: "unequipTrinket"; mercId: string }
  /** 유실물 팔기 (all이면 그 종류 전부) */
  | { type: "sellSalvage"; id: string; all?: boolean }
  /** 탐험을 끝내고 길드로 (귀환, 후퇴, 전멸). 다음 탐험은 모두 회복한 채 시작한다. seed: 계약 파기 판정 */
  | { type: "endExpedition"; seed: number }
  | { type: "restTalkStart"; mercId: string }
  | { type: "restTalkPending" }
  | { type: "restTalkReply"; res: TalkResponse; done: boolean }
  | { type: "restTalkFailed"; error: string }
  | { type: "dismissNotices" }
  /** 죽은 용병의 마지막 말이 도착했다 */
  | { type: "farewell"; mercId: string; words: string }
  /** 전투 후퇴에 대한 용병의 한마디 (결산에 붙인다) */
  | { type: "fleeLine"; name: string; words: string }
  /** 저장에서 불러온 상태로 바꾼다 */
  | { type: "load"; state: GameState }
  /** 저장을 지우고 처음부터 */
  | { type: "newGame" }
  /** 게시판: 직접 의뢰 받기·포기 */
  | { type: "acceptQuest"; questId: string }
  | { type: "abandonQuest"; questId: string }
  /** 게시판: 클랜원을 파견 의뢰에 보낸다 */
  | { type: "dispatchQuest"; questId: string; members: string[] }
  /** 파견 보고 이야기 (AI) */
  | { type: "dispatchStory"; index: number; text: string }
  /** 집: 신뢰 단계 용병에게 클랜 가입을 제안한다 (seed: 수락 판정) */
  | { type: "proposeClan"; mercId: string; seed: number }
  | { type: "clanWords"; mercId: string; words: string }
  /** 집: 가입 의사가 8명 모이면 클랜을 세운다 */
  | { type: "foundClan" }
  /** 집: 1:1 대화를 시작한다 (귀환마다 2명) */
  | { type: "homeTalkStart"; mercId: string }
  | { type: "homeTalkEnd" }
  /** 일상 장면 (AI) */
  | { type: "sceneText"; text: string }
  /** 마을 안에서 이동 */
  | { type: "goto"; place: TownPlace }
  /** 숙소: 고용한 용병을 원정 파티에 넣거나 뺀다 */
  | { type: "toggleParty"; mercId: string };

export function entryId(entry: RosterEntry): string {
  return entry.kind === "unique" ? entry.id : entry.seed.id;
}

/** 명단 칸을 실제 용병으로. 반응표는 특성에서 다시 계산된다 */
export function mercOf(entry: RosterEntry): Merc {
  const merc = entry.kind === "unique" ? getMerc(entry.id) : buildMerc(entry.seed);
  if (!merc) throw new Error(`잘못된 명단 항목: ${entryId(entry)}`);
  return merc;
}

/**
 * 죽은 용병을 명단에서 영영 지우고 추모 명단에 올린다.
 * 함께 있던 동료들은 호감이 떨어지고(지켜 주지 못했다), 기억에 그 죽음이 남는다.
 */
function bury(state: GameState, deadIds: string[], won: boolean): GameState {
  if (deadIds.length === 0) return state;
  let next = state;
  const lines: string[] = [];
  for (const id of deadIds) {
    const entry = next.roster.find((e) => entryId(e) === id);
    if (!entry) continue;
    const merc = mercOf(entry);
    const progress = { ...next.progress };
    // 장신구: 그 전투를 이겼으면 시신에서 거둬 오고, 지거나 도망쳤으면 던전에 남는다
    const trinket = progress[id]?.trinket;
    if (trinket) {
      if (won) next = { ...next, trinkets: [...next.trinkets, trinket] };
      else if (next.expedition) {
        const name = getTrinket(trinket.id)?.name ?? trinket.id;
        next = { ...next, expedition: { ...next.expedition, lostTrinkets: [...(next.expedition.lostTrinkets ?? []), name] } };
      }
      lines.push(won ? `${merc.name}의 장신구를 거두었다.` : `${merc.name}의 장신구는 던전에 남았다.`);
    }
    delete progress[id];
    next = {
      ...next,
      roster: next.roster.filter((e) => entryId(e) !== id),
      party: next.party.filter((x) => x !== id),
      progress,
      memorial: [...next.memorial, { id, name: merc.name, title: merc.title, words: null, depth: next.expedition?.depth ?? 1, day: next.day }],
    };
    lines.push(`${merc.name}이(가) 숨을 거두었다.`);
    // 함께 있던 동료들: 호감 하락, 기억에 남는다
    const witnesses = next.party.filter((x) => next.progress[x]);
    const down = bumpAffinity(next, Object.fromEntries(witnesses.map((x) => [x, DEATH.allyAffinity])), `${merc.name}을(를) 잃었다`);
    const remembered = { ...down.progress };
    for (const x of witnesses) {
      const p = remembered[x];
      const memory = `${p.memory} ${merc.name}이(가) 던전에서 죽었다.`.trim();
      remembered[x] = { ...p, memory: memory.slice(-MEMORY_MAX_CHARS) };
    }
    next = { ...next, progress: remembered };
    lines.push(...down.lines);
  }
  return { ...next, reactions: [...next.reactions, ...lines] };
}

/** 원정을 마친 용병들에게 보수를 준다. 파티 순서대로 주다가 금화가 모자라면 그 뒤는 체불 */
function payWages(state: GameState, ids: string[]): { state: GameState; lines: string[] } {
  let gold = state.gold;
  let paidTotal = 0;
  const unpaid: Record<string, number> = {};
  for (const id of ids) {
    const p = state.progress[id];
    const entry = state.roster.find((e) => entryId(e) === id);
    // 클랜원은 보수가 없다 (유지비로 대신한다)
    if (!p?.hired || !entry || p.kind === "member") continue;
    const wage = p.wage ?? wageOf(mercOf(entry));
    if (gold >= wage) {
      gold -= wage;
      paidTotal += wage;
    } else {
      unpaid[id] = WAGE.unpaidAffinity;
    }
  }
  const lines: string[] = [];
  if (paidTotal > 0) lines.push(`보수로 금화 ${paidTotal}을(를) 나눠 주었다.`);
  const after = bumpAffinity({ ...state, gold }, unpaid, "보수를 받지 못했다");
  lines.push(...after.lines);
  return { state: { ...state, gold, progress: after.progress }, lines };
}

/** 상점 재고를 새로 들인다 */
const addOnce = (xs: string[], x: string) => (xs.includes(x) ? xs : [...xs, x]);

/** 금화와 유실물로 낼 수 있나 */
function canPay(state: GameState, cost: { gold: number; salvage: Record<string, number> }): boolean {
  return state.gold >= cost.gold && Object.entries(cost.salvage).every(([id, n]) => (state.salvage[id] ?? 0) >= n);
}

function restock(seed: number): Record<SupplyKind, number> {
  const rng = createRng(seed ^ 0x5eed);
  return Object.fromEntries(
    (Object.keys(STOCK_RANGE) as SupplyKind[]).map((k) => [k, rollInt(rng.next, STOCK_RANGE[k][0], STOCK_RANGE[k][1])]),
  ) as Record<SupplyKind, number>;
}

export function isTown(kind: string): kind is TownPlace {
  return kind === "town" || kind === "guild" || kind === "shop" || kind === "inn" || kind === "gate" || kind === "yard" || kind === "hall" || kind === "forge" || kind === "board";
}

/** 길드 등급: 고용한 용병 중 가장 높은 등급 (아무도 없으면 동). 전수관의 은 조각 해금 조건 */
export function guildRank(state: GameState): MercLevel {
  let best = 0;
  for (const e of state.roster) {
    if (!state.progress[entryId(e)]?.hired) continue;
    best = Math.max(best, RANK_ORDER.indexOf(mercOf(e).level ?? "bronze"));
  }
  return RANK_ORDER[best];
}

/** 고용한 용병 수 (파티에 들지 않은 사람 포함). 지금은 이 수가 MERC_SLOTS를 넘지 못한다 */
export function hiredCount(state: GameState): number {
  return Object.values(state.progress).filter((p) => p.hired).length;
}

/** 동행 중인 용병의 호감 단계 */
function bondsOf(state: GameState): Record<string, Stage> {
  return Object.fromEntries(state.party.map((id) => [id, getStage(state.progress[id]?.affinity ?? 0)]));
}

/** 여러 용병의 호감을 올리고, 화면에 보일 줄을 만든다 */
function bumpAffinity(
  state: GameState,
  changes: Record<string, number>,
  why: string,
): { progress: GameState["progress"]; lines: string[] } {
  const progress = { ...state.progress };
  const lines: string[] = [];
  for (const [id, n] of Object.entries(changes)) {
    const p = progress[id];
    if (!p || !n) continue;
    const affinity = clampStat(p.affinity + n);
    if (affinity === p.affinity) continue;
    progress[id] = { ...p, affinity };
    const entry = state.roster.find((e) => entryId(e) === id);
    const arrow = n >= BOND.rescuedAffinity ? "↑↑" : n > 0 ? "↑" : "↓";
    lines.push(`${entry ? mercOf(entry).name : id}: 호감 ${arrow} (${why})`);
  }
  return { progress, lines };
}

/** 동행 중인 용병 (성장 스탯을 실어서) */
function partyMercs(state: GameState): Merc[] {
  return state.party.flatMap((id) => {
    const entry = state.roster.find((e) => entryId(e) === id);
    const p = state.progress[id];
    // 성장 스탯 + 장신구
    return entry ? [{ ...mercOf(entry), stats: addStats(p?.stats ?? {}, trinketStats(p?.trinket)), subLevels: p?.levels ?? {} }] : [];
  });
}

const ARROW = { 1: "↑", 2: "↑↑", [-1]: "↓", [-2]: "↓↓" } as Record<number, string>;

/**
 * 사건 선택의 태도에 살아 있는 용병들이 반응표대로 반응한다 (대화와 같은 규칙).
 * 던전 안의 반응은 대화의 반복 감쇠를 쓰지 않는다.
 */
function reactToTone(
  state: GameState,
  exp: Expedition,
  tone: Parameters<typeof applyTone>[2] | null,
): { progress: GameState["progress"]; reactions: string[] } {
  if (!tone) return { progress: state.progress, reactions: [] };
  const progress = { ...state.progress };
  const reactions: string[] = [];
  for (const member of exp.members.filter((m) => !m.down)) {
    const entry = state.roster.find((e) => entryId(e) === member.id);
    const p = progress[member.id];
    if (!entry || !p) continue;
    const r = applyTone(mercOf(entry), { affinity: p.affinity, willingness: p.willingness, recentTones: [] }, tone);
    progress[member.id] = { ...p, affinity: r.affinity, willingness: r.willingness };
    const parts = [
      r.delta.affinity ? `호감 ${ARROW[Math.sign(r.delta.affinity) * (Math.abs(r.delta.affinity) > 5 ? 2 : 1)]}` : "",
      r.delta.willingness ? `의향 ${ARROW[Math.sign(r.delta.willingness) * (Math.abs(r.delta.willingness) > 15 ? 2 : 1)]}` : "",
    ].filter(Boolean);
    if (parts.length) reactions.push(`${member.name}: ${parts.join(" · ")}`);
  }
  return { progress, reactions };
}

function freshProgress(merc: Merc): MercProgress {
  return {
    affinity: merc.startAffinity,
    willingness: merc.startWillingness,
    recentTones: [],
    history: [],
    memory: "",
    talks: 0,
    offers: { advance: false, share: false },
    hired: false,
    learned: [],
    pieces: [],
    levels: {},
    kind: "merc",
    ...NO_GROWTH,
  };
}

export function initialState(): GameState {
  // 고유 용병 + (개발용) 샘플 용병. 샘플은 data/sampleRoster.ts에서 끌 수 있다
  const roster: RosterEntry[] = [
    ...MERCS.map((m) => ({ kind: "unique" as const, id: m.id })),
    ...(USE_SAMPLE_ROSTER ? sampleSeeds().map((seed) => ({ kind: "random" as const, seed })) : []),
  ];
  return {
    roster,
    progress: Object.fromEntries(roster.map((e) => [entryId(e), freshProgress(mercOf(e))])),
    party: [],
    recruit: { pending: false, error: null },
    screen: { kind: "town" },
    report: null,
    day: 1,
    expedition: null,
    narration: null,
    reactions: [],
    restTalk: null,
    notices: [],
    renown: 0,
    reputation: 0,
    booted: false,
    memorial: [],
    gold: START_GOLD,
    pack: { ...START_PACK },
    relics: [],
    salvage: {},
    trinkets: [],
    explored: [],
    conquered: [],
    keyItems: [],
    home: "inn",
    lastSettlementDay: 1,
    arrearsWeeks: 0,
    clanDebt: 0,
    talksLeft: HOME_TALKS,
    board: rollBoard(1),
    activeQuests: [],
    dispatches: [],
    dispatchLog: [],
    homeScene: null,
    clanAnswer: null,
    stock: { ...START_STOCK },
  };
}

/** 파견 중이거나 다쳐서 쉬는 중인가 */
export function isBusy(state: GameState, mercId: string): boolean {
  return (state.progress[mercId]?.busyUntilDay ?? 0) > state.day;
}

/** 용병 하나를 명단에서 지운다 (떠남). 장신구는 보관함으로 */
function removeMerc(state: GameState, id: string): GameState {
  const p = state.progress[id];
  const progress = { ...state.progress };
  delete progress[id];
  return {
    ...state,
    trinkets: p?.trinket ? [...state.trinkets, p.trinket] : state.trinkets,
    roster: state.roster.filter((e) => entryId(e) !== id),
    party: state.party.filter((x) => x !== id),
    progress,
  };
}

const nameOf = (state: GameState, id: string) => {
  const entry = state.roster.find((e) => entryId(e) === id);
  return entry ? mercOf(entry).name : "누군가";
};

/**
 * 던전에서 돌아왔을 때 (보상·날짜는 이미 처리됨): 직접 의뢰 완료 → 파견 진행 → 정산 → 대화 횟수 → 게시판 → 일상 장면.
 * 파티 체력은 다음 원정을 언제나 가득 찬 채 시작하므로 따로 할 일이 없다
 */
function returnToVillage(state: GameState, exp: Expedition, report: Report, seed: number): GameState {
  let next = state;
  const rng = createRng(seed ^ 0x7e57);
  const defeat = exp.room?.kind === "defeat";
  report.days = next.day - report.day;

  // 1. 직접 의뢰: 살아 돌아왔으면 목표를 이룬 의뢰의 보상 (수집 의뢰는 그 유실물을 낸다)
  const questLines: string[] = [];
  if (!defeat) {
    const tally = { kills: exp.kills ?? {}, eliteKills: exp.eliteKills ?? {}, salvage: next.salvage };
    for (const id of next.activeQuests) {
      const q = getQuest(id);
      if (q?.kind !== "direct" || !objectiveDone(q.objective, tally)) continue;
      let salvage = next.salvage;
      if (q.objective.type === "collect") salvage = paySalvage(salvage, { [q.objective.itemId]: q.objective.count });
      next = {
        ...next,
        gold: next.gold + q.reward.gold,
        salvage: addSalvage(salvage, q.reward.salvage ?? {}),
        activeQuests: next.activeQuests.filter((x) => x !== id),
      };
      tally.salvage = next.salvage;
      questLines.push(`의뢰 완료: ${q.title} · ${CURRENCY} +${q.reward.gold}`);
    }
  }

  // 3. 파견: 끝난 것을 판정한다 (결과는 코드, 이야기는 AI)
  const done = next.dispatches.filter((d) => d.endDay <= next.day);
  next = { ...next, dispatches: next.dispatches.filter((d) => d.endDay > next.day) };
  for (const d of done) {
    const q = getQuest(d.questId);
    if (q?.kind !== "dispatch") continue;
    const members = d.members.flatMap((id) => {
      const entry = next.roster.find((e) => entryId(e) === id);
      const p = next.progress[id];
      if (!entry || !p) return [];
      const m = mercOf(entry);
      return [{ id, level: m.level ?? "bronze", stats: p.stats, personalities: m.traitIds?.personalities ?? [], background: m.traitIds?.background, name: m.name }];
    });
    const result = resolveDispatch(d.questId, members, rng.next() * 2 ** 32);
    if (!result) continue;
    const lines: string[] = [];
    if (result.success) {
      next = { ...next, gold: next.gold + q.reward.gold, salvage: addSalvage(next.salvage, q.reward.salvage ?? {}) };
      lines.push(`성공 · ${CURRENCY} +${q.reward.gold}`);
    } else lines.push("실패");
    // 부상: 더 쉬어야 한다
    const progress = { ...next.progress };
    for (const r of result.members) {
      if (r.outcome === "injured" && progress[r.id]) {
        progress[r.id] = { ...progress[r.id], busyUntilDay: next.day + DISPATCH.injuryDays };
        lines.push(`${members.find((m) => m.id === r.id)!.name} 부상 (${DISPATCH.injuryDays}일 쉰다)`);
      }
    }
    next = { ...next, progress };
    const bumped = bumpAffinity(next, result.affinity, result.success ? "파견 성공" : "파견 실패");
    next = { ...next, progress: bumped.progress };
    lines.push(...bumped.lines);
    // 사망은 영구 (장신구는 동료들이 거둬 온다)
    const dead = result.members.filter((r) => r.outcome === "dead").map((r) => r.id);
    if (dead.length) next = bury(next, dead, true);
    const entryReport: DispatchReport = {
      questId: d.questId,
      title: q.title,
      day: next.day,
      success: result.success,
      members: result.members.map((r) => ({ id: r.id, name: members.find((m) => m.id === r.id)?.name ?? "", outcome: r.outcome })),
      lines,
      story: null,
    };
    next = { ...next, dispatchLog: [entryReport, ...next.dispatchLog].slice(0, 10) };
    questLines.push(`파견 「${q.title}」 ${result.success ? "성공" : "실패"}${dead.length ? ` · 잃은 동료 ${dead.length}명` : ""}`);
  }
  if (questLines.length) report.quests = questLines;

  // 4. 정산: 7일 경계를 넘은 만큼 유지비. 모자라면 연체 (1주: 호감 하락, 2주부터: 호감이 가장 낮은 클랜원이 떠난다)
  const due = settlementsDue(next.lastSettlementDay, next.day);
  const clanLines: string[] = [];
  for (let i = 0; i < due; i++) {
    const memberIds = Object.entries(next.progress).filter(([, p]) => p.hired && p.kind === "member").map(([id]) => id);
    const owed = upkeepCost(next.home, memberIds.length) + next.clanDebt;
    if (owed === 0) continue;
    const paid = Math.min(next.gold, owed);
    const debt = owed - paid;
    next = { ...next, gold: next.gold - paid, clanDebt: debt, arrearsWeeks: debt > 0 ? next.arrearsWeeks + 1 : 0 };
    clanLines.push(debt > 0 ? `유지비 ${CURRENCY} ${owed} 중 ${paid}만 냈다. 밀린 돈 ${debt} (${next.arrearsWeeks}주 연체)` : `유지비 ${CURRENCY} ${paid}를 냈다.`);
    if (next.arrearsWeeks >= 1 && memberIds.length) {
      const down = bumpAffinity(next, Object.fromEntries(memberIds.map((id) => [id, ARREARS.affinity])), "유지비가 밀렸다");
      next = { ...next, progress: down.progress };
      clanLines.push(...down.lines);
    }
    if (next.arrearsWeeks >= ARREARS.leaveFrom && memberIds.length) {
      const lowest = [...memberIds].sort((a, b) => next.progress[a].affinity - next.progress[b].affinity)[0];
      clanLines.push(`${nameOf(next, lowest)}은(는) 밀린 유지비에 지쳐 클랜을 떠났다.`);
      next = removeMerc(next, lowest);
    }
  }
  next = { ...next, lastSettlementDay: next.lastSettlementDay + due * SETTLEMENT_DAYS };
  if (clanLines.length) report.clan = clanLines;

  // 6~7. 집에서 이야기할 수 있는 사람 수, 게시판 (상점은 이미 새로 들였다)
  const taken = [...next.activeQuests, ...next.dispatches.map((d) => d.questId)];
  next = { ...next, talksLeft: HOME_TALKS, board: rollBoard(seed, taken) };

  // 일상 장면: 고용한 용병 둘 (확률)
  const hired = Object.entries(next.progress).filter(([, p]) => p.hired).map(([id]) => id);
  if (hired.length >= 2 && rng.next() < DAILY_SCENE_CHANCE) {
    const a = hired.splice(Math.floor(rng.next() * hired.length), 1)[0];
    const b = hired[Math.floor(rng.next() * hired.length)];
    next = { ...next, homeScene: { ids: [a, b], text: null, day: next.day } };
  } else {
    next = { ...next, homeScene: null };
  }
  return next;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "enterTalk":
      return {
        ...state,
        screen: { kind: "talk", mercId: action.mercId, reply: null, pending: true, error: null, ended: false },
      };

    case "pending":
      if (state.screen.kind !== "talk") return state;
      return { ...state, screen: { ...state.screen, pending: true, error: null } };

    case "failed":
      // 응답이 오기 전에 다른 용병과의 대화로 넘어갔으면 이 오류는 버린다
      if (state.screen.kind !== "talk" || state.screen.mercId !== action.mercId) return state;
      return { ...state, screen: { ...state.screen, pending: false, error: action.error } };

    case "resolved": {
      const { mercId, playerText, res } = action;
      const prev = state.progress[mercId];
      const lines: HistoryLine[] = [
        ...(playerText ? [{ speaker: "player" as const, text: playerText }] : []),
        { speaker: "merc", text: res.message },
      ];
      const joined = res.joined === true;
      const entry = state.roster.find((e) => entryId(e) === mercId);
      const merc = entry ? mercOf(entry) : undefined;
      // 조건 제시가 받아들여졌으면 기록하고, 선금이면 금화를 낸다
      const offers = res.offer ? { ...prev.offers, [res.offer]: true } : prev.offers;
      const paid = res.offer === "advance" && merc ? advanceCost(merc) : 0;
      const progress: MercProgress = {
        // 성장 상태 등 대화와 상관없는 칸은 그대로 둔다
        ...prev,
        affinity: res.affinity,
        willingness: res.willingness,
        recentTones: res.recentTones,
        // 기억으로 접힌 오래된 줄은 지우고, 이번 턴의 줄을 붙인다
        history: [...prev.history.slice(res.forget), ...lines].slice(-HISTORY_LIMIT),
        memory: res.memory,
        talks: res.talks,
        offers,
        hired: prev.hired || joined,
        // 고용될 때 보수가 정해진다 (몫 약속을 했으면 +50%)
        wage: prev.wage ?? (joined && merc ? wageOf(merc, offers.share) : undefined),
      };
      return {
        ...state,
        gold: Math.max(0, state.gold - paid),
        progress: { ...state.progress, [mercId]: progress },
        // 고용되면 자리가 있을 때 원정 파티에도 넣는다 (숙소에서 바꿀 수 있다)
        party: joined && !state.party.includes(mercId) && state.party.length < MERC_SLOTS ? [...state.party, mercId] : state.party,
        screen:
          // 수치·기록은 반영하되, 화면은 지금 그 용병과 대화 중일 때만 바꾼다
          state.screen.kind === "talk" && state.screen.mercId === mercId
            ? { ...state.screen, reply: res, pending: false, error: null, ended: joined }
            : state.screen,
      };
    }

    case "leave":
      return { ...state, screen: { kind: "guild" } };

    case "enterDungeon": {
      // 동행 중인 용병만 데려간다. 체력·물자는 탐험이 끝날 때까지 이어진다
      const mercs = partyMercs(state);
      const dungeon = getDungeon(action.dungeon ?? FIRST_DUNGEON);
      if (mercs.length === 0 || !dungeon?.open) return state;
      const expedition = startExpedition(mercs, action.seed, state.pack, dungeon.id, state.keyItems);
      return {
        ...state,
        // 짐을 들고 떠난다 (남은 물자는 돌아올 때 짐으로 돌아온다)
        expedition,
        explored: addOnce(state.explored, expedition.region!),
        pack: { ...START_PACK },
        narration: null,
        reactions: [],
        screen: { kind: "dungeon" },
      };
    }

    case "move": {
      if (!state.expedition) return state;
      const moved = moveTo(state.expedition, partyMercs(state), action.nodeId, action.seed, bondsOf(state));
      if (!moved) return state;
      const room = moved.exp.room;
      return {
        ...state,
        expedition: moved.exp,
        reactions: [],
        restTalk: null,
        narration: room?.kind === "event" ? { eventId: room.eventId, pending: true, data: null } : null,
        screen: moved.battle ? { kind: "battle", battle: moved.battle } : { kind: "dungeon" },
      };
    }

    case "narrated":
      if (state.narration?.eventId !== action.eventId) return state;
      return { ...state, narration: { eventId: action.eventId, pending: false, data: action.data } };

    case "chooseEvent": {
      if (!state.expedition) return state;
      const exp = chooseEvent(state.expedition, action.choiceId, action.seed, bondsOf(state));
      if (exp === state.expedition || exp.room?.kind !== "event" || !exp.room.result) return state;
      const { progress, reactions } = reactToTone(state, exp, exp.room.result.tone);
      return { ...state, expedition: exp, progress, reactions };
    }

    case "descend": {
      const next = state.expedition && descend(state.expedition, action.seed, action.region);
      return next
        ? { ...state, expedition: next, explored: addOnce(state.explored, next.region!), reactions: [], narration: null, restTalk: null }
        : state;
    }

    case "leaveRoom":
      if (!state.expedition) return state;
      if (state.restTalk?.pending) return state;
      return { ...state, expedition: leaveRoom(state.expedition), narration: null, reactions: [], restTalk: null };

    case "giveSupply": {
      if (!state.expedition) return state;
      const exp = giveSupply(state.expedition, action.item, action.target, bondsOf(state)[action.target]);
      if (exp === state.expedition) return state;
      // 물자를 받은 용병은 호감이 조금 오른다
      const gained = bumpAffinity(state, { [action.target]: BOND.giftAffinity }, "물자를 받았다");
      return { ...state, expedition: exp, ...gained, reactions: gained.lines };
    }

    case "restTalkStart":
      if (!state.expedition || state.expedition.room?.kind !== "rest" || state.expedition.room.talked) return state;
      return {
        ...state,
        expedition: markRestTalk(state.expedition),
        restTalk: { mercId: action.mercId, reply: null, pending: true, error: null, done: false },
      };

    case "restTalkPending":
      if (!state.restTalk) return state;
      return { ...state, restTalk: { ...state.restTalk, pending: true, error: null } };

    case "restTalkReply":
      if (!state.restTalk) return state;
      return { ...state, restTalk: { ...state.restTalk, reply: action.res, pending: false, done: action.done } };

    case "restTalkFailed":
      if (!state.restTalk) return state;
      return { ...state, restTalk: { ...state.restTalk, pending: false, error: action.error } };

    case "buy": {
      const price = PRICE[action.item];
      const packed = Object.values(state.pack).reduce((a, b) => a + b, 0);
      if (state.expedition || state.gold < price || state.stock[action.item] <= 0 || packed >= PACK_LIMIT) return state;
      return {
        ...state,
        gold: state.gold - price,
        pack: { ...state.pack, [action.item]: state.pack[action.item] + 1 },
        stock: { ...state.stock, [action.item]: state.stock[action.item] - 1 },
      };
    }

    case "sell": {
      const relic = getRelic(state.relics[action.index] ?? "");
      if (state.expedition || !relic) return state;
      return { ...state, gold: state.gold + relic.value, relics: state.relics.filter((_, i) => i !== action.index) };
    }

    case "train": {
      const p = state.progress[action.mercId];
      if (state.expedition || !p?.hired || p.trainable <= 0 || state.gold < TRAINING_COST || !validTraining(action.alloc)) return state;
      return {
        ...state,
        gold: state.gold - TRAINING_COST,
        progress: { ...state.progress, [action.mercId]: { ...p, stats: addStats(p.stats, action.alloc), trainable: p.trainable - 1 } },
      };
    }

    case "promote": {
      const p = state.progress[action.mercId];
      const entry = state.roster.find((e) => entryId(e) === action.mercId);
      if (state.expedition || !p?.hired || !canPromote(p) || entry?.kind !== "random") return state;
      const cost = promoteCost(entry.seed.level);
      if (cost === null || state.gold < cost) return state;
      const seed = promote(entry.seed, { passive: action.passive, branch: action.branch, elements: action.elements });
      if (!seed) return state;
      const roster = state.roster.map((e) => (e === entry ? { kind: "random" as const, seed } : e));
      const merc = mercOf({ kind: "random", seed });
      return {
        ...state,
        gold: state.gold - cost,
        roster,
        progress: {
          ...state.progress,
          // 새 등급의 3단계부터. 승급 보너스로 체력과 단련 기회가 붙는다. 보수도 등급에 맞춰 오른다 (몫 약속은 그대로)
          [action.mercId]: {
            ...p,
            lv: 0,
            xp: 0,
            stats: addStats(p.stats, { hp: PROMOTE_BONUS.hp }),
            trainable: p.trainable + PROMOTE_BONUS.trainable,
            wage: wageOf(merc, p.offers.share),
          },
        },
      };
    }

    case "unlockPiece": {
      const p = state.progress[action.mercId];
      const entry = state.roster.find((e) => entryId(e) === action.mercId);
      if (state.expedition || !p?.hired || entry?.kind !== "random") return state;
      const known = knownFragments(entry.seed, p.learned, p.pieces);
      if (unlockBlock(action.piece, entry.seed, known, state.gold, state.salvage, guildRank(state))) return state;
      const { cost } = getFragment(action.piece)!;
      return {
        ...state,
        gold: state.gold - cost!.gold,
        salvage: paySalvage(state.salvage, cost!.salvage),
        progress: { ...state.progress, [action.mercId]: { ...p, pieces: [...p.pieces, action.piece] } },
      };
    }

    case "upgradePiece": {
      const p = state.progress[action.mercId];
      const entry = state.roster.find((e) => entryId(e) === action.mercId);
      if (state.expedition || !p?.hired || entry?.kind !== "random") return state;
      const known = knownFragments(entry.seed, p.learned, p.pieces);
      if (upgradeBlock(action.piece, known, p.levels, state.gold, state.salvage)) return state;
      const lv = (p.levels[action.piece] ?? 1) + 1;
      const cost = upgradeCost(getFragment(action.piece)!, lv)!;
      return {
        ...state,
        gold: state.gold - cost.gold,
        salvage: paySalvage(state.salvage, cost.salvage),
        progress: { ...state.progress, [action.mercId]: { ...p, levels: { ...p.levels, [action.piece]: lv } } },
      };
    }

    case "craftSkill":
    case "swapSkill": {
      const p = state.progress[action.mercId];
      const entry = state.roster.find((e) => entryId(e) === action.mercId);
      if (state.expedition || !p?.hired || entry?.kind !== "random") return state;
      const done =
        action.type === "craftSkill"
          ? craft(entry.seed, p.learned, p.pieces, state.gold, action.build)
          : swapSkills(entry.seed, p.learned, { equip: action.equip, unequip: action.unequip });
      if (!done) return state;
      return {
        ...state,
        gold: action.type === "craftSkill" ? state.gold - CRAFT_COST : state.gold,
        roster: state.roster.map((e) => (e === entry ? { kind: "random" as const, seed: done.seed } : e)),
        progress: { ...state.progress, [action.mercId]: { ...p, learned: done.learned } },
      };
    }

    case "acceptQuest": {
      const q = getQuest(action.questId);
      if (state.expedition || q?.kind !== "direct" || !state.board.includes(q.id) || state.activeQuests.length >= MAX_ACTIVE_DIRECT) return state;
      return { ...state, board: state.board.filter((id) => id !== q.id), activeQuests: [...state.activeQuests, q.id] };
    }

    case "abandonQuest":
      if (state.expedition || !state.activeQuests.includes(action.questId)) return state;
      return { ...state, activeQuests: state.activeQuests.filter((id) => id !== action.questId) };

    case "dispatchQuest": {
      const q = getQuest(action.questId);
      if (state.expedition || q?.kind !== "dispatch" || !state.board.includes(q.id)) return state;
      const ids = [...new Set(action.members)];
      if (ids.length < q.size[0] || ids.length > q.size[1]) return state;
      // 클랜원만, 쉬는 중이 아닌 사람만 (용병은 보낼 수 없다)
      if (ids.some((id) => state.progress[id]?.kind !== "member" || !state.progress[id]?.hired || isBusy(state, id))) return state;
      const endDay = state.day + q.days;
      const progress = { ...state.progress };
      for (const id of ids) progress[id] = { ...progress[id], busyUntilDay: endDay };
      return {
        ...state,
        progress,
        party: state.party.filter((id) => !ids.includes(id)),
        board: state.board.filter((id) => id !== q.id),
        dispatches: [...state.dispatches, { questId: q.id, members: ids, endDay }],
      };
    }

    case "dispatchStory":
      return { ...state, dispatchLog: state.dispatchLog.map((r, i) => (i === action.index ? { ...r, story: action.text } : r)) };

    case "proposeClan": {
      const p = state.progress[action.mercId];
      const entry = state.roster.find((e) => entryId(e) === action.mercId);
      if (state.expedition || !p?.hired || !entry || p.kind === "member" || p.pledged || p.clanAskedDay === state.day) return state;
      const merc = mercOf(entry);
      const chance = clanJoinChance(p.affinity, merc.traitIds?.personalities ?? [], merc.traitIds?.background);
      if (chance <= 0) return state;
      const accepted = createRng(action.seed).next() < chance;
      // 클랜이 이미 있으면 바로 클랜원, 없으면 가입 의사만
      const changed: MercProgress = accepted
        ? state.home === "clanHall"
          ? { ...p, kind: "member", clanAskedDay: state.day }
          : { ...p, pledged: true, clanAskedDay: state.day }
        : { ...p, clanAskedDay: state.day };
      return { ...state, progress: { ...state.progress, [action.mercId]: changed }, clanAnswer: { mercId: action.mercId, accepted, words: null } };
    }

    case "clanWords":
      return state.clanAnswer?.mercId === action.mercId ? { ...state, clanAnswer: { ...state.clanAnswer, words: action.words } } : state;

    case "foundClan": {
      const pledged = Object.entries(state.progress).filter(([, p]) => p.hired && p.pledged);
      if (state.expedition || state.home !== "inn" || pledged.length < CLAN_FOUNDERS) return state;
      const progress = { ...state.progress };
      for (const [id, p] of pledged) progress[id] = { ...p, kind: "member", pledged: false };
      return { ...state, home: "clanHall", progress, lastSettlementDay: state.day, notices: [...state.notices, "클랜 본부를 세웠다. 이제 7일마다 유지비가 나간다."] };
    }

    case "homeTalkStart":
      if (state.expedition || state.talksLeft <= 0 || !state.progress[action.mercId]?.hired || state.restTalk) return state;
      return {
        ...state,
        talksLeft: state.talksLeft - 1,
        restTalk: { mercId: action.mercId, reply: null, pending: true, error: null, done: false },
      };

    case "homeTalkEnd":
      return state.expedition ? state : { ...state, restTalk: null };

    case "sceneText":
      return state.homeScene ? { ...state, homeScene: { ...state.homeScene, text: action.text } } : state;

    case "forgetSkill": {
      const p = state.progress[action.mercId];
      if (state.expedition || !p?.hired) return state;
      const learned = forgetSkill(p.learned, action.key);
      return learned ? { ...state, progress: { ...state.progress, [action.mercId]: { ...p, learned } } } : state;
    }

    case "forgeTrinket": {
      const t = getTrinket(action.trinket);
      if (state.expedition || !t) return state;
      const cost = forgeCost(t, 1);
      if (!canPay(state, cost)) return state;
      return { ...state, gold: state.gold - cost.gold, salvage: paySalvage(state.salvage, cost.salvage), trinkets: [...state.trinkets, { id: t.id, lv: 1 }] };
    }

    case "upgradeTrinket": {
      if (state.expedition) return state;
      const p = action.mercId ? state.progress[action.mercId] : undefined;
      const owned = action.mercId ? p?.trinket : state.trinkets[action.index ?? -1];
      const t = owned && getTrinket(owned.id);
      if (!owned || !t || owned.lv >= TRINKET_MAX_LV) return state;
      const cost = forgeCost(t, owned.lv + 1);
      if (!canPay(state, cost)) return state;
      const up = { ...owned, lv: owned.lv + 1 };
      const paid = { ...state, gold: state.gold - cost.gold, salvage: paySalvage(state.salvage, cost.salvage) };
      return action.mercId
        ? { ...paid, progress: { ...state.progress, [action.mercId]: { ...p!, trinket: up } } }
        : { ...paid, trinkets: state.trinkets.map((x, i) => (i === action.index ? up : x)) };
    }

    case "equipTrinket": {
      const p = state.progress[action.mercId];
      const entry = state.roster.find((e) => entryId(e) === action.mercId);
      const owned = state.trinkets[action.index];
      if (state.expedition || !p?.hired || !entry || !owned || getTrinket(owned.id)?.job !== mercOf(entry).job) return state;
      const trinkets = state.trinkets.filter((_, i) => i !== action.index);
      return {
        ...state,
        trinkets: p.trinket ? [...trinkets, p.trinket] : trinkets,
        progress: { ...state.progress, [action.mercId]: { ...p, trinket: owned } },
      };
    }

    case "unequipTrinket": {
      const p = state.progress[action.mercId];
      if (state.expedition || !p?.trinket) return state;
      return { ...state, trinkets: [...state.trinkets, p.trinket], progress: { ...state.progress, [action.mercId]: { ...p, trinket: undefined } } };
    }

    case "sellSalvage": {
      const item = getSalvage(action.id);
      const have = state.salvage[action.id] ?? 0;
      // 전수관 재료는 팔 수 없다
      if (state.expedition || !item || have <= 0 || !sellable(action.id)) return state;
      const n = action.all ? have : 1;
      const salvage = { ...state.salvage, [action.id]: have - n };
      if (salvage[action.id] === 0) delete salvage[action.id];
      return { ...state, gold: state.gold + item.value * n, salvage };
    }

    case "dismissNotices":
      return { ...state, notices: [] };

    case "load":
      return { ...action.state, booted: true };

    case "newGame":
      return { ...initialState(), booted: true };

    case "goto":
      // 탐험 중이거나 대화 중에는 마을 이동을 하지 않는다 (결산 화면에서는 마을로 나간다)
      if (state.expedition || (!isTown(state.screen.kind) && state.screen.kind !== "report")) return state;
      return { ...state, screen: { kind: action.place }, report: state.screen.kind === "report" ? null : state.report };

    case "toggleParty": {
      if (state.expedition || !state.progress[action.mercId]?.hired) return state;
      // 파견 중이거나 다친 클랜원은 원정에 데려갈 수 없다
      if (!state.party.includes(action.mercId) && isBusy(state, action.mercId)) return state;
      if (state.party.includes(action.mercId)) return { ...state, party: state.party.filter((id) => id !== action.mercId) };
      if (state.party.length >= MERC_SLOTS) return state;
      return { ...state, party: [...state.party, action.mercId] };
    }

    case "battleAct":
      if (state.screen.kind !== "battle") return state;
      return { ...state, screen: { kind: "battle", battle: act(state.screen.battle, action.action) } };

    case "battleFinish": {
      if (state.screen.kind !== "battle" || !state.screen.battle.outcome) return state;
      if (!state.expedition) return { ...state, screen: { kind: "town" } };
      // 이번 전투에서 길안내자에게 물자를 받은 용병은 호감이 오른다
      const gifts = giftsReceived(state.screen.battle);
      const gained = bumpAffinity(
        state,
        Object.fromEntries(Object.entries(gifts).map(([id, n]) => [id, n * BOND.giftAffinity])),
        "물자를 받았다",
      );
      // 이기면 전리품 (금화, 가끔 유물)
      // 전리품 시드는 전투의 마지막 난수 상태 (전투 결과 화면의 미리보기와 같은 결과가 나온다)
      const spoils = battleSpoils(finishBattle(state.expedition, state.screen.battle), state.screen.battle, action.seed ?? state.screen.battle.rng);
      // 던전 보스를 쓰러뜨렸으면 지도 기록에 남긴다 (보스는 다음 원정에도 다시 나온다)
      const conquered = spoils.exp.cleared && !state.expedition.cleared ? addOnce(state.conquered, spoils.exp.region!) : state.conquered;
      const next: GameState = {
        ...state,
        ...gained,
        reactions: [...spoils.lines, ...gained.lines],
        expedition: spoils.exp,
        conquered,
        screen: { kind: "dungeon" },
      };
      return bury(
        next,
        state.screen.battle.units.filter((u) => u.side === "merc" && u.dead).map((u) => u.id),
        state.screen.battle.outcome === "victory",
      );
    }

    case "fleeBattle": {
      if (state.screen.kind !== "battle" || state.screen.battle.outcome || !state.expedition) return state;
      // 쓰러진 용병은 남겨진다 (사망)
      const battle = { ...state.screen.battle, units: state.screen.battle.units.map((u) => (isDowned(u) ? { ...u, dead: true, downedTurnsLeft: undefined, downedFresh: undefined } : u)) };
      // 체력·쓰러짐·죽음을 반영하고, 죽은 용병을 묻는다
      let next: GameState = bury(
        { ...state, expedition: { ...finishBattle(state.expedition, battle), room: null }, screen: { kind: "dungeon" } },
        battle.units.filter((u) => u.side === "merc" && u.dead).map((u) => u.id),
        false,
      );
      // 살아 있는 동행 용병: 싸움에서 등을 보인 것에 대한 반응 (성격마다 다르다)
      const changes: Record<string, number> = {};
      for (const m of next.expedition!.members.filter((x) => !x.dead)) {
        const entry = next.roster.find((e) => entryId(e) === m.id);
        if (!entry) continue;
        const temper = fleeTemper(mercOf(entry).traitIds?.personalities);
        changes[m.id] = BOND.fleeAffinity + temper;
      }
      const pick = (keep: (n: number) => boolean) => Object.fromEntries(Object.entries(changes).filter(([, n]) => keep(n)));
      const shamed = bumpAffinity(next, pick((n) => n < 0), "싸움에서 등을 보였다");
      const relieved = bumpAffinity({ ...next, progress: shamed.progress }, pick((n) => n > 0), "무사히 물러나 안도했다");
      const fled = { lines: [...shamed.lines, ...relieved.lines] };
      next = { ...next, progress: relieved.progress };
      next = gameReducer(next, { type: "endExpedition", seed: action.seed });
      return next.report ? { ...next, report: { ...next.report, fled: true, bonds: [...fled.lines, ...next.report.bonds] } } : next;
    }

    case "fleeLine":
      return state.report ? { ...state, report: { ...state.report, bonds: [...state.report.bonds, `${action.name}: “${action.words}”`] } } : state;

    case "farewell": {
      const memorial = state.memorial.map((f) => (f.id === action.mercId ? { ...f, words: action.words } : f));
      const fallen = memorial.find((f) => f.id === action.mercId);
      return {
        ...state,
        memorial,
        reactions: fallen ? [...state.reactions, `${fallen.name}의 마지막 말: “${action.words}”`] : state.reactions,
      };
    }

    case "endExpedition": {
      const exp = state.expedition;
      // 하루가 지난다 (원정 1번 = 하루). 결산 화면을 거쳐 마을로
      let next: GameState = {
        ...state,
        expedition: null,
        narration: null,
        reactions: [],
        restTalk: null,
        screen: exp ? { kind: "report" } : { kind: "town" },
        // 던전에서 보낸 날: 도달한 층수만큼 (1층 1일 … 4층 4일)
        day: state.day + Math.max(1, exp?.depth ?? 1),
      };
      if (!exp) return next;
      const defeat = exp.room?.kind === "defeat";
      const report: Report = {
        depth: exp.depth,
        outcome: defeat ? "defeat" : exp.room?.kind === "goal" ? "goal" : "retreat",
        day: state.day,
        gold: defeat ? 0 : exp.gold,
        relics: defeat ? [] : exp.loot,
        salvage: defeat ? {} : (exp.salvage ?? {}),
        trinkets: defeat ? [] : (exp.trinkets ?? []),
        lostTrinkets: [...(exp.lostTrinkets ?? []), ...(defeat ? (exp.trinkets ?? []).map((id) => getTrinket(id)?.name ?? id) : [])],
        supplies: defeat ? { ...START_PACK } : { ...exp.supplies },
        lost: defeat
          ? {
              gold: exp.gold,
              relics: exp.loot.length,
              salvage: salvageCount(exp.salvage ?? {}),
              supplies: Object.values(exp.supplies).reduce((a, b) => a + b, 0),
            }
          : null,
        fallen: exp.members.filter((m) => m.fell && !m.dead).map((m) => m.name),
        wages: [],
        bonds: [],
        left: [],
        growth: [],
      };
      // 경험치: 살아 돌아온 용병. 지나온 칸 수 + 목적지 보너스, 층의 권장 등급보다 높은 용병은 줄어든다
      // 전멸하면 금화·전리품처럼 경험치도 없다 (깊이 들어가 전멸하는 게 빨리 크는 길이 되지 않게)
      if (!defeat && expeditionXp(exp) > 0) {
        const progress = { ...next.progress };
        for (const m of exp.members.filter((x) => !x.dead)) {
          const p = progress[m.id];
          const entry = next.roster.find((e) => entryId(e) === m.id);
          if (!p || !entry) continue;
          const xp = xpFor(exp, mercOf(entry).level);
          if (xp <= 0) {
            report.growth.push(`${m.name}: 이 던전에서는 더 배울 것이 없다 (경험치 0)`);
            continue;
          }
          const { growth, gained } = gainXp(p, xp, m.job);
          progress[m.id] = { ...p, ...growth };
          report.growth.push(
            gained.length
              ? `${m.name}: 경험치 +${xp}, 레벨업 → ${stageOf(growth.lv)}단계 (${gained.map((g) => statLine(g, STAT_NAME)).join(" / ")})${canPromote(growth) ? " · 승급할 수 있다" : ""}`
              : `${m.name}: 경험치 +${xp}`,
          );
        }
        next = { ...next, progress };
      }
      // 히든 열쇠: 쓴 열쇠는 보스를 잡고 나오면 소모, 전멸하면 잃고, 후퇴하면 남는다.
      // 이번에 얻은 열쇠는 살아 돌아와야 창고에 (이미 있으면 금화로)
      {
        let keys = [...next.keyItems];
        const lines: string[] = [];
        let bonusGold = 0;
        if (exp.keyUsed && keys.includes(exp.keyUsed)) {
          const name = KEY_ITEMS[exp.keyUsed].name;
          if (defeat) {
            keys = keys.filter((k) => k !== exp.keyUsed);
            lines.push(`${name}을(를) 던전에서 잃었다.`);
          } else if (exp.cleared && regionOf(exp).hidden) {
            keys = keys.filter((k) => k !== exp.keyUsed);
            lines.push(`${name}은(는) 제 할 일을 다하고 빛을 잃었다.`);
          }
        }
        if (!defeat) {
          for (const k of exp.keyFound ?? []) {
            if (keys.includes(k)) {
              bonusGold += KEY_ITEMS[k].duplicateGold;
              lines.push(`${KEY_ITEMS[k].name}은(는) 이미 있어서 ${CURRENCY} ${KEY_ITEMS[k].duplicateGold}에 넘겼다.`);
            } else {
              keys.push(k);
              lines.push(`${KEY_ITEMS[k].name}을(를) 클랜 창고에 넣었다.`);
            }
          }
        }
        next = { ...next, keyItems: keys, gold: next.gold + bonusGold };
        if (lines.length) report.keys = lines;
      }
      // 살아 돌아왔으면 얻은 금화·유물과 남은 물자를 챙긴다. 전멸하면 모두 잃는다
      if (!defeat) {
        next = {
          ...next,
          gold: next.gold + exp.gold,
          relics: [...next.relics, ...exp.loot],
          salvage: addSalvage(next.salvage, exp.salvage ?? {}),
          trinkets: [...next.trinkets, ...(exp.trinkets ?? []).map((id) => ({ id, lv: 1 }))],
          pack: { ...exp.supplies },
        };
      }
      next = { ...next, stock: restock(action.seed) };
      // 보수: 살아 있는 동행 용병에게 원정마다 준다. 모자라면 체불 (호감이 떨어진다)
      const payroll = payWages(next, exp.members.filter((m) => !m.dead).map((m) => m.id));
      next = payroll.state;
      report.wages.push(...payroll.lines);
      // 쓰러진 동료를 데리고 돌아왔으면 그 용병과 동료들이 고마워한다
      const rescue = rescueBonds(exp);
      if (Object.keys(rescue).length) {
        const gained = bumpAffinity(next, rescue, "쓰러진 동료를 데려왔다");
        next = { ...next, progress: gained.progress };
        report.bonds.push(...gained.lines);
      }
      // 적대 단계인 용병은 확률로 계약을 깨고 떠난다
      const rng = createRng(action.seed);
      for (const id of exp.members.map((m) => m.id)) {
        const p = next.progress[id];
        if (!p || getStage(p.affinity) !== "hostile" || rng.next() >= BOND.leaveChance) continue;
        const entry = next.roster.find((e) => entryId(e) === id);
        report.left.push(`${entry ? mercOf(entry).name : "누군가"}은(는) 계약을 깨고 길드를 떠났다.`);
        const progress = { ...next.progress };
        delete progress[id];
        next = {
          ...next,
          // 장신구는 두고 간다
          trinkets: p.trinket ? [...next.trinkets, p.trinket] : next.trinkets,
          roster: next.roster.filter((e) => entryId(e) !== id),
          party: next.party.filter((x) => x !== id),
          progress,
        };
      }
      next = returnToVillage(next, exp, report, action.seed);
      return { ...next, report };
    }

    case "dismiss": {
      // 내보내는 용병의 장신구는 보관함으로
      const trinket = state.progress[action.mercId]?.trinket;
      return {
        ...state,
        party: state.party.filter((id) => id !== action.mercId),
        trinkets: trinket ? [...state.trinkets, trinket] : state.trinkets,
        progress: {
          ...state.progress,
          [action.mercId]: { ...state.progress[action.mercId], hired: false, trinket: undefined },
        },
      };
    }

    case "recruitStart":
      return { ...state, recruit: { pending: true, error: null } };

    case "recruitFailed":
      return { ...state, recruit: { pending: false, error: action.error } };

    case "recruited": {
      // 고용하지 않은 랜덤 용병은 떠나고, 새 얼굴로 바뀐다. 고유 용병과 동행 중인 용병은 남는다.
      const stays = state.roster.filter(
        (e) => e.kind === "unique" || state.progress[entryId(e)]?.hired,
      );
      const newcomers: RosterEntry[] = action.seeds.map((seed) => ({ kind: "random", seed }));
      const roster = [...stays, ...newcomers];
      const keep = new Set(roster.map(entryId));

      const progress = Object.fromEntries(
        Object.entries(state.progress).filter(([id]) => keep.has(id)),
      );
      for (const entry of newcomers) progress[entryId(entry)] = freshProgress(mercOf(entry));

      return { ...state, roster, progress, recruit: { pending: false, error: null } };
    }
  }
}
