// 패시브 (2026-11-22 전면 개편). 종족 패시브는 없앴다.
// - 직업 패시브 9개: 그 직업이면 동부터 가진다.
// - 융합 패시브 (종족 × 직업 33조합 × 은 A/B × 금 A/B = 132개): 은 승급 때 은 A/B 중 하나, 금(2차 전직) 때 금 A/B 중 하나를 고른다.
//   2차 갈래와 상관없이 고른다. 용병 시드의 passiveSilver / passiveGold에 저장한다.
// 규칙: 직업 패시브 ≤ 10%, 은 패시브 효과 합 ≤ 10%, 금 ≤ 20% (비율 효과만 센다).
//       패시브의 치명·회피 %는 스탯 곡선을 거치지 않고 그대로 더한다.
// 효과는 PassiveFx (엔진: game/combat/engine.ts). 특정 스킬을 가리키는 효과는 메인 조각 id로 (skillMods).
import type { StatusKind } from "./combat";

/** 상대 조건 (이 조건이면 피해·치명 +) */
export type PassiveCond = "poisoned" | "bleeding" | "poisonBleed" | "stunned" | "marked" | "weakened" | "armorDown" | "debuffed" | "eliteBoss" | "lowHp" | "duel";

/**
 * 패시브 효과. 비율은 0~1. 숫자 효과는 여러 패시브를 더하고, 목록은 이어 붙인다.
 * 공격: power 모든 공격 위력, singlePower/areaPower 단일·범위, holyPower 신성(신성을 따르는 공격), magPower 마법,
 *   elementPower 원소 스킬, firePower 불 원소, fireEarthPower 불·흙을 함께 단 스킬, bigSkillPower 대기 2 이상 스킬,
 *   selfCostPower 자기 체력을 쓰는 스킬, multiHitPower 다타 3번째 타격부터, areaStack 범위 공격에 맞은 적 1명당 (최대 3명)
 * 방어: takenReduce 받는 피해 -, counterTaken 반격 태세 중 받는 피해 -, magicTaken 받는 마법 피해 -
 */
export type PassiveFx = {
  power?: number;
  singlePower?: number;
  areaPower?: number;
  holyPower?: number;
  magPower?: number;
  elementPower?: number;
  firePower?: number;
  fireEarthPower?: number;
  bigSkillPower?: number;
  selfCostPower?: number;
  multiHitPower?: number;
  areaStack?: number;
  critDamage?: number;
  crit?: number;
  evade?: number;
  pierce?: number;
  holyPierce?: number;
  /** 오러률: 준 피해 중 이 비율은 상대의 받는 피해 감소를 무시한다 (방어 무시와 같은 공식) */
  aura?: number;
  lifesteal?: number;
  /** 상대 조건별 피해 + / 치명 + */
  vs?: { cond: PassiveCond; pct: number }[];
  critVs?: { cond: PassiveCond; pct: number }[];
  /** 전투 첫 라운드 치명 + */
  firstRoundCrit?: number;
  /** 자기 체력이 below 이하일 때 */
  lowHp?: { below: number; power?: number; taken?: number; evade?: number; counter?: number }[];
  counterPower?: number;
  /** 감싸기(보호하는 중)일 때 반격 위력 + */
  coverCounterPower?: number;
  counterTaken?: number;
  /** 가시(반사) 비율 + */
  thornsPct?: number;
  stunChance?: number;
  bleedChance?: number;
  poisonStack?: number;
  bleedStack?: number;
  debuffTurns?: number;
  /** 거는 상태이상 수치 × (1 + 값) */
  statusPower?: Partial<Record<StatusKind, number>>;
  /** 공격이 맞으면 확률로 상태이상 (holy: 신성 공격만, aoe: 범위 공격만, multi: 다타 공격만, element: 그 원소 스킬만) */
  onHit?: { status: StatusKind; chance: number; value?: number; holy?: boolean; aoe?: boolean; multi?: boolean; element?: string }[];
  takenReduce?: number;
  maxHpPct?: number;
  speed?: number;
  stunRes?: number;
  slowRes?: number;
  /** 처음 받는 공격만 회피 + */
  firstHitEvade?: number;
  /** 전투 시작 때 최대 체력의 이 비율만큼 보호막 */
  battleShield?: number;
  /** 수호 선언(도발)·감싸기·막아서기 중 방어 + */
  guardDefense?: number;
  /** 체력이 처음 30% 아래로 떨어지면 2턴 받는 피해 - */
  lastStandGuard?: number;
  /** 바로 옆 아군: 받는 피해 - / 방어 + (오라) */
  neighborTaken?: number;
  neighborDefense?: number;
  /** 이 용병이 서 있는 동안 아군 기절 저항 + */
  allyStunRes?: number;
  /** 이 용병이 쓰러지면 아군 1턴 받는 피해 - */
  downGuard?: number;
  /** 아군이 쓰러지면 2턴 반격 위력 + */
  avengeCounter?: number;
  healPower?: number;
  reviveHeal?: number;
  /** 거는 지속 회복(재생) + */
  regenPower?: number;
  /** 회복할 때 확률로 상태이상 1개 해제 */
  healCure?: number;
  /** 회복받은 아군 1턴 받는 피해 - / 방어 + */
  healGuard?: number;
  healDefense?: number;
  /** 공격하면 준 피해의 이 비율만큼 가장 약한 아군 회복 */
  attackHealAlly?: number;
  /** 매 차례 끝 자기 최대 체력의 이 비율 회복 */
  selfRegen?: number;
  /** 적을 쓰러뜨리면 최대 체력 % 회복 / 다음 차례 속도 + */
  killHeal?: number;
  killSpeed?: number;
  /** 노래(아군에게 거는 강화) 효과 × / 지속 + */
  songPower?: number;
  songTurns?: number;
  /** 노래를 받은 아군에게 더 거는 것 */
  songBuff?: { stunRes?: number; evade?: number; crit?: number; power?: number; taken?: number; bleedChance?: number };
  /** 노래가 끝날 때 그 노래를 받은 아군이 최대 체력 % 회복 (여운) */
  songHeal?: number;
  /** 노래를 부르면 적 하나를 이 확률로 1턴 기절 (저항 적용) */
  songFear?: number;
  /** 노래 강화를 받는 체력 50% 이하 아군 피해 + (이 용병이 서 있는 동안) */
  songBerserk?: number;
  /** 상태이상을 풀어 주면 대상 최대 체력 % 회복 */
  cureHeal?: number;
  /** 스킬을 쓰면 이 확률로 그 스킬 대기 -1 */
  cooldownSkip?: number;
  /** 회피하면 다음 공격 위력 + (응축) */
  evadePower?: number;
  /** 회피하면 다음 공격에 출혈 + 치명 + */
  evadeStrike?: { bleed: number; crit: number };
  /** 이 스킬을 쓴 뒤 다음 차례까지 속도·회피 + */
  afterSkill?: { skill: string; speed: number; evade: number };
  /** 메인 조각 id별: 위력·방어 무시·거는 효과 지속·중독·회복·거는 효과 수치 + */
  skillMods?: Record<string, { power?: number; pierce?: number; turns?: number; poison?: number; heal?: number; statusPower?: number }>;
  /** 받은 피해의 이 비율을 다음 공격 피해에 더한다 */
  woundPower?: number;
  magicTaken?: number;
  /** 거는 둔화 지속 + / 신성 공격이 거는 방어 감소 지속 + */
  slowTurns?: number;
  holyArmorDownTurns?: number;
  /** vs 조건 피해를 신성 공격에만 */
  holyOnlyVs?: boolean;
  /** 적에게 거는 약화(노래 등) 효과 × (1 + 값) */
  debuffSongPower?: number;
};

export type PassiveTier = "job" | "silver" | "gold";

export type Passive = {
  id: string;
  job: string;
  race?: string;
  tier: PassiveTier;
  slot?: "A" | "B";
  name: string;
  description: string;
  effects: PassiveFx;
};

const job = (jobId: string, name: string, description: string, effects: PassiveFx): Passive => ({ id: `${jobId}_job`, job: jobId, tier: "job", name, description, effects });
/** 한 조합의 융합 패시브 4개 (은 A, 은 B, 금 A, 금 B) */
const fusion = (jobId: string, race: string, list: [string, string, PassiveFx][]): Passive[] =>
  list.map(([name, description, effects], i) => ({
    id: `${jobId}_${race}_${i < 2 ? "s" : "g"}${i % 2 === 0 ? "A" : "B"}`,
    job: jobId,
    race,
    tier: i < 2 ? "silver" : "gold",
    slot: i % 2 === 0 ? "A" : "B",
    name,
    description,
    effects,
  }));

export const JOB_PASSIVES: Passive[] = [
  job("knight", "기사도", "바로 옆 아군이 받는 피해 -5%", { neighborTaken: 0.05 }),
  job("guardian", "든든한 방패", "수호 선언·감싸기 중 방어 +2", { guardDefense: 2 }),
  job("greatsword", "무게 실린 일격", "대기 2 이상 스킬 위력 +10%", { bigSkillPower: 0.1 }),
  job("assassin", "급소 감각", "체력 50% 이하 적에게 치명 +10%", { critVs: [{ cond: "lowHp", pct: 0.1 }] }),
  job("monk", "단련된 몸", "받는 피해 -5%", { takenReduce: 0.05 }),
  job("archer", "거리 감각", "첫 라운드 치명 +10%", { firstRoundCrit: 0.1 }),
  job("priest", "신앙의 빛", "회복량 +5%", { healPower: 0.05 }),
  job("mage", "원소 감응", "원소 부 조각 효과 +10%", { elementPower: 0.1 }),
  job("minstrel", "울림", "노래 효과 +5%", { songPower: 0.05 }),
];

export const FUSION_PASSIVES: Passive[] = [
  // ── 기사 ──
  ...fusion("knight", "human", [
    ["기사의 의지", "체력이 처음 30% 아래로 떨어지면 2턴 받는 피해 -10%", { lastStandGuard: 0.1 }],
    ["결의의 맹세", "결투 대상에게 피해 +10%", { vs: [{ cond: "duel", pct: 0.1 }] }],
    ["오러 숙련", "오러률 +20%", { aura: 0.2 }],
    ["어둠의 오러", "오러률 +10%, 흡혈 +10%", { aura: 0.1, lifesteal: 0.1 }],
  ]),
  ...fusion("knight", "dwarf", [
    ["룬 새김 갑옷", "전투 시작 때 최대 체력 10% 보호막", { battleShield: 0.1 }],
    ["혈룬의 서약", "체력 50% 이하일 때 공격 +10%", { lowHp: [{ below: 0.5, power: 0.1 }] }],
    ["바위의 발걸음", "기절 저항 +10%, 둔화 저항 +10%", { stunRes: 0.1, slowRes: 0.1 }],
    ["혈룬 각인", "흡혈 +10%, 받는 피해 -10%", { lifesteal: 0.1, takenReduce: 0.1 }],
  ]),
  ...fusion("knight", "elf", [
    ["정령의 가호", "회피 +5%, 처음 받는 공격만 회피 +5% 추가", { evade: 0.05, firstHitEvade: 0.05 }],
    ["달빛 칼날", "치명 +10%", { crit: 0.1 }],
    ["바람의 검무", "정령 검격을 쓴 뒤 다음 차례까지 속도 +2, 회피 +10%", { afterSkill: { skill: "knight_elf_main", speed: 2, evade: 0.1 } }],
    ["그림자 검", "회피하면 다음 공격 위력 +20%", { evadePower: 0.2 }],
  ]),
  // ── 가디언 ──
  ...fusion("guardian", "human", [
    ["불굴의 깃발", "가디언이 서 있는 동안 아군 기절 저항 +10%", { allyStunRes: 0.1 }],
    ["본보기", "감싸기 중 반격 위력 +10%", { coverCounterPower: 0.1 }],
    ["최후의 명령", "가디언이 쓰러지면 아군 1턴 받는 피해 -20%", { downGuard: 0.2 }],
    ["심판의 방패", "반사 피해 +20%", { thornsPct: 0.2 }],
  ]),
  ...fusion("guardian", "dwarf", [
    ["산의 뿌리", "받는 피해 -5%, 체력 50% 이하면 -10%", { takenReduce: 0.05, lowHp: [{ below: 0.5, taken: 0.05 }] }],
    ["가시 룬", "반사 피해 +10%", { thornsPct: 0.1 }],
    ["방벽 룬 각인", "철벽 지속 +1턴, 옆 아군 방어 +1, 받는 피해 -10%", { skillMods: { guardian_wall: { turns: 1 } }, neighborDefense: 1, takenReduce: 0.1 }],
    ["강철 집행", "방패 강타 위력 +10%, 기절 확률 +10%", { skillMods: { guardian_bash: { power: 0.1 } }, stunChance: 0.1 }],
  ]),
  ...fusion("guardian", "barbarian", [
    ["질긴 가죽", "최대 체력 +10%", { maxHpPct: 0.1 }],
    ["상처의 대가", "받은 피해의 10%를 다음 공격 피해에 더한다", { woundPower: 0.1 }],
    ["피의 맹세", "아군이 쓰러지면 2턴 반격 위력 +20%", { avengeCounter: 0.2 }],
    ["보복의 피", "체력 50% 이하일 때 반격 위력 +20%", { lowHp: [{ below: 0.5, counter: 0.2 }] }],
  ]),
  // ── 대검사 ──
  ...fusion("greatsword", "human", [
    ["검기의 길", "방어 무시 +10%", { pierce: 0.1 }],
    ["바람 가르기", "범위 공격 위력 +10%", { areaPower: 0.1 }],
    ["완벽한 자세", "치명타 피해 +20%", { critDamage: 0.2 }],
    ["폭풍검", "범위 공격 위력 +15%, 회피 +5%", { areaPower: 0.15, evade: 0.05 }],
  ]),
  ...fusion("greatsword", "dwarf", [
    ["룬 대검", "기절 중인 적에게 피해 +10%", { vs: [{ cond: "stunned", pct: 0.1 }] }],
    ["회전의 중심", "회전 베기 방어 무시 +10%", { skillMods: { gs_whirl: { pierce: 0.1 } } }],
    ["강철 중심", "기절 저항 +10%, 받는 피해 -10%", { stunRes: 0.1, takenReduce: 0.1 }],
    ["철풍", "범위 공격 위력 +10%, 기절 확률 +10%", { areaPower: 0.1, stunChance: 0.1 }],
  ]),
  ...fusion("greatsword", "beastfolk", [
    ["피에 굶주림", "적을 쓰러뜨리면 최대 체력 5% 회복", { killHeal: 0.05 }],
    ["회오리 발톱", "범위 공격에 출혈 확률 +10%", { onHit: [{ status: "bleed", chance: 0.1, aoe: true }] }],
    ["야수의 연타", "다타 공격 3번째 타격부터 위력 +20%", { multiHitPower: 0.2 }],
    ["회오리 사냥", "범위 공격 위력 +20%, 적을 쓰러뜨리면 다음 차례 속도 +2", { areaPower: 0.2, killSpeed: 2 }],
  ]),
  ...fusion("greatsword", "barbarian", [
    ["분노", "체력 50% 이하일 때 공격 +10%", { lowHp: [{ below: 0.5, power: 0.1 }] }],
    ["피바람", "범위 공격에 맞은 적 1명당 위력 +3% (최대 +9%)", { areaStack: 0.03 }],
    ["거인 사냥", "정예·보스에게 피해 +20%", { vs: [{ cond: "eliteBoss", pct: 0.2 }] }],
    ["족장의 회전", "범위 공격 위력 +20%", { areaPower: 0.2 }],
  ]),
  // ── 암살자 ──
  ...fusion("assassin", "human", [
    ["예리한 칼끝", "치명타 피해 +10%", { critDamage: 0.1 }],
    ["독 바른 칼", "공격하면 10% 확률로 중독 +2", { onHit: [{ status: "poison", chance: 0.1, value: 2 }] }],
    ["그림자 계약", "치명 +10%, 치명타 피해 +10%", { crit: 0.1, critDamage: 0.1 }],
    ["독의 왕", "거는 중독 +2, 중독된 적에게 피해 +15%", { poisonStack: 2, vs: [{ cond: "poisoned", pct: 0.15 }] }],
  ]),
  ...fusion("assassin", "elf", [
    ["바람의 발", "회피 +5%, 치명 +5%", { evade: 0.05, crit: 0.05 }],
    ["독꽃 향", "거는 중독 취약 효과 +10%", { statusPower: { poisonVuln: 0.1 } }],
    ["정령의 독", "정령의 비수에 중독 +2, 중독된 적에게 피해 +10%", { skillMods: { as_elf_main: { poison: 2 } }, vs: [{ cond: "poisoned", pct: 0.1 }] }],
    ["독꽃 무희", "회피 +10%, 중독된 적에게 치명 +10%", { evade: 0.1, critVs: [{ cond: "poisoned", pct: 0.1 }] }],
  ]),
  ...fusion("assassin", "beastfolk", [
    ["피 냄새 추적", "출혈 중인 적에게 피해 +10%", { vs: [{ cond: "bleeding", pct: 0.1 }] }],
    ["독니", "공격하면 10% 확률로 중독 +3", { onHit: [{ status: "poison", chance: 0.1, value: 3 }] }],
    ["사냥꾼의 상처", "공격하면 30% 확률로 출혈 +3, 출혈 중인 적에게 치명 +10%", { onHit: [{ status: "bleed", chance: 0.3, value: 3 }], critVs: [{ cond: "bleeding", pct: 0.1 }] }],
    ["독니 사냥꾼", "중독과 출혈이 함께 걸린 적에게 피해 +20%", { vs: [{ cond: "poisonBleed", pct: 0.2 }] }],
  ]),
  // ── 무투가 ──
  ...fusion("monk", "human", [
    ["경락 이해", "기절 확률 +10%", { stunChance: 0.1 }],
    ["흘려보내기", "회피 +5%, 카운터 반격 위력 +5%", { evade: 0.05, counterPower: 0.05 }],
    ["발경 숙련", "방어 무시 +5%, 기절 중인 적에게 피해 +15%", { pierce: 0.05, vs: [{ cond: "stunned", pct: 0.15 }] }],
    ["무극", "회피 +10%, 카운터 반격 위력 +10%", { evade: 0.1, counterPower: 0.1 }],
  ]),
  ...fusion("monk", "dwarf", [
    ["강철 피부", "받는 피해 -10%", { takenReduce: 0.1 }],
    ["바위의 흐름", "받는 피해 -5%, 카운터 반격 위력 +5%", { takenReduce: 0.05, counterPower: 0.05 }],
    ["무쇠 권", "기절 확률 +10%, 거는 둔화 지속 +1턴, 받는 피해 -5%", { stunChance: 0.1, takenReduce: 0.05, slowTurns: 1 }],
    ["부동", "반격 태세 중 받는 피해 -20%", { counterTaken: 0.2 }],
  ]),
  ...fusion("monk", "beastfolk", [
    ["발톱 리듬", "다타 공격은 타격마다 출혈 확률 +10%", { onHit: [{ status: "bleed", chance: 0.1, multi: true }] }],
    ["그림자 발놀림", "회피 +10%", { evade: 0.1 }],
    ["야생의 반사", "회피 +10%, 회피하면 다음 공격 위력 +10%", { evade: 0.1, evadePower: 0.1 }],
    ["그림자 발톱", "회피하면 다음 공격에 출혈 +3, 치명 +10%", { evadeStrike: { bleed: 3, crit: 0.1 } }],
  ]),
  ...fusion("monk", "barbarian", [
    ["투혼", "체력 30% 이하일 때 공격 +5%, 받는 피해 -5%", { lowHp: [{ below: 0.3, power: 0.05, taken: 0.05 }] }],
    ["폭풍 속 호흡", "체력 50% 이하일 때 회피 +10%", { lowHp: [{ below: 0.5, evade: 0.1 }] }],
    ["메치기 달인", "방어 감소에 걸린 적에게 피해 +20%", { vs: [{ cond: "armorDown", pct: 0.2 }] }],
    ["폭풍 속 고요", "카운터 반격 위력 +20%", { counterPower: 0.2 }],
  ]),
  // ── 궁수 ──
  ...fusion("archer", "human", [
    ["정밀 사격", "방어 무시 +5%, 치명 +5%", { pierce: 0.05, crit: 0.05 }],
    ["덫 놓기", "거는 둔화 효과 +10%", { statusPower: { slow: 0.1 } }],
    ["숲의 왕", "표적·약화가 걸린 적에게 피해 +15%, 치명 +5%", { vs: [{ cond: "marked", pct: 0.15 }], crit: 0.05 }],
    ["사냥꾼의 길", "화살비 위력 +10%, 거는 둔화 효과 +10%", { skillMods: { ar_rain: { power: 0.1 } }, statusPower: { slow: 0.1 } }],
  ]),
  ...fusion("archer", "elf", [
    ["바람 읽기", "방어 무시 +10%", { pierce: 0.1 }],
    ["바람 추적", "범위 공격 위력 +10%", { areaPower: 0.1 }],
    ["달빛 화살", "정령의 화살 회피 감소 효과 +10%, 치명타 피해 +10%", { skillMods: { ar_elf_main: { statusPower: 0.1 } }, critDamage: 0.1 }],
    ["바람의 추적자", "범위 공격 위력 +15%, 속도 +2", { areaPower: 0.15, speed: 2 }],
  ]),
  ...fusion("archer", "beastfolk", [
    ["추적자", "출혈 중인 적에게 치명 +10%", { critVs: [{ cond: "bleeding", pct: 0.1 }] }],
    ["독수리 눈", "치명 +10%", { crit: 0.1 }],
    ["야생의 군주", "거는 출혈 +2, 출혈 중인 적에게 피해 +15%", { bleedStack: 2, vs: [{ cond: "bleeding", pct: 0.15 }] }],
    ["독수리 사냥꾼", "치명타 피해 +20%", { critDamage: 0.2 }],
  ]),
  ...fusion("archer", "barbarian", [
    ["강한 시위", "단일 공격 위력 +10%", { singlePower: 0.1 }],
    ["설원의 인내", "받는 피해 -5%, 회피 +5%", { takenReduce: 0.05, evade: 0.05 }],
    ["천둥 화살", "방어 무시 +10%, 기절 확률 +10%", { pierce: 0.1, stunChance: 0.1 }],
    ["설원의 사냥꾼", "거는 위축 효과 +10%, 위축된 적에게 피해 +10%", { statusPower: { weaken: 0.1 }, vs: [{ cond: "weakened", pct: 0.1 }] }],
  ]),
  // ── 사제 ──
  ...fusion("priest", "human", [
    ["구원의 손길", "쓰러진 아군을 일으킬 때 회복량 +10%", { reviveHeal: 0.1 }],
    ["심판의 빛", "신성 피해 +10%", { holyPower: 0.1 }],
    ["빛의 가호", "회복받은 아군 1턴 받는 피해 -10%, 신성 피해 +10%", { healGuard: 0.1, holyPower: 0.1 }],
    ["심판의 사도", "신성 피해 +10%, 신성 공격에 위축 확률 +10%", { holyPower: 0.1, onHit: [{ status: "weaken", chance: 0.1, holy: true }] }],
  ]),
  ...fusion("priest", "elf", [
    ["생명의 이슬", "회복할 때 10% 확률로 상태이상 1개 해제", { healCure: 0.1 }],
    ["별빛", "신성 공격 방어 무시 +10%", { holyPierce: 0.1 }],
    ["정령 순환", "회복량 +10%, 지속 회복 +10%", { healPower: 0.1, regenPower: 0.1 }],
    ["별빛 징벌", "신성 피해 +10%, 회피 +10%", { holyPower: 0.1, evade: 0.1 }],
  ]),
  ...fusion("priest", "dwarf", [
    ["화로의 온기", "회복받은 아군 1턴 방어 +1", { healDefense: 1 }],
    ["망치의 기도", "신성 공격에 기절 확률 +10%", { onHit: [{ status: "stun", chance: 0.1, holy: true }] }],
    ["불꽃 룬", "신성 공격의 방어 감소 지속 +1턴, 신성 피해 +15%", { holyPower: 0.15, holyArmorDownTurns: 1 }],
    ["망치의 사제", "신성 피해 +10%, 받는 피해 -10%", { holyPower: 0.1, takenReduce: 0.1 }],
  ]),
  ...fusion("priest", "beastfolk", [
    ["야생의 회복", "매 차례 끝 자기 최대 체력 3% 회복", { selfRegen: 0.03 }],
    ["성스러운 발톱", "신성 공격에 출혈 확률 +10%", { onHit: [{ status: "bleed", chance: 0.1, holy: true }] }],
    ["가시의 기도", "거는 둔화 효과 +10%, 중독 취약 효과 +10%", { statusPower: { slow: 0.1, poisonVuln: 0.1 } }],
    ["달의 사냥", "출혈 중인 적에게 신성 피해 +20%", { vs: [{ cond: "bleeding", pct: 0.2 }], holyOnlyVs: true }],
  ]),
  ...fusion("priest", "barbarian", [
    ["선조의 목소리", "선조의 토템 회복량 +10%", { skillMods: { pr_barbarian_main: { heal: 0.1 } } }],
    ["폭풍의 징조", "신성 공격에 위축 확률 +10%", { onHit: [{ status: "weaken", chance: 0.1, holy: true }] }],
    ["전투 기도", "공격하면 준 피해의 15%만큼 가장 약한 아군 회복", { attackHealAlly: 0.15 }],
    ["폭풍의 예언자", "공격 +10%, 흡혈 +5%", { power: 0.1, lifesteal: 0.05 }],
  ]),
  // ── 마법사 ──
  ...fusion("mage", "human", [
    ["비전 집중", "방어 무시 +10%", { pierce: 0.1 }],
    ["마력 순환", "스킬을 쓰면 10% 확률로 그 스킬 대기 -1", { cooldownSkip: 0.1 }],
    ["대마도의 식견", "마법 피해 +10%, 비전 각인 효과 +10%", { magPower: 0.1, statusPower: { arcaneMark: 0.1 } }],
    ["흑마도 계약", "자기 체력을 쓰는 스킬 위력 +15%, 흡혈 +5%", { selfCostPower: 0.15, lifesteal: 0.05 }],
  ]),
  ...fusion("mage", "elf", [
    ["정령 공명 심화", "원소 효과 +10%", { elementPower: 0.1 }],
    ["숲의 숨결", "회피 +5%, 받는 마법 피해 -5%", { evade: 0.05, magicTaken: 0.05 }],
    ["정령왕의 기억", "정령 폭풍 위력 +10%, 회피 감소 효과 +10%", { skillMods: { mg_elf_main: { power: 0.1 } }, statusPower: { evadeDown: 0.1 } }],
    ["그림자 정령", "거는 약화 지속 +1턴, 약화된 적에게 피해 +15%", { debuffTurns: 1, vs: [{ cond: "debuffed", pct: 0.15 }] }],
  ]),
  ...fusion("mage", "dwarf", [
    ["화로의 심장", "불 원소 위력 +10%", { firePower: 0.1 }],
    ["바위 각인", "흙 원소 기절 확률 +10%", { onHit: [{ status: "stun", chance: 0.1, element: "earth" }] }],
    ["화산 폭발", "불·흙을 함께 단 스킬 위력 +15%, 용암 분출 방어 감소 지속 +1턴", { fireEarthPower: 0.15, skillMods: { mg_dwarf_main: { turns: 1 } } }],
    ["검은 룬", "받는 피해 -10%, 기절 저항 +10%", { takenReduce: 0.1, stunRes: 0.1 }],
  ]),
  // ── 바드 ──
  ...fusion("minstrel", "human", [
    ["행진의 박자", "속도를 올리는 노래 효과 +10%", { statusPower: { speedUp: 0.1 } }],
    ["격려", "노래를 받은 아군 기절 저항 +10%", { songBuff: { stunRes: 0.1 } }],
    ["대륙의 노래", "노래 지속 +1턴, 노래 효과 +10%", { songTurns: 1, songPower: 0.1 }],
    ["불협화음의 지휘", "약화 노래 효과 +20%", { debuffSongPower: 0.2 }],
  ]),
  ...fusion("minstrel", "elf", [
    ["바람의 선율", "노래 회복량 +10%", { healPower: 0.1 }],
    ["여운", "노래가 끝날 때 그 노래를 받은 아군이 최대 체력 5% 회복", { songHeal: 0.05 }],
    ["정령의 합창", "상태이상을 풀어 주면 추가 회복 +10%, 회피 +10%", { cureHeal: 0.1, evade: 0.1 }],
    ["슬픈 하프", "위축 노래 효과 +20%", { statusPower: { weaken: 0.2 } }],
  ]),
  ...fusion("minstrel", "beastfolk", [
    ["울부짖음의 메아리", "둔화 노래 효과 +10%", { statusPower: { slow: 0.1 } }],
    ["야성의 리듬", "노래를 받은 아군의 다음 공격 출혈 확률 +10%", { songBuff: { bleedChance: 0.1 } }],
    ["달을 부르는 노래", "노래를 받은 아군 회피 +10%, 치명 +10%", { songBuff: { evade: 0.1, crit: 0.1 } }],
    ["공포의 울음", "노래를 부르면 적 하나를 20% 확률로 1턴 기절 (저항 적용)", { songFear: 0.2 }],
  ]),
  ...fusion("minstrel", "barbarian", [
    ["북의 울림", "전쟁 북 공격 증가 효과 +10%", { skillMods: { mn_barbarian_main: { statusPower: 0.1 } } }],
    ["뿔피리 숙련", "위축 효과 +10%", { statusPower: { weaken: 0.1 } }],
    ["전쟁의 함성", "노래를 받은 아군 공격 +10%, 받는 피해 -10%", { songBuff: { power: 0.1, taken: 0.1 } }],
    ["광전사의 북", "노래 강화를 받는 체력 50% 이하 아군 피해 +20%", { songBerserk: 0.2 }],
  ]),
];

export const PASSIVES: Passive[] = [...JOB_PASSIVES, ...FUSION_PASSIVES];

export function getPassive(id: string): Passive | undefined {
  return PASSIVES.find((p) => p.id === id);
}

/** 직업 패시브 id */
export function jobPassive(jobId: string | undefined): string | undefined {
  return jobId ? JOB_PASSIVES.find((p) => p.job === jobId)?.id : undefined;
}

/** 은 / 금 승급 때 고를 수 있는 두 패시브 (A, B) */
export function fusionChoices(jobId: string, race: string, tier: "silver" | "gold"): Passive[] {
  return FUSION_PASSIVES.filter((p) => p.job === jobId && p.race === race && p.tier === tier);
}

/** 패시브 효과를 합친다 (숫자는 더하고, 목록은 이어 붙이고, 표는 키마다 더한다) */
export function mergeFx(list: PassiveFx[]): PassiveFx {
  const out: Record<string, unknown> = {};
  for (const fx of list)
    for (const [k, v] of Object.entries(fx)) {
      if (typeof v === "number") out[k] = Math.round(((out[k] as number | undefined) ?? 0) * 1000 + v * 1000) / 1000;
      else if (typeof v === "boolean") out[k] = (out[k] as boolean | undefined) || v;
      else if (Array.isArray(v)) out[k] = [...((out[k] as unknown[] | undefined) ?? []), ...v];
      else if (v && typeof v === "object") {
        const prev = (out[k] as Record<string, unknown> | undefined) ?? {};
        const merged: Record<string, unknown> = { ...prev };
        for (const [kk, vv] of Object.entries(v)) {
          if (typeof vv === "number") merged[kk] = ((prev[kk] as number | undefined) ?? 0) + vv;
          else if (vv && typeof vv === "object") {
            const inner = { ...((prev[kk] as Record<string, number> | undefined) ?? {}) };
            for (const [k3, v3] of Object.entries(vv as Record<string, number>)) inner[k3] = (inner[k3] ?? 0) + v3;
            merged[kk] = inner;
          } else merged[kk] = vv;
        }
        out[k] = merged;
      }
    }
  return out as PassiveFx;
}

/** 패시브 효과의 비율 합 (상한 규칙 검사용): 비율 효과(0~1 사이 숫자)만 센다 */
export function pctSum(fx: PassiveFx): number {
  let sum = 0;
  const walk = (v: unknown, key?: string) => {
    if (typeof v === "number") {
      if (v > 0 && v < 1 && key !== "below" && key !== "chance") sum += v;
    } else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(fx);
  return Math.round(sum * 1000) / 1000;
}

/** 패시브 상한 (비율 효과 합) */
export const PASSIVE_CAP: Record<PassiveTier, number> = { job: 0.1, silver: 0.1, gold: 0.2 };
