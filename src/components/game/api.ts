import type { TalkRequest, TalkResponse } from "@/lib/schemas";

// 데스크톱 빌드에서는 호스팅 서버 주소를 넣는다. 웹에서는 비워 두면 같은 서버로 간다.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function postTalk(body: TalkRequest): Promise<TalkResponse> {
  const res = await fetch(`${API_BASE}/api/talk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `서버 오류 (${res.status})`);
  }
  return res.json();
}
