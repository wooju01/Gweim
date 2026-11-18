import { useEffect, useRef, useState } from "react";
import { SKILLS, STATUS, SUPPLY, type StatusKind, type SupplyKind } from "@/data/combat";
import { getPassive } from "@/data/passives";
import { currentActor, speedOf, validate, type Battle, type BattleAction, type BattleEvent, type Unit } from "@/game/combat/engine";
import { describe } from "@/game/combat/text";
import { GUIDE } from "@/game/party";
import { displayedHp, usePlayback } from "./battle/playback";
import { EnemySilhouette, MercSilhouette } from "./battle/Silhouette";
import { Button } from "./parts";

type Props = {
  battle: Battle;
  onAct: (action: BattleAction) => void;
  onLeave: () => void;
  /** 전투가 끝났을 때 버튼 문구 */
  leaveLabel?: { victory: string; defeat: string };
};

const SUPPLY_ORDER: SupplyKind[] = ["bandage", "antidote", "potion"];

const STATUS_STYLE: Record<StatusKind, string> = {
  bleed: "bg-blood/30 text-blood",
  poison: "bg-moss/30 text-moss",
  crack: "bg-ember/20 text-ember",
  weaken: "bg-edge/70 text-ash",
  awaken: "bg-ember/30 text-ember",
};

/**
 * 무대 위 자리. x: 가로 위치(%), y: 발 위치(%), s: 크기. 앞줄이 아래쪽에 크게, 뒷줄이 위쪽에 작게 선다.
 * 적은 x를 좌우로 뒤집어 오른쪽에 선다.
 */
const SLOTS = [
  { x: 37, y: 86, s: 1 },
  { x: 23, y: 90, s: 1.05 },
  { x: 30, y: 68, s: 0.82 },
  { x: 15, y: 72, s: 0.86 },
  { x: 8, y: 92, s: 1.05 },
];

/** 떠오르는 글자 (피해 숫자, 회복, 상태이상 등) */
type Float = { id: number; unit: string; text: string; tone: "damage" | "crit" | "heal" | "info" | "gold" | "frost" };

const FLOAT_STYLE: Record<Float["tone"], string> = {
  damage: "text-bone text-lg font-bold",
  crit: "text-ember text-2xl font-black",
  heal: "text-moss text-lg font-bold",
  info: "text-ash text-sm",
  gold: "text-ember text-sm font-bold",
  frost: "text-frost text-sm font-bold",
};

/** 이벤트 하나가 만드는 떠오르는 글자 */
function floatsFor(e: BattleEvent): Omit<Float, "id">[] {
  switch (e.type) {
    case "attack":
      return [
        { unit: e.target, text: e.crit ? `${e.damage}!` : String(e.damage), tone: e.crit ? "crit" : "damage" },
        ...(e.absorbed ? [{ unit: e.target, text: `막음 ${e.absorbed}`, tone: "frost" as const }] : []),
      ];
    case "tick":
      return [{ unit: e.target, text: `${STATUS[e.kind].name} ${e.damage}`, tone: "info" }];
    case "recoil":
      return [{ unit: e.target, text: String(e.damage), tone: "damage" }];
    case "heal":
      return e.amount > 0 ? [{ unit: e.target, text: `+${e.amount}`, tone: "heal" }] : [];
    case "status":
      return [{ unit: e.target, text: STATUS[e.kind].name, tone: "info" }];
    case "cure":
      return [{ unit: e.target, text: `${STATUS[e.kind].name} 멎음`, tone: "heal" }];
    case "shield":
      return [{ unit: e.target, text: `보호막 ${e.amount}`, tone: "frost" }];
    case "evade":
      return [{ unit: e.target, text: "회피", tone: "frost" }];
    case "skill":
      return [{ unit: e.actor, text: SKILLS[e.skill].name, tone: "gold" }];
    case "fizzle":
      return [{ unit: e.actor, text: "실패", tone: "info" }];
    case "passive":
      return [{ unit: e.unit, text: getPassive(e.passive)?.name ?? "", tone: "gold" }];
    default:
      return [];
  }
}

/** 지금 이벤트에서 이 유닛이 할 동작 */
function motionFor(unitId: string, e: BattleEvent | null): string {
  if (!e) return "";
  switch (e.type) {
    case "attack":
      if (e.actor === unitId) return "anim-lunge";
      if (e.target === unitId) return "anim-hit";
      return "";
    case "tick":
    case "recoil":
      return e.target === unitId ? "anim-hit" : "";
    case "evade":
      return e.target === unitId ? "anim-dodge" : "";
    case "skill":
    case "fizzle":
      return e.actor === unitId ? "anim-cast" : "";
    default:
      return "";
  }
}

export function BattleScreen({ battle, onAct, onLeave, leaveLabel }: Props) {
  const [speed, setSpeed] = useState(1);
  const play = usePlayback(battle, speed);
  const hp = displayedHp(battle, play.shown);
  // 연출이 끝나기 전에는 입력을 받지 않는다
  const actor = play.playing ? null : currentActor(battle);
  const [item, setItem] = useState<SupplyKind | null>(null);
  /** 대상을 골라야 하는 스킬을 겨누는 중 */
  const [aiming, setAiming] = useState(false);
  const [floats, setFloats] = useState<Float[]>([]);
  const floatId = useRef(0);
  const logEnd = useRef<HTMLDivElement>(null);

  // 새 이벤트가 재생되면 떠오르는 글자를 띄운다
  const { current, currentKey } = play;
  useEffect(() => {
    if (!current) return;
    const added = floatsFor(current).map((f) => ({ ...f, id: ++floatId.current }));
    if (added.length === 0) return;
    setFloats((fs) => [...fs, ...added]);
    const ids = new Set(added.map((f) => f.id));
    const t = setTimeout(() => setFloats((fs) => fs.filter((f) => !ids.has(f.id))), 1150);
    return () => clearTimeout(t);
  }, [current, currentKey]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [play.shown]);

  const can = (action: BattleAction) => !play.playing && validate(battle, action) === null;
  const skill = actor?.skill ? SKILLS[actor.skill] : null;
  const round = [...battle.log.slice(0, play.shown)].reverse().find((e) => e.type === "round");
  const outcome = play.playing ? null : battle.outcome;

  function give(target: string) {
    if (!item) return;
    onAct({ type: "guide", item, target });
    setItem(null);
  }

  function cast(target?: string) {
    onAct({ type: "skill", ...(target ? { target } : {}) });
    setAiming(false);
  }

  function onSkillButton() {
    if (!skill) return;
    if (skill.target === "none") cast();
    else {
      setAiming(!aiming);
      setItem(null);
    }
  }

  /** 무대 위 유닛을 눌렀을 때: 겨눈 스킬, 건넬 물자, 공격 순서로 처리한다 */
  function clickUnit(u: Unit) {
    if (aiming && skill && can({ type: "skill", target: u.id })) return cast(u.id);
    if (item && can({ type: "guide", item, target: u.id })) return give(u.id);
    if (!aiming && !item && can({ type: "attack", target: u.id })) onAct({ type: "attack", target: u.id });
  }

  function clickable(u: Unit): boolean {
    if (aiming) return can({ type: "skill", target: u.id });
    if (item) return can({ type: "guide", item, target: u.id });
    return can({ type: "attack", target: u.id });
  }

  const mercs = battle.units.filter((u) => u.side === "merc");
  const enemies = battle.units.filter((u) => u.side === "enemy");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 sm:px-8">
      <header className="flex items-end justify-between border-b border-edge pb-3">
        <div>
          <p className="text-xs tracking-[0.3em] text-ash">무너진 던전 · {battle.depth}층</p>
          <h1 className="text-2xl font-bold">전투 · {round?.type === "round" ? round.round : 1}라운드</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button className="!px-2 !py-1 text-xs" onClick={() => setSpeed(speed === 1 ? 2 : 1)} title="연출 속도">
            {speed}배속
          </Button>
          {play.playing && (
            <Button className="!px-2 !py-1 text-xs" onClick={play.skip}>
              건너뛰기
            </Button>
          )}
        </div>
      </header>

      {/* 무대 */}
      <section
        aria-label="전투 무대"
        className="relative h-[340px] w-full overflow-hidden rounded-sm border border-edge sm:h-[400px]"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 30%, #2a201a 0%, transparent 70%), linear-gradient(to bottom, #120f0d 0%, #1b1512 55%, #0e0b09 56%, #16110e 100%)",
        }}
      >
        {/* 뒷벽의 기둥 (깊이감) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[56%] opacity-40" aria-hidden>
          {[12, 34, 66, 88].map((x) => (
            <div key={x} className="absolute bottom-0 w-[5%] bg-gradient-to-b from-transparent to-[#2b221c]" style={{ left: `${x}%`, height: "85%" }} />
          ))}
        </div>

        {mercs.map((u, i) => (
          <Figure
            key={u.id}
            unit={u}
            slot={SLOTS[i % SLOTS.length]}
            hp={hp[u.id]}
            active={actor?.id === u.id}
            clickable={clickable(u)}
            motion={motionFor(u.id, play.current)}
            motionKey={play.currentKey}
            floats={floats.filter((f) => f.unit === u.id)}
            onClick={() => clickUnit(u)}
          />
        ))}
        {enemies.map((u, i) => (
          <Figure
            key={u.id}
            unit={u}
            slot={{ ...SLOTS[i % SLOTS.length], x: 100 - SLOTS[i % SLOTS.length].x }}
            hp={hp[u.id]}
            active={false}
            clickable={clickable(u)}
            motion={motionFor(u.id, play.current)}
            motionKey={play.currentKey}
            floats={floats.filter((f) => f.unit === u.id)}
            onClick={() => clickUnit(u)}
          />
        ))}

        {play.current?.type === "round" && (
          <p key={play.currentKey} className="anim-banner pointer-events-none absolute inset-x-0 top-[14%] text-center text-xl text-bone/90">
            {play.current.round}라운드
          </p>
        )}
      </section>

      <section aria-label="전투 기록" className="h-24 overflow-y-auto rounded-sm border border-edge bg-panel px-3 py-2 text-xs leading-relaxed">
        {battle.log.slice(0, play.shown).map((event, i) =>
          event.type === "round" ? null : (
            <p key={i} className={event.type === "down" ? "text-blood" : event.type === "end" ? "font-bold text-ember" : "text-bone/75"}>
              {describe(event, battle)}
            </p>
          ),
        )}
        <div ref={logEnd} />
      </section>

      {outcome ? (
        <div
          className={`flex flex-col items-start gap-3 rounded-sm border p-4 ${
            outcome === "victory" ? "border-moss/50 bg-moss/10" : "border-blood/50 bg-blood/10"
          }`}
        >
          <p className={outcome === "victory" ? "text-moss" : "text-blood"}>
            {outcome === "victory" ? "살아남았다. 적은 모두 쓰러졌다. 상처는 그대로 남는다." : "파티가 전멸했다."}
          </p>
          <Button variant="ember" onClick={onLeave}>
            {outcome === "victory" ? (leaveLabel?.victory ?? "길드로 돌아간다") : (leaveLabel?.defeat ?? "길드로 돌아간다")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-sm border border-ember/40 bg-panel p-4">
            {actor ? (
              <>
                <p className="text-sm">
                  <span className="font-bold text-ember">{actor.name}</span>의 차례
                </p>
                <p className="text-xs text-ash">
                  {aiming
                    ? `${skill?.name}: 무대에서 ${skill?.target === "enemy" ? "적" : "아군"}을 누른다.`
                    : "무대의 적을 눌러 공격하거나, 스킬을 쓰거나, 출혈이 있으면 붕대를 감는다."}
                </p>
                {skill && (
                  <Button
                    variant={aiming ? "ember" : "ghost"}
                    disabled={actor.cooldown > 0}
                    onClick={onSkillButton}
                    title={skill.description}
                    className="text-left"
                  >
                    <span className="font-bold">{skill.name}</span>
                    <span className="ml-2 text-xs text-ash">
                      {actor.cooldown > 0 ? `${actor.cooldown}턴 뒤 사용 가능` : skill.description}
                    </span>
                  </Button>
                )}
                <Button disabled={!can({ type: "bandage" })} onClick={() => onAct({ type: "bandage" })}>
                  붕대 감기 · 남은 {battle.supplies.bandage}
                </Button>
              </>
            ) : (
              <p className="animate-pulse text-sm text-ash">…</p>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
            <p className="text-sm">
              <span className="font-bold">{GUIDE.role}</span>의 보조 <span className="text-xs text-ash">· 라운드마다 한 번</span>
            </p>
            {battle.guideUsed ? (
              <p className="text-xs text-ash">이번 라운드에는 이미 도왔다.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {SUPPLY_ORDER.map((kind) => (
                    <Button
                      key={kind}
                      variant={item === kind ? "ember" : "ghost"}
                      disabled={battle.supplies[kind] <= 0 || play.playing}
                      onClick={() => {
                        setItem(item === kind ? null : kind);
                        setAiming(false);
                      }}
                      title={SUPPLY[kind].description}
                    >
                      {SUPPLY[kind].name} {battle.supplies[kind]}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-ash">
                  {item ? `${SUPPLY[item].description}. 무대에서 건넬 용병을 누른다.` : "물자를 고르면 건넬 수 있는 용병이 빛난다."}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Figure({
  unit,
  slot,
  hp,
  active,
  clickable,
  motion,
  motionKey,
  floats,
  onClick,
}: {
  unit: Unit;
  slot: { x: number; y: number; s: number };
  hp: number;
  active: boolean;
  clickable: boolean;
  motion: string;
  motionKey: number;
  floats: Float[];
  onClick: () => void;
}) {
  const down = hp <= 0;
  const dir = unit.side === "merc" ? 1 : -1;
  const ratio = hp / unit.maxHp;
  const height = 128 * slot.s;
  const color = unit.side === "merc" ? "text-[#5a4a3c]" : "text-[#3a1f1c]";

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-full"
      style={{ left: `${slot.x}%`, top: `${slot.y}%`, zIndex: Math.round(slot.y), ["--dir" as string]: dir }}
    >
      {/* 머리 위 정보 */}
      <div className={`mb-1 flex w-24 flex-col items-center gap-0.5 transition-opacity ${down ? "opacity-0" : ""}`}>
        <span className={`truncate text-[11px] ${active ? "font-bold text-ember" : "text-bone/80"}`}>{unit.name}</span>
        <div className="h-1 w-16 overflow-hidden rounded-full bg-ink ring-1 ring-edge">
          <div
            className={`h-full transition-all duration-500 ${ratio > 0.5 ? "bg-moss" : ratio > 0.25 ? "bg-ember" : "bg-blood"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <span className="text-[10px] text-ash" title={`방어 ${unit.defense} · 속도 ${speedOf(unit)}`}>
          {hp}/{unit.maxHp}
          {(unit.shield ?? 0) > 0 && <span className="ml-1 text-frost">◆{unit.shield}</span>}
        </span>
        {unit.statuses.length > 0 && (
          <div className="flex gap-0.5">
            {unit.statuses.map((s) => (
              <span key={s.kind} className={`rounded-sm px-1 text-[9px] ${STATUS_STYLE[s.kind]}`}>
                {STATUS[s.kind].name}
                {s.turns}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 몸 */}
      <button
        type="button"
        onClick={onClick}
        disabled={!clickable}
        aria-label={`${unit.name} 체력 ${hp}`}
        className={`relative mx-auto block disabled:cursor-default ${clickable ? "cursor-pointer" : ""}`}
        style={{ width: height * 0.8, height }}
      >
        {/* 발밑 그림자, 차례인 용병은 빛난다 */}
        <span
          className={`absolute -bottom-1 left-1/2 h-3 w-[90%] -translate-x-1/2 rounded-[50%] ${
            active ? "bg-ember/50 shadow-[0_0_18px_4px] shadow-ember/40" : clickable ? "bg-bone/25" : "bg-black/50"
          }`}
        />
        <span key={`${motionKey}-${motion}`} className={`absolute inset-0 block ${down ? "anim-fall" : motion}`}>
          <span className={`block h-full w-full ${down ? "" : "anim-breathe"} ${color} ${clickable ? "brightness-150" : ""} transition-[filter]`}>
            {unit.side === "merc" ? <MercSilhouette job={unit.job} race={unit.race} /> : <EnemySilhouette name={unit.name} />}
          </span>
        </span>
        {floats.map((f, i) => (
          <span
            key={f.id}
            className={`anim-float pointer-events-none absolute left-1/2 whitespace-nowrap drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)] ${FLOAT_STYLE[f.tone]}`}
            style={{ top: `${10 - i * 14}%` }}
          >
            {f.text}
          </span>
        ))}
      </button>
    </div>
  );
}
