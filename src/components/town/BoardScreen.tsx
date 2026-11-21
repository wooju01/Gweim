import { useState } from "react";
import { CURRENCY } from "@/data/economy";
import { getSalvage } from "@/data/loot";
import { getMonster } from "@/data/monsters";
import { MAX_ACTIVE_DIRECT, RISK_NAME, getQuest, type Objective, type Quest, type Reward } from "@/data/quests";
import { RANKS } from "@/data/ranks";
import { getTrait } from "@/data/traits";
import { dispatchChance, type DispatchMember } from "@/game/quests";
import type { Merc } from "@/game/types";
import type { Dispatch, DispatchReport, MercProgress } from "@/game/state/state";
import { Button, Portrait } from "@/components/common/parts";
import { TownBar } from "./TownBar";

type Props = {
  day: number;
  gold: number;
  board: string[];
  activeQuests: string[];
  dispatches: Dispatch[];
  dispatchLog: DispatchReport[];
  /** 클랜원 (파견할 수 있다) */
  members: Merc[];
  progress: Record<string, MercProgress>;
  onAccept: (questId: string) => void;
  onAbandon: (questId: string) => void;
  onDispatch: (questId: string, members: string[]) => void;
  onBack: () => void;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const RISK_STYLE = { low: "text-moss", mid: "text-ember", high: "text-blood" } as const;

export function objectiveText(o: Objective): string {
  switch (o.type) {
    case "killBoss":
      return `${getMonster(o.monsterId)?.name ?? o.monsterId} 처치`;
    case "killAnyBoss":
      return `${o.monsterIds.map((id) => getMonster(id)?.name ?? id).join("·")} 중 하나 처치`;
    case "killElite":
      return `${getMonster(o.monsterId)?.name ?? o.monsterId} ${o.count}마리 처치`;
    case "collect":
      return `${getSalvage(o.itemId)?.name ?? o.itemId} ${o.count}개 가져오기`;
  }
}

function rewardText(r: Reward): string {
  return [`${CURRENCY} ${r.gold}`, ...Object.entries(r.salvage ?? {}).map(([id, n]) => `${getSalvage(id)?.name ?? id} ${n}`)].join(" · ");
}

/** 게시판·주점: 직접 의뢰를 받고, 클랜원을 파견 의뢰에 보낸다 */
export function BoardScreen({ day, gold, board, activeQuests, dispatches, dispatchLog, members, progress, onAccept, onAbandon, onDispatch, onBack }: Props) {
  const quests = board.flatMap((id) => getQuest(id) ?? []);
  const direct = quests.filter((q): q is Extract<Quest, { kind: "direct" }> => q.kind === "direct");
  const dispatch = quests.filter((q): q is Extract<Quest, { kind: "dispatch" }> => q.kind === "dispatch");
  const free = members.filter((m) => (progress[m.id]?.busyUntilDay ?? 0) <= day);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="게시판 · 주점" day={day} gold={gold} onBack={onBack} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">게시판 · 주점</h1>
        <p className="text-sm text-ash">게시판은 원정에서 돌아올 때마다 새로 붙는다. 직접 의뢰는 파티가 던전에서, 파견 의뢰는 클랜원이 대신 다녀온다.</p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">
          받은 의뢰 <span className="text-xs font-normal text-ash">{activeQuests.length} / {MAX_ACTIVE_DIRECT} · 목표를 이루고 살아 돌아오면 보상</span>
        </h2>
        {activeQuests.length === 0 ? (
          <p className="text-xs text-ash">받은 의뢰가 없다.</p>
        ) : (
          activeQuests.map((id) => {
            const q = getQuest(id);
            if (q?.kind !== "direct") return null;
            return (
              <div key={id} className="flex items-center justify-between gap-2 rounded-sm border border-ember/40 bg-panel px-3 py-2 text-xs">
                <span className="flex flex-col">
                  <b className="text-sm">{q.title}</b>
                  <span className="text-bone/80">{objectiveText(q.objective)}</span>
                  <span className="text-ember">보상 {rewardText(q.reward)}</span>
                </span>
                <Button className="!px-2.5 !py-0.5 text-xs" onClick={() => onAbandon(id)}>
                  포기
                </Button>
              </div>
            );
          })
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">직접 의뢰</h2>
        {direct.length === 0 && <p className="text-xs text-ash">붙어 있는 직접 의뢰가 없다.</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          {direct.map((q) => (
            <div key={q.id} className="flex flex-col gap-1 rounded-sm border border-edge bg-panel p-3 text-xs">
              <b className="text-sm">{q.title}</b>
              <span className="text-bone/80">{objectiveText(q.objective)}</span>
              <span className="text-ember">보상 {rewardText(q.reward)}</span>
              <Button className="mt-1 self-start !px-2.5 !py-0.5 text-xs" disabled={activeQuests.length >= MAX_ACTIVE_DIRECT} onClick={() => onAccept(q.id)}>
                {activeQuests.length >= MAX_ACTIVE_DIRECT ? "더 받을 수 없다" : "받는다"}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">
          파견 의뢰 <span className="text-xs font-normal text-ash">클랜원만 보낼 수 있다 · 보낸 사람은 돌아올 때까지 원정에 데려갈 수 없다</span>
        </h2>
        {members.length === 0 && <p className="text-xs text-ash">아직 클랜원이 없다. 숙소에서 클랜을 세우면 보낼 수 있다.</p>}
        {dispatch.length === 0 && <p className="text-xs text-ash">붙어 있는 파견 의뢰가 없다.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {dispatch.map((q) => (
            <DispatchCard key={q.id} quest={q} day={day} free={free} progress={progress} onSend={(ids) => onDispatch(q.id, ids)} />
          ))}
        </div>
      </section>

      {dispatches.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">나가 있는 클랜원</h2>
          {dispatches.map((d) => (
            <p key={d.questId} className="text-xs text-bone/80">
              「{getQuest(d.questId)?.title}」 · {d.members.map((id) => members.find((m) => m.id === id)?.name ?? "").join(", ")} · {d.endDay}일에 결과가 나온다
            </p>
          ))}
        </section>
      )}

      {dispatchLog.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">파견 보고</h2>
          {dispatchLog.map((r, i) => (
            <article key={`${r.questId}-${r.day}-${i}`} className={`flex flex-col gap-1 rounded-sm border px-3 py-2 text-xs ${r.success ? "border-moss/40" : "border-blood/40"}`}>
              <b className="text-sm">
                {r.day}일 · 「{r.title}」 <span className={r.success ? "text-moss" : "text-blood"}>{r.success ? "성공" : "실패"}</span>
              </b>
              <p className="leading-relaxed text-bone/90">{r.story ?? "…"}</p>
              <p className="text-ash">
                {r.members.map((m) => `${m.name} ${m.outcome === "dead" ? "사망" : m.outcome === "injured" ? "부상" : "무사"}`).join(" · ")}
              </p>
              {r.lines.map((l, j) => (
                <p key={j} className="text-ash">
                  {l}
                </p>
              ))}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function DispatchCard({
  quest: q,
  day,
  free,
  progress,
  onSend,
}: {
  quest: Extract<Quest, { kind: "dispatch" }>;
  day: number;
  free: Merc[];
  progress: Record<string, MercProgress>;
  onSend: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const team: DispatchMember[] = picked.flatMap((id) => {
    const m = free.find((x) => x.id === id);
    const p = progress[id];
    return m && p ? [{ id, level: m.level ?? "bronze", stats: p.stats, personalities: m.traitIds?.personalities ?? [], background: m.traitIds?.background }] : [];
  });
  const ok = picked.length >= q.size[0] && picked.length <= q.size[1];
  const tagName = (id: string) => getTrait(id)?.name ?? id;
  const toggle = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length < q.size[1] ? [...xs, id] : xs));

  return (
    <div className="flex flex-col gap-1.5 rounded-sm border border-edge bg-panel p-3 text-xs">
      <b className="text-sm">{q.title}</b>
      <span>
        위험도 <b className={RISK_STYLE[q.risk]}>{RISK_NAME[q.risk]}</b> · {q.days}일 ({day + q.days}일에 결과) · 권장 {RANKS[q.recommendedGrade].name} ·{" "}
        {q.size[0] === q.size[1] ? `${q.size[0]}명` : `${q.size[0]}~${q.size[1]}명`}
      </span>
      <span className="text-ember">보상 {rewardText(q.reward)}</span>
      {(q.likedBy?.length || q.dislikedBy?.length) && (
        <span className="text-ash">
          {q.likedBy?.length ? `좋아함: ${q.likedBy.map(tagName).join(", ")}` : ""}
          {q.likedBy?.length && q.dislikedBy?.length ? " · " : ""}
          {q.dislikedBy?.length ? `싫어함: ${q.dislikedBy.map(tagName).join(", ")}` : ""}
        </span>
      )}
      {free.length === 0 ? (
        <span className="text-ash">보낼 수 있는 클랜원이 없다.</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {free.map((m) => (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              className={`flex items-center gap-1.5 rounded-sm border px-1.5 py-1 transition-colors ${picked.includes(m.id) ? "border-ember bg-ember/10" : "border-edge hover:border-ember/50"}`}
            >
              <span className="scale-75">
                <Portrait merc={m} size="sm" />
              </span>
              <span className="flex flex-col text-left leading-tight">
                <b>{m.name}</b>
                <span className="text-[10px] text-ash">{m.level ? RANKS[m.level].name : ""}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-ash">{team.length ? `예상 성공 ${pct(dispatchChance(q, team))}` : "보낼 사람을 고른다"}</span>
        <Button
          variant="ember"
          className="!px-2.5 !py-0.5 text-xs"
          disabled={!ok}
          onClick={() => {
            onSend(picked);
            setPicked([]);
          }}
        >
          보낸다
        </Button>
      </div>
    </div>
  );
}
