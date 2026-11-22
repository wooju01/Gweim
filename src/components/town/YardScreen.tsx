import { useState } from "react";
import { CURRENCY } from "@/data/economy";
import { STAT_EFFECT, STAT_NAME, STAT_ORDER, TRAINING_COST, TRAINING_POINTS, nextPointGain, type CurveStat, type StatBlock, type StatKey } from "@/data/growth";
import { JOB_STATS } from "@/data/combat";
import { trinketsBonus } from "@/data/trinkets";
import { canPromote, xpToNext } from "@/game/merc/growth";
import type { Merc } from "@/game/types";
import { Button, Portrait } from "@/components/common/parts";
import { rankLabel } from "@/data/ranks";
import type { MercProgress } from "@/game/state/state";
import { TownBar } from "./TownBar";

type Props = {
  day: number;
  gold: number;
  hired: Merc[];
  progress: Record<string, MercProgress>;
  onTrain: (mercId: string, alloc: StatBlock) => void;
  onBack: () => void;
};

/** 단련장: 레벨업으로 생긴 기회마다 금화를 내고 스탯 3을 직접 배분한다 */
export function YardScreen({ day, gold, hired, progress, onTrain, onBack }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  /** 보고 있는 용병 */
  const [viewId, setViewId] = useState<string | null>(hired[0]?.id ?? null);
  const shown = hired.filter((m) => m.id === (hired.some((h) => h.id === viewId) ? viewId : hired[0]?.id));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="단련장" day={day} gold={gold} onBack={onBack} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">단련장</h1>
        <p className="text-sm text-ash">
          레벨이 오를 때마다 단련 기회가 한 번 생긴다. {CURRENCY} {TRAINING_COST}을(를) 내면 스탯 {TRAINING_POINTS}을(를) 원하는 대로 나눠 줄 수
          있다. 레벨업 때 붙는 스탯은 직업에 따라 자동으로 오른다.
        </p>
      </header>

      {hired.length === 0 && (
        <p className="rounded-sm border border-dashed border-edge px-4 py-10 text-center text-sm text-ash">고용한 용병이 없다.</p>
      )}

      {hired.length > 0 && (
        <nav aria-label="용병" className="flex flex-wrap gap-2">
          {hired.map((merc) => {
            const p = progress[merc.id];
            const ready = p.trainable > 0 || canPromote(p);
            return (
              <button
                key={merc.id}
                onClick={() => {
                  setViewId(merc.id);
                  setPicked(null);
                }}
                className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-sm transition-colors ${
                  shown[0]?.id === merc.id ? "border-ember bg-ember/10" : "border-edge bg-panel hover:border-ember/50"
                }`}
              >
                <Portrait merc={merc} size="sm" />
                <span className="flex flex-col leading-tight">
                  <span className="font-bold">{merc.name}</span>
                  <span className="text-[11px] text-ash">{merc.tags?.slice(0, 2).join(" · ")}</span>
                  {ready && <span className="text-[11px] text-ember">{p.trainable > 0 ? `단련 ${p.trainable}번` : "승급은 길드 창구"}</span>}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      <section className="flex flex-col gap-3">
        {shown.map((merc) => {
          const p = progress[merc.id];
          const need = xpToNext(p.lv);
          return (
            <article key={merc.id} className="flex flex-col gap-3 rounded-sm border border-edge bg-panel p-4">
              <div className="flex items-start gap-3">
                <Portrait merc={merc} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold">
                    {merc.name} <span className="text-xs font-normal text-ash">{merc.title}</span>
                  </span>
                  <span className="text-xs text-ash">
                    {merc.level ? rankLabel(merc.level, p.lv) : `레벨 ${p.lv}`} ·{" "}
                    {p.lv >= 2 ? (
                      <span className="text-ember">
                        등급의 마지막 단계 · 승급용 경험치 {p.xp} / {need}
                        {p.xp >= need ? " · 승급은 길드 창구에서" : ""}
                      </span>
                    ) : (
                      `경험치 ${p.xp} / ${need}`
                    )}
                  </span>
                  <span className="text-xs text-bone/80">
                    {STAT_ORDER.filter((k) => p.stats[k]).map((k) => `${STAT_NAME[k]} +${p.stats[k]}`).join(" · ") || "아직 쌓인 스탯이 없다"}
                  </span>
                </div>
                <Button
                  variant={picked === merc.id ? "ember" : "ghost"}
                  className="!px-3 !py-1 text-xs"
                  disabled={p.trainable <= 0}
                  onClick={() => setPicked(picked === merc.id ? null : merc.id)}
                >
                  {p.trainable > 0 ? `단련하기 (${p.trainable}번)` : canPromote(p) ? "기회 없음" : "레벨업하면 열린다"}
                </Button>
              </div>
              {picked === merc.id && p.trainable > 0 && (
                <Allocate
                  gold={gold}
                  points={{
                    defense: (JOB_STATS[merc.job ?? ""]?.defense ?? 0) + (p.stats.defense ?? 0) + (trinketsBonus(p.trinkets).defense ?? 0),
                    evade: p.stats.evade ?? 0,
                    crit: p.stats.crit ?? 0,
                  }}
                  onDone={(alloc) => {
                    onTrain(merc.id, alloc);
                    setPicked(null);
                  }}
                />
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}

/** 스탯 3점 배분 */
function Allocate({ gold, points, onDone }: { gold: number; points: Record<CurveStat, number>; onDone: (alloc: StatBlock) => void }) {
  const [alloc, setAlloc] = useState<StatBlock>({});
  const used = STAT_ORDER.reduce((s, k) => s + (alloc[k] ?? 0), 0);
  const left = TRAINING_POINTS - used;
  const change = (k: StatKey, d: number) => setAlloc((a) => ({ ...a, [k]: Math.max(0, (a[k] ?? 0) + d) }));

  return (
    <div className="flex flex-col gap-2 border-t border-edge pt-3">
      <p className="text-xs text-ash">남은 포인트 {left} / {TRAINING_POINTS}</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {STAT_ORDER.map((k) => (
          <div key={k} className="flex items-center justify-between gap-2 rounded-sm bg-ink/50 px-2.5 py-1.5 text-xs">
            <span>
              <b>{STAT_NAME[k]}</b> <span className="text-ash">{STAT_EFFECT[k]}</span>
              {(k === "defense" || k === "evade" || k === "crit") && (
                <span className="ml-1 text-ember">· 다음 1점 +{(nextPointGain(k, points[k] + (alloc[k] ?? 0)) * 100).toFixed(1)}%</span>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <Button className="!px-2 !py-0 text-xs" disabled={!alloc[k]} onClick={() => change(k, -1)}>
                −
              </Button>
              <span className="w-4 text-center text-ember">{alloc[k] ?? 0}</span>
              <Button className="!px-2 !py-0 text-xs" disabled={left <= 0} onClick={() => change(k, 1)}>
                +
              </Button>
            </span>
          </div>
        ))}
      </div>
      <Button variant="ember" className="self-start" disabled={left !== 0 || gold < TRAINING_COST} onClick={() => onDone(alloc)}>
        {gold < TRAINING_COST ? `${CURRENCY}이 모자라다` : `${CURRENCY} ${TRAINING_COST} · 단련한다`}
      </Button>
    </div>
  );
}
