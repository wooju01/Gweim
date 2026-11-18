import { TALK_LIMIT, applyTone, getResolve, getStage, proposeJoin, reactionTo, usesTalk } from "@/game/affinity";
import { MEMORY_MAX_CHARS, planFold } from "@/game/memory";
import { mercFromRef } from "@/game/roster";
import type { Merc } from "@/game/types";
import { MercReply, TalkRequest, type TalkResponse, type Tone } from "@/lib/schemas";
import { getMercAI, getMockAI, type ReplyContext, type TurnEvent } from "@/server/ai";
import type { Direction, SummaryInput } from "@/server/ai/types";

// 이 route는 얇게 유지한다: 입력 검증 → 규칙 계산(game) → 대사 생성(server/ai) → 응답
export async function POST(request: Request) {
  const parsed = TalkRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청", issues: parsed.error.issues }, { status: 400 });
  }
  const { state, action } = parsed.data;

  // 랜덤 용병은 클라이언트가 보낸 특성 id로 반응표를 서버에서 다시 계산한다
  const merc = mercFromRef(parsed.data.merc);
  if (!merc) {
    return Response.json({ error: "알 수 없는 용병이거나 잘못된 특성 조합" }, { status: 400 });
  }

  // 대화 횟수는 서버에서도 막는다
  if (usesTalk(action) && state.talks >= TALK_LIMIT) {
    return Response.json({ error: `${merc.name}은(는) 더 할 말이 없다.` }, { status: 400 });
  }
  const talks = state.talks + (usesTalk(action) ? 1 : 0);

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

  // 대화가 길어졌으면 오래된 부분을 기억으로 접는다. 대사 생성과 동시에 돌려 기다리는 시간을 늘리지 않는다.
  const plan = planFold(state.history);
  const [{ reply, mode }, folded] = await Promise.all([
    generateReply({
      merc,
      stage,
      resolve,
      history: state.history,
      memory: state.memory,
      event,
      talksLeft: TALK_LIMIT - talks,
    }),
    plan ? summarize({ merc, memory: state.memory, lines: plan.fold }) : null,
  ]);
  // 요약에 실패하면 기억도 기록도 그대로 둔다 (다음 턴에 다시 시도된다)
  const memory = folded ?? state.memory;
  const forget = folded !== null && plan ? plan.forget : 0;

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
    memory,
    forget,
    talks,
  };
  return Response.json(body);
}

/** 기억 요약. 실패하면 null (게임은 멈추지 않는다) */
async function summarize(input: SummaryInput): Promise<string | null> {
  const ai = getMercAI();
  try {
    const memory = (await ai.summarize(input)).trim();
    return memory ? memory.slice(0, MEMORY_MAX_CHARS) : null;
  } catch (error) {
    console.error("[ai] 기억 요약 실패, 이번 턴은 건너뜀:", error);
    return null;
  }
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
