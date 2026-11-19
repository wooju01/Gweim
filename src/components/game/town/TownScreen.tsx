import { MERC_SLOTS } from "@/game/party";
import { PACK_LIMIT } from "@/data/economy";
import type { SupplyKind } from "@/data/combat";
import { Button } from "../parts";
import type { Fallen, TownPlace } from "../state";
import { TownBar } from "./TownBar";
import { TownScene, type SceneFacility } from "./TownScene";
import type { Merc } from "@/game/types";

type Props = {
  day: number;
  gold: number;
  hired: number;
  /** 원정 파티 (광장에 서 있다) */
  party: Merc[];
  /** 길드에 와 있는 고용 전 용병 수 */
  visitors: number;
  pack: Record<SupplyKind, number>;
  relics: number;
  /** 가진 유실물 수 */
  salvage: number;
  notices: string[];
  memorial: Fallen[];
  onGo: (place: TownPlace) => void;
  onDismissNotices: () => void;
  onNewGame: () => void;
};

type Facility = SceneFacility & { description: string };

/** 마을(홈). 시설 카드에서 길드·상점·숙소·던전 입구로 간다. 나중 시설은 자리만 보인다 */
export function TownScreen(props: Props) {
  const { day, gold, hired, party, visitors, pack, relics, salvage, notices, memorial, onGo, onDismissNotices, onNewGame } = props;
  const packed = Object.values(pack).reduce((a, b) => a + b, 0);
  const partySize = party.length;

  const facilities: Facility[] = [
    {
      key: "guild",
      place: "guild",
      name: "용병 길드",
      description: "떠돌이 용병을 모집하고, 말을 걸어 동행을 청한다.",
      status: `고용 ${hired} / ${MERC_SLOTS}${visitors ? ` · 기다리는 용병 ${visitors}명` : ""}`,
    },
    {
      key: "shop",
      place: "shop",
      name: "상점",
      description: "원정 물자를 사서 짐에 넣고, 던전에서 가져온 유물을 판다.",
      status: `짐 ${packed} / ${PACK_LIMIT}${relics + salvage ? ` · 팔 것 ${relics + salvage}개` : ""}`,
    },
    {
      key: "inn",
      place: "inn",
      name: "숙소",
      description: "고용한 용병 중 원정에 데려갈 사람을 정한다.",
      status: `원정 파티 ${partySize} / ${MERC_SLOTS}`,
    },
    {
      key: "gate",
      place: "gate",
      name: "던전 입구",
      description: "파티와 짐을 확인하고 무너진 던전으로 내려간다.",
      status: partySize === 0 ? "파티가 비어 있다" : packed === 0 ? "짐이 비어 있다" : "출발할 수 있다",
    },
    { key: "yard", name: "단련장", description: "금화를 내고 용병을 단련한다.", later: "레벨업과 함께 열린다" },
    { key: "forge", name: "대장간", description: "유실물로 직업 전용 장신구를 만들고 강화한다.", later: "준비 중" },
    { key: "hall", name: "전수관", description: "유실물로 스킬 조각을 해금하고 조합한다.", later: "준비 중" },
    { key: "tavern", name: "게시판 · 주점", description: "의뢰와 소문, 용병들과의 이야기.", later: "준비 중" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="마을" day={day} gold={gold} />

      {notices.length > 0 && (
        <section aria-label="알림" className="flex items-start justify-between gap-4 rounded-sm border border-ember/40 bg-ember/5 px-4 py-3 text-sm">
          <ul className="flex flex-col gap-1">
            {notices.map((n, i) => (
              <li key={i} className={n.includes("떠났다") || n.includes("받지 못했다") || n.includes("두고") ? "text-blood" : "text-ember"}>
                {n}
              </li>
            ))}
          </ul>
          <Button className="!px-2 !py-1 text-xs" onClick={onDismissNotices}>
            확인
          </Button>
        </section>
      )}

      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">변경 마을</h1>
        <p className="text-sm text-ash">던전으로 내려가는 길목의 마지막 마을. 원정을 마치고 돌아오면 하루가 지난다.</p>
      </header>

      <TownScene facilities={facilities} party={party} onGo={onGo} />

      {/* 같은 시설을 글로도: 건물을 누르기 어렵거나 상태를 한눈에 보고 싶을 때 */}
      <nav aria-label="시설" className="grid gap-2 sm:grid-cols-4">
        {facilities
          .filter((f) => f.place)
          .map((f) => (
            <button
              key={f.key}
              onClick={() => onGo(f.place!)}
              className="flex flex-col gap-0.5 rounded-sm border border-edge bg-panel px-3 py-2 text-left transition-colors hover:border-ember/60 hover:bg-panel-hi"
            >
              <span className="text-sm font-bold">{f.name}</span>
              <span className="text-[11px] text-ember">{f.status}</span>
            </button>
          ))}
      </nav>
      <p className="text-[11px] text-ash">
        아직 열리지 않은 곳:{" "}
        {facilities
          .filter((f) => !f.place)
          .map((f) => `${f.name} (${f.later})`)
          .join(" · ")}
      </p>

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

      <button onClick={onNewGame} className="self-start text-[11px] text-ash/70 underline-offset-2 hover:text-blood hover:underline">
        처음부터 다시 시작 (저장 삭제)
      </button>
    </main>
  );
}
