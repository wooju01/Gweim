import type { Merc } from "@/game/types";
import { Button, MercStats, Portrait } from "./parts";
import { PARTY_LIMIT, type MercProgress } from "./state";

type Props = {
  mercs: Merc[];
  progress: Record<string, MercProgress>;
  party: string[];
  recruit: { pending: boolean; error: string | null };
  onRecruit: () => void;
  onTalk: (mercId: string) => void;
  onDismiss: (mercId: string) => void;
};

export function GuildScreen({ mercs, progress, party, recruit, onRecruit, onTalk, onDismiss }: Props) {
  const byId = new Map(mercs.map((m) => [m.id, m]));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-4 border-b border-edge pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-xs tracking-[0.3em] text-ash">재가 내리는 마을 · 용병 길드</p>
          <h1 className="text-3xl font-bold text-bone">길드 홀</h1>
          <p className="text-sm text-ash">
            꺼져 가는 난롯불 아래, 떠돌이 용병들이 일거리를 기다린다. 말을 걸어 동행을 청해 보라.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button variant="ember" onClick={onRecruit} disabled={recruit.pending}>
            {recruit.pending ? "게시판을 살피는 중…" : "새 용병 모집"}
          </Button>
          <span className="text-[11px] text-ash">고용하지 않은 떠돌이 용병은 떠나고 새 얼굴이 온다</span>
          {recruit.error && <span className="text-xs text-blood">{recruit.error}</span>}
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
                className="animate-rise flex flex-col gap-4 rounded-sm border border-edge bg-panel p-4"
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
                    {merc.tags.map((tag) => (
                      <li key={tag} className="rounded-sm border border-edge px-1.5 py-0.5 text-[11px] text-bone/70">
                        {tag}
                      </li>
                    ))}
                  </ul>
                )}
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
              {party.length + 1} / {PARTY_LIMIT + 1}
            </span>
          </h2>
          <PartySlot name="당신" sub="떠돌이 의뢰인" />
          {Array.from({ length: PARTY_LIMIT }, (_, i) => {
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
        </aside>
      </div>
    </main>
  );
}

function PartySlot({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="animate-rise rounded-sm border border-edge bg-panel-hi px-3 py-2">
      <div className="text-sm font-bold">{name}</div>
      <div className="text-xs text-ash">{sub}</div>
    </div>
  );
}
