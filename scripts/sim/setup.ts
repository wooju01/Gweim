// 시뮬레이션 진입점 (vitest.sim.config.ts의 setupFiles): 항상 mock AI로, 실제 API 호출은 막는다.
// 시뮬레이션은 전투·원정 규칙만 쓰지만, 실수로 AI 경로를 타더라도 비용이 나가지 않게 여기서 강제한다.
process.env.AI_MODE = "mock";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_MODEL;

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/anthropic\.com|claude\.ai/i.test(url)) throw new Error(`[sim] 실제 AI API 호출 금지: ${url}`);
  return realFetch(input, init);
}) as typeof fetch;

/** 시뮬레이션 안에서 mock AI인지 확인 (각 시뮬레이션 시작에 부른다) */
export function assertMockAI() {
  if (process.env.AI_MODE !== "mock" || process.env.ANTHROPIC_API_KEY) throw new Error("[sim] mock AI가 아니다");
}
