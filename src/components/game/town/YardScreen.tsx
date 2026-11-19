import { useState } from "react";
import { CURRENCY } from "@/data/economy";
import { STAT_EFFECT, STAT_NAME, STAT_ORDER, TRAINING_COST, TRAINING_POINTS, type StatBlock, type StatKey } from "@/data/growth";
import { canPromote, xpToNext } from "@/game/growth";
import type { Merc } from "@/game/types";
import { Button, Portrait } from "../parts";
import type { MercProgress } from "../state";
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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
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

      <section className="flex flex-col gap-3">
        {hired.map((merc) => {
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
                    레벨 {p.lv} / 3 ·{" "}
                    {need === null ? <span className="text-ember">승급할 수 있다 (다음 단계에서 열린다)</span> : `경험치 ${p.xp} / ${need}`}
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
function Allocate({ gold, onDone }: { gold: number; onDone: (alloc: StatBlock) => void }) {
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
