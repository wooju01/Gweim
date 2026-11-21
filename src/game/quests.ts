// 의뢰·클랜 규칙 (순수 함수). 수치는 data/quests.ts, data/clan.ts.
import { CLAN_JOIN, SETTLEMENT_DAYS, UPKEEP } from "@/data/clan";
import { BOARD_SIZE, DISPATCH, QUESTS, getQuest, type DirectQuest, type Objective, type Quest, type QuestReward } from "@/data/quests";
import { FAME_EFFECT, fameRank, fameTier } from "@/data/fame";
import type { StatBlock } from "@/data/growth";
import { createRng, type Rng } from "@/game/random";
import type { MercLevel } from "@/lib/schemas";
import { RANK_ORDER } from "@/data/ranks";
import { GUILD_PROMOTION } from "@/data/guild";

// ── 게시판 ─────────────────────────────────────────────

export const isDirect = (q: Quest | undefined): q is DirectQuest => !!q && q.kind !== "dispatch";

/** 의뢰 등급: 파견은 권장 등급, 직접 의뢰는 requires.guildGrade (없으면 동) */
export function questGrade(q: Quest): MercLevel {
  return q.kind === "dispatch" ? q.recommendedGrade : (q.requires?.guildGrade ?? q.grade ?? "bronze");
}

/** 게시판 조건을 볼 때 쓰는 길드 상태 */
export type BoardContext = { guildGrade: MercLevel; fame: number; explored: string[] };
const DEFAULT_CTX: BoardContext = { guildGrade: "bronze", fame: 0, explored: [] };

/** 이 의뢰가 게시판에 나올 조건이 되나 (길드 등급, 명성 단계, 도달 기록) */
export function questOpen(q: Quest, ctx: BoardContext): boolean {
  if (RANK_ORDER.indexOf(questGrade(q)) > RANK_ORDER.indexOf(ctx.guildGrade)) return false;
  if (!isDirect(q)) return true;
  if (q.requires?.fame && fameRank(fameTier(ctx.fame)) < fameRank(q.requires.fame)) return false;
  if (q.requires?.reached?.some((r) => !ctx.explored.includes(r))) return false;
  if (q.appearAfter && !ctx.explored.includes(q.appearAfter)) return false;
  return true;
}

/** 무작위로 붙지 않고, 조건이 되면 고정으로 붙는 의뢰 (승급 시험, 지명) */
const isFixed = (q: Quest) => isDirect(q) && (!!q.exam || q.kind === "named");

/**
 * 게시판을 새로 붙인다. 이미 받은 의뢰는 빼고, 조건이 되는 의뢰만, 종류별로 정해진 수만큼 무작위로.
 * 명성이 높을수록 도전·중요 의뢰가 잘 붙는다. 승급 시험·지명 의뢰는 여기서 붙지 않는다 (fixedQuests)
 */
export function rollBoard(seed: number, taken: string[] = [], ctx: BoardContext = DEFAULT_CTX): string[] {
  const rng = createRng(seed ^ 0x0b0a7d);
  const tier = fameRank(fameTier(ctx.fame));
  const weight = (q: Quest) => 1 + (isDirect(q) && (q.kind === "challenge" || q.important) ? tier * FAME_EFFECT.questWeightPerTier : 0);
  const pick = (direct: boolean, n: number) => {
    const pool = QUESTS.filter((q) => isDirect(q) === direct && !taken.includes(q.id) && !isFixed(q) && questOpen(q, ctx));
    const out: string[] = [];
    while (out.length < n && pool.length > 0) {
      let roll = rng.next() * pool.reduce((a, q) => a + weight(q), 0);
      const i = Math.max(0, pool.findIndex((q) => (roll -= weight(q)) < 0));
      out.push(pool.splice(i, 1)[0].id);
    }
    return out;
  };
  return [...pick(true, BOARD_SIZE.direct), ...pick(false, BOARD_SIZE.dispatch)];
}

/**
 * 지금 게시판에 붙어야 할 길드 승급 시험 (다음 등급의 시험, 아직 통과하지 않았고, 받아 두지 않았고, 나올 조건이 됐으면)
 */
export function examQuest(guildGrade: MercLevel, passed: MercLevel[], active: string[], explored: string[], fame = 0): string | null {
  const next = RANK_ORDER[RANK_ORDER.indexOf(guildGrade) + 1];
  const rule = next ? GUILD_PROMOTION[next] : undefined;
  if (!next || !rule || passed.includes(next) || active.includes(rule.exam)) return null;
  const q = getQuest(rule.exam);
  if (!isDirect(q) || !questOpen(q, { guildGrade, fame, explored })) return null;
  return q.id;
}

/** 조건이 되면 고정으로 붙는 의뢰: 승급 시험 + 지명 의뢰 (받아 뒀거나 이미 마친 지명 의뢰는 빼고) */
export function fixedQuests(ctx: BoardContext, passed: MercLevel[], active: string[], done: string[]): string[] {
  const exam = examQuest(ctx.guildGrade, passed, active, ctx.explored, ctx.fame);
  const named = QUESTS.filter((q) => isDirect(q) && q.kind === "named" && !active.includes(q.id) && !done.includes(q.id) && questOpen(q, ctx)).map((q) => q.id);
  return [...(exam ? [exam] : []), ...named];
}

// ── 직접 의뢰 ──────────────────────────────────────────

/** 보스를 쓰러뜨린 전투 하나의 기록 (조건부 목표): 파티 직업, 그 전투에서 누가 쓰러졌나 */
export type BossFeat = { monsterId: string; jobs: string[]; downed: boolean };

/**
 * 원정에서 쌓인 기록: 쓰러뜨린 몬스터(종류별), 그중 정예, 창고의 유실물,
 * 들어선 지역, 끝 칸까지 간 지역, 보스 전투 기록, 구출한 사건
 */
export type Tally = {
  kills: Record<string, number>;
  eliteKills: Record<string, number>;
  salvage: Record<string, number>;
  regions?: string[];
  goals?: string[];
  feats?: BossFeat[];
  rescued?: string[];
};

/** 목표 진행 [지금, 목표] */
export function objectiveProgress(o: Objective, t: Tally): [number, number] {
  switch (o.type) {
    case "killBoss":
      return [Math.min(1, t.kills[o.monsterId] ?? 0), 1];
    case "killAnyBoss":
      return [o.monsterIds.some((id) => (t.kills[id] ?? 0) > 0) ? 1 : 0, 1];
    case "killElite":
      return [Math.min(o.count, t.eliteKills[o.monsterId] ?? 0), o.count];
    case "killCount":
      return [Math.min(o.count, t.kills[o.monsterId] ?? 0), o.count];
    case "collect":
    case "deliver":
      return [Math.min(o.count, t.salvage[o.itemId] ?? 0), o.count];
    case "reach":
      return [(o.goal ? t.goals : t.regions)?.includes(o.regionId) ? 1 : 0, 1];
    case "killWithCondition":
      return [
        (t.feats ?? []).some((f) => o.monsterIds.includes(f.monsterId) && (!o.noJob || !f.jobs.includes(o.noJob)) && (!o.noDowned || !f.downed)) ? 1 : 0,
        1,
      ];
    case "rescue":
      return [t.rescued?.includes(o.eventId) ? 1 : 0, 1];
  }
}

export function objectiveDone(o: Objective, t: Tally): boolean {
  const [now, goal] = objectiveProgress(o, t);
  return now >= goal;
}

/** 기한이 지났나 (받은 날 + 기한 < 오늘) */
export function questOverdue(q: Quest, acceptedDay: number, today: number): boolean {
  return isDirect(q) && q.deadlineDays !== undefined && today > acceptedDay + q.deadlineDays;
}

/** 주간 제한 보상 (전술 교본, 종족 유물): 이번 주에 이미 받았으면 고를 수 없다 */
export function rewardBlocked(r: QuestReward, weekly: { book: boolean; relic: boolean }): string | null {
  if (r.type === "tacticBook" && weekly.book) return "전술 교본은 이번 주에 이미 받았다";
  if (r.type === "relic" && weekly.relic) return "종족 유물은 이번 주에 이미 받았다";
  return null;
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
export function clanJoinChance(affinity: number, personalities: string[], background?: string, fame = 0): number {
  if (affinity < CLAN_JOIN.minAffinity) return 0;
  const tags = [...personalities, ...(background ? [background] : [])];
  const p =
    CLAN_JOIN.base +
    CLAN_JOIN.perAffinity * (affinity - CLAN_JOIN.minAffinity) +
    tags.reduce((s, t) => s + (CLAN_JOIN.temper[t] ?? 0), 0) +
    fameRank(fameTier(fame)) * FAME_EFFECT.clanJoinPerTier;
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
