import { getStage } from "@/game/merc/affinity";
import { GUIDE, MERC_SLOTS } from "@/game/merc/party";
import type { Merc } from "@/game/types";
import { wageOf } from "@/game/merc/wages";
import { atLastStage, canPromote, xpToNext } from "@/game/merc/growth";
import { CURRENCY } from "@/data/economy";
import { CLAN_FOUNDERS, CLAN_JOIN, CLAN_MEMBER_LIMIT, GUEST_ROOMS, HOME_TALKS, INN_LIMIT, SETTLEMENT_DAYS } from "@/data/clan";
import { FacilityPanel } from "./FacilityPanel";
import type { ComponentProps } from "react";
import { rankLabel } from "@/data/ranks";
import { upkeepCost } from "@/game/quests";
import type { Stage, TalkAction } from "@/lib/schemas";
import { Button, Portrait } from "@/components/common/parts";
import { RestTalkPanel } from "@/components/dungeon/DungeonScreen";
import type { GameState, MercProgress, RestTalk } from "@/game/state/state";
import { TownBar } from "./TownBar";

type Props = {
  day: number;
  gold: number;
  /** 고용한 용병·클랜원 */
  hired: Merc[];
  progress: Record<string, MercProgress>;
  party: string[];
  home: GameState["home"];
  talksLeft: number;
  restTalk: RestTalk | null;
  clanAnswer: GameState["clanAnswer"];
  homeScene: GameState["homeScene"];
  settlement: { lastDay: number; arrearsWeeks: number; debt: number };
  onToggle: (mercId: string) => void;
  /** 용병을 누르면 상태 창 (능력치·스킬·장신구) */
  onInspect: (mercId: string) => void;
  onTalk: (mercId: string) => void;
  onTalkReply: (action: TalkAction) => void;
  onTalkEnd: () => void;
  onProposeClan: (mercId: string) => void;
  onFoundClan: () => void;
  /** 시설 (짓기·레벨 올리기·유산) */
  facility: ComponentProps<typeof FacilityPanel>;
  onBack: () => void;
};

const STAGE: Record<Stage, { name: string; style: string }> = {
  hostile: { name: "적대", style: "text-blood" },
  wary: { name: "경계", style: "text-ash" },
  neutral: { name: "중립", style: "text-ash" },
  warm: { name: "호의", style: "text-moss" },
  trusted: { name: "신뢰", style: "text-ember" },
};

/**
 * 집: 숙소(처음, 고용 6명까지) → 클랜 본부(가입 의사 5명이 모이면 창설. 클랜원 10명 + 객실 4칸).
 * 원정 파티를 정하고, 귀환마다 두 명과 1:1로 이야기하고, 신뢰하는 용병에게 클랜 가입을 청한다
 */
export function InnScreen(props: Props) {
  const { day, gold, hired, progress, party, home, talksLeft, restTalk, clanAnswer, homeScene, settlement, onToggle, onTalk, onTalkReply, onTalkEnd, onProposeClan, onFoundClan, onBack } =
    props;
  const clan = home === "clanHall";
  const members = hired.filter((m) => progress[m.id]?.kind === "member");
  const guests = clan ? hired.filter((m) => progress[m.id]?.kind !== "member") : [];
  const pledged = hired.filter((m) => progress[m.id]?.pledged);
  const nextSettlement = settlement.lastDay + SETTLEMENT_DAYS;
  const busy = (id: string) => (progress[id]?.busyUntilDay ?? 0) > day;
  const nameOf = (id: string) => hired.find((m) => m.id === id)?.name ?? "";
  const talking = restTalk && hired.some((m) => m.id === restTalk.mercId) ? restTalk : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place={clan ? "클랜 본부" : "숙소"} day={day} gold={gold} onBack={onBack} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{clan ? "클랜 본부" : "숙소"}</h1>
          <p className="text-sm text-ash">
            원정에 데려갈 사람을 정한다. 용병은 원정에서 돌아올 때 보수를 받고, 클랜원은 보수 대신 {SETTLEMENT_DAYS}일마다 유지비가 나간다.
          </p>
        </div>
        <span className="text-sm text-ember">
          원정 파티 {party.length} / {MERC_SLOTS}
        </span>
      </header>

      {/* 클랜: 창설 전에는 가입 의사, 뒤에는 정산 */}
      <section className="flex flex-col gap-1.5 rounded-sm border border-ember/40 bg-panel px-4 py-3 text-sm">
        {clan ? (
          <>
            <p>
              <b>
                클랜원 {members.length} / {CLAN_MEMBER_LIMIT}명 · 객실 {guests.length} / {GUEST_ROOMS}칸
              </b>
              <span className="ml-2 text-ash">
                다음 정산 {nextSettlement}일 · 유지비 {CURRENCY} {upkeepCost("clanHall", members.map((m) => m.level ?? "bronze"))}
              </span>
            </p>
            {guests.length > 0 && (
              <p className="text-xs text-ash">
                객실 용병은 기한 안에 클랜에 들지 않으면 떠난다: {guests.map((m) => `${m.name} (${progress[m.id]?.guestUntilDay ?? day}일까지)`).join(", ")}
              </p>
            )}
            {settlement.debt > 0 && (
              <p className="text-blood">
                밀린 유지비 {CURRENCY} {settlement.debt} ({settlement.arrearsWeeks}주 연체) · 1주 연체면 클랜원 호감이 떨어지고, 2주부터는 한 명씩 떠난다
              </p>
            )}
          </>
        ) : (
          <>
            <p>
              <b>클랜 창설</b>
              <span className="ml-2 text-ash">
                숙소 {hired.length} / {INN_LIMIT}명 ·{" "}
                가입 의사 {pledged.length} / {CLAN_FOUNDERS} · 신뢰 단계(호감 {CLAN_JOIN.minAffinity} 이상)인 용병에게 가입을 청할 수 있다
              </span>
            </p>
            {pledged.length > 0 && <p className="text-xs text-moss">가입 의사: {pledged.map((m) => m.name).join(", ")}</p>}
            <Button variant="ember" className="self-start !px-3 !py-1 text-xs" disabled={pledged.length < CLAN_FOUNDERS} onClick={onFoundClan}>
              {pledged.length < CLAN_FOUNDERS ? `${CLAN_FOUNDERS - pledged.length}명이 더 필요하다` : "클랜을 세운다"}
            </Button>
          </>
        )}
        {clanAnswer && (
          <p className={clanAnswer.accepted ? "text-moss" : "text-ash"}>
            {nameOf(clanAnswer.mercId)}: {clanAnswer.words ? `“${clanAnswer.words}”` : "…"} {clanAnswer.accepted ? "(받아들였다)" : "(거절했다)"}
          </p>
        )}
      </section>

      {/* 시설은 클랜을 세운 뒤에 보인다 */}
      {clan && <FacilityPanel {...props.facility} />}

      {homeScene?.day === day && (
        <section className="flex flex-col gap-1 rounded-sm border border-edge bg-panel px-4 py-3 text-sm">
          <p className="text-xs text-ash">
            일상 · {nameOf(homeScene.ids[0])}와(과) {nameOf(homeScene.ids[1])}
          </p>
          <p className="leading-relaxed text-bone/90">{homeScene.text ?? "…"}</p>
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-sm border border-edge bg-panel px-4 py-3">
        <p className="text-sm">
          <b>1:1 대화</b>
          <span className="ml-2 text-xs text-ash">
            귀환할 때마다 {HOME_TALKS}명 · 남은 {talksLeft}명 · 호감만 움직인다
          </span>
        </p>
        {talking ? (
          <>
            <RestTalkPanel name={nameOf(talking.mercId)} talk={talking} onReply={onTalkReply} />
            {talking.done && (
              <Button className="self-start !px-3 !py-1 text-xs" onClick={onTalkEnd}>
                대화를 마친다
              </Button>
            )}
          </>
        ) : (
          <p className="text-xs text-ash">{talksLeft > 0 ? "아래 용병 카드에서 이야기할 사람을 고른다." : "이번 귀환에는 더 이야기할 수 없다. 다음 원정에서 돌아오면 다시."}</p>
        )}
      </section>

      <div className="flex items-center gap-3 rounded-sm border border-edge bg-panel px-4 py-3">
        <span className="font-bold">{GUIDE.name}</span>
        <span className="text-xs text-ash">{GUIDE.role} · 언제나 함께 간다</span>
      </div>

      {hired.length === 0 ? (
        <p className="rounded-sm border border-dashed border-edge px-4 py-10 text-center text-sm text-ash">
          아직 고용한 용병이 없다. 용병 길드에서 동행을 청해 보라.
        </p>
      ) : (
        <section aria-label="고용한 용병" className="grid gap-3 sm:grid-cols-2">
          {hired.map((merc) => {
            const p = progress[merc.id];
            const inParty = party.includes(merc.id);
            const stageKey = getStage(p.affinity);
            const stage = STAGE[stageKey];
            const member = p.kind === "member";
            const canAsk = !member && !p.pledged && p.affinity >= CLAN_JOIN.minAffinity && p.clanAskedDay !== day;
            return (
              <article
                key={merc.id}
                className={`flex gap-3 rounded-sm border p-3 ${inParty ? "border-ember/60 bg-ember/5" : "border-edge bg-panel"}`}
              >
                <button type="button" onClick={() => props.onInspect(merc.id)} title="상태 보기" className="shrink-0 self-start rounded-sm transition-opacity hover:opacity-80">
                  <Portrait merc={merc} size="sm" />
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold">
                    <button type="button" onClick={() => props.onInspect(merc.id)} className="underline decoration-edge underline-offset-4 hover:text-ember hover:decoration-ember" title="상태 보기">
                      {merc.name}
                    </button>
                    <span className={`ml-2 text-xs font-normal ${stage.style}`}>{stage.name}</span>
                    <span className={`ml-2 text-xs font-normal ${member ? "text-frost" : "text-ash"}`}>
                      {member ? "클랜원" : p.pledged ? "가입 의사 있음" : clan ? `객실 · ${p.guestUntilDay ?? day}일까지` : "용병"}
                    </span>
                  </span>
                  <span className="text-xs text-ash">
                    {merc.tags?.slice(0, 2).join(" · ")} · {merc.title}
                  </span>
                  <span className="text-xs text-ash">
                    {member ? "보수 없음" : `보수 ${CURRENCY} ${p.wage ?? wageOf(merc)} / 원정`} · {merc.level ? rankLabel(merc.level, p.lv) : `레벨 ${p.lv}`}
                    {canPromote(p) ? " (승급 대기 · 길드 창구)" : ` · ${atLastStage(p) ? "승급용 " : ""}경험치 ${p.xp}/${xpToNext(p.lv)}`}
                  </span>
                  {busy(merc.id) && <span className="text-xs text-blood">{p.busyUntilDay}일까지 자리를 비운다 (파견·부상)</span>}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Button
                      variant={inParty ? "ember" : "ghost"}
                      className="!px-3 !py-1 text-xs"
                      disabled={!inParty && (party.length >= MERC_SLOTS || busy(merc.id))}
                      onClick={() => onToggle(merc.id)}
                    >
                      {inParty ? "원정에서 빼기" : "원정에 데려가기"}
                    </Button>
                    <Button className="!px-3 !py-1 text-xs" onClick={() => props.onInspect(merc.id)}>
                      상태 보기
                    </Button>
                    <Button className="!px-3 !py-1 text-xs" disabled={talksLeft <= 0 || !!talking || busy(merc.id)} onClick={() => onTalk(merc.id)}>
                      이야기하기
                    </Button>
                    {canAsk && (
                      <Button className="!px-3 !py-1 text-xs" onClick={() => onProposeClan(merc.id)} title="거절하면 다음 귀환까지 다시 청할 수 없다">
                        {clan ? "클랜에 들어오라고 청한다" : "클랜 가입을 청한다"}
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
