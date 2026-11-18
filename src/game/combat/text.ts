// 전투 이벤트를 한국어 문장으로. 나중에 애니메이션을 붙여도 이 텍스트는 전투 기록으로 남긴다.
import { STATUS, getSkill, type StatusKind } from "../../data/combat";
import { getPassive } from "../../data/passives";
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
      return `${josa(name(event.actor), "이", "가")} ${josa(name(event.target), "을", "를")} 공격했다. ${event.damage} 피해${event.crit ? " (치명타!)" : ""}${event.absorbed ? ` · 보호막이 ${event.absorbed} 막음` : ""}`;
    case "status":
      if (event.kind === "awaken") return `${josa(name(event.target), "이", "가")} 각성했다. 2턴 동안 공격이 강해진다.`;
      if (event.kind === "weaken") return `${josa(name(event.target), "이", "가")} 움츠러들었다. (위축)`;
      if (event.kind === "brace") return `${josa(name(event.target), "이", "가")} 자세를 단단히 굳혔다. (버팀)`;
      if (event.kind === "haste") return `${josa(name(event.target), "이", "가")} 다음 수를 노린다. (선제)`;
      if (event.kind === "crack") return `${name(event.target)}의 몸에 균열이 갔다. 받는 피해가 늘어난다.`;
      return `${josa(name(event.target), "이", "가")} ${STATUS_NAME(event.kind)}에 걸렸다.`;
    case "tick":
      return `${josa(name(event.target), "이", "가")} ${euro(STATUS_NAME(event.kind))} ${event.damage} 피해를 입었다.`;
    case "cure": {
      const status = josa(STATUS_NAME(event.kind), "이", "가");
      if (event.via === "skill") return `${name(event.target)}의 ${status} 씻겨 나갔다.`;
      if (event.by === "guide") {
        const how = event.via === "bandage" ? "붕대를 감아 주었다" : "해독제를 건넸다";
        return `당신이 ${name(event.target)}에게 ${how}. ${status} 멎었다.`;
      }
      return `${josa(name(event.target), "이", "가")} 붕대를 감아 출혈을 멈췄다.`;
    }
    case "heal":
      return event.by === "guide"
        ? `당신이 ${name(event.target)}에게 물약을 건넸다. 체력 ${event.amount} 회복.`
        : `${name(event.target)}의 체력이 ${event.amount} 회복되었다.`;
    case "skill": {
      const skill = getSkill(event.skill)?.name ?? "스킬";
      const who = josa(name(event.actor), "이", "가");
      if (event.skill === "guard") return `${who} ${josa(skill, "을", "를")} 펼쳤다. 적의 공격이 그에게 몰린다.`;
      return event.target
        ? `${who} ${event.target === event.actor ? "자신" : name(event.target)}에게 ${josa(skill, "을", "를")} 썼다.`
        : `${who} ${josa(skill, "을", "를")} 썼다.`;
    }
    case "recoil": {
      const by = event.skill === "firelance" ? "불꽃에 몸이 타" : "반동으로";
      return `${josa(name(event.target), "이", "가")} ${by} ${event.damage} 피해를 입었다.`;
    }
    case "shield":
      return `${name(event.target)}의 몸을 정령의 보호막(${event.amount})이 감쌌다.`;
    case "fizzle":
      return `${name(event.actor)}의 부름에 정령이 답하지 않았다.`;
    case "refresh":
      return `${name(event.actor)}의 ${josa(getSkill(event.skill)?.name ?? "스킬", "을", "를")} 바로 다시 쓸 수 있다.`;
    case "disobey":
      return `${josa(name(event.unit), "은", "는")} 명령을 듣지 않고 제멋대로 움직인다.`;
    case "evade":
      return `${josa(name(event.target), "이", "가")} ${name(event.actor)}의 공격을 피했다.`;
    case "passive": {
      const who = name(event.unit);
      switch (event.passive) {
        case "war_cry":
          return `${who}의 포효! 적들이 움츠러든다.`;
        case "first_strike":
          return `${who}의 선제 일격!`;
        case "rising_cheer":
          return `흥이 오를 대로 오른 ${who}의 일격!`;
        case "last_stand":
          return `벼랑 끝에서 ${josa(who, "이", "가")} 버텨 선다.`;
        case "beast_reflex":
          return `${josa(who, "이", "가")} 피하자마자 반격한다!`;
        case "warrior_pride":
          return `${josa(who, "이", "가")} ${name(event.target ?? "")} 대신 공격을 받아 낸다.`;
        case "finishing_bite":
          return `숨통을 끊은 ${josa(who, "이", "가")} 곧바로 다시 움직인다.`;
        default:
          return `${who}의 ${josa(getPassive(event.passive)?.name ?? "특기", "이", "가")} 발동했다.`;
      }
    }
    case "down":
      return `${josa(name(event.target), "이", "가")} 쓰러졌다.`;
    case "end":
      return event.outcome === "victory" ? "적을 모두 물리쳤다." : "파티가 전멸했다.";
  }
}
