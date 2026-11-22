import { useEffect, useRef, useState } from "react";
import { STATUS, SUPPLY, isDot, type StatusKind, type SupplyKind } from "@/data/combat";
import { SKILL_SLOTS, statusTip } from "@/data/skills";
import { getSkill } from "@/game/skills";
import { getPassive } from "@/data/passives";
import {
  currentActor,
  isDowned,
  passiveNote,
  resistOf,
  previewAction,
  skillDef,
  statOf,
  unitStats,
  validate,
  type ActionPreview,
  type Battle,
  type BattleAction,
  type BattleEvent,
  type TargetPreview,
  type Unit,
} from "@/game/combat/engine";
import type { Stage } from "@/lib/schemas";
import { STAT_NAME } from "@/data/growth";
import { describe, josa } from "@/game/combat/text";
import { GUIDE } from "@/game/merc/party";
import { displayedHp, usePlayback } from "./playback";
import { EnemySilhouette, MercSilhouette } from "@/components/common/Silhouette";
import { Button } from "@/components/common/parts";

type Props = {
  battle: Battle;
  onAct: (action: BattleAction) => void;
  onLeave: () => void;
  /** 전투가 끝났을 때 버튼 문구 */
  leaveLabel?: { victory: string; defeat: string };
  /** 용병별 호감 단계 (체력 옆에 표시) */
  bonds?: Record<string, Stage>;
  /** 전투 중 후퇴 (던전 안에서만). 원정을 끝내고 동료들의 호감이 떨어진다 */
  onFlee?: () => void;
  /** 이겼을 때 얻는 것 (금화·유실물·장신구 한 줄씩) */
  spoils?: string[];
  /** 전술실 레벨과 전에 만난 보스 (1레벨: 예고 패턴, 2레벨: 약점) */
  warRoom?: number;
  bossesMet?: string[];
};

const BOND: Record<Stage, { name: string; style: string }> = {
  hostile: { name: "적대", style: "text-blood" },
  wary: { name: "경계", style: "text-ash" },
  neutral: { name: "중립", style: "text-ash" },
  warm: { name: "호의", style: "text-moss" },
  trusted: { name: "신뢰", style: "text-ember" },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

const TARGET_LABEL = { enemy: "적 하나", ally: "아군 하나", none: "대상 없음 (자신·적 전체)" } as const;

/** 호감 단계가 전투에 주는 효과 (경계·중립은 없음) */
const BOND_EFFECT: Partial<Record<Stage, string>> = {
  hostile: "가끔 명령을 무시하고 제멋대로 공격한다",
  warm: "건네받은 물약 효과 +25%",
  trusted: "공격 +1, 건네받은 물약 효과 +25%",
};

const SUPPLY_ORDER: SupplyKind[] = ["bandage", "antidote", "potion"];

/** 상태 표시 색. 따로 정하지 않은 상태는 약화면 회색, 강화면 푸른색 */
const STATUS_COLOR: Partial<Record<StatusKind, string>> = {
  bleed: "bg-blood/30 text-blood",
  poison: "bg-moss/30 text-moss",
  crack: "bg-ember/20 text-ember",
  awaken: "bg-ember/30 text-ember",
  attackUp: "bg-ember/30 text-ember",
  charge: "bg-ember/30 text-ember",
  stun: "bg-blood/20 text-bone",
  bind: "bg-edge/70 text-bone",
  regen: "bg-moss/30 text-moss",
  duel: "bg-ember/20 text-ember",
};
const STATUS_STYLE = Object.fromEntries(
  (Object.keys(STATUS) as StatusKind[]).map((k) => [k, STATUS_COLOR[k] ?? (STATUS[k].debuff ? "bg-edge/70 text-ash" : "bg-frost/20 text-frost")]),
) as Record<StatusKind, string>;

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
  { x: 20, y: 62, s: 0.78 },
];

/**
 * 적 자리 배치. 처음 적은 제자리, 전투 중에 생긴 적(분열·부화·소환)은 등장 장면이 재생된 뒤에
 * 쓰러진 적의 자리를 물려받는다 (자리가 모자라지 않게). 자리를 넘긴 쓰러진 적은 그리지 않는다
 */
function enemyLayout(enemies: Unit[], hp: Record<string, number>, log: BattleEvent[], shown: number): { u: Unit; i: number }[] {
  const spawnedAt = new Map<string, number>();
  log.forEach((e, n) => e.type === "spawn" && spawnedAt.set(e.unit, n));
  const slots: Unit[] = [];
  for (const u of enemies) {
    const at = spawnedAt.get(u.id);
    if (at === undefined) {
      slots.push(u);
      continue;
    }
    if (at >= shown) continue; // 아직 등장하지 않았다
    const free = slots.findIndex((o) => hp[o.id] <= 0);
    if (free >= 0 && slots.length >= SLOTS.length) slots[free] = u;
    else slots.push(u);
  }
  return slots.map((u, i) => ({ u, i }));
}

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
    case "disobey":
      return [{ unit: e.unit, text: "명령 무시", tone: "info" }];
    case "bound":
      return [{ unit: e.target, text: "묶여 있다", tone: "info" }];
    case "spawn":
      return [{ unit: e.unit, text: e.how === "hatch" ? "부화" : e.how === "split" ? "분열" : "등장", tone: "gold" }];
    case "downed":
      return [{ unit: e.target, text: "쓰러짐", tone: "crit" }];
    case "rescue":
      return [{ unit: e.target, text: "구출!", tone: "heal" }];
    case "death":
      return [{ unit: e.target, text: "사망", tone: "crit" }];
    case "skill":
      return [{ unit: e.actor, text: getSkill(e.skill)?.name ?? "", tone: "gold" }];
    case "fizzle":
      return [{ unit: e.actor, text: "실패", tone: "info" }];
    case "fled":
      return [{ unit: e.unit, text: "도주", tone: "info" }];
    case "explode":
      return [{ unit: e.unit, text: "자폭!", tone: "crit" }];
    case "cover":
      return [{ unit: e.unit, text: "감싸기", tone: "gold" }];
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

export function BattleScreen({ battle, onAct, onLeave, leaveLabel, bonds, onFlee, spoils, warRoom = 0, bossesMet = [] }: Props) {
  const [speed, setSpeed] = useState(1);
  const play = usePlayback(battle, speed);
  const hp = displayedHp(battle, play.shown);
  // 연출이 끝나기 전에는 입력을 받지 않는다
  const actor = play.playing ? null : currentActor(battle);
  const [item, setItem] = useState<SupplyKind | null>(null);
  /** 대상을 골라야 하는 스킬을 겨누는 중 (스킬 id) */
  const [aiming, setAiming] = useState<string | null>(null);
  /** 깨우기: 쓰러진 아군을 고르는 중 */
  const [waking, setWaking] = useState(false);
  const [floats, setFloats] = useState<Float[]>([]);
  /** 마우스를 올린 유닛 (스킬·물자 대상 미리보기), 스킬 버튼에 마우스를 올렸는지 */
  const [hover, setHover] = useState<string | null>(null);
  /** 정보를 보는 적 (마지막으로 마우스를 올린 적) */
  const [selected, setSelected] = useState<string | null>(null);
  /** 마지막으로 마우스를 올린 유닛 (미리보기 대상. 마우스를 떼도 남는다) */
  const [target, setTarget] = useState<string | null>(null);
  const [skillHover, setSkillHover] = useState<string | null>(null);
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
  /** 겨누고 있는 스킬 */
  /** 지금 차례 용병의 스킬 (부 조각 레벨 반영) */
  const def = (id: string) => (actor ? skillDef(actor, id) : getSkill(id));
  const skill = aiming ? def(aiming)! : null;
  const round = [...battle.log.slice(0, play.shown)].reverse().find((e) => e.type === "round");
  const outcome = play.playing ? null : battle.outcome;

  function give(target: string) {
    if (!item) return;
    onAct({ type: "guide", item, target });
    setItem(null);
  }

  function cast(id: string, target?: string) {
    onAct({ type: "skill", skill: id, ...(target ? { target } : {}) });
    setAiming(null);
  }

  /** 깨울 수 있는 쓰러진 아군 (하나면 바로 깨운다) */
  const wakeable = battle.units.filter((u) => can({ type: "wake", target: u.id }));
  function onWakeButton() {
    if (wakeable.length === 1) {
      onAct({ type: "wake", target: wakeable[0].id });
      setWaking(false);
    } else {
      setWaking(!waking);
      setAiming(null);
      setItem(null);
    }
  }

  function onSkillButton(id: string) {
    if (def(id)?.target === "none") cast(id);
    else {
      setAiming(aiming === id ? null : id);
      setItem(null);
    }
  }

  /** 무대 위 유닛을 눌렀을 때: 겨눈 스킬, 건넬 물자, 아무것도 고르지 않았으면 평타 */
  function clickUnit(u: Unit) {
    if (waking && can({ type: "wake", target: u.id })) {
      onAct({ type: "wake", target: u.id });
      return setWaking(false);
    }
    if (aiming && can({ type: "skill", skill: aiming, target: u.id })) return cast(aiming, u.id);
    if (item && can({ type: "guide", item, target: u.id })) return give(u.id);
    if (!aiming && !item && can({ type: "attack", target: u.id })) onAct({ type: "attack", target: u.id });
  }

  function clickable(u: Unit): boolean {
    if (waking) return can({ type: "wake", target: u.id });
    if (aiming) return can({ type: "skill", skill: aiming, target: u.id });
    if (item) return can({ type: "guide", item, target: u.id });
    return can({ type: "attack", target: u.id });
  }
  /** 적은 마우스를 올리면 정보가 보인다 (마지막으로 올린 적을 기억한다) */
  const selectable = (u: Unit) => u.side === "enemy" && hp[u.id] > 0;

  /** 단축키 1~4: 그 칸의 스킬을 고른다 (대상이 없는 스킬은 바로 쓴다). 5: 궁극기. Esc: 취소 */
  function onKey(key: string) {
    if (!actor || play.playing) return;
    if (key === "Escape") {
      setAiming(null);
      setItem(null);
      setWaking(false);
      return;
    }
    const n = Number(key);
    if (!Number.isInteger(n) || n < 1 || n > SKILL_SLOTS + 1) return;
    const id = n === SKILL_SLOTS + 1 ? actor.ultimate : actor.skills[n - 1];
    if (!id) return;
    if (id === actor.ultimate ? actor.fx?.ultimateUsed : (actor.cooldowns[id] ?? 0) > 0) return;
    onSkillButton(id);
  }
  // 키 처리기는 매 렌더 새로 만들어지므로 ref로 최신 것을 부른다
  const keyRef = useRef(onKey);
  useEffect(() => {
    keyRef.current = onKey;
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      keyRef.current(e.key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const mercs = battle.units.filter((u) => u.side === "merc");
  const enemies = battle.units.filter((u) => u.side === "enemy");

  // 미리보기: 겨눈 스킬이나 평타를 마우스를 올린 대상에게 썼을 때 (전체 스킬은 버튼에 올렸을 때)
  // 마우스를 뗀 뒤에도 마지막으로 올렸던 대상의 예상 결과를 계속 보여 준다 (다른 대상에 올리면 바뀐다)
  const aimAt = hover ?? target;
  const previewing: BattleAction | null = !actor
    ? null
    : skillHover && def(skillHover)?.target === "none"
      ? { type: "skill", skill: skillHover }
      : aiming && aimAt
        ? { type: "skill", skill: aiming, target: aimAt }
        : !aiming && !item && aimAt
          ? { type: "attack", target: aimAt }
          : null;
  const preview = previewing ? previewAction(battle, previewing) : null;
  // 상대 정보: 마우스를 올린 적, 없으면 마지막으로 올렸던 적 (쓰러졌으면 지운다)
  const hoveredEnemy = hover ? battle.units.find((u) => u.id === hover && u.side === "enemy") : undefined;
  const picked = battle.units.find((u) => u.id === selected && u.side === "enemy" && hp[u.id] > 0);
  const foe = hoveredEnemy ?? picked;

  const figureProps = (u: Unit) => ({
    unit: u,
    hp: hp[u.id],
    clickable: clickable(u),
    selectable: selectable(u),
    picked: u.id === foe?.id,
    motion: motionFor(u.id, play.current),
    motionKey: play.currentKey,
    floats: floats.filter((f) => f.unit === u.id),
    onClick: () => clickUnit(u),
    onHover: (on: boolean) => {
      setHover((h) => (on ? u.id : h === u.id ? null : h));
      if (on) setTarget(u.id);
      if (on && u.side === "enemy") setSelected(u.id);
    },
    preview: preview?.damage.find((d) => d.target === u.id),
    bond: bonds?.[u.id],
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 sm:px-8">
      <header className="flex items-end justify-between border-b border-edge pb-3">
        <div>
          <p className="text-xs tracking-[0.3em] text-ash">{battle.place ?? "던전"} · {battle.depth}층</p>
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
          {onFlee && actor && (
            <Button
              variant="danger"
              className="!px-2 !py-1 text-xs"
              onClick={() => {
                const left = battle.units.filter(isDowned).map((u) => u.name);
                const warn = left.length > 0 ? `\n\n⚠ 쓰러진 ${left.join(", ")}${left.length > 1 ? "은(는)" : josa(left[0], "은", "는").slice(left[0].length)} 남겨진다 (사망).` : "";
                if (window.confirm(`싸움을 버리고 던전을 빠져나간다. 원정은 여기서 끝나고, 동료들은 등을 보인 당신에게 실망할 수 있다. 후퇴할까?${warn}`)) onFlee();
              }}
            >
              후퇴한다
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
          <Figure key={u.id} {...figureProps(u)} slot={SLOTS[i % SLOTS.length]} active={actor?.id === u.id} />
        ))}
        {enemyLayout(enemies, hp, battle.log, play.shown).map(({ u, i }) => (
          <Figure
            key={u.id}
            {...figureProps(u)}
            slot={{ ...SLOTS[i % SLOTS.length], x: 100 - SLOTS[i % SLOTS.length].x }}
            active={false}
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
            <p
              key={i}
              className={
                event.type === "down" || event.type === "death" || event.type === "downed"
                  ? "text-blood"
                  : event.type === "end" || event.type === "rescue"
                    ? "font-bold text-ember"
                    : "text-bone/75"
              }
            >
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
          {outcome === "victory" && spoils && (
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ash">전리품 (살아서 돌아가야 내 것이 된다)</span>
              {spoils.length === 0 ? (
                <span className="text-ash">건질 만한 것이 없었다.</span>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {spoils.flatMap((line) => {
                    // "유실물: A ×2, B" 줄은 하나씩 나눠 보여 준다
                    const [head, rest] = line.split(": ");
                    const items = head === "유실물" && rest ? rest.split(", ") : [line];
                    return items.map((text, i) => (
                      <li
                        key={`${line}-${i}`}
                        className={`rounded-sm border px-2 py-0.5 text-xs ${
                          head === "장신구" ? "border-ember bg-ember/15 text-ember" : head === "유실물" ? "border-edge bg-panel text-bone" : "border-ember/40 text-ember"
                        }`}
                      >
                        {head === "유실물" ? text : line}
                      </li>
                    ));
                  })}
                </ul>
              )}
            </div>
          )}
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
                    ? `${skill?.name}: 무대에서 ${skill?.target === "enemy" ? "적" : "아군"}을 누른다. 마우스를 올리면 예상 결과가 보인다.`
                    : "적을 누르면 평타. 스킬은 버튼이나 숫자키(1~4, 궁극기 5)로 고른 뒤 대상을 누른다. Esc로 취소."}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: SKILL_SLOTS }, (_, i) => {
                    const id = actor.skills[i];
                    if (!id) {
                      return (
                        <div key={i} className="rounded-sm border border-dashed border-edge px-3 py-2 text-xs text-ash/50">
                          빈 칸
                        </div>
                      );
                    }
                    const s = def(id)!;
                    const wait = actor.cooldowns[id] ?? 0;
                    // 대기 중인(비활성) 버튼에는 마우스 이벤트가 오지 않아서, 감싼 칸이 마우스와 설명을 맡는다
                    return (
                      <div
                        key={id}
                        className="group relative"
                        onMouseEnter={() => setSkillHover(id)}
                        onMouseLeave={() => setSkillHover((h) => (h === id ? null : h))}
                      >
                        <Button
                          variant={aiming === id ? "ember" : "ghost"}
                          disabled={wait > 0}
                          onClick={() => onSkillButton(id)}
                          className="w-full text-left !px-3"
                        >
                          <span className="block font-bold">
                            <span className="mr-1.5 rounded-sm border border-edge px-1 text-[10px] font-normal text-ash">{i + 1}</span>
                            {s.name}
                          </span>
                          <span className="block text-[11px] text-ash">{wait > 0 ? `${wait}턴 뒤 사용 가능` : `대기 ${s.cooldown}턴`}</span>
                        </Button>
                        <div
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 hidden w-64 rounded-sm border border-edge bg-ink/95 p-2.5 text-xs leading-relaxed text-bone shadow-lg group-hover:block"
                        >
                          <p className="font-bold text-ember">{s.name}</p>
                          <p>{s.description}</p>
                          <p className="mt-1 text-ash">
                            대상: {TARGET_LABEL[s.target]} · 대기 {s.cooldown}턴{wait > 0 ? ` · ${wait}턴 뒤 사용 가능` : ""}
                          </p>
                          <p className="text-ash">
                            따르는 능력치: {STAT_NAME[statOf(s, undefined, actor)]}
                            {(actor.power?.[statOf(s, undefined, actor)] ?? 0) > 0 && ` (+${actor.power![statOf(s, undefined, actor)]})`}
                          </p>
                          <p className="text-ash">
                            {s.target === "none" ? "무대에 예상 결과가 표시된다." : "누른 뒤 대상에 마우스를 올리면 예상 결과가 보인다."}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {actor.ultimate && def(actor.ultimate) && (
                  <div
                    className="group relative"
                    onMouseEnter={() => setSkillHover(actor.ultimate!)}
                    onMouseLeave={() => setSkillHover((h) => (h === actor.ultimate ? null : h))}
                  >
                    <Button
                      variant={aiming === actor.ultimate ? "ember" : "ghost"}
                      disabled={!!actor.fx?.ultimateUsed}
                      onClick={() => onSkillButton(actor.ultimate!)}
                      className="w-full !border-ember/60 text-left !px-3"
                    >
                      <span className="block font-bold text-ember">
                        <span className="mr-1.5 rounded-sm border border-ember/50 px-1 text-[10px] font-normal">{SKILL_SLOTS + 1}</span>★ {def(actor.ultimate)!.name}
                      </span>
                      <span className="block text-[11px] text-ash">{actor.fx?.ultimateUsed ? "이번 전투에서 이미 썼다" : "궁극기 · 전투당 1번"}</span>
                    </Button>
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 hidden w-64 rounded-sm border border-ember/50 bg-ink/95 p-2.5 text-xs leading-relaxed text-bone shadow-lg group-hover:block"
                    >
                      <p className="font-bold text-ember">★ {def(actor.ultimate)!.name}</p>
                      <p>{def(actor.ultimate)!.description}</p>
                      <p className="mt-1 text-ash">대상: {TARGET_LABEL[def(actor.ultimate)!.target]} · 전투당 1번</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button disabled={!can({ type: "bandage" })} onClick={() => onAct({ type: "bandage" })}>
                    붕대 감기 · 남은 {battle.supplies.bandage}
                  </Button>
                  <Button disabled={play.playing} onClick={() => onAct({ type: "wait" })} title="아무것도 하지 않고 이번 차례를 넘긴다">
                    차례 넘기기
                  </Button>
                  <Button
                    variant={waking ? "ember" : "ghost"}
                    className="col-span-2"
                    disabled={wakeable.length === 0}
                    onClick={onWakeButton}
                    title="이번 차례를 써서 쓰러진 아군을 체력 1로 일으킨다 (같은 아군은 전투당 1번)"
                  >
                    깨우기{wakeable.length > 1 ? (waking ? " · 깨울 아군을 고른다" : ` · ${wakeable.length}명`) : wakeable.length === 1 ? ` · ${wakeable[0].name}` : ""}
                  </Button>
                </div>
              </>
            ) : (
              <p className="animate-pulse text-sm text-ash">…</p>
            )}
          </div>

          <div className="flex flex-col gap-3">
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
                        setAiming(null);
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
          {actor && (
            <div className="flex flex-col gap-1.5 rounded-sm border border-ember/30 bg-panel p-3">
              <p className="text-xs text-ash">
                우리 팀 · <span className="font-bold text-ember">{actor.name}</span>
                <span className="ml-1">
                  체력 {hp[actor.id]}/{actor.maxHp}
                  {(actor.shield ?? 0) > 0 && <span className="text-frost"> · 보호막 {actor.shield}</span>}
                </span>
              </p>
              <ActorStats battle={battle} unit={actor} />
              {preview && (preview.heal || preview.shield || (preview.cures && preview.cures.kinds.length > 0) || preview.failChance > 0) && (
                <div className="rounded-sm border border-edge px-2.5 py-2 text-[11px] text-bone">
                  {preview.heal && (
                    <p className="text-moss">
                      {battle.units.find((u) => u.id === preview.heal!.target)?.name} 체력 +{preview.heal.amount}
                    </p>
                  )}
                  {preview.shield && (
                    <p className="text-frost">
                      {battle.units.find((u) => u.id === preview.shield!.target)?.name} 보호막 {preview.shield.amount}
                    </p>
                  )}
                  {preview.cures && preview.cures.kinds.length > 0 && (
                    <p className="text-moss">{preview.cures.kinds.map((k) => STATUS[k].name).join("·")} 해제</p>
                  )}
                  {preview.failChance > 0 && <p className="text-ash">실패 확률 {pct(preview.failChance)}</p>}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5 rounded-sm border border-blood/30 bg-panel p-3">
            {foe ? (
              <FoeStats unit={foe} hp={hp[foe.id]} preview={preview} battle={battle} intel={foe.kind && bossesMet.includes(foe.kind) ? warRoom : 0} />
            ) : (
              <p className="text-xs text-ash">상대 · 무대의 적에게 마우스를 올리면 그 적의 정보가 보인다.</p>
            )}
          </div>
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
  onHover,
  preview,
  bond,
  selectable,
  picked,
}: {
  unit: Unit;
  slot: { x: number; y: number; s: number };
  hp: number;
  active: boolean;
  clickable: boolean;
  /** 눌러서 정보를 볼 수 있다 (빛나지 않는다) */
  selectable: boolean;
  /** 지금 정보를 보고 있는 적 */
  picked: boolean;
  motion: string;
  motionKey: number;
  floats: Float[];
  onClick: () => void;
  onHover: (on: boolean) => void;
  preview?: TargetPreview;
  bond?: Stage;
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
      {down && unit.side === "merc" && (
        <p
          className={`mb-1 w-24 text-center text-[11px] font-bold ${unit.dead ? "text-ash" : "animate-pulse text-blood"}`}
        >
          {unit.name}
          <br />
          {unit.dead ? "사망" : unit.downedTurnsLeft !== undefined ? `쓰러짐 · ${unit.downedTurnsLeft}차례 뒤 사망` : ""}
        </p>
      )}
      <div className={`mb-1 flex w-24 flex-col items-center gap-0.5 transition-opacity ${down ? "hidden" : ""}`}>
        {preview && (
          <span className="rounded-sm border border-blood/60 bg-ink/90 px-1.5 text-[11px] font-bold text-bone">
            {preview.min === preview.max ? preview.min : `${preview.min}~${preview.max}`}
            {preview.kill === "sure" ? " ☠" : preview.kill === "maybe" ? " ☠?" : ""}
          </span>
        )}
        <span className={`truncate text-[11px] ${active ? "font-bold text-ember" : "text-bone/80"}`}>
          {unit.name}
          {bond && <span className={`ml-1 text-[10px] ${BOND[bond].style}`}>{BOND[bond].name}</span>}
        </span>
        <div className="h-1 w-16 overflow-hidden rounded-full bg-ink ring-1 ring-edge">
          <div
            className={`h-full transition-all duration-500 ${ratio > 0.5 ? "bg-moss" : ratio > 0.25 ? "bg-ember" : "bg-blood"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <span className="text-[10px] text-ash">
          {hp}/{unit.maxHp}
          {(unit.shield ?? 0) > 0 && <span className="ml-1 text-frost">◆{unit.shield}</span>}
        </span>
        {unit.charging && (
          <span className="animate-pulse rounded-sm bg-blood/30 px-1 text-[9px] font-bold text-blood" title="다음 차례에 쓴다. 기절시키면 끊긴다">
            ⚠ {getSkill(unit.charging.skill)?.name ?? "준비"}
          </span>
        )}
        {unit.statuses.length > 0 && (
          <div className="flex gap-0.5">
            {unit.statuses.map((s) => (
              <span key={s.kind} title={statusTip(s)} className={`rounded-sm px-1 text-[9px] ${STATUS_STYLE[s.kind]}`}>
                {STATUS[s.kind].name}
                {isDot(s.kind) ? s.value : s.turns}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 몸 */}
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        disabled={!clickable && !selectable}
        aria-label={`${unit.name} 체력 ${hp}`}
        className={`relative mx-auto block disabled:cursor-default ${clickable || selectable ? "cursor-pointer" : ""}`}
        style={{ width: height * 0.8, height }}
      >
        {/* 발밑 그림자, 차례인 용병은 빛난다 */}
        <span
          className={`absolute -bottom-1 left-1/2 h-3 w-[90%] -translate-x-1/2 rounded-[50%] ${
            active ? "bg-ember/50 shadow-[0_0_18px_4px] shadow-ember/40" : clickable ? "bg-bone/25" : picked ? "bg-blood/40 ring-1 ring-blood/60" : "bg-black/50"
          }`}
        />
        <span key={`${motionKey}-${motion}`} className={`absolute inset-0 block ${down ? "anim-fall" : motion}`}>
          <span className={`block h-full w-full ${down ? "" : "anim-breathe"} ${color} ${clickable ? "brightness-150" : ""} transition-[filter]`}>
            {unit.side === "merc" ? (
              <MercSilhouette job={unit.job} race={unit.race} />
            ) : unit.job ? (
              // 용병형 적: 사람 실루엣을 왼쪽으로 돌려 세운다
              <span className="block h-full w-full -scale-x-100">
                <MercSilhouette job={unit.job} race={unit.race} />
              </span>
            ) : (
              <EnemySilhouette name={unit.name} />
            )}
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

/** 상대(적) 정보와, 겨눈 스킬의 미리보기 */
/** 전술실: 전에 만난 보스의 패턴(1레벨)과 약점(2레벨) */
function BossIntel({ unit, level }: { unit: Unit; level: number }) {
  if (level <= 0 || (unit.rank !== "floorBoss" && unit.rank !== "dungeonBoss")) return null;
  const skills = (unit.skills ?? []).map((id) => getSkill(id)).filter((x): x is NonNullable<typeof x> => !!x);
  const weak: string[] = [];
  if (level >= 2) {
    weak.push(`기절 저항 ${pct(Math.max(0, resistOf(unit, "stun")))}`);
    weak.push(`출혈 저항 ${pct(Math.max(0, resistOf(unit, "bleed")))}`);
    weak.push(`중독 저항 ${pct(Math.max(0, resistOf(unit, "poison")))}`);
    if ((unit.abilities ?? []).some((a) => a.kind === "regen")) weak.push("재생: 불에 그을리거나 피를 흘리면 막힌다");
    if ((unit.evadeBonus ?? 0) > 0) weak.push(`회피 ${pct(unit.evadeBonus ?? 0)} (명중 보정이 도움된다)`);
  }
  return (
    <div className="rounded-sm border border-frost/40 px-2.5 py-1.5 text-frost">
      <p className="font-bold">전술실 기록</p>
      {skills.length === 0 ? (
        <p>예고하는 기술이 없다.</p>
      ) : (
        skills.map((sk) => (
          <p key={sk.id}>
            {sk.telegraph ? "⚠ " : ""}
            {sk.name} <span className="text-bone/70">{sk.description}</span>
            {sk.cooldown > 0 ? <span className="text-ash"> · 대기 {sk.cooldown}턴</span> : null}
          </p>
        ))
      )}
      {weak.length > 0 && <p className="text-bone/80">약점 정보: {weak.join(" · ")}</p>}
    </div>
  );
}

function FoeStats({ unit, hp, preview, battle, intel = 0 }: { unit: Unit; hp: number; preview: ActionPreview | null; battle: Battle; intel?: number }) {
  const stats = unitStats(unit);
  const p = preview?.damage.find((d) => d.target === unit.id);
  const applies = preview?.applies.filter((a) => a.target === unit.id) ?? [];
  return (
    <div className="flex flex-col gap-1 text-[11px] leading-relaxed">
      <p className="text-xs text-ash">
        상대 · <span className="font-bold text-blood">{unit.name}</span>
        <span className="ml-1">
          체력 {hp}/{unit.maxHp}
          {(unit.shield ?? 0) > 0 && <span className="text-frost"> · 보호막 {unit.shield}</span>}
        </span>
      </p>
      <div className="flex flex-col gap-1 rounded-sm bg-ink/60 px-2.5 py-2 text-bone/80">
        {unit.note && <p className="text-ash">{unit.note}</p>}
        <p>
          공격 {stats.attack[0]}~{stats.attack[1]} · 방어 {stats.defense} (받는 피해 -{pct(stats.damageReduction)}) · 속도 {stats.speed} · 회피 {pct(stats.evadeChance)}
        </p>
        <BossIntel unit={unit} level={intel} />
        {unit.charging && (
          <p className="font-bold text-blood">
            ⚠ 준비 중: {getSkill(unit.charging.skill)?.name}
            {unit.charging.target ? ` → ${battle.units.find((u) => u.id === unit.charging!.target)?.name ?? ""}` : ""} · 다음 차례에 쓴다 (기절시키면 끊긴다)
          </p>
        )}
        {unit.statuses.length > 0 && (
          <p className="flex flex-wrap gap-1">
            {unit.statuses.map((s) => (
              <span key={s.kind} title={statusTip(s)} className={`rounded-sm px-1 ${STATUS_STYLE[s.kind]}`}>
                {STATUS[s.kind].name} {isDot(s.kind) ? s.value : `${s.turns}턴`}
              </span>
            ))}
          </p>
        )}
        {unit.passives && unit.passives.length > 0 && (
          <p className="text-ember/90">
            {unit.passives
              .map((id) => {
                const note = passiveNote(battle, unit, id);
                return `${getPassive(id)?.name ?? id}${note && note !== "상시" ? ` (${note})` : ""}`;
              })
              .join(" · ")}
          </p>
        )}
      </div>
      {(p || applies.length > 0) && (
        <div className="rounded-sm border border-edge px-2.5 py-2 text-bone">
          {p && (
            <>
              <p>
                예상 피해 <b>{p.min === p.max ? p.min : `${p.min}~${p.max}`}</b>
                {p.kill === "sure" ? <span className="ml-1 text-blood">처치 확실</span> : p.kill === "maybe" ? <span className="ml-1 text-ember">처치 가능</span> : null}
              </p>
              <p className="text-ash">
                치명타({pct(p.critChance)}) {p.critMin}~{p.critMax}
                {p.hitChance < 1 && ` · 명중 ${pct(p.hitChance)}`}
              </p>
              {p.statuses.length > 0 && <p className="text-ash">{p.statuses.map((s) => `${STATUS[s.kind].name} ${pct(s.chance)}`).join(" · ")}</p>}
            </>
          )}
          {applies.length > 0 && <p className="text-ash">{applies.map((a) => `${STATUS[a.kind].name} ${a.chance >= 1 ? "확정" : pct(a.chance)}`).join(" · ")}</p>}
          {preview!.selfCost > 0 && <p className="text-blood">자기 체력 -{preview!.selfCost}</p>}
        </div>
      )}
    </div>
  );
}

/** 현재 차례 용병의 능력치, 효과, 패시브 (속도는 보여 주되 행동 순서는 숨긴다) */
function ActorStats({ battle, unit }: { battle: Battle; unit: Unit }) {
  const stats = unitStats(unit);
  return (
    <div className="flex flex-col gap-1 rounded-sm bg-ink/60 px-2.5 py-2 text-[11px] text-bone/80">
      <p>
        공격 {stats.attack[0]}~{stats.attack[1]} · 방어 {stats.defense} (받는 피해 -{pct(stats.damageReduction)}) · 속도 {stats.speed} · 치명타 {pct(stats.critChance)} · 회피 {pct(stats.evadeChance)}
      </p>
      {(["str", "mag", "faith"] as const).some((k) => (unit.power?.[k] ?? 0) > 0) && (
        <p className="text-ember/90">
          {(["str", "mag", "faith"] as const)
            .filter((k) => (unit.power?.[k] ?? 0) > 0)
            .map((k) => `${STAT_NAME[k]} +${unit.power![k]}`)
            .join(" · ")}
        </p>
      )}
      {unit.statuses.length > 0 && (
        <p className="flex flex-wrap gap-1">
          {unit.statuses.map((s) => (
            <span key={s.kind} title={statusTip(s)} className={`rounded-sm px-1 ${STATUS_STYLE[s.kind]}`}>
              {STATUS[s.kind].name} {isDot(s.kind) ? s.value : `${s.turns}턴`}
            </span>
          ))}
        </p>
      )}
      {unit.bond && BOND_EFFECT[unit.bond] && <p className={BOND[unit.bond].style}>{BOND[unit.bond].name}: {BOND_EFFECT[unit.bond]}</p>}
      {unit.passives?.map((id) => {
        const passive = getPassive(id);
        const note = passiveNote(battle, unit, id);
        return (
          <p key={id} className={`group relative w-fit cursor-default ${note ? "text-ember" : "text-ash"}`}>
            ✦ {passive?.name}
            <span className="ml-1 text-[10px]">{note ? (note === "상시" ? "" : `· ${note}`) : "· 꺼짐"}</span>
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 hidden w-56 rounded-sm border border-edge bg-ink/95 px-2.5 py-2 text-xs text-bone shadow-lg group-hover:block"
            >
              {passive?.description}
            </span>
          </p>
        );
      })}
    </div>
  );
}
