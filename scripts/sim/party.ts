// 시뮬레이션 파티: 샘플 용병 9명(직업 9개) 중 무작위 4명, 등급 단계에 맞춘 성장·스킬
import { GROWTH, JOB_STAT, PROMOTE_BONUS, type StatBlock } from "@/data/growth";
import { RANKS } from "@/data/ranks";
import { fragmentsFor, normalize, validateLoadout } from "@/game/skills";
import type { Merc } from "@/game/types";
import type { MercLevel, SkillBuild } from "@/lib/schemas";
import { MERCS } from "./lib";

/** 재현 가능한 난수 (시드 → 0~1) */
export function rng(seed: number) {
  let s = (seed * 2654435761) % 2147483647 || 1;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

/** 등급 단계. levels: 레벨업 횟수 (레벨업마다 성장표 + 단련 1번), promoted: 승급 보너스, four: 스킬 4개 */
export type Grade = { name: string; level: MercLevel; levels: number; promoted: boolean; four: boolean };
export const GRADES: Record<string, Grade> = {
  bronze3: { name: "동3", level: "bronze", levels: 0, promoted: false, four: false },
  bronze2: { name: "동2", level: "bronze", levels: 1, promoted: false, four: true },
  bronze1: { name: "동1", level: "bronze", levels: 2, promoted: false, four: true },
  silver3: { name: "은3", level: "silver", levels: 2, promoted: true, four: true },
  silver2: { name: "은2", level: "silver", levels: 3, promoted: true, four: true },
};

/** 레벨업 성장표 + 단련(직업 기술 스탯 3점) levels번, 승급했으면 체력 보너스와 단련 더 */
export function gradeStats(m: Merc, g: Grade): StatBlock {
  const out: StatBlock = {};
  const add = (k: keyof StatBlock, v: number) => (out[k] = (out[k] ?? 0) + v);
  for (let i = 0; i < g.levels; i++) {
    for (const [k, v] of Object.entries(GROWTH[m.job!] ?? {})) add(k as keyof StatBlock, v!);
    add(JOB_STAT[m.job!], 3);
  }
  if (g.promoted) {
    add("hp", PROMOTE_BONUS.hp);
    for (let i = 0; i < PROMOTE_BONUS.trainable; i++) add(JOB_STAT[m.job!], 3);
  }
  return out;
}

const fullyLater = (f: ReturnType<typeof fragmentsFor>[number]) => (f.kind === "main" ? f.effects.every((e) => e.kind === "later") : f.mods.every((x) => x.kind === "later"));

/** 스킬 4개: 쓸 수 있는 등급(동 / 은까지)의 조각, 스킬마다 부 조각을 등급 한도만큼 */
export function fourSkills(m: Merc, level: MercLevel, r: () => number): SkillBuild[] {
  const owner = { job: m.job!, race: m.race!, level };
  const tiers = level === "bronze" ? ["bronze"] : ["bronze", "silver"];
  const pool = fragmentsFor(owner).filter((f) => tiers.includes(f.tier ?? "bronze") && !fullyLater(f) && !(f as { ultimate?: boolean }).ultimate);
  const have = (m.skills ?? []).map((b) => ({ ...b, subs: [...b.subs] }));
  const used = new Set(have.flatMap((b) => [b.main, ...b.subs]));
  const take = (kind: "main" | "sub") => {
    const xs = pool.filter((f) => f.kind === kind && !used.has(f.id));
    if (!xs.length) return undefined;
    const id = xs[Math.floor(r() * xs.length)].id;
    used.add(id);
    return id;
  };
  const limit = RANKS[level].subLimit;
  for (const b of have)
    while (b.subs.length < limit) {
      const sub = take("sub");
      if (!sub) break;
      b.subs.push(sub);
    }
  while (have.length < 4) {
    const main = take("main");
    if (!main) break;
    const subs: string[] = [];
    while (subs.length < limit) {
      const sub = take("sub");
      if (!sub) break;
      subs.push(sub);
    }
    have.push(normalize({ main, subs }));
  }
  const fixed = have.map((b) => normalize(b));
  for (let i = 0; i < fixed.length && validateLoadout(owner, fixed); i++) fixed[i] = { ...fixed[i], subs: fixed[i].subs.slice(0, 1) };
  return validateLoadout(owner, fixed) ? (m.skills ?? []) : fixed;
}

/** 무작위 4명 (시드 고정), 등급 단계에 맞춘 성장·스킬 */
export function gradeParty(seed: number, g: Grade): Merc[] {
  const r = rng(seed);
  const pool = [...MERCS];
  const picked: Merc[] = [];
  while (picked.length < 4) picked.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return picked.map((m) => ({ ...m, level: g.level, stats: gradeStats(m, g), ...(g.four ? { skills: fourSkills(m, g.level, r) } : {}) }));
}
