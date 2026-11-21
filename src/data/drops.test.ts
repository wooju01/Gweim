import { describe, expect, it } from "vitest";
import { createRng } from "@/game/random";
import { getSalvage, kindOf, sellable } from "./loot";
import { getMonster, MONSTERS } from "./monsters";
import { HIDDEN_BOSSES, MONSTER_MATERIAL, MONSTER_RELIC, RANK_DROPS, SPECIAL_DROPS, rollMonsterDrops } from "./drops";

/** n번 굴려 아이템별로 나온 횟수(마리 수 기준)와 총개수 */
function sample(kind: string, rank: "normal" | "elite" | "floorBoss" | "dungeonBoss", n = 4000) {
  const rng = createRng(7);
  const hits: Record<string, number> = {};
  const total: Record<string, number> = {};
  let trinkets = 0;
  for (let i = 0; i < n; i++) {
    const d = rollMonsterDrops(kind, rank, rng);
    for (const [id, c] of Object.entries(d.items)) {
      hits[id] = (hits[id] ?? 0) + 1;
      total[id] = (total[id] ?? 0) + c;
    }
    if (d.trinket) trinkets++;
  }
  const rate = (id: string) => (hits[id] ?? 0) / n;
  return { rate, avg: (id: string) => (total[id] ?? 0) / n, trinket: trinkets / n };
}

const near = (x: number, target: number, tol = 0.03) => {
  expect(x).toBeGreaterThan(target - tol);
  expect(x).toBeLessThan(target + tol);
};

describe("전수관 재료 드롭", () => {
  it("드롭표의 아이템과 몬스터는 모두 있고, 재료·파편만 싸게 팔 수 있다", () => {
    const ids = [
      ...Object.values(MONSTER_MATERIAL).map((m) => m.id),
      ...Object.values(MONSTER_RELIC).map((m) => m.id),
      ...Object.values(SPECIAL_DROPS).flatMap((l) => l.map((s) => s.id)),
      "tech_shard",
      "tactic_book",
      "boss_token",
    ];
    for (const id of ids) {
      expect(getSalvage(id), id).toBeDefined();
      const kind = getSalvage(id)!.kind;
      expect(sellable(id), id).toBe(kind === "material" || kind === "shard");
    }
    for (const kind of [...Object.keys(MONSTER_MATERIAL), ...Object.keys(MONSTER_RELIC), ...Object.keys(SPECIAL_DROPS), ...HIDDEN_BOSSES])
      expect(getMonster(kind), kind).toBeDefined();
    expect(kindOf(getSalvage("mat_fang")!)).toBe("material");
    expect(sellable("crude_iron")).toBe(true);
  });

  it("일반: 기술 파편 25%, 계열 재료 15%, 교본·유물·증표·장신구 없음", () => {
    const s = sample("goblin_grunt", "normal");
    near(s.rate("tech_shard"), RANK_DROPS.normal.shard.chance);
    near(s.rate("mat_whetstone"), RANK_DROPS.normal.material.chance);
    expect(s.rate("tactic_book") + s.rate("boss_token") + s.trinket).toBe(0);
  });

  it("계열 재료는 그 계열 몬스터만 떨어뜨린다", () => {
    const rat = sample("forest_rat", "normal");
    expect(Object.keys(MONSTER_MATERIAL)).not.toContain("forest_rat");
    expect(rat.rate("mat_whetstone") + rat.rate("mat_jelly") + rat.rate("mat_fang")).toBe(0);
    expect(sample("cave_wolf", "normal").rate("mat_fang")).toBeGreaterThan(0.1);
  });

  it("정예: 파편 60% ×1~2, 재료 50%, 교본 10%, 종족 유물 3%", () => {
    const s = sample("silver_wolf", "elite");
    near(s.rate("tech_shard"), 0.6);
    expect(s.avg("tech_shard") / s.rate("tech_shard")).toBeGreaterThan(1.3);
    near(s.rate("mat_fang"), 0.5);
    near(s.rate("tactic_book"), 0.1);
    near(s.rate("relic_beastfang"), 0.03, 0.015);
  });

  it("층 보스: 파편·재료 확정, 교본 30%, 유물 10%, 장신구 20%", () => {
    const s = sample("tree_giant", "floorBoss");
    expect(s.rate("tech_shard")).toBe(1);
    expect(s.rate("mat_sap")).toBe(1);
    near(s.rate("tactic_book"), 0.3);
    near(s.rate("relic_spirit"), 0.1);
    near(s.trinket, 0.2);
    expect(s.rate("boss_token")).toBe(0);
  });

  it("던전 보스: 보스 증표 확정, 재료 ×2, 교본 50%, 유물 20%, 장신구 25%", () => {
    const s = sample("alpha_wolf", "dungeonBoss");
    expect(s.rate("boss_token")).toBe(1);
    expect(s.avg("mat_fang")).toBe(2);
    expect(s.avg("tech_shard")).toBeGreaterThanOrEqual(3);
    near(s.rate("tactic_book"), 0.5);
    near(s.rate("relic_beastfang"), 0.2);
    near(s.trinket, 0.25);
  });

  it("히든 보스: 정령석 확정, 장신구 확률이 더 높다", () => {
    const s = sample("corrupted_spirit_king", "dungeonBoss");
    expect(s.rate("relic_spirit")).toBe(1);
    expect(s.trinket).toBeGreaterThan(RANK_DROPS.dungeonBoss.trinket + 0.1);
  });

  it("몬스터별 개수 지정: 맹독 거미 독샘 ×2, 고블린 주술사는 파편이 잘 나온다", () => {
    expect(sample("deadly_spider", "elite").avg("mat_venom") / sample("deadly_spider", "elite").rate("mat_venom")).toBe(2);
    expect(sample("goblin_shaman", "normal").rate("tech_shard")).toBeGreaterThan(sample("goblin_grunt", "normal").rate("tech_shard") + 0.15);
  });

  it("모든 던전 보스는 보스 증표를 떨어뜨린다", () => {
    for (const m of MONSTERS.filter((x) => x.rank === "dungeonBoss"))
      expect(rollMonsterDrops(m.id, "dungeonBoss", createRng(1)).items.boss_token, m.id).toBe(1);
  });
});
