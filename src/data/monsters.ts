// 지역 몬스터 (data/regions.ts가 id로 쓴다). 기존 적 5종(data/combat.ts의 ENEMIES)은 다음 던전용으로 남겨 둔다.
// 태그는 나중에 "고블린에게 피해 +" 장신구, "고블린 10마리 처치" 의뢰에 쓴다.
// 수치는 초안이다. 밸런스는 나중에 시뮬레이션으로 조정한다.
import type { OnHit, UnitStats } from "./combat";
import { describeSkill, type Skill, type SkillDef } from "./skills";

export type MonsterTag = "goblin" | "slime" | "beast" | "insect" | "orc" | "bat" | "plant" | "spirit";
export type MonsterRank = "normal" | "elite" | "floorBoss" | "dungeonBoss";

/** 몬스터 특수 능력 (규칙은 game/combat/engine.ts) */
export type Ability =
  /** 쓰러지면 into count마리로 갈라진다 */
  | { kind: "split"; into: string; count: number }
  /** 체력이 비율 at[i] 아래로 떨어질 때마다 into count마리를 떼어 낸다 */
  | { kind: "splitAt"; into: string; count: number; at: number[] }
  /** 공격하지 않고, 자기 차례 turns번 뒤 터져서 into count마리가 된다 */
  | { kind: "hatch"; into: string; count: number; turns: number }
  /** 자기 차례 every번마다 행동 대신 into count마리를 낳는다 (max: 살아 있는 into가 이만큼이면 낳지 않는다) */
  | { kind: "brood"; into: string; count: number; every: number; max?: number }
  /** 체력이 비율 below 아래가 되면 into count마리를 부른다 (전투당 times번) */
  | { kind: "summon"; into: string; count: number; below: number; times: number }
  /** 같은 종류(into) 아군이 쓰러지면 다시 부른다 (전투당 times번) */
  | { kind: "resummon"; into: string; times: number }
  /** 같은 태그 아군 하나당 공격 +bonus */
  | { kind: "pack"; tag: MonsterTag; bonus: number }
  /** 체력이 비율 below 아래면 공격 +bonus */
  | { kind: "enrage"; below: number; bonus: number }
  /** 같은 종류의 다른 아군 공격 +bonus (정예 우두머리) */
  | { kind: "lead"; bonus: number }
  /** 자기 차례가 올 때마다 체력 amount (또는 최대 체력의 pct) 회복. 출혈 중이거나 지난 차례 뒤 불 피해를 받았으면 그 차례는 회복하지 않는다 */
  | { kind: "regen"; amount?: number; pct?: number }
  /** 자기 차례 turns번째에 전투에서 달아난다 (처치 보상 없음) */
  | { kind: "flee"; turns: number }
  /** 자기 차례 turns번째에 자폭한다: 자신은 쓰러지고 모든 적에게 damage 피해 (그전에 쓰러뜨리면 터지지 않는다) */
  | { kind: "explode"; turns: number; damage: readonly [number, number] };

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

/** 정예는 유실물을 두 번 굴린다 (전수관 재료·장신구는 data/drops.ts) */
export const ELITE_DROP_ROLLS = 2;

/** 한 전투에서 살아 있는 적이 이 수를 넘게 늘어나지 않는다 (분열·소환·부화) */
export const MAX_ENEMIES = 6;

export type Monster = UnitStats & {
  id: string;
  name: string;
  /** 적 정보에 보이는 특징 한 줄 */
  note: string;
  tags: MonsterTag[];
  rank: MonsterRank;
  /** 쓰는 스킬 (아래 MONSTER_SKILLS) */
  skills?: string[];
  /** 후열 원거리 (진형이 생기면 쓴다. 지금은 표시만) */
  ranged?: boolean;
  /** 보스와 함께 나오는 호위 (id 목록) */
  escort?: string[];
  abilities?: Ability[];
  /** 쓰러뜨리면 이 확률로 히든 열쇠 (data/keyItems.ts) */
  keyDrop?: { item: string; chance: number };
  /** 회피·치명타 확률 추가 */
  evade?: number;
  crit?: number;
  /** 쓰러뜨리면 더 받는 금화 [최소, 최대] (황금 숲 쥐 등) */
  bounty?: readonly [number, number];
  /** 출혈·중독을 걸 때 쌓이는 양 (없으면 등급 기본값, data/combat.ts의 RANK_DOT) */
  poisonStack?: number;
  bleedStack?: number;
  /** 등급 체력 배율 대신 쓰는 값 (data/combat.ts의 RANK_SCALE. 나무 거인 등 따로 맞춘 보스) */
  rankHp?: number;
};

const bleed = (chance: number): OnHit => ({ status: "bleed", chance });
const poison = (chance: number): OnHit => ({ status: "poison", chance });

/** 몬스터 전용 스킬 (효과 조각으로) */
const MONSTER_SKILL_DEFS: SkillDef[] = [
  { id: "m_mend", name: "주술 치료", cooldown: 1, target: "ally", effects: [{ kind: "heal", amount: 6 }] },
  { id: "m_war_drum", name: "전쟁 북", cooldown: 2, target: "ally", effects: [{ kind: "applyStatus", status: "awaken" }] },
  { id: "m_stone_volley", name: "돌팔매 세례", cooldown: 2, target: "none", effects: [{ kind: "damage", fixed: [2, 4], area: "all", onHit: false }] },
  { id: "m_howl", name: "울부짖음", cooldown: 2, target: "none", effects: [{ kind: "applyStatus", status: "weaken", area: "all" }] },
  { id: "m_slam", name: "내려찍기", cooldown: 1, target: "enemy", effects: [{ kind: "damage", multiplier: 1.6 }] },
  { id: "m_web", name: "거미줄 뿌리기", cooldown: 2, target: "enemy", effects: [{ kind: "applyStatus", status: "bind" }] },
  { id: "m_acid", name: "산성 분사", cooldown: 1, target: "enemy", effects: [{ kind: "damage", bonus: 1, onHit: false }, { kind: "applyStatus", status: "crack" }] },
  // ── 나무 거인 ──
  { id: "m_root_bind", name: "뿌리 묶기", cooldown: 2, target: "enemy", effects: [{ kind: "applyStatus", status: "bind" }] },
  { id: "m_branch_sweep", name: "가지 휩쓸기", cooldown: 1, target: "none", effects: [{ kind: "damage", fixed: [2, 4], area: "all", onHit: false }] },
  { id: "m_bark", name: "껍질 굳히기", cooldown: 2, target: "none", effects: [{ kind: "applyStatus", status: "armorUp", value: 2, turns: 2, who: "self" }] },
  // ── 타락한 정령왕 ──
  { id: "m_thorn_bind", name: "가시 덩굴 속박", cooldown: 2, target: "none", effects: [{ kind: "applyStatus", status: "slow", value: 2, turns: 2, area: "all" }] },
  { id: "m_spore_burst", name: "포자 폭발", cooldown: 2, target: "none", effects: [{ kind: "applyStatus", status: "poison", area: "all" }] },
  // ── 타락한 엘프의 숲 ──
  // ── 미지의 숲 추가 몬스터 ──
  // 보스 수치는 2026-11-22 시뮬레이션으로 맞춤 (층 보스·던전 보스 모두 승률 60~70%, 무작위 4명·스킬 4개, 쓰러짐·사망 규칙 반영)
  // ── 보스 예고 패턴 (한 차례 전에 예고, 그사이 기절시키면 끊긴다) ──
  { id: "m_king_command", name: "왕의 호령", cooldown: 3, target: "none", telegraph: true, warn: "{name}이 왕홀을 높이 치켜든다…", effects: [{ kind: "applyStatus", status: "attackUp", value: 3, turns: 2, who: "allies" }] },
  { id: "m_venom_spray", name: "독액 분사", cooldown: 0, target: "none", effects: [{ kind: "damage", fixed: [1, 1], area: "all", onHit: false }, { kind: "applyStatus", status: "poison", value: 7, area: "all" }, { kind: "applyStatus", status: "healReduction", value: 0.3, turns: 2, area: "all" }] },
  { id: "m_hunt_rush", name: "사냥 돌진", cooldown: 2, target: "enemy", telegraph: true, warn: "{name}가 몸을 낮추고 으르렁거린다…", effects: [{ kind: "damage", multiplier: 2.3 }] },
  { id: "m_charge", name: "돌진", cooldown: 1, target: "enemy", effects: [{ kind: "damage", multiplier: 1.7 }] },
  { id: "m_vine_grab", name: "덩굴 휘감기", cooldown: 2, target: "enemy", effects: [{ kind: "applyStatus", status: "bind" }] },
  { id: "m_screech", name: "초음파", cooldown: 2, target: "none", effects: [{ kind: "applyStatus", status: "weaken", area: "all" }] },
  { id: "m_orc_cry", name: "대장의 호령", cooldown: 2, target: "none", effects: [{ kind: "applyStatus", status: "attackUp", value: 2, turns: 2, who: "allies" }] },
  { id: "m_drumbeat", name: "전투 북소리", cooldown: 2, target: "none", effects: [{ kind: "applyStatus", status: "attackUp", value: 2, turns: 2, who: "allies" }] },
  { id: "m_maul", name: "짓이기기", cooldown: 1, target: "enemy", effects: [{ kind: "damage", multiplier: 1.5 }, { kind: "applyStatus", status: "bleed", chance: 0.5 }] },
  // ── 타락한 엘프의 숲 ──
  { id: "m_corrupt_mend", name: "타락한 치유", cooldown: 1, target: "ally", effects: [{ kind: "heal", amount: 8 }] },
  { id: "m_spore_rain", name: "포자 비", cooldown: 2, target: "none", effects: [{ kind: "applyStatus", status: "poison", area: "all" }] },
  { id: "m_shield_cover", name: "방패 막이", cooldown: 1, target: "ally", effects: [{ kind: "applyStatus", status: "cover", turns: 2 }] },
];

export const MONSTER_SKILLS: Record<string, Skill> = Object.fromEntries(
  MONSTER_SKILL_DEFS.map((d) => [d.id, { ...d, description: describeSkill(d) }]),
);

export const MONSTERS: Monster[] = [
  // ── 미지의 숲 1층 ──
  { id: "goblin_grunt", name: "고블린 졸개", hp: 18, attack: [4, 7], defense: 0, speed: 5, tags: ["goblin"], rank: "normal", note: "녹슨 단검을 휘두르는 겁 많은 고블린." },
  { id: "green_slime", name: "초록 슬라임", hp: 22, attack: [3, 6], defense: 1, speed: 1, onHit: poison(0.15), tags: ["slime"], rank: "normal", note: "말랑하고 느리다. 맞아도 잘 안 다친다." },
  { id: "forest_rat", name: "숲 쥐", hp: 14, attack: [3, 6], defense: 0, speed: 6, onHit: bleed(0.25), tags: ["beast"], rank: "normal", note: "재빠르게 물고 달아난다." },
  // ── 깊은 숲 ──
  { id: "goblin_slinger", name: "고블린 투석병", hp: 15, attack: [4, 7], defense: 0, speed: 4, ranged: true, skills: ["m_stone_volley"], tags: ["goblin"], rank: "normal", note: "뒤에서 돌을 던진다. 가끔 한꺼번에 퍼붓는다." },
  { id: "blue_slime", name: "푸른 슬라임", hp: 26, attack: [4, 7], defense: 2, speed: 1, onHit: poison(0.2), tags: ["slime"], rank: "normal", note: "초록 슬라임보다 단단하다." },
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
  { id: "egg_sac", name: "알 주머니", hp: 16, attack: [0, 0], defense: 1, speed: 0, abilities: [{ kind: "hatch", into: "cave_spider", count: 1, turns: 2 }], tags: ["insect"], rank: "normal", note: "공격하지 않는다. 가만히 두면 두 번째 차례에 동굴 거미가 깨어난다. 그전에 부수면 깨어나지 않는다." },
  { id: "spiderling", name: "새끼 거미", hp: 9, attack: [2, 4], defense: 0, speed: 6, onHit: poison(0.2), tags: ["insect"], rank: "normal", note: "작지만 수가 많다." },
  // ── 늪지대 ──
  { id: "poison_slime", name: "독 슬라임", hp: 22, attack: [3, 6], defense: 1, speed: 1, onHit: poison(0.5), tags: ["slime"], rank: "normal", note: "닿기만 해도 독이 옮는다." },
  { id: "acid_slime", name: "산성 슬라임", hp: 22, attack: [3, 6], defense: 1, speed: 1, onHit: { status: "armorDown", chance: 0.4 }, tags: ["slime"], rank: "normal", note: "산이 묻은 몸으로 부딪친다. 맞으면 갑옷이 녹는다 (방어 감소)." },
  { id: "split_slime", name: "분열 슬라임", hp: 24, attack: [3, 6], defense: 1, speed: 1, onHit: poison(0.15), abilities: [{ kind: "split", into: "slimelet", count: 2 }], tags: ["slime"], rank: "normal", note: "쓰러지면 작은 슬라임 둘로 갈라진다." },
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

  // ── 미지의 숲 추가 (2026-11-21). ★ = 종 자체가 정예 ──
  { id: "golden_rat", name: "황금 숲 쥐", hp: 14, attack: [2, 4], defense: 0, speed: 10, evade: 0.2, abilities: [{ kind: "flee", turns: 2 }], bounty: [25, 40], tags: ["beast"], rank: "elite", note: "털이 금빛으로 반짝인다. 두 번째 차례에 달아난다. 그전에 잡으면 금화를 잔뜩 떨어뜨린다." },
  { id: "giant_boar", name: "거대 숲 멧돼지", hp: 31, attack: [10, 13], defense: 2, speed: 3, escort: ["forest_boar"], skills: ["m_charge"], tags: ["beast"], rank: "floorBoss", note: "숲의 주인 노릇을 하는 멧돼지. 무섭게 돌진한다." },
  { id: "forest_boar", name: "숲 멧돼지", hp: 24, attack: [5, 8], defense: 1, speed: 4, skills: ["m_charge"], tags: ["beast"], rank: "normal", note: "고개를 숙이고 돌진해 온다." },
  { id: "vine_spirit", name: "숲의 덩굴 정령", hp: 20, attack: [3, 6], defense: 1, speed: 3, skills: ["m_vine_grab"], tags: ["plant", "spirit"], rank: "normal", note: "덩굴로 한 사람을 휘감아 한 차례 묶는다." },
  { id: "kobold_miner", name: "코볼트 광부", hp: 18, attack: [4, 7], defense: 1, speed: 5, onHit: { status: "armorDown", chance: 0.3 }, tags: ["goblin"], rank: "normal", note: "곡괭이로 갑옷 틈을 쪼아 낸다 (방어 감소)." },
  { id: "crystal_spider", name: "수정 등딱지 거미", hp: 30, attack: [5, 8], defense: 4, speed: 4, onHit: poison(0.3), tags: ["insect"], rank: "elite", note: "등에 수정이 돋아 몹시 단단하다." },
  { id: "giant_cave_bat", name: "거대 동굴 박쥐", hp: 62, attack: [17, 22], defense: 1, speed: 9, evade: 0.1, onHit: bleed(0.35), escort: ["vampire_bat", "vampire_bat"], skills: ["m_screech"], tags: ["bat", "beast"], rank: "floorBoss", note: "날개를 펴면 동굴이 어두워진다. 초음파로 모두의 기를 꺾는다." },
  { id: "goblin_bomber", name: "고블린 폭탄병", hp: 14, attack: [2, 4], defense: 0, speed: 3, abilities: [{ kind: "explode", turns: 2, damage: [5, 8] }], tags: ["goblin"], rank: "normal", note: "불붙은 폭탄을 안고 있다. 두 번째 차례에 자폭해 모두에게 피해를 준다. 그전에 쓰러뜨려야 한다." },
  { id: "silver_wolf", name: "은빛 그림자 늑대", hp: 30, attack: [7, 10], defense: 1, speed: 8, evade: 0.15, onHit: bleed(0.4), tags: ["beast"], rank: "elite", note: "은빛 털이 그림자처럼 스친다. 잘 피하고, 물리면 피가 멎지 않는다." },
  { id: "deadly_spider", name: "맹독 거미", hp: 26, attack: [6, 9], defense: 1, speed: 6, onHit: poison(0.8), tags: ["insect"], rank: "elite", note: "독이 너무 진해서 물리면 거의 반드시 중독된다." },
  { id: "giant_ooze", name: "거대 점액 슬라임", hp: 45, attack: [5, 8], defense: 2, speed: 0, onHit: poison(0.3), abilities: [{ kind: "split", into: "green_slime", count: 2 }], tags: ["slime"], rank: "elite", note: "커다란 점액 덩어리. 쓰러지면 초록 슬라임 둘로 갈라진다." },
  { id: "owlbear", name: "오울베어", hp: 48, attack: [8, 12], defense: 2, speed: 4, skills: ["m_maul"], tags: ["beast"], rank: "elite", note: "부엉이 머리에 곰의 몸. 짓이기는 한 방이 무겁다." },
  { id: "orc_captain", name: "오크 대장", hp: 61, attack: [7, 10], defense: 3, speed: 4, escort: ["orc_warrior", "orc_archer"], skills: ["m_slam", "m_orc_cry"], tags: ["orc"], rank: "floorBoss", note: "더 깊은 숲의 오크들을 이끈다. 호령 한 번에 부하들이 사나워진다." },
  { id: "orc_drummer", name: "오크 전투 군악병", hp: 26, attack: [4, 7], defense: 1, speed: 3, ranged: true, skills: ["m_drumbeat"], tags: ["orc"], rank: "normal", note: "북을 두드려 동료 모두의 공격을 끌어올린다." },

  // ── 미지의 숲 2층 깊은 숲 보스 ──
  { id: "tree_giant", name: "나무 거인", hp: 115, attack: [26, 32], defense: 1, speed: 0, rankHp: 2.5, skills: ["m_root_bind", "m_branch_sweep", "m_bark"], abilities: [{ kind: "regen", pct: 0.03 }], keyDrop: { item: "world_tree_branch", chance: 1 }, tags: ["plant"], rank: "floorBoss", note: "느리고 단단하다. 자기 차례마다 체력을 조금 되찾는다 (불에 그을리거나 피를 흘리면 못 되찾는다). 뿌리로 묶거나 가지로 휩쓴다." },

  // ── [히든] 타락한 엘프의 숲 ──
  { id: "corrupted_ranger", name: "타락한 엘프 순찰자", hp: 24, attack: [7, 10], defense: 0, speed: 7, crit: 0.15, ranged: true, onHit: { status: "evadeDown", chance: 0.4 }, tags: ["spirit"], rank: "normal", note: "검게 물든 활을 쏜다. 급소를 잘 노리고, 맞으면 몸이 무거워진다 (회피 감소)." },
  { id: "twisted_treant", name: "뒤틀린 나무 정령", hp: 40, attack: [6, 9], defense: 4, speed: 1, onHit: { status: "slow", chance: 0.4 }, tags: ["plant", "spirit"], rank: "normal", note: "단단하고 느리다. 휘감긴 가지에 맞으면 발이 묶인 듯 느려진다 (둔화)." },
  { id: "shadow_wolf", name: "그림자 늑대", hp: 26, attack: [7, 10], defense: 0, speed: 9, onHit: bleed(0.4), tags: ["beast", "spirit"], rank: "normal", note: "그림자에서 튀어나와 물어뜯는다." },
  { id: "corrupted_shaman", name: "타락한 정령술사", hp: 24, attack: [4, 7], defense: 0, speed: 5, ranged: true, skills: ["m_corrupt_mend", "m_spore_rain"], tags: ["spirit"], rank: "normal", note: "다친 동료를 치료하고, 포자를 흩뿌려 모두를 중독시킨다." },
  { id: "worldtree_guard", name: "타락한 세계수 근위병", hp: 50, attack: [5, 8], defense: 5, speed: 3, skills: ["m_shield_cover"], tags: ["plant"], rank: "elite", note: "큰 방패를 든 근위병. 다친 동료를 감싸 대신 맞아 준다." },
  { id: "corrupted_spirit_king", name: "타락한 정령왕", hp: 107, attack: [7, 11], defense: 2, speed: 4, escort: ["worldtree_guard", "corrupted_shaman"], skills: ["m_thorn_bind", "m_spore_burst"], abilities: [{ kind: "regen", amount: 5 }], tags: ["spirit"], rank: "dungeonBoss", note: "숲을 삼킨 정령들의 왕. 가시 덩굴로 모두를 늦추고, 포자를 터뜨려 중독시킨다. 차례마다 체력을 되찾는다." },
  // 타락한 엘프 여왕: 패턴 미정. 데이터 자리만 (보스 후보 가중치 0이라 아직 나오지 않는다)
  { id: "corrupted_elf_queen", name: "타락한 엘프 여왕", hp: 121, attack: [10, 14], defense: 2, speed: 6, tags: ["spirit"], rank: "dungeonBoss", note: "패턴 준비 중." },

  // ── 던전 보스 ──
  { id: "goblin_king", name: "고블린 킹", hp: 51, attack: [14, 19], defense: 2, speed: 4, escort: ["goblin_warrior", "goblin_shaman"], skills: ["m_slam", "m_king_command"], abilities: [{ kind: "brood", into: "goblin_grunt", count: 2, every: 3, max: 2 }], tags: ["goblin"], rank: "dungeonBoss", note: "고블린 마을의 왕. 세 번째 차례마다 졸개 둘을 부르고(살아 있는 졸개는 최대 둘), \"왕의 호령\"을 예고한 뒤 부하 모두의 공격을 끌어올린다." },
  { id: "slime_king", name: "슬라임 킹", hp: 73, attack: [11, 16], defense: 2, speed: 1, escort: ["poison_slime"], abilities: [{ kind: "splitAt", into: "slimelet", count: 2, at: [0.66, 0.33] }], tags: ["slime"], rank: "dungeonBoss", note: "거대한 슬라임. 체력이 3분의 1씩 줄 때마다 작은 슬라임 둘을 떼어 낸다." },
  { id: "orc_king", name: "오크 킹", hp: 51, attack: [12, 17], defense: 3, speed: 3, escort: ["orc_warrior", "orc_shaman"], skills: ["m_slam", "m_howl"], tags: ["orc"], rank: "dungeonBoss", note: "오크 마을의 우두머리. 울부짖음 한 번에 기가 꺾인다." },
  { id: "spider_queen", name: "거미 여왕", hp: 56, attack: [4, 7], defense: 1, speed: 5, onHit: { status: "poison", chance: 1 }, poisonStack: 6, escort: ["cave_spider"], skills: ["m_web", "m_venom_spray"], abilities: [{ kind: "brood", into: "egg_sac", count: 2, every: 3 }], tags: ["insect"], rank: "dungeonBoss", note: "직접 때리는 힘은 약하지만 물 때마다 독이 쌓인다 (+6). 거미줄을 뿌려 한 사람을 1차례 묶고, 독액을 자주 뿜어 모두를 중독(+7)시키고 받는 회복을 2턴 동안 30% 줄인다. 독을 언제 풀지가 관건이다. 세 번째 차례마다 알 둘을 낳는다 (두 차례 뒤 동굴 거미가 깨어난다. 그전에 깨면 부화하지 않는다)." },
  { id: "alpha_wolf", name: "우두머리 늑대", hp: 81, attack: [12, 19], defense: 1, speed: 7, onHit: bleed(0.5), escort: ["cave_wolf", "hungry_wolf"], skills: ["m_hunt_rush"], abilities: [{ kind: "pack", tag: "beast", bonus: 1 }, { kind: "summon", into: "cave_wolf", count: 1, below: 0.5, times: 1 }], tags: ["beast"], rank: "dungeonBoss", note: "곁의 짐승 하나당 공격 +1, 물면 출혈. \"사냥 돌진\"을 예고한 뒤 한 명에게 큰 피해. 체력이 절반 아래면 동굴 늑대 하나를 부른다." },
];

// 2026-11-22 보스 재조정 (깨우기·스탯 곡선·레벨업 +5 반영, 보스마다 체력·공격만): scripts/sim/boss-tune.sim.ts → results/2026-11-22-boss.md
export function getMonster(id: string): Monster | undefined {
  return MONSTERS.find((m) => m.id === id);
}
