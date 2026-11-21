import { mercFromRef } from "@/game/merc/roster";
import { StoryRequest, type StoryResponse } from "@/lib/schemas";
import { getMercAI, getMockAI } from "@/server/ai";
import type { StoryInput } from "@/server/ai/types";

// 짧은 이야기 (일상 장면, 파견 보고). 결과는 코드가 이미 정했고, 여기서는 말만 만든다.
export async function POST(request: Request) {
  const parsed = StoryRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;
  let input: StoryInput;
  if (body.kind === "scene") {
    const [a, b] = body.mercs.map(mercFromRef);
    if (!a || !b) return Response.json({ error: "알 수 없는 용병" }, { status: 400 });
    input = { kind: "scene", mercs: [a, b] };
  } else {
    const members = body.members.map((m) => ({ merc: mercFromRef(m.merc), outcome: m.outcome }));
    if (members.some((m) => !m.merc)) return Response.json({ error: "알 수 없는 용병" }, { status: 400 });
    input = { kind: "dispatch", title: body.title, success: body.success, members: members.map((m) => ({ merc: m.merc!, outcome: m.outcome })) };
  }
  const ai = getMercAI();
  try {
    const text = (await ai.story(input)).trim().slice(0, 400);
    if (!text) throw new Error("빈 이야기");
    const res: StoryResponse = { mode: ai.mode, text };
    return Response.json(res);
  } catch (error) {
    if (ai.mode !== "mock") console.error("[ai] 이야기 실패, 기본 문장으로 대체:", error);
    const res: StoryResponse = { mode: ai.mode === "mock" ? "mock" : "fallback", text: await getMockAI().story(input) };
    return Response.json(res);
  }
}
