import { describe, expect, it } from "vitest";
import { FRAGMENTS, FRAGMENT_UNLOCK, JOB_SIGNATURE, RACE_RELIC, UNLOCK_COST, upgradeCost } from "./fragments";
import { getSalvage, kindOf } from "./loot";

const signatures = new Set(Object.values(JOB_SIGNATURE));

describe("조각 해금 비용", () => {
  it("궁극기·직업 대표 메인·직업 없는 기본 조각 말고는 모두 단계와 비용이 있다", () => {
    for (const f of FRAGMENTS) {
      const free = (f.kind === "main" && f.ultimate) || signatures.has(f.id) || f.id === "power";
      if (free) expect(f.cost, f.id).toBeNull();
      else {
        expect(f.cost, f.id).not.toBeNull();
        expect(f.tier, f.id).toBeDefined();
      }
    }
    // 표에 있는 id는 모두 실제 조각
    for (const id of Object.keys(FRAGMENT_UNLOCK)) expect(FRAGMENTS.some((f) => f.id === id), id).toBe(true);
  });

  it("단계별 비용: 동 메인 = 파편 3 + 재료 2, 은 메인 = 교본 1 + 재료 3", () => {
    const bronzeMain = FRAGMENTS.find((f) => f.id === "knight_bulwark")!;
    expect(bronzeMain.cost).toEqual({ gold: UNLOCK_COST.bronzeMain.gold, salvage: { tech_shard: 3, mat_sap: 2 } });
    const silverMain = FRAGMENTS.find((f) => f.id === "knight_charge")!;
    expect(silverMain.cost).toEqual({ gold: UNLOCK_COST.silverMain.gold, salvage: { tactic_book: 1, mat_whetstone: 3 } });
  });

  it("종족 전용 조각은 은 단계, 그 종족의 유물이 든다", () => {
    const raceOnly = FRAGMENTS.filter((f) => f.job && f.race);
    expect(raceOnly.length).toBeGreaterThan(0);
    for (const f of raceOnly) {
      expect(f.tier, f.id).toBe("silver");
      expect(f.cost!.salvage[RACE_RELIC[f.race!]], f.id).toBe(1);
    }
  });

  it("기절·방어 감소 계열(철퇴)은 직업 조각에서 은부터", () => {
    for (const f of FRAGMENTS) if (f.job && !f.race && f.material === "mat_mace") expect(f.tier, f.id).toBe("silver");
  });

  it("비용에 드는 재료는 모두 전수관 재료이고, 부 조각 Lv3에는 보스 증표가 든다", () => {
    for (const f of FRAGMENTS) {
      for (const id of Object.keys(f.cost?.salvage ?? {})) expect(kindOf(getSalvage(id)!), `${f.id} ${id}`).not.toBe("loot");
      if (f.kind === "sub" && f.cost) expect(upgradeCost(f, 3)!.salvage.boss_token, f.id).toBe(1);
    }
  });
});
