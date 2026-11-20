import { describe, expect, it } from "vitest";
import { MAX_BATTLE_RUN, MAX_QUIET_RUN, PATH_LENGTH } from "@/data/dungeon";
import { allPaths, byStep, generateMap, nodeById, type DungeonMap } from "./map";

const MAPS = Array.from({ length: 400 }, (_, seed) => generateMap(seed));

function longestRun(map: DungeonMap, path: string[], test: (kind: string) => boolean): number {
  let best = 0;
  let run = 0;
  for (const id of path) {
    run = test(nodeById(map, id)!.kind) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

describe("던전 맵", () => {
  it("같은 시드면 같은 맵, 다른 시드면 대개 다른 맵", () => {
    expect(generateMap(7)).toEqual(generateMap(7));
    const shapes = new Set(MAPS.map((m) => m.nodes.map((n) => `${n.id}:${n.kind}:${n.next.join("|")}`).join(",")));
    expect(shapes.size).toBeGreaterThan(MAPS.length * 0.95);
  });

  it("입구에서 목적지까지 어느 길로 가도 정확히 7칸을 걷는다", () => {
    for (const map of MAPS) {
      for (const path of allPaths(map)) {
        expect(path.length - 1).toBe(PATH_LENGTH);
        expect(path.at(-1)).toBe(map.goalId);
      }
    }
  });

  it("단계마다 2~3갈래이고, 모든 칸은 입구에서 갈 수 있고 목적지로 이어진다", () => {
    for (const map of MAPS) {
      const steps = byStep(map);
      for (let s = 1; s < PATH_LENGTH; s++) expect([2, 3]).toContain(steps[s].length);
      const onPath = new Set(allPaths(map).flat());
      for (const node of map.nodes) expect(onPath.has(node.id), node.id).toBe(true);
    }
  });

  it("어느 길로 가도 전투는 최대 2번, 휴식·사건·보물은 합쳐서 최대 2번까지만 연달아 나온다", () => {
    for (const map of MAPS) {
      for (const path of allPaths(map)) {
        const middle = path.slice(1, -1);
        expect(longestRun(map, middle, (k) => k === "battle")).toBeLessThanOrEqual(MAX_BATTLE_RUN);
        expect(longestRun(map, middle, (k) => k !== "battle")).toBeLessThanOrEqual(MAX_QUIET_RUN);
      }
    }
  });

  it("갈라진 길이 다시 합쳐지는 칸이 나온다", () => {
    const merges = MAPS.filter((map) =>
      map.nodes.some((node) => map.nodes.filter((n) => n.next.includes(node.id)).length >= 2 && node.kind !== "goal"),
    );
    expect(merges.length).toBeGreaterThan(MAPS.length * 0.5);
  });

  it("휴식·사건·보물이 모두 나온다", () => {
    const kinds = new Set(MAPS.flatMap((m) => m.nodes.map((n) => n.kind)));
    for (const k of ["battle", "rest", "event", "treasure", "start", "goal"]) expect(kinds).toContain(k);
  });
});
