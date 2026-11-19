import { LEVELS, getPassive } from "@/data/passives";
import type { Merc } from "@/game/types";
import { Button, MercStats, Portrait } from "./parts";
import { GUIDE, MERC_SLOTS } from "@/game/party";
import type { Fallen, MercProgress } from "./state";

type Props = {
  mercs: Merc[];
  progress: Record<string, MercProgress>;
  party: string[];
  recruit: { pending: boolean; error: string | null };
  onRecruit: () => void;
  onTalk: (mercId: string) => void;
  onDismiss: (mercId: string) => void;
  onEnterDungeon: () => void;
  /** 탐험에서 돌아왔을 때 알릴 일 */
  notices?: string[];
  onDismissNotices?: () => void;
  /** 저장을 지우고 처음부터 */
  onNewGame?: () => void;
  /** 잃은 동료 */
  memorial?: Fallen[];
};

export function GuildScreen({
  mercs,
  progress,
  party,
  recruit,
  onRecruit,
  onTalk,
  onDismiss,
  onEnterDungeon,
  notices = [],
  onDismissNotices,
  onNewGame,
  memorial = [],
}: Props) {
  const byId = new Map(mercs.map((m) => [m.id, m]));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-8">
      {notices.length > 0 && (
        <section aria-label="알림" className="flex items-start justify-between gap-4 rounded-sm border border-ember/40 bg-ember/5 px-4 py-3 text-sm">
          <ul className="flex flex-col gap-1">
            {notices.map((n, i) => (
              <li key={i} className={n.includes("떠났다") ? "text-blood" : "text-ember"}>
                {n}
              </li>
            ))}
          </ul>
          <Button className="!px-2 !py-1 text-xs" onClick={onDismissNotices}>
            확인
          </Button>
        </section>
      )}
      <header className="flex flex-col gap-4 border-b border-edge pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-xs tracking-[0.3em] text-ash">변경 마을 · 용병 길드</p>
          <h1 className="text-3xl font-bold text-bone">길드 홀</h1>
          <p className="text-sm text-ash">
            길안내자인 당신에게는 함께 던전으로 내려갈 용병 넷이 필요하다. 말을 걸어 동행을 청해 보라.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button variant="ember" onClick={onRecruit} disabled={recruit.pending}>
            {recruit.pending ? "게시판을 살피는 중…" : "새 용병 모집"}
          </Button>
          <span className="text-[11px] text-ash">고용하지 않은 떠돌이 용병은 떠나고 새 얼굴이 온다</span>
          {recruit.error && <span className="text-xs text-blood">{recruit.error}</span>}
          {onNewGame && (
            <button onClick={onNewGame} className="mt-1 text-[11px] text-ash/70 underline-offset-2 hover:text-blood hover:underline">
              처음부터 다시 시작 (저장 삭제)
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mercs.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-4 rounded-sm border border-dashed border-edge px-6 py-16 text-center">
              <p className="text-bone/80">길드 홀이 텅 비어 있다.</p>
              <p className="text-sm text-ash">게시판에 모집 공고를 붙이면 떠돌이 용병들이 모여든다.</p>
              <Button variant="ember" onClick={onRecruit} disabled={recruit.pending}>
                {recruit.pending ? "용병들이 모여드는 중…" : "모집 공고 붙이기"}
              </Button>
            </div>
          )}
          {mercs.map((merc) => {
            const p = progress[merc.id];
            return (
              <article
                key={merc.id}
                className="animate-rise relative flex flex-col gap-4 rounded-sm border border-edge bg-panel p-4 hover:z-30 focus-within:z-30"
              >
                <div className="flex gap-4">
                  <Portrait merc={merc} size="sm" />
                  <div className="flex min-w-0 flex-col">
                    <h2 className="text-lg font-bold">{merc.name}</h2>
                    <span className="text-xs text-ash">{merc.title}</span>
                    <span
                      className={`mt-2 w-fit rounded-sm px-2 py-0.5 text-[11px] ${
                        p.hired ? "bg-moss/20 text-moss" : "bg-edge/40 text-ash"
                      }`}
                    >
                      {p.hired ? "동행 중" : "고용 가능"}
                    </span>
                  </div>
                </div>
                {merc.tags && (
                  <ul className="flex flex-wrap gap-1">
                    {merc.level && (
                      <li className="rounded-sm bg-edge/60 px-1.5 py-0.5 text-[11px] text-bone">
                        {LEVELS[merc.level].name}
                      </li>
                    )}
                    {merc.tags.map((tag) => (
                      <li key={tag} className="rounded-sm border border-edge px-1.5 py-0.5 text-[11px] text-bone/70">
                        {tag}
                      </li>
                    ))}
                    {merc.passives?.map((id) => {
                      const passive = getPassive(id);
                      return (
                        passive && (
                          // 브라우저 기본 title 툴팁은 늦게 뜨거나 안 뜰 때가 있어 직접 그린다.
                          // 탭(포커스)으로도 열려서 터치 화면에서도 볼 수 있다.
                          <li
                            key={id}
                            tabIndex={0}
                            className="group relative rounded-sm border border-ember/50 px-1.5 py-0.5 text-[11px] text-ember outline-none focus:border-ember"
                          >
                            ✦ {passive.name}
                            <span
                              role="tooltip"
                              className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden w-56 rounded-sm border border-edge bg-ink px-2.5 py-2 text-xs leading-relaxed text-bone shadow-lg group-hover:block group-focus:block"
                            >
                              <span className="mb-0.5 block font-bold text-ember">{passive.name}</span>
                              {passive.description}
                            </span>
                          </li>
                        )
                      );
                    })}
                  </ul>
                )}
                {merc.impression && <p className="text-sm italic text-ember/80">{merc.impression}</p>}
                <p className="flex-1 text-sm leading-relaxed text-bone/80">{merc.background}</p>
                <MercStats affinity={p.affinity} willingness={p.willingness} />
                {p.hired ? (
                  <Button variant="danger" onClick={() => onDismiss(merc.id)}>
                    계약 해지
                  </Button>
                ) : (
                  <Button variant="ember" onClick={() => onTalk(merc.id)}>
                    말을 건다
                  </Button>
                )}
              </article>
            );
          })}
        </section>

        <aside className="flex h-fit flex-col gap-3 rounded-sm border border-edge bg-panel p-4">
          <h2 className="flex items-baseline justify-between text-sm tracking-widest text-ash">
            <span>파티</span>
            <span>
              용병 {party.length} / {MERC_SLOTS}
            </span>
          </h2>
          <PartySlot name={GUIDE.name} sub={GUIDE.role} guide />
          {Array.from({ length: MERC_SLOTS }, (_, i) => {
            const merc = party[i] ? byId.get(party[i]) : undefined;
            return merc ? (
              <PartySlot key={i} name={merc.name} sub={merc.title} />
            ) : (
              <div
                key={i}
                className="rounded-sm border border-dashed border-edge px-3 py-3 text-sm text-ash/60"
              >
                빈 자리
              </div>
            );
          })}
          <Button variant="ember" className="mt-2" disabled={party.length === 0} onClick={onEnterDungeon}>
            던전으로 내려간다
          </Button>
          {party.length === 0 && <p className="text-[11px] text-ash">용병을 한 명 이상 고용해야 한다.</p>}
        </aside>
      </div>
      {memorial.length > 0 && (
        <section aria-label="잃은 동료" className="flex flex-col gap-2 border-t border-edge pt-6">
          <h2 className="text-sm tracking-widest text-ash">잃은 동료</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {memorial.map((f) => (
              <li key={f.id} className="text-bone/80">
                <span className="font-bold">{f.name}</span>
                <span className="ml-2 text-xs text-ash">
                  {f.title} · {f.depth}층에서
                </span>
                {f.words && <p className="pl-3 text-xs text-ash italic">“{f.words}”</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function PartySlot({ name, sub, guide = false }: { name: string; sub: string; guide?: boolean }) {
  return (
    <div
      className={`animate-rise rounded-sm border bg-panel-hi px-3 py-2 ${guide ? "border-ember/40" : "border-edge"}`}
    >
      <div className="text-sm font-bold">{name}</div>
      <div className="text-xs text-ash">{sub}</div>
    </div>
  );
}
