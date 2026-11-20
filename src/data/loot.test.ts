import { describe, expect, it } from "vitest";
import { createRng } from "@/game/random";
import { ENEMIES } from "./combat";
import { DROPS, SALVAGE, addSalvage, getSalvage, rollDrops } from "./loot";

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
