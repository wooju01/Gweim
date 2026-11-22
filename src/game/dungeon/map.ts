// 던전 맵 생성. 매번 무작위로, 갈라졌다가 다시 합쳐지는 길을 만든다.
// AI·React와 상관없는 순수 규칙. 난수는 시드로 받는다.
//
// 구조: 0단계 입구 → 1~(길이-1)단계 칸(단계마다 2~3갈래) → 마지막 단계 목적지. 길이는 층마다 다르다 (data/dungeon.ts의 FLOOR_CELLS).
// 각 칸은 다음 단계의 가까운 칸 1~2곳으로 이어진다. 여러 칸이 같은 칸으로 이어지면 길이 합쳐진다.
// 어떤 길로 가도 전투는 최대 2번, 휴식·사건·보물은 합쳐서 최대 2번까지만 연달아 나온다.
import {
  LANES,
  MAX_BATTLE_RUN,
  MAX_QUIET_RUN,
  ROOM_WEIGHTS,
  SPLIT_CHANCE,
  type RoomKind,
} from "@/data/dungeon";
import { createRng, rollInt, type Rng } from "@/game/random";

export type MapNode = {
  id: string;
  /** 단계. 0은 입구, 맵의 length가 목적지 */
  step: number;
  /** 같은 단계 안에서의 위치 (0부터, 위에서 아래로) */
  lane: number;
  kind: RoomKind;
  /** 다음 단계에서 갈 수 있는 칸 id */
  next: string[];
  /** 사건으로 끼어든 전투 칸: 반드시 나오는 보스와 보상 배율 */
  boss?: string;
  rewardMul?: number;
};

/**
 * 사건으로 지금 칸 바로 다음에 새 칸을 끼워 넣는다 (뒤 칸들은 한 단계씩 밀린다).
 * 새 칸이 지금 칸의 유일한 다음 칸이 되고, 새 칸은 원래 다음 칸들로 이어진다
 */
export function insertAfter(map: DungeonMap, at: string, kind: RoomKind, extra: Partial<MapNode> = {}): DungeonMap {
  const here = nodeById(map, at);
  if (!here) return map;
  const id = `x${map.nodes.length}`;
  const nodes = map.nodes.map((n) => (n.step > here.step ? { ...n, step: n.step + 1 } : n));
  const node: MapNode = { id, step: here.step + 1, lane: 0, kind, next: [...here.next], ...extra };
  return {
    ...map,
    length: mapLength(map) + 1,
    nodes: [...nodes.map((n) => (n.id === at ? { ...n, next: [id] } : n)), node],
  };
}

/** 사건으로 다음 칸을 건너뛴다: 지금 칸의 다음 칸들 대신 그 다음 칸들로 이어진다 (목적지는 건너뛰지 않는다) */
export function skipAfter(map: DungeonMap, at: string): DungeonMap {
  const here = nodeById(map, at);
  if (!here) return map;
  if (here.next.includes(map.goalId)) return map;
  const beyond = [...new Set(here.next.flatMap((id) => nodeById(map, id)?.next ?? []))];
  return beyond.length ? { ...map, nodes: map.nodes.map((n) => (n.id === at ? { ...n, next: beyond } : n)) } : map;
}

/** 사건으로 아직 안 간 전투 칸 하나를 보물 칸으로 바꾼다 (없으면 그대로) */
export function revealTreasureCell(map: DungeonMap, visited: string[], rng: Rng): DungeonMap {
  const pool = map.nodes.filter((n) => n.kind === "battle" && !visited.includes(n.id) && !n.boss);
  if (!pool.length) return map;
  const pick = pool[Math.floor(rng.next() * pool.length)].id;
  return { ...map, nodes: map.nodes.map((n) => (n.id === pick ? { ...n, kind: "treasure" as RoomKind } : n)) };
}

export type DungeonMap = {
  nodes: MapNode[];
  /** 입구에서 목적지까지 걷는 칸 수 (목적지 단계). 이전 저장에는 없다 → 7 */
  length?: number;
  startId: string;
  goalId: string;
};

const nodeId = (step: number, lane: number) => `n${step}-${lane}`;

export function nodeById(map: DungeonMap, id: string): MapNode | undefined {
  return map.nodes.find((n) => n.id === id);
}

/** 맵의 길이 (목적지 단계) */
export function mapLength(map: DungeonMap): number {
  return map.length ?? Math.max(...map.nodes.map((n) => n.step));
}

/** 단계별 칸 목록 */
export function byStep(map: DungeonMap): MapNode[][] {
  const steps: MapNode[][] = Array.from({ length: mapLength(map) + 1 }, () => []);
  for (const n of map.nodes) steps[n.step].push(n);
  for (const s of steps) s.sort((a, b) => a.lane - b.lane);
  return steps;
}

/** 입구에서 목적지까지 가능한 모든 길 (칸 id 목록) */
export function allPaths(map: DungeonMap): string[][] {
  const out: string[][] = [];
  const walk = (id: string, path: string[]) => {
    const node = nodeById(map, id)!;
    const next = [...path, id];
    if (node.next.length === 0) out.push(next);
    for (const n of node.next) walk(n, next);
  };
  walk(map.startId, []);
  return out;
}

/** 0~1 사이의 세로 위치. 갈림길 수가 다른 단계끼리 가까운 칸을 찾을 때 쓴다 */
function position(lane: number, count: number): number {
  return count === 1 ? 0.5 : lane / (count - 1);
}

/** 단계마다 칸 수를 정하고 길을 잇는다 (종류는 아직 없음) */
function buildShape(rng: Rng, length: number): MapNode[][] {
  const counts = Array.from({ length: length + 1 }, (_, step) =>
    step === 0 || step === length ? 1 : rollInt(rng.next, LANES[0], LANES[1]),
  );
  const steps: MapNode[][] = counts.map((count, step) =>
    Array.from({ length: count }, (_, lane) => ({
      id: nodeId(step, lane),
      step,
      lane,
      kind: step === 0 ? "start" : step === length ? "goal" : "battle",
      next: [],
    })),
  );

  for (let step = 0; step < length; step++) {
    const here = steps[step];
    const there = steps[step + 1];
    const near = (from: MapNode) =>
      there
        .map((to) => ({ to, d: Math.abs(position(to.lane, there.length) - position(from.lane, here.length)) }))
        .sort((a, b) => a.d - b.d || a.to.lane - b.to.lane);

    for (const from of here) {
      const [closest, second] = near(from);
      from.next.push(closest.to.id);
      // 가끔 이웃한 칸으로도 갈라진다
      if (second && Math.abs(second.to.lane - closest.to.lane) === 1 && rng.next() < SPLIT_CHANCE) {
        from.next.push(second.to.id);
      }
    }
    // 아무 데서도 오지 않는 칸은 가장 가까운 앞 칸에서 잇는다 (모든 칸에 갈 수 있게)
    for (const to of there) {
      if (here.some((n) => n.next.includes(to.id))) continue;
      const from = [...here].sort(
        (a, b) =>
          Math.abs(position(a.lane, here.length) - position(to.lane, there.length)) -
          Math.abs(position(b.lane, here.length) - position(to.lane, there.length)),
      )[0];
      from.next.push(to.id);
    }
    for (const n of here) n.next.sort();
  }
  return steps;
}

type Runs = { battle: number; quiet: number };

/**
 * 앞 단계부터 칸 종류를 정한다. 들어오는 모든 길 중 가장 긴 연속을 기억해 두고
 * 제한을 넘기는 종류는 후보에서 뺀다. 둘 다 막히면 실패(null) → 맵을 새로 만든다.
 */
function assignKinds(steps: MapNode[][], rng: Rng, noRestFirst = false): boolean {
  const runs = new Map<string, Runs>([[steps[0][0].id, { battle: 0, quiet: 0 }]]);
  const incoming = (node: MapNode) => steps[node.step - 1].filter((p) => p.next.includes(node.id));

  for (let step = 1; step < steps.length - 1; step++) {
    for (const node of steps[step]) {
      const before = incoming(node).map((p) => runs.get(p.id)!);
      const battleRun = Math.max(...before.map((r) => r.battle));
      const quietRun = Math.max(...before.map((r) => r.quiet));
      const options = (Object.keys(ROOM_WEIGHTS) as (keyof typeof ROOM_WEIGHTS)[]).filter(
        (kind) => (kind === "battle" ? battleRun < MAX_BATTLE_RUN : quietRun < MAX_QUIET_RUN) && !(noRestFirst && step === 1 && kind === "rest"),
      );
      if (options.length === 0) return false;

      const total = options.reduce((s, k) => s + ROOM_WEIGHTS[k], 0);
      let roll = rng.next() * total;
      let kind = options[options.length - 1];
      for (const k of options) {
        roll -= ROOM_WEIGHTS[k];
        if (roll < 0) {
          kind = k;
          break;
        }
      }
      node.kind = kind;
      runs.set(node.id, kind === "battle" ? { battle: battleRun + 1, quiet: 0 } : { battle: 0, quiet: quietRun + 1 });
    }
  }
  return true;
}

/** 길이를 정하지 않았을 때 (테스트 등) */
export const DEFAULT_LENGTH = 7;

/**
 * 시드로 던전 한 층의 맵을 만든다. 같은 시드면 같은 맵.
 * cells를 주면 그 범위에서 길이를 굴리고, 숫자면 그 길이로
 */
export function generateMap(seed: number, cells: number | { min: number; max: number } = DEFAULT_LENGTH, opts: { noRestFirst?: boolean } = {}): DungeonMap {
  const rng = createRng(seed);
  const length = typeof cells === "number" ? cells : rollInt(rng.next, cells.min, cells.max);
  for (let attempt = 0; attempt < 100; attempt++) {
    const steps = buildShape(rng, length);
    // noRestFirst: 첫 칸(입구 다음)에는 휴식이 나오지 않는다 (1층, 2026-11-22)
    if (!assignKinds(steps, rng, opts.noRestFirst)) continue;
    const nodes = steps.flat();
    return { nodes, length, startId: steps[0][0].id, goalId: steps[length][0].id };
  }
  throw new Error("맵을 만들지 못했다 (조건이 너무 빡빡하다)");
}
