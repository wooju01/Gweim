// 클랜 시설: 숙소 3칸, 클랜 본부 7칸. 짓기·레벨 올리기, 위령비 유산 전수
import { CURRENCY } from "@/data/economy";
import { FACILITIES, MEMORIAL, type FacilityId, type FacilityLevels } from "@/data/facilities";
import { getFragment } from "@/data/fragments";
import { RANKS } from "@/data/ranks";
import type { Fallen } from "@/game/state/state";
import type { Merc } from "@/game/types";
import { Button } from "@/components/common/parts";

type Props = {
  levels: FacilityLevels;
  slots: { used: number; max: number };
  /** 시설마다 짓거나 올릴 수 없는 이유 (할 수 있으면 null) */
  blocks: Record<FacilityId, string | null>;
  onBuild: (id: FacilityId) => void;
  /** 위령비 유산 */
  memorial: Fallen[];
  hired: Merc[];
  onInherit: (fallenId: string, piece: string, mercId: string) => void;
};

export function FacilityPanel({ levels, slots, blocks, onBuild, memorial, hired, onInherit }: Props) {
  const memorialLv = levels.memorial ?? 0;
  const allowed = MEMORIAL.legacies[memorialLv - 1] ?? 0;
  // 죽은 용병 1명마다 allowed개까지
  const legacies = memorial.filter((f) => (f.legacyTaken?.length ?? 0) < allowed && (f.legacy ?? []).some((x) => !f.legacyTaken?.includes(x.id)));
  return (
    <section aria-label="시설" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel px-4 py-3">
      <p className="text-sm">
        <b>시설</b>
        <span className="ml-2 text-xs text-ash">
          칸 {slots.used} / {slots.max} · 새로 지으면 칸을 쓰고, 레벨 올리기는 칸을 쓰지 않는다 · 2레벨은 길드 은, 3레벨은 길드 금부터
        </span>
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {FACILITIES.map((f) => {
          const lv = levels[f.id] ?? 0;
          const max = lv >= f.levels.length;
          const block = blocks[f.id];
          return (
            <div key={f.id} className={`flex flex-col gap-1 rounded-sm px-3 py-2 text-xs ${lv > 0 ? "bg-ember/5" : "bg-ink/50"}`}>
              <span className="flex items-center justify-between gap-2">
                <b>
                  {f.name} <span className="font-normal text-ash">{lv > 0 ? `${lv}레벨` : "없음"}</span>
                </b>
                {!max && (
                  <Button className="!px-2.5 !py-0.5 text-xs" disabled={!!block} onClick={() => onBuild(f.id)} title={block ?? undefined}>
                    {lv === 0 ? "짓기" : `${lv + 1}레벨로`} · {CURRENCY} {f.cost[lv]}
                    {f.grade[lv] !== "bronze" ? ` · 길드 ${RANKS[f.grade[lv]].name}` : ""}
                  </Button>
                )}
              </span>
              {lv > 0 && <span className="text-bone/80">지금: {f.levels[lv - 1]}</span>}
              {!max && <span className="text-ash">다음: {f.levels[lv]}</span>}
              {block && !max && <span className="text-[11px] text-blood">{block}</span>}
            </div>
          );
        })}
      </div>
      {memorialLv >= 2 && (
        <div className="flex flex-col gap-1.5 border-t border-edge/60 pt-2 text-xs">
          <p>
            <b>위령비 유산</b>{" "}
            <span className="text-ash">
              죽은 용병 1명마다 강화된 부 조각 {allowed}개까지 같은 직업 용병에게 그 레벨 그대로 전수한다
            </span>
          </p>
          {legacies.length === 0 && <p className="text-ash">이어받을 유산이 없다.</p>}
          {legacies.map((f) => {
              const heirs = hired.filter((m) => m.job === f.job);
              return (
                <div key={f.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-bone/80">
                    {f.name} ({f.legacyTaken?.length ?? 0} / {allowed}):
                  </span>
                  {f.legacy!.filter((piece) => !f.legacyTaken?.includes(piece.id)).map((piece) =>
                    heirs.length === 0 ? (
                      <span key={piece.id} className="text-ash">
                        {getFragment(piece.id)?.name ?? piece.id} Lv{piece.lv} (같은 직업 용병이 없다)
                      </span>
                    ) : (
                      heirs.map((m) => (
                        <Button key={`${piece.id}-${m.id}`} className="!px-2 !py-0.5 text-[11px]" onClick={() => onInherit(f.id, piece.id, m.id)}>
                          {getFragment(piece.id)?.name ?? piece.id} Lv{piece.lv} → {m.name}
                        </Button>
                      ))
                    ),
                  )}
                </div>
              );
            })}
        </div>
      )}
    </section>
  );
}
