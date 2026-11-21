// 용병 정보 (마을에서 용병을 누르면 뜨는 창). 능력치·저항·패시브를 보고, 스킬과 장신구를 바로 바꿔 낀다.
import { useEffect } from "react";
import { STAT_NAME, STAT_ORDER, type StatKey } from "@/data/growth";
import { getPassive } from "@/data/passives";
import { RANKS, rankLabel } from "@/data/ranks";
import { TRINKET_SLOTS, getTrinket, trinketFits, trinketStats, trinketsBonus, trinketsStats, type OwnedTrinket } from "@/data/trinkets";
import { CURRENCY } from "@/data/economy";
import { mercUnit, resistOf, unitStats } from "@/game/combat/engine";
import { getStage } from "@/game/merc/affinity";
import { addStats, statLine, xpToNext } from "@/game/merc/growth";
import { wageOf } from "@/game/merc/wages";
import type { Merc } from "@/game/types";
import type { MercProgress } from "@/game/state/state";
import type { MercSeed, Stage } from "@/lib/schemas";
import { Button, Portrait } from "@/components/common/parts";
import { Loadout } from "./SkillHallScreen";

const STAGE: Record<Stage, { name: string; style: string }> = {
  hostile: { name: "적대", style: "text-blood" },
  wary: { name: "경계", style: "text-ash" },
  neutral: { name: "중립", style: "text-ash" },
  warm: { name: "호의", style: "text-moss" },
  trusted: { name: "신뢰", style: "text-ember" },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

type Props = {
  merc: Merc;
  /** 랜덤 용병만 있다 (스킬을 바꿀 수 있다) */
  seed?: MercSeed;
  progress: MercProgress;
  /** 대장간 보관함 (이 용병 직업의 장신구만 낄 수 있다) */
  trinkets: OwnedTrinket[];
  onClose: () => void;
  onSwap: (change: { equip?: string; unequip?: string }) => void;
  onForget: (key: string) => void;
  /** 보관함의 index번 장신구를 낀다 */
  onEquipTrinket: (index: number) => void;
  /** slot번 칸의 장신구를 뺀다 */
  onUnequipTrinket: (slot: number) => void;
};

export function MercSheet({ merc, seed, progress: p, trinkets, onClose, onSwap, onForget, onEquipTrinket, onUnequipTrinket }: Props) {
  // Esc로 닫는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 전투에서 쓰는 것과 같은 계산 (성장 스탯 + 장신구, 부 조각 레벨)
  const unit = mercUnit({ ...merc, stats: addStats(p.stats, trinketsStats(p.trinkets)), subLevels: p.levels, gear: trinketsBonus(p.trinkets) });
  const stats = unitStats(unit);
  const stage = getStage(p.affinity);
  const need = xpToNext(p.lv);
  const worn = p.trinkets;
  const full = worn.length >= TRINKET_SLOTS;
  const fits = trinkets.map((t, index) => ({ t, index, def: getTrinket(t.id) })).filter((x) => trinketFits(x.def, merc.job) && !worn.some((w) => w.id === x.t.id));
  const steel = merc.passives?.includes("steel_heart");

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 p-3" onClick={onClose} role="dialog" aria-modal aria-label={`${merc.name} 정보`}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col gap-4 overflow-y-auto rounded-sm border border-ember/40 bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 머리: 이름, 종족·직업, 등급 */}
        <header className="flex items-start justify-between gap-3 border-b border-edge pb-3">
          <div className="flex items-center gap-3">
            <Portrait merc={merc} size="sm" />
            <div className="flex flex-col gap-0.5">
              <h2 className="text-2xl font-bold">{merc.name}</h2>
              <p className="text-sm text-ember">{merc.tags?.slice(0, 2).join(" · ")}</p>
              <p className="text-xs text-ash">
                {merc.title}
                {merc.level && ` · ${rankLabel(merc.level, p.lv)}`} · <span className={STAGE[stage].style}>{STAGE[stage].name}</span>
                {p.hired && ` · 보수 ${CURRENCY} ${p.wage ?? wageOf(merc)}`}
              </p>
            </div>
          </div>
          <Button className="!px-3 !py-1 text-xs" onClick={onClose}>
            닫기 (Esc)
          </Button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
          {/* 왼쪽: 능력치, 저항, 성장, 특성 */}
          <div className="flex flex-col gap-4">
            <Box title="기본 능력치">
              <Row k="최대 체력" v={unit.maxHp} />
              <Row k="공격" v={`${stats.attack[0]}~${stats.attack[1]}`} />
              <Row k="방어" v={stats.defense} />
              <Row k="속도" v={stats.speed} />
              <Row k="치명타" v={pct(stats.critChance)} />
              <Row k="회피" v={pct(stats.evadeChance)} />
              {(["str", "mag", "faith"] as const).map((k) => (unit.power?.[k] ?? 0) > 0 && <Row key={k} k={`${STAT_NAME[k]} 기술`} v={`+${unit.power![k]}`} />)}
            </Box>

            <Box title="저항">
              <Row k="기절" v={pct(Math.max(0, resistOf(unit, "stun")))} />
              <Row k="출혈" v={steel ? "걸릴 확률 절반" : pct(Math.max(0, resistOf(unit, "bleed")))} />
              <Row k="중독" v={steel ? "걸릴 확률 절반" : pct(Math.max(0, resistOf(unit, "poison")))} />
              <Row k="치유 감소" v={pct(Math.max(0, resistOf(unit, "healReduction")))} />
              <p className="text-[11px] text-ash">기절은 걸릴 때마다 그 전투 동안 저항이 40%씩 쌓인다.</p>
            </Box>

            <Box title="성장">
              <p className="text-xs">
                {need === null ? <span className="text-ember">승급 대기 (길드 창구에서 신청)</span> : `경험치 ${p.xp} / ${need}`}
                {p.trainable > 0 && <span className="ml-2 text-ember">단련 기회 {p.trainable}번</span>}
              </p>
              <p className="text-xs text-bone/80">
                {STAT_ORDER.filter((k: StatKey) => p.stats[k]).map((k) => `${STAT_NAME[k]} +${p.stats[k]}`).join(" · ") || "아직 쌓인 스탯이 없다"}
              </p>
            </Box>

            <Box title="특성">
              {merc.tags && merc.tags.length > 2 && <p className="text-xs text-bone/80">{merc.tags.slice(2).join(" · ")}</p>}
              {merc.impression && <p className="text-xs italic text-ash">{merc.impression}</p>}
              {(merc.passives ?? []).length === 0 ? (
                <p className="text-xs text-ash">종족 패시브가 없다.</p>
              ) : (
                (merc.passives ?? []).map((id) => {
                  const ps = getPassive(id);
                  return (
                    <p key={id} className="text-xs">
                      <b className="text-ember">✦ {ps?.name}</b> <span className="text-bone/70">{ps?.description}</span>
                    </p>
                  );
                })
              )}
              {merc.level && <p className="text-[11px] text-ash">패시브 칸 {(merc.passives ?? []).length} / {RANKS[merc.level].maxPassives}</p>}
            </Box>
          </div>

          {/* 오른쪽: 스킬, 장신구 */}
          <div className="flex flex-col gap-4">
            <Box title="스킬">
              {seed ? (
                <Loadout seed={seed} learned={p.learned} levels={p.levels} onSwap={onSwap} onForget={onForget} />
              ) : (
                <div className="flex flex-col gap-1">
                  {unit.skills.map((id) => (
                    <p key={id} className="text-xs">
                      <b>{unit.book?.[id]?.name}</b> <span className="text-bone/70">{unit.book?.[id]?.description}</span>
                    </p>
                  ))}
                  <p className="text-[11px] text-ash">이 용병의 스킬은 바꿀 수 없다.</p>
                </div>
              )}
            </Box>

            <Box title={`장신구 ${worn.length} / ${TRINKET_SLOTS}`}>
              {worn.length === 0 && <p className="text-xs text-ash">끼고 있는 장신구가 없다.</p>}
              {worn.map((o, slot) => {
                const def = getTrinket(o.id);
                return (
                  def && (
                    <div key={slot} className="flex items-start justify-between gap-2 rounded-sm bg-ember/5 px-3 py-2 text-xs">
                      <span className="flex flex-col">
                        <b className="text-ember">
                          {def.name} <span className="font-normal text-ash">{o.lv}단계</span>
                        </b>
                        <span className="text-bone/70">{bonusLine(o)}</span>
                        <span className="text-ash">{def.description}</span>
                      </span>
                      <Button className="shrink-0 !px-2.5 !py-0.5 text-xs" onClick={() => onUnequipTrinket(slot)}>
                        빼기
                      </Button>
                    </div>
                  )
                );
              })}
              <p className="mt-1 text-[11px] text-ash">보관함에서 낄 수 있는 것 (이 직업 전용이나 누구나{full ? ", 누르면 첫 칸과 바꾼다" : ""})</p>
              {fits.length === 0 ? (
                <p className="text-xs text-ash">낄 수 있는 장신구가 없다. 대장간에서 만든다.</p>
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {fits.map(({ t, index, def }) => (
                    <button
                      key={index}
                      onClick={() => onEquipTrinket(index)}
                      className="flex flex-col gap-0.5 rounded-sm border border-dashed border-edge bg-ink/30 px-3 py-2 text-left text-xs transition-colors hover:border-ember/50"
                    >
                      <b>
                        {def!.name} <span className="font-normal text-ash">{t.lv}단계</span>
                      </b>
                      <span className="text-bone/70">{bonusLine(t)}</span>
                      <span className="text-[11px] text-ember">{full ? "바꿔 끼기" : "끼기"}</span>
                    </button>
                  ))}
                </div>
              )}
            </Box>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 장신구 효과 한 줄: 스탯 + 스탯 밖 효과 */
function bonusLine(o: OwnedTrinket): string {
  const b = getTrinket(o.id)?.bonus;
  return [
    statLine(trinketStats(o), STAT_NAME),
    b?.attack ? `공격 +${b.attack}` : "",
    b?.poisonRes ? `중독 저항 +${pct(b.poisonRes)}` : "",
    b?.stunRes ? `기절 저항 +${pct(b.stunRes)}` : "",
    b?.sellBonus ? `상점 판매가 +${pct(b.sellBonus)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-sm border border-edge bg-ink/40 p-3">
      <h3 className="text-xs font-bold tracking-widest text-ash">{title}</h3>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <p className="flex justify-between text-xs">
      <span className="text-ash">{k}</span>
      <span className="text-bone">{v}</span>
    </p>
  );
}
