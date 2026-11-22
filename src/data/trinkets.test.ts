import { describe, expect, it } from "vitest";
import { MONSTER_MATERIAL, MONSTER_RELIC, RANK_DROPS, SPECIAL_DROPS } from "./drops";
import { DROPS, getSalvage } from "./loot";
import { FRAGMENTS, upgradeCost } from "./fragments";
import { REGIONS } from "./regions";
import { getMonster } from "./monsters";
import { GROWTH } from "./growth";
import { TRINKETS, canWear, forgeCost, getTrinket, trinketBonus, trinketText, trinketsBonus } from "./trinkets";
import { BRANCHES } from "./jobs";

describe("장신구 데이터", () => {
  const jobs = TRINKETS.filter((t) => t.kind === "job");

  it("직업 장신구 36종: 직업마다 2차 갈래별 2개씩, 있는 갈래·유실물을 쓴다", () => {
    expect(jobs).toHaveLength(36);
    for (const job of Object.keys(GROWTH)) {
      for (const b of BRANCHES[job as keyof typeof BRANCHES]) expect(jobs.filter((t) => t.job === job && t.build === b.id), `${job}/${b.id}`).toHaveLength(2);
    }
    for (const t of TRINKETS) for (const x of [...t.material, ...(t.levelMaterial ?? []).flat()]) expect(getSalvage(x.id), `${t.id}: ${x.id}`).toBeDefined();
    expect(new Set(TRINKETS.map((t) => t.id)).size).toBe(TRINKETS.length);
  });

  it("공용 생존 장신구 4종, 의뢰 장신구 4종", () => {
    expect(TRINKETS.filter((t) => t.kind === "survival").map((t) => t.id)).toEqual(["t_life_charm", "t_last_breath", "t_aid_belt", "t_brace_bangle"]);
    expect(TRINKETS.filter((t) => t.kind === "quest").map((t) => t.id)).toEqual(["t_queen_venom_ring", "t_guild_seal", "t_silver_crest", "t_orc_tusk_necklace"]);
    expect(TRINKETS.filter((t) => t.kind !== "job").every((t) => t.job === "any")).toBe(true);
  });

  it("단계 효과: 3단계 값을 1/3, 2/3으로 나눠 반올림 (정수는 최소 1)", () => {
    expect([1, 2, 3].map((lv) => trinketBonus({ id: "t_blood_gauntlet", lv }).lifesteal)).toEqual([0.03, 0.05, 0.08]);
    expect([1, 2, 3].map((lv) => trinketBonus({ id: "t_giant_bangle", lv }).maxHp)).toEqual([6, 12, 18]);
    expect([1, 2, 3].map((lv) => trinketBonus({ id: "t_venom_ring", lv }).poisonStack)).toEqual([1, 1, 2]);
    expect(trinketBonus({ id: "t_whirl_band", lv: 1 })).toEqual({ evade: 0.02, speed: 1 });
    // 생존 장신구는 단계별 표
    expect(trinketBonus({ id: "t_last_breath", lv: 3 })).toEqual({ lastBreath: 2, breathGuard: 0.5 });
    expect(trinketBonus({ id: "t_aid_belt", lv: 2 })).toEqual({ potionPower: 0.45 });
    // 의뢰 장신구는 그대로, 여러 개는 더한다
    expect(trinketsBonus([{ id: "t_silver_crest", lv: 1 }, { id: "t_cursed_helm", lv: 3 }])).toEqual({ attack: 5, stunRes: 0.1, lowHpPower: 0.1 });
    expect(trinketBonus(undefined)).toEqual({});
  });

  it("비용: 직업 60 / 120 / 250 (재료 3단계 두 배), 생존 200 / 400 / 800 (엘리트 재료 3 → 종족 유물 1 → 보스 증표 1)", () => {
    const t = getTrinket("t_oath_badge")!;
    expect([1, 2, 3].map((lv) => forgeCost(t, lv).gold)).toEqual([60, 120, 250]);
    expect(forgeCost(t, 1).salvage).toEqual({ orc_tusk: 1, mat_sap: 2 });
    expect(forgeCost(t, 3).salvage).toEqual({ orc_tusk: 2, mat_sap: 4 });
    const life = getTrinket("t_life_charm")!;
    expect([1, 2, 3].map((lv) => forgeCost(life, lv))).toEqual([
      { gold: 200, salvage: { mat_sap: 3 } },
      { gold: 400, salvage: { relic_spirit: 1 } },
      { gold: 800, salvage: { boss_token: 1 } },
    ]);
  });

  it("생존 장신구는 1명당 1개, 같은 장신구는 둘 못 낀다", () => {
    expect(canWear(getTrinket("t_aid_belt"), [{ id: "t_life_charm", lv: 1 }])).toBe(false);
    expect(canWear(getTrinket("t_aid_belt"), [{ id: "t_oath_badge", lv: 1 }])).toBe(true);
    expect(canWear(getTrinket("t_oath_badge"), [{ id: "t_oath_badge", lv: 1 }])).toBe(false);
  });

  it("효과 문구가 모두 있다", () => {
    for (const t of TRINKETS) expect(trinketText({ id: t.id, lv: 3 }), t.id).not.toBe("");
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
      ...TRINKETS.flatMap((t) => [...t.material, ...(t.levelMaterial ?? []).flat()].map((x) => x.id)),
    ];
    for (const id of needed) expect(obtainable.has(id), id).toBe(true);
  });
});

