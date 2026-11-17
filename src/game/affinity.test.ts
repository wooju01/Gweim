import { describe, expect, it } from "vitest";
import { MERCS, getMerc } from "../data/mercs";
import type { Tone } from "../lib/schemas";
import {
  REFUSAL_PENALTY,
  AFFINITY_STEP as A,
  WILLINGNESS_STEP as W,
  applyTone,
  dislikedTones,
  getResolve,
  getStage,
  joinChance,
  likedTones,
  proposeJoin,
  toneDeltas,
} from "./affinity";

const varn = getMerc("varn")!;
const kass = getMerc("kass")!;
const elke = getMerc("elke")!;
const fresh = (affinity = 50, willingness = 50, recentTones: Tone[] = []) => ({
  affinity,
  willingness,
  recentTones,
});

describe("applyTone: 호감도와 고용 의향은 따로 움직인다", () => {
  it("바른은 겁쟁이 취급(조롱)에 기분은 상하지만 같이 갈 마음은 생긴다", () => {
    const r = applyTone(varn, fresh(), "mockery");
    expect(r.delta).toEqual({ affinity: -2 * A, willingness: 2 * W });
  });

  it("바른은 돈 얘기가 싫지만 고용 의향은 조금 오른다", () => {
    expect(applyTone(varn, fresh(), "greed").delta).toEqual({ affinity: -A, willingness: W });
  });

  it("같은 조롱이라도 카스는 둘 다 오르고, 엘케는 호감만 떨어진다", () => {
    expect(applyTone(kass, fresh(), "mockery").delta).toEqual({ affinity: 2 * A, willingness: W });
    expect(applyTone(elke, fresh(), "mockery").delta).toEqual({ affinity: -A, willingness: 0 });
  });

  it("반응표에 없는 태도와 neutral은 변화가 없다", () => {
    expect(applyTone(varn, fresh(), "mercy").delta).toEqual({ affinity: 0, willingness: 0 });
    expect(applyTone(varn, fresh(), "neutral").delta).toEqual({ affinity: 0, willingness: 0 });
  });

  it("같은 태도를 반복하면 호감도 증가량이 빠르게 줄어든다 (10 → 5 → 3 → 0)", () => {
    let state = fresh();
    const gains: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = applyTone(varn, state, "respect");
      gains.push(r.delta.affinity);
      state = { ...r };
    }
    expect(gains).toEqual([10, 5, 3, 0]);
  });

  it("감소량은 반복해도 줄어들지 않는다", () => {
    expect(toneDeltas(varn, "mockery", ["mockery", "mockery", "mockery"])).toEqual({
      affinity: -2 * A,
      willingness: 5, // 고용 의향 증가(20)는 세 번 반복 시 1/4로 줄어든다
    });
  });

  it("다른 태도를 섞으면 감쇠가 풀린다", () => {
    expect(toneDeltas(varn, "respect", ["respect", "honesty", "honesty", "mercy"]).affinity).toBe(10);
  });

  it("0과 100 사이로 고정되고 delta는 실제 변화량이다", () => {
    expect(applyTone(varn, fresh(3, 98), "mockery")).toMatchObject({
      affinity: 0,
      willingness: 100,
      delta: { affinity: -3, willingness: 2 },
    });
  });

  it("최근 태도는 3개까지만 기억한다", () => {
    const r = applyTone(varn, fresh(50, 50, ["greed", "mercy", "threat"]), "honesty");
    expect(r.recentTones).toEqual(["mercy", "threat", "honesty"]);
  });
});

describe("단계", () => {
  it.each([
    [0, "hostile"],
    [15, "wary"],
    [35, "neutral"],
    [55, "warm"],
    [75, "trusted"],
  ] as const)("호감 %i → %s", (affinity, stage) => {
    expect(getStage(affinity)).toBe(stage);
  });

  it.each([
    [0, "unwilling"],
    [20, "doubtful"],
    [50, "leaning"],
    [75, "eager"],
  ] as const)("고용 의향 %i → %s", (willingness, resolve) => {
    expect(getResolve(willingness)).toBe(resolve);
  });
});

describe("동행 제안: 고용 의향% 확률", () => {
  const roll = (value: number) => () => value;

  it("고용 의향이 곧 확률이다", () => {
    expect(joinChance(0)).toBe(0);
    expect(joinChance(20)).toBe(0.2);
    expect(joinChance(100)).toBe(1);
  });

  it("주사위가 확률 미만이면 합류하고 고용 의향은 그대로다", () => {
    expect(proposeJoin(20, roll(0.19))).toEqual({ joined: true, willingness: 20, delta: 0 });
  });

  it("주사위가 확률 이상이면 거절하고 고용 의향이 조금 떨어진다", () => {
    expect(proposeJoin(20, roll(0.2))).toEqual({
      joined: false,
      willingness: 20 - REFUSAL_PENALTY,
      delta: -REFUSAL_PENALTY,
    });
  });

  it("0이면 절대 합류하지 않고, 100이면 반드시 합류한다", () => {
    expect(proposeJoin(0, roll(0)).joined).toBe(false);
    expect(proposeJoin(100, roll(0.9999)).joined).toBe(true);
  });

  it("거절 감점은 0 아래로 내려가지 않는다", () => {
    expect(proposeJoin(2, roll(0.5))).toEqual({ joined: false, willingness: 0, delta: -2 });
  });

  it("실제 확률이 고용 의향%에 가깝다", () => {
    let joined = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) if (proposeJoin(30).joined) joined++;
    expect(joined / trials).toBeGreaterThan(0.28);
    expect(joined / trials).toBeLessThan(0.32);
  });
});

describe("용병 데이터", () => {
  it.each(MERCS.map((m) => [m.id, m] as const))("%s: 좋아하는 태도와 싫어하는 태도가 하나 이상 있다", (_, merc) => {
    expect(likedTones(merc).length).toBeGreaterThan(0);
    expect(dislikedTones(merc).length).toBeGreaterThan(0);
  });

  it("세 용병의 반응표가 서로 다르다", () => {
    const tables = MERCS.map((m) => JSON.stringify(m.reactions));
    expect(new Set(tables).size).toBe(MERCS.length);
  });
});

describe("고용 의향은 호감도보다 크게, 반복에 덜 민감하게 움직인다", () => {
  it("같은 태도 반복 시 고용 의향 증가량 (20 → 15 → 10 → 5)", () => {
    let state = fresh(50, 0);
    const gains: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = applyTone(kass, state, "greed");
      gains.push(r.delta.willingness);
      state = { ...r };
    }
    expect(gains).toEqual([20, 15, 10, 5]);
  });

  it("시작 고용 의향은 30 이상이고 용병마다 다르다", () => {
    for (const m of MERCS) expect(m.startWillingness).toBeGreaterThanOrEqual(30);
    expect(new Set(MERCS.map((m) => m.startWillingness)).size).toBe(MERCS.length);
  });
});
