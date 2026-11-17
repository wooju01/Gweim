import { getMerc } from "@/data/mercs";
import { applyTone, baseDelta, getStage, proposeJoin } from "@/game/affinity";
import type { Merc } from "@/game/types";
import { MercReply, TalkRequest, type TalkResponse, type Tone } from "@/lib/schemas";
import { getMercAI, getMockAI, type ReplyContext, type TurnEvent } from "@/server/ai";

// 이 route는 얇게 유지한다: 입력 검증 → 규칙 계산(lib/game) → 대사 생성(server/ai) → 응답
export async function POST(request: Request) {
  const parsed = TalkRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청", issues: parsed.error.issues }, { status: 400 });
  }
  const { mercId, state, action } = parsed.data;

  const merc = getMerc(mercId);
  if (!merc) {
    return Response.json({ error: `없는 용병: ${mercId}` }, { status: 404 });
  }

  let tone: Tone | null = null;
  let affinity = state.affinity;
  let delta = 0;
  let recentTones = state.recentTones;
  let joined: boolean | null = null;
  let event: TurnEvent;

  switch (action.type) {
    case "open":
      event = { kind: "open" };
      break;

    case "choice":
    case "free": {
      const playerText = action.type === "choice" ? action.choice.text : action.text;
      // 자유 입력도 같은 성향 태그로 분류한 뒤 같은 계산을 거친다
      tone = action.type === "choice" ? action.choice.tone : await classify(action.text, merc);

      const result = applyTone(merc, state, tone);
      ({ affinity, delta, recentTones } = result);

      const base = baseDelta(merc, tone);
      const reaction = base > 0 ? "liked" : base < 0 ? "disliked" : "indifferent";
      event = { kind: "talk", playerText, tone, reaction };
      break;
    }

    case "propose": {
      const result = proposeJoin(merc, state.affinity);
      ({ affinity, delta, joined } = result);
      event = { kind: "propose", joined };
      break;
    }
  }

  const stage = getStage(affinity);
  const { reply, mode } = await generateReply({ merc, stage, history: state.history, event });

  const body: TalkResponse = {
    mode,
    tone,
    delta,
    affinity,
    stage,
    recentTones,
    message: reply.message,
    emotion: reply.emotion,
    choices: joined ? [] : reply.choices,
    joined,
  };
  return Response.json(body);
}

/** 실제 AI가 실패해도 게임이 멈추지 않도록 mock으로 대신한다 */
async function generateReply(ctx: ReplyContext): Promise<{ reply: MercReply; mode: TalkResponse["mode"] }> {
  const ai = getMercAI();
  try {
    return { reply: MercReply.parse(await ai.reply(ctx)), mode: ai.mode };
  } catch (error) {
    if (ai.mode === "mock") throw error;
    console.error("[ai] 대사 생성 실패, mock으로 대체:", error);
    return { reply: await getMockAI().reply(ctx), mode: "fallback" };
  }
}

async function classify(text: string, merc: Merc): Promise<Tone> {
  const ai = getMercAI();
  try {
    return await ai.classify(text, merc);
  } catch (error) {
    console.error("[ai] 성향 분류 실패, 키워드 분류로 대체:", error);
    return getMockAI().classify(text, merc);
  }
}
