import { useState } from "react";
import { CURRENCY } from "@/data/economy";
import { getSalvage } from "@/data/loot";
import { getMonster } from "@/data/monsters";
import { RISK_NAME, QUEST_INFO, getQuest, type DirectQuest, type DispatchQuest, type Objective, type QuestKind, type QuestReward, type Reward } from "@/data/quests";
import { RANKS, stageName } from "@/data/ranks";
import { getRegion } from "@/data/regions";
import { SUPPLY } from "@/data/combat";
import { getTrinket } from "@/data/trinkets";
import { fameName, FAME_TIERS } from "@/data/fame";
import { getTrait } from "@/data/traits";
import { dispatchChance, isDirect, rewardBlocked, type DispatchMember } from "@/game/quests";
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
  fame: number;
  /** 지금 받아 둘 수 있는 직접 의뢰 수 (명성 단계별) */
  slots: number;
  questAccepted: Record<string, number>;
  pendingRewards: string[];
  weeklyRewards: { book: boolean; relic: boolean };
  infos: string[];
  salvage: Record<string, number>;
  onAccept: (questId: string) => void;
  onAbandon: (questId: string) => void;
  onDeliver: (questId: string) => void;
  onClaim: (questId: string, choice: 0 | 1) => void;
  onDispatch: (questId: string, members: string[]) => void;
  onBack: () => void;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const RISK_STYLE = { low: "text-moss", mid: "text-ember", high: "text-blood" } as const;
const KIND_NAME: Record<QuestKind, string> = {
  hunt: "토벌",
  collect: "납품",
  explore: "탐사",
  challenge: "도전",
  rescue: "구출",
  dispatch: "파견",
  named: "지명",
  promotion: "승급 시험",
};

export function objectiveText(o: Objective): string {
  const mon = (id: string) => getMonster(id)?.name ?? id;
  const item = (id: string) => getSalvage(id)?.name ?? id;
  switch (o.type) {
    case "killBoss":
      return `${mon(o.monsterId)} 처치`;
    case "killAnyBoss":
      return `${o.monsterIds.map(mon).join("·")} 중 하나 처치`;
    case "killElite":
      return `정예 ${mon(o.monsterId)} ${o.count}마리 처치`;
    case "killCount":
      return `${mon(o.monsterId)} ${o.count}마리 처치`;
    case "collect":
      return `${item(o.itemId)} ${o.count}개 가져오기`;
    case "deliver":
      return `${item(o.itemId)} ${o.count}개 납품 (게시판에서 낸다)`;
    case "reach":
      return `${getRegion(o.regionId)?.name ?? o.regionId} ${o.goal ? "끝 칸까지 가기" : "들어서기"}`;
    case "killWithCondition":
      return `${o.monsterIds.map(mon).join("·")}${o.monsterIds.length > 1 ? " 중 하나" : ""} 처치${o.noJob ? ` (${getTrait(o.noJob)?.name ?? o.noJob} 없이)` : ""}${o.noDowned ? " (아무도 쓰러지지 않고)" : ""}`;
    case "rescue":
      return `${getRegion(o.regionId)?.name ?? o.regionId}에서 구출 (의뢰를 받으면 사건이 나온다)`;
  }
}

/** 보상 하나의 이름 */
export function rewardLabel(r: QuestReward): string {
  switch (r.type) {
    case "gold":
      return `${CURRENCY} ${r.amount}`;
    case "material":
      return `${getSalvage(r.itemId)?.name ?? r.itemId} ${r.count}`;
    case "shard":
      return `기술 파편 ${r.count}`;
    case "tacticBook":
      return `전술 교본 ${r.count} (주 1회)`;
    case "relic":
      return r.relicId === "random" ? "종족 유물 무작위 (주 1회)" : `종족 유물: ${getSalvage(r.relicId)?.name ?? r.relicId} (주 1회)`;
    case "consumable":
      return `${SUPPLY[r.itemId].name} ${r.count}`;
    case "accessory":
      return `장신구 「${getTrinket(r.accessoryId)?.name ?? r.accessoryId}」`;
    case "recruit":
      return "용병 합류 (동3, 고용비 없음)";
    case "info":
      return `정보: ${QUEST_INFO[r.infoId]?.title ?? r.infoId}`;
    case "discount":
      return `대장간 이용료 할인 ${r.days}일`;
    case "fame":
      return `명성 +${r.amount}`;
  }
}

function rewardText(r: Reward): string {
  return [`${CURRENCY} ${r.gold}`, ...Object.entries(r.salvage ?? {}).map(([id, n]) => `${getSalvage(id)?.name ?? id} ${n}`), ...(r.fame ? [`명성 +${r.fame}`] : [])].join(" · ");
}

/** 직접 의뢰 보상 줄: "A / B 중 하나" 또는 고정 */
function questRewardText(q: DirectQuest): string {
  if (q.rewards.choices) return q.rewards.choices.map(rewardLabel).join("  /  ");
  return (q.rewards.fixed ?? []).map(rewardLabel).join(" · ");
}

/** 의뢰 카드 머리: 종류, 중요 표시, 의뢰인, 권장 등급 */
function QuestHead({ q }: { q: DirectQuest }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-sm bg-edge/60 px-1 text-[10px] text-bone">{KIND_NAME[q.kind]}</span>
        {q.important && <span className="text-ember" title="중요 의뢰 (장신구 보상)">★</span>}
        <b className="text-sm">{q.title}</b>
      </span>
      <span className="text-ash">
        {q.client}
        {q.recommended ? ` · 권장 ${stageName(q.recommended)}` : ""}
      </span>
      {q.blurb && <span className="italic text-bone/70">“{q.blurb}”</span>}
    </span>
  );
}

/** 게시판·주점: 직접 의뢰를 받고, 보상을 고르고, 재료를 납품하고, 클랜원을 파견 의뢰에 보낸다 */
export function BoardScreen(p: Props) {
  const { day, gold, board, activeQuests, dispatches, dispatchLog, members, progress, onAccept, onAbandon, onDispatch, onBack } = p;
  const quests = board.flatMap((id) => getQuest(id) ?? []);
  const direct = quests.filter(isDirect);
  const dispatch = quests.filter((q): q is DispatchQuest => q.kind === "dispatch");
  const free = members.filter((m) => (progress[m.id]?.busyUntilDay ?? 0) <= day);
  const full = activeQuests.length >= p.slots;
  const nextTier = FAME_TIERS.find((t) => t.min > p.fame);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="게시판 · 주점" day={day} gold={gold} onBack={onBack} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">게시판 · 주점</h1>
        <p className="text-sm text-ash">
          게시판은 원정에서 돌아올 때마다 새로 붙는다. 의뢰를 마치면 보상 두 가지 중 하나를 고른다. 기한을 넘기거나 포기하면 명성이 깎인다.
        </p>
        <p className="text-sm">
          명성 <b className="text-ember">{fameName(p.fame)}</b> ({p.fame}
          {nextTier ? ` / 다음 단계 ${nextTier.min}` : ""}) · 동시에 받을 수 있는 의뢰 {p.slots}개
        </p>
      </header>

      {p.pendingRewards.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-ember">보상 고르기</h2>
          {p.pendingRewards.map((id) => {
            const q = getQuest(id);
            if (!isDirect(q) || !q.rewards.choices) return null;
            return (
              <div key={id} className="flex flex-col gap-2 rounded-sm border border-ember/60 bg-ember/5 p-3 text-xs">
                <b className="text-sm">「{q.title}」 완료</b>
                <div className="flex flex-wrap gap-2">
                  {q.rewards.choices.map((r, i) => {
                    const blocked = rewardBlocked(r, p.weeklyRewards);
                    return (
                      <Button key={i} variant="ember" className="!px-3 !py-1 text-xs" disabled={!!blocked} title={blocked ?? undefined} onClick={() => p.onClaim(id, i as 0 | 1)}>
                        {rewardLabel(r)}
                        {blocked ? ` (${blocked})` : ""}
                      </Button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">
          받은 의뢰{" "}
          <span className="text-xs font-normal text-ash">
            {activeQuests.length} / {p.slots} · 목표를 이루고 살아 돌아오면 마친다
          </span>
        </h2>
        {activeQuests.length === 0 ? (
          <p className="text-xs text-ash">받은 의뢰가 없다.</p>
        ) : (
          activeQuests.map((id) => {
            const q = getQuest(id);
            if (!isDirect(q)) return null;
            const until = q.deadlineDays !== undefined ? (p.questAccepted[id] ?? day) + q.deadlineDays : null;
            const deliver = q.objective.type === "deliver" ? q.objective : null;
            const have = deliver ? (p.salvage[deliver.itemId] ?? 0) : 0;
            return (
              <div key={id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-ember/40 bg-panel px-3 py-2 text-xs">
                <span className="flex flex-col gap-0.5">
                  <QuestHead q={q} />
                  <span className="text-bone/80">{objectiveText(q.objective)}</span>
                  <span className="text-ember">보상 {questRewardText(q)}</span>
                  {until !== null && <span className={until - day <= 1 ? "text-blood" : "text-ash"}>기한 {until}일까지 ({Math.max(0, until - day)}일 남음)</span>}
                </span>
                <span className="flex gap-1.5">
                  {deliver && (
                    <Button variant="ember" className="!px-2.5 !py-0.5 text-xs" disabled={have < deliver.count} onClick={() => p.onDeliver(id)}>
                      납품 ({have}/{deliver.count})
                    </Button>
                  )}
                  <Button className="!px-2.5 !py-0.5 text-xs" onClick={() => onAbandon(id)} title="포기하면 명성이 깎인다">
                    포기
                  </Button>
                </span>
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
            <div key={q.id} className={`flex flex-col gap-1 rounded-sm border bg-panel p-3 text-xs ${q.important ? "border-ember/60" : "border-edge"}`}>
              <QuestHead q={q} />
              <span className="text-bone/80">{objectiveText(q.objective)}</span>
              <span className="text-ember">보상 {questRewardText(q)}</span>
              <span className="text-ash">{q.deadlineDays !== undefined ? `기한 ${q.deadlineDays}일` : "기한 없음"}</span>
              <Button className="mt-1 self-start !px-2.5 !py-0.5 text-xs" disabled={full} onClick={() => onAccept(q.id)}>
                {full ? "더 받을 수 없다" : "받는다"}
              </Button>
            </div>
          ))}
        </div>
      </section>

      {p.infos.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">알아낸 것</h2>
          {p.infos.map((id) => (
            <p key={id} className="rounded-sm border border-edge bg-panel px-3 py-2 text-xs leading-relaxed">
              <b>{QUEST_INFO[id]?.title}</b> · <span className="text-bone/80">{QUEST_INFO[id]?.text}</span>
            </p>
          ))}
        </section>
      )}

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
  quest: DispatchQuest;
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
