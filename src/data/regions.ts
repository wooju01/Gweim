// 던전 = 지역(노드)과 갈래(연결)로 된 나무. 한 지역이 한 층이다.
// 층 안은 무작위 지도(game/dungeon/map.ts, 길이는 cells)이고, 층 마지막 칸(목적지)에서 다음 갈래를 고른다.
// 목적지에는 boss.chance 확률로 보스가 있고(후보 중 가중치로 하나), 없으면 보물이나 정예 전투.
// next가 비어 있는 지역은 그 갈래의 끝이다 (귀환만).
// 히든 지역은 next에 없고, hidden.from 지역의 사건에서 열쇠로 열린다 (열리면 그 층의 다음 갈래가 히든 지역이 된다).
// 몬스터·보스 이름은 data/monsters.ts에만 있다. 여기서는 id로만 가리킨다.
import type { MercLevel } from "@/lib/schemas";
import type { KeyItemId } from "./keyItems";
import { getMonster } from "./monsters";
import { parseStage, stageName, type StageKey } from "./ranks";
import { REGION_SCALE, isScaleKey, type ScaleKey } from "./combat";

/** 목적지 보스 후보. warn: 이 보스로 정해지면 보스 직전 칸에서 경고한다 (warnLevel: 경고에 보이는 권장 등급) */
export type BossPick = { monsterId: string; weight: number; warn?: boolean; warnLevel?: StageKey };

export type Region = {
  id: string;
  dungeon: string;
  name: string;
  /** 층 (1부터) */
  depth: number;
  /** 권장 등급·단계 [낮은 쪽, 높은 쪽]. 경험치 배율은 높은 쪽의 등급과 비교한다 (단계는 무시) */
  recommended: readonly [StageKey, StageKey];
  /** 짧은 소개 (갈래 고르는 화면에) */
  description: string;
  /** 나오는 적 (data/monsters.ts의 id)과 등장 가중치. elite면 이 지역에서는 늘 정예로 나온다. 비어 있으면 준비 중 */
  monsters: { id: string; weight: number; elite?: boolean }[];
  /** 한 전투에 나오는 적 수 [최소, 최대] */
  size: readonly [number, number];
  /** 일반 적이 정예로 나올 확률 */
  eliteChance: number;
  /** 몬스터 수치 배율 (data/combat.ts의 REGION_SCALE). 없으면 권장 높은 쪽 (배율표에 없으면 배율 없음) */
  scale?: ScaleKey;
  /** 층 칸 수 범위. 없으면 층 기본값 (data/dungeon.ts의 FLOOR_CELLS) */
  cells?: { min: number; max: number };
  /** 목적지 보스. 없거나 안 나오면 보물·정예 */
  boss?: { chance: number; pool: BossPick[] };
  /** 히든 지역: from 지역의 사건 칸에서, 열쇠가 있으면 triggerChance로 event가 나온다 */
  hidden?: { from: string; keyItem: KeyItemId; triggerChance: number; event: string };
  /** 다음 갈래 (지역 id). 비어 있으면 끝 */
  next: string[];
};

/** 끝 지역 보스와 중간 층 보스의 등장 확률 (정확한 값은 나중에 정한다) */
export const END_BOSS_CHANCE = 1;
export const MID_BOSS_CHANCE = 0.5;
/** 히든 사건이 나올 확률 (열쇠가 있을 때, 그 지역의 사건 칸마다) */
export const HIDDEN_TRIGGER_CHANCE = 0.5;

const only = (monsterId: string, chance: number) => ({ chance, pool: [{ monsterId, weight: 1 }] });

export type Terrain = "forest" | "cave" | "mine" | "volcano" | "snow" | "ruins";

/**
 * 던전 하나. 새 던전을 더하려면:
 * 1) 여기에 던전을 넣고 (open: true, entry: 첫 지역 id),
 * 2) REGIONS에 그 던전의 지역들을 dungeon id로 넣고 (next로 갈래를 잇는다),
 * 3) data/monsters.ts에 몬스터, data/loot.ts에 드롭표를 넣으면 지도·갈래·전투가 그대로 따라온다.
 * 지도(대륙·갈래)는 데이터에서 자동으로 그린다 (game/dungeon/atlas.ts).
 */
export type Dungeon = {
  id: string;
  name: string;
  description: string;
  /** 첫 지역 (열리지 않은 던전은 빈 문자열) */
  entry: string;
  /** 아직 갈 수 없는 던전은 대륙 지도에 "미개척"으로만 보인다 */
  open: boolean;
  terrain: Terrain;
  /** 대륙 지도 위 위치 (%, 왼쪽 위가 0) */
  at: { x: number; y: number };
  /** 권장 수준 (지도에 보이는 한 줄) */
  level: string;
};

/** 대륙 지도의 마을 위치 */
export const TOWN_AT = { x: 46, y: 58 };

export const DUNGEONS: Dungeon[] = [
  { id: "unknown_forest", name: "미지의 숲", description: "마을 바로 너머의 숲. 새내기 용병들이 처음 이름을 얻는 곳이다.", entry: "uf_forest", open: true, terrain: "forest", at: { x: 30, y: 52 }, level: "동 ~ 은" },
  // 안개 늪: 층 구조와 보스 이름만 있다. 일반 몬스터·수치가 정해지면 연다 (2026-11-21)
  { id: "fog_marsh", name: "안개 늪", description: "늘 안개가 낀 늪. 오래된 묘지와 버려진 수도원이 안개 속에 잠겨 있다.", entry: "fm_marsh", open: false, terrain: "ruins", at: { x: 22, y: 74 }, level: "은 ~ 금" },
  { id: "abandoned_mine", name: "버려진 광산", description: "드워프들이 떠난 옛 광산. 녹슨 파수병과 망령이 갱도를 떠돈다는 소문이 있다.", entry: "", open: false, terrain: "mine", at: { x: 62, y: 38 }, level: "미정" },
  { id: "volcano", name: "화산지대", description: "불길이 솟는 붉은 땅. 불을 먹고 사는 것들이 산다고 한다.", entry: "", open: false, terrain: "volcano", at: { x: 80, y: 66 }, level: "미정" },
  { id: "snow_peak", name: "설산", description: "만년설에 덮인 봉우리. 얼음 거인의 발자국을 봤다는 사냥꾼이 있다.", entry: "", open: false, terrain: "snow", at: { x: 52, y: 14 }, level: "미정" },
];

const FOREST_REGIONS: Region[] = [
  {
    id: "uf_forest",
    dungeon: "unknown_forest",
    name: "미지의 숲",
    depth: 1,
    recommended: ["bronze3", "bronze3"],
    description: "햇빛이 드는 얕은 숲. 고블린 졸개와 슬라임이 어슬렁거린다.",
    monsters: [
      { id: "goblin_grunt", weight: 5 },
      { id: "green_slime", weight: 4 },
      { id: "forest_rat", weight: 4 },
      { id: "golden_rat", weight: 0.4 },
    ],
    size: [3, 4],
    eliteChance: 0,
    boss: only("giant_boar", 0.2),
    next: ["uf_deep_forest", "uf_cave"],
  },
  {
    id: "uf_deep_forest",
    dungeon: "unknown_forest",
    name: "깊은 숲",
    depth: 2,
    recommended: ["bronze2", "bronze2"],
    description: "나무가 빽빽해 낮에도 어둑하다. 숲 한가운데 움직이는 거목이 있다는 소문이다.",
    monsters: [
      { id: "goblin_grunt", weight: 5 },
      { id: "goblin_slinger", weight: 3 },
      { id: "green_slime", weight: 3 },
      { id: "blue_slime", weight: 2 },
      { id: "goblin_shaman", weight: 1 },
      { id: "forest_boar", weight: 2 },
      { id: "vine_spirit", weight: 2 },
    ],
    size: [3, 4],
    eliteChance: 0.1,
    boss: only("tree_giant", MID_BOSS_CHANCE),
    next: ["uf_goblin_village", "uf_swamp", "uf_deeper_forest"],
  },
  {
    id: "uf_cave",
    dungeon: "unknown_forest",
    name: "미지의 동굴",
    depth: 2,
    recommended: ["bronze2", "bronze2"],
    description: "숲 바위틈으로 열린 동굴. 거미줄과 박쥐 날갯짓 소리가 가득하다.",
    monsters: [
      { id: "cave_spider", weight: 4 },
      { id: "vampire_bat", weight: 4 },
      { id: "cave_wolf", weight: 3 },
      { id: "kobold_miner", weight: 3 },
      { id: "crystal_spider", weight: 0.8 },
    ],
    size: [3, 4],
    eliteChance: 0.1,
    boss: only("giant_cave_bat", MID_BOSS_CHANCE),
    next: ["uf_spider_nest", "uf_wolf_den"],
  },
  {
    id: "uf_goblin_village",
    dungeon: "unknown_forest",
    name: "고블린 마을",
    depth: 3,
    recommended: ["bronze1", "bronze1"],
    description: "고블린들이 엉성한 울타리를 두르고 사는 마을. 왕을 자칭하는 놈이 있다.",
    monsters: [
      { id: "goblin_warrior", weight: 5 },
      { id: "goblin_slinger", weight: 3 },
      { id: "goblin_shaman", weight: 2 },
      { id: "hobgoblin", weight: 1, elite: true },
      { id: "goblin_bomber", weight: 2 },
    ],
    size: [3, 4],
    eliteChance: 0.15,
    boss: only("goblin_king", END_BOSS_CHANCE),
    next: [],
  },
  {
    id: "uf_swamp",
    dungeon: "unknown_forest",
    name: "늪지대",
    depth: 3,
    recommended: ["bronze1", "bronze1"],
    description: "발이 푹푹 빠지는 늪. 온갖 슬라임이 부글거리며 모여 산다.",
    monsters: [
      { id: "poison_slime", weight: 4 },
      { id: "acid_slime", weight: 3 },
      { id: "split_slime", weight: 3 },
      { id: "giant_ooze", weight: 0.8 },
    ],
    size: [3, 4],
    eliteChance: 0.15,
    boss: only("slime_king", END_BOSS_CHANCE),
    next: [],
  },
  {
    id: "uf_deeper_forest",
    dungeon: "unknown_forest",
    name: "더 깊은 숲",
    depth: 3,
    recommended: ["bronze1", "silver3"],
    description: "고블린이 사라지고 오크의 발자국이 보이기 시작한다. 어디선가 숲이 수군거린다.",
    monsters: [
      { id: "orc_warrior", weight: 4 },
      { id: "orc_archer", weight: 3 },
      { id: "goblin_shaman", weight: 2 },
      { id: "owlbear", weight: 0.8 },
      { id: "orc_berserker", weight: 0.8, elite: true },
    ],
    size: [3, 4],
    eliteChance: 0.15,
    boss: only("orc_captain", MID_BOSS_CHANCE),
    next: ["uf_orc_village"],
  },
  {
    id: "uf_orc_village",
    dungeon: "unknown_forest",
    name: "오크 마을",
    depth: 4,
    recommended: ["silver3", "silver3"],
    description: "북소리가 울리는 오크들의 마을. 그 한가운데 오크 킹의 천막이 있다.",
    monsters: [
      { id: "orc_warrior", weight: 4 },
      { id: "orc_berserker", weight: 3 },
      { id: "orc_shaman", weight: 2 },
      { id: "orc_drummer", weight: 2 },
    ],
    size: [3, 4],
    eliteChance: 0.2,
    boss: only("orc_king", END_BOSS_CHANCE),
    next: [],
  },
  {
    id: "uf_corrupted_forest",
    dungeon: "unknown_forest",
    name: "타락한 엘프의 숲",
    depth: 4,
    recommended: ["silver2", "silver2"],
    description: "나무와 정령이 검게 물든 숲. 세계수의 가지가 이곳을 가리켰다.",
    monsters: [
      { id: "corrupted_ranger", weight: 4 },
      { id: "twisted_treant", weight: 3 },
      { id: "shadow_wolf", weight: 3 },
      { id: "corrupted_shaman", weight: 2 },
      { id: "worldtree_guard", weight: 1 },
    ],
    size: [3, 4],
    eliteChance: 0.25,
    cells: { min: 12, max: 12 },
    // 히든 보스는 확정. 엘프 여왕은 패턴이 정해질 때까지 가중치 0
    boss: {
      chance: 1,
      pool: [
        { monsterId: "corrupted_spirit_king", weight: 1 },
        { monsterId: "corrupted_elf_queen", weight: 0 },
      ],
    },
    hidden: { from: "uf_deeper_forest", keyItem: "world_tree_branch", triggerChance: HIDDEN_TRIGGER_CHANCE, event: "whispering_grove" },
    next: [],
  },
  {
    id: "uf_spider_nest",
    dungeon: "unknown_forest",
    name: "거미 둥지",
    depth: 3,
    recommended: ["bronze1", "bronze1"],
    description: "동굴 벽이 온통 끈적한 거미줄이다. 알 주머니가 천장에 매달려 있다.",
    monsters: [
      { id: "cave_spider", weight: 4 },
      { id: "venom_spider", weight: 3 },
      { id: "egg_sac", weight: 2 },
      { id: "deadly_spider", weight: 0.8 },
    ],
    size: [3, 4],
    eliteChance: 0.15,
    boss: only("spider_queen", END_BOSS_CHANCE),
    next: [],
  },
  {
    id: "uf_wolf_den",
    dungeon: "unknown_forest",
    name: "늑대 굴",
    depth: 3,
    recommended: ["bronze1", "bronze1"],
    description: "뼈가 굴러다니는 굴. 멀리서 우두머리의 울음소리가 들린다.",
    monsters: [
      { id: "cave_wolf", weight: 4 },
      { id: "hungry_wolf", weight: 3 },
      { id: "vampire_bat", weight: 2 },
      { id: "silver_wolf", weight: 0.8 },
    ],
    size: [3, 4],
    eliteChance: 0.15,
    boss: only("alpha_wolf", END_BOSS_CHANCE),
    next: [],
  },
];

// ── 안개 늪 (닫혀 있음: 층 구조와 보스 이름 자리만) ──
// 보스·일반 몬스터는 아직 data/monsters.ts에 없다. 이름은 PLANNED_BOSSES에 둔다.
const pair = (a: string, b: string, chance = END_BOSS_CHANCE) => ({
  chance,
  pool: [
    { monsterId: a, weight: 1 },
    { monsterId: b, weight: 1 },
  ],
});
const marsh = (r: Omit<Region, "dungeon" | "monsters" | "size" | "eliteChance">): Region => ({
  dungeon: "fog_marsh",
  monsters: [],
  size: [3, 4],
  eliteChance: 0.2,
  ...r,
});

const MARSH_REGIONS: Region[] = [
  marsh({ id: "fm_marsh", name: "안개 낀 늪지", depth: 1, recommended: ["silver3", "silver3"], description: "한 치 앞이 안 보이는 안개 늪.", boss: pair("marsh_hydra", "mud_toad_lord", MID_BOSS_CHANCE), next: ["fm_graveyard", "fm_monastery"] }),
  marsh({ id: "fm_graveyard", name: "잊혀진 공동묘지", depth: 2, recommended: ["silver2", "silver2"], description: "이름이 지워진 묘비들이 늘어선 묘지.", boss: pair("grave_revenant", "dullahan", MID_BOSS_CHANCE), next: ["fm_corpse_pit", "fm_bone_cave"] }),
  marsh({ id: "fm_corpse_pit", name: "시체 구덩이", depth: 3, recommended: ["silver1", "silver1"], description: "버려진 것들이 쌓인 구덩이.", boss: pair("ghoul_lord", "flesh_golem"), next: [] }),
  marsh({ id: "fm_bone_cave", name: "뼈 동굴", depth: 3, recommended: ["silver1", "silver1"], description: "벽이 온통 뼈로 된 동굴.", boss: pair("skeleton_centurion", "grave_hound", MID_BOSS_CHANCE), next: ["fm_dragon_tomb"] }),
  marsh({ id: "fm_dragon_tomb", name: "용의 무덤", depth: 4, recommended: ["gold3", "gold3"], description: "거대한 용의 뼈가 잠든 곳.", boss: pair("bone_dragon", "skeleton_giant"), next: [] }),
  marsh({ id: "fm_monastery", name: "역병의 수도원", depth: 2, recommended: ["silver2", "silver2"], description: "역병으로 버려진 수도원. 종소리가 가끔 혼자 울린다.", boss: pair("high_banshee", "gargoyle_lord", MID_BOSS_CHANCE), next: ["fm_chapel"] }),
  marsh({ id: "fm_chapel", name: "오염된 예배당", depth: 3, recommended: ["silver1", "silver1"], description: "검게 그을린 예배당.", boss: pair("plague_doctor", "heretic_inquisitor", MID_BOSS_CHANCE), next: ["fm_cathedral"] }),
  marsh({ id: "fm_cathedral", name: "금단의 대성당", depth: 4, recommended: ["gold3", "gold3"], description: "들어간 사람이 돌아오지 않는다는 대성당.", boss: pair("lich", "necromancer_lord"), next: [] }),
  marsh({
    id: "fm_vampire_castle",
    name: "뱀파이어 성",
    depth: 4,
    recommended: ["gold3", "gold2"],
    // 금2 배율이 아직 없어서 금3 배율
    scale: "gold3",
    description: "핏빛 초대장이 이끄는 성.",
    cells: { min: 12, max: 15 },
    // 백작부인 7 / 뱀파이어 로드 3. 로드로 정해지면 보스 직전 칸에서 경고 (권장 미스릴3)
    boss: {
      chance: 1,
      pool: [
        { monsterId: "vampire_countess", weight: 7 },
        { monsterId: "vampire_lord", weight: 3, warn: true, warnLevel: "mithril3" },
      ],
    },
    hidden: { from: "fm_chapel", keyItem: "blood_invitation", triggerChance: HIDDEN_TRIGGER_CHANCE, event: "crimson_summons" },
    next: [],
  }),
];

/** 아직 몬스터 데이터가 없는 보스 이름 (안개 늪). 몬스터를 만들면 여기서 지운다 */
export const PLANNED_BOSSES: Record<string, string> = {
  marsh_hydra: "늪지 히드라",
  mud_toad_lord: "진흙 두꺼비 군주",
  grave_revenant: "무덤지기 레버넌트",
  dullahan: "듀라한",
  ghoul_lord: "식인 구울 군주",
  flesh_golem: "살점 골렘",
  skeleton_centurion: "해골 백부장",
  grave_hound: "묘지기의 사냥개",
  bone_dragon: "본 드래곤",
  skeleton_giant: "해골 거인",
  high_banshee: "고위 밴시",
  gargoyle_lord: "가고일 로드",
  plague_doctor: "역병 의사",
  heretic_inquisitor: "이단 심문관",
  lich: "리치",
  necromancer_lord: "네크로맨서 로드",
  vampire_countess: "백작부인",
  vampire_lord: "뱀파이어 로드",
};

/** 핏빛 초대장을 주는 보스 (안개 늪이 열리면 몬스터의 keyDrop으로 옮긴다) */
export const PLANNED_KEY_DROPS: Record<string, string> = { high_banshee: "blood_invitation", gargoyle_lord: "blood_invitation" };

export const REGIONS: Region[] = [...FOREST_REGIONS, ...MARSH_REGIONS];

export function getRegion(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}

export function getDungeon(id: string): Dungeon | undefined {
  return DUNGEONS.find((d) => d.id === id);
}

/** 처음 들어가는 던전 */
export const FIRST_DUNGEON = "unknown_forest";

/** 이 지역에서 열리는 히든 지역 */
export function hiddenFrom(regionId: string): Region[] {
  return REGIONS.filter((r) => r.hidden?.from === regionId);
}

/** 권장 등급 표시 ("동2", "동1~은3") */
export function recommendedLabel(r: Region): string {
  const [lo, hi] = r.recommended;
  return lo === hi ? stageName(lo) : `${stageName(lo)}~${stageName(hi)}`;
}

/** 경험치 배율을 정하는 권장 등급 (높은 쪽의 등급) */
export function recommendedGrade(r: Region): MercLevel {
  return parseStage(r.recommended[1]).level;
}

/** 구역의 몬스터 배율: scale이 있으면 그것, 없으면 권장 높은 쪽 */
export function scaleOf(r: Region): { hp: number; atk: number } | undefined {
  const key = r.scale ?? r.recommended[1];
  return isScaleKey(key) ? REGION_SCALE[key] : undefined;
}

/** 목적지 보스 후보 이름 (나올 수 있는 것만. 몬스터가 아직 없으면 계획된 이름) */
export function bossNames(r: Region): string[] {
  return (r.boss?.pool ?? []).filter((p) => p.weight > 0).map((p) => getMonster(p.monsterId)?.name ?? PLANNED_BOSSES[p.monsterId] ?? p.monsterId);
}
