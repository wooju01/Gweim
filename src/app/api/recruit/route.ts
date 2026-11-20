import { RECRUIT_LEVEL, getPassive } from "@/data/passives";
import { rollSkills } from "@/data/skillgen";
import { resolveTraits, rollPassives, rollRecruitCount, rollStart, rollTraits } from "@/game/merc/generate";
import {
  MercProfile,
  RecruitRequest,
  type AIMode,
  type MercSeed,
  type MercTraits,
  type RecruitResponse,
} from "@/lib/schemas";
import { getMercAI, getMockAI } from "@/server/ai";

/**
 * 랜덤 용병 모집.
 * 특성 뽑기와 시작 수치는 코드가, 이름·과거·말투는 AI가 한 번 만든다.
 */
export async function POST(request: Request) {
  const parsed = RecruitRequest.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "잘못된 요청", issues: parsed.error.issues }, { status: 400 });
  }
  const { avoidNames } = parsed.data;
  // 몇 명이 올지는 코드가 정한다 (게시판 공고에 매번 다른 수가 모인다)
  const count = parsed.data.count ?? rollRecruitCount(Math.random);

  // 특성은 코드가 먼저 다 뽑는다. 한 번 모집에 같은 직업+성격이 겹치지 않게 한다.
  const batch = rollDistinct(count);

  // 프로필은 빠르게 하려고 동시에 만든다. 같은 요청 안에서 이름이 겹치면 그 한 명만 다시 만든다.
  const drafts = await Promise.all(batch.map((traits) => recruitOne(traits, avoidNames)));
  const taken = new Set(avoidNames);
  const results: { seed: MercSeed; mode: AIMode }[] = [];
  for (const draft of drafts) {
    const result = taken.has(draft.seed.profile.name)
      ? await recruitOne(draft.seed.traits, [...taken])
      : draft;
    taken.add(result.seed.profile.name);
    results.push(result);
  }

  const ai = getMercAI();
  const body: RecruitResponse = {
    mode: results.some((r) => r.mode === "fallback") ? "fallback" : ai.mode,
    seeds: results.map((r) => r.seed),
  };
  return Response.json(body);
}

const MAX_REROLLS = 10;

/** count명의 특성을 뽑는다. 직업+첫 성격이 겹치면 다시 뽑는다 (몇 번 해도 안 되면 그대로 둔다) */
function rollDistinct(count: number): MercTraits[] {
  const batch: MercTraits[] = [];
  const keyOf = (t: MercTraits) => `${t.race}/${t.job}/${t.personalities[0]}`;
  for (let i = 0; i < count; i++) {
    let traits = rollTraits(Math.random);
    for (let n = 0; n < MAX_REROLLS && batch.some((b) => keyOf(b) === keyOf(traits)); n++) {
      traits = rollTraits(Math.random);
    }
    batch.push(traits);
  }
  return batch;
}

async function recruitOne(
  traitIds: MercTraits,
  avoidNames: string[],
): Promise<{ seed: MercSeed; mode: AIMode }> {
  const traits = resolveTraits(traitIds)!;
  const start = rollStart(traits, Math.random);
  const level = RECRUIT_LEVEL;
  const passives = rollPassives(traitIds.race, level, Math.random);
  const skills = rollSkills(traitIds.job, traitIds.race, Math.random);
  const id = `r-${crypto.randomUUID().slice(0, 8)}`;

  const ai = getMercAI();
  const input = { traits, passives: passives.map((id) => getPassive(id)!), avoidNames };
  try {
    const profile = MercProfile.parse(await ai.createProfile(input));
    return { seed: { id, traits: traitIds, start, level, passives, skills, profile }, mode: ai.mode };
  } catch (error) {
    if (ai.mode === "mock") throw error;
    console.error("[ai] 용병 프로필 생성 실패, mock으로 대체:", error);
    const profile = await getMockAI().createProfile(input);
    return { seed: { id, traits: traitIds, start, level, passives, skills, profile }, mode: "fallback" };
  }
}
