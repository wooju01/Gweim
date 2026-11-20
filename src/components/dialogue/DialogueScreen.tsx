import { useEffect, useRef, useState } from "react";
import { SURE_JOIN, TALK_LIMIT } from "@/game/merc/affinity";
import { advanceCost, wageOf } from "@/game/merc/wages";
import { CURRENCY } from "@/data/economy";
import type { Merc } from "@/game/types";
import { FREE_TEXT_MAX, type TalkAction } from "@/lib/schemas";
import { Button, MercStats, Portrait } from "@/components/common/parts";
import type { MercProgress, TalkScreen } from "@/game/state/state";

type Props = {
  merc: Merc;
  screen: TalkScreen;
  progress: MercProgress;
  partyFull: boolean;
  onAct: (action: TalkAction) => void;
  onLeave: () => void;
  /** 가진 금화 (선금을 낼 수 있는지) */
  gold: number;
};

export function DialogueScreen({ merc, screen, progress, partyFull, onAct, onLeave, gold }: Props) {
  const wage = wageOf(merc);
  const advance = advanceCost(merc);
  const { reply, pending, error, ended } = screen;
  const [draft, setDraft] = useState("");
  const logEnd = useRef<HTMLDivElement>(null);
  const talksLeft = Math.max(0, TALK_LIMIT - progress.talks);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [progress.history.length]);

  function submitFree(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || pending || talksLeft <= 0) return;
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
          <MercStats
            affinity={progress.affinity}
            willingness={progress.willingness}
            delta={reply?.delta}
            deltaKey={progress.history.length}
          />
          {progress.memory && (
            <details className="w-full rounded-sm border border-edge bg-panel px-3 py-2 text-xs">
              <summary className="cursor-pointer text-ash">{merc.name}의 기억</summary>
              <p className="mt-2 leading-relaxed text-bone/80">{progress.memory}</p>
            </details>
          )}
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
              <p className="text-xs text-ash">
                남은 대화{" "}
                <span className={talksLeft > 0 ? "text-bone" : "text-blood"}>
                  {talksLeft} / {TALK_LIMIT}
                </span>
              </p>
              {talksLeft <= 0 ? (
                <p className="rounded-sm border border-edge bg-panel px-4 py-3 text-sm text-ash">
                  {merc.name}은(는) 더 할 말이 없어 보인다. 동행을 제안하거나 자리를 뜬다.
                </p>
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
                    <div className="relative flex-1">
                      <input
                        value={draft}
                        // 한글 조합 중에는 maxLength가 넘칠 수 있어 잘라서도 막는다
                        onChange={(e) => setDraft(e.target.value.slice(0, FREE_TEXT_MAX))}
                        maxLength={FREE_TEXT_MAX}
                        disabled={pending}
                        placeholder="직접 말을 건다…"
                        className="w-full rounded-sm border border-edge bg-ink py-2 pl-3 pr-16 text-sm text-bone placeholder:text-ash/60 focus:border-ember/60 focus:outline-none disabled:opacity-40"
                      />
                      <span
                        aria-live="polite"
                        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums ${
                          draft.length >= FREE_TEXT_MAX ? "text-blood" : "text-ash"
                        }`}
                      >
                        {draft.length}/{FREE_TEXT_MAX}
                      </span>
                    </div>
                    <Button type="submit" disabled={pending || !draft.trim()}>
                      말하기
                    </Button>
                  </form>
                </>
              )}

              <div className="flex items-center gap-3 border-t border-edge pt-4">
                <Button
                  variant="ember"
                  disabled={pending || partyFull || !reply}
                  onClick={() => onAct({ type: "propose" })}
                >
                  동행을 제안한다 · {progress.willingness >= SURE_JOIN ? "확정" : `${progress.willingness}%`}
                </Button>
                {partyFull && <span className="text-xs text-ash">더 고용할 수 없다 (고용 4명).</span>}
              </div>

              {/* 조건 제시: 용병마다 한 번씩. 효과는 성격·배경에 따라 다르다 */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ash">
                  요구 보수: 원정마다 {CURRENCY} {progress.offers.share ? wageOf(merc, true) : wage}
                </span>
                <Button
                  className="!px-2.5 !py-1 text-xs"
                  disabled={pending || !reply || progress.offers.advance || gold < advance}
                  onClick={() => onAct({ type: "offer", offer: "advance" })}
                  title="지금 금화를 먼저 낸다. 돈을 반기는 용병일수록 효과가 크다"
                >
                  {progress.offers.advance ? "선금을 냈다" : `선금 ${advance} 내밀기`}
                </Button>
                <Button
                  className="!px-2.5 !py-1 text-xs"
                  disabled={pending || !reply || progress.offers.share}
                  onClick={() => onAct({ type: "offer", offer: "share" })}
                  title="고용하면 앞으로 보수를 50% 더 준다"
                >
                  {progress.offers.share ? "몫을 약속했다" : `몫 약속 (보수 ${wage} → ${wageOf(merc, true)})`}
                </Button>
                {gold < advance && !progress.offers.advance && <span className="text-blood">금화가 모자라다 (가진 금화 {gold})</span>}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
