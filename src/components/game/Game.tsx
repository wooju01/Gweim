"use client";

import { useEffect, useReducer } from "react";
import type { TalkAction } from "@/lib/schemas";
import { postEvent, postFarewell, postRecruit, postTalk } from "./api";
import { BattleScreen } from "./BattleScreen";
import { DungeonScreen } from "./DungeonScreen";
import { alive, pickEvent } from "@/game/dungeon/expedition";
import { nodeById } from "@/game/dungeon/map";
import { getStage } from "@/game/affinity";
import { DialogueScreen } from "./DialogueScreen";
import { GuildScreen } from "./GuildScreen";
import { MERC_SLOTS } from "@/game/party";
import { entryId, gameReducer, hiredCount, initialState, mercOf, type TownPlace } from "./state";
import { GateScreen } from "./town/GateScreen";
import { ReportScreen } from "./town/ReportScreen";
import { YardScreen, type PromotionOffer } from "./town/YardScreen";
import { canPromote } from "@/game/growth";
import { nextRank, promoteCost, promotionChoices } from "@/game/promotion";
import { LEVELS, getPassive } from "@/data/passives";
import { JOB_ULTIMATE, getSkill } from "@/data/combat";
import { InnScreen } from "./town/InnScreen";
import { SkillHallScreen } from "./town/SkillHallScreen";
import { ForgeScreen } from "./town/ForgeScreen";
import { ShopScreen } from "./town/ShopScreen";
import { TownScreen } from "./town/TownScreen";
import { clearSave, loadGame, saveGame } from "./save";
import { salvageCount } from "@/data/loot";

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
    case "offer":
      return action.offer === "advance" ? "선금을 먼저 내민다." : "앞으로 몫을 더 넉넉히 주겠다고 약속한다.";
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
    const { affinity, willingness, recentTones, history, memory, talks, offers } = state.progress[mercId];
    try {
      const res = await postTalk({
        merc: entry,
        state: { affinity, willingness, recentTones, history, memory, talks, offers },
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
    const { affinity, willingness, recentTones, history, memory, talks, offers } = state.progress[mercId];
    try {
      const res = await postTalk({
        merc: entry,
        state: { affinity, willingness, recentTones, history, memory, talks, offers },
        action,
        scene: "rest",
      });
      dispatch({ type: "resolved", mercId, playerText: playerLineFor(action), res });
      dispatch({ type: "restTalkReply", res, done: action.type !== "open" });
    } catch (e) {
      dispatch({ type: "restTalkFailed", error: e instanceof Error ? e.message : String(e) });
    }
  }

  /**
   * 전투를 마치고 지도로 (flee면 전투 중 후퇴로 원정을 끝낸다).
   * 죽은 용병이 있으면 마지막 말을 부탁한다 (명단에서 지워지기 전에 정보를 챙긴다)
   */
  async function leaveBattle(flee = false) {
    if (state.screen.kind !== "battle") return;
    const requests = state.screen.battle.units
      .filter((u) => u.side === "merc" && u.dead)
      .flatMap((u) => {
        const entry = findEntry(u.id);
        const p = state.progress[u.id];
        return entry && p ? [{ id: u.id, entry, memory: p.memory, stage: getStage(p.affinity) }] : [];
      });
    dispatch(flee ? { type: "fleeBattle", seed: roll() } : { type: "battleFinish", seed: roll() });
    for (const r of requests) {
      try {
        const res = await postFarewell({ merc: r.entry, memory: r.memory, stage: r.stage });
        dispatch({ type: "farewell", mercId: r.id, words: res.words });
      } catch {
        dispatch({ type: "farewell", mercId: r.id, words: "…" });
      }
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
        onLeave={() => void leaveBattle()}
        leaveLabel={state.expedition ? { victory: "계속 나아간다", defeat: "결과를 본다" } : undefined}
        bonds={Object.fromEntries(state.party.map((id) => [id, getStage(state.progress[id]?.affinity ?? 0)]))}
        onFlee={state.expedition ? () => void leaveBattle(true) : undefined}
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
          partyFull={hiredCount(state) >= MERC_SLOTS}
          onAct={act}
          onLeave={() => dispatch({ type: "leave" })}
          gold={state.gold}
        />
      );
    }
  }

  const go = (place: TownPlace) => dispatch({ type: "goto", place });
  const toTown = () => go("town");
  const mercs = state.roster.map(mercOf);
  const hired = mercs.filter((m) => state.progress[m.id]?.hired);
  const partyMercs = state.party.flatMap((id) => mercs.filter((m) => m.id === id));
  // 단련장의 승급 후보 (레벨 3을 채운, 더 오를 등급이 있는 용병)
  const promotionOffers: Record<string, PromotionOffer> = {};
  for (const e of state.roster) {
    if (e.kind !== "random") continue;
    const p = state.progress[e.seed.id];
    const next = nextRank(e.seed.level);
    if (!p?.hired || !canPromote(p) || !next) continue;
    const choices = promotionChoices(e.seed, p.learned);
    promotionOffers[e.seed.id] = {
      next: LEVELS[next].name,
      cost: promoteCost(e.seed.level)!,
      passives: choices.passives.flatMap((id) => getPassive(id) ?? []),
      skills: choices.skills.flatMap((id) => getSkill(id) ?? []),
      ultimate: e.seed.ultimate ? undefined : getSkill(JOB_ULTIMATE[e.seed.traits.job] ?? ""),
    };
  }

  switch (state.screen.kind) {
    case "report":
      return state.report ? (
        <ReportScreen
          report={state.report}
          deaths={state.memorial.filter((f) => f.day === state.report!.day)}
          day={state.day}
          gold={state.gold}
          onDone={toTown}
        />
      ) : null;
    case "guild":
      return (
        <GuildScreen
          mercs={mercs}
          progress={state.progress}
          recruit={state.recruit}
          onRecruit={recruit}
          onTalk={startTalk}
          onDismiss={(mercId) => dispatch({ type: "dismiss", mercId })}
          day={state.day}
          gold={state.gold}
          hired={hired.length}
          onBack={toTown}
        />
      );
    case "shop":
      return (
        <ShopScreen
          day={state.day}
          gold={state.gold}
          pack={state.pack}
          stock={state.stock}
          relics={state.relics}
          salvage={state.salvage}
          onSellSalvage={(id, all) => dispatch({ type: "sellSalvage", id, all })}
          onBuy={(item) => dispatch({ type: "buy", item })}
          onSell={(index) => dispatch({ type: "sell", index })}
          onBack={toTown}
        />
      );
    case "inn":
      return (
        <InnScreen
          day={state.day}
          gold={state.gold}
          hired={hired}
          progress={state.progress}
          party={state.party}
          onToggle={(mercId) => dispatch({ type: "toggleParty", mercId })}
          onBack={toTown}
        />
      );
    case "yard":
      return (
        <YardScreen
          day={state.day}
          gold={state.gold}
          hired={hired}
          progress={state.progress}
          onTrain={(mercId, alloc) => dispatch({ type: "train", mercId, alloc })}
          promotions={promotionOffers}
          onPromote={(mercId, passive, skill) => dispatch({ type: "promote", mercId, passive, skill })}
          onBack={toTown}
        />
      );
    case "forge":
      return (
        <ForgeScreen
          day={state.day}
          gold={state.gold}
          hired={hired}
          progress={state.progress}
          salvage={state.salvage}
          trinkets={state.trinkets}
          onForge={(trinket) => dispatch({ type: "forgeTrinket", trinket })}
          onUpgrade={(where) => dispatch({ type: "upgradeTrinket", ...where })}
          onEquip={(mercId, index) => dispatch({ type: "equipTrinket", mercId, index })}
          onUnequip={(mercId) => dispatch({ type: "unequipTrinket", mercId })}
          onBack={toTown}
        />
      );
    case "hall":
      return (
        <SkillHallScreen
          day={state.day}
          gold={state.gold}
          hired={state.roster.flatMap((e) =>
            e.kind === "random" && state.progress[e.seed.id]?.hired ? [{ merc: mercOf(e), seed: e.seed }] : [],
          )}
          progress={state.progress}
          salvage={state.salvage}
          onUnlock={(mercId, piece) => dispatch({ type: "unlockPiece", mercId, piece })}
          onCraft={(mercId, core, mods) => dispatch({ type: "craftSkill", mercId, core, mods })}
          onSwap={(mercId, change) => dispatch({ type: "swapSkill", mercId, ...change })}
          onBack={toTown}
        />
      );
    case "gate":
      return (
        <GateScreen
          day={state.day}
          gold={state.gold}
          party={partyMercs}
          progress={state.progress}
          pack={state.pack}
          onDepart={() => dispatch({ type: "enterDungeon", seed: roll() })}
          onGo={go}
        />
      );
    default:
      return (
        <TownScreen
          day={state.day}
          gold={state.gold}
          hired={hired.length}
          party={partyMercs}
          visitors={mercs.length - hired.length}
          pack={state.pack}
          relics={state.relics.length}
          salvage={salvageCount(state.salvage)}
          trainable={hired.reduce((s, m) => s + (state.progress[m.id]?.trainable ?? 0), 0)}
          notices={state.notices}
          memorial={state.memorial}
          onGo={go}
          onDismissNotices={() => dispatch({ type: "dismissNotices" })}
          onNewGame={newGame}
        />
      );
  }
}
