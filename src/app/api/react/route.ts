import { mercFromRef } from "@/game/merc/roster";
import { ReactRequest, type ReactResponse } from "@/lib/schemas";
import { getMercAI, getMockAI } from "@/server/ai";

// 상황 반응 한마디 (전투 후퇴, 보스 직전 불길한 기운). 호감 변화는 규칙(성격)이 이미 정했고, 여기서는 말만 만든다.
export async function POST(request: Request) {
  const parsed = ReactRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청", issues: parsed.error.issues }, { status: 400 });
  }
  const merc = mercFromRef(parsed.data.merc);
  if (!merc) return Response.json({ error: "알 수 없는 용병" }, { status: 400 });

  const input = { merc, situation: parsed.data.situation, feeling: parsed.data.feeling, stage: parsed.data.stage };
  const ai = getMercAI();
  try {
    const words = (await ai.react(input)).trim().slice(0, 100);
    if (!words) throw new Error("빈 말");
    const body: ReactResponse = { mode: ai.mode, words };
    return Response.json(body);
  } catch (error) {
    if (ai.mode !== "mock") console.error("[ai] 반응 한마디 실패, 기본 문장으로 대체:", error);
    const body: ReactResponse = { mode: ai.mode === "mock" ? "mock" : "fallback", words: await getMockAI().react(input) };
    return Response.json(body);
  }
}
