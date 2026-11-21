import { describe, expect, it } from "vitest";
import { createRng } from "@/game/random";
import { ENEMIES } from "./combat";
import { DROPS, MATERIAL_PRICE, SALVAGE, addSalvage, carriedValue, getSalvage, rollDrops, sellable } from "./loot";

describe("유실물", () => {
  it("모든 적 종류에 드롭표가 있고, 드롭표의 유실물은 모두 있다", () => {
    for (const e of ENEMIES) expect(DROPS[e.id], e.id).toBeDefined();
    for (const table of Object.values(DROPS)) for (const d of table) expect(getSalvage(d.id), d.id).toBeDefined();
    expect(new Set(SALVAGE.map((s) => s.id)).size).toBe(SALVAGE.length);
  });

  it("흔한 것은 약 50%, 드문 것은 약 15%로 떨어진다", () => {
    const rng = createRng(3);
    let common = 0;
    let rare = 0;
    for (let i = 0; i < 2000; i++) {
      const got = rollDrops("ash_rat", rng);
      if (got.includes("rat_fang")) common++;
      if (got.includes("ash_hide")) rare++;
    }
    expect(common / 2000).toBeGreaterThan(0.45);
    expect(common / 2000).toBeLessThan(0.55);
    expect(rare / 2000).toBeGreaterThan(0.11);
    expect(rare / 2000).toBeLessThan(0.19);
    expect(rollDrops(undefined, rng)).toEqual([]);
  });

  it("같은 종류는 묶어서 센다", () => {
    expect(addSalvage({ rat_fang: 2 }, { rat_fang: 1, spore_sac: 1 })).toEqual({ rat_fang: 3, spore_sac: 1 });
  });
});

describe("들고 있는 전리품의 값", () => {
  it("재료·기술 파편은 유실물 평균 판매가의 약 1/3에 판다. 교본·종족 유물·보스 증표는 못 판다", () => {
    const loot = SALVAGE.filter((x) => (x.kind ?? "loot") === "loot");
    const avg = loot.reduce((a, x) => a + x.value, 0) / loot.length;
    expect(MATERIAL_PRICE).toBe(Math.max(1, Math.round(avg / 3)));
    expect(getSalvage("mat_jelly")!.value).toBe(MATERIAL_PRICE);
    expect(sellable("mat_jelly")).toBe(true);
    expect(sellable("tech_shard")).toBe(true);
    for (const id of ["tactic_book", "boss_token", "relic_crest"]) expect(sellable(id)).toBe(false);
  });

  it("금화 + 유물 + 팔 수 있는 것의 판매가를 합치고, 팔 수 없는 것은 종류별 개수로 따로 센다", () => {
    const fang = getSalvage("wolf_fang")!;
    const { value, unsellable } = carriedValue(10, [30, 25], { wolf_fang: 2, mat_jelly: 3, tech_shard: 4, boss_token: 1 });
    expect(value).toBe(10 + 30 + 25 + fang.value * 2 + MATERIAL_PRICE * (3 + 4));
    expect(unsellable).toEqual({ bossToken: 1 });
  });
});
