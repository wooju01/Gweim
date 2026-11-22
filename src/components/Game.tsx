"use client";
import type { SupplyKind } from "@/data/combat";

import { useEffect, useReducer, useRef, useState } from "react";
import type { TalkAction } from "@/lib/schemas";
import { postEvent, postFarewell, postReact, postRecruit, postStory, postTalk } from "@/lib/api";
import { BattleScreen } from "@/components/battle/BattleScreen";
import { DungeonScreen } from "@/components/dungeon/DungeonScreen";
import { alive, battleSpoils, finishBattle, moveTo } from "@/game/dungeon/expedition";
import { fleeTemper } from "@/data/bond";
import { nodeById } from "@/game/dungeon/map";
import { getStage } from "@/game/merc/affinity";
import { DialogueScreen } from "@/components/dialogue/DialogueScreen";
import { GuildScreen } from "@/components/guild/GuildScreen";
import { canHire, entryId, facilityBlock, facilitySlots, forgeDiscounted, gameReducer, questSlots, shopPrice, guildPromotionBlocks, promotionBlocks, initialState, mercOf, type TownPlace } from "@/game/state/state";
import { FACILITIES, bagSlots, type FacilityId } from "@/data/facilities";
import { GateScreen } from "@/components/town/GateScreen";
import { ReportScreen } from "@/components/town/ReportScreen";
import { YardScreen } from "@/components/town/YardScreen";
import type { PromotionOffer } from "@/components/guild/Promotion";
import { atLastStage } from "@/game/merc/growth";
import { nextRank, promoteCost, promotionChoices } from "@/game/merc/promotion";
import { getPassive } from "@/data/passives";
import { RANKS } from "@/data/ranks";
import { JOB_ULTIMATE } from "@/data/fragments";
import { getSkill } from "@/game/skills";
import { InnScreen } from "@/components/town/InnScreen";
import { SkillHallScreen } from "@/components/town/SkillHallScreen";
import { ForgeScreen } from "@/components/town/ForgeScreen";
import { ShopScreen } from "@/components/town/ShopScreen";
import { TownScreen } from "@/components/town/TownScreen";
import { MercSheet } from "@/components/town/MercSheet";
import { BoardScreen } from "@/components/town/BoardScreen";
import { CLAN_MEMBER_LIMIT, GUEST_ROOMS, INN_LIMIT } from "@/data/clan";
import { clanJoinChance } from "@/game/quests";
import { createRng } from "@/game/random";
import { clearSave, loadGame, saveGame } from "@/game/state/save";
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

/** 리듀서를 순수하게 두려고 난수 시드는 여기서 굴린다 (이벤트 처리기에서만 부른다) */
const roll = () => Math.floor(Math.random() * 2 ** 32);

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

  // 귀환 뒤 AI 이야기: 일상 장면, 파견 보고 (결과는 이미 정해졌다. 한 번만 부탁한다)
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!state.booted) return;
    const find = (id: string) => state.roster.find((e) => entryId(e) === id);
    const scene = state.homeScene;
    if (scene && scene.text === null) {
      const key = `scene:${scene.day}:${scene.ids.join("+")}`;
      const [a, b] = scene.ids.map(find);
      if (!asked.current.has(key) && a && b) {
        asked.current.add(key);
        postStory({ kind: "scene", mercs: [a, b] })
          .then((r) => dispatch({ type: "sceneText", text: r.text }))
          .catch(() => dispatch({ type: "sceneText", text: "둘은 난롯가에 앉아 지난 원정 이야기로 한참 웃었다." }));
      }
    }
    state.dispatchLog.forEach((r, index) => {
      if (r.story !== null) return;
      const key = `dispatch:${r.questId}:${r.day}`;
      if (asked.current.has(key)) return;
      asked.current.add(key);
      // 죽은 클랜원은 명단에서 지워졌으므로 추모 명단의 이름만 남는다 → 살아 있는 사람만 용병 정보로, 없으면 기본 문장
      const members = r.members.flatMap((m) => {
        const e = find(m.id);
        return e ? [{ merc: e, outcome: m.outcome }] : [];
      });
      const fallback = `「${r.title}」에서 돌아왔다. ${r.success ? "의뢰는 무사히 마쳤다." : "의뢰는 실패했다."}`;
      if (members.length === 0) {
        dispatch({ type: "dispatchStory", index, text: fallback });
        return;
      }
      postStory({ kind: "dispatch", title: r.title, success: r.success, members })
        .then((res) => dispatch({ type: "dispatchStory", index, text: res.text }))
        .catch(() => dispatch({ type: "dispatchStory", index, text: fallback }));
    });
  }, [state.booted, state.homeScene, state.dispatchLog, state.roster]);

  /** 클랜 가입 제안: 판정은 리듀서와 같은 시드로 여기서도 알 수 있다. 대답은 AI */
  async function proposeClan(mercId: string) {
    const entry = findEntry(mercId);
    const p = state.progress[mercId];
    if (!entry || !p) return;
    const seed = roll();
    dispatch({ type: "proposeClan", mercId, seed });
    const m = mercOf(entry);
    const accepted = createRng(seed).next() < clanJoinChance(p.affinity, m.traitIds?.personalities ?? [], m.traitIds?.background);
    try {
      const res = await postReact({ merc: entry, situation: "clanJoin", feeling: accepted ? "up" : "down", stage: getStage(p.affinity) });
      dispatch({ type: "clanWords", mercId, words: res.words });
    } catch {
      dispatch({ type: "clanWords", mercId, words: accepted ? "좋아, 함께하지." : "…아직은 아니야." });
    }
  }

  function newGame() {
    if (!window.confirm("저장을 지우고 처음부터 시작할까? 되돌릴 수 없다.")) return;
    clearSave(window.localStorage);
    dispatch({ type: "newGame" });
  }

  const findEntry = (mercId: string) => state.roster.find((e) => entryId(e) === mercId);
  /** 마을에서 열어 둔 용병 정보 창 */
  const [sheetId, setSheetId] = useState<string | null>(null);
  /** 보스 직전 경고에서 동료들이 한 말 (그 칸에 있는 동안만) */
  const [omen, setOmen] = useState<{ at: string; lines: string[] } | null>(null);

  /** 성격으로 정한 마음의 방향 (후퇴를 반기면 up) */
  const temperFeeling = (mercId: string): "up" | "down" | "none" => {
    const entry = findEntry(mercId);
    const t = entry ? fleeTemper(mercOf(entry).traitIds?.personalities) : 0;
    return t > 0 ? "up" : t < 0 ? "down" : "none";
  };

  /** 용병 한마디를 AI에게 부탁한다. 실패하면 null */
  async function reactLine(mercId: string, situation: "flee" | "omen", feeling: "up" | "down" | "none"): Promise<string | null> {
    const entry = findEntry(mercId);
    const p = state.progress[mercId];
    if (!entry || !p) return null;
    try {
      return (await postReact({ merc: entry, situation, feeling, stage: getStage(p.affinity) })).words;
    } catch {
      return null;
    }
  }

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

  // 의뢰 보상 "용병 합류": 모집 API로 동 등급 한 명을 만들어 고용비 없이 합류시킨다
  const joining = useRef(false);
  const hireRoom = canHire(state);
  useEffect(() => {
    // 자리가 있을 때만 (숙소 6명, 클랜 본부 객실 4칸)
    if (!state.booted || state.pendingJoins <= 0 || joining.current || !hireRoom) return;
    joining.current = true;
    postRecruit({ count: 1, avoidNames: state.roster.map((e) => mercOf(e).name), guildGrade: "bronze", fame: 0, tavern: 0 })
      .then((res) => dispatch({ type: "joinedFree", seeds: res.seeds }))
      .catch(() => {})
      .finally(() => {
        joining.current = false;
      });
  }, [state.booted, state.pendingJoins, state.roster, hireRoom]);

  async function recruit() {
    if (state.recruit.pending) return;
    dispatch({ type: "recruitStart" });
    try {
      const avoidNames = state.roster.map((e) => mercOf(e).name);
      // 주점 확장: 더 많이, 좋은 성격·높은 등급이 잘 온다
      const res = await postRecruit({ avoidNames, guildGrade: state.guildGrade, fame: state.fame, tavern: state.facilities.tavern ?? 0 });
      dispatch({ type: "recruited", seeds: res.seeds });
    } catch (e) {
      dispatch({ type: "recruitFailed", error: e instanceof Error ? e.message : String(e) });
    }
  }


  async function move(nodeId: string) {
    const exp = state.expedition;
    if (!exp) return;
    const seed = roll();
    dispatch({ type: "move", nodeId, seed });
    // 이동 결과는 순수 함수라 여기서도 똑같이 계산할 수 있다 (어떤 사건이 나왔는지, 보스 직전인지)
    const moved = moveTo(exp, [], nodeId, seed);
    const room = moved?.exp.room;
    // 보스 직전 칸 (경고 보스): 동료들이 한마디씩. 신중한 용병은 물러나자고, 호전적인 용병은 들어가 보자고 한다
    const node = nodeById(exp.map, nodeId);
    if (exp.goal?.kind === "boss" && exp.goal.warn && node?.next.includes(exp.map.goalId)) {
      setOmen({ at: nodeId, lines: [] });
      for (const m of alive(exp)) {
        const t = temperFeeling(m.id);
        const words = await reactLine(m.id, "omen", t === "up" ? "down" : t === "down" ? "up" : "none");
        if (words) setOmen((o) => (o?.at === nodeId ? { at: nodeId, lines: [...o.lines, `${m.name}: “${words}”`] } : o));
      }
    }
    // 사건 칸이면 AI에게 묘사를 부탁한다 (결과는 코드가 정한다). 실패하면 기본 문장을 쓴다
    if (room?.kind !== "event") return;
    const eventId = room.eventId;
    try {
      const party = alive(exp).map((m) => ({ name: m.name, race: m.race, job: m.job }));
      dispatch({ type: "narrated", eventId, data: await postEvent({ eventId, party }) });
    } catch {
      dispatch({ type: "narrated", eventId, data: null });
    }
  }

  /** 휴식 칸 대화. 용병이 먼저 한마디 하고, 플레이어가 한 번 답하면 끝난다 (호감만 움직인다) */
  async function sendRest(mercId: string, action: TalkAction, scene: "rest" | "home" = "rest") {
    const entry = findEntry(mercId);
    if (!entry) return;
    const { affinity, willingness, recentTones, history, memory, talks, offers } = state.progress[mercId];
    try {
      const res = await postTalk({
        merc: entry,
        state: { affinity, willingness, recentTones, history, memory, talks, offers },
        action,
        scene,
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
    // 후퇴: 살아 있는 동행 용병들이 한마디씩 (결산에 붙는다)
    const survivors = flee ? state.screen.battle.units.filter((u) => u.side === "merc" && !u.dead).map((u) => ({ id: u.id, name: u.name })) : [];
    dispatch(flee ? { type: "fleeBattle", seed: roll() } : { type: "battleFinish" });
    for (const m of survivors) {
      const words = await reactLine(m.id, "flee", temperFeeling(m.id));
      if (words) dispatch({ type: "fleeLine", name: m.name, words });
    }
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
        warRoom={state.facilities.warRoom ?? 0}
        bossesMet={state.bossesMet}
        spoils={
          state.expedition && state.screen.battle.outcome === "victory"
            ? battleSpoils(finishBattle(state.expedition, state.screen.battle), state.screen.battle, state.screen.battle.rng).lines
            : undefined
        }
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
        onDescend={(region) => dispatch({ type: "descend", seed: roll(), region })}
        onDiscard={(item) => dispatch({ type: "discard", item })}
        warRoom={state.facilities.warRoom ?? 0}
        explored={state.explored}
        conquered={state.conquered}
        omenLines={omen?.at === state.expedition.at ? omen.lines : []}
        activeQuests={state.activeQuests}
        homeSalvage={state.salvage}
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
          partyFull={!state.progress[state.screen.mercId]?.hired && !canHire(state)}
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
  // 길드 창구의 승급 후보 (등급의 마지막 단계를 채운, 더 오를 등급이 있는 용병). 부족한 조건도 함께
  const promotionOffers: Record<string, PromotionOffer> = {};
  for (const e of state.roster) {
    if (e.kind !== "random") continue;
    const p = state.progress[e.seed.id];
    const next = nextRank(e.seed.level);
    // 등급의 마지막 단계면 길드 창구에 보인다 (승급용 경험치가 모자라면 부족한 조건으로)
    if (!p?.hired || !atLastStage(p) || !next) continue;
    const choices = promotionChoices(e.seed);
    promotionOffers[e.seed.id] = {
      next: RANKS[next].name,
      cost: promoteCost(e.seed.level)!,
      blocks: promotionBlocks(state, e.seed.id),
      passives: choices.passives.flatMap((id) => getPassive(id) ?? []),
      branches: choices.branches.map((b) => ({
        id: b.id,
        name: typeof b.name === "string" ? b.name : e.seed.traits.gender ? b.name[e.seed.traits.gender] : `${b.name.female}/${b.name.male}`,
        hint: b.hint,
        dualElement: b.dualElement,
      })),
      ultimate: e.seed.ultimate || !RANKS[next].ultimate ? undefined : getSkill(JOB_ULTIMATE[e.seed.traits.job] ?? ""),
    };
  }

  // 용병 상태 창 (마을·숙소에서 용병을 누르면)
  const sheetEntry = sheetId ? findEntry(sheetId) : undefined;
  const sheetMerc = sheetEntry && state.progress[sheetId!] ? mercOf(sheetEntry) : undefined;
  const sheet = sheetMerc && (
    <MercSheet
      merc={sheetMerc}
      seed={sheetEntry!.kind === "random" ? sheetEntry!.seed : undefined}
      progress={state.progress[sheetMerc.id]}
      trinkets={state.trinkets}
      onClose={() => setSheetId(null)}
      onSwap={(change) => dispatch({ type: "swapSkill", mercId: sheetMerc.id, ...change })}
      onForget={(key) => dispatch({ type: "forgetSkill", mercId: sheetMerc.id, key })}
      onEquipTrinket={(index) => dispatch({ type: "equipTrinket", mercId: sheetMerc.id, index })}
      onUnequipTrinket={(slot) => dispatch({ type: "unequipTrinket", mercId: sheetMerc.id, slot })}
      onDismiss={() => {
        dispatch({ type: "dismiss", mercId: sheetMerc.id });
        setSheetId(null);
      }}
      onTalk={() => {
        setSheetId(null);
        startTalk(sheetMerc.id);
      }}
    />
  );

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
        <>
        {sheet}
        <GuildScreen
          mercs={mercs}
          progress={state.progress}
          recruit={state.recruit}
          onRecruit={recruit}
          onTalk={startTalk}
          onInspect={setSheetId}
          day={state.day}
          gold={state.gold}
          hired={hired.length}
          limit={state.home === "clanHall" ? `${CLAN_MEMBER_LIMIT} + 객실 ${GUEST_ROOMS}` : `${INN_LIMIT}`}
          canHire={canHire(state)}
          guildGrade={state.guildGrade}
          guildPromotion={guildPromotionBlocks(state)}
          onPromoteGuild={() => dispatch({ type: "promoteGuild" })}
          promotions={promotionOffers}
          onPromote={(mercId, choice) => dispatch({ type: "promote", mercId, ...choice })}
          onBack={toTown}
        />
        </>
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
          materialBought={state.materialBought}
          onBuyMaterial={(id) => dispatch({ type: "buyMaterial", id })}
          onBuy={(item) => dispatch({ type: "buy", item })}
          onSell={(index) => dispatch({ type: "sell", index })}
          storageLevel={state.storageLevel}
          prices={Object.fromEntries((["bandage", "antidote", "potion", "greaterPotion"] as const).map((k) => [k, shopPrice(state, k)])) as Record<SupplyKind, number>}
          onExpand={() => dispatch({ type: "expandStorage" })}
          onBack={toTown}
        />
      );
    case "inn":
      return (
        <>
        {sheet}
        <InnScreen
          day={state.day}
          gold={state.gold}
          hired={hired}
          progress={state.progress}
          party={state.party}
          home={state.home}
          talksLeft={state.talksLeft}
          restTalk={state.restTalk}
          clanAnswer={state.clanAnswer}
          homeScene={state.homeScene}
          settlement={{ lastDay: state.lastSettlementDay, arrearsWeeks: state.arrearsWeeks, debt: state.clanDebt }}
          onToggle={(mercId) => dispatch({ type: "toggleParty", mercId })}
          onTalk={(mercId) => {
            dispatch({ type: "homeTalkStart", mercId });
            void sendRest(mercId, { type: "open" }, "home");
          }}
          onTalkReply={(action) => {
            if (!state.restTalk || state.restTalk.pending || state.restTalk.done) return;
            dispatch({ type: "restTalkPending" });
            void sendRest(state.restTalk.mercId, action, "home");
          }}
          onTalkEnd={() => dispatch({ type: "homeTalkEnd" })}
          onProposeClan={(mercId) => void proposeClan(mercId)}
          onFoundClan={() => dispatch({ type: "foundClan" })}
          facility={{
            levels: state.facilities,
            slots: facilitySlots(state),
            blocks: Object.fromEntries(FACILITIES.map((f) => [f.id, facilityBlock(state, f.id)])) as Record<FacilityId, string | null>,
            onBuild: (id) => dispatch({ type: "buildFacility", id }),
            memorial: state.memorial,
            hired,
            onInherit: (fallenId, piece, mercId) => dispatch({ type: "inheritLegacy", fallenId, piece, mercId }),
          }}
          onInspect={setSheetId}
          onBack={toTown}
        />
        </>
      );
    case "board":
      return (
        <BoardScreen
          day={state.day}
          gold={state.gold}
          board={state.board}
          activeQuests={state.activeQuests}
          dispatches={state.dispatches}
          dispatchLog={state.dispatchLog}
          members={hired.filter((m) => state.progress[m.id]?.kind === "member")}
          progress={state.progress}
          onAccept={(questId) => dispatch({ type: "acceptQuest", questId })}
          onAbandon={(questId) => dispatch({ type: "abandonQuest", questId })}
          fame={state.fame}
          slots={questSlots(state)}
          questAccepted={state.questAccepted}
          pendingRewards={state.pendingRewards}
          weeklyRewards={state.weeklyRewards}
          infos={state.infos}
          salvage={state.salvage}
          onDeliver={(questId) => dispatch({ type: "deliverQuest", questId, seed: roll() })}
          onClaim={(questId, choice) => dispatch({ type: "claimQuestReward", questId, choice, seed: roll() })}
          onDispatch={(questId, members) => dispatch({ type: "dispatchQuest", questId, members })}
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
          onBack={toTown}
        />
      );
    case "forge":
      return (
        <ForgeScreen
          day={state.day}
          gold={state.gold}
          hired={hired}
          forgeLevel={state.facilities.forge ?? 0}
          progress={state.progress}
          salvage={state.salvage}
          trinkets={state.trinkets}
          onForge={(trinket) => dispatch({ type: "forgeTrinket", trinket })}
          onUpgrade={(where) => dispatch({ type: "upgradeTrinket", ...where })}
          onEquip={(mercId, index) => dispatch({ type: "equipTrinket", mercId, index })}
          onUnequip={(mercId, slot) => dispatch({ type: "unequipTrinket", mercId, slot })}
          discounted={forgeDiscounted(state)}
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
          guildRank={state.guildGrade}
          onUnlock={(mercId, piece) => dispatch({ type: "unlockPiece", mercId, piece })}
          onUpgrade={(mercId, piece) => dispatch({ type: "upgradePiece", mercId, piece })}
          onCraft={(mercId, build) => dispatch({ type: "craftSkill", mercId, build })}
          onSwap={(mercId, change) => dispatch({ type: "swapSkill", mercId, ...change })}
          onForget={(mercId, key) => dispatch({ type: "forgetSkill", mercId, key })}
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
          explored={state.explored}
          conquered={state.conquered}
          keyItems={state.keyItems}
          bag={bagSlots(state.facilities)}
          infirmary={state.facilities.infirmary ?? 0}
          onDepart={(dungeon, carry, keys) => dispatch({ type: "enterDungeon", seed: roll(), dungeon, carry, keys })}
          onGo={go}
        />
      );
    default: {
      return (
        <>
        {sheet}
        <TownScreen
          day={state.day}
          gold={state.gold}
          hired={hired.length}
          party={partyMercs}
          onInspect={setSheetId}
          quests={state.activeQuests.length}
          homeName={state.home === "clanHall" ? "클랜 본부" : "숙소"}
          visitors={mercs.length - hired.length}
          pack={state.pack}
          relics={state.relics.length}
          salvage={salvageCount(state.salvage)}
          trainable={hired.reduce((s, m) => s + (state.progress[m.id]?.trainable ?? 0), 0)}
          notices={state.notices}
          memorial={state.memorial}
          memorialLevel={state.facilities.memorial ?? 0}
          onGo={go}
          onDismissNotices={() => dispatch({ type: "dismissNotices" })}
          onNewGame={newGame}
        />
        </>
      );
    }
  }
}
