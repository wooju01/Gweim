import { MERCS, getMerc } from "@/data/mercs";
import { USE_SAMPLE_ROSTER, sampleSeeds } from "@/data/sampleRoster";
import type { SupplyKind } from "@/data/combat";
import { BOND, FLEE_TEMPER } from "@/data/bond";
import { MERC_SLOTS } from "@/game/party";
import { DEATH } from "@/data/death";
import { MEMORY_MAX_CHARS } from "@/game/memory";
import { applyTone, clampStat, getStage } from "@/game/affinity";
import { createRng, rollInt } from "@/game/random";
import { PACK_LIMIT, PRICE, START_GOLD, START_PACK, START_STOCK, STOCK_RANGE } from "@/data/economy";
import { getRelic } from "@/data/relics";
import { addSalvage, getSalvage, salvageCount } from "@/data/loot";
import { WAGE } from "@/data/wages";
import { advanceCost, wageOf } from "@/game/wages";
import { act, giftsReceived, type Battle, type BattleAction } from "@/game/combat/engine";
import {
  chooseEvent,
  finishBattle,
  giveSupply,
  battleSpoils,
  leaveRoom,
  markRestTalk,
  moveTo,
  rescueBonds,
  startExpedition,
  type Expedition,
} from "@/game/dungeon/expedition";
import { buildMerc } from "@/game/generate";
import type { Merc } from "@/game/types";
import type { EventResponse, HistoryLine, MercRef, MercSeed, Stage, TalkResponse, TalkState } from "@/lib/schemas";

const HISTORY_LIMIT = 20;

/** wage: 고용할 때 정해진 원정 1회 보수 (몫 약속을 했으면 더 많다). 고용 전에는 없다 */
export type MercProgress = TalkState & { hired: boolean; wage?: number };

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
};

/** day: 죽은 날 (결산에서 이번 원정의 사망자를 찾는다) */
export type Fallen = { id: string; name: string; title: string; words: string | null; depth: number; day?: number };

/** 원정 결산 */
export type Report = {
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
  /** 전멸해서 두고 온 것 */
  lost: { gold: number; relics: number; salvage: number; supplies: number } | null;
  /** 쓰러졌다가 살아 돌아온 용병 이름 */
  fallen: string[];
  /** 보수 지급·체불, 호감 변화, 떠난 용병 (한 줄씩) */
  wages: string[];
  bonds: string[];
  left: string[];
};

/** 마을 안의 화면: 마을(홈), 용병 길드, 상점, 숙소(파티 편성), 던전 입구 */
export type TownPlace = "town" | "guild" | "shop" | "inn" | "gate";

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
  | { type: "enterDungeon"; seed: number }
  | { type: "move"; nodeId: string; seed: number }
  | { type: "narrated"; eventId: string; data: EventResponse | null }
  | { type: "chooseEvent"; choiceId: string; seed: number }
  | { type: "leaveRoom" }
  | { type: "giveSupply"; item: SupplyKind; target: string }
  | { type: "battleAct"; action: BattleAction }
  /** 전투 중 후퇴: 전투를 버리고 원정을 끝낸다 (동료들의 호감이 떨어진다) */
  | { type: "fleeBattle"; seed: number }
  /** 전투가 끝나고 맵으로 돌아간다. seed: 전리품 */
  | { type: "battleFinish"; seed?: number }
  /** 상점: 물자 하나 사기, 유물 하나 팔기 */
  | { type: "buy"; item: SupplyKind }
  | { type: "sell"; index: number }
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
  /** 저장에서 불러온 상태로 바꾼다 */
  | { type: "load"; state: GameState }
  /** 저장을 지우고 처음부터 */
  | { type: "newGame" }
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
function bury(state: GameState, deadIds: string[]): GameState {
  if (deadIds.length === 0) return state;
  let next = state;
  const lines: string[] = [];
  for (const id of deadIds) {
    const entry = next.roster.find((e) => entryId(e) === id);
    if (!entry) continue;
    const merc = mercOf(entry);
    const progress = { ...next.progress };
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
    if (!p?.hired || !entry) continue;
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
function restock(seed: number): Record<SupplyKind, number> {
  const rng = createRng(seed ^ 0x5eed);
  return Object.fromEntries(
    (Object.keys(STOCK_RANGE) as SupplyKind[]).map((k) => [k, rollInt(rng.next, STOCK_RANGE[k][0], STOCK_RANGE[k][1])]),
  ) as Record<SupplyKind, number>;
}

export function isTown(kind: string): kind is TownPlace {
  return kind === "town" || kind === "guild" || kind === "shop" || kind === "inn" || kind === "gate";
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

/** 동행 중인 용병 */
function partyMercs(state: GameState): Merc[] {
  return state.party.flatMap((id) => {
    const entry = state.roster.find((e) => entryId(e) === id);
    return entry ? [mercOf(entry)] : [];
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
    stock: { ...START_STOCK },
  };
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
      if (mercs.length === 0) return state;
      return {
        ...state,
        // 짐을 들고 떠난다 (남은 물자는 돌아올 때 짐으로 돌아온다)
        expedition: startExpedition(mercs, action.seed, state.pack),
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

    case "sellSalvage": {
      const item = getSalvage(action.id);
      const have = state.salvage[action.id] ?? 0;
      if (state.expedition || !item || have <= 0) return state;
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
      const spoils = battleSpoils(finishBattle(state.expedition, state.screen.battle), state.screen.battle, action.seed ?? 0);
      const next: GameState = {
        ...state,
        ...gained,
        reactions: [...spoils.lines, ...gained.lines],
        expedition: spoils.exp,
        screen: { kind: "dungeon" },
      };
      return bury(next, state.screen.battle.units.filter((u) => u.side === "merc" && u.dead).map((u) => u.id));
    }

    case "fleeBattle": {
      if (state.screen.kind !== "battle" || state.screen.battle.outcome || !state.expedition) return state;
      const battle = state.screen.battle;
      // 체력·쓰러짐·죽음을 반영하고 (빈사인 용병은 쓰러진 채로 데리고 나온다), 죽은 용병을 묻는다
      let next: GameState = bury(
        { ...state, expedition: { ...finishBattle(state.expedition, battle), room: null }, screen: { kind: "dungeon" } },
        battle.units.filter((u) => u.side === "merc" && u.dead).map((u) => u.id),
      );
      // 살아 있는 동행 용병: 싸움에서 등을 보인 것에 대한 반응 (성격마다 다르다)
      const changes: Record<string, number> = {};
      for (const m of next.expedition!.members.filter((x) => !x.dead)) {
        const entry = next.roster.find((e) => entryId(e) === m.id);
        if (!entry) continue;
        const temper = mercOf(entry).traitIds?.personalities.reduce((s, id) => s + (FLEE_TEMPER[id] ?? 0), 0) ?? 0;
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
        day: state.day + 1,
      };
      if (!exp) return next;
      const defeat = exp.room?.kind === "defeat";
      const report: Report = {
        outcome: defeat ? "defeat" : exp.room?.kind === "goal" ? "goal" : "retreat",
        day: state.day,
        gold: defeat ? 0 : exp.gold,
        relics: defeat ? [] : exp.loot,
        salvage: defeat ? {} : (exp.salvage ?? {}),
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
      };
      // 살아 돌아왔으면 얻은 금화·유물과 남은 물자를 챙긴다. 전멸하면 모두 잃는다
      if (!defeat) {
        next = {
          ...next,
          gold: next.gold + exp.gold,
          relics: [...next.relics, ...exp.loot],
          salvage: addSalvage(next.salvage, exp.salvage ?? {}),
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
          roster: next.roster.filter((e) => entryId(e) !== id),
          party: next.party.filter((x) => x !== id),
          progress,
        };
      }
      return { ...next, report };
    }

    case "dismiss":
      return {
        ...state,
        party: state.party.filter((id) => id !== action.mercId),
        progress: {
          ...state.progress,
          [action.mercId]: { ...state.progress[action.mercId], hired: false },
        },
      };

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
