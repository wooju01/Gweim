// 스킬 데이터. 스킬마다 코드를 짜지 않고 "효과 조각"을 조합해서 정의한다.
// 엔진(combat/engine.ts)은 조각 종류별로 한 번씩만 처리하고, 미리보기와 설명 문장도 조각에서 만든다.
import type { StatusKind } from "./combat";
import type { PowerStat } from "./growth";

export type SkillTarget = "enemy" | "ally" | "none";

export type SkillEffect =
  /**
   * 피해. 기본은 공격력 굴림 × multiplier + bonus.
   * fixed가 있으면 공격력 대신 그 범위를 쓴다. area "all"이면 살아 있는 적 전체.
   * onHit: 공격자의 상태이상 부여(암살자 출혈 등)를 굴리나 (기본 true)
   */
  | {
      kind: "damage";
      multiplier?: number;
      bonus?: number;
      fixed?: readonly [number, number];
      area?: "one" | "all";
      onHit?: boolean;
      /** 같은 대상을 몇 번 치나 (기본 1). 대상이 쓰러지면 멈춘다 */
      hits?: number;
      /** 이 공격의 치명타 확률 추가 */
      critBonus?: number;
      /** 따르는 스탯 (없으면 스킬의 stat, 그것도 없으면 쓰는 용병의 직업 스탯) */
      stat?: PowerStat;
    }
  /**
   * 대상(또는 area "all"이면 적 전체)에게 상태이상. 대상이 살아 있을 때만.
   * who "self"면 대상 대신 자신 (heal, cure, shield도 같다)
   */
  | { kind: "applyStatus"; status: StatusKind; area?: "one" | "all"; who?: "self" }
  /** 회복량에는 쓰는 용병의 신성이 더해진다 */
  | { kind: "heal"; amount: number; who?: "self" }
  /** 대상의 출혈·중독을 씻는다 */
  | { kind: "cure"; who?: "self" }
  /** 보호막. 겹쳐 쌓지 않고 큰 쪽으로 채운다 */
  | { kind: "shield"; amount: number; who?: "self"; stat?: PowerStat }
  /** 다음 자기 차례까지 적의 공격을 끌어오고 받는 피해 절반 */
  | { kind: "taunt" }
  /** 자기 체력 소모 (체력 1 아래로는 깎지 않는다) */
  | { kind: "selfCost"; hp: number }
  /** 이 확률로 스킬 전체가 실패한다 (대기 시간은 그대로 든다) */
  | { kind: "fail"; chance: number }
  /** 앞의 피해로 대상을 쓰러뜨리면 이 스킬의 대기 시간을 없앤다 */
  | { kind: "resetOnKill" }
  /**
   * 옆 아군에게도. 아군 스킬이면 대상의 옆 아군이 회복·보호막을 절반 받고,
   * 아니면 자신의 옆 아군이 보호막 shield를 받는다
   */
  | { kind: "support"; shield: number };

export type SkillSource = { job?: string; race?: string };

export type SkillDef = {
  id: string;
  name: string;
  source: SkillSource;
  /** 쓰고 나서 다시 쓸 수 있을 때까지 기다리는 자기 턴 수 */
  cooldown: number;
  target: SkillTarget;
  effects: SkillEffect[];
  /** 따르는 스탯 (힘·마법·신성). 없으면 쓰는 용병의 직업 스탯 */
  stat?: PowerStat;
};

export type Skill = SkillDef & { description: string };

const DEFS: SkillDef[] = [
  { id: "guard", name: "막아서기", source: { job: "knight" }, cooldown: 2, target: "none", effects: [{ kind: "taunt" }] },
  {
    id: "pierce",
    name: "급소 찌르기",
    source: { job: "assassin" },
    cooldown: 2,
    target: "enemy",
    effects: [
      { kind: "damage", bonus: 3, onHit: false },
      { kind: "applyStatus", status: "bleed" },
    ],
  },
  {
    id: "pray",
    name: "기도",
    source: { job: "nun" },
    cooldown: 3,
    target: "ally",
    effects: [{ kind: "heal", amount: 8 }, { kind: "cure" }],
  },
  {
    id: "volley",
    name: "화살비",
    source: { job: "archer" },
    cooldown: 3,
    target: "none",
    effects: [{ kind: "damage", fixed: [3, 5], area: "all", onHit: false }],
  },
  {
    id: "cleave",
    name: "내려찍기",
    source: { job: "greatsword" },
    cooldown: 2,
    target: "enemy",
    effects: [
      { kind: "damage", multiplier: 1.8 },
      { kind: "selfCost", hp: 3 },
    ],
  },
  {
    id: "miasma",
    name: "독안개",
    source: { job: "herbalist" },
    cooldown: 3,
    target: "none",
    effects: [{ kind: "applyStatus", status: "poison", area: "all" }],
  },
  {
    id: "firelance",
    name: "불꽃 창",
    source: { job: "mage" },
    cooldown: 3,
    target: "enemy",
    effects: [
      { kind: "damage", multiplier: 2.5, onHit: false },
      { kind: "selfCost", hp: 4 },
    ],
  },
  {
    id: "ward",
    name: "정령의 가호",
    source: { job: "spiritcaller" },
    cooldown: 2,
    target: "ally",
    effects: [
      { kind: "fail", chance: 0.2 },
      { kind: "shield", amount: 6 },
    ],
  },
  // ── 직업 스킬 (대표 스킬 외 3개씩) ──
  { id: "knight_pin", name: "꿰뚫기", source: { job: "knight" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage", multiplier: 1.4 }, { kind: "applyStatus", status: "crack" }] },
  { id: "knight_shove", name: "밀쳐내기", source: { job: "knight" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage" }, { kind: "applyStatus", status: "weaken" }] },
  { id: "assassin_throat", name: "목 긋기", source: { job: "assassin" }, cooldown: 3, target: "enemy", effects: [{ kind: "damage", multiplier: 1.6 }] },
  { id: "assassin_smoke", name: "연막", source: { job: "assassin" }, cooldown: 2, target: "none", effects: [{ kind: "shield", amount: 5, who: "self" }] },
  { id: "nun_bless", name: "축복", source: { job: "nun" }, cooldown: 3, target: "ally", effects: [{ kind: "applyStatus", status: "awaken" }] },
  { id: "nun_ward", name: "보호의 기도", source: { job: "nun" }, cooldown: 2, target: "ally", effects: [{ kind: "shield", amount: 5 }] },
  { id: "archer_aim", name: "조준 사격", source: { job: "archer" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage", multiplier: 1.6 }] },
  { id: "archer_pin", name: "발 묶기", source: { job: "archer" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage" }, { kind: "applyStatus", status: "weaken" }] },
  { id: "gs_sweep", name: "휩쓸어 베기", source: { job: "greatsword" }, cooldown: 3, target: "none", effects: [{ kind: "damage", multiplier: 0.6, area: "all" }] },
  { id: "gs_grit", name: "투지", source: { job: "greatsword" }, cooldown: 3, target: "none", effects: [{ kind: "applyStatus", status: "awaken", who: "self" }, { kind: "selfCost", hp: 2 }] },
  { id: "herb_aid", name: "응급 처치", source: { job: "herbalist" }, cooldown: 2, target: "ally", effects: [{ kind: "heal", amount: 6 }, { kind: "cure" }] },
  { id: "herb_needle", name: "독침", source: { job: "herbalist" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage", bonus: 1, onHit: false }, { kind: "applyStatus", status: "poison" }] },
  { id: "mage_embers", name: "불씨 흩뿌리기", source: { job: "mage" }, cooldown: 3, target: "none", effects: [{ kind: "damage", fixed: [2, 4], area: "all", onHit: false }, { kind: "applyStatus", status: "crack", area: "all" }] },
  { id: "mage_heatwall", name: "열기 방벽", source: { job: "mage" }, cooldown: 3, target: "ally", effects: [{ kind: "shield", amount: 7 }, { kind: "selfCost", hp: 2 }] },
  { id: "spirit_breath", name: "정령의 숨결", source: { job: "spiritcaller" }, cooldown: 2, target: "ally", effects: [{ kind: "fail", chance: 0.2 }, { kind: "heal", amount: 7 }] },
  { id: "spirit_quake", name: "땅 정령의 분노", source: { job: "spiritcaller" }, cooldown: 3, target: "enemy", effects: [{ kind: "damage", fixed: [4, 7], onHit: false }, { kind: "applyStatus", status: "weaken" }] },

  { id: "knight_sweep", name: "방패 휘두르기", source: { job: "knight" }, cooldown: 3, target: "none", effects: [{ kind: "damage", multiplier: 0.5, area: "all" }] },
  { id: "assassin_ambush", name: "기습", source: { job: "assassin" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage", multiplier: 1.3 }, { kind: "applyStatus", status: "weaken" }] },
  { id: "nun_judge", name: "정죄", source: { job: "nun" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage", multiplier: 1.3 }, { kind: "applyStatus", status: "crack" }] },
  { id: "archer_poison", name: "독화살", source: { job: "archer" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage", onHit: false }, { kind: "applyStatus", status: "poison" }] },
  { id: "gs_dread", name: "위압", source: { job: "greatsword" }, cooldown: 3, target: "none", effects: [{ kind: "taunt" }, { kind: "applyStatus", status: "weaken", area: "all" }] },
  { id: "herb_tonic", name: "각성 약초", source: { job: "herbalist" }, cooldown: 3, target: "ally", effects: [{ kind: "applyStatus", status: "awaken" }, { kind: "heal", amount: 2 }] },
  { id: "mage_blast", name: "불꽃 폭발", source: { job: "mage" }, cooldown: 4, target: "none", effects: [{ kind: "damage", multiplier: 0.8, area: "all", onHit: false }, { kind: "selfCost", hp: 3 }] },
  { id: "spirit_veil", name: "바람 정령의 장막", source: { job: "spiritcaller" }, cooldown: 2, target: "ally", effects: [{ kind: "fail", chance: 0.2 }, { kind: "shield", amount: 4 }, { kind: "cure" }] },

  // ── 종족 스킬 (4개씩) ──
  { id: "human_resolve", name: "결의", source: { race: "human" }, cooldown: 4, target: "none", effects: [{ kind: "applyStatus", status: "awaken", who: "self" }] },
  { id: "human_patch", name: "응급 손질", source: { race: "human" }, cooldown: 3, target: "none", effects: [{ kind: "heal", amount: 5, who: "self" }, { kind: "cure", who: "self" }] },
  { id: "dwarf_anvil", name: "모루 버티기", source: { race: "dwarf" }, cooldown: 3, target: "none", effects: [{ kind: "taunt" }, { kind: "shield", amount: 4, who: "self" }] },
  { id: "dwarf_hammer", name: "망치질", source: { race: "dwarf" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage", multiplier: 1.3 }, { kind: "applyStatus", status: "crack" }] },
  { id: "elf_spiritshot", name: "정령의 화살", source: { race: "elf" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage", fixed: [4, 6], onHit: false }] },
  { id: "elf_song", name: "숲의 노래", source: { race: "elf" }, cooldown: 3, target: "ally", effects: [{ kind: "heal", amount: 4 }, { kind: "cure" }] },
  { id: "beast_maul", name: "물어뜯기", source: { race: "beastfolk" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage", bonus: 2, onHit: false }, { kind: "applyStatus", status: "bleed" }] },
  { id: "beast_howl", name: "야성의 포효", source: { race: "beastfolk" }, cooldown: 3, target: "none", effects: [{ kind: "applyStatus", status: "weaken", area: "all" }] },
  { id: "barb_frenzy", name: "광폭", source: { race: "barbarian" }, cooldown: 3, target: "none", effects: [{ kind: "applyStatus", status: "awaken", who: "self" }, { kind: "selfCost", hp: 3 }] },
  { id: "barb_oath", name: "맹세의 일격", source: { race: "barbarian" }, cooldown: 3, target: "enemy", effects: [{ kind: "damage", multiplier: 1.7 }] },
  { id: "human_rally", name: "격려", source: { race: "human" }, cooldown: 4, target: "ally", effects: [{ kind: "applyStatus", status: "awaken" }] },
  { id: "human_improv", name: "임기응변 일격", source: { race: "human" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage", bonus: 3 }] },
  { id: "dwarf_steel", name: "강철 피부", source: { race: "dwarf" }, cooldown: 3, target: "none", effects: [{ kind: "shield", amount: 6, who: "self" }] },
  { id: "dwarf_quake", name: "대지 울리기", source: { race: "dwarf" }, cooldown: 3, target: "none", effects: [{ kind: "damage", fixed: [2, 4], area: "all", onHit: false }] },
  { id: "elf_windblade", name: "바람의 칼날", source: { race: "elf" }, cooldown: 2, target: "enemy", effects: [{ kind: "damage", multiplier: 1.2 }, { kind: "applyStatus", status: "crack" }] },
  { id: "elf_blessing", name: "정령의 축복", source: { race: "elf" }, cooldown: 3, target: "ally", effects: [{ kind: "shield", amount: 4 }, { kind: "heal", amount: 3 }] },
  { id: "beast_instinct", name: "사냥 본능", source: { race: "beastfolk" }, cooldown: 3, target: "none", effects: [{ kind: "applyStatus", status: "awaken", who: "self" }] },
  { id: "beast_claw", name: "할퀴기", source: { race: "beastfolk" }, cooldown: 3, target: "enemy", effects: [{ kind: "damage", multiplier: 1.2 }, { kind: "applyStatus", status: "bleed" }] },
  { id: "barb_warcry", name: "전쟁 함성", source: { race: "barbarian" }, cooldown: 4, target: "none", effects: [{ kind: "taunt" }, { kind: "applyStatus", status: "awaken", who: "self" }] },
  { id: "barb_tattoo", name: "문신의 맹세", source: { race: "barbarian" }, cooldown: 3, target: "none", effects: [{ kind: "shield", amount: 5, who: "self" }, { kind: "cure", who: "self" }] },

  /** 직업 정보가 없는 용병의 기본 스킬 */
  { id: "power", name: "전력 공격", source: {}, cooldown: 3, target: "enemy", effects: [{ kind: "damage", multiplier: 1.5 }] },
];

/** 효과 조각에서 설명 문장을 만든다. 스킬 수가 많아져도 설명을 따로 쓰지 않는다 */
/** 상태이상 설명 (효과를 괄호로) */
const STATUS_TEXT: Record<StatusKind, string> = {
  bleed: "출혈",
  poison: "중독",
  crack: "균열(받는 피해 +2)",
  weaken: "위축(공격 -2)",
  awaken: "각성(공격 +4)",
  brace: "버팀(방어 +2)",
  haste: "선제(다음 라운드에 먼저 행동)",
};

export function describeSkill(def: SkillDef): string {
  const one = def.target === "ally" ? "아군 하나" : "적 하나";
  const to = (e: { who?: "self" }) => (e.who === "self" ? "자신" : one);
  const parts = def.effects.flatMap((e): string[] => {
    switch (e.kind) {
      case "damage": {
        const who = e.area === "all" ? "모든 적에게" : `${one}에게`;
        if (e.fixed) return [`${who} ${e.fixed[0]}~${e.fixed[1]} 피해`];
        const power = e.multiplier && e.multiplier !== 1 ? `${Math.round(e.multiplier * 100) / 100}배` : "공격력";
        const times = e.hits && e.hits > 1 ? ` ${e.hits}번` : "";
        const crit = e.critBonus ? ` (치명타 +${Math.round(e.critBonus * 100)}%)` : "";
        return [`${who} ${power}${e.bonus ? ` +${e.bonus}` : ""} 피해${times}${crit}`];
      }
      case "applyStatus":
        return [`${e.area === "all" ? "모든 적" : to(e)}에게 ${STATUS_TEXT[e.status]}`];
      case "heal":
        return [`${to(e)}의 체력 ${e.amount} 회복`];
      case "cure":
        return [`${e.who === "self" ? "자신의 " : ""}출혈과 중독을 씻어 낸다`];
      case "shield":
        return [`${to(e)}에게 피해를 먼저 막는 보호막 ${e.amount}`];
      case "taunt":
        return ["다음 차례까지 적의 공격을 끌어오고, 받는 피해가 절반"];
      case "selfCost":
        return [`자기 체력 ${e.hp} 소모 (쓰러지지는 않는다)`];
      case "fail":
        return [`${Math.round(e.chance * 100)}% 확률로 실패`];
      case "resetOnKill":
        return ["처치하면 대기 시간 초기화"];
      case "support":
        return [def.target === "ally" ? "옆 아군에게도 회복·보호막 절반" : `옆 아군에게 보호막 ${e.shield}`];
    }
  });
  return parts.join(". ");
}

export const SKILLS: Record<string, Skill> = Object.fromEntries(DEFS.map((d) => [d.id, { ...d, description: describeSkill(d) }]));

export type SkillId = string;

/** 장착 슬롯 수. 공격과 붕대는 슬롯을 차지하지 않는다 */
export const SKILL_SLOTS = 4;

/** 직업의 대표 스킬. 시작 스킬에 언제나 들어간다 */
export const JOB_SKILL: Record<string, SkillId> = {
  knight: "guard",
  assassin: "pierce",
  nun: "pray",
  archer: "volley",
  greatsword: "cleave",
  herbalist: "miasma",
  mage: "firelance",
  spiritcaller: "ward",
};

/** 이 직업·종족에게서 나오는 스킬 (조합 스킬은 아직 없다) */
export function skillsFrom(source: SkillSource): SkillId[] {
  return DEFS.filter((d) =>
    source.job && source.race
      ? d.source.job === source.job && d.source.race === source.race
      : source.job
        ? d.source.job === source.job && !d.source.race
        : d.source.race === source.race && !d.source.job,
  ).map((d) => d.id);
}
export const DEFAULT_SKILL: SkillId = "power";
