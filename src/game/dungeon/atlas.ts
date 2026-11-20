// 던전 갈래 지도 배치 (순수 함수). 지역 데이터(data/regions.ts)만 보고 나무 모양으로 자리를 정한다.
// 새 던전을 더해도 이 함수가 그대로 그린다.
// 세로: 층 (위가 1층). 가로: 잎(끝 지역) 순서대로 칸을 나누고, 갈래가 있는 지역은 자식들의 가운데.
import { REGIONS, getDungeon, getRegion, type Region } from "@/data/regions";

export type AtlasNode = { region: Region; x: number; y: number };
export type AtlasLayout = { nodes: AtlasNode[]; edges: [string, string][]; depth: number };

/** x, y는 0~1 */
export function layoutDungeon(dungeonId: string): AtlasLayout {
  const dungeon = getDungeon(dungeonId);
  const root = dungeon && getRegion(dungeon.entry);
  if (!root) return { nodes: [], edges: [], depth: 0 };

  const xs = new Map<string, number>();
  const edges: [string, string][] = [];
  let leaf = 0;
  const seen = new Set<string>();
  // 깊이 우선으로 잎에 차례대로 번호를 주고, 부모는 자식들의 가운데
  const place = (r: Region): number => {
    seen.add(r.id);
    const kids = r.next.flatMap((id) => (seen.has(id) ? [] : (getRegion(id) ?? [])));
    for (const k of kids) edges.push([r.id, k.id]);
    const x = kids.length === 0 ? leaf++ : avg(kids.map(place));
    xs.set(r.id, x);
    return x;
  };
  place(root);

  const regions = REGIONS.filter((r) => xs.has(r.id));
  const minDepth = Math.min(...regions.map((r) => r.depth));
  const maxDepth = Math.max(...regions.map((r) => r.depth));
  const span = Math.max(1, leaf - 1);
  const rows = Math.max(1, maxDepth - minDepth);
  return {
    nodes: regions.map((r) => ({
      region: r,
      x: leaf <= 1 ? 0.5 : xs.get(r.id)! / span,
      y: maxDepth === minDepth ? 0.5 : (r.depth - minDepth) / rows,
    })),
    edges,
    depth: maxDepth,
  };
}

const avg = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

/** 던전의 지역 수와 던전 보스 수 */
export function dungeonStats(dungeonId: string): { regions: number; bosses: number } {
  const { nodes } = layoutDungeon(dungeonId);
  return { regions: nodes.length, bosses: nodes.filter((n) => n.region.dungeonBoss).length };
}
