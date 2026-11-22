import { CURRENCY } from "@/data/economy";
import { getSalvage } from "@/data/loot";
import { JOBS } from "@/data/traits";
import { FORGEABLE, FORGE_DISCOUNT, SURVIVAL_LIMIT, TRINKET_MAX_LV, TRINKET_SLOTS, bonusText, canWear, forgeCost as baseCost, getTrinket, scaleBonus, tierFits, tierForgeable, trinketFits, trinketMaxLv, trinketText, type OwnedTrinket, type Trinket } from "@/data/trinkets";
import { getBranch } from "@/data/jobs";
import { RANKS } from "@/data/ranks";
import { FORGE_TIER } from "@/data/facilities";
import type { Merc } from "@/game/types";
import { Button, Portrait } from "@/components/common/parts";
import type { MercProgress } from "@/game/state/state";
import { TownBar } from "./TownBar";

type Props = {
  day: number;
  gold: number;
  hired: Merc[];
  /** 대장간 시설 레벨 (만들 수 있는 장비 등급: 0 동, 1 은, 2 금 …) */
  forgeLevel: number;
  progress: Record<string, MercProgress>;
  salvage: Record<string, number>;
  /** 보관함 (아무도 끼지 않은 장신구) */
  trinkets: OwnedTrinket[];
  onForge: (trinket: string) => void;
  onUpgrade: (where: { mercId?: string; slot?: number; index?: number }) => void;
  onEquip: (mercId: string, index: number) => void;
  onUnequip: (mercId: string, slot: number) => void;
  /** 대장간 할인 중 (의뢰 보상) */
  discounted?: boolean;
  onBack: () => void;
};

const jobName = (job: string) => (job === "any" ? "누구나" : (JOBS.find((t) => t.id === job)?.name ?? job));

/** 장신구 효과 한 줄 (단계 반영) */
const trinketLine = (o: OwnedTrinket): string => trinketText(o);

const KIND_NAME = { job: "직업", survival: "생존", quest: "의뢰" } as const;

/** 2차 갈래 이름 (성녀·성자처럼 성별이 갈리면 둘 다) */
function branchName(job: string, build: string): string {
  const n = getBranch(job, build)?.name;
  return !n ? build : typeof n === "string" ? n : `${n.female}·${n.male}`;
}

/** 대장간: 유실물로 직업 전용 장신구를 만들고, 강화하고, 용병에게 낀다 */
export function ForgeScreen({ day, gold, hired, forgeLevel, progress, salvage, trinkets, onForge, onUpgrade, onEquip, onUnequip, discounted, onBack }: Props) {
  const forgeCost = (t: Trinket, lv: number) => {
    const c = baseCost(t, lv);
    return discounted ? { ...c, gold: Math.round(c.gold * (1 - FORGE_DISCOUNT)) } : c;
  };
  const payable = (c: { gold: number; salvage: Record<string, number> }) =>
    gold >= c.gold && Object.entries(c.salvage).every(([id, n]) => (salvage[id] ?? 0) >= n);
  const costText = (c: { gold: number; salvage: Record<string, number> }) =>
    `${CURRENCY} ${c.gold} · ${Object.entries(c.salvage)
      .map(([id, n]) => `${getSalvage(id)?.name ?? id} ${salvage[id] ?? 0}/${n}`)
      .join(", ")}`;

  /** 강화 버튼 (최대 단계면 표시만) */
  const upgrade = (owned: OwnedTrinket, t: Trinket, where: { mercId?: string; slot?: number; index?: number }) => {
    if (owned.lv >= trinketMaxLv(t)) return <span className="text-[11px] text-ember">{t.quest ? "의뢰 장신구" : "최대 단계"}</span>;
    const cost = forgeCost(t, owned.lv + 1);
    return (
      <Button className="!px-2.5 !py-0.5 text-xs" disabled={!payable(cost)} onClick={() => onUpgrade(where)} title={costText(cost)}>
        강화 → {owned.lv + 1}단계 <span className="text-ash">({costText(cost)})</span>
      </Button>
    );
  };
  const jobsHired = new Set(hired.map((m) => m.job).filter(Boolean));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="대장간" day={day} gold={gold} onBack={onBack} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">대장간</h1>
        <p className="text-sm text-ash">
          유실물로 직업 장신구와 생존 장신구를 만든다. 지금 만들 수 있는 장비 등급: {RANKS[FORGE_TIER[forgeLevel] ?? "bronze"].name}까지 (대장간 시설 레벨로 올라간다). 장비 등급은 용병 등급 이하만 낄 수 있다. 용병마다 두 개까지 낄 수 있고 (같은 장신구 둘은 안 되고, 생존 장신구는 {SURVIVAL_LIMIT}개까지), 강화는 실패하지 않는다 ({TRINKET_MAX_LV}단계까지).{discounted ? ` 지금은 이용료 ${Math.round(FORGE_DISCOUNT * 100)}% 할인 중.` : ""} 장신구를 낀 용병이
          죽으면 그 전투를 이겼을 때만 거둬 올 수 있다.
        </p>
      </header>

      <section aria-label="용병 장신구" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
        <h2 className="font-bold">용병 장신구</h2>
        {hired.length === 0 && <p className="text-sm text-ash">고용한 용병이 없다.</p>}
        {hired.map((m) => {
          const worn = progress[m.id]?.trinkets ?? [];
          const full = worn.length >= TRINKET_SLOTS;
          const fits = trinkets
            .map((o, i) => ({ o, i }))
            .filter(({ o }) => trinketFits(getTrinket(o.id), m.job) && tierFits(getTrinket(o.id), m.level) && canWear(getTrinket(o.id), full ? worn.slice(1) : worn));
          return (
            <div key={m.id} className="flex flex-col gap-2 border-t border-edge/60 pt-2">
              <div className="flex items-start gap-3">
                <Portrait merc={m} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
                  <span className="text-sm font-bold">
                    {m.name} <span className="text-xs font-normal text-ash">{m.job ? jobName(m.job) : ""}</span>{" "}
                    <span className="text-xs font-normal text-ash">
                      · 장신구 {worn.length} / {TRINKET_SLOTS}
                    </span>
                  </span>
                  {worn.length === 0 && <span className="text-ash">끼고 있는 장신구가 없다</span>}
                  {worn.map((owned, slot) => {
                    const t = getTrinket(owned.id);
                    return (
                      t && (
                        <div key={slot} className="flex flex-wrap items-center justify-between gap-1.5">
                          <span>
                            <b className="text-ember">
                              {t.name} {owned.lv}단계
                            </b>{" "}
                            <span className="text-bone/70">{trinketLine(owned)}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {upgrade(owned, t, { mercId: m.id, slot })}
                            <Button className="!px-2.5 !py-0.5 text-xs" onClick={() => onUnequip(m.id, slot)}>
                              빼기
                            </Button>
                          </span>
                        </div>
                      )
                    );
                  })}
                </div>
              </div>
              {fits.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-12">
                  {fits.map(({ o, i }) => (
                    <Button key={i} className="!px-2.5 !py-0.5 text-xs" onClick={() => onEquip(m.id, i)}>
                      {getTrinket(o.id)!.name} {o.lv}단계 {full ? "로 첫 칸 바꿔 끼기" : "끼기"}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section aria-label="보관함" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
        <h2 className="font-bold">보관함</h2>
        {trinkets.length === 0 ? (
          <p className="text-sm text-ash">보관 중인 장신구가 없다. 만들거나, 던전의 보물 칸에서 드물게 찾는다.</p>
        ) : (
          trinkets.map((o, i) => {
            const t = getTrinket(o.id);
            return (
              t && (
                <div key={i} className="flex items-center justify-between gap-3 border-t border-edge/60 pt-2 text-xs">
                  <span>
                    <b>
                      {t.name} {o.lv}단계
                    </b>{" "}
                    <span className="text-ash">{jobName(t.job)}{t.job === "any" ? "" : " 전용"}</span> · <span className="text-bone/70">{trinketLine(o)}</span>
                  </span>
                  {upgrade(o, t, { index: i })}
                </div>
              )
            );
          })
        )}
      </section>

      <section aria-label="제작" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
        <h2 className="font-bold">
          제작 <span className="ml-1 text-xs font-normal text-ash">1단계로 만들어 보관함에 넣는다</span>
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {[...FORGEABLE().filter((t) => tierForgeable(t, forgeLevel))]
            .sort((a, b) => Number(a.kind === "job") - Number(b.kind === "job") || Number(jobsHired.has(b.job) || b.job === "any") - Number(jobsHired.has(a.job) || a.job === "any"))
            .map((t) => {
              const cost = forgeCost(t, 1);
              return (
                <div
                  key={t.id}
                  className={`flex flex-col gap-1 rounded-sm px-3 py-2 text-xs ${jobsHired.has(t.job) || t.job === "any" ? "bg-ember/5" : "bg-ink/50 opacity-80"}`}
                >
                  <span>
                    <b>{t.name}</b>{" "}
                    <span className="text-ash">
                      {RANKS[t.tier].name} 등급 · {KIND_NAME[t.kind]} · {t.job === "any" ? "누구나" : `${jobName(t.job)} 전용`}
                      {t.build ? ` · ${branchName(t.job, t.build)}` : ""}
                    </span>
                  </span>
                  <span className="text-bone/70">
                    {[1, 2, 3].map((lv) => `${lv}단계: ${t.levels ? bonusText(t.levels[lv - 1]) : bonusText(scaleBonus(t.effect, lv))}`).join(" / ")}
                  </span>
                  <span className="text-ash">{t.description}</span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-ash">{costText(cost)}</span>
                    <Button className="shrink-0 !px-2.5 !py-0.5 text-xs" disabled={!payable(cost)} onClick={() => onForge(t.id)}>
                      만든다
                    </Button>
                  </span>
                </div>
              );
            })}
        </div>
      </section>
    </main>
  );
}
