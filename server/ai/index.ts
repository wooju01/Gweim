import "server-only";
import { createClaudeAI } from "./claude";
import { createMockAI } from "./mock";
import type { MercAI } from "./types";

export type { MercAI, ReplyContext, TurnEvent } from "./types";

let primary: MercAI | null = null;
let mock: MercAI | null = null;

/**
 * AI 구현을 고른다.
 * - AI_MODE=mock 이거나 ANTHROPIC_API_KEY가 없으면 mock
 * - 그 외에는 Claude (모델은 AI_MODEL로 바꿀 수 있음, 기본 claude-haiku-5-5)
 */
export function getMercAI(): MercAI {
  if (primary) return primary;
  const live = process.env.AI_MODE !== "mock" && !!process.env.ANTHROPIC_API_KEY;
  primary = live ? createClaudeAI({ model: process.env.AI_MODEL || undefined }) : getMockAI();
  console.info(`[ai] ${primary.mode} 모드`);
  return primary;
}

/** 실제 AI가 실패했을 때 게임이 멈추지 않도록 대신 쓰는 mock */
export function getMockAI(): MercAI {
  mock ??= createMockAI();
  return mock;
}
