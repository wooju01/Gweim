import type { RecruitRequest, RecruitResponse, TalkRequest, TalkResponse } from "@/lib/schemas";

// 데스크톱 빌드에서는 호스팅 서버 주소를 넣는다. 웹에서는 비워 두면 같은 서버로 간다.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
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

export function postTalk(body: TalkRequest): Promise<TalkResponse> {
  return post("/api/talk", body);
}

export function postRecruit(body: RecruitRequest): Promise<RecruitResponse> {
  return post("/api/recruit", body);
}
