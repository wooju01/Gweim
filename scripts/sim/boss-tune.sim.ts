// 보스 체력·공격 맞추기: 보스마다 체력과 공격을 같은 배율로 바꿔 가며(메모리에서만) 목표 승률 가운데를 찾는다.
// 실행: npm run sim -- boss-tune  (TUNE_RUNS=300 판으로 이분 탐색). 결과: results/날짜-boss-tune.md (제안 수치)
// 찾은 수치는 data/monsters.ts에 직접 옮기고 npm run sim:boss로 확인한다. 보스 패턴(스킬·능력)은 건드리지 않는다
import { it } from "vitest";
import { getMonster } from "@/data/monsters";
import { getRegion } from "@/data/regions";
import { BOSSES, bossFights } from "./bosses";
import { GRADES } from "./party";
import { Report, pct } from "./report";
import { assertMockAI } from "./setup";

const RUNS = Number(process.env.TUNE_RUNS ?? 300);
const ONLY = process.env.BOSS?.split(",");

it("보스 수치 맞추기", () => {
  assertMockAI();
  const r = new Report("boss-tune");
  r.line(`# 보스 체력·공격 제안 · 이분 탐색 ${RUNS}판씩\n`);
  const rows: (string | number)[][] = [];
  for (const c of BOSSES.filter((x) => !x.note && (!ONLY || ONLY.includes(x.boss)))) {
    const m = getMonster(c.boss)!;
    const base = { hp: m.hp, attack: [...m.attack] as [number, number] };
    const g = GRADES[c.grade ?? getRegion(c.region)!.recommended[0]];
    const goal = (c.target[0] + c.target[1]) / 2;
    const apply = (f: number) => {
      m.hp = Math.max(1, Math.round(base.hp * f));
      m.attack = [Math.max(1, Math.round(base.attack[0] * f)), Math.max(1, Math.round(base.attack[1] * f))];
    };
    let lo = 0.3, hi = 3, best = 1, bestWin = bossFights(c.region, c.boss, g, RUNS).win;
    for (let i = 0; i < 9 && Math.abs(bestWin - goal) > 0.02; i++) {
      const f = (lo + hi) / 2;
      apply(f);
      const w = bossFights(c.region, c.boss, g, RUNS).win;
      if (Math.abs(w - goal) < Math.abs(bestWin - goal)) [best, bestWin] = [f, w];
      // 승률이 높으면 보스를 세게 (배율 올림)
      if (w > goal) lo = f;
      else hi = f;
    }
    apply(best);
    rows.push([m.name, g.name, `${pct(c.target[0])}~${pct(c.target[1])}`, `${base.hp} → ${m.hp}`, `${base.attack.join("~")} → ${m.attack.join("~")}`, best.toFixed(2), pct(bestWin)]);
    m.hp = base.hp;
    m.attack = base.attack;
  }
  r.table(["보스", "파티", "목표", "체력", "공격", "배율", "그때 승률"], rows);
  console.log(`[sim] ${r.save()}`);
}, 3_600_000);
