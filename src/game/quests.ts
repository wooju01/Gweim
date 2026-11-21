// 의뢰·클랜 규칙 (순수 함수). 수치는 data/quests.ts, data/clan.ts.
import { CLAN_JOIN, SETTLEMENT_DAYS, UPKEEP } from "@/data/clan";
import { BOARD_SIZE, DISPATCH, QUESTS, getQuest, type Objective, type Quest } from "@/data/quests";
import type { StatBlock } from "@/data/growth";
import { createRng, type Rng } from "@/game/random";
import type { MercLevel } from "@/lib/schemas";

// ── 게시판 ─────────────────────────────────────────────

/** 게시판을 새로 붙인다. 이미 받은 의뢰(진행 중)는 빼고, 종류별로 정해진 수만큼 무작위로 */
export function rollBoard(seed: number, taken: string[] = []): string[] {
  const rng = createRng(seed ^ 0x0b0a7d);
  const pick = (kind: Quest["kind"], n: number) => {
    const pool = QUESTS.filter((q) => q.kind === kind && !taken.includes(q.id)).map((q) => q.id);
    const out: string[] = [];
    while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
    return out;
  };
  return [...pick("direct", BOARD_SIZE.direct), ...pick("dispatch", BOARD_SIZE.dispatch)];
}

// ── 직접 의뢰 ──────────────────────────────────────────

/** 원정에서 쌓인 기록: 쓰러뜨린 몬스터(종류별), 그중 정예, 가져온 유실물 */
export type Tally = { kills: Record<string, number>; eliteKills: Record<string, number>; salvage: Record<string, number> };

/** 목표 진행 [지금, 목표] */
export function objectiveProgress(o: Objective, t: Tally): [number, number] {
  switch (o.type) {
    case "killBoss":
      return [Math.min(1, t.kills[o.monsterId] ?? 0), 1];
    case "killElite":
      return [Math.min(o.count, t.eliteKills[o.monsterId] ?? 0), o.count];
    case "collect":
      return [Math.min(o.count, t.salvage[o.itemId] ?? 0), o.count];
  }
}

export function objectiveDone(o: Objective, t: Tally): boolean {
  const [now, goal] = objectiveProgress(o, t);
  return now >= goal;
}

// ── 파견 의뢰 ──────────────────────────────────────────

export type DispatchMember = { id: string; level: MercLevel; stats: StatBlock; personalities: string[]; background?: string };
export type DispatchOutcome = "ok" | "injured" | "dead";
export type DispatchResult = {
  success: boolean;
  /** 사람마다 결과 */
  members: { id: string; outcome: DispatchOutcome }[];
  /** 사람마다 호감 변화 (살아 돌아온 사람만) */
  affinity: Record<string, number>;
  chance: number;
};

/** 보낸 사람들의 힘: 등급 점수 + 쌓인 스탯 합 */
export function dispatchPower(members: DispatchMember[]): number {
  return members.reduce((s, m) => s + DISPATCH.rankPower[m.level] + Object.values(m.stats).reduce((a, n) => a + (n ?? 0), 0), 0);
}

/** 성공 확률 */
export function dispatchChance(q: Extract<Quest, { kind: "dispatch" }>, members: DispatchMember[]): number {
  const ratio = dispatchPower(members) / q.difficulty;
  const c = DISPATCH.success;
  return Math.max(c.min, Math.min(c.max, c.base + c.slope * (ratio - 1)));
}

/**
 * 파견 결과를 정한다 (코드가 정하고, AI는 이야기만 쓴다).
 * 사람마다 사망·부상을 굴린다 (위험도, 힘이 모자랄수록 커진다). 호감: 성공 +, 실패 -, 동료가 죽으면 크게 -, 좋아하는·싫어하는 의뢰면 ±
 */
export function resolveDispatch(questId: string, members: DispatchMember[], seed: number): DispatchResult | null {
  const q = getQuest(questId);
  if (q?.kind !== "dispatch" || members.length === 0) return null;
  const rng: Rng = createRng(seed);
  const chance = dispatchChance(q, members);
  const success = rng.next() < chance;
  const shortfall = Math.max(1, q.difficulty / Math.max(1, dispatchPower(members)));
  const results = members.map((m) => {
    const roll = rng.next();
    const death = Math.min(0.9, DISPATCH.death[q.risk] * shortfall * (success ? 0.5 : 1));
    const injury = Math.min(0.9, DISPATCH.injury[q.risk] * shortfall);
    const outcome: DispatchOutcome = roll < death ? "dead" : roll < death + injury ? "injured" : "ok";
    return { id: m.id, outcome };
  });
  const deaths = results.filter((r) => r.outcome === "dead").length;
  const a = DISPATCH.affinity;
  const affinity: Record<string, number> = {};
  for (const m of members) {
    if (results.find((r) => r.id === m.id)!.outcome === "dead") continue;
    const tags = [...m.personalities, ...(m.background ? [m.background] : [])];
    let n = success ? a.success : a.failure;
    n += deaths * a.allyDeath;
    if (q.likedBy?.some((t) => tags.includes(t))) n += a.liked;
    if (q.dislikedBy?.some((t) => tags.includes(t))) n += a.disliked;
    affinity[m.id] = n;
  }
  return { success, members: results, affinity, chance };
}

// ── 클랜 ───────────────────────────────────────────────

/** 클랜 가입 제안 수락 확률 (호감 신뢰 미만이면 0) */
export function clanJoinChance(affinity: number, personalities: string[], background?: string): number {
  if (affinity < CLAN_JOIN.minAffinity) return 0;
  const tags = [...personalities, ...(background ? [background] : [])];
  const p = CLAN_JOIN.base + CLAN_JOIN.perAffinity * (affinity - CLAN_JOIN.minAffinity) + tags.reduce((s, t) => s + (CLAN_JOIN.temper[t] ?? 0), 0);
  return Math.max(0, Math.min(1, p));
}

/** 유지비 (정산 한 번) */
export function upkeepCost(home: "inn" | "clanHall", members: number): number {
  const u = UPKEEP[home];
  return u.base + u.perMember * members + u.facility;
}

/** 지난 정산 이후 넘은 정산 경계 수 (정산일: 1 + 7k) */
export function settlementsDue(lastSettlementDay: number, day: number): number {
  return Math.max(0, Math.floor((day - lastSettlementDay) / SETTLEMENT_DAYS));
}
