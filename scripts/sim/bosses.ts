// 보스 시뮬레이션 공용: 보스 목록(목표 승률·파티 등급)과 한 보스 N판
import { START_SUPPLIES } from "@/data/combat";
import { getRegion } from "@/data/regions";
import { startBattleFrom, mercUnit } from "@/game/combat/engine";
import { fight } from "./lib";
import { gradeParty, type Grade } from "./party";

/** [지역, 보스, 목표 승률 [최소, 최대], 파티 등급 (없으면 지역 권장 낮은 쪽), 참고용] */
type Case = { region: string; boss: string; target: [number, number]; grade?: string; note?: string };
export const BOSSES: Case[] = [
  { region: "uf_forest", boss: "giant_boar", target: [0.6, 0.7] },
  { region: "uf_deep_forest", boss: "tree_giant", target: [0.6, 0.7] },
  { region: "uf_cave", boss: "giant_cave_bat", target: [0.6, 0.7] },
  { region: "uf_goblin_village", boss: "goblin_king", target: [0.6, 0.7] },
  { region: "uf_swamp", boss: "slime_king", target: [0.6, 0.7] },
  { region: "uf_spider_nest", boss: "spider_queen", target: [0.6, 0.7] },
  { region: "uf_wolf_den", boss: "alpha_wolf", target: [0.6, 0.7] },
  { region: "uf_deeper_forest", boss: "orc_captain", target: [0.45, 0.55], grade: "bronze1" },
  { region: "uf_deeper_forest", boss: "orc_captain", target: [0, 1], grade: "silver3", note: "참고" },
  { region: "uf_orc_village", boss: "orc_king", target: [0.6, 0.7] },
  { region: "uf_corrupted_forest", boss: "corrupted_spirit_king", target: [0.5, 0.6], grade: "silver2" },
  { region: "uf_corrupted_forest", boss: "corrupted_elf_queen", target: [0.5, 0.6], grade: "silver2" },
];

export function bossFights(regionId: string, boss: string, g: Grade, n: number) {
  const region = getRegion(regionId)!;
  let win = 0, rounds = 0, dead = 0;
  for (let i = 0; i < n; i++) {
    const p = gradeParty(i + 1, g);
    const b = fight(startBattleFrom(p.map(mercUnit), i * 31 + 7, { depth: region.depth, supplies: { ...START_SUPPLIES }, region, boss }));
    if (b.outcome === "victory") win++;
    rounds += b.round;
    dead += b.units.filter((u) => u.side === "merc" && u.dead).length;
  }
  return { win: win / n, rounds: rounds / n, dead: dead / n };
}

