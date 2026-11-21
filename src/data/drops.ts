// 전투 드롭 (전수관 재료). 유실물(팔 것)은 data/loot.ts의 DROPS, 여기는 조각 해금·강화 재료.
// 몬스터 등급별 기본 드롭률 + 몬스터별 계열 재료·종족 유물·특수 드롭. 확률·개수는 전부 여기서 만진다.
// 설계: docs/design (몬스터 드롭 · 조각 해금 매칭, 2026-11-21)
import type { MonsterRank } from "./monsters";
import { rollInt, type Rng } from "@/game/random";

type Roll = { chance: number; count: readonly [number, number] };
const r = (chance: number, min = 1, max = min): Roll => ({ chance, count: [min, max] });

/**
 * 등급별 기본 드롭.
 * gold: 금화 배율 (data/economy.ts의 BATTLE_GOLD × 이 값) / shard 기술 파편 / material 그 몬스터의 계열 재료
 * book 전술 교본 / raceRelic 그 몬스터의 종족 유물 / bossToken 보스 증표 / trinket 장신구
 */
export const RANK_DROPS: Record<
  MonsterRank,
  { gold: number; shard: Roll; material: Roll; book: number; raceRelic: number; bossToken: number; trinket: number }
> = {
  normal: { gold: 1, shard: r(0.25), material: r(0.15), book: 0, raceRelic: 0, bossToken: 0, trinket: 0 },
  elite: { gold: 2, shard: r(0.6, 1, 2), material: r(0.5), book: 0.1, raceRelic: 0.03, bossToken: 0, trinket: 0 },
  floorBoss: { gold: 5, shard: r(1, 2, 3), material: r(1), book: 0.3, raceRelic: 0.1, bossToken: 0, trinket: 0.2 },
  dungeonBoss: { gold: 10, shard: r(1, 3, 4), material: r(1, 2), book: 0.5, raceRelic: 0.2, bossToken: 1, trinket: 0.25 },
};

/** 히든 던전 보스: 장신구 확률 상향 (고유 장신구는 아직 없어 일반 장신구) */
export const HIDDEN_BOSS_TRINKET = 0.5;
/** "드묾"으로 표시한 일반 몬스터의 종족 유물 확률 */
export const RARE_RELIC = 0.03;

/**
 * 몬스터별 계열 재료 (계열 몬스터만 떨어뜨린다). count를 주면 기본 개수 대신 (맹독 거미 ×2 등)
 * 없는 몬스터(쥐·멧돼지·박쥐·폭탄병 등)는 계열 재료가 없다
 */
export const MONSTER_MATERIAL: Record<string, { id: string; count?: readonly [number, number] }> = {
  // 고블린 → 숫돌, 투석병·궁수·코볼트 → 화살촉
  goblin_grunt: { id: "mat_whetstone" },
  goblin_shaman: { id: "mat_whetstone" },
  goblin_warrior: { id: "mat_whetstone" },
  // 폭탄병: 터지기 전에 잡았을 때만 (자폭하면 battleSpoils의 noDrop으로 아무것도 안 떨어진다)
  goblin_bomber: { id: "mat_whetstone" },
  hobgoblin: { id: "mat_whetstone" },
  goblin_king: { id: "mat_whetstone" },
  goblin_slinger: { id: "mat_arrowhead" },
  kobold_miner: { id: "mat_arrowhead" },
  orc_archer: { id: "mat_arrowhead" },
  corrupted_ranger: { id: "mat_arrowhead" },
  // 슬라임 → 젤 (분열체 slimelet은 없음)
  green_slime: { id: "mat_jelly" },
  blue_slime: { id: "mat_jelly" },
  poison_slime: { id: "mat_jelly" },
  acid_slime: { id: "mat_jelly" },
  split_slime: { id: "mat_jelly" },
  giant_ooze: { id: "mat_jelly", count: [2, 2] },
  slime_king: { id: "mat_jelly" },
  // 늑대 → 송곳니
  cave_wolf: { id: "mat_fang" },
  hungry_wolf: { id: "mat_fang" },
  silver_wolf: { id: "mat_fang" },
  alpha_wolf: { id: "mat_fang" },
  shadow_wolf: { id: "mat_fang" },
  // 거미 → 독샘 (새끼 거미는 없음, 알 주머니는 부화 전에 부숴야)
  cave_spider: { id: "mat_venom" },
  venom_spider: { id: "mat_venom" },
  egg_sac: { id: "mat_venom" },
  crystal_spider: { id: "mat_venom" },
  deadly_spider: { id: "mat_venom", count: [2, 2] },
  spider_queen: { id: "mat_venom" },
  // 나무·정령 → 수액
  vine_spirit: { id: "mat_sap" },
  tree_giant: { id: "mat_sap" },
  twisted_treant: { id: "mat_sap" },
  corrupted_shaman: { id: "mat_sap" },
  worldtree_guard: { id: "mat_sap" },
  corrupted_spirit_king: { id: "mat_sap" },
  corrupted_elf_queen: { id: "mat_sap" },
  // 오크·오울베어 → 철퇴
  orc_warrior: { id: "mat_mace" },
  orc_berserker: { id: "mat_mace" },
  orc_shaman: { id: "mat_mace" },
  orc_drummer: { id: "mat_mace" },
  owlbear: { id: "mat_mace" },
  orc_captain: { id: "mat_mace" },
  orc_king: { id: "mat_mace" },
};

/**
 * 몬스터별 종족 유물. chance가 없으면 등급 기본값(RANK_DROPS.raceRelic), 있으면 그 확률.
 * 일반 몬스터는 등급 기본값이 0이라 chance를 꼭 준다 (드묾 = RARE_RELIC)
 */
export const MONSTER_RELIC: Record<string, { id: string; chance?: number }> = {
  orc_captain: { id: "relic_crest" },
  orc_king: { id: "relic_crest" },
  vine_spirit: { id: "relic_spirit", chance: RARE_RELIC },
  tree_giant: { id: "relic_spirit" },
  corrupted_ranger: { id: "relic_spirit", chance: RARE_RELIC },
  corrupted_shaman: { id: "relic_spirit", chance: 0.1 },
  worldtree_guard: { id: "relic_spirit" },
  // 히든 보스는 정령석 확정
  corrupted_spirit_king: { id: "relic_spirit", chance: 1 },
  corrupted_elf_queen: { id: "relic_spirit", chance: 1 },
  kobold_miner: { id: "relic_rune", chance: RARE_RELIC },
  crystal_spider: { id: "relic_rune" },
  silver_wolf: { id: "relic_beastfang" },
  alpha_wolf: { id: "relic_beastfang" },
  owlbear: { id: "relic_totem" },
  orc_shaman: { id: "relic_totem", chance: RARE_RELIC },
};

/** 몬스터별 특수 드롭 (등급 기본 드롭에 더해 굴린다) */
export const SPECIAL_DROPS: Record<string, { id: string; chance: number; count?: readonly [number, number] }[]> = {
  // 고블린 주술사: 기술 파편 확률이 높다
  goblin_shaman: [{ id: "tech_shard", chance: 0.35 }],
};

/** 히든 던전 보스 (장신구 확률 상향) */
export const HIDDEN_BOSSES = ["corrupted_spirit_king", "corrupted_elf_queen"];

export type DropResult = { items: Record<string, number>; trinket: boolean };

function add(items: Record<string, number>, id: string, n: number) {
  if (n > 0) items[id] = (items[id] ?? 0) + n;
}

function roll(rng: Rng, chance: number, count: readonly [number, number]): number {
  return chance > 0 && rng.next() < chance ? rollInt(rng.next, count[0], count[1]) : 0;
}

/**
 * 쓰러뜨린 몬스터 하나의 전수관 재료와 장신구 여부.
 * kind: 몬스터 id, rank: 전투에서의 등급 (일반 몬스터가 정예로 나오면 elite)
 */
export function rollMonsterDrops(kind: string | undefined, rank: MonsterRank | undefined, rng: Rng): DropResult {
  const items: Record<string, number> = {};
  if (!kind || !rank) return { items, trinket: false };
  const base = RANK_DROPS[rank];
  add(items, "tech_shard", roll(rng, base.shard.chance, base.shard.count));
  const mat = MONSTER_MATERIAL[kind];
  if (mat) add(items, mat.id, roll(rng, base.material.chance, mat.count ?? base.material.count));
  add(items, "tactic_book", roll(rng, base.book, [1, 1]));
  const relic = MONSTER_RELIC[kind];
  if (relic) add(items, relic.id, roll(rng, relic.chance ?? base.raceRelic, [1, 1]));
  add(items, "boss_token", roll(rng, base.bossToken, [1, 1]));
  for (const s of SPECIAL_DROPS[kind] ?? []) add(items, s.id, roll(rng, s.chance, s.count ?? [1, 1]));
  const trinketChance = HIDDEN_BOSSES.includes(kind) ? HIDDEN_BOSS_TRINKET : base.trinket;
  return { items, trinket: trinketChance > 0 && rng.next() < trinketChance };
}
