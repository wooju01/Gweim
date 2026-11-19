import { describe, expect, it } from "vitest";
import { getStage } from "@/game/affinity";
import { gameReducer, initialState, type GameState } from "./state";

/** 샘플 용병 중 넷을 동행시키고 던전에 들어간 상태 */
function inDungeon(ids: string[], seed = 1): GameState {
  let s = initialState();
  s = { ...s, party: ids, progress: { ...s.progress, ...Object.fromEntries(ids.map((id) => [id, { ...s.progress[id], hired: true }])) } };
  return gameReducer(s, { type: "enterDungeon", seed });
}

describe("호감도와 탐험 (상태)", () => {
  const party = ["s-kesh", "s-bran", "s-mirel", "s-tob"];

  it("샘플의 케쉬는 적대 단계로 시작한다", () => {
    expect(getStage(initialState().progress["s-kesh"].affinity)).toBe("hostile");
  });

  it("적대 단계 용병은 탐험이 끝나면 확률(약 30%)로 계약을 깨고 떠난다", () => {
    let left = 0;
    for (let seed = 0; seed < 400; seed++) {
      const end = gameReducer(inDungeon(party), { type: "endExpedition", seed });
      if (!end.party.includes("s-kesh")) {
        left++;
        expect(end.roster.some((e) => e.kind === "random" && e.seed.id === "s-kesh")).toBe(false);
        expect(end.notices.some((n) => n.includes("떠났다"))).toBe(true);
      }
      // 적대가 아닌 용병은 떠나지 않는다
      expect(end.party).toEqual(expect.arrayContaining(["s-bran", "s-mirel", "s-tob"]));
    }
    expect(left / 400).toBeGreaterThan(0.2);
    expect(left / 400).toBeLessThan(0.4);
  });

  it("지도 위에서 물자를 받으면 호감이 오른다", () => {
    let s = inDungeon(party);
    s = { ...s, expedition: { ...s.expedition!, members: s.expedition!.members.map((m) => (m.id === "s-bran" ? { ...m, hp: 5 } : m)) } };
    const before = s.progress["s-bran"].affinity;
    s = gameReducer(s, { type: "giveSupply", item: "potion", target: "s-bran" });
    expect(s.progress["s-bran"].affinity).toBe(before + 2);
    expect(s.reactions[0]).toContain("브란");
  });
});

describe("죽음 (상태)", () => {
  it("전투에서 죽은 용병은 명단에서 사라지고 추모 명단에 오른다. 동료는 호감이 떨어지고 기억에 남는다", () => {
    let s = inDungeon(["s-bran", "s-mirel", "s-tob", "s-durgan"]);
    const exp = s.expedition!;
    const battleNode = exp.map.nodes.find((n) => n.kind === "battle")!;
    // 전투 화면을 직접 만들고, 브란이 죽은 채로 이긴 것으로 한다
    const fake = {
      round: 1, order: [], turn: 0, supplies: exp.supplies, depth: 1, walked: 1, guideUsed: false, rng: 1, outcome: "victory" as const, log: [],
      units: exp.members.map((m) => ({
        id: m.id, side: "merc" as const, name: m.name, title: "", hp: m.id === "s-bran" ? 0 : m.hp, maxHp: m.maxHp,
        attack: [1, 1] as const, defense: 0, speed: 0, statuses: [], skills: [], cooldowns: {}, guarding: false,
        dead: m.id === "s-bran",
      })),
    };
    void battleNode;
    const before = s.progress["s-mirel"].affinity;
    s = gameReducer({ ...s, screen: { kind: "battle", battle: fake } }, { type: "battleFinish" });
    expect(s.roster.some((e) => e.kind === "random" && e.seed.id === "s-bran")).toBe(false);
    expect(s.party).not.toContain("s-bran");
    expect(s.memorial).toEqual([expect.objectContaining({ id: "s-bran", name: "브란", words: null })]);
    expect(s.progress["s-mirel"].affinity).toBe(before - 5);
    expect(s.progress["s-mirel"].memory).toContain("브란");
    expect(s.expedition!.members.find((m) => m.id === "s-bran")).toMatchObject({ dead: true });

    s = gameReducer(s, { type: "farewell", mercId: "s-bran", words: "먼저 간다." });
    expect(s.memorial[0].words).toBe("먼저 간다.");
    expect(s.reactions.some((r) => r.includes("먼저 간다."))).toBe(true);
  });
});
