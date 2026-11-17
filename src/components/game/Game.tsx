"use client";

import { useReducer } from "react";
import type { TalkAction } from "@/lib/schemas";
import { postTalk } from "./api";
import { DialogueScreen } from "./DialogueScreen";
import { GuildScreen } from "./GuildScreen";
import { PARTY_LIMIT, gameReducer, initialState } from "./state";

function playerLineFor(action: TalkAction): string | null {
  switch (action.type) {
    case "open":
      return null;
    case "choice":
      return action.choice.text;
    case "free":
      return action.text;
    case "propose":
      return "함께 가자고 제안한다.";
  }
}

export function Game() {
  const [state, dispatch] = useReducer(gameReducer, undefined, initialState);

  async function send(mercId: string, action: TalkAction) {
    const { affinity, willingness, recentTones, history } = state.progress[mercId];
    try {
      const res = await postTalk({
        mercId,
        state: { affinity, willingness, recentTones, history },
        action,
      });
      dispatch({ type: "resolved", mercId, playerText: playerLineFor(action), res });
    } catch (e) {
      dispatch({ type: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  function startTalk(mercId: string) {
    dispatch({ type: "enterTalk", mercId });
    void send(mercId, { type: "open" });
  }

  function act(action: TalkAction) {
    if (state.screen.kind !== "talk" || state.screen.pending) return;
    dispatch({ type: "pending" });
    void send(state.screen.mercId, action);
  }

  if (state.screen.kind === "talk") {
    return (
      <DialogueScreen
        screen={state.screen}
        progress={state.progress[state.screen.mercId]}
        partyFull={state.party.length >= PARTY_LIMIT}
        onAct={act}
        onLeave={() => dispatch({ type: "leave" })}
      />
    );
  }

  return (
    <GuildScreen
      progress={state.progress}
      party={state.party}
      onTalk={startTalk}
      onDismiss={(mercId) => dispatch({ type: "dismiss", mercId })}
    />
  );
}
