import { describe, expect, it } from "vitest";
import type { HistoryLine } from "@/lib/schemas";
import { KEEP_RECENT, MEMORY_TRIGGER, planFold } from "./memory";

const lines = (n: number): HistoryLine[] =>
  Array.from({ length: n }, (_, i) => ({ speaker: i % 2 ? "merc" : "player", text: `${i}` }));

describe("planFold", () => {
  it("대화가 짧으면 접지 않는다", () => {
    expect(planFold(lines(MEMORY_TRIGGER - 1))).toBeNull();
  });

  it("기준에 닿으면 최근 줄만 남기고 나머지를 접는다", () => {
    const history = lines(MEMORY_TRIGGER);
    const plan = planFold(history)!;
    expect(plan.forget).toBe(MEMORY_TRIGGER - KEEP_RECENT);
    expect(plan.fold).toEqual(history.slice(0, MEMORY_TRIGGER - KEEP_RECENT));
  });

  it("접고 나면 다음 몇 턴은 다시 접지 않는다", () => {
    const kept = lines(MEMORY_TRIGGER).slice(planFold(lines(MEMORY_TRIGGER))!.forget);
    expect(kept.length).toBe(KEEP_RECENT);
    expect(planFold([...kept, ...lines(2)])).toBeNull();
  });
});
