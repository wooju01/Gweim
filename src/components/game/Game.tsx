"use client";

import { useReducer } from "react";
import type { TalkAction } from "@/lib/schemas";
import { postRecruit, postTalk } from "./api";
import { BattleScreen } from "./BattleScreen";
import { DialogueScreen } from "./DialogueScreen";
import { GuildScreen } from "./GuildScreen";
import { MERC_SLOTS } from "@/game/party";
import { entryId, gameReducer, initialState, mercOf } from "./state";

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

  const findEntry = (mercId: string) => state.roster.find((e) => entryId(e) === mercId);

  async function send(mercId: string, action: TalkAction) {
    const entry = findEntry(mercId);
    if (!entry) return;
    const { affinity, willingness, recentTones, history, memory } = state.progress[mercId];
    try {
      const res = await postTalk({
        merc: entry,
        state: { affinity, willingness, recentTones, history, memory },
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

  async function recruit() {
    if (state.recruit.pending) return;
    dispatch({ type: "recruitStart" });
    try {
      const avoidNames = state.roster.map((e) => mercOf(e).name);
      const res = await postRecruit({ avoidNames });
      dispatch({ type: "recruited", seeds: res.seeds });
    } catch (e) {
      dispatch({ type: "recruitFailed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (state.screen.kind === "battle") {
    return (
      <BattleScreen
        battle={state.screen.battle}
        onAct={(action) => dispatch({ type: "battleAct", action })}
        onLeave={() => dispatch({ type: "leave" })}
      />
    );
  }

  if (state.screen.kind === "talk") {
    const entry = findEntry(state.screen.mercId);
    if (entry) {
      return (
        <DialogueScreen
          merc={mercOf(entry)}
          screen={state.screen}
          progress={state.progress[state.screen.mercId]}
          partyFull={state.party.length >= MERC_SLOTS}
          onAct={act}
          onLeave={() => dispatch({ type: "leave" })}
        />
      );
    }
  }

  return (
    <GuildScreen
      mercs={state.roster.map(mercOf)}
      progress={state.progress}
      party={state.party}
      recruit={state.recruit}
      onRecruit={recruit}
      onTalk={startTalk}
      onDismiss={(mercId) => dispatch({ type: "dismiss", mercId })}
      // 전투 난수 시드는 여기서 굴린다 (리듀서는 순수하게 유지)
      onEnterDungeon={() => dispatch({ type: "enterDungeon", seed: Math.floor(Math.random() * 2 ** 32) })}
    />
  );
}
