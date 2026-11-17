import { getMerc } from "@/data/mercs";
import { applyTone, getResolve, getStage, proposeJoin, reactionTo } from "@/game/affinity";
import type { Merc } from "@/game/types";
import { MercReply, TalkRequest, type TalkResponse, type Tone } from "@/lib/schemas";
import { getMercAI, getMockAI, type ReplyContext, type TurnEvent } from "@/server/ai";
import type { Direction } from "@/server/ai/types";

// 이 route는 얇게 유지한다: 입력 검증 → 규칙 계산(game) → 대사 생성(server/ai) → 응답
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
  let { affinity, willingness, recentTones } = state;
  let delta = { affinity: 0, willingness: 0 };
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
      ({ affinity, willingness, recentTones, delta } = result);

      // AI에게는 실제로 움직인 방향만 알려 준다 (반복 감쇠로 0이 됐으면 "none")
      event = {
        kind: "talk",
        playerText,
        tone,
        affinity: direction(delta.affinity),
        willingness: direction(delta.willingness),
        note: reactionTo(merc, tone).note,
      };
      break;
    }

    case "propose": {
      // 고용 의향% 확률로 합류. 주사위는 서버에서 굴린다
      const result = proposeJoin(state.willingness);
      joined = result.joined;
      willingness = result.willingness;
      delta = { affinity: 0, willingness: result.delta };
      event = { kind: "propose", joined };
      break;
    }
  }

  const stage = getStage(affinity);
  const resolve = getResolve(willingness);
  const { reply, mode } = await generateReply({ merc, stage, resolve, history: state.history, event });

  const body: TalkResponse = {
    mode,
    tone,
    delta,
    affinity,
    willingness,
    stage,
    recentTones,
    message: reply.message,
    emotion: reply.emotion,
    choices: joined ? [] : reply.choices,
    joined,
  };
  return Response.json(body);
}

function direction(delta: number): Direction {
  return delta > 0 ? "up" : delta < 0 ? "down" : "none";
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
