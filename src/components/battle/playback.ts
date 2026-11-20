// 전투 이벤트 재생. 엔진은 행동 한 번에 결과(이벤트 여러 개)를 한꺼번에 내놓으므로,
// 화면은 그 이벤트를 하나씩 꺼내 연출한다. 규칙은 건드리지 않는다.
import { useEffect, useRef, useState } from "react";
import type { Battle, BattleEvent } from "@/game/combat/engine";

/** 이벤트 하나를 보여 주는 시간 (ms, 1배속 기준) */
export function eventDuration(e: BattleEvent): number {
  switch (e.type) {
    case "attack":
      return 650;
    case "round":
      return 450;
    case "down":
    case "skill":
      return 550;
    case "end":
      return 300;
    default:
      return 380;
  }
}

/**
 * 아직 재생하지 않은 이벤트를 거꾸로 되돌려, 지금 화면에 보여 줄 체력을 구한다.
 * (엔진의 체력은 이미 최종값이므로)
 */
export function displayedHp(battle: Battle, shown: number): Record<string, number> {
  const hp: Record<string, number> = Object.fromEntries(battle.units.map((u) => [u.id, u.hp]));
  for (let i = battle.log.length - 1; i >= shown; i--) {
    const e = battle.log[i];
    if (e.type === "attack" || e.type === "tick" || e.type === "recoil") hp[e.target] += e.damage;
    if (e.type === "heal") hp[e.target] -= e.amount;
  }
  for (const u of battle.units) hp[u.id] = Math.max(0, Math.min(u.maxHp, hp[u.id]));
  return hp;
}

/**
 * 전투 기록을 차례로 재생한다. shown: 지금까지 보여 준 이벤트 수.
 * current: 방금 재생을 시작한 이벤트 (연출 대상), key는 같은 이벤트를 구별하는 번호.
 */
export function usePlayback(battle: Battle, speed: number) {
  const [shown, setShown] = useState(0);
  const total = battle.log.length;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (shown >= total) return;
    // 직전 이벤트의 연출 시간만큼 기다렸다가 다음 이벤트로 넘어간다
    const prev = shown > 0 ? battle.log[shown - 1] : null;
    const wait = prev ? eventDuration(prev) / speed : 150;
    timer.current = setTimeout(() => setShown((n) => n + 1), wait);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [shown, total, battle.log, speed]);

  const current = shown > 0 ? battle.log[shown - 1] : null;
  return {
    shown,
    playing: shown < total,
    current,
    currentKey: shown - 1,
    /** 남은 연출을 건너뛴다 */
    skip: () => setShown(total),
  };
}
