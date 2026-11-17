import { describe, expect, it } from "vitest";
import { MERCS, getMerc } from "../../data/mercs";
import type { Tone } from "../schemas";
import {
  DISLIKE_LOSS,
  LIKE_GAIN,
  REFUSAL_PENALTY,
  applyTone,
  getStage,
  proposeJoin,
  toneDelta,
} from "./affinity";

const varn = getMerc("varn")!;
const fresh = (affinity: number, recentTones: Tone[] = []) => ({ affinity, recentTones });

describe("applyTone", () => {
  it("좋아하는 성향은 오르고 싫어하는 성향은 내려간다", () => {
    expect(applyTone(varn, fresh(20), "honesty").delta).toBe(LIKE_GAIN);
    expect(applyTone(varn, fresh(20), "mockery").delta).toBe(-DISLIKE_LOSS);
  });

  it("관심 없는 성향과 neutral은 변화가 없다", () => {
    expect(applyTone(varn, fresh(20), "mercy").delta).toBe(0);
    expect(applyTone(varn, fresh(20), "neutral").delta).toBe(0);
  });

  it("같은 성향을 반복하면 증가량이 줄어든다 (8 → 4 → 2 → 0)", () => {
    let state = fresh(20);
    const deltas: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = applyTone(varn, state, "respect");
      deltas.push(r.delta);
      state = r;
    }
    expect(deltas).toEqual([8, 4, 2, 0]);
  });

  it("다른 성향을 섞으면 감쇠가 풀린다", () => {
    let state = fresh(20);
    for (const tone of ["respect", "respect", "honesty", "honesty", "mercy"] as Tone[]) {
      state = applyTone(varn, state, tone);
    }
    // 최근 3개: honesty, honesty, mercy → respect는 다시 온전히 오른다
    expect(toneDelta(varn, "respect", state.recentTones)).toBe(LIKE_GAIN);
  });

  it("감점은 반복해도 줄어들지 않는다", () => {
    expect(toneDelta(varn, "mockery", ["mockery", "mockery", "mockery"])).toBe(-DISLIKE_LOSS);
  });

  it("0과 100 사이로 고정되고 delta는 실제 변화량이다", () => {
    expect(applyTone(varn, fresh(3), "mockery")).toMatchObject({ affinity: 0, delta: -3 });
    expect(applyTone(varn, fresh(97), "honesty")).toMatchObject({ affinity: 100, delta: 3 });
  });

  it("최근 성향은 3개까지만 기억한다", () => {
    const r = applyTone(varn, fresh(20, ["greed", "mercy", "threat"]), "honesty");
    expect(r.recentTones).toEqual(["mercy", "threat", "honesty"]);
  });
});

describe("getStage", () => {
  it.each([
    [0, "hostile"],
    [14, "hostile"],
    [15, "wary"],
    [35, "neutral"],
    [55, "warm"],
    [75, "trusted"],
    [100, "trusted"],
  ] as const)("%i → %s", (affinity, stage) => {
    expect(getStage(affinity)).toBe(stage);
  });
});

describe("proposeJoin", () => {
  it("기준치 이상이면 합류하고 호감도는 그대로다", () => {
    expect(proposeJoin(varn, varn.joinThreshold)).toEqual({ joined: true, affinity: 45, delta: 0 });
  });

  it("기준치 미만이면 거절하고 호감도가 조금 떨어진다", () => {
    expect(proposeJoin(varn, 44)).toEqual({ joined: false, affinity: 44 - REFUSAL_PENALTY, delta: -REFUSAL_PENALTY });
  });

  it("거절 감점도 0 아래로는 내려가지 않는다", () => {
    expect(proposeJoin(varn, 2)).toEqual({ joined: false, affinity: 0, delta: -2 });
  });
});

describe("용병 데이터", () => {
  it.each(MERCS.map((m) => [m.id, m] as const))("%s: likes와 dislikes가 겹치지 않는다", (_, merc) => {
    expect(merc.likes.filter((t) => merc.dislikes.includes(t))).toEqual([]);
  });

  it("세 용병의 좋아하는 성향 조합이 서로 다르다", () => {
    const combos = MERCS.map((m) => [...m.likes].sort().join(","));
    expect(new Set(combos).size).toBe(MERCS.length);
  });

  it("시작 호감도로는 바로 영입되지 않는다", () => {
    for (const m of MERCS) expect(m.startAffinity).toBeLessThan(m.joinThreshold);
  });
});
