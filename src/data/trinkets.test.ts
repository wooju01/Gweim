import { describe, expect, it } from "vitest";
import { MONSTER_MATERIAL, MONSTER_RELIC, RANK_DROPS, SPECIAL_DROPS } from "./drops";
import { DROPS, getSalvage } from "./loot";
import { FRAGMENTS, upgradeCost } from "./fragments";
import { REGIONS } from "./regions";
import { getMonster } from "./monsters";
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

describe("재료 구하기", () => {
  it("전수관·대장간이 쓰는 재료는 모두 어느 지역 몬스터에게서 떨어진다", () => {
    const kinds = new Set<string>();
    for (const r of REGIONS)
      for (const id of [...r.monsters.map((m) => m.id), ...(r.boss?.pool.map((p) => p.monsterId) ?? [])]) {
        kinds.add(id);
        for (const e of getMonster(id)?.escort ?? []) kinds.add(e);
      }
    // 유실물 (data/loot.ts) + 전수관 재료 (data/drops.ts: 등급 기본·계열 재료·종족 유물·특수)
    const obtainable = new Set([...kinds].flatMap((k) => (DROPS[k] ?? []).map((d) => d.id)));
    for (const k of kinds) {
      const rank = getMonster(k)?.rank ?? "normal";
      const base = RANK_DROPS[rank];
      if (base.shard.chance > 0) obtainable.add("tech_shard");
      if (base.bossToken > 0) obtainable.add("boss_token");
      if (base.book > 0 || RANK_DROPS.elite.book > 0) obtainable.add("tactic_book"); // 일반 몬스터도 정예로 나온다
      if (MONSTER_MATERIAL[k]) obtainable.add(MONSTER_MATERIAL[k].id);
      if (MONSTER_RELIC[k]) obtainable.add(MONSTER_RELIC[k].id);
      for (const d of SPECIAL_DROPS[k] ?? []) obtainable.add(d.id);
    }
    const needed = [
      ...FRAGMENTS.flatMap((f) => [...Object.keys(f.cost?.salvage ?? {}), ...Object.keys(upgradeCost(f, 2)?.salvage ?? {})]),
      ...TRINKETS.map((t) => t.material.id),
    ];
    for (const id of needed) expect(obtainable.has(id), id).toBe(true);
  });
});

