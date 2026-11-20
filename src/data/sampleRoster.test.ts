import { describe, expect, it } from "vitest";
import { buildMerc } from "@/game/merc/generate";
import { MercSeed } from "@/lib/schemas";
import { JOBS, RACES } from "./traits";
import { sampleSeeds } from "./sampleRoster";

describe("샘플 용병", () => {
  const seeds = sampleSeeds();

  it("모두 스키마와 조합 규칙을 지킨다", () => {
    for (const seed of seeds) {
      expect(MercSeed.safeParse(seed).success, seed.id).toBe(true);
      expect(buildMerc(seed), seed.id).not.toBeNull();
    }
  });

  it("직업과 종족이 모두 한 번 이상 나온다", () => {
    expect(new Set(seeds.map((s) => s.traits.job))).toEqual(new Set(JOBS.map((j) => j.id)));
    expect(new Set(seeds.map((s) => s.traits.race))).toEqual(new Set(RACES.map((r) => r.id)));
  });

  it("id와 이름이 겹치지 않고, 매번 같은 시작 수치가 나온다", () => {
    expect(new Set(seeds.map((s) => s.id)).size).toBe(seeds.length);
    expect(new Set(seeds.map((s) => s.profile.name)).size).toBe(seeds.length);
    expect(sampleSeeds()).toEqual(seeds);
  });
});
