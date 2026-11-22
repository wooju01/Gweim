// 보스 시뮬레이션: 보스마다 RUNS판 (체력 가득, 그 지역 권장 등급 파티 무작위 4명, 장신구 없음, 깨우기 포함 기본 규칙)
// 실행: npm run sim:boss  (RUNS=1000 기본). 결과: scripts/sim/results/날짜-boss.md
// 수치를 바꿔 다시 돌릴 때는 bosses.ts의 BOSSES 목표(target)·파티(grade)만 고치면 된다
import { it } from "vitest";
import { getRegion } from "@/data/regions";
import { getMonster } from "@/data/monsters";
import { BOSSES, bossFights } from "./bosses";
import { GRADES } from "./party";
import { Report, pct } from "./report";
import { assertMockAI } from "./setup";

const RUNS = Number(process.env.RUNS ?? 1000);
/** BOSS=tree_giant,orc_king 처럼 일부만 (결과 파일 이름에 -part가 붙는다) */
const ONLY = process.env.BOSS?.split(",");

it("보스", () => {
  assertMockAI();
  const r = new Report(ONLY ? "boss-part" : "boss");
  r.line(`# 보스 시뮬레이션 · 보스마다 ${RUNS}판`);
  r.line("체력 가득 · 권장 등급 파티 무작위 4명 · 장신구 없음 · 시작 물자 8개 · 깨우기 포함 · 레벨업마다 성장표 + 단련 1번\n");
  const rows: (string | number)[][] = [];
  for (const c of BOSSES.filter((x) => !ONLY || ONLY.includes(x.boss))) {
    const region = getRegion(c.region)!;
    const g = GRADES[c.grade ?? region.recommended[0]];
    const m = getMonster(c.boss)!;
    const res = bossFights(c.region, c.boss, g, RUNS);
    const flag = c.note ? c.note : res.win < c.target[0] ? "⚠ 낮음" : res.win > c.target[1] ? "⚠ 높음" : "목표 안";
    rows.push([m.name, g.name, `${pct(c.target[0])}~${pct(c.target[1])}`, pct(res.win), res.rounds.toFixed(1), res.dead.toFixed(2), flag]);
  }
  r.table(["보스", "파티", "목표", "승률", "평균 라운드", "판당 사망", "판정"], rows);
  console.log(`[sim] ${r.save()}`);
}, 3_600_000);
