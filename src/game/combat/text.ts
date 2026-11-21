// 전투 이벤트를 한국어 문장으로. 나중에 애니메이션을 붙여도 이 텍스트는 전투 기록으로 남긴다.
import { STATUS, type StatusKind } from "@/data/combat";
import { getSkill } from "@/game/skills";
import { getPassive } from "@/data/passives";
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
  /** 쓴 유닛의 스킬 책에서 찾고, 없으면 id로 (몬스터 스킬) */
  const skillName = (unit: string, id: string) => b.units.find((u) => u.id === unit)?.book?.[id]?.name ?? getSkill(id)?.name ?? "스킬";

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
      if (event.kind === "bind") return `${josa(name(event.target), "이", "가")} 거미줄에 묶였다. 다음 차례를 쉰다.`;
      if (event.kind === "crack") return `${name(event.target)}의 몸에 균열이 갔다. 받는 피해가 늘어난다.`;
      if (event.kind === "cover") return `${name(event.target)}의 곁을 동료가 지키고 선다. (보호받음)`;
      if (event.kind === "duel") return `${josa(name(event.target), "이", "가")} 결투를 받아들였다. 이제 결투 상대만 노린다.`;
      if (event.kind === "stun") return `${josa(name(event.target), "이", "가")} 기절했다. 다음 차례를 쉰다.`;
      if (event.kind === "charge") return `${josa(name(event.target), "이", "가")} 힘을 모은다. 다음 공격이 강해진다.`;
      if (event.kind === "regen") return `${name(event.target)}의 상처가 조금씩 아물기 시작한다. (재생)`;
      if (!STATUS[event.kind].debuff) return `${josa(name(event.target), "이", "가")} ${STATUS_NAME(event.kind)} 효과를 받았다.`;
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
      const skill = skillName(event.actor, event.skill);
      const who = josa(name(event.actor), "이", "가");
      return event.target
        ? `${who} ${event.target === event.actor ? "자신" : name(event.target)}에게 ${josa(skill, "을", "를")} 썼다.`
        : `${who} ${josa(skill, "을", "를")} 썼다.`;
    }
    case "recoil": {
      const by = "반동으로";
      return `${josa(name(event.target), "이", "가")} ${by} ${event.damage} 피해를 입었다.`;
    }
    case "shield":
      return `${name(event.target)}의 몸을 보호막(${event.amount})이 감쌌다.`;
    case "fizzle":
      return `${name(event.actor)}의 부름에 정령이 답하지 않았다.`;
    case "downed":
      return `${josa(name(event.target), "이", "가")} 쓰러졌다! ${event.turns}차례 안에 물약이나 회복 스킬로 일으키지 않으면 죽는다.`;
    case "rescue":
      return event.via === "potion"
        ? `당신이 ${name(event.target)}에게 물약을 먹였다. ${josa(name(event.target), "이", "가")} 일어났다.`
        : event.via === "miracle"
          ? `기적이 일어났다! ${josa(name(event.target), "이", "가")} 다시 일어났다.`
          : `${josa(name(event.by), "이", "가")} ${josa(name(event.target), "을", "를")} 일으켰다.`;
    case "death":
      return `${josa(name(event.target), "이", "가")} 숨을 거두었다.`;
    case "refresh":
      return `${name(event.actor)}의 ${josa(skillName(event.actor, event.skill), "을", "를")} 바로 다시 쓸 수 있다.`;
    case "fled":
      return `${josa(name(event.unit), "이", "가")} 재빨리 달아났다.`;
    case "explode":
      return `${josa(name(event.unit), "이", "가")} 품고 있던 폭탄을 터뜨렸다!`;
    case "cover":
      return `${josa(name(event.unit), "이", "가")} ${name(event.target)} 대신 공격을 받아 냈다.`;
    case "wait":
      return `${josa(name(event.unit), "은", "는")} 숨을 고르며 차례를 넘겼다.`;
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
    case "bound":
      return `${josa(name(event.target), "은", "는")} 묶여서 움직이지 못한다.`;
    case "stunned":
      return `${josa(name(event.target), "은", "는")} 정신을 잃고 차례를 넘겼다.`;
    case "resist":
      return `${josa(name(event.target), "이", "가")} ${STATUS_NAME(event.kind)}을(를) 버텨 냈다.`;
    case "spawn":
      switch (event.how) {
        case "split":
          return `${name(event.by)}에게서 ${josa(name(event.unit), "이", "가")} 떨어져 나왔다.`;
        case "hatch":
          return `${josa(name(event.by), "이", "가")} 터지고 ${josa(name(event.unit), "이", "가")} 기어 나왔다.`;
        case "brood":
          return `${josa(name(event.by), "이", "가")} ${josa(name(event.unit), "을", "를")} 낳았다.`;
        case "summon":
          return `${josa(name(event.by), "이", "가")} ${josa(name(event.unit), "을", "를")} 불렀다.`;
      }
      break;
    case "charge": {
      const skill = getSkill(event.skill);
      const warn = skill?.warn?.replace("{name}", name(event.unit));
      const aim = event.target ? ` ${name(event.target)}을(를) 노려본다.` : "";
      return `⚠ ${warn ?? `${josa(name(event.unit), "이", "가")} ${josa(skill?.name ?? "큰 기술", "을", "를")} 준비한다.`}${aim} (다음 차례에 ${skill?.name ?? "기술"})`;
    }
    case "interrupt":
      return `${josa(name(event.unit), "이", "가")} 기절해서 ${josa(skillName(event.unit, event.skill), "이", "가")} 끊겼다!`;
    case "noRegen":
      return `${name(event.unit)}의 상처가 ${event.why === "fire" ? "불에 그을려" : "피를 흘려"} 아물지 않는다.`;
    case "end":
      return event.outcome === "victory" ? "적을 모두 물리쳤다." : "파티가 전멸했다.";
  }
}
