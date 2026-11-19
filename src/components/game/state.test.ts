import { describe, expect, it } from "vitest";
import { getStage } from "@/game/affinity";
import { wageOf } from "@/game/wages";
import { entryId, gameReducer, initialState, mercOf, type GameState } from "./state";

/** 샘플 용병 중 넷을 동행시키고 던전에 들어간 상태 */
function inDungeon(ids: string[], seed = 1): GameState {
  let s = initialState();
  s = {
    ...s,
    party: ids,
    pack: { bandage: 4, antidote: 2, potion: 2 },
    progress: { ...s.progress, ...Object.fromEntries(ids.map((id) => [id, { ...s.progress[id], hired: true }])) },
  };
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
        expect(end.report!.left.some((n) => n.includes("떠났다"))).toBe(true);
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

/** 이 용병들의 보수 합 */
function wages(s: GameState, ids: string[]): number {
  return ids.reduce((sum, id) => sum + wageOf(mercOf(s.roster.find((e) => entryId(e) === id)!)), 0);
}
const PARTY4 = ["s-bran", "s-mirel", "s-tob", "s-durgan"];

describe("금화와 상점 (상태)", () => {
  it("처음엔 금화 120, 짐은 비어 있다. 사면 금화가 줄고 짐과 재고가 바뀐다", () => {
    let s = initialState();
    expect(s.gold).toBe(120);
    expect(Object.values(s.pack).every((n) => n === 0)).toBe(true);
    s = gameReducer(s, { type: "buy", item: "potion" });
    expect(s.gold).toBe(100);
    expect(s.pack.potion).toBe(1);
    expect(s.stock.potion).toBe(2);
  });

  it("짐 한도(10)·금화·재고가 모자라면 살 수 없다", () => {
    let s = { ...initialState(), gold: 1000, stock: { bandage: 99, antidote: 99, potion: 99 } };
    for (let i = 0; i < 15; i++) s = gameReducer(s, { type: "buy", item: "bandage" });
    expect(s.pack.bandage).toBe(10);
    const poor = gameReducer({ ...initialState(), gold: 5 }, { type: "buy", item: "bandage" });
    expect(poor.pack.bandage).toBe(0);
    const empty = gameReducer({ ...initialState(), stock: { bandage: 0, antidote: 0, potion: 0 } }, { type: "buy", item: "bandage" });
    expect(empty.pack.bandage).toBe(0);
  });

  it("짐을 들고 떠나고, 살아 돌아오면 금화·유물·남은 물자를 챙긴다", () => {
    let s = inDungeon(["s-bran", "s-mirel", "s-tob", "s-durgan"]);
    expect(s.expedition!.supplies).toEqual({ bandage: 4, antidote: 2, potion: 2 });
    expect(Object.values(s.pack).every((n) => n === 0)).toBe(true);
    s = { ...s, expedition: { ...s.expedition!, gold: 55, loot: ["crystal_eye"] } };
    const back = gameReducer(s, { type: "endExpedition", seed: 1 });
    // 들고 온 금화를 더하고, 보수를 나눠 준다
    expect(back.gold).toBe(120 + 55 - wages(s, PARTY4));
    expect(back.relics).toEqual(["crystal_eye"]);
    expect(back.pack).toEqual({ bandage: 4, antidote: 2, potion: 2 });

    const sold = gameReducer(back, { type: "sell", index: 0 });
    expect(sold.gold).toBe(back.gold + 50);
    expect(sold.relics).toEqual([]);
  });

  it("전멸하면 그 원정에서 얻은 금화·유물·물자를 잃는다", () => {
    let s = inDungeon(["s-bran", "s-mirel", "s-tob", "s-durgan"]);
    s = { ...s, expedition: { ...s.expedition!, gold: 55, loot: ["crystal_eye"], room: { kind: "defeat" } } };
    const back = gameReducer(s, { type: "endExpedition", seed: 1 });
    // 얻은 것은 잃어도 보수는 줘야 한다
    expect(back.gold).toBe(120 - wages(s, PARTY4));
    expect(back.relics).toEqual([]);
    expect(Object.values(back.pack).every((n) => n === 0)).toBe(true);
    expect(back.report).toMatchObject({ outcome: "defeat", gold: 0, lost: { gold: 55, relics: 1 } });
  });
});

describe("보수와 조건 제시 (상태)", () => {
  it("금화가 모자라면 그 뒤 용병은 체불되어 호감이 떨어진다", () => {
    let s = inDungeon(PARTY4);
    s = { ...s, gold: 0, expedition: { ...s.expedition!, gold: 0 } };
    const before = PARTY4.map((id) => s.progress[id].affinity);
    const back = gameReducer(s, { type: "endExpedition", seed: 1 });
    PARTY4.forEach((id, i) => expect(back.progress[id].affinity).toBe(Math.max(0, before[i] - 10)));
    expect(back.report!.wages.some((n) => n.includes("보수를 받지 못했다"))).toBe(true);
  });

  it("선금이 받아들여지면 금화를 내고 기록한다. 고용될 때 몫 약속이 보수에 반영된다", () => {
    let s = initialState();
    const id = "s-tob";
    const merc = mercOf(s.roster.find((e) => entryId(e) === id)!);
    const res = (over: object) => ({
      mode: "mock" as const, tone: null, delta: { affinity: 0, willingness: 20 }, affinity: 30, willingness: 90, stage: "wary" as const,
      recentTones: [], message: "좋아.", emotion: "pleased" as const, choices: [], joined: null, memory: "", forget: 0, talks: 0, offer: null, ...over,
    });
    s = gameReducer(s, { type: "resolved", mercId: id, playerText: "선금", res: res({ offer: "advance" }) });
    expect(s.gold).toBe(120 - wageOf(merc) * 2);
    expect(s.progress[id].offers.advance).toBe(true);
    s = gameReducer(s, { type: "resolved", mercId: id, playerText: "몫", res: res({ offer: "share" }) });
    s = gameReducer(s, { type: "resolved", mercId: id, playerText: "가자", res: res({ joined: true }) });
    expect(s.progress[id].wage).toBe(wageOf(merc, true));
    expect(s.progress[id].wage).toBeGreaterThan(wageOf(merc));
  });
});

describe("마을 (상태)", () => {
  it("처음엔 마을에서 1일째로 시작하고, 시설로 이동한다", () => {
    let s = initialState();
    expect(s.screen.kind).toBe("town");
    expect(s.day).toBe(1);
    for (const place of ["guild", "shop", "inn", "gate", "town"] as const) {
      s = gameReducer(s, { type: "goto", place });
      expect(s.screen.kind).toBe(place);
    }
  });

  it("원정을 마치면 마을로 돌아오고 하루가 지난다. 원정 중에는 마을 이동을 하지 않는다", () => {
    const s = inDungeon(["s-bran", "s-mirel"]);
    expect(gameReducer(s, { type: "goto", place: "shop" })).toBe(s);
    const back = gameReducer(s, { type: "endExpedition", seed: 2 });
    // 결산 화면을 거쳐 마을로
    expect(back.screen.kind).toBe("report");
    expect(back.report).toMatchObject({ outcome: "retreat", day: 1 });
    expect(back.day).toBe(2);
    const home = gameReducer(back, { type: "goto", place: "town" });
    expect(home.screen.kind).toBe("town");
    expect(home.report).toBeNull();
  });

  it("숙소: 고용한 용병만 원정 파티에 넣고 빼며, 4명을 넘지 않는다", () => {
    let s = initialState();
    const ids = ["s-bran", "s-mirel", "s-tob", "s-durgan", "s-kesh"];
    s = { ...s, progress: { ...s.progress, ...Object.fromEntries(ids.map((id) => [id, { ...s.progress[id], hired: true }])) } };
    for (const id of ids) s = gameReducer(s, { type: "toggleParty", mercId: id });
    expect(s.party).toEqual(ids.slice(0, 4));
    s = gameReducer(s, { type: "toggleParty", mercId: "s-bran" });
    expect(s.party).not.toContain("s-bran");
    s = gameReducer(s, { type: "toggleParty", mercId: "s-kesh" });
    expect(s.party).toContain("s-kesh");
    // 고용하지 않은 용병은 넣을 수 없다
    const notHired = gameReducer({ ...initialState() }, { type: "toggleParty", mercId: "s-ragna" });
    expect(notHired.party).toEqual([]);
  });
});

describe("결산 (상태)", () => {
  it("목적지 귀환: 가져온 금화·유물·물자, 쓰러졌다 살아난 동료가 결산에 남는다", () => {
    let s = inDungeon(["s-bran", "s-mirel", "s-tob", "s-durgan"]);
    const exp = s.expedition!;
    s = {
      ...s,
      expedition: {
        ...exp,
        gold: 70,
        loot: ["feather_charm"],
        room: { kind: "goal" },
        members: exp.members.map((m) => (m.id === "s-mirel" ? { ...m, fell: true } : m)),
      },
    };
    const back = gameReducer(s, { type: "endExpedition", seed: 4 });
    expect(back.report).toMatchObject({ outcome: "goal", gold: 70, relics: ["feather_charm"], fallen: ["미렐"], lost: null });
    expect(back.report!.bonds.length).toBeGreaterThan(0); // 쓰러진 동료를 데려와 호감 상승
  });
});

describe("전투 중 후퇴 (상태)", () => {
  /** 입구 바로 다음 전투 칸으로 들어간 상태 */
  function inBattle(ids: string[]): GameState {
    for (let seed = 0; seed < 200; seed++) {
      const s = inDungeon(ids, seed);
      const exp = s.expedition!;
      const start = exp.map.nodes.find((n) => n.id === exp.at)!;
      const target = exp.map.nodes.find((n) => n.kind === "battle" && start.next.includes(n.id));
      if (target) return gameReducer(s, { type: "move", nodeId: target.id, seed: 5 });
    }
    throw new Error("전투 칸이 없다");
  }

  it("후퇴하면 원정이 끝나 결산으로 가고, 성격에 따라 호감이 오르내린다", () => {
    // 브란(명예): -5 -3, 미렐(다정): -5 +2, 토브(탐욕): -5, 두르강(유쾌): -5
    const s = inBattle(["s-bran", "s-mirel", "s-tob", "s-durgan"]);
    expect(s.screen.kind).toBe("battle");
    const before = Object.fromEntries(["s-bran", "s-mirel", "s-tob"].map((id) => [id, s.progress[id].affinity]));
    const fled = gameReducer(s, { type: "fleeBattle", seed: 1 });
    expect(fled.screen.kind).toBe("report");
    expect(fled.expedition).toBeNull();
    expect(fled.report).toMatchObject({ outcome: "retreat", fled: true });
    expect(fled.progress["s-bran"].affinity).toBe(Math.max(0, before["s-bran"] - 8));
    expect(fled.progress["s-mirel"].affinity).toBe(Math.max(0, before["s-mirel"] - 3));
    expect(fled.progress["s-tob"].affinity).toBe(Math.max(0, before["s-tob"] - 5));
    expect(fled.report!.bonds.some((l) => l.includes("등을 보였다"))).toBe(true);
  });

  it("소심한 용병은 오히려 안도한다", () => {
    const s = inBattle(["s-bran"]);
    const id = "s-bran";
    // 브란을 소심한 성격으로 바꿔 본다 (명단 시드 수정)
    const roster = s.roster.map((e) =>
      e.kind === "random" && e.seed.id === id ? { ...e, seed: { ...e.seed, traits: { ...e.seed.traits, personalities: ["timid"] } } } : e,
    );
    const before = s.progress[id].affinity;
    const fled = gameReducer({ ...s, roster }, { type: "fleeBattle", seed: 1 });
    expect(fled.progress[id].affinity).toBe(before - 1); // 기본 -5, 소심 +4
  });

  it("전투가 이미 끝났거나 던전 밖이면 후퇴하지 않는다", () => {
    const s = initialState();
    expect(gameReducer(s, { type: "fleeBattle", seed: 1 })).toBe(s);
  });
});
