// Claude(Anthropic API) 구현. MercAI 인터페이스만 지키면 다른 제공사로 바꿔 끼울 수 있다.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MercProfile, MercReply, Tone } from "../../lib/schemas";
import {
  classifyPrompt,
  profilePrompt,
  summaryPrompt,
  systemPrompt,
  turnPrompt,
} from "./prompts";
import type { MercAI } from "./types";

const DEFAULT_MODEL = "claude-haiku-5-5";

const ClassifyResult = z.object({ tone: Tone });
const SummaryResult = z.object({ memory: z.string() });

/**
 * AI_THINKING=off 이면 사고(thinking)를 끈다. 대사·분류는 깊은 추론이 필요 없어
 * 끄면 출력 토큰과 지연이 줄 수 있다. 개발 서버 로그의 usage로 켰을 때와 비교한다.
 */
const thinkingOption = () =>
  process.env.AI_THINKING === "off" ? { thinking: { type: "disabled" as const } } : {};

/** 개발 중에만 토큰 사용량을 찍는다 */
function logUsage(kind: string, usage: Anthropic.Usage) {
  if (process.env.NODE_ENV === "production") return;
  console.log(
    `[AI ${kind}] thinking=${process.env.AI_THINKING === "off" ? "off" : "on"} ` +
      `in=${usage.input_tokens} cache_read=${usage.cache_read_input_tokens ?? 0} ` +
      `cache_write=${usage.cache_creation_input_tokens ?? 0} out=${usage.output_tokens}`,
  );
}

/** 응답이 비었거나 거절됐거나 스키마에 안 맞을 때 */
export class AIOutputError extends Error {}

export function createClaudeAI(options: { model?: string } = {}): MercAI {
  // ANTHROPIC_API_KEY 환경변수를 자동으로 읽는다
  const client = new Anthropic();
  const model = options.model ?? DEFAULT_MODEL;

  return {
    mode: "live",

    async reply(ctx) {
      const response = await client.messages.parse({
        model,
        ...thinkingOption(),
        max_tokens: 4000,
        // 대사 생성은 깊은 추론이 필요 없어 effort를 낮춰 비용과 지연을 줄인다
        output_config: { effort: "low", format: zodOutputFormat(MercReply) },
        system: [
          // 용병별로 고정된 부분이라 캐시한다
          {
            type: "text",
            text: systemPrompt(ctx.merc),
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: turnPrompt(ctx),
          },
        ],
      });
      logUsage("reply", response.usage);

      if (response.stop_reason === "refusal") {
        throw new AIOutputError(
          `응답 거절: ${response.stop_details?.category ?? "unknown"}`,
        );
      }
      if (!response.parsed_output) {
        throw new AIOutputError(
          `응답 파싱 실패 (stop_reason: ${response.stop_reason})`,
        );
      }
      return response.parsed_output;
    },

    async createProfile(input) {
      const response = await client.messages.parse({
        model,
        ...thinkingOption(),
        max_tokens: 4000,
        output_config: { effort: "low", format: zodOutputFormat(MercProfile) },
        messages: [{ role: "user", content: profilePrompt(input) }],
      });
      logUsage("profile", response.usage);

      if (response.stop_reason === "refusal") {
        throw new AIOutputError(
          `프로필 생성 거절: ${response.stop_details?.category ?? "unknown"}`,
        );
      }
      if (!response.parsed_output) {
        throw new AIOutputError(
          `프로필 파싱 실패 (stop_reason: ${response.stop_reason})`,
        );
      }
      return response.parsed_output;
    },

    async summarize(input) {
      const response = await client.messages.parse({
        model,
        ...thinkingOption(),
        max_tokens: 2000,
        output_config: { effort: "low", format: zodOutputFormat(SummaryResult) },
        messages: [{ role: "user", content: summaryPrompt(input) }],
      });
      logUsage("summary", response.usage);

      if (response.stop_reason === "refusal" || !response.parsed_output) {
        throw new AIOutputError(`기억 요약 실패 (stop_reason: ${response.stop_reason})`);
      }
      return response.parsed_output.memory;
    },

    async classify(text) {
      const response = await client.messages.parse({
        model,
        ...thinkingOption(),
        max_tokens: 1000,
        output_config: {
          effort: "low",
          format: zodOutputFormat(ClassifyResult),
        },
        messages: [{ role: "user", content: classifyPrompt(text) }],
      });
      logUsage("classify", response.usage);

      if (response.stop_reason === "refusal" || !response.parsed_output) {
        // 분류가 안 되면 호감도에 영향이 없도록 neutral로 처리한다
        return "neutral";
      }
      return response.parsed_output.tone;
    },
  };
}
