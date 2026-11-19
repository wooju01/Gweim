// 지역 몬스터 (data/regions.ts가 id로 쓴다). 기존 적 5종(data/combat.ts의 ENEMIES)은 다음 던전용으로 남겨 둔다.
// 태그는 나중에 "고블린에게 피해 +" 장신구, "고블린 10마리 처치" 의뢰에 쓴다.
// 수치는 초안이다. 밸런스는 나중에 시뮬레이션으로 조정한다.
import type { OnHit, UnitStats } from "./combat";
import { describeSkill, type Skill, type SkillDef } from "./skills";

export type MonsterTag = "goblin" | "slime" | "beast" | "insect" | "orc" | "bat";
export type MonsterRank = "normal" | "elite" | "floorBoss" | "dungeonBoss";

/** 몬스터 특수 능력 (규칙은 game/combat/engine.ts) */
export type Ability =
  /** 쓰러지면 into count마리로 갈라진다 */
  | { kind: "split"; into: string; count: number }
  /** 체력이 비율 at[i] 아래로 떨어질 때마다 into count마리를 떼어 낸다 */
  | { kind: "splitAt"; into: string; count: number; at: number[] }
  /** 공격하지 않고, 자기 차례 turns번 뒤 터져서 into count마리가 된다 */
  | { kind: "hatch"; into: string; count: number; turns: number }
  /** 자기 차례 every번마다 행동 대신 into count마리를 낳는다 */
  | { kind: "brood"; into: string; count: number; every: number }
  /** 체력이 비율 below 아래가 되면 into count마리를 부른다 (전투당 times번) */
  | { kind: "summon"; into: string; count: number; below: number; times: number }
  /** 같은 종류(into) 아군이 쓰러지면 다시 부른다 (전투당 times번) */
  | { kind: "resummon"; into: string; times: number }
  /** 같은 태그 아군 하나당 공격 +bonus */
  | { kind: "pack"; tag: MonsterTag; bonus: number }
  /** 체력이 비율 below 아래면 공격 +bonus */
  | { kind: "enrage"; below: number; bonus: number }
  /** 같은 종류의 다른 아군 공격 +bonus (정예 우두머리) */
  | { kind: "lead"; bonus: number };

/** 정예 특성: 일반 몬스터에 하나를 무작위로 붙인다. 이름 앞에 prefix */
export type EliteTrait = {
  id: string;
  prefix: string;
  description: string;
  defense?: number;
  speed?: number;
  attack?: number;
  evade?: number;
  onHit?: OnHit;
  ability?: Ability;
};

export const ELITE_TRAITS: EliteTrait[] = [
  { id: "sturdy", prefix: "단단한", description: "방어 +2", defense: 2 },
  { id: "swift", prefix: "재빠른", description: "속도 +3, 회피 +10%", speed: 3, evade: 0.1 },
  { id: "frenzied", prefix: "광폭한", description: "공격 +3, 방어 -1", attack: 3, defense: -1 },
  { id: "bloodcall", prefix: "피를 부르는", description: "공격하면 50% 확률로 출혈", onHit: { status: "bleed", chance: 0.5 } },
  { id: "leader", prefix: "우두머리", description: "같은 종류 아군 공격 +1", ability: { kind: "lead", bonus: 1 } },
];

/** 정예·층 보스 보상 */
export const ELITE_DROP_ROLLS = 2;
export const FLOOR_BOSS_TRINKET_CHANCE = 0.3;

/** 한 전투에서 살아 있는 적이 이 수를 넘게 늘어나지 않는다 (분열·소환·부화) */
export const MAX_ENEMIES = 6;

export type Monster = UnitStats & {
  id: string;
  name: string;
  /** 적 정보에 보이는 특징 한 줄 */
  note: string;
  tags: MonsterTag[];
  rank: MonsterRank;
  /** 쓰는 스킬 (아래 MONSTER_SKILLS 또는 data/skills.ts) */
  skills?: string[];
  /** 후열 원거리 (진형이 생기면 쓴다. 지금은 표시만) */
  ranged?: boolean;
  /** 보스와 함께 나오는 호위 (id 목록) */
  escort?: string[];
  abilities?: Ability[];
};

const bleed = (chance: number): OnHit => ({ status: "bleed", chance });
const poison = (chance: number): OnHit => ({ status: "poison", chance });

/** 몬스터 전용 스킬 (효과 조각으로) */
const MONSTER_SKILL_DEFS: SkillDef[] = [
  { id: "m_mend", name: "주술 치료", source: {}, cooldown: 2, target: "ally", effects: [{ kind: "heal", amount: 6 }] },
  { id: "m_war_drum", name: "전쟁 북", source: {}, cooldown: 3, target: "ally", effects: [{ kind: "applyStatus", status: "awaken" }] },
  { id: "m_stone_volley", name: "돌팔매 세례", source: {}, cooldown: 3, target: "none", effects: [{ kind: "damage", fixed: [2, 4], area: "all", onHit: false }] },
  { id: "m_howl", name: "울부짖음", source: {}, cooldown: 3, target: "none", effects: [{ kind: "applyStatus", status: "weaken", area: "all" }] },
  { id: "m_slam", name: "내려찍기", source: {}, cooldown: 2, target: "enemy", effects: [{ kind: "damage", multiplier: 1.6 }] },
  { id: "m_web", name: "거미줄", source: {}, cooldown: 3, target: "enemy", effects: [{ kind: "applyStatus", status: "bind" }] },
  { id: "m_acid", name: "산성 분사", source: {}, cooldown: 2, target: "enemy", effects: [{ kind: "damage", bonus: 1, onHit: false }, { kind: "applyStatus", status: "crack" }] },
];

export const MONSTER_SKILLS: Record<string, Skill> = Object.fromEntries(
  MONSTER_SKILL_DEFS.map((d) => [d.id, { ...d, description: describeSkill(d) }]),
);

export const MONSTERS: Monster[] = [
  // ── 미지의 숲 1층 ──
  { id: "goblin_grunt", name: "고블린 졸개", hp: 18, attack: [4, 7], defense: 0, speed: 5, tags: ["goblin"], rank: "normal", note: "녹슨 단검을 휘두르는 겁 많은 고블린." },
  { id: "green_slime", name: "초록 슬라임", hp: 22, attack: [3, 6], defense: 1, speed: 1, tags: ["slime"], rank: "normal", note: "말랑하고 느리다. 맞아도 잘 안 다친다." },
  { id: "forest_rat", name: "숲 쥐", hp: 14, attack: [3, 6], defense: 0, speed: 6, onHit: bleed(0.25), tags: ["beast"], rank: "normal", note: "재빠르게 물고 달아난다." },
  // ── 깊은 숲 ──
  { id: "goblin_slinger", name: "고블린 투석병", hp: 15, attack: [4, 7], defense: 0, speed: 4, ranged: true, skills: ["m_stone_volley"], tags: ["goblin"], rank: "normal", note: "뒤에서 돌을 던진다. 가끔 한꺼번에 퍼붓는다." },
  { id: "blue_slime", name: "푸른 슬라임", hp: 26, attack: [4, 7], defense: 2, speed: 1, tags: ["slime"], rank: "normal", note: "초록 슬라임보다 단단하다." },
  { id: "goblin_shaman", name: "고블린 주술사", hp: 16, attack: [3, 5], defense: 0, speed: 4, ranged: true, skills: ["m_mend"], tags: ["goblin"], rank: "normal", note: "다친 동료를 주술로 치료한다. 먼저 쓰러뜨리는 게 좋다." },
  // ── 미지의 동굴 ──
  { id: "cave_spider", name: "동굴 거미", hp: 18, attack: [4, 7], defense: 0, speed: 6, onHit: poison(0.3), tags: ["insect"], rank: "normal", note: "천장에서 떨어져 독니를 박는다." },
  { id: "vampire_bat", name: "흡혈 박쥐", hp: 14, attack: [3, 6], defense: 0, speed: 8, onHit: bleed(0.3), tags: ["bat", "beast"], rank: "normal", note: "빠르게 날아들어 피를 빤다." },
  { id: "cave_wolf", name: "동굴 늑대", hp: 22, attack: [5, 8], defense: 0, speed: 6, onHit: bleed(0.25), tags: ["beast"], rank: "normal", note: "무리 지어 사냥한다." },
  // ── 고블린 마을 ──
  { id: "goblin_warrior", name: "고블린 전사", hp: 24, attack: [5, 9], defense: 1, speed: 5, tags: ["goblin"], rank: "normal", note: "졸개보다 덩치가 크고 방패를 들었다." },
  { id: "hobgoblin", name: "홉고블린", hp: 34, attack: [6, 10], defense: 3, speed: 2, tags: ["goblin"], rank: "normal", note: "두꺼운 가죽 갑옷. 웬만한 공격은 튕겨 낸다." },
  // ── 늑대 굴 ──
  { id: "hungry_wolf", name: "굶주린 늑대", hp: 20, attack: [6, 9], defense: 0, speed: 7, onHit: bleed(0.35), tags: ["beast"], rank: "normal", note: "굶주려서 물불을 가리지 않는다." },
  // ── 거미 둥지 ──
  { id: "venom_spider", name: "독거미", hp: 20, attack: [4, 7], defense: 0, speed: 5, onHit: poison(0.6), tags: ["insect"], rank: "normal", note: "독이 진하다. 물리면 거의 중독된다." },
  { id: "egg_sac", name: "알 주머니", hp: 16, attack: [0, 0], defense: 1, speed: 0, abilities: [{ kind: "hatch", into: "spiderling", count: 2, turns: 2 }], tags: ["insect"], rank: "normal", note: "공격하지 않는다. 가만히 두면 두 번째 차례에 새끼 거미 둘이 깨어난다." },
  { id: "spiderling", name: "새끼 거미", hp: 9, attack: [2, 4], defense: 0, speed: 6, onHit: poison(0.2), tags: ["insect"], rank: "normal", note: "작지만 수가 많다." },
  // ── 늪지대 ──
  { id: "poison_slime", name: "독 슬라임", hp: 22, attack: [3, 6], defense: 1, speed: 1, onHit: poison(0.5), tags: ["slime"], rank: "normal", note: "닿기만 해도 독이 옮는다." },
  { id: "acid_slime", name: "산성 슬라임", hp: 22, attack: [3, 6], defense: 1, speed: 1, skills: ["m_acid"], tags: ["slime"], rank: "normal", note: "산을 뿜어 갑옷을 녹인다 (균열)." },
  { id: "split_slime", name: "분열 슬라임", hp: 24, attack: [3, 6], defense: 1, speed: 1, abilities: [{ kind: "split", into: "slimelet", count: 2 }], tags: ["slime"], rank: "normal", note: "쓰러지면 작은 슬라임 둘로 갈라진다." },
  { id: "slimelet", name: "작은 슬라임", hp: 9, attack: [2, 4], defense: 0, speed: 2, tags: ["slime"], rank: "normal", note: "갈라져 나온 작은 슬라임." },
  // ── 더 깊은 숲 / 오크 마을 ──
  { id: "orc_warrior", name: "오크 전사", hp: 34, attack: [7, 11], defense: 1, speed: 3, tags: ["orc"], rank: "normal", note: "도끼 한 방이 무겁다." },
  { id: "orc_archer", name: "오크 궁수", hp: 26, attack: [6, 10], defense: 0, speed: 5, ranged: true, tags: ["orc"], rank: "normal", note: "뒤에서 굵은 화살을 쏜다." },
  { id: "orc_berserker", name: "오크 광전사", hp: 30, attack: [9, 13], defense: 0, speed: 4, abilities: [{ kind: "enrage", below: 0.5, bonus: 3 }], tags: ["orc"], rank: "normal", note: "체력이 절반 아래면 공격 +3." },
  { id: "orc_shaman", name: "오크 주술사", hp: 24, attack: [4, 7], defense: 0, speed: 4, ranged: true, skills: ["m_war_drum", "m_mend"], tags: ["orc"], rank: "normal", note: "북을 쳐 동료를 날뛰게 하고, 상처를 치료한다." },

  // ── 층 보스 (4단계에서 등장) ──
  { id: "goblin_glutton", name: "배불뚝이 고블린", hp: 60, attack: [6, 10], defense: 1, speed: 1, escort: ["goblin_grunt", "goblin_grunt"], skills: ["m_slam"], tags: ["goblin"], rank: "floorBoss", note: "체력이 많고 굼뜨다. 졸개 둘을 거느린다." },
  { id: "goblin_marksman", name: "고블린 명사수", hp: 40, attack: [7, 11], defense: 0, speed: 6, ranged: true, escort: ["goblin_slinger", "goblin_slinger"], skills: ["m_stone_volley"], tags: ["goblin"], rank: "floorBoss", note: "투석병들을 지휘해 한 사람을 집중해서 노린다." },
  { id: "wolf_tamer", name: "늑대 조련사", hp: 44, attack: [6, 9], defense: 1, speed: 5, escort: ["cave_wolf", "cave_wolf"], abilities: [{ kind: "resummon", into: "cave_wolf", times: 1 }], tags: ["goblin"], rank: "floorBoss", note: "늑대를 부린다. 늑대가 쓰러지면 한 번 다시 부른다." },
  { id: "hobgoblin_chief", name: "홉고블린 대장", hp: 56, attack: [7, 11], defense: 3, speed: 3, escort: ["goblin_warrior"], skills: ["m_slam"], abilities: [{ kind: "enrage", below: 0.5, bonus: 3 }], tags: ["goblin"], rank: "floorBoss", note: "체력이 절반 아래로 떨어지면 공격 +3." },

  // ── 던전 보스 ──
  { id: "goblin_king", name: "고블린 킹", hp: 80, attack: [8, 12], defense: 2, speed: 4, escort: ["goblin_warrior", "goblin_shaman"], skills: ["m_slam", "m_war_drum"], tags: ["goblin"], rank: "dungeonBoss", note: "고블린 마을의 왕. 북을 울려 부하들을 날뛰게 한다." },
  { id: "slime_king", name: "슬라임 킹", hp: 90, attack: [6, 10], defense: 2, speed: 1, escort: ["poison_slime"], abilities: [{ kind: "splitAt", into: "split_slime", count: 1, at: [0.66, 0.33] }], tags: ["slime"], rank: "dungeonBoss", note: "거대한 슬라임. 체력이 3분의 1씩 줄 때마다 분열 슬라임을 떼어 낸다." },
  { id: "orc_king", name: "오크 킹", hp: 110, attack: [10, 15], defense: 3, speed: 3, escort: ["orc_warrior", "orc_shaman"], skills: ["m_slam", "m_howl"], tags: ["orc"], rank: "dungeonBoss", note: "오크 마을의 우두머리. 울부짖음 한 번에 기가 꺾인다." },
  { id: "spider_queen", name: "거미 여왕", hp: 85, attack: [7, 11], defense: 1, speed: 5, onHit: poison(0.4), escort: ["cave_spider"], skills: ["m_web"], abilities: [{ kind: "brood", into: "spiderling", count: 2, every: 3 }], tags: ["insect"], rank: "dungeonBoss", note: "거미줄로 한 사람을 1턴 묶고, 세 번째 차례마다 새끼 거미 둘을 낳는다." },
  { id: "alpha_wolf", name: "우두머리 늑대", hp: 75, attack: [8, 12], defense: 1, speed: 7, onHit: bleed(0.3), escort: ["cave_wolf", "hungry_wolf"], skills: ["m_howl"], abilities: [{ kind: "pack", tag: "beast", bonus: 1 }, { kind: "summon", into: "cave_wolf", count: 2, below: 0.5, times: 1 }], tags: ["beast"], rank: "dungeonBoss", note: "곁의 짐승 하나당 공격 +1. 체력이 절반 아래면 늑대 둘을 부른다." },
];

export function getMonster(id: string): Monster | undefined {
  return MONSTERS.find((m) => m.id === id);
}
