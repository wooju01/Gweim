import { getEvent } from "@/data/events";
import { getTrait } from "@/data/traits";
import { EventNarration, EventRequest, type EventResponse } from "@/lib/schemas";
import { getMercAI, getMockAI } from "@/server/ai";
import type { EventInput } from "@/server/ai/types";

// 던전 사건의 묘사와 선택지 문장만 만든다. 결과는 클라이언트의 규칙 코드(game/dungeon)가 정한다.
export async function POST(request: Request) {
  const parsed = EventRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청", issues: parsed.error.issues }, { status: 400 });
  }
  const event = getEvent(parsed.data.eventId);
  if (!event) return Response.json({ error: "알 수 없는 사건" }, { status: 400 });

  const input: EventInput = {
    event,
    party: parsed.data.party.map((m) => ({
      name: m.name,
      race: m.race ? getTrait(m.race)?.name : undefined,
      job: m.job ? getTrait(m.job)?.name : undefined,
    })),
  };

  const ai = getMercAI();
  try {
    const narration = EventNarration.parse(await ai.narrateEvent(input));
    // 선택지 id가 사건 틀과 정확히 같아야 한다. 다르면 AI 문장을 버린다
    const ids = event.choices.map((c) => c.id).sort().join(",");
    if (narration.choices.map((c) => c.id).sort().join(",") !== ids) throw new Error("선택지 id 불일치");
    // 선택지 순서는 사건 틀 순서로 맞춘다
    const choices = event.choices.map((c) => narration.choices.find((n) => n.id === c.id)!);
    const body: EventResponse = { mode: ai.mode, intro: narration.intro, choices };
    return Response.json(body);
  } catch (error) {
    if (ai.mode !== "mock") console.error("[ai] 사건 묘사 실패, 기본 문장으로 대체:", error);
    const body: EventResponse = { mode: ai.mode === "mock" ? "mock" : "fallback", ...(await getMockAI().narrateEvent(input)) };
    return Response.json(body);
  }
}
