// 던전 갈래 지도 (프로토타입). 지역 데이터에서 자동으로 나무 모양을 그린다 (game/dungeon/atlas.ts).
// 가 본 지역은 이름이 보이고, 아직 못 가 본 지역은 "???"로 남는다. 던전 입구와 층 끝 갈래 선택에서 같이 쓴다.
import { bossNames, recommendedLabel } from "@/data/regions";
import { layoutDungeon } from "@/game/dungeon/atlas";

type Props = {
  dungeonId: string;
  explored: string[];
  conquered: string[];
  /** 지금 있는 지역 */
  current?: string;
  /** 지금 고를 수 있는 갈래 (이름이 보이고 반짝인다) */
  options?: string[];
  onPick?: (regionId: string) => void;
  /** 눌러서 고른 지역 (정보 보기) */
  selected?: string | null;
  onSelect?: (regionId: string) => void;
};

/** 층 한 줄의 높이 (px) */
const ROW = 84;

export function DungeonTree({ dungeonId, explored, conquered, current, options = [], onPick, selected, onSelect }: Props) {
  const layout = layoutDungeon(dungeonId);
  const known = (id: string) => explored.includes(id) || options.includes(id) || id === current;
  // 히든 지역은 발견하기(가 보거나 갈래로 열리기) 전에는 그리지 않는다
  const nodes = layout.nodes.filter((n) => !n.region.hidden || known(n.region.id));
  const shown = new Set(nodes.map((n) => n.region.id));
  const edges = [...layout.edges, ...layout.hidden].filter(([a, b]) => shown.has(a) && shown.has(b));
  if (nodes.length === 0) return <p className="text-sm text-ash">아직 아무도 길을 그리지 못한 곳이다.</p>;
  const levels = new Set(nodes.map((n) => n.region.depth)).size;
  const height = levels * ROW;
  // 좌우 여백을 두고 0~1을 8~92%로
  const px = (x: number) => 8 + x * 84;
  const py = (y: number) => 30 + y * (height - 60);
  const at = Object.fromEntries(nodes.map((n) => [n.region.id, n]));

  return (
    <div className="relative w-full overflow-hidden rounded-sm border border-edge bg-ink/60" style={{ height }}>
      {/* 층 눈금 */}
      {[...new Set(nodes.map((n) => n.region.depth))].map((d) => {
        const y = nodes.find((n) => n.region.depth === d)!.y;
        return (
          <span key={d} className="absolute left-2 -translate-y-1/2 text-[10px] text-ash/70" style={{ top: py(y) }}>
            {d}층
          </span>
        );
      })}
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
        {edges.map(([a, b]) => {
          const lit = known(a) && explored.includes(b);
          const open = a === current && options.includes(b);
          return (
            <line
              key={`${a}-${b}`}
              x1={px(at[a].x)}
              y1={py(at[a].y)}
              x2={px(at[b].x)}
              y2={py(at[b].y)}
              vectorEffect="non-scaling-stroke"
              className={open ? "stroke-ember" : lit ? "stroke-ember/60" : "stroke-edge"}
              strokeWidth={open ? 2 : 1.2}
              strokeDasharray={lit || open ? undefined : "4 4"}
            />
          );
        })}
      </svg>
      {nodes.map(({ region: r, x, y }) => {
        const isKnown = known(r.id);
        const here = r.id === current;
        const option = options.includes(r.id);
        const won = conquered.includes(r.id);
        const bosses = bossNames(r);
        const boss = bosses.length > 0;
        const clickable = (option && onPick) || onSelect;
        return (
          <button
            key={r.id}
            type="button"
            disabled={!clickable}
            onClick={() => (option && onPick ? onPick(r.id) : onSelect?.(r.id))}
            title={isKnown ? `${r.name} · 권장 ${recommendedLabel(r)}${boss ? ` · 우두머리 ${explored.includes(r.id) ? bosses.join(" / ") : "?"}` : ""}` : "아직 가 보지 않은 곳"}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-sm border px-2 py-1 text-center text-[11px] leading-tight transition-colors ${
              here
                ? "border-ember bg-ember/20 text-ember ring-2 ring-ember/60"
                : option
                  ? "animate-pulse border-ember bg-panel text-bone hover:bg-ember/20"
                  : selected === r.id
                    ? "border-bone bg-panel-hi text-bone"
                    : isKnown
                      ? "border-edge bg-panel text-bone enabled:hover:border-ember/60"
                      : "border-dashed border-edge bg-ink/80 text-ash enabled:hover:border-ash"
            }`}
            style={{ left: `${px(x)}%`, top: py(y) }}
          >
            <span className="whitespace-nowrap font-bold">{isKnown ? r.name : "???"}</span>
            <span className="whitespace-nowrap text-[10px] text-ash">
              {isKnown ? `권장 ${recommendedLabel(r)}` : "미탐험"}
              {boss && <span className={won ? " text-ember" : " text-blood"}>{won ? " · 우두머리 처치함" : " · 우두머리"}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
