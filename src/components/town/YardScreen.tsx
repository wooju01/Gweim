import { useState } from "react";
import { CURRENCY } from "@/data/economy";
import { STAT_EFFECT, STAT_NAME, STAT_ORDER, TRAINING_COST, TRAINING_POINTS, type StatBlock, type StatKey } from "@/data/growth";
import { canPromote, xpToNext } from "@/game/merc/growth";
import type { Merc } from "@/game/types";
import { Button, Portrait } from "@/components/common/parts";
import type { Passive } from "@/data/passives";
import { rankLabel } from "@/data/ranks";
import type { Skill } from "@/data/skills";
import { Element } from "@/lib/schemas";
import type { MercProgress } from "@/game/state/state";
import { TownBar } from "./TownBar";

type Props = {
  day: number;
  gold: number;
  hired: Merc[];
  progress: Record<string, MercProgress>;
  onTrain: (mercId: string, alloc: StatBlock) => void;
  /** 승급할 수 있는 용병의 후보 (등급의 1단계, 더 오를 등급이 있다) */
  promotions: Record<string, PromotionOffer>;
  onPromote: (mercId: string, choice: PromotionPick) => void;
  onBack: () => void;
};

/** 2차 전직 갈래 (화면용) */
export type BranchOption = { id: string; name: string; hint?: string; dualElement?: boolean };
export type PromotionOffer = { next: string; cost: number; passives: Passive[]; branches: BranchOption[]; ultimate?: Skill };
export type PromotionPick = { passive?: string; branch?: string; elements?: Element[] };

const ELEMENT_NAME: Record<Element, string> = { fire: "불", water: "물", wind: "바람", earth: "흙" };

/** 단련장: 레벨업으로 생긴 기회마다 금화를 내고 스탯 3을 직접 배분한다 */
export function YardScreen({ day, gold, hired, progress, onTrain, promotions, onPromote, onBack }: Props) {
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
            const ready = p.trainable > 0 || !!promotions[merc.id];
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
                  {ready && <span className="text-[11px] text-ember">{promotions[merc.id] ? "승급 가능" : `단련 ${p.trainable}번`}</span>}
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
                    {need === null ? (
                      <span className="text-ember">{promotions[merc.id] ? "승급할 수 있다" : "더 오를 등급이 없다"}</span>
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
              {promotions[merc.id] && (
                <Promotion
                  offer={promotions[merc.id]}
                  gold={gold}
                  onDone={(choice) => onPromote(merc.id, choice)}
                />
              )}
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

/** 승급: 패시브 후보에서 하나, 금으로 오를 때는 전직 갈래(원소술사면 원소 둘)도 고르고 금화를 낸다 */
function Promotion({ offer, gold, onDone }: { offer: PromotionOffer; gold: number; onDone: (choice: PromotionPick) => void }) {
  const [passive, setPassive] = useState<string | undefined>();
  const [branch, setBranch] = useState<string | undefined>();
  const [elements, setElements] = useState<Element[]>([]);
  const dual = offer.branches.find((b) => b.id === branch)?.dualElement ?? false;
  const ready =
    (offer.passives.length === 0 || passive) && (offer.branches.length === 0 || branch) && (!dual || elements.length === 2) && gold >= offer.cost;
  const option = (on: boolean) =>
    `flex flex-col gap-0.5 rounded-sm border px-3 py-2 text-left text-xs transition-colors ${
      on ? "border-ember bg-ember/10" : "border-edge bg-ink/50 hover:border-ember/50"
    }`;
  const toggleElement = (e: Element) =>
    setElements((xs) => (xs.includes(e) ? xs.filter((x) => x !== e) : xs.length < 2 ? [...xs, e] : xs));

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-ember/40 bg-ember/5 p-3">
      <p className="text-sm">
        <b className="text-ember">{offer.next}</b>(으)로 승급 · 3단계부터 다시 오르고, 보수도 오른다
      </p>
      {offer.branches.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-ash">2차 전직 (한 번 고르면 바꿀 수 없다)</span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {offer.branches.map((b) => (
              <button key={b.id} className={option(branch === b.id)} onClick={() => setBranch(b.id)}>
                <b>{b.name}</b>
                {b.hint && <span className="text-bone/70">{b.hint}</span>}
              </button>
            ))}
          </div>
          {dual && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-ash">함께 쓸 원소 둘:</span>
              {Element.options.map((e) => (
                <button key={e} className={option(elements.includes(e))} onClick={() => toggleElement(e)}>
                  {ELEMENT_NAME[e]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {offer.passives.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-ash">새 패시브 하나</span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {offer.passives.map((ps) => (
              <button key={ps.id} className={option(passive === ps.id)} onClick={() => setPassive(ps.id)}>
                <b>✦ {ps.name}</b>
                <span className="text-bone/70">{ps.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {offer.ultimate && (
        <p className="text-xs">
          궁극기가 열린다: <b className="text-ember">{offer.ultimate.name}</b>{" "}
          <span className="text-bone/70">— {offer.ultimate.description} (전투당 1번)</span>
        </p>
      )}
      <Button
        variant="ember"
        className="self-start"
        disabled={!ready}
        onClick={() => onDone({ passive, branch, elements: dual ? elements : undefined })}
      >
        {gold < offer.cost ? `${CURRENCY}이 모자라다 (${offer.cost})` : `${CURRENCY} ${offer.cost} · 승급한다`}
      </Button>
    </div>
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
