import { describe, expect, it } from "vitest";
import { getSalvage } from "./loot";
import { GROWTH } from "./growth";
import { TRINKETS, forgeCost, trinketStats } from "./trinkets";

describe("장신구 데이터", () => {
  it("모든 장신구는 있는 직업·유실물을 쓰고, 직업마다 2개씩", () => {
    for (const t of TRINKETS) {
      expect(GROWTH[t.job], t.id).toBeDefined();
      expect(getSalvage(t.material.id), t.id).toBeDefined();
    }
    for (const job of Object.keys(GROWTH)) expect(TRINKETS.filter((t) => t.job === job)).toHaveLength(2);
    expect(new Set(TRINKETS.map((t) => t.id)).size).toBe(TRINKETS.length);
  });

  it("단계만큼 스탯이 붙고, 강화 비용은 단계마다 오른다", () => {
    expect(trinketStats({ id: "t_rust_pauldron", lv: 3 })).toEqual({ hp: 6 });
    expect(trinketStats(undefined)).toEqual({});
    const t = TRINKETS[0];
    expect(forgeCost(t, 2).gold).toBeGreaterThan(forgeCost(t, 1).gold);
    expect(forgeCost(t, 3).salvage[t.material.id]).toBe(t.material.n * 2);
  });
});
