import { useEffect, useRef, useState } from "react";
import { SKILLS, STATUS, SUPPLY, type SupplyKind } from "@/data/combat";
import { currentActor, validate, type Battle, type BattleAction, type Unit } from "@/game/combat/engine";
import { describe } from "@/game/combat/text";
import { GUIDE } from "@/game/party";
import { Button } from "./parts";

type Props = {
  battle: Battle;
  onAct: (action: BattleAction) => void;
  onLeave: () => void;
};

const SUPPLY_ORDER: SupplyKind[] = ["bandage", "antidote", "potion"];

export function BattleScreen({ battle, onAct, onLeave }: Props) {
  const actor = currentActor(battle);
  const [item, setItem] = useState<SupplyKind | null>(null);
  /** 대상을 골라야 하는 스킬을 겨누는 중 */
  const [aiming, setAiming] = useState(false);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [battle.log.length]);

  const enemies = battle.units.filter((u) => u.side === "enemy");
  const mercs = battle.units.filter((u) => u.side === "merc");
  const can = (action: BattleAction) => validate(battle, action) === null;

  const skill = actor?.skill ? SKILLS[actor.skill] : null;

  function give(target: string) {
    if (!item) return;
    onAct({ type: "guide", item, target });
    setItem(null);
  }

  function cast(target?: string) {
    onAct({ type: "skill", ...(target ? { target } : {}) });
    setAiming(false);
  }

  function attackOrCast(action: BattleAction) {
    onAct(action);
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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-8 sm:px-8">
      <header className="flex items-end justify-between border-b border-edge pb-4">
        <div>
          <p className="text-xs tracking-[0.3em] text-ash">무너진 던전 · 1층</p>
          <h1 className="text-2xl font-bold">전투 · {battle.round}라운드</h1>
        </div>
        <SupplyCounts battle={battle} />
      </header>

      <section aria-label="적" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {enemies.map((u) => (
          <UnitCard key={u.id} unit={u}>
            {aiming && skill?.target === "enemy" && can({ type: "skill", target: u.id }) ? (
              <Button variant="ember" className="w-full !py-1" onClick={() => cast(u.id)}>
                {skill.name}
              </Button>
            ) : (
              actor &&
              can({ type: "attack", target: u.id }) && (
                <Button
                  variant="danger"
                  className="w-full !py-1"
                  onClick={() => attackOrCast({ type: "attack", target: u.id })}
                >
                  공격
                </Button>
              )
            )}
          </UnitCard>
        ))}
      </section>

      <section
        aria-label="전투 기록"
        className="h-48 overflow-y-auto rounded-sm border border-edge bg-panel p-3 text-sm leading-relaxed"
      >
        {battle.log.map((event, i) => (
          <p
            key={i}
            className={
              event.type === "round"
                ? "mt-2 text-center text-xs tracking-widest text-ash"
                : event.type === "down"
                  ? "text-blood"
                  : event.type === "end"
                    ? "mt-2 font-bold text-ember"
                    : "text-bone/85"
            }
          >
            {describe(event, battle)}
          </p>
        ))}
        <div ref={logEnd} />
      </section>

      <section aria-label="용병" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {mercs.map((u) => (
          <UnitCard key={u.id} unit={u} active={actor?.id === u.id}>
            {aiming && skill?.target === "ally" && can({ type: "skill", target: u.id }) && (
              <Button variant="ember" className="w-full !py-1" onClick={() => cast(u.id)}>
                {skill.name}
              </Button>
            )}
            {item && can({ type: "guide", item, target: u.id }) && (
              <Button variant="ember" className="w-full !py-1" onClick={() => give(u.id)}>
                {SUPPLY[item].name} 건네기
              </Button>
            )}
          </UnitCard>
        ))}
      </section>

      {battle.outcome ? (
        <div
          className={`flex flex-col items-start gap-3 rounded-sm border p-4 ${
            battle.outcome === "victory" ? "border-moss/50 bg-moss/10" : "border-blood/50 bg-blood/10"
          }`}
        >
          <p className={battle.outcome === "victory" ? "text-moss" : "text-blood"}>
            {battle.outcome === "victory" ? "살아남았다. 적은 모두 쓰러졌다." : "파티가 전멸했다. 당신만 간신히 도망쳤다."}
          </p>
          <Button variant="ember" onClick={onLeave}>
            길드로 돌아간다
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-sm border border-ember/40 bg-panel p-4">
            <p className="text-sm">
              <span className="font-bold text-ember">{actor?.name}</span>의 차례
            </p>
            <p className="text-xs text-ash">
              {aiming
                ? `${skill?.name}: ${skill?.target === "enemy" ? "위의 적" : "아래 용병"} 카드에서 대상을 고른다.`
                : "위의 적을 골라 공격하거나, 스킬을 쓰거나, 출혈이 있으면 붕대를 감는다."}
            </p>
            {skill && actor && (
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
            <Button disabled={!can({ type: "bandage" })} onClick={() => attackOrCast({ type: "bandage" })}>
              붕대 감기 · 남은 {battle.supplies.bandage}
            </Button>
          </div>

          <div className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
            <p className="text-sm">
              <span className="font-bold">{GUIDE.role}</span>의 보조{" "}
              <span className="text-xs text-ash">· 라운드마다 한 번</span>
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
                      disabled={battle.supplies[kind] <= 0}
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
                  {item ? `${SUPPLY[item].description}. 아래 용병 카드에서 건넬 대상을 고른다.` : "물자를 고르면 건넬 수 있는 용병이 표시된다."}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function SupplyCounts({ battle }: { battle: Battle }) {
  return (
    <ul className="flex gap-3 text-xs text-ash">
      {SUPPLY_ORDER.map((kind) => (
        <li key={kind}>
          {SUPPLY[kind].name} <span className="text-bone">{battle.supplies[kind]}</span>
        </li>
      ))}
    </ul>
  );
}

function UnitCard({ unit, active = false, children }: { unit: Unit; active?: boolean; children?: React.ReactNode }) {
  const down = unit.hp <= 0;
  const ratio = unit.hp / unit.maxHp;
  return (
    <article
      className={`flex flex-col gap-2 rounded-sm border bg-panel p-3 transition-all ${
        active ? "border-ember shadow-[0_0_20px_-6px] shadow-ember/60" : "border-edge"
      } ${down ? "opacity-40" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-bold">{unit.name}</h3>
        {down && <span className="text-[11px] text-blood">쓰러짐</span>}
        {!down && unit.guarding && <span className="text-[11px] text-ember">막아서는 중</span>}
        {!down && !unit.guarding && (unit.shield ?? 0) > 0 && (
          <span className="text-[11px] text-sky-300">보호막 {unit.shield}</span>
        )}
      </div>
      {unit.title && <p className="truncate text-[11px] text-ash">{unit.title}</p>}
      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink ring-1 ring-edge">
          <div
            className={`h-full transition-all duration-500 ${ratio > 0.5 ? "bg-moss" : ratio > 0.25 ? "bg-ember" : "bg-blood"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-ash">
          체력 {unit.hp} / {unit.maxHp}
        </p>
      </div>
      {unit.statuses.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {unit.statuses.map((s) => (
            <li
              key={s.kind}
              className={`rounded-sm px-1.5 py-0.5 text-[11px] ${s.kind === "bleed" ? "bg-blood/20 text-blood" : "bg-moss/20 text-moss"}`}
            >
              {STATUS[s.kind].name} {s.turns}
            </li>
          ))}
        </ul>
      )}
      {children}
    </article>
  );
}
