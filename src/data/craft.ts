// 전수관: 효과 조각을 조립해 스킬을 만든다.
// 조각은 용병마다 따로 안다. 처음에는 가진 스킬 안에 든 조각만 알고(스킬을 뜯어 보면 보인다),
// 나머지는 전수관에서 금화와 유실물을 내고 그 용병에게 하나씩 뚫어 준다.
// 만든 스킬의 id는 "craft:몸체.덧붙임.덧붙임"이라 저장할 것은 id뿐이다 (gen·combo 스킬과 같은 방식).
// 수치는 초안이다. 밸런스는 나중에 시뮬레이션으로 조정한다.
import type { MercLevel } from "../lib/schemas";
import type { SkillDef, SkillEffect, SkillTarget } from "./skills";

export const CRAFT_PREFIX = "craft:";

/** 몸체 모양: 적 하나 / 적 전체 / 아군 하나 / 자신 */
export type Shape = "enemy" | "area" | "ally" | "self";

export type Piece = {
  id: string;
  name: string;
  /** 몸체(하나 필수) 또는 덧붙임 */
  kind: "core" | "mod";
  /** 조각 설명 (화면용) */
  hint: string;
  /** 위력 점수. 합으로 대기 시간을 정한다 (덧붙임은 음수도 있다) */
  power: number;
  /** 이름 짓기: 몸체는 명사, 덧붙임은 꾸밈말 */
  word: string;
  /** 해금 비용 (그 용병에게만) */
  cost: { gold: number; salvage: Record<string, number> };
  /** 몸체만: 모양과 효과 */
  shape?: Shape;
  effects?: SkillEffect[];
  /** 덧붙임만: 붙을 수 있는 몸체 모양, 모양별 효과 */
  fits?: Shape[];
  effectsFor?: (shape: Shape) => SkillEffect[];
  /** 덧붙임만: 함께 쓸 수 없는 조각 */
  excludes?: string[];
};

const ALL: Shape[] = ["enemy", "area", "ally", "self"];
/** 적에게 거는 상태이상 덧붙임: 적 하나면 그 적에게, 전체 몸체면 모든 적에게 (위력 1.5배) */
const statusMod = (status: "bleed" | "poison" | "crack" | "weaken") => (shape: Shape): SkillEffect[] =>
  shape === "area" ? [{ kind: "applyStatus", status, area: "all" }] : [{ kind: "applyStatus", status }];

export const PIECES: Piece[] = [
  // ── 몸체 ──
  { id: "strike", name: "일격", kind: "core", word: "일격", shape: "enemy", power: 1.2, hint: "적 하나에게 1.4배 피해", effects: [{ kind: "damage", multiplier: 1.4 }], cost: { gold: 5, salvage: { rat_fang: 2 } } },
  { id: "heavy", name: "강타", kind: "core", word: "강타", shape: "enemy", power: 3, hint: "적 하나에게 2배 피해", effects: [{ kind: "damage", multiplier: 2 }], cost: { gold: 12, salvage: { rust_plate: 2 } } },
  { id: "bolt", name: "정령탄", kind: "core", word: "정령탄", shape: "enemy", power: 2.2, hint: "적 하나에게 4~7 고정 피해", effects: [{ kind: "damage", fixed: [4, 7], onHit: false }], cost: { gold: 10, salvage: { rotten_bone: 3 } } },
  { id: "sweep", name: "휩쓸기", kind: "core", word: "휩쓸기", shape: "area", power: 2.5, hint: "모든 적에게 0.6배 피해", effects: [{ kind: "damage", multiplier: 0.6, area: "all" }], cost: { gold: 12, salvage: { ash_hide: 2 } } },
  { id: "fog", name: "안개", kind: "core", word: "안개", shape: "area", power: 2.5, hint: "모든 적에게 위축", effects: [{ kind: "applyStatus", status: "weaken", area: "all" }], cost: { gold: 10, salvage: { spore_sac: 3 } } },
  { id: "mend", name: "치유", kind: "core", word: "손길", shape: "ally", power: 2.3, hint: "아군 하나 체력 7 회복", effects: [{ kind: "heal", amount: 7 }], cost: { gold: 12, salvage: { hollow_heart: 1 } } },
  { id: "ward", name: "보호막", kind: "core", word: "가호", shape: "ally", power: 2, hint: "아군 하나에게 보호막 6", effects: [{ kind: "shield", amount: 6 }], cost: { gold: 10, salvage: { husk_shell: 2 } } },
  { id: "taunt", name: "도발", kind: "core", word: "버티기", shape: "self", power: 1.5, hint: "적의 공격을 끌어오고 받는 피해 절반", effects: [{ kind: "taunt" }], cost: { gold: 8, salvage: { warden_crest: 1 } } },

  // ── 덧붙임 ──
  { id: "bleed", name: "출혈", kind: "mod", word: "피를 부르는", power: 1.5, hint: "출혈을 건다", fits: ["enemy", "area"], effectsFor: statusMod("bleed"), cost: { gold: 8, salvage: { hound_fang: 2 } } },
  { id: "poison", name: "중독", kind: "mod", word: "독 묻은", power: 1.5, hint: "중독을 건다", fits: ["enemy", "area"], effectsFor: statusMod("poison"), cost: { gold: 8, salvage: { wretch_nail: 1 } } },
  { id: "crack", name: "균열", kind: "mod", word: "갑옷을 깨는", power: 1.5, hint: "균열을 건다 (받는 피해 +2)", fits: ["enemy", "area"], effectsFor: statusMod("crack"), cost: { gold: 8, salvage: { rust_plate: 1 } } },
  { id: "weaken", name: "위축", kind: "mod", word: "기를 꺾는", power: 1.5, hint: "위축을 건다 (공격 -2)", fits: ["enemy", "area"], effectsFor: statusMod("weaken"), excludes: ["fog"], cost: { gold: 6, salvage: { rat_fang: 3 } } },
  { id: "cure", name: "정화", kind: "mod", word: "맑은", power: 1, hint: "출혈·중독을 씻는다", fits: ["ally"], effectsFor: () => [{ kind: "cure" }], cost: { gold: 6, salvage: { spore_sac: 1 } } },
  { id: "awaken", name: "각성", kind: "mod", word: "깨어나는", power: 2, hint: "자신에게 각성 (공격 +4)", fits: ALL, effectsFor: () => [{ kind: "applyStatus", status: "awaken", who: "self" }], cost: { gold: 12, salvage: { hollow_heart: 1 } } },
  { id: "brace", name: "버팀", kind: "mod", word: "굳건한", power: 1, hint: "자신에게 버팀 (방어 +2)", fits: ALL, effectsFor: () => [{ kind: "applyStatus", status: "brace", who: "self" }], cost: { gold: 6, salvage: { husk_shell: 1 } } },
  {
    id: "support",
    name: "곁 지키기",
    kind: "mod",
    word: "함께하는",
    power: 1.5,
    hint: "옆 아군에게도 (아군 스킬은 효과 절반, 아니면 보호막 3)",
    fits: ALL,
    effectsFor: (shape) => [{ kind: "support", shield: shape === "ally" ? 0 : 3 }],
    cost: { gold: 10, salvage: { warden_crest: 1 } },
  },
  { id: "reset", name: "끝장", kind: "mod", word: "끝을 보는", power: 1, hint: "쓰러뜨리면 대기 시간 초기화", fits: ["enemy"], effectsFor: () => [{ kind: "resetOnKill" }], cost: { gold: 10, salvage: { hound_fang: 1, ash_hide: 1 } } },
  { id: "blood", name: "피의 대가", kind: "mod", word: "무모한", power: -1, hint: "자기 체력 3 소모 (대기 시간이 짧아진다)", fits: ALL, effectsFor: () => [{ kind: "selfCost", hp: 3 }], cost: { gold: 4, salvage: { rotten_bone: 1 } } },
  { id: "gamble", name: "불안정", kind: "mod", word: "불안한", power: -0.8, hint: "20% 확률로 실패 (대기 시간이 짧아진다)", fits: ALL, effectsFor: () => [{ kind: "fail", chance: 0.2 }], cost: { gold: 4, salvage: { spore_sac: 1 } } },
];

export function getPiece(id: string): Piece | undefined {
  return PIECES.find((p) => p.id === id);
}

/** 등급별 덧붙임 개수 (견습 1, 숙련부터 2) */
export function modLimit(level: MercLevel): number {
  return level === "apprentice" ? 1 : 2;
}

/** 조립 비용 (금화) */
export const CRAFT_COST = 10;

const ENEMY_STATUS = ["bleed", "poison", "crack", "weaken"];

const TARGET: Record<Shape, SkillTarget> = { enemy: "enemy", area: "none", ally: "ally", self: "none" };

/** 위력 점수 → 대기 턴 (2~5) */
export function craftCooldown(power: number): number {
  return Math.max(2, Math.min(5, Math.round(0.5 + power * 0.8)));
}

/** 같은 조합이면 같은 id가 나오도록 덧붙임은 조각 목록 순서로 정렬한다 */
export function craftId(core: string, mods: string[]): string {
  const order = (id: string) => PIECES.findIndex((p) => p.id === id);
  return `${CRAFT_PREFIX}${[core, ...[...mods].sort((a, b) => order(a) - order(b))].join(".")}`;
}

/** 조합이 올바른가: 몸체 하나, 서로 다른 덧붙임 최대 2개, 모양이 맞고, 함께 못 쓰는 조각이 없다 */
export function validCraft(core: string, mods: string[]): boolean {
  const c = getPiece(core);
  if (c?.kind !== "core" || mods.length > 2 || new Set(mods).size !== mods.length) return false;
  return mods.every((id) => {
    const m = getPiece(id);
    return m?.kind === "mod" && m.fits!.includes(c.shape!) && !m.excludes?.includes(core);
  });
}

/** "craft:..." id → 스킬 정의. 잘못된 id면 undefined */
export function craftSkill(id: string): SkillDef | undefined {
  if (!id.startsWith(CRAFT_PREFIX)) return undefined;
  const [core, ...mods] = id.slice(CRAFT_PREFIX.length).split(".");
  if (!validCraft(core, mods) || craftId(core, mods) !== id) return undefined;
  const c = getPiece(core)!;
  const ms = mods.map((m) => getPiece(m)!);
  // 상태이상 덧붙임은 전체 몸체에 붙으면 1.5배 위력으로 친다
  const power = c.power + ms.reduce((s, m) => s + (c.shape === "area" && ENEMY_STATUS.includes(m.id) ? m.power * 1.5 : m.power), 0);
  const effects = ms.flatMap((m) => m.effectsFor!(c.shape!));
  // 실패 조각은 맨 앞 (실패하면 아무 효과도 없다)
  const fail = effects.filter((e) => e.kind === "fail");
  const rest = effects.filter((e) => e.kind !== "fail");
  return {
    id,
    name: ms.length ? `${ms[0].word} ${c.word}` : c.word,
    source: {},
    cooldown: craftCooldown(power),
    target: TARGET[c.shape!],
    effects: [...fail, ...c.effects!, ...rest],
  };
}

/**
 * 스킬 안에 든 조각. 용병은 자기 스킬에 든 조각을 처음부터 안다.
 * (조각 목록에 꼭 맞지 않는 효과는 가장 가까운 조각으로 친다)
 */
export function piecesIn(def: Pick<SkillDef, "effects">): string[] {
  const out = new Set<string>();
  const hasDamage = def.effects.some((e) => e.kind === "damage");
  for (const e of def.effects) {
    switch (e.kind) {
      case "damage":
        out.add(e.area === "all" ? "sweep" : e.fixed ? "bolt" : (e.multiplier ?? 1) >= 1.8 ? "heavy" : "strike");
        break;
      case "applyStatus":
        if (e.status === "awaken") out.add("awaken");
        else if (e.status === "brace") out.add("brace");
        else if (e.status !== "haste") {
          out.add(e.status);
          if (e.area === "all" && !hasDamage) out.add("fog");
        }
        break;
      case "heal":
        out.add("mend");
        break;
      case "shield":
        out.add("ward");
        break;
      case "taunt":
        out.add("taunt");
        break;
      case "cure":
        out.add("cure");
        break;
      case "support":
        out.add("support");
        break;
      case "resetOnKill":
        out.add("reset");
        break;
      case "selfCost":
        out.add("blood");
        break;
      case "fail":
        out.add("gamble");
        break;
    }
  }
  return [...out];
}
