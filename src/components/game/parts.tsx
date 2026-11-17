import type { Emotion } from "@/lib/schemas";
import type { Merc } from "@/game/types";

const EMOTION_STYLE: Record<Emotion, { label: string; ring: string; glow: string }> = {
  neutral: { label: "무표정", ring: "border-edge", glow: "shadow-none" },
  pleased: { label: "흡족", ring: "border-moss", glow: "shadow-[0_0_24px_-4px] shadow-moss/60" },
  annoyed: { label: "짜증", ring: "border-ember/70", glow: "shadow-[0_0_24px_-6px] shadow-ember/50" },
  angry: { label: "분노", ring: "border-blood", glow: "shadow-[0_0_28px_-4px] shadow-blood/80" },
  sad: { label: "침울", ring: "border-frost/70", glow: "shadow-[0_0_24px_-6px] shadow-frost/50" },
  suspicious: { label: "의심", ring: "border-ash", glow: "shadow-[0_0_20px_-8px] shadow-ash/60" },
};

/** 초상화 자리. 지금은 이니셜 + 감정에 따른 테두리 색만 바뀐다. */
export function Portrait({
  merc,
  emotion = "neutral",
  size = "lg",
}: {
  merc: Merc;
  emotion?: Emotion;
  size?: "sm" | "lg";
}) {
  const style = EMOTION_STYLE[emotion];
  const box = size === "lg" ? "h-56 w-44 text-6xl" : "h-20 w-16 text-2xl";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`${box} ${style.ring} ${style.glow} flex items-center justify-center rounded-sm border-2 bg-gradient-to-b from-panel-hi to-ink font-bold text-bone/80 transition-all duration-500`}
      >
        {merc.name[0]}
      </div>
      {size === "lg" && <span className="text-xs tracking-widest text-ash">{style.label}</span>}
    </div>
  );
}

function StatBar({
  label,
  value,
  unit = "",
  fill,
  delta,
  deltaKey,
}: {
  label: string;
  value: number;
  unit?: string;
  fill: string;
  delta?: number;
  deltaKey?: number;
}) {
  return (
    <div className="relative w-full">
      <div className="mb-1 flex justify-between text-[11px] text-ash">
        <span>{label}</span>
        <span className="text-bone/80">
          {value}
          {unit}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink ring-1 ring-edge">
        <div className={`h-full transition-all duration-500 ${fill}`} style={{ width: `${value}%` }} />
      </div>
      {delta !== undefined && delta !== 0 && (
        <span
          key={deltaKey}
          className={`animate-rise absolute -top-1 right-10 text-xs font-bold ${
            delta > 0 ? "text-moss" : "text-blood"
          }`}
        >
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
  );
}

/**
 * 두 수치 게이지.
 * - 호감: 이 사람을 좋아하는가 (나중에 사기, 배신에 쓰인다)
 * - 고용 의향: 같이 갈 마음. 동행 제안 성공 확률(%)
 */
export function MercStats({
  affinity,
  willingness,
  delta,
  deltaKey,
}: {
  affinity: number;
  willingness: number;
  delta?: { affinity: number; willingness: number };
  deltaKey?: number;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <StatBar label="호감" value={affinity} fill="bg-ember/80" delta={delta?.affinity} deltaKey={deltaKey} />
      <StatBar
        label="고용 의향"
        value={willingness}
        unit="%"
        fill="bg-moss"
        delta={delta?.willingness}
        deltaKey={deltaKey}
      />
    </div>
  );
}

export function Button({
  children,
  variant = "ghost",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ghost" | "ember" | "danger" }) {
  const look = {
    ghost: "border-edge text-bone hover:border-ash hover:bg-panel-hi",
    ember: "border-ember/60 bg-ember/10 text-ember hover:bg-ember/20",
    danger: "border-blood/50 text-blood hover:bg-blood/10",
  }[variant];
  return (
    <button
      className={`rounded-sm border px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${look} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
