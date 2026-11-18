"use client";

import { useEffect, useReducer } from "react";
import type { TalkAction } from "@/lib/schemas";
import { postEvent, postRecruit, postTalk } from "./api";
import { BattleScreen } from "./BattleScreen";
import { DungeonScreen } from "./DungeonScreen";
import { alive, pickEvent } from "@/game/dungeon/expedition";
import { nodeById } from "@/game/dungeon/map";
import { getStage } from "@/game/affinity";
import { DialogueScreen } from "./DialogueScreen";
import { GuildScreen } from "./GuildScreen";
import { MERC_SLOTS } from "@/game/party";
import { entryId, gameReducer, initialState, mercOf } from "./state";
import { clearSave, loadGame, saveGame } from "./save";

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
  // 처음 한 번 저장을 읽는다. 없으면 처음 상태로, 읽지 못하면 새로 시작하고 알린다.
  // 읽기 전(state.booted가 false)에는 화면을 그리지 않는다 (서버가 그린 처음 상태가 잠깐 보이지 않게)
  useEffect(() => {
    const { state: saved, error } = loadGame(window.localStorage);
    const fresh = initialState();
    dispatch({
      type: "load",
      state: saved ?? (error ? { ...fresh, notices: [`저장을 읽지 못해 새로 시작했다. (${error})`] } : fresh),
    });
  }, []);

  // 상태가 바뀔 때마다 자동 저장 (되돌리기 없음)
  useEffect(() => {
    if (state.booted) saveGame(window.localStorage, state);
  }, [state]);

  function newGame() {
    if (!window.confirm("저장을 지우고 처음부터 시작할까? 되돌릴 수 없다.")) return;
    clearSave(window.localStorage);
    dispatch({ type: "newGame" });
  }

  const findEntry = (mercId: string) => state.roster.find((e) => entryId(e) === mercId);

  async function send(mercId: string, action: TalkAction) {
    const entry = findEntry(mercId);
    if (!entry) return;
    const { affinity, willingness, recentTones, history, memory, talks } = state.progress[mercId];
    try {
      const res = await postTalk({
        merc: entry,
        state: { affinity, willingness, recentTones, history, memory, talks },
        action,
        scene: "guild",
      });
      dispatch({ type: "resolved", mercId, playerText: playerLineFor(action), res });
    } catch (e) {
      dispatch({ type: "failed", mercId, error: e instanceof Error ? e.message : String(e) });
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

  /** 리듀서를 순수하게 두려고 난수 시드는 여기서 굴린다 */
  const roll = () => Math.floor(Math.random() * 2 ** 32);

  async function move(nodeId: string) {
    const exp = state.expedition;
    if (!exp) return;
    const seed = roll();
    dispatch({ type: "move", nodeId, seed });
    // 사건 칸이면 AI에게 묘사를 부탁한다 (결과는 코드가 정한다). 실패하면 기본 문장을 쓴다
    if (nodeById(exp.map, nodeId)?.kind !== "event") return;
    const eventId = pickEvent(seed);
    try {
      const party = alive(exp).map((m) => ({ name: m.name, race: m.race, job: m.job }));
      dispatch({ type: "narrated", eventId, data: await postEvent({ eventId, party }) });
    } catch {
      dispatch({ type: "narrated", eventId, data: null });
    }
  }

  /** 휴식 칸 대화. 용병이 먼저 한마디 하고, 플레이어가 한 번 답하면 끝난다 (호감만 움직인다) */
  async function sendRest(mercId: string, action: TalkAction) {
    const entry = findEntry(mercId);
    if (!entry) return;
    const { affinity, willingness, recentTones, history, memory, talks } = state.progress[mercId];
    try {
      const res = await postTalk({
        merc: entry,
        state: { affinity, willingness, recentTones, history, memory, talks },
        action,
        scene: "rest",
      });
      dispatch({ type: "resolved", mercId, playerText: playerLineFor(action), res });
      dispatch({ type: "restTalkReply", res, done: action.type !== "open" });
    } catch (e) {
      dispatch({ type: "restTalkFailed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!state.booted) return <main className="flex flex-1 items-center justify-center text-sm text-ash">불러오는 중…</main>;

  if (state.screen.kind === "battle") {
    return (
      <BattleScreen
        // 전투가 바뀌면 연출 재생을 처음부터 다시 한다 (던전에서는 칸마다 새 전투)
        key={state.expedition?.at ?? "battle"}
        battle={state.screen.battle}
        onAct={(action) => dispatch({ type: "battleAct", action })}
        onLeave={() => dispatch({ type: "battleFinish" })}
        leaveLabel={state.expedition ? { victory: "계속 나아간다", defeat: "결과를 본다" } : undefined}
        bonds={Object.fromEntries(state.party.map((id) => [id, getStage(state.progress[id]?.affinity ?? 0)]))}
      />
    );
  }

  if (state.screen.kind === "dungeon" && state.expedition) {
    return (
      <DungeonScreen
        exp={state.expedition}
        narration={state.narration}
        reactions={state.reactions}
        onMove={(id) => void move(id)}
        onChoose={(choiceId) => dispatch({ type: "chooseEvent", choiceId, seed: roll() })}
        onLeaveRoom={() => dispatch({ type: "leaveRoom" })}
        onGive={(item, target) => dispatch({ type: "giveSupply", item, target })}
        onEnd={() => dispatch({ type: "endExpedition", seed: roll() })}
        restTalk={state.restTalk}
        progress={state.progress}
        onRestTalk={(mercId) => {
          dispatch({ type: "restTalkStart", mercId });
          void sendRest(mercId, { type: "open" });
        }}
        onRestReply={(action) => {
          if (!state.restTalk || state.restTalk.pending || state.restTalk.done) return;
          dispatch({ type: "restTalkPending" });
          void sendRest(state.restTalk.mercId, action);
        }}
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
      onEnterDungeon={() => dispatch({ type: "enterDungeon", seed: roll() })}
      notices={state.notices}
      onDismissNotices={() => dispatch({ type: "dismissNotices" })}
      onNewGame={newGame}
    />
  );
}
