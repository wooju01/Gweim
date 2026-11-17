import { MERCS } from "@/data/mercs";
import type { HistoryLine, TalkResponse, TalkState } from "@/lib/schemas";

export const PARTY_LIMIT = 3;
const HISTORY_LIMIT = 20;

export type MercProgress = TalkState & { hired: boolean };

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
  progress: Record<string, MercProgress>;
  party: string[];
  screen: { kind: "guild" } | TalkScreen;
};

export type GameAction =
  | { type: "enterTalk"; mercId: string }
  | { type: "pending" }
  | { type: "resolved"; mercId: string; playerText: string | null; res: TalkResponse }
  | { type: "failed"; error: string }
  | { type: "leave" }
  | { type: "dismiss"; mercId: string };

export function initialState(): GameState {
  return {
    progress: Object.fromEntries(
      MERCS.map((m) => [
        m.id,
        { affinity: m.startAffinity, recentTones: [], history: [], hired: false },
      ]),
    ),
    party: [],
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
        recentTones: res.recentTones,
        history: [...prev.history, ...lines].slice(-HISTORY_LIMIT),
        hired: prev.hired || joined,
      };
      return {
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
  }
}
