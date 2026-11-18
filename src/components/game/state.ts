import { MERCS, getMerc } from "@/data/mercs";
import { USE_SAMPLE_ROSTER, sampleSeeds } from "@/data/sampleRoster";
import type { SupplyKind } from "@/data/combat";
import { applyTone } from "@/game/affinity";
import { act, type Battle, type BattleAction } from "@/game/combat/engine";
import {
  chooseEvent,
  finishBattle,
  giveSupply,
  leaveRoom,
  moveTo,
  startExpedition,
  type Expedition,
} from "@/game/dungeon/expedition";
import { buildMerc } from "@/game/generate";
import type { Merc } from "@/game/types";
import type { EventResponse, HistoryLine, MercRef, MercSeed, TalkResponse, TalkState } from "@/lib/schemas";

const HISTORY_LIMIT = 20;

export type MercProgress = TalkState & { hired: boolean };

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
  screen: { kind: "guild" } | TalkScreen | { kind: "dungeon" } | { kind: "battle"; battle: Battle };
  /** 던전 탐험 중이면 그 상태 */
  expedition: Expedition | null;
  /** 지금 사건 칸의 AI 묘사. 기다리는 중이면 data가 null */
  narration: { eventId: string; pending: boolean; data: EventResponse | null } | null;
  /** 마지막 사건 선택에 대한 용병들의 반응 (예: "케쉬: 호감 ↓") */
  reactions: string[];
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
  /** 전투가 끝나고 맵으로 돌아간다 */
  | { type: "battleFinish" }
  /** 탐험을 끝내고 길드로 (귀환, 후퇴, 전멸). 다음 탐험은 모두 회복한 채 시작한다 */
  | { type: "endExpedition" };

export function entryId(entry: RosterEntry): string {
  return entry.kind === "unique" ? entry.id : entry.seed.id;
}

/** 명단 칸을 실제 용병으로. 반응표는 특성에서 다시 계산된다 */
export function mercOf(entry: RosterEntry): Merc {
  const merc = entry.kind === "unique" ? getMerc(entry.id) : buildMerc(entry.seed);
  if (!merc) throw new Error(`잘못된 명단 항목: ${entryId(entry)}`);
  return merc;
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
    screen: { kind: "guild" },
    expedition: null,
    narration: null,
    reactions: [],
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
      const progress: MercProgress = {
        affinity: res.affinity,
        willingness: res.willingness,
        recentTones: res.recentTones,
        // 기억으로 접힌 오래된 줄은 지우고, 이번 턴의 줄을 붙인다
        history: [...prev.history.slice(res.forget), ...lines].slice(-HISTORY_LIMIT),
        memory: res.memory,
        talks: res.talks,
        hired: prev.hired || joined,
      };
      return {
        ...state,
        progress: { ...state.progress, [mercId]: progress },
        party: joined && !state.party.includes(mercId) ? [...state.party, mercId] : state.party,
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
        expedition: startExpedition(mercs, action.seed),
        narration: null,
        reactions: [],
        screen: { kind: "dungeon" },
      };
    }

    case "move": {
      if (!state.expedition) return state;
      const moved = moveTo(state.expedition, partyMercs(state), action.nodeId, action.seed);
      if (!moved) return state;
      const room = moved.exp.room;
      return {
        ...state,
        expedition: moved.exp,
        reactions: [],
        narration: room?.kind === "event" ? { eventId: room.eventId, pending: true, data: null } : null,
        screen: moved.battle ? { kind: "battle", battle: moved.battle } : { kind: "dungeon" },
      };
    }

    case "narrated":
      if (state.narration?.eventId !== action.eventId) return state;
      return { ...state, narration: { eventId: action.eventId, pending: false, data: action.data } };

    case "chooseEvent": {
      if (!state.expedition) return state;
      const exp = chooseEvent(state.expedition, action.choiceId, action.seed);
      if (exp === state.expedition || exp.room?.kind !== "event" || !exp.room.result) return state;
      const { progress, reactions } = reactToTone(state, exp, exp.room.result.tone);
      return { ...state, expedition: exp, progress, reactions };
    }

    case "leaveRoom":
      if (!state.expedition) return state;
      return { ...state, expedition: leaveRoom(state.expedition), narration: null, reactions: [] };

    case "giveSupply":
      if (!state.expedition) return state;
      return { ...state, expedition: giveSupply(state.expedition, action.item, action.target) };

    case "battleAct":
      if (state.screen.kind !== "battle") return state;
      return { ...state, screen: { kind: "battle", battle: act(state.screen.battle, action.action) } };

    case "battleFinish": {
      if (state.screen.kind !== "battle" || !state.screen.battle.outcome) return state;
      if (!state.expedition) return { ...state, screen: { kind: "guild" } };
      return { ...state, expedition: finishBattle(state.expedition, state.screen.battle), screen: { kind: "dungeon" } };
    }

    case "endExpedition":
      return { ...state, expedition: null, narration: null, reactions: [], screen: { kind: "guild" } };

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
