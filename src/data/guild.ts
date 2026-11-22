// 길드 등급과 승급 (2026-11-22).
// 길드 등급(state.guildGrade)은 큰 등급만 쓴다 (동 → 은 → 금). 승급 시험 의뢰를 마치고 금화를 내면 오른다.
// 길드 등급이 오르면: 그 등급 조각을 전수관에서 해금, 그 등급 용병이 고용 시장에, 그 등급 의뢰가 게시판에.
// 용병 승급(등급이 바뀌는 승급)은 길드 창구에서: 경험치 완료 + 금화 + 현재 등급 던전 보스 승리 기록 + 길드 등급 ≥ 목표 등급.
import type { MercLevel } from "@/lib/schemas";

export const GUILD_START: MercLevel = "bronze";

/** 이 등급으로 오르는 길드 승급: 시험 의뢰(data/quests.ts의 exam)와 금화. 없는 등급은 아직 미정 */
export const GUILD_PROMOTION: Partial<Record<MercLevel, { exam: string; gold: number }>> = {
  silver: { exam: "q_exam_silver", gold: 400 },
  // gold: 미정 (후보: 안개 늪 4층 던전 보스)
};

/** 용병 승급 증명: 현재 등급의 던전 보스. 이 중 하나와 싸워 살아서 이긴 기록(bossWins)이 있어야 다음 등급으로 오른다 */
export const PROOF_BOSSES: Partial<Record<MercLevel, string[]>> = {
  bronze: ["goblin_king", "slime_king", "spider_queen", "alpha_wolf"],
  // silver: 미정 (길드가 은에서 더 오를 수 없어서 아직 필요 없다)
};

/** 고용 시장: 길드 등급과 같은 등급 용병이 나올 확률 (아니면 한 등급 아래). 길드가 동이면 늘 동 */
export const RECRUIT_TOP_CHANCE = 0.3;
