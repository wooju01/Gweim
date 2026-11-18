import { describe, expect, it } from "vitest";
import type { Battle } from "@/game/combat/engine";
import { displayedHp } from "./playback";

const unit = (id: string, hp: number, maxHp = 30) =>
  ({ id, side: "merc", name: id, title: "", hp, maxHp, attack: [1, 1], defense: 0, speed: 0, statuses: [], cooldown: 0, guarding: false }) as const;

describe("재생 중 체력", () => {
  // 엔진이 준 최종 체력: a 20 (30에서 13 맞고 3 회복), b 0 (30 맞음)
  const battle = {
    units: [unit("a", 20), unit("b", 0)],
    log: [
      { type: "round", round: 1 },
      { type: "attack", actor: "b", target: "a", damage: 13, crit: false },
      { type: "heal", target: "a", amount: 3, by: "guide" },
      { type: "attack", actor: "a", target: "b", damage: 30, crit: true },
    ],
  } as unknown as Battle;

  it("아직 재생하지 않은 이벤트는 되돌려서 보여 준다", () => {
    expect(displayedHp(battle, 4)).toEqual({ a: 20, b: 0 });
    expect(displayedHp(battle, 3)).toEqual({ a: 20, b: 30 });
    expect(displayedHp(battle, 2)).toEqual({ a: 17, b: 30 });
    expect(displayedHp(battle, 1)).toEqual({ a: 30, b: 30 });
  });
});
