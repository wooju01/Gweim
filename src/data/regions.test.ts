import { describe, expect, it } from "vitest";
import { REGION_SCALE } from "./combat";
import { REGIONS, getRegion, recommendedGrade, recommendedLabel, scaleOf } from "./regions";

const region = (id: string) => getRegion(id)!;

describe("구역 권장 등급 (단계 단위)", () => {
  it("미지의 숲: 1층 동3, 2층 동2, 3층 동1, 더 깊은 숲 동1~은3, 오크 마을 은3, 타락한 숲 은2", () => {
    expect(recommendedLabel(region("uf_forest"))).toBe("동3");
    for (const id of ["uf_deep_forest", "uf_cave"]) expect(recommendedLabel(region(id))).toBe("동2");
    for (const id of ["uf_goblin_village", "uf_swamp", "uf_spider_nest", "uf_wolf_den"]) expect(recommendedLabel(region(id))).toBe("동1");
    expect(recommendedLabel(region("uf_deeper_forest"))).toBe("동1~은3");
    expect(recommendedLabel(region("uf_orc_village"))).toBe("은3");
    expect(recommendedLabel(region("uf_corrupted_forest"))).toBe("은2");
  });

  it("안개 늪: 층마다 은3 → 은2 → 은1 → 금3, 뱀파이어 성 금3~금2", () => {
    for (const r of REGIONS.filter((r) => r.dungeon === "fog_marsh" && !r.hidden)) {
      expect(recommendedLabel(r)).toBe(["은3", "은2", "은1", "금3"][r.depth - 1]);
    }
    expect(recommendedLabel(region("fm_vampire_castle"))).toBe("금3~금2");
  });

  it("몬스터 배율은 권장 높은 쪽을 따른다 (배율표에 없으면 scale로 정한다)", () => {
    expect(scaleOf(region("uf_forest"))).toEqual(REGION_SCALE.bronze3);
    expect(scaleOf(region("uf_deeper_forest"))).toEqual(REGION_SCALE.silver3);
    expect(scaleOf(region("uf_corrupted_forest"))).toEqual(REGION_SCALE.silver2);
    expect(scaleOf(region("fm_cathedral"))).toEqual(REGION_SCALE.gold3);
    expect(scaleOf(region("fm_vampire_castle"))).toEqual(REGION_SCALE.gold3);
    for (const r of REGIONS) expect(scaleOf(r), r.id).toBeDefined();
  });

  it("경험치 배율은 높은 쪽의 등급으로 비교한다", () => {
    expect(recommendedGrade(region("uf_wolf_den"))).toBe("bronze");
    expect(recommendedGrade(region("uf_deeper_forest"))).toBe("silver");
  });
});
