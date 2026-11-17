import "server-only";
import { createMockAI } from "./mock";
import type { MercAI } from "./types";

export type { MercAI, ReplyContext, TurnEvent } from "./types";

let instance: MercAI | null = null;

/**
 * AI 구현을 고른다.
 * - AI_MODE=mock 이거나 ANTHROPIC_API_KEY가 없으면 mock
 * - 실제 AI 연결(Vercel AI SDK + Claude)은 5단계에서 여기에 추가한다
 */
export function getMercAI(): MercAI {
  if (instance) return instance;

  const wantsLive = process.env.AI_MODE !== "mock" && !!process.env.ANTHROPIC_API_KEY;
  if (wantsLive) {
    console.warn("[ai] 실제 AI 연결은 아직 구현되지 않아 mock으로 동작합니다.");
  }
  instance = createMockAI();
  return instance;
}
