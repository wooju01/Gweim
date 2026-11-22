// 스킬의 효과 조각 타입과 설명 문장.
// 용병 스킬은 data/fragments.ts의 조각(메인 1 + 부 0~2)을 game/skills.ts가 합쳐 SkillDef로 만들고,
// 몬스터 스킬은 data/monsters.ts에 SkillDef로 바로 쓴다.
// 엔진(combat/engine.ts)은 효과 종류별로 한 번씩만 처리하고, 미리보기와 설명 문장도 효과에서 만든다.
import { STATUS, type StatusKind } from "./combat";
import type { PowerStat } from "./growth";
import type { Element } from "@/lib/schemas";

export type SkillTarget = "enemy" | "ally" | "none";

/** 피해가 따르는 스탯과 배율. 여럿이면 합친다 (예: 힘 1.0배 + 마법 0.3배) */
export type Scaling = { stat: PowerStat; mult: number };

/** 상태이상을 거는 방법 */
export type StatusRoll = {
  status: StatusKind;
  /** 거는 확률 (기본 1). 기절·출혈·중독은 대상의 저항을 뺀다 */
  chance?: number;
  /** 쓰는 용병의 스킬 스탯 1점마다 확률 + (방패 강타: 힘에 비례) */
  chancePerPower?: number;
  /** 수치 (없으면 STATUS의 기본값) */
  value?: number;
  /** 지속 (없으면 STATUS의 기본값) */
  turns?: number;
  /** 저항을 무시한다 (확정 기절 등) */
  sure?: boolean;
};

export type DamageEffect = {
  kind: "damage";
  /** 배율 (scaling이 없을 때). 따르는 스탯은 stat → 스킬의 stat → 쓰는 용병의 직업 스탯 */
  multiplier?: number;
  /** 두 스탯 이상을 섞는 피해. 있으면 multiplier·stat 대신 쓴다 */
  scaling?: Scaling[];
  /** 고정 피해 (몬스터 스킬만. 2026-11-22: 용병 조각에서는 고정 피해를 없앴다) */
  bonus?: number;
  /** 공격력 대신 이 범위 (몬스터 스킬) */
  fixed?: readonly [number, number];
  /** one: 대상 하나 / all: 적 전체 / two: 대상 + 무작위 적 하나 / random: 타격마다 무작위 적 */
  area?: "one" | "all" | "two" | "random";
  /** 공격자의 상태이상 부여(암살자 출혈 등)를 굴리나 (기본 true) */
  onHit?: boolean;
  /** 같은 대상을 몇 번 치나 (기본 1). 대상이 쓰러지면 멈춘다 */
  hits?: number;
  /** 이 공격의 치명타 확률 추가 */
  critBonus?: number;
  stat?: PowerStat;
  /** 대상 방어를 이 비율만큼 무시 (0~1) */
  pierce?: number;
  /** 오러률 (인간 기사): 준 피해 중 이 비율은 대상의 받는 피해 감소를 무시한다 (방어 무시와 같은 공식) */
  aura?: number;
  /** 준 피해의 이 비율만큼 회복 */
  lifesteal?: number;
  /** 타격마다 거는 상태이상 */
  perHit?: StatusRoll;
  /** 조건이 맞으면 위력 + (기절 중인 대상, 출혈 중인 대상, 체력 낮은 대상·자신) */
  bonusIf?: { cond: DmgCond; pct: number }[];
  /** 조건이 맞으면 치명 + */
  critIf?: { cond: DmgCond; pct: number }[];
  /** 조건이 맞으면 타격 수를 이만큼으로 */
  hitsIf?: { cond: DmgCond; hits: number };
  /** 타격이 minHits번 이상이면 마지막 타격 위력 + */
  lastHit?: { minHits: number; pct: number };
  /** 대상을 친 뒤 무작위 다른 적 하나에게도 이 비율의 피해 */
  splash?: number;
};

/** 피해 조건: 대상이 기절·출혈 중 / 대상 체력 50% 이하 / 자기 체력 50%·30% 이하 */
export type DmgCond = "targetStunned" | "targetBleeding" | "targetLowHp" | "selfLowHp50" | "selfLowHp30";
export const DMG_COND_TEXT: Record<DmgCond, string> = {
  targetStunned: "기절 중인 대상에게",
  targetBleeding: "출혈 중인 대상에게",
  targetLowHp: "체력 50% 이하인 대상에게",
  selfLowHp50: "자기 체력 50% 이하일 때",
  selfLowHp30: "자기 체력 30% 이하일 때",
};

export type SkillEffect =
  | DamageEffect
  /**
   * 상태이상. 대상에게, area "all"이면 적 전체, who "self"면 자신, "allies"면 아군 전체.
   * 대상이 살아 있을 때만
   */
  | ({ kind: "applyStatus"; area?: "one" | "all"; who?: "self" | "allies" } & StatusRoll)
  /** 회복. 회복량에는 쓰는 용병의 신성이 더해진다 */
  /** hits: 회복 횟수 (연발·연격 같은 타격 수 부 조각이 붙으면 늘고, 한 번의 회복량은 그 배율만큼 준다) */
  | { kind: "heal"; amount: number; who?: "self" | "allies"; hits?: number }
  /** 쓰러진 아군 하나를 최대 체력의 pct로 일으킨다. 일으켰으면 이 스킬의 아군 전체 회복은 건너뛴다 (사제 궁극기 "기적") */
  | { kind: "revive"; pct: number }
  /** 해제. kinds가 없으면 출혈·중독. count가 있으면 약화를 그 수만큼 */
  | { kind: "cure"; who?: "self"; kinds?: StatusKind[]; count?: number }
  /** 보호막. 겹쳐 쌓지 않고 큰 쪽으로 채운다 */
  | { kind: "shield"; amount: number; who?: "self" | "allies"; stat?: PowerStat }
  /** 다음 자기 차례까지 적의 공격을 끌어오고 받는 피해 절반 */
  | { kind: "taunt" }
  /** 적마다 chance로 도발 (turns 동안 쓰는 용병만 노린다) */
  | { kind: "provoke"; chance: number; turns: number }
  /** 자신: turns 동안 차례마다 최대 체력의 pct 회복 */
  | { kind: "regenPct"; pct: number; turns: number }
  /** 최후의 보루: 아군 전체를 감싸고(1턴), 공격받으면 최대 체력의 pct로 반격, 다음 라운드 먼저 움직인다 */
  | { kind: "bulwark"; pct: number }
  /** 영웅의 서사시: 아군 전체가 이번 라운드에 한 번 더 행동하고, 쓴 용병은 다음 차례를 쉰다 */
  | { kind: "extraTurn" }
  /** 자기 체력 소모 (hp 또는 최대 체력 비율). 체력 1 아래로는 깎지 않는다 */
  | { kind: "selfCost"; hp?: number; pctMaxHp?: number }
  /** 이 확률로 스킬 전체가 실패한다 (대기 시간은 그대로 든다) */
  | { kind: "fail"; chance: number }
  /** 앞의 피해로 대상을 쓰러뜨리면 이 스킬의 대기 시간을 없앤다 */
  | { kind: "resetOnKill" }
  /**
   * 옆 아군에게도. 아군 스킬이면 대상의 옆 아군이 회복·보호막을 절반 받고,
   * 아니면 자신의 옆 아군이 보호막 shield를 받는다
   */
  | { kind: "support"; shield: number }
  /** 아직 엔진이 처리하지 않는 효과 (2단계). 설명에만 나오고 전투에서는 무시한다 */
  | { kind: "later"; text: string };

export type SkillDef = {
  id: string;
  name: string;
  /** 대기: 쓰고 나서 쓸 수 없는 자기 차례 수 (0이면 매 차례) */
  cooldown: number;
  target: SkillTarget;
  effects: SkillEffect[];
  /** 따르는 스탯 (힘·마법·신성). 없으면 쓰는 용병의 직업 스탯 */
  stat?: PowerStat;
  /** 궁극기: 금 등급부터, 한 번에 1개만 장착, 전투당 1번 (대기 시간 대신) */
  ultimate?: boolean;
  /** 원소 조각이 붙은 스킬의 원소 (불 피해는 재생을 막는다) */
  element?: Element;
  /** 보스 예고 패턴: 쓰기 한 차례 전에 준비(예고)한다. 그사이 기절하면 끊긴다 */
  telegraph?: boolean;
  /** 예고할 때 나오는 문구 ({name}은 쓰는 몬스터 이름) */
  warn?: string;
};

export type Skill = SkillDef & { description: string };

export type SkillId = string;

/** 일반 스킬 장착 칸 (궁극기 칸은 따로). 공격과 붕대는 칸을 차지하지 않는다 */
export const SKILL_SLOTS = 4;
/** 배운 스킬 보관함 칸 (장착하지 않은 스킬). 꽉 차면 잊어야 새로 보관할 수 있다 */
export const LEARNED_SLOTS = 4;

const pct = (n: number) => `${Math.round(n * 100)}%`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 상태이상 하나의 설명 ("균열(받는 피해 +2, 3턴)") */
export function statusText(roll: StatusRoll): string {
  const info = STATUS[roll.status];
  const v = roll.value ?? info.value;
  const effect = v === undefined ? info.text : info.text.replace("{v}", info.pct ? pct(v) : String(v));
  const extra = [effect, roll.turns ? `${roll.turns}턴` : ""].filter(Boolean).join(", ");
  const chance = roll.chance !== undefined && roll.chance < 1 ? `${pct(roll.chance)} 확률로 ` : "";
  const sure = roll.sure ? "확정 " : "";
  return `${chance}${sure}${info.name}(${extra})`;
}

/**
 * 걸려 있는 상태 하나의 툴팁: 효과 + 남은 차례 (걸린 쪽 기준). 출혈·중독은 남은 수치
 * 예: "공격 강화: 공격 +2 · 남은 차례: 대상 기준 2"
 */
export function statusTip(s: { kind: StatusKind; turns: number; value?: number }): string {
  const info = STATUS[s.kind];
  const v = s.value ?? info.value;
  const effect = v === undefined ? info.text : info.text.replace("{v}", info.pct ? pct(v) : String(v));
  if (s.kind === "bleed" || s.kind === "poison") return `${info.name}: ${effect} · 차례가 끝날 때마다 피해를 주고 줄어든다`;
  if (s.kind === "regen") return `${info.name}: ${effect} · 남은 차례: 대상 기준 ${s.turns} (차례 시작에 회복)`;
  return `${info.name}: ${effect} · 남은 차례: 대상 기준 ${s.turns}`;
}

/** 효과 조각에서 설명 문장을 만든다. 스킬 수가 많아져도 설명을 따로 쓰지 않는다 */
export function describeSkill(def: SkillDef): string {
  const one = def.target === "ally" ? "아군 하나" : "적 하나";
  const to = (e: { who?: "self" | "allies" }) => (e.who === "self" ? "자신" : e.who === "allies" ? "아군 전체" : one);
  const parts = def.effects.flatMap((e): string[] => {
    switch (e.kind) {
      case "damage": {
        const who =
          e.area === "all" ? "모든 적에게" : e.area === "two" ? `${one}와 다른 적 하나에게` : e.area === "random" ? "무작위 적에게" : `${one}에게`;
        if (e.fixed) return [`${who} ${e.fixed[0]}~${e.fixed[1]} 피해`];
        const STAT = { str: "힘", mag: "마법", faith: "신성" } as const;
        const power = e.scaling
          ? e.scaling.map((s) => `${STAT[s.stat]} ${round2(s.mult)}배`).join(" + ")
          : `${e.stat ? `${STAT[e.stat]} ` : ""}${round2(e.multiplier ?? 1)}배`;
        const times = e.hits && e.hits > 1 ? ` ${e.hits}번` : "";
        const extras = [
          e.critBonus ? `치명 +${pct(e.critBonus)}` : "",
          e.pierce ? `방어 ${pct(e.pierce)} 무시` : "",
          e.aura ? `오러 ${pct(e.aura)}` : "",
          e.lifesteal ? `준 피해 ${pct(e.lifesteal)} 회복` : "",
          e.perHit ? `타격마다 ${statusText(e.perHit)}` : "",
          ...(e.bonusIf ?? []).map((c) => `${DMG_COND_TEXT[c.cond]} 위력 +${pct(c.pct)}`),
          ...(e.critIf ?? []).map((c) => `${DMG_COND_TEXT[c.cond]} 치명 +${pct(c.pct)}`),
          e.hitsIf ? `${DMG_COND_TEXT[e.hitsIf.cond]} ${e.hitsIf.hits}번` : "",
          e.lastHit ? `${e.lastHit.minHits}타 이상이면 마지막 타격 +${pct(e.lastHit.pct)}` : "",
          e.splash ? `무작위 다른 적 하나에게도 ${pct(e.splash)} 피해` : "",
        ].filter(Boolean);
        return [`${who} ${power}${e.bonus ? ` +${e.bonus}` : ""} 피해${times}${extras.length ? ` (${extras.join(", ")})` : ""}`];
      }
      case "applyStatus":
        return [`${e.area === "all" ? "모든 적" : to(e)}에게 ${statusText(e)}${e.chancePerPower ? ` (스탯 1당 확률 +${pct(e.chancePerPower)})` : ""}`];
      case "heal":
        return [
          `${to(e)}의 체력 ${e.amount} 회복${(e.hits ?? 1) > 1 ? ` × ${e.hits}번` : ""}${!e.who && def.target === "ally" ? ` (쓰러진 아군이면 ${(e.hits ?? 1) > 1 ? "첫 회복량으로 일으키고 나머지를 더한다" : "그만큼으로 일으킨다"})` : ""}`,
        ];
      case "revive":
        return [`쓰러진 아군 하나를 체력 ${pct(e.pct)}로 일으킨다 (쓰러진 아군이 없을 때만 아래 회복)`];
      case "cure": {
        const who = e.who === "self" ? "자신의 " : "";
        if (e.count) return [`${who}약화 ${e.count}개 해제`];
        return [`${who}${(e.kinds ?? HARMFUL_TEXT).map((k) => STATUS[k].name).join("·")} 해제`];
      }
      case "shield":
        return [`${to(e)}에게 피해를 먼저 막는 보호막 ${e.amount}`];
      case "provoke":
        return [`적마다 ${pct(e.chance)} 확률로 ${e.turns}턴 동안 자신만 노리게 한다 (도발)`];
      case "regenPct":
        return [`${e.turns}턴 동안 차례마다 최대 체력의 ${pct(e.pct)} 회복`];
      case "bulwark":
        return [`1턴 동안 아군이 받을 공격을 모두 대신 받고, 공격받으면 최대 체력의 ${pct(e.pct)}로 반드시 반격한다. 다음 라운드에 먼저 움직인다`];
      case "extraTurn":
        return ["아군 전체가 이번 라운드에 한 번 더 행동하고, 자신은 다음 차례를 쉰다"];
      case "taunt":
        return ["다음 차례까지 적의 공격을 끌어오고, 받는 피해가 절반"];
      case "selfCost":
        return [`자기 체력 ${e.pctMaxHp ? `최대치의 ${pct(e.pctMaxHp)}` : e.hp} 소모 (쓰러지지는 않는다)`];
      case "fail":
        return [`${pct(e.chance)} 확률로 실패`];
      case "resetOnKill":
        return ["처치하면 대기 시간 초기화"];
      case "support":
        return [def.target === "ally" ? "옆 아군에게도 회복·보호막 절반" : `옆 아군에게 보호막 ${e.shield}`];
      case "later":
        return [`${e.text} (준비 중)`];
    }
  });
  if (def.telegraph) parts.unshift("한 차례 전에 예고한다 (그사이 기절시키면 끊긴다)");
  return parts.join(". ");
}

const HARMFUL_TEXT: StatusKind[] = ["bleed", "poison"];
