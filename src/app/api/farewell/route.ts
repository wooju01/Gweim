import { mercFromRef } from "@/game/merc/roster";
import { FarewellRequest, type FarewellResponse } from "@/lib/schemas";
import { getMercAI, getMockAI } from "@/server/ai";

// 죽은 용병의 마지막 말. 죽음은 규칙(전투 엔진)이 이미 정했고, 여기서는 말만 만든다.
export async function POST(request: Request) {
  const parsed = FarewellRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청", issues: parsed.error.issues }, { status: 400 });
  }
  const merc = mercFromRef(parsed.data.merc);
  if (!merc) return Response.json({ error: "알 수 없는 용병" }, { status: 400 });

  const input = { merc, memory: parsed.data.memory, stage: parsed.data.stage };
  const ai = getMercAI();
  try {
    const words = (await ai.farewell(input)).trim().slice(0, 100);
    if (!words) throw new Error("빈 말");
    const body: FarewellResponse = { mode: ai.mode, words };
    return Response.json(body);
  } catch (error) {
    if (ai.mode !== "mock") console.error("[ai] 마지막 말 실패, 기본 문장으로 대체:", error);
    const body: FarewellResponse = { mode: ai.mode === "mock" ? "mock" : "fallback", words: await getMockAI().farewell(input) };
    return Response.json(body);
  }
}
