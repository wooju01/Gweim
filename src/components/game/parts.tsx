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

/** 호감도 게이지. 세로 눈금은 영입 기준치. */
export function AffinityBar({ value, threshold }: { value: number; threshold: number }) {
  const reached = value >= threshold;
  return (
    <div className="w-full">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink ring-1 ring-edge">
        <div
          className={`h-full transition-all duration-500 ${reached ? "bg-moss" : "bg-ember/80"}`}
          style={{ width: `${value}%` }}
        />
        <div className="absolute top-0 h-full w-px bg-bone/70" style={{ left: `${threshold}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ash">
        <span>호감 {value}</span>
        <span>기준 {threshold}</span>
      </div>
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
