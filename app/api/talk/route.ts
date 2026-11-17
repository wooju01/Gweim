import { getMerc } from "@/data/mercs";
import { applyTone, baseDelta, getStage, proposeJoin } from "@/lib/game/affinity";
import { MercReply, TalkRequest, type TalkResponse, type Tone } from "@/lib/schemas";
import { getMercAI, type TurnEvent } from "@/server/ai";

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

  const ai = getMercAI();

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
      tone = action.type === "choice" ? action.choice.tone : await ai.classify(action.text, merc);

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
  const reply = MercReply.parse(
    await ai.reply({ merc, stage, history: state.history, event }),
  );

  const body: TalkResponse = {
    mode: ai.mode,
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
