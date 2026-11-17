import { MERCS, getMerc } from "@/data/mercs";
import { buildMerc } from "@/game/generate";
import type { Merc } from "@/game/types";
import type { HistoryLine, MercRef, MercSeed, TalkResponse, TalkState } from "@/lib/schemas";

export const PARTY_LIMIT = 3;
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
  screen: { kind: "guild" } | TalkScreen;
};

export type GameAction =
  | { type: "enterTalk"; mercId: string }
  | { type: "pending" }
  | { type: "resolved"; mercId: string; playerText: string | null; res: TalkResponse }
  | { type: "failed"; error: string }
  | { type: "leave" }
  | { type: "dismiss"; mercId: string }
  | { type: "recruitStart" }
  | { type: "recruited"; seeds: MercSeed[] }
  | { type: "recruitFailed"; error: string };

export function entryId(entry: RosterEntry): string {
  return entry.kind === "unique" ? entry.id : entry.seed.id;
}

/** 명단 칸을 실제 용병으로. 반응표는 특성에서 다시 계산된다 */
export function mercOf(entry: RosterEntry): Merc {
  const merc = entry.kind === "unique" ? getMerc(entry.id) : buildMerc(entry.seed);
  if (!merc) throw new Error(`잘못된 명단 항목: ${entryId(entry)}`);
  return merc;
}

function freshProgress(merc: Merc): MercProgress {
  return {
    affinity: merc.startAffinity,
    willingness: merc.startWillingness,
    recentTones: [],
    history: [],
    hired: false,
  };
}

export function initialState(): GameState {
  return {
    roster: MERCS.map((m) => ({ kind: "unique", id: m.id })),
    progress: Object.fromEntries(MERCS.map((m) => [m.id, freshProgress(m)])),
    party: [],
    recruit: { pending: false, error: null },
    screen: { kind: "guild" },
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
      if (state.screen.kind !== "talk") return state;
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
        history: [...prev.history, ...lines].slice(-HISTORY_LIMIT),
        hired: prev.hired || joined,
      };
      return {
        ...state,
        progress: { ...state.progress, [mercId]: progress },
        party: joined && !state.party.includes(mercId) ? [...state.party, mercId] : state.party,
        screen:
          state.screen.kind === "talk"
            ? { ...state.screen, reply: res, pending: false, error: null, ended: joined }
            : state.screen,
      };
    }

    case "leave":
      return { ...state, screen: { kind: "guild" } };

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
