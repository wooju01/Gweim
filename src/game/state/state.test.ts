import { describe, expect, it } from "vitest";
import { getStage } from "@/game/merc/affinity";
import { wageOf } from "@/game/merc/wages";
import { promotionChoices } from "@/game/merc/promotion";
import { knownFragments, ownerOf } from "@/game/merc/skillhall";
import { getFragment } from "@/data/fragments";
import { PROMOTE_BONUS, XP_TO_NEXT } from "@/data/growth";
import { fragmentsFor, skillKey } from "@/game/skills";
import { act, living } from "@/game/combat/engine";
import { battleSpoils, finishBattle } from "@/game/dungeon/expedition";
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
    // 신중 계열 +, 호전·자존심 계열 -, 나머지 0: 브란(명예) -4, 미렐(다정) 0, 토브(탐욕) 0
    const s = inBattle(["s-bran", "s-mirel", "s-tob", "s-durgan"]);
    expect(s.screen.kind).toBe("battle");
    const before = Object.fromEntries(["s-bran", "s-mirel", "s-tob"].map((id) => [id, s.progress[id].affinity]));
    const fled = gameReducer(s, { type: "fleeBattle", seed: 1 });
    expect(fled.screen.kind).toBe("report");
    expect(fled.expedition).toBeNull();
    expect(fled.report).toMatchObject({ outcome: "retreat", fled: true });
    expect(fled.progress["s-bran"].affinity).toBe(Math.max(0, before["s-bran"] - 4));
    expect(fled.progress["s-mirel"].affinity).toBe(before["s-mirel"]);
    expect(fled.progress["s-tob"].affinity).toBe(before["s-tob"]);
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
    expect(fled.progress[id].affinity).toBe(before + 5); // 소심 +5
  });

  it("후퇴하면 쓰러져 있던 용병은 남겨져 죽는다 (추모비에 오른다)", () => {
    const s = inBattle(["s-bran", "s-mirel"]);
    if (s.screen.kind !== "battle") throw new Error();
    const battle = s.screen.battle;
    const downed = {
      ...battle,
      units: battle.units.map((u) => (u.id === "s-bran" ? { ...u, hp: 0, downedTurnsLeft: 1, downedRound: battle.round } : u)),
    };
    const fled = gameReducer({ ...s, screen: { ...s.screen, battle: downed } }, { type: "fleeBattle", seed: 1 });
    expect(fled.roster.some((e) => e.kind === "random" && e.seed.id === "s-bran")).toBe(false);
    expect(fled.memorial.some((m) => m.id === "s-bran")).toBe(true);
    expect(fled.roster.some((e) => e.kind === "random" && e.seed.id === "s-mirel")).toBe(true);
  });

  it("전투가 이미 끝났거나 던전 밖이면 후퇴하지 않는다", () => {
    const s = initialState();
    expect(gameReducer(s, { type: "fleeBattle", seed: 1 })).toBe(s);
  });
});

describe("유실물 (상태)", () => {
  it("살아 돌아오면 유실물을 챙기고, 하나씩 또는 전부 판다. 전멸하면 잃는다", () => {
    let s = inDungeon(PARTY4);
    s = { ...s, expedition: { ...s.expedition!, salvage: { rat_fang: 3, warden_crest: 1 } } };
    const back = gameReducer(s, { type: "endExpedition", seed: 1 });
    expect(back.salvage).toEqual({ rat_fang: 3, warden_crest: 1 });
    expect(back.report!.salvage).toEqual({ rat_fang: 3, warden_crest: 1 });

    const one = gameReducer(back, { type: "sellSalvage", id: "rat_fang" });
    expect(one.salvage.rat_fang).toBe(2);
    expect(one.gold).toBe(back.gold + 2);
    const all = gameReducer(one, { type: "sellSalvage", id: "rat_fang", all: true });
    expect(all.salvage.rat_fang).toBeUndefined();
    expect(all.gold).toBe(one.gold + 4);

    const lost = gameReducer({ ...s, expedition: { ...s.expedition!, room: { kind: "defeat" } } }, { type: "endExpedition", seed: 1 });
    expect(lost.salvage).toEqual({});
    expect(lost.report!.lost).toMatchObject({ salvage: 4 });
  });
});

describe("성장 (상태)", () => {
  it("살아 돌아온 용병은 지나온 칸만큼 경험치를 받고, 레벨업이 결산에 남는다", () => {
    let s = inDungeon(PARTY4);
    // xp 칸이 없는 이전 저장: 지나온 칸 수로 계산한다
    // 입구 + (XP_TO_NEXT[0]) 칸
    const visited = Array.from({ length: XP_TO_NEXT[0] + 1 }, (_, i) => `n${i}`);
    s = { ...s, expedition: { ...s.expedition!, xp: undefined, visited, room: { kind: "goal" } } };
    const back = gameReducer(s, { type: "endExpedition", seed: 1 });
    // 칸 수(레벨업에 딱 맞음) + 목적지 3 → 레벨 1, 3 남음
    expect(back.progress["s-bran"]).toMatchObject({ lv: 1, xp: 3, trainable: 1, stats: { str: 1, defense: 1, hp: 1 } });
    expect(back.report!.growth.some((l) => l.includes("브란") && l.includes("레벨업 → 2단계"))).toBe(true);
  });

  it("전멸하면 경험치를 받지 않는다", () => {
    let s = inDungeon(PARTY4);
    const before = s.progress["s-bran"];
    s = { ...s, expedition: { ...s.expedition!, xp: XP_TO_NEXT[0] * 3, xpBy: {}, room: { kind: "defeat" } } };
    const back = gameReducer(s, { type: "endExpedition", seed: 1 });
    expect(back.progress["s-bran"]).toMatchObject({ lv: before.lv, xp: before.xp });
    expect(back.report!.growth).toEqual([]);
  });

  it("단련장: 금화 10을 내고 3점을 배분한다. 기회·금화가 없거나 배분이 틀리면 안 된다", () => {
    let s = initialState();
    const id = "s-bran";
    s = { ...s, progress: { ...s.progress, [id]: { ...s.progress[id], hired: true, trainable: 1 } } };
    const bad = gameReducer(s, { type: "train", mercId: id, alloc: { str: 2 } });
    expect(bad).toBe(s);
    const ok = gameReducer(s, { type: "train", mercId: id, alloc: { crit: 2, faith: 1 } });
    expect(ok.gold).toBe(s.gold - 10);
    expect(ok.progress[id]).toMatchObject({ trainable: 0, stats: { crit: 2, faith: 1 } });
    expect(gameReducer(ok, { type: "train", mercId: id, alloc: { hp: 3 } })).toBe(ok);
  });
});

describe("승급 (상태)", () => {
  it("등급의 1단계(레벨 2)인 용병은 금화를 내고 승급한다. 3단계부터 다시, 보수는 올라간다", () => {
    let s = initialState();
    const id = "s-durgan";
    s = { ...s, gold: 100, progress: { ...s.progress, [id]: { ...s.progress[id], hired: true, lv: 2 } } };
    const entry = s.roster.find((e) => entryId(e) === id)!;
    if (entry.kind !== "random") throw new Error();
    const { passives } = promotionChoices(entry.seed);
    const done = gameReducer(s, { type: "promote", mercId: id, passive: passives[0] });
    expect(done.gold).toBe(80);
    const after = done.roster.find((e) => entryId(e) === id)!;
    expect(after.kind === "random" && after.seed.level).toBe("silver");
    expect(done.progress[id]).toMatchObject({ lv: 0, xp: 0, wage: wageOf(mercOf(after)) });
    expect(done.progress[id].wage).toBeGreaterThan(wageOf(mercOf(entry)));
    // 승급 보너스: 체력 포인트와 단련 기회
    const before = s.progress[id];
    expect(done.progress[id].stats.hp ?? 0).toBe((before.stats.hp ?? 0) + PROMOTE_BONUS.hp);
    expect(done.progress[id].trainable).toBe(before.trainable + PROMOTE_BONUS.trainable);
    // 단계가 모자라면 승급할 수 없다
    expect(gameReducer({ ...s, progress: { ...s.progress, [id]: { ...s.progress[id], lv: 1 } } }, { type: "promote", mercId: id, passive: passives[0] }).gold).toBe(100);
  });
});

describe("전수관 (상태)", () => {
  it("조각을 가르치면 금화·유실물이 빠지고 그 용병만 안다. 강화·조립·장착 바꾸기", () => {
    let s = initialState();
    const id = "s-durgan"; // 드워프 대검사
    const other = "s-bran"; // 인간 기사
    // 시작 스킬이 동 부 조각을 다 갖고 오므로, 대표 메인 하나만 든 용병으로 바꿔 둔다
    s = {
      ...s,
      roster: s.roster.map((e) => (e.kind === "random" && e.seed.id === id ? { ...e, seed: { ...e.seed, skills: [{ main: "gs_strike", subs: [] }] } } : e)),
    };
    const entry = s.roster.find((e) => entryId(e) === id)!;
    if (entry.kind !== "random") throw new Error();
    const known = knownFragments(entry.seed, [], []);
    // 아직 모르는 대검사 부 조각 하나
    const sub = fragmentsFor(ownerOf(entry.seed)).find((f) => f.kind === "sub" && f.tier === "bronze" && !known.includes(f.id))!;
    const cost = getFragment(sub.id)!.cost!;
    const material = sub.material!;
    s = {
      ...s,
      gold: 100,
      salvage: { [material]: 10, tech_shard: 10 },
      progress: { ...s.progress, [id]: { ...s.progress[id], hired: true }, [other]: { ...s.progress[other], hired: true } },
    };
    const taught = gameReducer(s, { type: "unlockPiece", mercId: id, piece: sub.id });
    expect(taught.gold).toBe(100 - cost.gold);
    expect(taught.salvage[material]).toBe(10 - cost.salvage[material]);
    expect(taught.progress[id].pieces).toEqual([sub.id]);
    expect(taught.progress[other].pieces).toEqual([]);
    // 다른 직업의 조각은 가르칠 수 없다
    expect(gameReducer(taught, { type: "unlockPiece", mercId: other, piece: sub.id })).toBe(taught);

    // 강화: Lv2
    const up = gameReducer(taught, { type: "upgradePiece", mercId: id, piece: sub.id });
    expect(up.progress[id].levels[sub.id]).toBe(2);
    expect(up.gold).toBe(taught.gold - 12);

    // 조립: 장착 칸에 자리가 있으면 바로 장착 (동 등급은 부 조각 1개까지)
    const main = known.find((f) => getFragment(f)!.kind === "main")!;
    const build = { main, subs: [sub.id] };
    const made = gameReducer(up, { type: "craftSkill", mercId: id, build });
    expect(made.gold).toBe(up.gold - 10);
    const crafted = made.roster.find((e) => entryId(e) === id)!;
    if (crafted.kind !== "random") throw new Error();
    expect(crafted.seed.skills.map(skillKey)).toContain(skillKey(build));

    // 장착한 스킬을 빼서 보관했다가 다시 낀다
    const out = gameReducer(made, { type: "swapSkill", mercId: id, unequip: skillKey(build) });
    expect(out.progress[id].learned.map(skillKey)).toEqual([skillKey(build)]);
    const back = gameReducer(out, { type: "swapSkill", mercId: id, equip: skillKey(build) });
    expect(back.progress[id].learned).toEqual([]);
  });
});


describe("대장간 (상태)", () => {
  const hiredState = (): GameState => {
    const s = initialState();
    return {
      ...s,
      gold: 200,
      salvage: { chief_token: 5, wolf_fang: 5 },
      progress: { ...s.progress, "s-bran": { ...s.progress["s-bran"], hired: true }, "s-durgan": { ...s.progress["s-durgan"], hired: true } },
    };
  };

  it("만들기 → 강화(무조건 성공, 3단계까지) → 같은 직업에게만 끼기 → 빼기", () => {
    let s = gameReducer(hiredState(), { type: "forgeTrinket", trinket: "t_warden_badge" }); // 기사 전용
    expect(s.gold).toBe(185);
    expect(s.salvage.chief_token).toBe(4);
    expect(s.trinkets).toEqual([{ id: "t_warden_badge", lv: 1 }]);
    s = gameReducer(s, { type: "upgradeTrinket", index: 0 });
    expect(s.trinkets[0].lv).toBe(2);
    // 대검사(두르강)는 기사 장신구를 낄 수 없다
    expect(gameReducer(s, { type: "equipTrinket", mercId: "s-durgan", index: 0 })).toBe(s);
    s = gameReducer(s, { type: "equipTrinket", mercId: "s-bran", index: 0 });
    expect(s.trinkets).toEqual([]);
    expect(s.progress["s-bran"].trinket).toEqual({ id: "t_warden_badge", lv: 2 });
    s = gameReducer(s, { type: "upgradeTrinket", mercId: "s-bran" });
    expect(s.progress["s-bran"].trinket!.lv).toBe(3);
    expect(gameReducer(s, { type: "upgradeTrinket", mercId: "s-bran" })).toBe(s);
    s = gameReducer(s, { type: "unequipTrinket", mercId: "s-bran" });
    expect(s.progress["s-bran"].trinket).toBeUndefined();
    expect(s.trinkets).toEqual([{ id: "t_warden_badge", lv: 3 }]);
  });

  it("유실물이 모자라면 만들 수 없다", () => {
    const s = { ...hiredState(), salvage: {} };
    expect(gameReducer(s, { type: "forgeTrinket", trinket: "t_warden_badge" })).toBe(s);
  });

  it("장신구 스탯이 전투에 들어간다", () => {
    let s = hiredState();
    s = { ...s, trinkets: [{ id: "t_rust_pauldron", lv: 2 }] }; // 기사, 단계마다 체력 포인트 2
    const plain = inDungeon(["s-bran"]).expedition!.members[0].maxHp;
    s = gameReducer(s, { type: "equipTrinket", mercId: "s-bran", index: 0 });
    s = gameReducer({ ...s, party: ["s-bran"] }, { type: "enterDungeon", seed: 1 });
    expect(s.expedition!.members[0].maxHp).toBe(plain + 12);
  });

  function deathBattle(outcome: "victory" | "defeat") {
    let s = inDungeon(["s-bran", "s-mirel"]);
    s = { ...s, progress: { ...s.progress, "s-bran": { ...s.progress["s-bran"], trinket: { id: "t_warden_badge", lv: 2 } } } };
    const exp = s.expedition!;
    const battle = {
      round: 1, order: [], turn: 0, supplies: exp.supplies, depth: 1, walked: 1, guideUsed: false, rng: 1, outcome, log: [],
      units: exp.members.map((m) => ({
        id: m.id, side: "merc" as const, name: m.name, title: "", hp: m.id === "s-bran" ? 0 : m.hp, maxHp: m.maxHp,
        attack: [1, 1] as const, defense: 0, speed: 0, statuses: [], skills: [], cooldowns: {}, guarding: false,
        dead: m.id === "s-bran",
      })),
    };
    return { ...s, screen: { kind: "battle" as const, battle } };
  }

  it("죽은 용병의 장신구: 이긴 전투면 거둬 오고, 도망치면 던전에 남는다", () => {
    const won = gameReducer(deathBattle("victory"), { type: "battleFinish" });
    expect(won.trinkets).toEqual([{ id: "t_warden_badge", lv: 2 }]);

    const s = deathBattle("victory");
    const fled = gameReducer({ ...s, screen: { ...s.screen, battle: { ...s.screen.battle, outcome: null } } } as GameState, { type: "fleeBattle", seed: 1 });
    expect(fled.trinkets).toEqual([]);
    expect(fled.report!.lostTrinkets).toEqual(["우두머리 증표 방패걸이"]);
  });
});

describe("던전 층 (상태)", () => {
  it("목적지에서 내려가면 체력·물자·전리품을 들고 다음 층 입구로. 깊을수록 경험치가 크다", () => {
    let s = inDungeon(PARTY4);
    const exp = s.expedition!;
    const tired = exp.members.map((m) => ({ ...m, hp: m.hp - 5 }));
    s = { ...s, expedition: { ...exp, members: tired, gold: 30, xp: 10, room: { kind: "goal" } } };
    // 목적지가 아니면 못 내려간다
    expect(gameReducer({ ...s, expedition: { ...s.expedition!, room: null } }, { type: "descend", seed: 3, region: "uf_deep_forest" }).expedition!.depth).toBe(1);
    const down = gameReducer(s, { type: "descend", seed: 3, region: "uf_deep_forest" });
    const e2 = down.expedition!;
    expect(e2.depth).toBe(2);
    expect(e2.room).toBeNull();
    expect(e2.visited).toEqual([e2.map.startId]);
    expect(e2.members.map((m) => m.hp)).toEqual(tired.map((m) => m.hp));
    expect(e2.gold).toBe(30);
    // 2층에서 한 칸 = 경험치 2
    const step = gameReducer(down, { type: "move", nodeId: e2.map.nodes.find((n) => n.id === e2.map.startId)!.next[0], seed: 4 });
    expect(step.expedition!.xp).toBe(12);
    // 결산에 도달한 층이 남는다
    const back = gameReducer(step.screen.kind === "battle" ? { ...step, screen: { kind: "dungeon" } } : step, { type: "endExpedition", seed: 1 });
    expect(back.report!.depth).toBe(2);
  });
});

describe("지도 기록 (상태)", () => {
  it("들어간 지역은 탐험 기록에, 열리지 않은 던전으로는 떠날 수 없다", () => {
    let s = initialState();
    s = { ...s, party: ["s-bran"], progress: { ...s.progress, "s-bran": { ...s.progress["s-bran"], hired: true } } };
    expect(gameReducer(s, { type: "enterDungeon", seed: 1, dungeon: "volcano" })).toBe(s);
    let d = gameReducer(s, { type: "enterDungeon", seed: 1 });
    expect(d.explored).toEqual(["uf_forest"]);
    d = { ...d, expedition: { ...d.expedition!, room: { kind: "goal" } } };
    d = gameReducer(d, { type: "descend", seed: 2, region: "uf_cave" });
    expect(d.explored).toEqual(["uf_forest", "uf_cave"]);
  });
});

describe("전투 전리품 미리보기", () => {
  it("결과 화면에 보여 준 유실물·금화와 실제로 얻는 것이 같다", () => {
    let s = initialState();
    const ids = ["s-bran", "s-mirel", "s-tob", "s-durgan"];
    s = { ...s, party: ids, progress: { ...s.progress, ...Object.fromEntries(ids.map((id) => [id, { ...s.progress[id], hired: true }])) } };
    for (let seed = 0; seed < 200; seed++) {
      let d = gameReducer(s, { type: "enterDungeon", seed });
      const exp = d.expedition!;
      const target = exp.map.nodes.find((n) => n.kind === "battle" && exp.map.nodes.find((x) => x.id === exp.at)!.next.includes(n.id));
      if (!target) continue;
      d = gameReducer(d, { type: "move", nodeId: target.id, seed: 5 });
      if (d.screen.kind !== "battle") continue;
      let b = d.screen.battle;
      for (let i = 0; i < 300 && !b.outcome; i++) b = act(b, { type: "attack", target: living(b, "enemy")[0].id });
      if (b.outcome !== "victory") continue;
      const preview = battleSpoils(finishBattle(d.expedition!, b), b, b.rng).exp;
      const after = gameReducer({ ...d, screen: { kind: "battle", battle: b } }, { type: "battleFinish" }).expedition!;
      expect(after.salvage).toEqual(preview.salvage);
      expect(after.gold).toBe(preview.gold);
      return;
    }
    throw new Error("이긴 전투가 없다");
  });
});


describe("히든 열쇠 (클랜 창고)", () => {
  const ids = ["s-bran", "s-durgan"];
  const back = (patch: Partial<NonNullable<GameState["expedition"]>>, keyItems: GameState["keyItems"] = [], room: "goal" | "defeat" | null = null) => {
    const s = inDungeon(ids);
    const expedition = { ...s.expedition!, ...patch, room: room ? { kind: room } : null } as NonNullable<GameState["expedition"]>;
    return gameReducer({ ...s, keyItems, expedition }, { type: "endExpedition", seed: 1 });
  };

  it("얻은 열쇠는 살아 돌아와야 창고에 들어가고, 이미 있으면 금화로 바뀐다", () => {
    expect(back({ keyFound: ["world_tree_branch"] }).keyItems).toEqual(["world_tree_branch"]);
    expect(back({ keyFound: ["world_tree_branch"] }, [], "defeat").keyItems).toEqual([]);
    const dup = back({ keyFound: ["world_tree_branch"] }, ["world_tree_branch"]);
    const plain = back({}, ["world_tree_branch"]);
    expect(dup.keyItems).toEqual(["world_tree_branch"]);
    expect(dup.gold - plain.gold).toBe(30);
    expect(dup.report!.keys!.join(" ")).toContain("금화");
  });

  it("히든 층에 쓴 열쇠: 보스를 잡고 나오면 소모, 후퇴하면 유지, 전멸하면 잃는다", () => {
    const hidden = { region: "uf_corrupted_forest", depth: 4, keyUsed: "world_tree_branch" as const };
    expect(back({ ...hidden, cleared: true }, ["world_tree_branch"], "goal").keyItems).toEqual([]);
    expect(back(hidden, ["world_tree_branch"]).keyItems).toEqual(["world_tree_branch"]);
    expect(back(hidden, ["world_tree_branch"], "defeat").keyItems).toEqual([]);
  });

  it("던전에 들어갈 때 창고의 열쇠를 원정이 알고 있다", () => {
    let s = initialState();
    s = { ...s, keyItems: ["world_tree_branch"], party: ["s-bran"], progress: { ...s.progress, "s-bran": { ...s.progress["s-bran"], hired: true } } };
    expect(gameReducer(s, { type: "enterDungeon", seed: 1 }).expedition!.keys).toEqual(["world_tree_branch"]);
  });
});

describe("시간 · 클랜 · 의뢰 (상태)", () => {
  const ids = ["s-bran", "s-durgan"];
  const back = (s: GameState, patch: Partial<NonNullable<GameState["expedition"]>> = {}, room: "goal" | "defeat" | null = null) =>
    gameReducer({ ...s, expedition: { ...s.expedition!, ...patch, room: room ? { kind: room } : null } as NonNullable<GameState["expedition"]> }, { type: "endExpedition", seed: 1 });

  it("던전에서는 도달한 층수만큼 날이 간다. 대화 횟수와 게시판이 새로 고쳐진다", () => {
    const s = { ...inDungeon(ids), talksLeft: 0 };
    const after = back(s, { depth: 3 });
    expect(after.day).toBe(s.day + 3);
    expect(after.report!.days).toBe(3);
    expect(after.talksLeft).toBe(2);
    expect(after.board.length).toBeGreaterThan(0);
  });

  it("클랜원은 원정 보수를 받지 않는다", () => {
    const s = inDungeon(ids);
    const asMember = { ...s, progress: { ...s.progress, "s-bran": { ...s.progress["s-bran"], kind: "member" as const } } };
    const plain = back(s);
    const member = back(asMember);
    expect(member.gold).toBeGreaterThan(plain.gold);
  });

  it("정산: 7일 경계를 넘으면 유지비, 모자라면 연체 → 1주 호감 하락, 2주 한 명 떠남", () => {
    const s = inDungeon(ids);
    const clan: GameState = {
      ...s,
      home: "clanHall",
      lastSettlementDay: 1,
      day: 7,
      gold: 0,
      progress: Object.fromEntries(Object.entries(s.progress).map(([id, p]) => [id, ids.includes(id) ? { ...p, kind: "member" as const } : p])),
    };
    const week1 = back(clan);
    expect(week1.arrearsWeeks).toBe(1);
    expect(week1.clanDebt).toBeGreaterThan(0);
    expect(week1.lastSettlementDay).toBe(8);
    expect(week1.report!.clan!.some((l) => l.includes("연체"))).toBe(true);
    // 다시 7일 → 2주 연체, 한 명이 떠난다
    const again = gameReducer({ ...week1, expedition: { ...s.expedition!, depth: 1, room: null }, day: 14, gold: 0 }, { type: "endExpedition", seed: 2 });
    expect(again.arrearsWeeks).toBe(2);
    expect(again.roster.length).toBe(week1.roster.length - 1);
    // 다 갚으면 0으로
    const paid = gameReducer({ ...again, expedition: { ...s.expedition!, depth: 1, room: null }, day: 21, gold: 9999 }, { type: "endExpedition", seed: 3 });
    expect(paid.arrearsWeeks).toBe(0);
    expect(paid.clanDebt).toBe(0);
  });

  it("직접 의뢰: 받고, 목표를 이루고 살아 돌아오면 보상. 전멸이면 없다", () => {
    let s = inDungeon(ids);
    s = { ...s, board: ["q_goblin_king"], expedition: null, screen: { kind: "town" } };
    s = gameReducer(s, { type: "acceptQuest", questId: "q_goblin_king" });
    expect(s.activeQuests).toEqual(["q_goblin_king"]);
    const d = inDungeon(ids);
    const ready = { ...d, activeQuests: s.activeQuests };
    const won = back(ready, { kills: { goblin_king: 1 } }, "goal");
    expect(won.activeQuests).toEqual([]);
    expect(won.report!.quests!.join()).toContain("고블린 킹 토벌");
    const lost = back(ready, { kills: { goblin_king: 1 } }, "defeat");
    expect(lost.activeQuests).toEqual(["q_goblin_king"]);
  });

  it("파견: 클랜원만, 보낸 사람은 파티에서 빠지고 돌아올 때까지 넣을 수 없다. 날이 차면 결과 보고", () => {
    let s = initialState();
    const id = "s-bran";
    s = { ...s, board: ["d_herbs"], party: [id], progress: { ...s.progress, [id]: { ...s.progress[id], hired: true } } };
    // 용병은 보낼 수 없다
    expect(gameReducer(s, { type: "dispatchQuest", questId: "d_herbs", members: [id] })).toBe(s);
    s = { ...s, progress: { ...s.progress, [id]: { ...s.progress[id], kind: "member" } } };
    s = gameReducer(s, { type: "dispatchQuest", questId: "d_herbs", members: [id] });
    expect(s.dispatches).toEqual([{ questId: "d_herbs", members: [id], endDay: s.day + 1 }]);
    expect(s.party).toEqual([]);
    expect(gameReducer(s, { type: "toggleParty", mercId: id })).toBe(s);
    // 다른 사람으로 원정을 다녀오면 결과가 나온다
    const other = "s-durgan";
    s = { ...s, party: [other], progress: { ...s.progress, [other]: { ...s.progress[other], hired: true } } };
    s = gameReducer(s, { type: "enterDungeon", seed: 1 });
    s = gameReducer(s, { type: "endExpedition", seed: 1 });
    expect(s.dispatches).toEqual([]);
    expect(s.dispatchLog[0]).toMatchObject({ questId: "d_herbs", story: null });
  });

  it("클랜: 신뢰 단계에게만 가입을 청하고, 8명이 모이면 창설. 창설 뒤에는 바로 클랜원", () => {
    let s = initialState();
    const all = s.roster.map(entryId);
    s = { ...s, progress: Object.fromEntries(Object.entries(s.progress).map(([id, p]) => [id, { ...p, hired: true, affinity: 100 }])) };
    // 호감 100이면 늘 받아들인다 (성격 보정이 있어도 1로 잘린다고 보장되진 않으므로 시드를 여럿)
    for (const id of all) for (let seed = 0; seed < 20 && !s.progress[id].pledged; seed++) s = gameReducer({ ...s, day: s.day + seed }, { type: "proposeClan", mercId: id, seed });
    const pledged = all.filter((id) => s.progress[id].pledged);
    expect(pledged.length).toBeGreaterThanOrEqual(8);
    s = gameReducer(s, { type: "foundClan" });
    expect(s.home).toBe("clanHall");
    for (const id of pledged) expect(s.progress[id]).toMatchObject({ kind: "member", pledged: false });
    // 신뢰 미만은 청할 수 없다
    const low = { ...s, progress: { ...s.progress, [all[0]]: { ...s.progress[all[0]], kind: "merc" as const, affinity: 50 } } };
    expect(gameReducer(low, { type: "proposeClan", mercId: all[0], seed: 1 })).toBe(low);
  });

  it("집에서 1:1 대화는 귀환마다 2명까지", () => {
    let s = initialState();
    s = { ...s, progress: { ...s.progress, "s-bran": { ...s.progress["s-bran"], hired: true }, "s-durgan": { ...s.progress["s-durgan"], hired: true }, "s-tob": { ...s.progress["s-tob"], hired: true } } };
    s = gameReducer(s, { type: "homeTalkStart", mercId: "s-bran" });
    s = gameReducer(s, { type: "homeTalkEnd" });
    s = gameReducer(s, { type: "homeTalkStart", mercId: "s-durgan" });
    s = gameReducer(s, { type: "homeTalkEnd" });
    expect(s.talksLeft).toBe(0);
    expect(gameReducer(s, { type: "homeTalkStart", mercId: "s-tob" })).toBe(s);
  });
});
