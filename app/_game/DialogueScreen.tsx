import { useEffect, useRef, useState } from "react";
import { getMerc } from "@/data/mercs";
import type { TalkAction } from "@/lib/schemas";
import { AffinityBar, Button, Portrait } from "./parts";
import type { MercProgress, TalkScreen } from "./state";

type Props = {
  screen: TalkScreen;
  progress: MercProgress;
  partyFull: boolean;
  onAct: (action: TalkAction) => void;
  onLeave: () => void;
};

export function DialogueScreen({ screen, progress, partyFull, onAct, onLeave }: Props) {
  const merc = getMerc(screen.mercId)!;
  const { reply, pending, error, ended } = screen;
  const [draft, setDraft] = useState("");
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [progress.history.length]);

  function submitFree(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    onAct({ type: "free", text });
    setDraft("");
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <div className="flex items-center justify-between">
        <Button onClick={onLeave}>← 길드로</Button>
        {reply && (
          <span
            title={reply.mode === "fallback" ? "AI 호출이 실패해 이번 대사는 mock으로 대체됐습니다. 서버 로그를 확인하세요." : undefined}
            className={`rounded-sm border px-2 py-0.5 text-[11px] tracking-widest ${
              reply.mode === "fallback" ? "border-blood/50 text-blood" : "border-edge text-ash"
            }`}
          >
            {{ mock: "MOCK", live: "LIVE", fallback: "FALLBACK" }[reply.mode]}
          </span>
        )}
      </div>

      <section className="grid gap-6 sm:grid-cols-[176px_1fr]">
        <div className="flex flex-col items-center gap-4">
          <Portrait merc={merc} emotion={reply?.emotion} />
          <div className="text-center">
            <div className="text-lg font-bold">{merc.name}</div>
            <div className="text-xs text-ash">{merc.title}</div>
          </div>
          <div className="relative w-full">
            <AffinityBar value={progress.affinity} threshold={merc.joinThreshold} />
            {reply && reply.delta !== 0 && (
              <span
                key={progress.history.length}
                className={`animate-rise absolute -top-5 right-0 text-xs font-bold ${
                  reply.delta > 0 ? "text-moss" : "text-blood"
                }`}
              >
                {reply.delta > 0 ? `+${reply.delta}` : reply.delta}
              </span>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <div className="h-72 overflow-y-auto rounded-sm border border-edge bg-panel p-4">
            <div className="flex flex-col gap-3">
              {progress.history.map((line, i) => (
                <p
                  key={i}
                  className={
                    line.speaker === "merc"
                      ? "animate-rise leading-relaxed text-bone"
                      : "animate-rise pl-4 text-sm leading-relaxed text-ash italic"
                  }
                >
                  {line.speaker === "merc" ? `${merc.name}: “${line.text}”` : `— ${line.text}`}
                </p>
              ))}
              {pending && <p className="animate-pulse text-sm text-ash">…</p>}
              <div ref={logEnd} />
            </div>
          </div>

          {error && (
            <div className="flex items-center justify-between rounded-sm border border-blood/50 bg-blood/10 px-3 py-2 text-sm text-blood">
              <span>{error}</span>
              {!reply && (
                <Button variant="danger" onClick={() => onAct({ type: "open" })}>
                  다시 시도
                </Button>
              )}
            </div>
          )}

          {ended ? (
            <div className="flex flex-col items-start gap-3 rounded-sm border border-moss/50 bg-moss/10 p-4">
              <p className="text-moss">{merc.name}이(가) 파티에 합류했다.</p>
              <Button variant="ember" onClick={onLeave}>
                길드로 돌아간다
              </Button>
            </div>
          ) : (
            <>
              <ol className="flex flex-col gap-2">
                {reply?.choices.map((choice, i) => (
                  <li key={`${progress.history.length}-${i}`}>
                    <button
                      disabled={pending}
                      onClick={() => onAct({ type: "choice", choice })}
                      className="animate-rise w-full rounded-sm border border-edge bg-panel px-4 py-3 text-left text-sm transition-colors hover:border-ember/60 hover:bg-panel-hi disabled:opacity-40"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <span className="mr-2 text-ash">{i + 1}.</span>
                      {choice.text}
                    </button>
                  </li>
                ))}
              </ol>

              <form onSubmit={submitFree} className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={200}
                  disabled={pending}
                  placeholder="직접 말을 건다…"
                  className="flex-1 rounded-sm border border-edge bg-ink px-3 py-2 text-sm text-bone placeholder:text-ash/60 focus:border-ember/60 focus:outline-none disabled:opacity-40"
                />
                <Button type="submit" disabled={pending || !draft.trim()}>
                  말하기
                </Button>
              </form>

              <div className="flex items-center gap-3 border-t border-edge pt-4">
                <Button
                  variant="ember"
                  disabled={pending || partyFull || !reply}
                  onClick={() => onAct({ type: "propose" })}
                >
                  동행을 제안한다
                </Button>
                {partyFull && <span className="text-xs text-ash">파티에 빈 자리가 없다.</span>}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
