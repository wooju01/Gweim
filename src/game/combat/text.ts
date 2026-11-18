// 전투 이벤트를 한국어 문장으로. 나중에 애니메이션을 붙여도 이 텍스트는 전투 기록으로 남긴다.
import { STATUS, type StatusKind } from "../../data/combat";
import type { Battle, BattleEvent } from "./engine";

/** 마지막 글자에 받침이 있나. 한글이 아니면 없다고 본다 */
function batchim(word: string): number | null {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return null;
  return (code - 0xac00) % 28;
}

/** 이/가, 을/를, 은/는, 과/와 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  return word + (batchim(word) ? withFinal : withoutFinal);
}

/** 으로/로 (ㄹ 받침은 "로") */
function euro(word: string): string {
  const b = batchim(word);
  return word + (b && b !== 8 ? "으로" : "로");
}

const STATUS_NAME = (kind: StatusKind) => STATUS[kind].name;

export function describe(event: BattleEvent, b: Battle): string {
  const name = (id: string) => (id === "guide" ? "당신" : (b.units.find((u) => u.id === id)?.name ?? "누군가"));

  switch (event.type) {
    case "round":
      return `── ${event.round}라운드 ──`;
    case "attack":
      return `${josa(name(event.actor), "이", "가")} ${josa(name(event.target), "을", "를")} 공격했다. ${event.damage} 피해${event.crit ? " (치명타!)" : ""}`;
    case "status":
      return `${josa(name(event.target), "이", "가")} ${STATUS_NAME(event.kind)}에 걸렸다.`;
    case "tick":
      return `${josa(name(event.target), "이", "가")} ${euro(STATUS_NAME(event.kind))} ${event.damage} 피해를 입었다.`;
    case "cure":
      return event.by === "guide"
        ? `당신이 ${name(event.target)}에게 ${event.kind === "bleed" ? "붕대를 감아 주었다" : "해독제를 건넸다"}. ${josa(STATUS_NAME(event.kind), "이", "가")} 멎었다.`
        : `${josa(name(event.target), "이", "가")} 붕대를 감아 출혈을 멈췄다.`;
    case "heal":
      return `당신이 ${name(event.target)}에게 물약을 건넸다. 체력 ${event.amount} 회복.`;
    case "down":
      return `${josa(name(event.target), "이", "가")} 쓰러졌다.`;
    case "end":
      return event.outcome === "victory" ? "적을 모두 물리쳤다." : "파티가 전멸했다.";
  }
}
