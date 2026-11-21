import { useState } from "react";
import { CURRENCY } from "@/data/economy";
import { CRAFT_COST, MAX_SUB_LEVEL, getFragment, upgradeCost, type Fragment } from "@/data/fragments";
import { getSalvage } from "@/data/loot";
import { RANKS } from "@/data/ranks";
import { LEARNED_SLOTS, SKILL_SLOTS } from "@/data/skills";
import { craftBlock, knownFragments, ownedSkills, ownerOf, unlockBlock, upgradeBlock } from "@/game/merc/skillhall";
import { describeFragment, fragmentsFor, parseKey, partsText, resolveSkill, skillKey, type SubLevels } from "@/game/skills";
import type { Merc } from "@/game/types";
import type { MercLevel, MercSeed, SkillBuild } from "@/lib/schemas";
import { Button, Portrait } from "@/components/common/parts";
import type { MercProgress } from "@/game/state/state";
import { TownBar } from "./TownBar";

type Props = {
  day: number;
  gold: number;
  /** 고용한 랜덤 용병과 그 시드 (고유 용병은 전수관을 쓰지 않는다) */
  hired: { merc: Merc; seed: MercSeed }[];
  progress: Record<string, MercProgress>;
  salvage: Record<string, number>;
  /** 길드 등급 (고용한 용병 중 최고 등급). 은 조각 해금 조건 */
  guildRank: MercLevel;
  onUnlock: (mercId: string, piece: string) => void;
  onUpgrade: (mercId: string, piece: string) => void;
  onCraft: (mercId: string, build: SkillBuild) => void;
  onSwap: (mercId: string, change: { equip?: string; unequip?: string }) => void;
  onForget: (mercId: string, key: string) => void;
  onBack: () => void;
};

const UNLOCK_TEXT = { unknown: "없는 조각", forbidden: "쓸 수 없다", known: "이미 안다", rank: "은 등급 필요", gold: `${CURRENCY} 부족`, salvage: "재료 부족" } as const;
const UPGRADE_TEXT = { unknown: "모르는 조각", max: "최대 레벨", gold: `${CURRENCY} 부족`, salvage: "재료 부족" } as const;

/** "엘프 · 바드" (카드 태그의 종족·직업. 직업은 지금 등급의 직업 이름) */
const raceJob = (merc: Merc) => (merc.tags ? merc.tags.slice(0, 2).join(" · ") : "");

const costText = (cost: { gold: number; salvage: Record<string, number> }, salvage: Record<string, number>) =>
  [`${CURRENCY} ${cost.gold}`, ...Object.entries(cost.salvage).map(([id, n]) => `${getSalvage(id)?.name ?? id} ${salvage[id] ?? 0}/${n}`)].join(" · ");

/** 전수관: 용병마다 조각을 가르치고, 부 조각을 강화하고, 아는 조각으로 스킬을 조립하고, 장착을 바꾼다 */
export function SkillHallScreen({ day, gold, hired, progress, salvage, guildRank, onUnlock, onUpgrade, onCraft, onSwap, onForget, onBack }: Props) {
  const [pickedId, setPickedId] = useState<string | null>(hired[0]?.merc.id ?? null);
  const picked = hired.find((h) => h.merc.id === pickedId) ?? hired[0];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="전수관" day={day} gold={gold} onBack={onBack} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">전수관</h1>
        <p className="text-sm text-ash">
          스킬은 메인 조각 하나에 부 조각을 끼워 만든다. 용병은 자기 직업과 종족의 조각만 쓸 수 있고, 자기 스킬 안에 든 조각은 처음부터 안다.
          나머지는 {CURRENCY}과 재료(기술 파편·계열 재료 등)를 내고 한 사람씩 가르친다. 은 조각은 길드에 은 등급 이상 용병이 있어야 가르칠 수 있다. 부 조각은 강화하면 수치가 오른다 (Lv{MAX_SUB_LEVEL}까지, 반드시 성공).
        </p>
      </header>

      {hired.length === 0 ? (
        <p className="rounded-sm border border-dashed border-edge px-4 py-10 text-center text-sm text-ash">가르칠 용병이 없다.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <nav aria-label="용병" className="flex flex-wrap gap-2">
            {hired.map(({ merc }) => (
              <button
                key={merc.id}
                onClick={() => setPickedId(merc.id)}
                className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-sm transition-colors ${
                  picked.merc.id === merc.id ? "border-ember bg-ember/10" : "border-edge bg-panel hover:border-ember/50"
                }`}
              >
                <Portrait merc={merc} size="sm" />
                <span className="flex flex-col leading-tight">
                  <span className="font-bold">{merc.name}</span>
                  <span className="text-[11px] text-ash">{raceJob(merc)}</span>
                </span>
              </button>
            ))}
          </nav>
          <MercHall
            key={picked.merc.id}
            merc={picked.merc}
            seed={picked.seed}
            progress={progress[picked.merc.id]}
            gold={gold}
            salvage={salvage}
            guildRank={guildRank}
            onUnlock={(piece) => onUnlock(picked.merc.id, piece)}
            onUpgrade={(piece) => onUpgrade(picked.merc.id, piece)}
            onCraft={(build) => onCraft(picked.merc.id, build)}
            onSwap={(change) => onSwap(picked.merc.id, change)}
            onForget={(key) => onForget(picked.merc.id, key)}
          />
        </div>
      )}
    </main>
  );
}

function MercHall({
  merc,
  seed,
  progress: p,
  gold,
  salvage,
  guildRank,
  onUnlock,
  onUpgrade,
  onCraft,
  onSwap,
  onForget,
}: {
  merc: Merc;
  seed: MercSeed;
  progress: MercProgress;
  gold: number;
  salvage: Record<string, number>;
  guildRank: MercLevel;
  onUnlock: (piece: string) => void;
  onUpgrade: (piece: string) => void;
  onCraft: (build: SkillBuild) => void;
  onSwap: (change: { equip?: string; unequip?: string }) => void;
  onForget: (key: string) => void;
}) {
  const known = knownFragments(seed, p.learned, p.pieces);
  const pool = fragmentsFor(ownerOf(seed));
  // 조각이 어디서 왔나: 그 조각이 든 스킬 이름들, 없으면 전수관에서 배움
  const sources: Record<string, string[]> = {};
  for (const b of ownedSkills(seed, p.learned)) {
    const name = resolveSkill(b, p.levels)?.name ?? b.main;
    for (const id of [b.main, ...b.subs]) (sources[id] ??= []).push(name);
  }

  return (
    <article className="flex flex-col gap-4 rounded-sm border border-edge bg-panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold">
          {merc.name} <span className="text-xs font-normal text-ember">{raceJob(merc)}</span>{" "}
          <span className="text-xs font-normal text-ash">{merc.title}</span>
        </span>
        <span className="text-xs text-ash">
          {RANKS[seed.level].name} · 부 조각 {RANKS[seed.level].subLimit}개까지 · 아는 조각 {known.length} / {pool.length}
        </span>
      </div>
      <Loadout seed={seed} learned={p.learned} levels={p.levels} onSwap={onSwap} onForget={onForget} />
      <Workbench seed={seed} learned={p.learned} unlocked={p.pieces} levels={p.levels} known={known} gold={gold} onCraft={onCraft} />
      <FragmentBoard
        seed={seed}
        pool={pool}
        known={known}
        levels={p.levels}
        sources={sources}
        gold={gold}
        salvage={salvage}
        guildRank={guildRank}
        onUnlock={onUnlock}
        onUpgrade={onUpgrade}
      />
    </article>
  );
}

/** 장착 칸과 배운 스킬(보관함). 장착 스킬을 고른 채 배운 스킬을 누르면 맞바꾼다. 마을의 용병 정보에서도 쓴다 */
export function Loadout({
  seed,
  learned,
  levels,
  onSwap,
  onForget,
}: {
  seed: MercSeed;
  learned: SkillBuild[];
  levels: SubLevels;
  onSwap: (c: { equip?: string; unequip?: string }) => void;
  onForget: (key: string) => void;
}) {
  const learnedFull = learned.length >= LEARNED_SLOTS;
  const [sel, setSel] = useState<string | null>(null);
  const full = seed.skills.length >= SKILL_SLOTS;
  const ult = seed.ultimate ? resolveSkill({ main: seed.ultimate, subs: [] }) : undefined;
  const byKey = new Map([...seed.skills, ...learned].map((b) => [skillKey(b), resolveSkill(b, levels)]));
  const card = (key: string, on: boolean) => {
    const sk = byKey.get(key);
    return (
      <>
        <b className={on ? "text-ember" : ""}>
          {sk?.name ?? key} <span className="text-[10px] font-normal text-ash">{partsText(parseKey(key)!)}</span>
        </b>
        <span className="text-bone/70">
          {sk?.description} · 대기 {sk?.cooldown}턴
        </span>
      </>
    );
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold">
        장착 스킬 {seed.skills.length} / {SKILL_SLOTS}
        <span className="ml-2 text-xs font-normal text-ash">장착 스킬을 고르고 배운 스킬을 누르면 맞바꾼다</span>
      </h2>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {seed.skills.map(skillKey).map((key) => (
          <button
            key={key}
            onClick={() => setSel(sel === key ? null : key)}
            className={`flex flex-col gap-0.5 rounded-sm border px-3 py-2 text-left text-xs transition-colors ${
              sel === key ? "border-ember bg-ember/10" : "border-edge bg-ink/50 hover:border-ember/50"
            }`}
          >
            {card(key, sel === key)}
          </button>
        ))}
      </div>
      {ult ? (
        <p className="text-xs">
          ★ 궁극기 <b className="text-ember">{ult.name}</b> <span className="text-bone/70">— {ult.description} (칸을 차지하지 않는다)</span>
        </p>
      ) : (
        <p className="text-xs text-ash">★ 궁극기 칸은 금 등급에서 열린다.</p>
      )}
      {sel && (
        <Button
          className="self-start !px-3 !py-1 text-xs"
          disabled={seed.skills.length <= 1 || learnedFull}
          onClick={() => {
            onSwap({ unequip: sel });
            setSel(null);
          }}
        >
          {learnedFull ? "보관함이 꽉 찼다" : `${byKey.get(sel)?.name} 빼서 보관`}
        </Button>
      )}
      <h3 className="mt-1 text-xs text-ash">
        배운 스킬 (보관함 {learned.length} / {LEARNED_SLOTS}){learnedFull && " · 꽉 찼다. 새 스킬을 보관하려면 하나를 잊어야 한다"}
      </h3>
      {learned.length === 0 ? (
        <p className="text-xs text-ash">보관 중인 스킬이 없다.</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {learned.map(skillKey).map((key) => {
            const can = !!sel || !full;
            return (
              <div key={key} className="relative">
                <button
                  disabled={!can}
                  onClick={() => {
                    onSwap(sel ? { equip: key, unequip: sel } : { equip: key });
                    setSel(null);
                  }}
                  className="flex w-full flex-col gap-0.5 rounded-sm border border-dashed border-edge bg-ink/30 px-3 py-2 pr-12 text-left text-xs transition-colors enabled:hover:border-ember/50 disabled:opacity-60"
                >
                  {card(key, false)}
                  <span className="text-[11px] text-ember">{sel ? `${byKey.get(sel)?.name} 대신 장착` : full ? "장착 칸이 꽉 찼다" : "장착하기"}</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`${byKey.get(key)?.name}을(를) 잊을까? 조각은 그대로 알고 있어서 다시 조립할 수 있다.`)) onForget(key);
                  }}
                  className="absolute right-2 top-2 rounded-sm px-1.5 text-[11px] text-ash hover:text-blood"
                  title="보관함에서 지운다"
                >
                  잊기
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** 조립대: 메인 하나 + 부 조각 (등급별 개수). 미리보기로 이름·효과·대기 시간을 보여 준다 */
function Workbench({
  seed,
  learned,
  unlocked,
  levels,
  known,
  gold,
  onCraft,
}: {
  seed: MercSeed;
  learned: SkillBuild[];
  unlocked: string[];
  levels: SubLevels;
  known: string[];
  gold: number;
  onCraft: (build: SkillBuild) => void;
}) {
  const [main, setMain] = useState<string | null>(null);
  const [subs, setSubs] = useState<string[]>([]);
  const limit = RANKS[seed.level].subLimit;
  const knownFragments = known.flatMap((id) => getFragment(id) ?? []);
  const mains = knownFragments.filter((f) => f.kind === "main");
  const subsKnown = knownFragments.filter((f) => f.kind === "sub");
  const build = main ? { main, subs } : null;
  const block = build ? craftBlock(seed, learned, unlocked, gold, build) : null;
  const preview = build ? resolveSkill(build, levels) : undefined;
  const option = (on: boolean) =>
    `rounded-sm border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${on ? "border-ember bg-ember/10 text-ember" : "border-edge bg-ink/50 enabled:hover:border-ember/50"}`;

  const toggleSub = (id: string) => setSubs((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length < limit ? [...xs, id] : xs));

  return (
    <section className="flex flex-col gap-2 border-t border-edge pt-3">
      <h2 className="text-sm font-bold">
        조립대 <span className="ml-1 text-xs font-normal text-ash">{CURRENCY} {CRAFT_COST} · 장착 칸이 꽉 찼으면 보관</span>
      </h2>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-ash">메인</span>
        {mains.length === 0 && <span className="text-xs text-ash">아는 메인 조각이 없다</span>}
        {mains.map((f) => (
          <button key={f.id} className={option(main === f.id)} title={describeFragment(f)} onClick={() => setMain(f.id)}>
            {f.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-ash">
          부 {subs.length}/{limit}
        </span>
        {subsKnown.length === 0 && <span className="text-xs text-ash">아는 부 조각이 없다</span>}
        {subsKnown.map((f) => {
          const on = subs.includes(f.id);
          return (
            <button
              key={f.id}
              className={option(on)}
              title={describeFragment(f, levels[f.id] ?? 1)}
              disabled={!on && subs.length >= limit}
              onClick={() => toggleSub(f.id)}
            >
              {f.name} <span className="text-ash">Lv{levels[f.id] ?? 1}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-sm bg-ink/50 px-3 py-2 text-xs">
        {preview ? (
          <span className="flex flex-col gap-0.5">
            <b className="text-ember">
              {preview.name} <span className="text-[10px] font-normal text-ash">{partsText(build!)}</span>
            </b>
            <span className="text-bone/70">
              {preview.description} · 대기 {preview.cooldown}턴
            </span>
          </span>
        ) : (
          <span className="text-ash">메인 조각을 고르면 미리 볼 수 있다.</span>
        )}
        <Button
          variant="ember"
          className="shrink-0 !px-3 !py-1 text-xs"
          disabled={!build || !!block}
          onClick={() => {
            onCraft(build!);
            setSubs([]);
          }}
        >
          {block ?? "조립한다"}
        </Button>
      </div>
    </section>
  );
}

/** 조각판: 이 용병이 쓸 수 있는 조각. 아는 조각은 어디서 왔는지(부 조각은 강화), 모르는 조각은 해금 비용과 함께 */
function FragmentBoard({
  seed,
  pool,
  known,
  levels,
  sources,
  gold,
  salvage,
  guildRank,
  onUnlock,
  onUpgrade,
}: {
  seed: MercSeed;
  pool: Fragment[];
  known: string[];
  levels: SubLevels;
  sources: Record<string, string[]>;
  gold: number;
  salvage: Record<string, number>;
  guildRank: MercLevel;
  onUnlock: (piece: string) => void;
  onUpgrade: (piece: string) => void;
}) {
  const row = (f: Fragment) => {
    const isKnown = known.includes(f.id);
    const lv = levels[f.id] ?? 1;
    const unlock = unlockBlock(f.id, seed, known, gold, salvage, guildRank);
    const up = f.kind === "sub" && isKnown ? upgradeBlock(f.id, known, levels, gold, salvage) : null;
    const nextCost = f.kind === "sub" && lv < MAX_SUB_LEVEL ? upgradeCost(f, lv + 1) : null;
    return (
      <div
        key={f.id}
        className={`flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-xs ${isKnown ? "bg-ember/5" : "bg-ink/50 opacity-90"}`}
      >
        <span className="flex min-w-0 flex-col">
          <span>
            <b className={isKnown ? "text-ember" : ""}>{f.name}</b>
            {f.kind === "sub" && <span className="ml-1 text-ash">Lv{lv}</span>}
            {f.race && <span className="ml-1 text-[10px] text-frost">종족</span>}
            {f.tier === "silver" && <span className="ml-1 text-[10px] text-ash">은</span>} <span className="text-bone/70">{describeFragment(f, lv)}</span>
          </span>
          <span className="text-[11px] text-ash">
            {!isKnown
              ? f.cost && costText(f.cost, salvage)
              : nextCost
                ? `강화 Lv${lv + 1}: ${costText(nextCost, salvage)}`
                : sources[f.id]
                  ? `${sources[f.id].join(", ")}에 들어 있다`
                  : "전수관에서 배웠다"}
          </span>
        </span>
        {!isKnown ? (
          <Button className="shrink-0 !px-2.5 !py-0.5 text-xs" disabled={!!unlock} onClick={() => onUnlock(f.id)}>
            {unlock ? UNLOCK_TEXT[unlock] : "가르친다"}
          </Button>
        ) : (
          f.kind === "sub" &&
          lv < MAX_SUB_LEVEL && (
            <Button className="shrink-0 !px-2.5 !py-0.5 text-xs" disabled={!!up} onClick={() => onUpgrade(f.id)}>
              {up ? UPGRADE_TEXT[up] : "강화"}
            </Button>
          )
        )}
      </div>
    );
  };

  return (
    <section className="flex flex-col gap-2 border-t border-edge pt-3">
      <h2 className="text-sm font-bold">
        조각판 <span className="ml-1 text-xs font-normal text-ash">가르친 조각과 강화는 이 용병만의 것이다</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ash">메인 (하나 필수)</span>
          {pool.filter((f) => f.kind === "main").map(row)}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ash">부 조각</span>
          {pool.filter((f) => f.kind === "sub").map(row)}
        </div>
      </div>
    </section>
  );
}
