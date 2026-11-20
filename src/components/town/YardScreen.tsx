import { useState } from "react";
import { CURRENCY } from "@/data/economy";
import { STAT_EFFECT, STAT_NAME, STAT_ORDER, TRAINING_COST, TRAINING_POINTS, type StatBlock, type StatKey } from "@/data/growth";
import { canPromote, xpToNext } from "@/game/merc/growth";
import type { Merc } from "@/game/types";
import { Button, Portrait } from "@/components/common/parts";
import type { Passive } from "@/data/passives";
import type { Skill } from "@/data/skills";
import type { MercProgress } from "@/game/state/state";
import { TownBar } from "./TownBar";

type Props = {
  day: number;
  gold: number;
  hired: Merc[];
  progress: Record<string, MercProgress>;
  onTrain: (mercId: string, alloc: StatBlock) => void;
  /** 승급할 수 있는 용병의 후보 (레벨 3, 승급 가능한 등급) */
  promotions: Record<string, PromotionOffer>;
  onPromote: (mercId: string, passive?: string, skill?: string) => void;
  onBack: () => void;
};

export type PromotionOffer = { next: string; cost: number; passives: Passive[]; skills: Skill[]; ultimate?: Skill };

/** 단련장: 레벨업으로 생긴 기회마다 금화를 내고 스탯 3을 직접 배분한다 */
export function YardScreen({ day, gold, hired, progress, onTrain, promotions, onPromote, onBack }: Props) {
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
                  onDone={(passive, skill) => onPromote(merc.id, passive, skill)}
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

/** 승급: 패시브 후보·스킬 후보에서 하나씩 고르고 금화를 낸다 */
function Promotion({ offer, gold, onDone }: { offer: PromotionOffer; gold: number; onDone: (passive?: string, skill?: string) => void }) {
  const [passive, setPassive] = useState<string | undefined>();
  const [skill, setSkill] = useState<string | undefined>();
  const ready = (offer.passives.length === 0 || passive) && (offer.skills.length === 0 || skill) && gold >= offer.cost;
  const option = (on: boolean) =>
    `flex flex-col gap-0.5 rounded-sm border px-3 py-2 text-left text-xs transition-colors ${
      on ? "border-ember bg-ember/10" : "border-edge bg-ink/50 hover:border-ember/50"
    }`;

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-ember/40 bg-ember/5 p-3">
      <p className="text-sm">
        <b className="text-ember">{offer.next}</b>(으)로 승급 · 레벨은 0부터 다시 오르고, 보수도 오른다
      </p>
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
      {offer.skills.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-ash">새 스킬 하나 (장착 칸이 꽉 찼으면 배운 스킬로 보관)</span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {offer.skills.map((sk) => (
              <button key={sk.id} className={option(skill === sk.id)} onClick={() => setSkill(sk.id)}>
                <b>{sk.name}</b>
                <span className="text-bone/70">
                  {sk.description} · 대기 {sk.cooldown}턴
                </span>
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
      <Button variant="ember" className="self-start" disabled={!ready} onClick={() => onDone(passive, skill)}>
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
