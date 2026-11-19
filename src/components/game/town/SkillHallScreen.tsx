import { useState } from "react";
import { CURRENCY } from "@/data/economy";
import { CRAFT_COST, PIECES, craftId, getPiece, modLimit, piecesIn, validCraft, type Piece } from "@/data/craft";
import { getSalvage } from "@/data/loot";
import { LEVELS } from "@/data/passives";
import { getSkill } from "@/data/skillgen";
import { SKILL_SLOTS } from "@/data/skills";
import { knownPieces, ownedSkills, unlockBlock } from "@/game/skillhall";
import type { Merc } from "@/game/types";
import type { MercSeed } from "@/lib/schemas";
import { Button, Portrait } from "../parts";
import type { MercProgress } from "../state";
import { TownBar } from "./TownBar";

type Props = {
  day: number;
  gold: number;
  /** 고용한 랜덤 용병과 그 시드 (고유 용병은 전수관을 쓰지 않는다) */
  hired: { merc: Merc; seed: MercSeed }[];
  progress: Record<string, MercProgress>;
  salvage: Record<string, number>;
  onUnlock: (mercId: string, piece: string) => void;
  onCraft: (mercId: string, core: string, mods: string[]) => void;
  onSwap: (mercId: string, change: { equip?: string; unequip?: string }) => void;
  onBack: () => void;
};

const BLOCK_TEXT = { unknown: "없는 조각", known: "이미 안다", gold: `${CURRENCY} 부족`, salvage: "유실물 부족" } as const;

/** 전수관: 용병마다 효과 조각을 뚫어 주고, 아는 조각으로 스킬을 조립하고, 장착을 바꾼다 */
export function SkillHallScreen({ day, gold, hired, progress, salvage, onUnlock, onCraft, onSwap, onBack }: Props) {
  const [pickedId, setPickedId] = useState<string | null>(hired[0]?.merc.id ?? null);
  const picked = hired.find((h) => h.merc.id === pickedId) ?? hired[0];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="전수관" day={day} gold={gold} onBack={onBack} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">전수관</h1>
        <p className="text-sm text-ash">
          스킬은 효과 조각으로 이루어져 있다. 용병은 자기 스킬 안에 든 조각을 처음부터 알고, 나머지 조각은 {CURRENCY}과 유실물을 내고 한 사람씩
          가르쳐야 한다. 아는 조각으로 몸체 하나에 덧붙임을 얹어 새 스킬을 조립한다.
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
                <span className="font-bold">{merc.name}</span>
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
            onUnlock={(piece) => onUnlock(picked.merc.id, piece)}
            onCraft={(core, mods) => onCraft(picked.merc.id, core, mods)}
            onSwap={(change) => onSwap(picked.merc.id, change)}
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
  onUnlock,
  onCraft,
  onSwap,
}: {
  merc: Merc;
  seed: MercSeed;
  progress: MercProgress;
  gold: number;
  salvage: Record<string, number>;
  onUnlock: (piece: string) => void;
  onCraft: (core: string, mods: string[]) => void;
  onSwap: (change: { equip?: string; unequip?: string }) => void;
}) {
  const known = knownPieces(seed, p.learned, p.pieces);
  // 조각이 어디서 왔나: 그 조각이 든 스킬 이름들, 없으면 전수관에서 배움
  const sources: Record<string, string[]> = {};
  for (const id of ownedSkills(seed, p.learned)) {
    const sk = getSkill(id);
    if (sk) for (const piece of piecesIn(sk)) (sources[piece] ??= []).push(sk.name);
  }

  return (
    <article className="flex flex-col gap-4 rounded-sm border border-edge bg-panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold">
          {merc.name} <span className="text-xs font-normal text-ash">{merc.title}</span>
        </span>
        <span className="text-xs text-ash">
          {LEVELS[seed.level].name} · 덧붙임 {modLimit(seed.level)}개까지 · 아는 조각 {known.length} / {PIECES.length}
        </span>
      </div>
      <Loadout seed={seed} learned={p.learned} onSwap={onSwap} />
      <Workbench known={known} level={seed.level} owned={ownedSkills(seed, p.learned)} gold={gold} onCraft={onCraft} />
      <PieceBoard known={known} sources={sources} gold={gold} salvage={salvage} onUnlock={onUnlock} />
    </article>
  );
}

/** 장착 칸과 배운 스킬. 장착 스킬을 고른 채 배운 스킬을 누르면 맞바꾼다 */
function Loadout({ seed, learned, onSwap }: { seed: MercSeed; learned: string[]; onSwap: (c: { equip?: string; unequip?: string }) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const full = seed.skills.length >= SKILL_SLOTS;
  const ult = seed.ultimate ? getSkill(seed.ultimate) : undefined;
  const card = (id: string, on: boolean) => {
    const sk = getSkill(id);
    return (
      <>
        <b className={on ? "text-ember" : ""}>{sk?.name ?? id}</b>
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
        {seed.skills.map((id) => (
          <button
            key={id}
            onClick={() => setSel(sel === id ? null : id)}
            className={`flex flex-col gap-0.5 rounded-sm border px-3 py-2 text-left text-xs transition-colors ${
              sel === id ? "border-ember bg-ember/10" : "border-edge bg-ink/50 hover:border-ember/50"
            }`}
          >
            {card(id, sel === id)}
          </button>
        ))}
      </div>
      {ult && (
        <p className="text-xs">
          ★ 궁극기 <b className="text-ember">{ult.name}</b> <span className="text-bone/70">— {ult.description} (칸을 차지하지 않는다)</span>
        </p>
      )}
      {sel && (
        <Button
          className="self-start !px-3 !py-1 text-xs"
          disabled={seed.skills.length <= 1}
          onClick={() => {
            onSwap({ unequip: sel });
            setSel(null);
          }}
        >
          {getSkill(sel)?.name} 빼서 보관
        </Button>
      )}
      <h3 className="mt-1 text-xs text-ash">배운 스킬 (보관 중)</h3>
      {learned.length === 0 ? (
        <p className="text-xs text-ash">보관 중인 스킬이 없다.</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {learned.map((id) => {
            const can = !!sel || !full;
            return (
              <button
                key={id}
                disabled={!can}
                onClick={() => {
                  onSwap(sel ? { equip: id, unequip: sel } : { equip: id });
                  setSel(null);
                }}
                className="flex flex-col gap-0.5 rounded-sm border border-dashed border-edge bg-ink/30 px-3 py-2 text-left text-xs transition-colors enabled:hover:border-ember/50 disabled:opacity-60"
              >
                {card(id, false)}
                <span className="text-[11px] text-ember">{sel ? `${getSkill(sel)?.name} 대신 장착` : full ? "장착 칸이 꽉 찼다" : "장착하기"}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** 조립대: 몸체 하나 + 덧붙임 (등급별 개수). 미리보기로 이름·효과·대기 시간을 보여 준다 */
function Workbench({
  known,
  level,
  owned,
  gold,
  onCraft,
}: {
  known: string[];
  level: MercSeed["level"];
  owned: string[];
  gold: number;
  onCraft: (core: string, mods: string[]) => void;
}) {
  const [core, setCore] = useState<string | null>(null);
  const [mods, setMods] = useState<string[]>([]);
  const limit = modLimit(level);
  const cores = PIECES.filter((p) => p.kind === "core" && known.includes(p.id));
  const coreShape = core ? getPiece(core)!.shape! : null;
  const modsKnown = PIECES.filter((p) => p.kind === "mod" && known.includes(p.id));
  const id = core && validCraft(core, mods) ? craftId(core, mods) : null;
  const preview = id ? getSkill(id) : undefined;
  const dup = id ? owned.includes(id) : false;
  const option = (on: boolean) =>
    `rounded-sm border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${on ? "border-ember bg-ember/10 text-ember" : "border-edge bg-ink/50 enabled:hover:border-ember/50"}`;

  const toggleMod = (m: string) => setMods((xs) => (xs.includes(m) ? xs.filter((x) => x !== m) : xs.length < limit ? [...xs, m] : xs));

  return (
    <section className="flex flex-col gap-2 border-t border-edge pt-3">
      <h2 className="text-sm font-bold">
        조립대 <span className="ml-1 text-xs font-normal text-ash">{CURRENCY} {CRAFT_COST} · 장착 칸이 꽉 찼으면 보관</span>
      </h2>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-ash">몸체</span>
        {cores.length === 0 && <span className="text-xs text-ash">아는 몸체 조각이 없다</span>}
        {cores.map((c) => (
          <button
            key={c.id}
            className={option(core === c.id)}
            title={c.hint}
            onClick={() => {
              setCore(c.id);
              // 새 몸체에 맞지 않는 덧붙임은 뺀다
              setMods((xs) => xs.filter((m) => validCraft(c.id, [m])));
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-ash">
          덧붙임 {mods.length}/{limit}
        </span>
        {modsKnown.length === 0 && <span className="text-xs text-ash">아는 덧붙임 조각이 없다</span>}
        {modsKnown.map((m) => {
          const fits = !coreShape || validCraft(core!, [m.id]);
          const on = mods.includes(m.id);
          return (
            <button key={m.id} className={option(on)} title={m.hint} disabled={!fits || (!on && mods.length >= limit)} onClick={() => toggleMod(m.id)}>
              {m.name}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-sm bg-ink/50 px-3 py-2 text-xs">
        {preview ? (
          <span className="flex flex-col gap-0.5">
            <b className="text-ember">{preview.name}</b>
            <span className="text-bone/70">
              {preview.description} · 대기 {preview.cooldown}턴
            </span>
          </span>
        ) : (
          <span className="text-ash">몸체 조각을 고르면 미리 볼 수 있다.</span>
        )}
        <Button
          variant="ember"
          className="shrink-0 !px-3 !py-1 text-xs"
          disabled={!id || dup || gold < CRAFT_COST}
          onClick={() => {
            onCraft(core!, mods);
            setMods([]);
          }}
        >
          {dup ? "이미 가진 스킬" : gold < CRAFT_COST ? `${CURRENCY}이 모자라다` : "조립한다"}
        </Button>
      </div>
    </section>
  );
}

/** 조각판: 아는 조각은 어디서 왔는지, 모르는 조각은 해금 비용과 함께 */
function PieceBoard({
  known,
  sources,
  gold,
  salvage,
  onUnlock,
}: {
  known: string[];
  sources: Record<string, string[]>;
  gold: number;
  salvage: Record<string, number>;
  onUnlock: (piece: string) => void;
}) {
  const row = (piece: Piece) => {
    const isKnown = known.includes(piece.id);
    const block = unlockBlock(piece.id, known, gold, salvage);
    const cost = Object.entries(piece.cost.salvage)
      .map(([id, n]) => `${getSalvage(id)?.name ?? id} ${salvage[id] ?? 0}/${n}`)
      .join(", ");
    return (
      <div
        key={piece.id}
        className={`flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-xs ${isKnown ? "bg-ember/5" : "bg-ink/50 opacity-90"}`}
      >
        <span className="flex min-w-0 flex-col">
          <span>
            <b className={isKnown ? "text-ember" : ""}>{piece.name}</b> <span className="text-bone/70">{piece.hint}</span>
          </span>
          <span className="text-[11px] text-ash">
            {isKnown ? (sources[piece.id] ? `${sources[piece.id].join(", ")}에 들어 있다` : "전수관에서 배웠다") : `${CURRENCY} ${piece.cost.gold} · ${cost}`}
          </span>
        </span>
        {!isKnown && (
          <Button className="shrink-0 !px-2.5 !py-0.5 text-xs" disabled={!!block} onClick={() => onUnlock(piece.id)}>
            {block ? BLOCK_TEXT[block] : "가르친다"}
          </Button>
        )}
      </div>
    );
  };

  return (
    <section className="flex flex-col gap-2 border-t border-edge pt-3">
      <h2 className="text-sm font-bold">
        조각판 <span className="ml-1 text-xs font-normal text-ash">가르친 조각은 이 용병만 안다</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ash">몸체 (하나 필수)</span>
          {PIECES.filter((p) => p.kind === "core").map(row)}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ash">덧붙임</span>
          {PIECES.filter((p) => p.kind === "mod").map(row)}
        </div>
      </div>
    </section>
  );
}
