import { MERC_SLOTS } from "@/game/merc/party";
import { ROSTER_LIMIT } from "@/data/clan";
import { PACK_LIMIT } from "@/data/economy";
import type { SupplyKind } from "@/data/combat";
import { Button, Portrait } from "@/components/common/parts";
import type { Fallen, TownPlace } from "@/game/state/state";
import { TownBar } from "./TownBar";
import { TownScene, type SceneFacility } from "./TownScene";
import type { Merc } from "@/game/types";

type Props = {
  day: number;
  gold: number;
  hired: number;
  /** 원정 파티 (광장에 서 있다) */
  party: Merc[];
  /** 고용한 용병 전부 (누르면 정보 창) */
  crew: Merc[];
  onInspect: (mercId: string) => void;
  /** 길드에 와 있는 고용 전 용병 수 */
  visitors: number;
  pack: Record<SupplyKind, number>;
  relics: number;
  /** 가진 유실물 수 */
  salvage: number;
  /** 남은 단련 기회 합 */
  trainable: number;
  /** 받은 직접 의뢰 수 */
  quests: number;
  /** 집 이름 (숙소 / 클랜 본부) */
  homeName: string;
  notices: string[];
  memorial: Fallen[];
  onGo: (place: TownPlace) => void;
  onDismissNotices: () => void;
  onNewGame: () => void;
};

type Facility = SceneFacility & { description: string };

/** 마을(홈). 시설 카드에서 길드·상점·숙소·던전 입구로 간다. 나중 시설은 자리만 보인다 */
export function TownScreen(props: Props) {
  const { day, gold, hired, party, crew, onInspect, quests, homeName, visitors, pack, relics, salvage, trainable, notices, memorial, onGo, onDismissNotices, onNewGame } = props;
  const packed = Object.values(pack).reduce((a, b) => a + b, 0);
  const partySize = party.length;

  const facilities: Facility[] = [
    {
      key: "guild",
      place: "guild",
      name: "용병 길드",
      description: "떠돌이 용병을 모집하고, 말을 걸어 동행을 청한다.",
      status: `고용 ${hired} / ${ROSTER_LIMIT}${visitors ? ` · 기다리는 용병 ${visitors}명` : ""}`,
    },
    {
      key: "shop",
      place: "shop",
      name: "상점",
      description: "원정 물자를 사서 짐에 넣고, 던전에서 가져온 유물을 판다.",
      status: `창고 물자 ${packed} · 원정엔 ${PACK_LIMIT}개까지${relics + salvage ? ` · 팔 것 ${relics + salvage}개` : ""}`,
    },
    {
      key: "inn",
      place: "inn",
      name: homeName,
      description: "원정 파티를 정하고, 귀환마다 두 명과 이야기하고, 클랜을 꾸린다.",
      status: `원정 파티 ${partySize} / ${MERC_SLOTS}`,
    },
    {
      key: "gate",
      place: "gate",
      name: "던전 입구",
      description: "파티와 짐을 확인하고 미지의 숲으로 떠난다.",
      status: partySize === 0 ? "파티가 비어 있다" : packed === 0 ? "짐이 비어 있다" : "출발할 수 있다",
    },
    {
      key: "yard",
      place: "yard",
      name: "단련장",
      description: "레벨업으로 생긴 기회마다 금화를 내고 스탯을 직접 배분한다.",
      status: trainable ? `단련 기회 ${trainable}번` : "레벨업하면 단련할 수 있다",
    },
    {
      key: "forge",
      place: "forge",
      name: "대장간",
      description: "유실물로 직업 전용 장신구를 만들고 강화한다.",
      status: salvage ? `유실물 ${salvage}개` : "유실물이 없다",
    },
    {
      key: "hall",
      place: "hall",
      name: "전수관",
      description: "용병마다 스킬 조각을 가르치고, 아는 조각으로 새 스킬을 조립한다.",
      status: hired ? "조각 가르치기 · 스킬 조립" : "고용한 용병이 없다",
    },
    {
      key: "tavern",
      place: "board",
      name: "게시판 · 주점",
      description: "직접 의뢰를 받고, 클랜원을 파견 의뢰에 보낸다.",
      status: quests ? `받은 의뢰 ${quests}개` : "의뢰를 고를 수 있다",
    },
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

      <TownScene facilities={facilities} party={party} onGo={onGo} onInspect={onInspect} />

      {crew.length > 0 && (
        <section aria-label="용병단" className="flex flex-col gap-2">
          <h2 className="text-xs tracking-widest text-ash">용병단 · 누르면 정보를 보고 스킬·장신구를 바꿔 낀다</h2>
          <div className="flex flex-wrap gap-2">
            {crew.map((m) => (
              <button
                key={m.id}
                onClick={() => onInspect(m.id)}
                className="flex items-center gap-2 rounded-sm border border-edge bg-panel px-2 py-1.5 text-left text-sm transition-colors hover:border-ember/50"
              >
                <Portrait merc={m} size="sm" />
                <span className="flex flex-col leading-tight">
                  <span className="font-bold">{m.name}</span>
                  <span className="text-[11px] text-ash">{m.tags?.slice(0, 2).join(" · ")}</span>
                  {party.some((x) => x.id === m.id) && <span className="text-[11px] text-ember">원정 파티</span>}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

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
