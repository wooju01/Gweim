// 마을 무대. 전투 무대처럼 겹친 배경(하늘·먼 산·건물·광장)으로 깊이감을 내고,
// 시설은 건물 실루엣으로 둔다. 마우스를 움직이면 층마다 다르게 움직인다(시차).
// 진짜 그림이 생기면 각 건물의 <svg>만 바꾸면 된다.
import { useRef } from "react";
import type { Merc } from "@/game/types";
import { MercSilhouette } from "../battle/Silhouette";
import type { TownPlace } from "../state";

export type SceneFacility = {
  key: string;
  place?: TownPlace;
  name: string;
  status?: string;
  /** 아직 열리지 않은 시설 */
  later?: string;
};

type Props = {
  facilities: SceneFacility[];
  party: Merc[];
  onGo: (place: TownPlace) => void;
};

/** 건물 자리: x(가운데 %), w(너비 %), h(높이 px), 그리고 모양 */
const LAYOUT: Record<string, { x: number; w: number; h: number; shape: (lit: boolean) => React.ReactNode }> = {
  forge: { x: 7, w: 13, h: 150, shape: (lit) => <Forge lit={lit} /> },
  hall: { x: 19, w: 9, h: 230, shape: (lit) => <Tower lit={lit} /> },
  guild: { x: 34, w: 21, h: 210, shape: (lit) => <Guild lit={lit} /> },
  tavern: { x: 50, w: 11, h: 130, shape: (lit) => <Tavern lit={lit} /> },
  inn: { x: 63, w: 14, h: 175, shape: (lit) => <Inn lit={lit} /> },
  shop: { x: 77, w: 12, h: 120, shape: (lit) => <Shop lit={lit} /> },
  gate: { x: 92, w: 15, h: 250, shape: (lit) => <Gate lit={lit} /> },
  yard: { x: 12, w: 12, h: 60, shape: (lit) => <Yard lit={lit} /> },
};

export function TownScene({ facilities, party, onGo }: Props) {
  const stage = useRef<HTMLDivElement>(null);

  // 마우스 위치를 CSS 변수로만 넘긴다 (다시 그리지 않는다)
  function onMove(e: React.MouseEvent) {
    const el = stage.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--px", String(((e.clientX - r.left) / r.width) * 2 - 1));
    el.style.setProperty("--py", String(((e.clientY - r.top) / r.height) * 2 - 1));
  }
  const layer = (depth: number): React.CSSProperties => ({
    transform: `translate(calc(var(--px, 0) * ${-depth}px), calc(var(--py, 0) * ${-depth * 0.4}px))`,
  });

  return (
    <section
      ref={stage}
      aria-label="마을 풍경"
      onMouseMove={onMove}
      className="relative h-[420px] w-full overflow-hidden rounded-sm border border-edge"
      style={{ background: "linear-gradient(to bottom, #0b0a12 0%, #17131a 45%, #221a16 70%, #120e0b 100%)" }}
    >
      {/* 달과 먼 하늘 */}
      <div className="pointer-events-none absolute inset-0 transition-transform duration-300 ease-out" style={layer(4)} aria-hidden>
        <div className="absolute right-[22%] top-[9%] h-14 w-14 rounded-full bg-bone/70 shadow-[0_0_60px_12px] shadow-bone/15" />
        {[8, 17, 29, 44, 58, 71, 83].map((x, i) => (
          <span key={x} className="absolute h-0.5 w-0.5 rounded-full bg-bone/60" style={{ left: `${x}%`, top: `${6 + ((i * 7) % 20)}%` }} />
        ))}
      </div>

      {/* 먼 산등성이와 던전이 있는 절벽 */}
      <svg className="pointer-events-none absolute inset-x-[-4%] bottom-[28%] h-[45%] w-[108%] transition-transform duration-300 ease-out" style={layer(10)} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
        <path d="M0 40 L0 26 L10 18 L18 24 L28 12 L38 22 L48 16 L60 25 L70 14 L78 20 L86 6 L94 2 L100 8 L100 40 Z" fill="#1b1619" />
      </svg>

      {/* 안개 */}
      <div className="anim-fog pointer-events-none absolute inset-x-0 bottom-[22%] h-24 bg-gradient-to-t from-transparent via-ash/10 to-transparent" aria-hidden />

      {/* 건물 */}
      <div className="absolute inset-0 transition-transform duration-300 ease-out" style={layer(18)}>
        {facilities.map((f) => {
          const at = LAYOUT[f.key];
          if (!at) return null;
          const open = !!f.place;
          return (
            <button
              key={f.key}
              type="button"
              disabled={!open}
              onClick={() => f.place && onGo(f.place)}
              aria-label={`${f.name}${f.status ? ` · ${f.status}` : ""}${f.later ? ` · ${f.later}` : ""}`}
              className={`group absolute -translate-x-1/2 disabled:cursor-default ${open ? "cursor-pointer" : ""}`}
              style={{ left: `${at.x}%`, bottom: f.key === "yard" ? "8%" : "22%", width: `${at.w}%`, height: at.h, zIndex: f.key === "yard" ? 20 : 10 }}
            >
              <span
                className={`block h-full w-full transition-[filter,transform] duration-200 ${
                  open ? "text-[#2a211c] group-hover:-translate-y-1 group-hover:brightness-[1.8] group-hover:drop-shadow-[0_0_14px_rgba(217,118,43,0.45)]" : "text-[#1d1816] opacity-70"
                }`}
              >
                {at.shape(open)}
              </span>
              {/* 이름표: 열린 시설은 늘 보이고, 마우스를 올리면 상태까지 */}
              <span
                className={`pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-sm border px-2 py-0.5 text-center text-xs ${
                  open ? "border-ember/50 bg-ink/85 text-ember" : "border-edge bg-ink/70 text-ash"
                }`}
              >
                {f.name}
                <span className="hidden text-[10px] text-bone/80 group-hover:block">{f.status ?? f.later}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 광장 바닥 */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[24%]"
        style={{ background: "repeating-linear-gradient(90deg, #1a1411 0 38px, #1e1814 38px 40px), linear-gradient(to bottom, #241c17, #110d0a)", backgroundBlendMode: "multiply" }}
        aria-hidden
      />

      {/* 광장에 선 길안내자와 원정 파티 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[5%] flex items-end justify-center gap-3 transition-transform duration-300 ease-out" style={layer(26)} aria-hidden>
        <figure className="flex flex-col items-center">
          <span className="anim-breathe block h-[86px] w-[60px] text-[#5a4a3c]">
            <MercSilhouette />
          </span>
          <span className="mt-0.5 text-[10px] text-ember">길안내자</span>
        </figure>
        {party.map((m) => (
          <figure key={m.id} className="flex flex-col items-center">
            <span className="anim-breathe block h-[78px] w-[54px] text-[#4a3d32]" style={{ animationDelay: `${(m.id.length % 5) * 0.3}s` }}>
              <MercSilhouette job={m.job} race={m.race} />
            </span>
            <span className="mt-0.5 text-[10px] text-bone/70">{m.name}</span>
          </figure>
        ))}
      </div>
    </section>
  );
}

// ── 건물 실루엣 (viewBox 0 0 100 100, 아래가 땅) ──

const Window = ({ x, y, w = 8, h = 10, lit }: { x: number; y: number; w?: number; h?: number; lit: boolean }) => (
  <rect x={x} y={y} width={w} height={h} className={lit ? "anim-flicker fill-ember/80" : "fill-black/40"} />
);

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full fill-current" aria-hidden>
      {children}
    </svg>
  );
}

function Guild({ lit }: { lit: boolean }) {
  return (
    <Svg>
      <path d="M2 100 V44 L50 8 L98 44 V100 Z" />
      <path d="M46 8 V-2 M46 -2 L60 2 L46 6" stroke="currentColor" strokeWidth={1.5} />
      <rect x={38} y={68} width={24} height={32} className="fill-black/50" />
      <Window x={12} y={54} lit={lit} />
      <Window x={80} y={54} lit={lit} />
      <Window x={45} y={34} w={10} h={12} lit={lit} />
      {/* 길드 깃발 */}
      <path d="M22 46 V74 L28 70 L34 74 V46 Z" className={lit ? "fill-blood/70" : "fill-black/30"} />
    </Svg>
  );
}

function Inn({ lit }: { lit: boolean }) {
  return (
    <Svg>
      <path d="M4 100 V40 L50 14 L96 40 V100 Z" />
      <rect x={70} y={10} width={8} height={20} />
      <Window x={14} y={50} lit={lit} />
      <Window x={46} y={50} lit={lit} />
      <Window x={76} y={50} lit={lit} />
      <Window x={14} y={74} lit={lit} />
      <rect x={44} y={74} width={14} height={26} className="fill-black/50" />
    </Svg>
  );
}

function Shop({ lit }: { lit: boolean }) {
  return (
    <Svg>
      <path d="M6 100 V36 H94 V100 Z" />
      {/* 차양 */}
      <path d="M0 36 L10 22 H90 L100 36 Z" className={lit ? "fill-ember/40" : "fill-black/20"} />
      <rect x={14} y={48} width={72} height={22} className={lit ? "anim-flicker fill-ember/50" : "fill-black/40"} />
      <rect x={20} y={70} width={60} height={6} className="fill-black/30" />
    </Svg>
  );
}

function Gate({ lit }: { lit: boolean }) {
  return (
    <Svg>
      {/* 절벽과 동굴 입구 */}
      <path d="M0 100 V30 L18 10 L40 4 L70 8 L100 0 V100 Z" />
      <path d="M26 100 V62 Q50 34 74 62 V100 Z" className="fill-black/80" />
      {/* 횃불 */}
      <rect x={18} y={60} width={3} height={14} className="fill-black/50" />
      <rect x={79} y={60} width={3} height={14} className="fill-black/50" />
      {lit && (
        <>
          <circle cx={19.5} cy={57} r={3.2} className="anim-flicker fill-ember" />
          <circle cx={80.5} cy={57} r={3.2} className="anim-flicker fill-ember" />
        </>
      )}
    </Svg>
  );
}

function Forge({ lit }: { lit: boolean }) {
  return (
    <Svg>
      <path d="M4 100 V46 L50 26 L96 46 V100 Z" />
      <rect x={66} y={4} width={12} height={34} />
      <rect x={30} y={64} width={40} height={36} className={lit ? "fill-ember/40" : "fill-black/40"} />
    </Svg>
  );
}

function Tower({ lit }: { lit: boolean }) {
  return (
    <Svg>
      <path d="M20 100 V24 L50 0 L80 24 V100 Z" />
      <Window x={42} y={34} w={16} h={14} lit={lit} />
      <Window x={42} y={62} w={16} h={14} lit={lit} />
    </Svg>
  );
}

function Tavern({ lit }: { lit: boolean }) {
  return (
    <Svg>
      <path d="M6 100 V40 L50 18 L94 40 V100 Z" />
      <Window x={16} y={54} w={18} h={14} lit={lit} />
      <Window x={66} y={54} w={18} h={14} lit={lit} />
      <rect x={40} y={66} width={20} height={34} className="fill-black/50" />
      {/* 간판 */}
      <rect x={40} y={36} width={20} height={10} className="fill-black/40" />
    </Svg>
  );
}

function Yard({ lit }: { lit: boolean }) {
  return (
    <Svg>
      {/* 울타리와 허수아비 */}
      <path d="M0 100 V60 H4 V100 M24 100 V60 H28 V100 M48 100 V60 H52 V100 M72 100 V60 H76 V100 M96 100 V60 H100 V100 M0 70 H100 V76 H0 Z" />
      <path d="M58 100 V30 M46 44 H70 M58 20 a6 6 0 1 0 0.1 0" stroke="currentColor" strokeWidth={4} className={lit ? "" : "opacity-80"} />
    </Svg>
  );
}
