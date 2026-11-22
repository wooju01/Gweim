import { MERCS, getMerc } from "@/data/mercs";
import { START_PARTY, startSeeds } from "@/data/startRoster";
import { SUPPLY, type SupplyKind } from "@/data/combat";
import { BOND, fleeTemper } from "@/data/bond";
import { MERC_SLOTS } from "@/game/merc/party";
import { DEATH } from "@/data/death";
import { MEMORY_MAX_CHARS } from "@/game/merc/memory";
import { applyTone, clampStat, getStage } from "@/game/merc/affinity";
import { createRng, rollInt, type Rng } from "@/game/random";
import { CURRENCY, GREATER_POTION_GRADE, PACK_LIMIT, PACK_ORDER, PRICE, START_GOLD, START_PACK, START_STOCK, STOCK_RANGE, MATERIAL_SHOP, materialPrice, storageCaps, storageCost } from "@/data/economy";
import { getRelic } from "@/data/relics";
import { SALVAGE, addSalvage, getSalvage, salvageCount, sellable } from "@/data/loot";
import { WAGE } from "@/data/wages";
import { PROMOTE_BONUS, STAT_NAME, trainingCost, type StatBlock } from "@/data/growth";
import { NO_GROWTH, addStats, atLastStage, canPromote, gainXp, statLine, validTraining, xpToNext, type Growth } from "@/game/merc/growth";
import { promote, promoteCost } from "@/game/merc/promotion";
import { craft, forgetSkill, knownFragments, paySalvage, swapSkills, unlockBlock, upgradeBlock } from "@/game/merc/skillhall";
import { CRAFT_COST, getFragment, upgradeCost } from "@/data/fragments";
import { FIRST_DUNGEON, getDungeon, getRegion } from "@/data/regions";
import { RANKS, RANK_ORDER, nextRank, stageOf } from "@/data/ranks";
import { GUILD_PROMOTION, GUILD_START, PROOF_BOSSES } from "@/data/guild";
import { getMonster } from "@/data/monsters";
import { FORGE_DISCOUNT, TRINKET_SLOTS, canWear, forgeCost, getTrinket, trinketFits, trinketMaxLv, trinketsBonus, type OwnedTrinket } from "@/data/trinkets";
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
  battleFor,
  retreatAmbush,
  spendBattleMods,
  xpFor,
  type Expedition,
} from "@/game/dungeon/expedition";
import { KEY_ITEMS, type KeyItemId } from "@/data/keyItems";
import { ARREARS, CLAN_FOUNDERS, DAILY_SCENE_CHANCE, HOME_TALKS, SETTLEMENT_DAYS } from "@/data/clan";
import { DISPATCH, FAME_BY_KIND, QUEST_INFO, getQuest, type DirectQuest, type QuestReward } from "@/data/quests";
import { FAME, FAME_EFFECT, QUEST_SLOTS, fameRank, fameTier } from "@/data/fame";
import { clanJoinChance, fixedQuests, isDirect, objectiveDone, questOverdue, resolveDispatch, rewardBlocked, rollBoard, settlementsDue, upkeepCost, type DispatchOutcome, type Tally } from "@/game/quests";
import { buildMerc } from "@/game/merc/generate";
import type { Merc } from "@/game/types";
import type { Element, EventResponse, HistoryLine, MercLevel, MercRef, MercSeed, SkillBuild, Stage, TalkResponse, TalkState } from "@/lib/schemas";

const HISTORY_LIMIT = 20;

/** wage: 고용할 때 정해진 원정 1회 보수 (몫 약속을 했으면 더 많다). 고용 전에는 없다 */
/** learned: 배웠지만 장착하지 않은 스킬 (장착 칸이 꽉 찼을 때, 전수관에서 바꿔 낀다) */
/** pieces: 전수관에서 이 용병에게 뚫어 준 조각 (가진 스킬 안에 든 조각은 따로 저장하지 않는다) */
/** levels: 부 조각 레벨 (전수관 강화. 없으면 Lv1) */
/** trinkets: 끼고 있는 장신구 (대장간, 최대 TRINKET_SLOTS개) */
export type MercProgress = TalkState & {
  hired: boolean;
  wage?: number;
  learned: SkillBuild[];
  pieces: string[];
  levels: Record<string, number>;
  trinkets: OwnedTrinket[];
  /** 용병(원정마다 보수) / 클랜원(보수 없음, 파견 가능). 없으면 용병 */
  kind?: "merc" | "member";
  /** 클랜 가입 의사를 밝혔다 (창설 전) */
  pledged?: boolean;
  /** 이 날까지 파견·부상으로 원정 파티에 넣을 수 없다 */
  busyUntilDay?: number;
  /** 마지막으로 클랜 가입을 제안한 날 (거절당하면 다음 귀환까지 다시 못 한다) */
  clanAskedDay?: number;
  /** 살아서 이긴 던전 보스 (monster id). 등급이 바뀌는 승급의 증명 (data/guild.ts의 PROOF_BOSSES) */
  bossWins: string[];
  /** 단련한 횟수 (단련 비용이 오른다) */
  trainings?: number;
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
  /** 명성 (data/fame.ts). 의뢰를 마치면 오르고, 실패·기한 초과면 내려간다 */
  fame: number;
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
  /** 받아 둔 직접 의뢰를 받은 날 (기한 계산) */
  questAccepted: Record<string, number>;
  /** 마친 직접 의뢰 (지명 의뢰는 다시 붙지 않는다) */
  questsDone: string[];
  /** 마쳤지만 아직 보상을 고르지 않은 의뢰 */
  pendingRewards: string[];
  /** 이번 주(정산 주기)에 의뢰 보상으로 받은 것: 전술 교본, 종족 유물 (각 1개까지) */
  weeklyRewards: { book: boolean; relic: boolean };
  /** 의뢰 보상으로 알아낸 정보 (data/quests.ts의 QUEST_INFO) */
  infos: string[];
  /** 시설 이용료 할인 (이 날까지) */
  discounts: { facility: "forge" | "shop"; untilDay: number }[];
  /** 한 번이라도 본 사건 (처음 보는 사건이 조금 잘 나온다) */
  eventsSeen: string[];
  /** 이번 원정 사이에 상점에서 산 재료 (종류별 개수, 원정을 마치면 비운다) */
  materialBought: Record<string, number>;
  /** 의뢰 보상으로 합류할 용병 수 (모집 API로 만든다) */
  pendingJoins: number;
  /** 한 번이라도 쓰러뜨린 보스 (처음 쓰러뜨리면 명성) */
  bossesSlain: string[];
  /** 창고 확장 횟수 (data/economy.ts의 STORAGE) */
  storageLevel: number;
  /** 길드 등급 (큰 등급만). 승급 시험 의뢰 + 금화로만 오른다 (data/guild.ts) */
  guildGrade: MercLevel;
  /** 통과한 길드 승급 시험 (그 등급으로 오를 수 있다) */
  guildExams: MercLevel[];
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
  /** 귀환길에 습격을 받았다 (목적지 전에 후퇴) */
  ambushed?: boolean;
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
  /** 상점 재료 하나 사기 (계열 재료·기술 파편) */
  | { type: "buyMaterial"; id: string }
  | { type: "sell"; index: number }
  /** 단련장: 금화를 내고 스탯 3을 직접 배분 (레벨업으로 생긴 기회를 하나 쓴다) */
  | { type: "train"; mercId: string; alloc: StatBlock }
  /** 단련장: 등급 승급 (등급의 1단계에서). 패시브 후보에서 하나, 금으로 오를 때는 전직 갈래(원소술사면 원소 둘)도 */
  | { type: "promote"; mercId: string; passive?: string; branch?: string; elements?: Element[] }
  /** 길드 승급 (시험 통과 + 금화) */
  | { type: "promoteGuild" }
  /** 창고 확장 (재료 종류별 +10칸, 물자 +20개) */
  | { type: "expandStorage" }
  /** 납품 의뢰: 창고의 재료를 낸다 */
  | { type: "deliverQuest"; questId: string; seed: number }
  /** 마친 의뢰의 보상 고르기 (choices의 0 또는 1) */
  | { type: "claimQuestReward"; questId: string; choice: 0 | 1; seed: number }
  /** 의뢰 보상으로 합류하는 용병 (모집 API 결과) */
  | { type: "joinedFree"; seeds: MercSeed[] }
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
  | { type: "upgradeTrinket"; mercId?: string; slot?: number; index?: number }
  /** 대장간: 보관함의 장신구를 용병에게 낀다 (끼던 것은 보관함으로) */
  | { type: "equipTrinket"; mercId: string; index: number; slot?: number }
  | { type: "unequipTrinket"; mercId: string; slot?: number }
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
    const worn = progress[id]?.trinkets ?? [];
    if (worn.length) {
      if (won) next = { ...next, trinkets: [...next.trinkets, ...worn] };
      else if (next.expedition) {
        const names = worn.map((t) => getTrinket(t.id)?.name ?? t.id);
        next = { ...next, expedition: { ...next.expedition, lostTrinkets: [...(next.expedition.lostTrinkets ?? []), ...names] } };
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
const addOnce = <T extends string>(xs: T[], x: T): T[] => (xs.includes(x) ? xs : [...xs, x]);

/** 금화와 유실물로 낼 수 있나 */
function canPay(state: GameState, cost: { gold: number; salvage: Record<string, number> }): boolean {
  return state.gold >= cost.gold && Object.entries(cost.salvage).every(([id, n]) => (state.salvage[id] ?? 0) >= n);
}

/** 상점 재고를 새로 들인다. 중급 물약은 길드가 은 이상일 때만 */
function restock(seed: number, guildGrade: MercLevel): Record<SupplyKind, number> {
  const rng = createRng(seed ^ 0x5eed);
  const open = RANK_ORDER.indexOf(guildGrade) >= RANK_ORDER.indexOf(GREATER_POTION_GRADE);
  return Object.fromEntries(
    (Object.keys(STOCK_RANGE) as SupplyKind[]).map((k) => [k, k === "greaterPotion" && !open ? 0 : rollInt(rng.next, STOCK_RANGE[k][0], STOCK_RANGE[k][1])]),
  ) as Record<SupplyKind, number>;
}

export function isTown(kind: string): kind is TownPlace {
  return kind === "town" || kind === "guild" || kind === "shop" || kind === "inn" || kind === "gate" || kind === "yard" || kind === "hall" || kind === "forge" || kind === "board";
}

/** 떠날 때 창고에서 원정 짐을 챙긴다: PACK_LIMIT까지, PACK_ORDER 순서로 */
export function packFor(stash: Record<SupplyKind, number>): { carried: Record<SupplyKind, number>; left: Record<SupplyKind, number> } {
  const carried = { ...START_PACK };
  const left = { ...stash };
  let room = PACK_LIMIT;
  for (const k of PACK_ORDER) {
    const n = Math.min(room, left[k] ?? 0);
    carried[k] = n;
    left[k] = (left[k] ?? 0) - n;
    room -= n;
  }
  return { carried, left };
}

/** 창고에 물자를 더한다 (넘치면 더하는 쪽을 PACK_ORDER 순서로 잘라 낸다) */
function addSupplies(stash: Record<SupplyKind, number>, add: Record<SupplyKind, number>, cap = Infinity): Record<SupplyKind, number> {
  const out = { ...stash };
  let room = cap - Object.values(out).reduce((a, b) => a + b, 0);
  for (const k of PACK_ORDER) {
    const n = Math.max(0, Math.min(room, add[k] ?? 0));
    out[k] = (out[k] ?? 0) + n;
    room -= n;
  }
  return out;
}

/** 창고 한도: 재료·유실물 종류별, 물자 합계. 넘친 것은 버리고 알린다 */
function capStorage(state: GameState): { state: GameState; lines: string[] } {
  const caps = storageCaps(state.storageLevel);
  const lines: string[] = [];
  const salvage = { ...state.salvage };
  for (const [id, n] of Object.entries(salvage))
    if (n > caps.item) {
      salvage[id] = caps.item;
      lines.push(`창고가 가득 차 ${getSalvage(id)?.name ?? id} ${n - caps.item}개를 버렸다 (종류별 ${caps.item}개)`);
    }
  const total = Object.values(state.pack).reduce((a, b) => a + b, 0);
  let pack = state.pack;
  if (total > caps.supply) {
    pack = addSupplies({ ...START_PACK }, state.pack, caps.supply);
    lines.push(`창고가 가득 차 물자 ${total - caps.supply}개를 버렸다 (물자 ${caps.supply}개까지)`);
  }
  return { state: { ...state, salvage, pack }, lines };
}

/** 게시판 조건을 볼 때 쓰는 길드 상태 */
export const boardContext = (state: GameState) => ({ guildGrade: state.guildGrade, fame: state.fame, explored: state.explored });

/** 승급 시험·지명 의뢰가 붙어야 하면 게시판 맨 앞에 더한다 */
function withExam(state: GameState): GameState {
  const fixed = fixedQuests(boardContext(state), state.guildExams, state.activeQuests, state.questsDone).filter((id) => !state.board.includes(id));
  return fixed.length ? { ...state, board: [...fixed, ...state.board] } : state;
}

/** 고용비(선금·보수) 배율: 명성이 높을수록 조금 싸다 */
export const hireRate = (state: GameState) => 1 - fameRank(fameTier(state.fame)) * FAME_EFFECT.hireDiscountPerTier;

/** 지금 받아 둘 수 있는 직접 의뢰 수 (명성 단계별) */
export const questSlots = (state: GameState) => QUEST_SLOTS[fameTier(state.fame)];

/** 명성 변화 (0 아래로는 내려가지 않는다) */
function addFame(state: GameState, n: number): GameState {
  return n === 0 ? state : { ...state, fame: Math.max(0, state.fame + n) };
}

/** 상점 판매가 배율: 판매가 + 장신구(조합의 인장)를 낀 용병이 길드에 있으면 */
export function sellRate(state: GameState): number {
  const bonus = Object.values(state.progress).reduce((m, p) => Math.max(m, p.hired ? (trinketsBonus(p.trinkets).sellBonus ?? 0) : 0), 0);
  return 1 + bonus;
}

/** 대장간 비용 (할인 중이면 금화만 깎는다) */
function forgePrice(state: GameState, cost: { gold: number; salvage: Record<string, number> }) {
  return forgeDiscounted(state) ? { ...cost, gold: Math.round(cost.gold * (1 - FORGE_DISCOUNT)) } : cost;
}

/** 상점 가격 (사건 할인 중이면 20% 싸다) */
export function shopPrice(state: GameState, item: SupplyKind): number {
  const off = state.discounts.some((d) => d.facility === "shop" && d.untilDay >= state.day);
  return off ? Math.round(PRICE[item] * (1 - SHOP_DISCOUNT)) : PRICE[item];
}
export const SHOP_DISCOUNT = 0.2;

/** 지금 대장간 할인 중인가 */
export const forgeDiscounted = (state: GameState) => state.discounts.some((d) => d.facility === "forge" && d.untilDay >= state.day);

/** 의뢰 보상 하나를 준다. 줄 수 없으면(주간 제한) null */
export function giveQuestReward(state: GameState, r: QuestReward, rng: Rng): { state: GameState; line: string } | null {
  if (rewardBlocked(r, state.weeklyRewards)) return null;
  switch (r.type) {
    case "gold":
      return { state: { ...state, gold: state.gold + r.amount }, line: `${CURRENCY} +${r.amount}` };
    case "material":
      return { state: { ...state, salvage: addSalvage(state.salvage, { [r.itemId]: r.count }) }, line: `${getSalvage(r.itemId)?.name ?? r.itemId} ${r.count}개` };
    case "shard":
      return { state: { ...state, salvage: addSalvage(state.salvage, { tech_shard: r.count }) }, line: `기술 파편 ${r.count}개` };
    case "tacticBook":
      return {
        state: { ...state, salvage: addSalvage(state.salvage, { tactic_book: r.count }), weeklyRewards: { ...state.weeklyRewards, book: true } },
        line: `전술 교본 ${r.count}권`,
      };
    case "relic": {
      const pool = SALVAGE.filter((x) => x.kind === "raceRelic").map((x) => x.id);
      const id = r.relicId === "random" ? pool[Math.floor(rng.next() * pool.length)] : r.relicId;
      return {
        state: { ...state, salvage: addSalvage(state.salvage, { [id]: 1 }), weeklyRewards: { ...state.weeklyRewards, relic: true } },
        line: `종족 유물: ${getSalvage(id)?.name ?? id}`,
      };
    }
    case "consumable":
      return { state: { ...state, pack: { ...state.pack, [r.itemId]: state.pack[r.itemId] + r.count } }, line: `${SUPPLY[r.itemId].name} ${r.count}개 (원정 짐으로)` };
    case "accessory":
      return { state: { ...state, trinkets: [...state.trinkets, { id: r.accessoryId, lv: 1 }] }, line: `장신구: ${getTrinket(r.accessoryId)?.name ?? r.accessoryId}` };
    case "recruit":
      return { state: { ...state, pendingJoins: state.pendingJoins + 1 }, line: "용병 한 명이 고용비 없이 합류한다" };
    case "info":
      return { state: { ...state, infos: addOnce(state.infos, r.infoId) }, line: `정보: ${QUEST_INFO[r.infoId]?.title ?? r.infoId}` };
    case "discount":
      return {
        state: { ...state, discounts: [...state.discounts.filter((d) => d.facility !== r.facility), { facility: r.facility, untilDay: state.day + r.days }] },
        line: `대장간 이용료 할인 ${r.days}일`,
      };
    case "fame":
      return { state: addFame(state, r.amount), line: `명성 +${r.amount}` };
  }
}

/** 직접 의뢰를 마쳤다: 명성, 승급 시험 통과, 고정 보상은 바로 / 고르는 보상은 대기 */
function completeQuest(state: GameState, q: DirectQuest, rng: Rng): { state: GameState; lines: string[] } {
  let next = addFame(
    { ...state, activeQuests: state.activeQuests.filter((x) => x !== q.id), questsDone: addOnce(state.questsDone, q.id), questAccepted: omit(state.questAccepted, q.id) },
    FAME_BY_KIND[q.kind],
  );
  const lines = [`의뢰 완료: ${q.title} · 명성 +${FAME_BY_KIND[q.kind]}`];
  if (q.exam) {
    next = { ...next, guildExams: addOnce(next.guildExams, q.exam) };
    lines.push(`승급 시험 통과: 길드 창구에서 ${RANKS[q.exam].name} 등급으로 길드를 올릴 수 있다 (${CURRENCY} ${GUILD_PROMOTION[q.exam]?.gold ?? 0})`);
  }
  for (const r of q.rewards.fixed ?? []) {
    const got = giveQuestReward(next, r, rng);
    if (got) {
      next = got.state;
      lines.push(`보상: ${got.line}`);
    }
  }
  if (q.rewards.choices) {
    next = { ...next, pendingRewards: addOnce(next.pendingRewards, q.id) };
    lines.push("보상은 게시판에서 고른다");
  }
  return { state: next, lines };
}

function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const out = { ...rec };
  delete out[key];
  return out;
}

/** 길드 승급: 다음 등급의 시험을 통과했고 금화가 있으면 오를 수 있다. 못 오르면 이유 */
export function guildPromotionBlocks(state: GameState): { next: MercLevel | null; gold: number; blocks: string[] } {
  const next = nextRank(state.guildGrade);
  const rule = next ? GUILD_PROMOTION[next] : undefined;
  if (!next || !rule) return { next: null, gold: 0, blocks: ["다음 길드 등급은 아직 열리지 않았다"] };
  const blocks: string[] = [];
  if (!state.guildExams.includes(next)) blocks.push(`승급 시험 필요: ${getQuest(rule.exam)?.title ?? rule.exam}`);
  if (state.gold < rule.gold) blocks.push(`${CURRENCY} 부족 (${rule.gold})`);
  return { next, gold: rule.gold, blocks };
}

/**
 * 용병 승급(등급이 바뀌는 승급)을 막는 조건. 비어 있으면 승급할 수 있다.
 * ① 등급 마지막 단계 경험치 ② 금화 ③ 현재 등급 던전 보스를 살아서 이긴 기록 ④ 길드 등급 ≥ 목표 등급
 */
export function promotionBlocks(state: GameState, mercId: string): string[] {
  const p = state.progress[mercId];
  const entry = state.roster.find((e) => entryId(e) === mercId);
  if (!p?.hired || entry?.kind !== "random") return ["승급할 수 없는 용병"];
  const level = entry.seed.level;
  const next = nextRank(level);
  if (!next) return ["더 오를 등급이 없다"];
  const blocks: string[] = [];
  if (!atLastStage(p)) blocks.push("경험치 부족 (등급의 마지막 단계를 채워야 한다)");
  else if (!canPromote(p)) blocks.push(`승급용 경험치 부족 (${p.xp} / ${xpToNext(p.lv)})`);
  const cost = promoteCost(level) ?? 0;
  if (state.gold < cost) blocks.push(`${CURRENCY} 부족 (${cost})`);
  const proof = PROOF_BOSSES[level];
  if (!proof?.length) blocks.push("증명할 보스가 아직 정해지지 않았다");
  else if (!proof.some((id) => p.bossWins?.includes(id)))
    blocks.push(`보스전 승리 기록 필요 (${proof.map((id) => getMonster(id)?.name ?? id).join("·")} 중 하나)`);
  if (RANK_ORDER.indexOf(state.guildGrade) < RANK_ORDER.indexOf(next)) blocks.push(`길드 등급 부족 (${RANKS[next].name} 필요)`);
  return blocks;
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
    const bonus = trinketsBonus(p?.trinkets);
    return entry ? [{ ...mercOf(entry), stats: p?.stats ?? {}, subLevels: p?.levels ?? {}, gear: bonus }] : [];
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
    trinkets: [],
    bossWins: [],
    trainings: 0,
    ...NO_GROWTH,
  };
}

/**
 * 새 게임. 기본은 숙소에 고용된 동 등급 8명으로 시작한다 (data/startRoster.ts).
 * 테스트는 고용하지 않은 샘플 명단(data/sampleRoster.ts)으로 시작한다: initialState({ seeds: sampleSeeds(), hired: false })
 */
export function initialState(opts: { seeds?: MercSeed[]; hired?: boolean; party?: string[] } = {}): GameState {
  const seeds = opts.seeds ?? startSeeds();
  const hired = opts.hired ?? true;
  const roster: RosterEntry[] = [...MERCS.map((m) => ({ kind: "unique" as const, id: m.id })), ...seeds.map((seed) => ({ kind: "random" as const, seed }))];
  return {
    roster,
    progress: Object.fromEntries(
      roster.map((e) => {
        const merc = mercOf(e);
        const p = freshProgress(merc);
        return [entryId(e), hired ? { ...p, hired: true, wage: wageOf(merc) } : p];
      }),
    ),
    party: opts.party ?? (hired && !opts.seeds ? START_PARTY : []),
    recruit: { pending: false, error: null },
    screen: { kind: "town" },
    report: null,
    day: 1,
    expedition: null,
    narration: null,
    reactions: [],
    restTalk: null,
    notices: [],
    fame: 0,
    questAccepted: {},
    questsDone: [],
    pendingRewards: [],
    weeklyRewards: { book: false, relic: false },
    infos: [],
    discounts: [],
    materialBought: {},
    pendingJoins: 0,
    bossesSlain: [],
    storageLevel: 0,
    eventsSeen: [],
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
    guildGrade: GUILD_START,
    guildExams: [],
    // 승급 시험·지명 의뢰는 조건이 되면 맨 앞에 붙는다
    board: [...fixedQuests({ guildGrade: GUILD_START, fame: 0, explored: [] }, [], [], []), ...rollBoard(1, [], { guildGrade: GUILD_START, fame: 0, explored: [] })],
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
    trinkets: [...state.trinkets, ...(p?.trinkets ?? [])],
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

  // 1. 직접 의뢰: 살아 돌아왔으면 목표를 이룬 의뢰를 마친다 (수집 의뢰는 그 유실물을 낸다, 납품은 게시판에서).
  //    기한이 지난 의뢰는 실패 (명성 하락)
  const questLines: string[] = [];
  const tally: Tally = {
    kills: exp.kills ?? {},
    eliteKills: exp.eliteKills ?? {},
    salvage: next.salvage,
    regions: exp.regions,
    goals: exp.goals,
    feats: exp.feats,
    rescued: exp.rescued,
  };
  for (const id of [...next.activeQuests]) {
    const q = getQuest(id);
    if (!isDirect(q)) continue;
    if (!defeat && q.objective.type !== "deliver" && objectiveDone(q.objective, tally)) {
      if (q.objective.type === "collect") next = { ...next, salvage: paySalvage(next.salvage, { [q.objective.itemId]: q.objective.count }) };
      tally.salvage = next.salvage;
      const done = completeQuest(next, q, rng);
      next = done.state;
      questLines.push(...done.lines);
    } else if (questOverdue(q, next.questAccepted[id] ?? next.day, next.day)) {
      next = addFame({ ...next, activeQuests: next.activeQuests.filter((x) => x !== id), questAccepted: omit(next.questAccepted, id) }, FAME.overdue);
      questLines.push(`의뢰 실패 (기한 초과): ${q.title} · 명성 ${FAME.overdue}`);
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
    if (result.success && q.reward.fame) next = addFame(next, q.reward.fame);
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
  // 주간 의뢰 보상 제한(전술 교본·종족 유물)은 정산 때 풀린다
  if (due > 0) next = { ...next, weeklyRewards: { book: false, relic: false } };
  if (clanLines.length) report.clan = clanLines;

  // 6~7. 집에서 이야기할 수 있는 사람 수, 게시판 (상점은 이미 새로 들였다)
  const taken = [...next.activeQuests, ...next.dispatches.map((d) => d.questId)];
  next = withExam({ ...next, talksLeft: HOME_TALKS, board: rollBoard(seed, taken, boardContext(next)) });

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
      const paid = res.offer === "advance" && merc ? Math.round(advanceCost(merc) * hireRate(state)) : 0;
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
        wage: prev.wage ?? (joined && merc ? Math.max(1, Math.round(wageOf(merc, offers.share) * hireRate(state))) : undefined),
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
      // 받아 둔 구출 의뢰의 사건 (그 지역 사건 칸에 나온다)
      const questEvents = state.activeQuests.flatMap((id) => {
        const q = getQuest(id);
        return isDirect(q) && q.objective.type === "rescue" ? [{ eventId: q.objective.eventId, regionId: q.objective.regionId }] : [];
      });
      // 창고에서 원정 짐을 챙긴다 (PACK_LIMIT까지, 물약부터). 나머지는 창고에 남는다
      const { carried, left } = packFor(state.pack);
      const expedition = startExpedition(mercs, action.seed, carried, dungeon.id, state.keyItems, questEvents, state.eventsSeen);
      return {
        ...state,
        // 짐을 들고 떠난다 (남은 물자는 돌아올 때 짐으로 돌아온다)
        expedition,
        explored: addOnce(state.explored, expedition.region!),
        pack: left,
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
      let exp = chooseEvent(state.expedition, action.choiceId, action.seed, bondsOf(state));
      if (exp === state.expedition || exp.room?.kind !== "event" || !exp.room.result) return state;
      const { progress, reactions } = reactToTone(state, exp, exp.room.result.tone);
      let next: GameState = { ...state, progress, reactions };
      // 사건이 준 호감 변화
      if (exp.affinityDeltas && Object.keys(exp.affinityDeltas).length) {
        const bumped = bumpAffinity(next, exp.affinityDeltas, "사건");
        next = { ...next, progress: bumped.progress, reactions: [...next.reactions, ...bumped.lines] };
        exp = { ...exp, affinityDeltas: undefined };
      }
      // 사건 전투: 바로 싸운다 (끝나면 사건 결과 화면으로 돌아온다)
      if (exp.pendingBattle) {
        const battle = battleFor(exp, partyMercs(next), action.seed ^ 0xba7, bondsOf(next), undefined, 0, exp.pendingBattle);
        exp = spendBattleMods({ ...exp, pendingBattle: undefined });
        return { ...next, expedition: exp, screen: { kind: "battle", battle } };
      }
      return { ...next, expedition: exp };
    }

    case "descend": {
      const next = state.expedition && descend(state.expedition, action.seed, action.region);
      if (!next) return state;
      // 히든 지역을 처음 찾았다: 명성
      const firstHidden = !!getRegion(next.region!)?.hidden && !state.explored.includes(next.region!);
      return addFame(
        { ...state, expedition: next, explored: addOnce(state.explored, next.region!), reactions: [], narration: null, restTalk: null },
        firstHidden ? FAME.hiddenFirst : 0,
      );
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
      const price = shopPrice(state, action.item);
      const packed = Object.values(state.pack).reduce((a, b) => a + b, 0);
      if (state.expedition || state.gold < price || state.stock[action.item] <= 0 || packed >= storageCaps(state.storageLevel).supply) return state;
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
      return { ...state, gold: state.gold + Math.round(relic.value * sellRate(state)), relics: state.relics.filter((_, i) => i !== action.index) };
    }

    case "train": {
      const p = state.progress[action.mercId];
      // 단련 비용은 그 용병이 단련한 횟수만큼 오른다
      const cost = trainingCost(p?.trainings ?? 0);
      if (state.expedition || !p?.hired || p.trainable <= 0 || state.gold < cost || !validTraining(action.alloc)) return state;
      return {
        ...state,
        gold: state.gold - cost,
        progress: { ...state.progress, [action.mercId]: { ...p, stats: addStats(p.stats, action.alloc), trainable: p.trainable - 1, trainings: (p.trainings ?? 0) + 1 } },
      };
    }

    case "buyMaterial": {
      // 상점 재료: 계열 재료·기술 파편만, 원정 사이에 종류별 MATERIAL_SHOP.perExpedition개까지
      const price = materialPrice(action.id);
      const bought = state.materialBought[action.id] ?? 0;
      if (state.expedition || price === null || state.gold < price || bought >= MATERIAL_SHOP.perExpedition) return state;
      if ((state.salvage[action.id] ?? 0) >= storageCaps(state.storageLevel).item) return state;
      return {
        ...state,
        gold: state.gold - price,
        salvage: { ...state.salvage, [action.id]: (state.salvage[action.id] ?? 0) + 1 },
        materialBought: { ...state.materialBought, [action.id]: bought + 1 },
      };
    }

    case "promote": {
      const p = state.progress[action.mercId];
      const entry = state.roster.find((e) => entryId(e) === action.mercId);
      if (state.expedition || !p?.hired || entry?.kind !== "random" || promotionBlocks(state, action.mercId).length > 0) return state;
      const cost = promoteCost(entry.seed.level);
      if (cost === null) return state;
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

    case "expandStorage": {
      const cost = storageCost(state.storageLevel);
      if (state.expedition || state.gold < cost) return state;
      return { ...state, gold: state.gold - cost, storageLevel: state.storageLevel + 1 };
    }

    case "promoteGuild": {
      const { next, gold, blocks } = guildPromotionBlocks(state);
      if (state.expedition || !next || blocks.length > 0) return state;
      return withExam({ ...state, gold: state.gold - gold, guildGrade: next, notices: [...state.notices, `길드가 ${RANKS[next].name} 등급이 되었다. ${RANKS[next].name} 등급 조각·용병·의뢰가 열린다.`] });
    }

    case "unlockPiece": {
      const p = state.progress[action.mercId];
      const entry = state.roster.find((e) => entryId(e) === action.mercId);
      if (state.expedition || !p?.hired || entry?.kind !== "random") return state;
      const known = knownFragments(entry.seed, p.learned, p.pieces);
      if (unlockBlock(action.piece, entry.seed, known, state.gold, state.salvage, state.guildGrade)) return state;
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
      if (state.expedition || !isDirect(q) || !state.board.includes(q.id) || state.activeQuests.length >= questSlots(state)) return state;
      return {
        ...state,
        board: state.board.filter((id) => id !== q.id),
        activeQuests: [...state.activeQuests, q.id],
        questAccepted: { ...state.questAccepted, [q.id]: state.day },
      };
    }

    case "abandonQuest": {
      // 포기 = 실패 (명성 하락). 승급 시험은 다시 붙는다
      if (state.expedition || !state.activeQuests.includes(action.questId)) return state;
      const left = addFame({ ...state, activeQuests: state.activeQuests.filter((id) => id !== action.questId), questAccepted: omit(state.questAccepted, action.questId) }, FAME.fail);
      return withExam(left);
    }

    case "deliverQuest": {
      // 납품: 창고의 재료를 내고 바로 마친다
      const q = getQuest(action.questId);
      if (state.expedition || !isDirect(q) || q.objective.type !== "deliver" || !state.activeQuests.includes(q.id)) return state;
      const { itemId, count } = q.objective;
      if ((state.salvage[itemId] ?? 0) < count) return state;
      const done = completeQuest({ ...state, salvage: paySalvage(state.salvage, { [itemId]: count }) }, q, createRng(action.seed));
      return { ...done.state, notices: [...done.state.notices, ...done.lines] };
    }

    case "claimQuestReward": {
      const q = getQuest(action.questId);
      if (state.expedition || !isDirect(q) || !state.pendingRewards.includes(q.id) || !q.rewards.choices) return state;
      const got = giveQuestReward(state, q.rewards.choices[action.choice], createRng(action.seed));
      if (!got) return state;
      const capped = capStorage(got.state);
      return {
        ...capped.state,
        pendingRewards: state.pendingRewards.filter((id) => id !== q.id),
        notices: [...got.state.notices, `「${q.title}」 보상: ${got.line}`, ...capped.lines],
      };
    }

    case "joinedFree": {
      // 의뢰 보상: 모집 API로 만든 용병이 고용비 없이 바로 합류한다
      if (state.pendingJoins <= 0 || action.seeds.length === 0) return state;
      const entries = action.seeds.slice(0, state.pendingJoins).map((seed) => ({ kind: "random" as const, seed }));
      const progress = { ...state.progress };
      for (const e of entries) {
        const merc = mercOf(e);
        progress[entryId(e)] = { ...freshProgress(merc), hired: true, wage: wageOf(merc) };
      }
      return {
        ...state,
        roster: [...state.roster, ...entries],
        progress,
        pendingJoins: state.pendingJoins - entries.length,
        notices: [...state.notices, ...entries.map((e) => `${mercOf(e).name}이(가) 은혜를 갚겠다며 길드에 합류했다.`)],
      };
    }

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
      const chance = clanJoinChance(p.affinity, merc.traitIds?.personalities ?? [], merc.traitIds?.background, state.fame);
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
      if (state.expedition || !t || t.quest) return state;
      const cost = forgePrice(state, forgeCost(t, 1));
      if (!canPay(state, cost)) return state;
      return { ...state, gold: state.gold - cost.gold, salvage: paySalvage(state.salvage, cost.salvage), trinkets: [...state.trinkets, { id: t.id, lv: 1 }] };
    }

    case "upgradeTrinket": {
      // mercId가 있으면 그 용병이 낀 slot번 장신구, 없으면 보관함의 index번
      if (state.expedition) return state;
      const p = action.mercId ? state.progress[action.mercId] : undefined;
      const owned = action.mercId ? p?.trinkets[action.slot ?? 0] : state.trinkets[action.index ?? -1];
      const t = owned && getTrinket(owned.id);
      if (!owned || !t || owned.lv >= trinketMaxLv(t)) return state;
      const cost = forgePrice(state, forgeCost(t, owned.lv + 1));
      if (!canPay(state, cost)) return state;
      const up = { ...owned, lv: owned.lv + 1 };
      const paid = { ...state, gold: state.gold - cost.gold, salvage: paySalvage(state.salvage, cost.salvage) };
      return action.mercId
        ? { ...paid, progress: { ...state.progress, [action.mercId]: { ...p!, trinkets: p!.trinkets.map((x, i) => (i === (action.slot ?? 0) ? up : x)) } } }
        : { ...paid, trinkets: state.trinkets.map((x, i) => (i === action.index ? up : x)) };
    }

    case "equipTrinket": {
      const p = state.progress[action.mercId];
      const entry = state.roster.find((e) => entryId(e) === action.mercId);
      const owned = state.trinkets[action.index];
      if (state.expedition || !p?.hired || !entry || !owned || !trinketFits(getTrinket(owned.id), mercOf(entry).job)) return state;
      // 빈 칸이 있으면 끼고, 두 칸이 다 찼으면 slot번(없으면 첫 칸)과 바꾼다. 같은 장신구 둘, 생존 장신구 둘은 낄 수 없다
      const t = getTrinket(owned.id);
      const keep = p.trinkets.length < TRINKET_SLOTS ? p.trinkets : p.trinkets.filter((_, i) => i !== (action.slot ?? 0));
      if (!canWear(t, keep)) return state;
      const trinkets = state.trinkets.filter((_, i) => i !== action.index);
      if (p.trinkets.length < TRINKET_SLOTS) return { ...state, trinkets, progress: { ...state.progress, [action.mercId]: { ...p, trinkets: [...p.trinkets, owned] } } };
      const slot = action.slot ?? 0;
      const out = p.trinkets[slot];
      return {
        ...state,
        trinkets: out ? [...trinkets, out] : trinkets,
        progress: { ...state.progress, [action.mercId]: { ...p, trinkets: p.trinkets.map((t, i) => (i === slot ? owned : t)) } },
      };
    }

    case "unequipTrinket": {
      const p = state.progress[action.mercId];
      const out = p?.trinkets[action.slot ?? 0];
      if (state.expedition || !out) return state;
      return {
        ...state,
        trinkets: [...state.trinkets, out],
        progress: { ...state.progress, [action.mercId]: { ...p, trinkets: p.trinkets.filter((_, i) => i !== (action.slot ?? 0)) } },
      };
    }

    case "sellSalvage": {
      const item = getSalvage(action.id);
      const have = state.salvage[action.id] ?? 0;
      // 전수관 재료는 팔 수 없다
      if (state.expedition || !item || have <= 0 || !sellable(action.id)) return state;
      const n = action.all ? have : 1;
      const salvage = { ...state.salvage, [action.id]: have - n };
      if (salvage[action.id] === 0) delete salvage[action.id];
      return { ...state, gold: state.gold + Math.round(item.value * n * sellRate(state)), salvage };
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
      // 던전 보스 승리 기록: 이긴 전투에 있던 던전 보스를, 살아남은 용병(서 있던·쓰러졌다 산) 모두에게 (승급 증명)
      const battle = state.screen.battle;
      const bosses = battle.outcome === "victory" ? [...new Set(battle.units.filter((u) => u.side === "enemy" && u.rank === "dungeonBoss" && u.kind).map((u) => u.kind!))] : [];
      const progress = { ...gained.progress };
      if (bosses.length > 0)
        for (const u of battle.units.filter((x) => x.side === "merc" && !x.dead && progress[x.id]))
          progress[u.id] = { ...progress[u.id], bossWins: [...new Set([...progress[u.id].bossWins, ...bosses])] };
      // 보스를 처음 쓰러뜨렸다: 명성 (보스마다 한 번)
      const slain = battle.outcome === "victory" ? [...new Set(battle.units.filter((u) => u.side === "enemy" && (u.rank === "floorBoss" || u.rank === "dungeonBoss") && u.kind && u.hp <= 0).map((u) => u.kind!))] : [];
      const firsts = slain.filter((id) => !state.bossesSlain.includes(id));
      let next: GameState = {
        ...state,
        ...gained,
        fame: state.fame + firsts.length * FAME.bossFirstKill,
        bossesSlain: [...state.bossesSlain, ...firsts],
        progress,
        reactions: [...spoils.lines, ...gained.lines],
        expedition: spoils.exp,
        conquered,
        screen: { kind: "dungeon" },
      };
      next = bury(
        next,
        state.screen.battle.units.filter((u) => u.side === "merc" && u.dead).map((u) => u.id),
        state.screen.battle.outcome === "victory",
      );
      // 귀환길 습격을 치렀다: 이겼든 전멸했든 그대로 마을로 (습격 판정은 다시 하지 않는다)
      if (next.expedition?.returning) next = gameReducer(next, { type: "endExpedition", seed: action.seed ?? battle.rng });
      return next;
    }

    case "fleeBattle": {
      if (state.screen.kind !== "battle" || state.screen.battle.outcome || !state.expedition) return state;
      // 쓰러진 용병은 남겨진다 (사망)
      const battle = { ...state.screen.battle, units: state.screen.battle.units.map((u) => (isDowned(u) ? { ...u, dead: true, downedTurnsLeft: undefined, downedFresh: undefined } : u)) };
      // 체력·쓰러짐·죽음을 반영하고, 죽은 용병을 묻는다
      // 전투에서 도망친 건 맵 후퇴가 아니라 귀환길 습격 판정이 없다 (습격 전투에서 도망쳐도 마찬가지)
      let next: GameState = bury(
        { ...state, expedition: { ...finishBattle(state.expedition, battle), room: null, returning: true }, screen: { kind: "dungeon" } },
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
      // 귀환길 습격: 목적지 전에 맵에서 후퇴하면 한 번 판정 (층별 확률). 습격이면 싸운 뒤에 돌아온다
      if (state.expedition && state.screen.kind === "dungeon" && !state.expedition.returning) {
        const monsters = retreatAmbush(state.expedition, action.seed);
        if (monsters) {
          const returning: Expedition = { ...state.expedition, room: null, returning: true, ambushed: true };
          const battle = battleFor(returning, partyMercs(state), action.seed ^ 0xa3b, bondsOf(state), undefined, 0, { monsters });
          return {
            ...state,
            expedition: spendBattleMods(returning),
            reactions: ["돌아가는 길에 습격을 받았다!"],
            screen: { kind: "battle", battle },
          };
        }
      }
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
        ...(exp.ambushed ? { ambushed: true } : {}),
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
          const why = atLastStage(growth) ? ` (승급용 ${growth.xp}/${xpToNext(growth.lv)})` : "";
          report.growth.push(
            gained.length
              ? `${m.name}: 경험치 +${xp}${why}, 레벨업 → ${stageOf(growth.lv)}단계 (${gained.map((g) => statLine(g, STAT_NAME)).join(" / ")})${canPromote(growth) ? " · 승급할 수 있다" : ""}`
              : `${m.name}: 경험치 +${xp}${why}`,
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
          // 남은 물자는 창고로 (창고 한도를 넘으면 버린다)
          pack: addSupplies(next.pack, exp.supplies),
          // 사건이 준 것: 정보, 합류할 용병, 시설 할인
          infos: [...new Set([...next.infos, ...(exp.infos ?? [])])],
          pendingJoins: next.pendingJoins + (exp.recruits ?? 0),
          discounts: [
            ...next.discounts.filter((d) => !(exp.discounts ?? []).some((x) => x.facility === d.facility)),
            ...(exp.discounts ?? []).map((d) => ({ facility: d.facility, untilDay: next.day + d.days })),
          ],
        };
      }
      // 본 사건 기록과 사건 명성은 전멸해도 남는다
      next = addFame({ ...next, eventsSeen: [...new Set([...next.eventsSeen, ...(exp.seenEvents ?? [])])] }, exp.fameDelta ?? 0);
      // 상점 물건이 바뀌고, 재료 구매 한도가 다시 찬다
      next = { ...next, stock: restock(action.seed, next.guildGrade), materialBought: {} };
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
          trinkets: [...next.trinkets, ...p.trinkets],
          roster: next.roster.filter((e) => entryId(e) !== id),
          party: next.party.filter((x) => x !== id),
          progress,
        };
      }
      next = returnToVillage(next, exp, report, action.seed);
      // 창고 한도 (넘친 재료·물자는 버린다)
      const capped = capStorage(next);
      if (capped.lines.length) report.quests = [...(report.quests ?? []), ...capped.lines];
      return { ...capped.state, report };
    }

    case "dismiss": {
      // 내보내는 용병의 장신구는 보관함으로
      const worn = state.progress[action.mercId]?.trinkets ?? [];
      return {
        ...state,
        party: state.party.filter((id) => id !== action.mercId),
        trinkets: [...state.trinkets, ...worn],
        progress: {
          ...state.progress,
          [action.mercId]: { ...state.progress[action.mercId], hired: false, trinkets: [] },
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
