import { getStage } from "@/game/merc/affinity";
import { GUIDE, MERC_SLOTS } from "@/game/merc/party";
import type { Merc } from "@/game/types";
import { wageOf } from "@/game/merc/wages";
import { xpToNext } from "@/game/merc/growth";
import { CURRENCY } from "@/data/economy";
import type { Stage } from "@/lib/schemas";
import { Button, Portrait } from "@/components/common/parts";
import type { MercProgress } from "@/game/state/state";
import { TownBar } from "./TownBar";

type Props = {
  day: number;
  gold: number;
  /** 고용한 용병 */
  hired: Merc[];
  progress: Record<string, MercProgress>;
  party: string[];
  onToggle: (mercId: string) => void;
  onBack: () => void;
};

const STAGE: Record<Stage, { name: string; style: string }> = {
  hostile: { name: "적대", style: "text-blood" },
  wary: { name: "경계", style: "text-ash" },
  neutral: { name: "중립", style: "text-ash" },
  warm: { name: "호의", style: "text-moss" },
  trusted: { name: "신뢰", style: "text-ember" },
};

/** 숙소: 고용한 용병 중 원정 파티 4명을 정한다 (나중에 보유 명부·대기 회복도 여기서) */
export function InnScreen({ day, gold, hired, progress, party, onToggle, onBack }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="숙소" day={day} gold={gold} onBack={onBack} />
      <header className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">숙소</h1>
          <p className="text-sm text-ash">원정에 데려갈 용병을 정한다. 보수는 원정에서 돌아올 때 함께 간 용병에게만 준다.</p>
        </div>
        <span className="text-sm text-ember">
          원정 파티 {party.length} / {MERC_SLOTS}
        </span>
      </header>

      <div className="flex items-center gap-3 rounded-sm border border-ember/40 bg-panel px-4 py-3">
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
            const stage = STAGE[getStage(p.affinity)];
            return (
              <article
                key={merc.id}
                className={`flex gap-3 rounded-sm border p-3 ${inParty ? "border-ember/60 bg-ember/5" : "border-edge bg-panel"}`}
              >
                <Portrait merc={merc} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold">
                    {merc.name}
                    <span className={`ml-2 text-xs font-normal ${stage.style}`}>{stage.name}</span>
                  </span>
                  <span className="text-xs text-ash">{merc.title}</span>
                  <span className="text-xs text-ash">
                    보수 {CURRENCY} {p.wage ?? wageOf(merc)} / 원정 · 레벨 {p.lv}
                    {xpToNext(p.lv) === null ? " (승급 가능)" : ` · 경험치 ${p.xp}/${xpToNext(p.lv)}`}
                  </span>
                  <Button
                    variant={inParty ? "ember" : "ghost"}
                    className="mt-1 w-fit !px-3 !py-1 text-xs"
                    disabled={!inParty && party.length >= MERC_SLOTS}
                    onClick={() => onToggle(merc.id)}
                  >
                    {inParty ? "원정에서 빼기" : "원정에 데려가기"}
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
