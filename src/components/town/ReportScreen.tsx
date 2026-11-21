import { SUPPLY, type SupplyKind } from "@/data/combat";
import { CURRENCY } from "@/data/economy";
import { getRelic } from "@/data/relics";
import { getSalvage } from "@/data/loot";
import { getTrinket } from "@/data/trinkets";
import { Button } from "@/components/common/parts";
import type { Fallen, Report } from "@/game/state/state";
import { TownBar } from "./TownBar";

type Props = {
  report: Report;
  /** 이번 원정에서 죽은 동료 (마지막 말이 늦게 도착할 수 있다) */
  deaths: Fallen[];
  day: number;
  gold: number;
  onDone: () => void;
};

const OUTCOME = {
  goal: { title: "목적지에 닿았다", line: "살아남은 자들과 함께 지상으로 돌아왔다.", style: "text-ember" },
  retreat: { title: "후퇴했다", line: "더 깊이 가지 않고 발길을 돌렸다. 가진 것은 지켰다.", style: "text-bone" },
  defeat: { title: "전멸했다", line: "당신은 쓰러진 동료들을 끌고 간신히 빠져나왔다.", style: "text-blood" },
} as const;

const SUPPLY_ORDER: SupplyKind[] = ["bandage", "antidote", "potion"];

/** 원정 결산: 무엇을 얻고 잃었는지, 누가 쓰러지고 떠났는지 */
export function ReportScreen({ report, deaths, day, gold, onDone }: Props) {
  const outcome = report.fled
    ? { title: "싸움에서 물러났다", line: "싸움을 버리고 동료들을 이끌고 빠져나왔다. 가진 것은 지켰다.", style: "text-bone" }
    : OUTCOME[report.outcome];
  const relicValue = report.relics.reduce((s, id) => s + (getRelic(id)?.value ?? 0), 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="결산" day={day} gold={gold} />
      <header className="animate-rise flex flex-col gap-1">
        <p className="text-xs tracking-[0.3em] text-ash">
          {report.day}일째 원정 · {report.depth ?? 1}층까지
        </p>
        <h1 className={`text-3xl font-bold ${outcome.style}`}>{outcome.title}</h1>
        <p className="text-sm text-bone/80">{outcome.line}</p>
      </header>

      <Section title="가져온 것">
        {report.lost ? (
          <p className="text-sm text-blood">
            {CURRENCY} {report.lost.gold}, 유물 {report.lost.relics}개, 유실물 {report.lost.salvage}개, 물자 {report.lost.supplies}개를 던전에 두고 왔다.
          </p>
        ) : (
          <>
            <p className="text-sm">
              {CURRENCY} <b className="text-ember">{report.gold}</b>
              {report.relics.length > 0 && (
                <span className="text-ash">
                  {" "}
                  · 유물 {report.relics.length}개 (팔면 {CURRENCY} {relicValue})
                </span>
              )}
            </p>
            {report.relics.length > 0 && (
              <p className="text-xs text-ash">{report.relics.map((id) => getRelic(id)?.name ?? id).join(", ")}</p>
            )}
            {Object.keys(report.salvage).length > 0 && (
              <p className="text-xs text-ash">
                유실물:{" "}
                {Object.entries(report.salvage)
                  .map(([id, n]) => `${getSalvage(id)?.name ?? id}${n > 1 ? ` ×${n}` : ""}`)
                  .join(", ")}
              </p>
            )}
            {(report.trinkets ?? []).length > 0 && (
              <p className="text-xs text-ember">장신구: {report.trinkets.map((id) => getTrinket(id)?.name ?? id).join(", ")} (대장간 보관함으로)</p>
            )}
            <p className="text-xs text-ash">
              짐으로 돌아온 물자: {SUPPLY_ORDER.map((k) => `${SUPPLY[k].name} ${report.supplies[k]}`).join(" · ")}
            </p>
          </>
        )}
        {(report.lostTrinkets ?? []).length > 0 && (
          <p className="text-xs text-blood">던전에 남은 장신구: {report.lostTrinkets.join(", ")}</p>
        )}
      </Section>

      {(deaths.length > 0 || report.fallen.length > 0) && (
        <Section title="동료">
          {deaths.map((d) => (
            <div key={d.id} className="text-sm">
              <p className="text-blood">{d.name}이(가) 돌아오지 못했다.</p>
              <p className="pl-3 text-xs text-ash italic">{d.words ? `“${d.words}”` : "…"}</p>
            </div>
          ))}
          {report.fallen.length > 0 && (
            <p className="text-sm text-bone/80">{report.fallen.join(", ")}은(는) 쓰러졌지만 살아서 돌아왔다.</p>
          )}
        </Section>
      )}

      {(report.wages.length > 0 || report.bonds.length > 0 || report.left.length > 0) && (
        <Section title="마을로 돌아와서">
          {[...report.wages, ...report.bonds].map((line, i) => (
            <p key={i} className={`text-sm ${line.includes("↓") ? "text-blood" : "text-bone/80"}`}>
              {line}
            </p>
          ))}
          {report.left.map((line, i) => (
            <p key={`left-${i}`} className="text-sm text-blood">
              {line}
            </p>
          ))}
        </Section>
      )}

      {(report.keys?.length ?? 0) > 0 && (
        <Section title="클랜 창고">
          {report.keys!.map((line, i) => (
            <p key={i} className="text-sm text-frost">
              {line}
            </p>
          ))}
        </Section>
      )}

      {report.growth.length > 0 && (
        <Section title="성장">
          {report.growth.map((line, i) => (
            <p key={i} className={`text-sm ${line.includes("레벨") ? "text-ember" : "text-bone/80"}`}>
              {line}
            </p>
          ))}
          {report.growth.some((l) => l.includes("레벨")) && <p className="text-xs text-ash">단련장에서 스탯을 더 키울 수 있다.</p>}
        </Section>
      )}

      <Button variant="ember" className="self-start" onClick={onDone}>
        마을로 돌아간다
      </Button>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="animate-rise flex flex-col gap-1.5 rounded-sm border border-edge bg-panel p-4">
      <h2 className="mb-1 text-xs tracking-widest text-ash">{title}</h2>
      {children}
    </section>
  );
}
