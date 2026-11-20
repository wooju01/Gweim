// 대륙 지도 (프로토타입). 던전 데이터(data/regions.ts의 DUNGEONS)의 위치·지형으로 표식을 그린다.
// 새 던전을 데이터에 넣으면 지도에 바로 나타난다. 진짜 그림이 생기면 배경과 표식 모양만 바꾸면 된다.
import { DUNGEONS, TOWN_AT, type Dungeon, type Terrain } from "@/data/regions";

type Props = {
  selected: string;
  onSelect: (dungeonId: string) => void;
  /** 던전별 진행 (탐험한 지역 / 전체, 한 번이라도 쓰러뜨린 우두머리 수 (기록일 뿐, 보스는 매번 다시 나온다)) */
  progress: Record<string, { explored: number; total: number; conquered: number }>;
};

/** 지형별 표식 (간단한 실루엣) */
function TerrainMark({ terrain, open }: { terrain: Terrain; open: boolean }) {
  const dim = open ? "" : "opacity-40";
  switch (terrain) {
    case "forest":
      return (
        <g className={dim}>
          {[-9, 0, 9].map((dx, i) => (
            <path key={dx} d={`M${dx} ${i === 1 ? -12 : -8} l6 10 h-12 z`} className="fill-moss" />
          ))}
        </g>
      );
    case "volcano":
      return (
        <g className={dim}>
          <path d="M-12 4 L-3 -10 h6 L12 4 z" className="fill-[#5a2a20]" />
          <path d="M-3 -10 h6 l-1 -4 h-4 z" className="fill-blood" />
        </g>
      );
    case "snow":
      return (
        <g className={dim}>
          <path d="M-13 4 L0 -13 L13 4 z" className="fill-[#4a5563]" />
          <path d="M-5 -6 L0 -13 L5 -6 l-2 2 l-3 -2 l-3 2 z" className="fill-bone" />
        </g>
      );
    case "mine":
    case "cave":
      return (
        <g className={dim}>
          <path d="M-12 4 Q0 -14 12 4 z" className="fill-[#3b332d]" />
          <path d="M-5 4 Q0 -5 5 4 z" className="fill-ink" />
        </g>
      );
    case "ruins":
      return (
        <g className={dim}>
          {[-8, -2, 4].map((dx, i) => (
            <rect key={dx} x={dx} y={-8 + i * 2} width="4" height={12 - i * 2} className="fill-ash" />
          ))}
        </g>
      );
  }
}

export function WorldMap({ selected, onSelect, progress }: Props) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-sm border border-edge" style={{ background: "radial-gradient(ellipse at 50% 55%, #2a2a33 0%, #15161d 70%)" }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 56.25" preserveAspectRatio="none" aria-hidden>
        {/* 대륙 */}
        <path
          d="M8 30 C6 18 18 8 32 7 C44 3 60 4 72 9 C86 13 95 24 93 36 C92 46 82 53 66 52 C54 54 40 55 28 51 C14 48 9 40 8 30 Z"
          className="fill-[#2e2a24] stroke-[#4a4036]"
          strokeWidth="0.4"
        />
        {/* 마을에서 던전으로 가는 길 */}
        {DUNGEONS.map((d) => (
          <line
            key={d.id}
            x1={TOWN_AT.x}
            y1={TOWN_AT.y * 0.5625}
            x2={d.at.x}
            y2={d.at.y * 0.5625}
            className={d.open ? "stroke-ember/50" : "stroke-ash/25"}
            strokeWidth="0.35"
            strokeDasharray="1 1"
          />
        ))}
      </svg>

      {/* 마을 */}
      <div className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${TOWN_AT.x}%`, top: `${TOWN_AT.y}%` }}>
        <svg width="26" height="22" viewBox="-13 -12 26 22" aria-hidden>
          <path d="M-9 8 V-2 L0 -10 L9 -2 V8 z" className="fill-ember/80" />
          <rect x="-2" y="2" width="4" height="6" className="fill-ink" />
        </svg>
        <span className="block whitespace-nowrap text-[11px] text-ember">변경 마을</span>
      </div>

      {/* 던전 */}
      {DUNGEONS.map((d: Dungeon) => {
        const p = progress[d.id];
        const on = d.id === selected;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelect(d.id)}
            className={`group absolute -translate-x-1/2 -translate-y-1/2 rounded-sm px-1.5 py-1 text-center transition-colors ${on ? "bg-ember/15 ring-1 ring-ember" : "hover:bg-panel/60"}`}
            style={{ left: `${d.at.x}%`, top: `${d.at.y}%` }}
          >
            <svg width="34" height="24" viewBox="-17 -15 34 24" className="mx-auto" aria-hidden>
              <TerrainMark terrain={d.terrain} open={d.open} />
            </svg>
            <span className={`block whitespace-nowrap text-xs font-bold ${d.open ? "text-bone" : "text-ash"}`}>{d.name}</span>
            <span className="block whitespace-nowrap text-[10px] text-ash">
              {d.open ? (p ? `탐험 ${p.explored}/${p.total}${p.conquered ? ` · 우두머리 처치 ${p.conquered}` : ""}` : d.level) : "미개척"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
