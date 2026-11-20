import { describe, expect, it } from "vitest";
import { DUNGEONS, REGIONS } from "@/data/regions";
import { dungeonStats, layoutDungeon } from "./atlas";

describe("던전 지도 배치", () => {
  it("미지의 숲: 모든 지역이 한 번씩, 층이 깊을수록 아래, 갈래는 부모와 이어진다", () => {
    const { nodes, edges } = layoutDungeon("unknown_forest");
    const forest = REGIONS.filter((r) => r.dungeon === "unknown_forest");
    expect(nodes.map((n) => n.region.id).sort()).toEqual(forest.map((r) => r.id).sort());
    const at = Object.fromEntries(nodes.map((n) => [n.region.id, n]));
    for (const [a, b] of edges) expect(at[b].y).toBeGreaterThan(at[a].y);
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1);
    }
    // 같은 층 지역은 겹치지 않는다
    for (const a of nodes) for (const b of nodes) if (a !== b && a.y === b.y) expect(a.x).not.toBe(b.x);
    expect(dungeonStats("unknown_forest")).toEqual({ regions: 9, bosses: 5 });
  });

  it("열리지 않은 던전은 빈 지도, 열린 던전은 모두 입구 지역이 있다", () => {
    for (const d of DUNGEONS) {
      const { nodes } = layoutDungeon(d.id);
      if (d.open) expect(nodes.length).toBeGreaterThan(0);
      else expect(nodes).toEqual([]);
    }
  });
});
