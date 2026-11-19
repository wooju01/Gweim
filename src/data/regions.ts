// 던전 = 지역(노드)과 갈래(연결)로 된 나무. 한 지역이 한 층이다.
// 층 안은 7칸 무작위 지도(game/dungeon/map.ts)이고, 층 끝 목적지에서 다음 갈래를 고른다.
// 던전 보스가 있는 지역은 목적지 칸이 보스 전투이고, 이기면 그 갈래는 끝이다 (귀환만).
// 난이도는 같은 적 수치를 키우기보다 나오는 적 구성으로 올린다.

export type Difficulty = "입문" | "입문+" | "쉬움" | "쉬움+" | "중간" | "중간+";

export type Region = {
  id: string;
  dungeon: string;
  name: string;
  /** 층 (1부터) */
  depth: number;
  difficulty: Difficulty;
  /** 짧은 소개 (갈래 고르는 화면에) */
  description: string;
  /** 나오는 적 (data/monsters.ts의 id)과 등장 가중치 */
  monsters: { id: string; weight: number }[];
  /** 한 전투에 나오는 적 수 [최소, 최대] */
  size: readonly [number, number];
  /** 일반 적이 정예로 나올 확률 (정예는 4단계) */
  eliteChance: number;
  /** 층 보스 후보와 등장 확률 (4단계) */
  floorBosses: string[];
  floorBossChance: number;
  /** 던전 보스 (있으면 목적지 칸이 보스 전투) */
  dungeonBoss?: string;
  /** 다음 갈래 (지역 id). 비어 있으면 끝 */
  next: string[];
};

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
  { id: "unknown_forest", name: "미지의 숲", description: "마을 바로 너머의 숲. 새내기 용병들이 처음 이름을 얻는 곳이다.", entry: "uf_forest", open: true, terrain: "forest", at: { x: 30, y: 52 }, level: "입문 ~ 중간" },
  { id: "abandoned_mine", name: "버려진 광산", description: "드워프들이 떠난 옛 광산. 녹슨 파수병과 망령이 갱도를 떠돈다는 소문이 있다.", entry: "", open: false, terrain: "mine", at: { x: 62, y: 38 }, level: "중간" },
  { id: "volcano", name: "화산지대", description: "불길이 솟는 붉은 땅. 불을 먹고 사는 것들이 산다고 한다.", entry: "", open: false, terrain: "volcano", at: { x: 80, y: 66 }, level: "어려움" },
  { id: "snow_peak", name: "설산", description: "만년설에 덮인 봉우리. 얼음 거인의 발자국을 봤다는 사냥꾼이 있다.", entry: "", open: false, terrain: "snow", at: { x: 52, y: 14 }, level: "어려움" },
];

export const REGIONS: Region[] = [
  {
    id: "uf_forest",
    dungeon: "unknown_forest",
    name: "미지의 숲",
    depth: 1,
    difficulty: "입문",
    description: "햇빛이 드는 얕은 숲. 고블린 졸개와 슬라임이 어슬렁거린다.",
    monsters: [
      { id: "goblin_grunt", weight: 5 },
      { id: "green_slime", weight: 4 },
      { id: "forest_rat", weight: 4 },
    ],
    size: [3, 4],
    eliteChance: 0,
    floorBosses: [],
    floorBossChance: 0,
    next: ["uf_deep_forest", "uf_cave"],
  },
  {
    id: "uf_deep_forest",
    dungeon: "unknown_forest",
    name: "깊은 숲",
    depth: 2,
    difficulty: "입문+",
    description: "나무가 빽빽해 낮에도 어둑하다. 고블린 무리가 돌을 던지며 길을 막는다.",
    monsters: [
      { id: "goblin_grunt", weight: 5 },
      { id: "goblin_slinger", weight: 3 },
      { id: "green_slime", weight: 3 },
      { id: "blue_slime", weight: 2 },
      { id: "goblin_shaman", weight: 1 },
    ],
    size: [3, 4],
    eliteChance: 0.1,
    floorBosses: ["goblin_glutton", "goblin_marksman"],
    floorBossChance: 0.15,
    next: ["uf_goblin_village", "uf_swamp", "uf_deeper_forest"],
  },
  {
    id: "uf_cave",
    dungeon: "unknown_forest",
    name: "미지의 동굴",
    depth: 2,
    difficulty: "입문+",
    description: "숲 바위틈으로 열린 동굴. 거미줄과 박쥐 날갯짓 소리가 가득하다.",
    monsters: [
      { id: "cave_spider", weight: 4 },
      { id: "vampire_bat", weight: 4 },
      { id: "cave_wolf", weight: 3 },
    ],
    size: [3, 4],
    eliteChance: 0.1,
    floorBosses: ["wolf_tamer"],
    floorBossChance: 0.15,
    next: ["uf_spider_nest", "uf_wolf_den"],
  },
  {
    id: "uf_goblin_village",
    dungeon: "unknown_forest",
    name: "고블린 마을",
    depth: 3,
    difficulty: "쉬움",
    description: "고블린들이 엉성한 울타리를 두르고 사는 마을. 왕을 자칭하는 놈이 있다.",
    monsters: [
      { id: "goblin_warrior", weight: 5 },
      { id: "goblin_slinger", weight: 3 },
      { id: "goblin_shaman", weight: 2 },
      { id: "hobgoblin", weight: 2 },
    ],
    size: [3, 4],
    eliteChance: 0.15,
    floorBosses: ["hobgoblin_chief", "goblin_glutton"],
    floorBossChance: 0.15,
    dungeonBoss: "goblin_king",
    next: [],
  },
  {
    id: "uf_swamp",
    dungeon: "unknown_forest",
    name: "늪지대",
    depth: 3,
    difficulty: "쉬움+",
    description: "발이 푹푹 빠지는 늪. 온갖 슬라임이 부글거리며 모여 산다.",
    monsters: [
      { id: "poison_slime", weight: 4 },
      { id: "acid_slime", weight: 3 },
      { id: "split_slime", weight: 3 },
    ],
    size: [3, 4],
    eliteChance: 0.15,
    floorBosses: [],
    floorBossChance: 0,
    dungeonBoss: "slime_king",
    next: [],
  },
  {
    id: "uf_deeper_forest",
    dungeon: "unknown_forest",
    name: "더 깊은 숲",
    depth: 3,
    difficulty: "중간",
    description: "고블린이 사라지고 오크의 발자국이 보이기 시작한다.",
    monsters: [
      { id: "orc_warrior", weight: 4 },
      { id: "orc_archer", weight: 3 },
      { id: "goblin_shaman", weight: 2 },
    ],
    size: [3, 4],
    eliteChance: 0.15,
    floorBosses: ["hobgoblin_chief"],
    floorBossChance: 0.15,
    next: ["uf_orc_village"],
  },
  {
    id: "uf_orc_village",
    dungeon: "unknown_forest",
    name: "오크 마을",
    depth: 4,
    difficulty: "중간+",
    description: "북소리가 울리는 오크들의 마을. 그 한가운데 오크 킹의 천막이 있다.",
    monsters: [
      { id: "orc_warrior", weight: 4 },
      { id: "orc_berserker", weight: 3 },
      { id: "orc_shaman", weight: 2 },
    ],
    size: [3, 4],
    eliteChance: 0.2,
    floorBosses: [],
    floorBossChance: 0,
    dungeonBoss: "orc_king",
    next: [],
  },
  {
    id: "uf_spider_nest",
    dungeon: "unknown_forest",
    name: "거미 둥지",
    depth: 3,
    difficulty: "쉬움+",
    description: "동굴 벽이 온통 끈적한 거미줄이다. 알 주머니가 천장에 매달려 있다.",
    monsters: [
      { id: "cave_spider", weight: 4 },
      { id: "venom_spider", weight: 3 },
      { id: "egg_sac", weight: 2 },
    ],
    size: [3, 4],
    eliteChance: 0.15,
    floorBosses: [],
    floorBossChance: 0,
    dungeonBoss: "spider_queen",
    next: [],
  },
  {
    id: "uf_wolf_den",
    dungeon: "unknown_forest",
    name: "늑대 굴",
    depth: 3,
    difficulty: "쉬움",
    description: "뼈가 굴러다니는 굴. 멀리서 우두머리의 울음소리가 들린다.",
    monsters: [
      { id: "cave_wolf", weight: 4 },
      { id: "hungry_wolf", weight: 3 },
      { id: "vampire_bat", weight: 2 },
    ],
    size: [3, 4],
    eliteChance: 0.15,
    floorBosses: ["wolf_tamer"],
    floorBossChance: 0.15,
    dungeonBoss: "alpha_wolf",
    next: [],
  },
];

export function getRegion(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}

export function getDungeon(id: string): Dungeon | undefined {
  return DUNGEONS.find((d) => d.id === id);
}

/** 처음 들어가는 던전 */
export const FIRST_DUNGEON = "unknown_forest";
