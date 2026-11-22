import { describe, expect, it } from "vitest";
import { BOARD_SIZE, QUESTS, QUEST_INFO, getQuest } from "@/data/quests";
import { getRegion } from "@/data/regions";
import { getEvent } from "@/data/events";
import { getTrinket } from "@/data/trinkets";
import { getMonster } from "@/data/monsters";
import { getSalvage } from "@/data/loot";
import { UPKEEP_PER_GRADE } from "@/data/clan";
import { clanJoinChance, dispatchChance, fixedQuests, isDirect, objectiveDone, objectiveProgress, questOverdue, resolveDispatch, rewardBlocked, rollBoard, settlementsDue, upkeepCost } from "./quests";

const member = (id: string, level: "bronze" | "silver" = "bronze", personalities: string[] = []) => ({ id, level, stats: {}, personalities });

describe("의뢰 데이터", () => {
  it("직접 의뢰 목표는 있는 몬스터·유실물을 가리키고, 파견 의뢰는 위험도·일수·인원이 있다", () => {
    for (const q of QUESTS) {
      if (q.kind !== "dispatch") {
        const o = q.objective;
        if (o.type === "collect" || o.type === "deliver") expect(getSalvage(o.itemId), q.id).toBeDefined();
        else if (o.type === "killAnyBoss" || o.type === "killWithCondition") for (const id of o.monsterIds) expect(getMonster(id), q.id).toBeDefined();
        else if (o.type === "reach" || o.type === "rescue") expect(getRegion(o.regionId), q.id).toBeDefined();
        else expect(getMonster(o.monsterId), q.id).toBeDefined();
        if (o.type === "rescue") expect(getEvent(o.eventId)?.quest, q.id).toBe(true);
        // 보상이 가리키는 것이 모두 있다. 승급 시험만 고정 보상, 나머지는 둘 중 하나
        const rewards = [...(q.rewards.choices ?? []), ...(q.rewards.fixed ?? [])];
        expect(q.exam ? !!q.rewards.fixed : q.rewards.choices?.length === 2, q.id).toBe(true);
        for (const r of rewards) {
          if (r.type === "material") expect(getSalvage(r.itemId), q.id).toBeDefined();
          if (r.type === "accessory") expect(getTrinket(r.accessoryId)?.quest, q.id).toBe(true);
          if (r.type === "info") expect(QUEST_INFO[r.infoId], q.id).toBeDefined();
          if (r.type === "relic" && r.relicId !== "random") expect(getSalvage(r.relicId)?.kind, q.id).toBe("raceRelic");
          // 장신구는 중요 의뢰 전용
          if (r.type === "accessory") expect(q.important, q.id).toBe(true);
        }
      } else {
        expect(q.days).toBeGreaterThan(0);
        expect(q.size[0]).toBeLessThanOrEqual(q.size[1]);
      }
    }
  });
});

describe("게시판", () => {
  it("종류별로 정해진 수만큼, 받아 둔 의뢰는 빼고, 같은 시드면 같다", () => {
    const board = rollBoard(5);
    expect(board.filter((id) => isDirect(getQuest(id)))).toHaveLength(BOARD_SIZE.direct);
    expect(board.filter((id) => getQuest(id)!.kind === "dispatch")).toHaveLength(BOARD_SIZE.dispatch);
    expect(rollBoard(5)).toEqual(board);
    expect(rollBoard(5, [board[0]])).not.toContain(board[0]);
  });
});

describe("직접 의뢰 목표", () => {
  it("보스 처치·정예 처치·수집", () => {
    const t = { kills: { goblin_king: 1 }, eliteKills: { owlbear: 1 }, salvage: { slime_jelly: 3 } };
    expect(objectiveDone({ type: "killBoss", monsterId: "goblin_king" }, t)).toBe(true);
    expect(objectiveDone({ type: "killBoss", monsterId: "slime_king" }, t)).toBe(false);
    expect(objectiveDone({ type: "killElite", monsterId: "owlbear", count: 1 }, t)).toBe(true);
    expect(objectiveProgress({ type: "collect", itemId: "slime_jelly", count: 5 }, t)).toEqual([3, 5]);
  });
});

describe("파견 판정", () => {
  const q = getQuest("d_bandits");
  if (q?.kind !== "dispatch") throw new Error();

  it("강한 사람을 보낼수록 성공 확률이 오른다", () => {
    expect(dispatchChance(q, [member("a"), member("b")])).toBeLessThan(dispatchChance(q, [member("a", "silver"), member("b", "silver")]));
  });

  it("결과: 성공·실패, 사람마다 무사·부상·사망. 같은 시드면 같다. 죽은 사람은 호감 변화가 없다", () => {
    let success = 0;
    let dead = 0;
    for (let seed = 0; seed < 500; seed++) {
      const r = resolveDispatch("d_bandits", [member("a"), member("b")], seed)!;
      expect(resolveDispatch("d_bandits", [member("a"), member("b")], seed)).toEqual(r);
      if (r.success) success++;
      for (const m of r.members) {
        if (m.outcome === "dead") {
          dead++;
          expect(r.affinity[m.id]).toBeUndefined();
        }
      }
    }
    expect(success).toBeGreaterThan(0);
    expect(success).toBeLessThan(500);
    expect(dead).toBeGreaterThan(0);
  });

  it("좋아하는 의뢰면 호감이 더 오르고, 싫어하는 의뢰면 덜 오른다", () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = resolveDispatch("d_bandits", [member("a", "silver", ["reckless"]), member("b", "silver", ["timid"])], seed)!;
      if (r.members.some((m) => m.outcome === "dead")) continue;
      expect(r.affinity.a - r.affinity.b).toBe(6);
    }
  });

  it("직접 의뢰나 없는 의뢰는 판정하지 않는다", () => {
    expect(resolveDispatch("q_goblin_king", [member("a")], 1)).toBeNull();
    expect(resolveDispatch("d_bandits", [], 1)).toBeNull();
  });
});

describe("클랜", () => {
  it("가입 수락 확률: 신뢰 미만이면 0, 호감이 높을수록·성격에 따라 달라진다", () => {
    expect(clanJoinChance(70, [])).toBe(0);
    expect(clanJoinChance(75, [])).toBe(0.5);
    expect(clanJoinChance(100, [])).toBe(1);
    expect(clanJoinChance(75, ["honorable"])).toBeGreaterThan(clanJoinChance(75, ["paranoid"]));
    expect(clanJoinChance(80, [], "wanderer")).toBeLessThan(clanJoinChance(80, []));
  });

  it("유지비와 정산 횟수", () => {
    expect(upkeepCost("inn", ["bronze", "silver"])).toBe(0);
    // 클랜원 수 × 등급별 금액 (동 10, 은 20, 금 35 …)
    expect(upkeepCost("clanHall", ["bronze", "bronze", "silver"])).toBe(10 + 10 + 20);
    expect(UPKEEP_PER_GRADE).toEqual({ bronze: 10, silver: 20, gold: 35, mithril: 55, diamond: 80, radiant: 110 });
    expect(settlementsDue(1, 7)).toBe(0);
    expect(settlementsDue(1, 8)).toBe(1);
    expect(settlementsDue(1, 16)).toBe(2);
  });
});

describe("게시판 개선", () => {
  it("조건부 목표: 사제 없이 / 아무도 쓰러지지 않고", () => {
    const base = { kills: {}, eliteKills: {}, salvage: {} };
    const noPriest = { type: "killWithCondition" as const, monsterIds: ["slime_king"], noJob: "priest" };
    expect(objectiveDone(noPriest, { ...base, feats: [{ monsterId: "slime_king", jobs: ["knight", "priest"], downed: false }] })).toBe(false);
    expect(objectiveDone(noPriest, { ...base, feats: [{ monsterId: "slime_king", jobs: ["knight", "mage"], downed: true }] })).toBe(true);
    const flawless = { type: "killWithCondition" as const, monsterIds: ["goblin_king", "alpha_wolf"], noDowned: true };
    expect(objectiveDone(flawless, { ...base, feats: [{ monsterId: "goblin_king", jobs: [], downed: true }] })).toBe(false);
    expect(objectiveDone(flawless, { ...base, feats: [{ monsterId: "alpha_wolf", jobs: [], downed: false }] })).toBe(true);
  });

  it("도달·구출·마릿수 목표", () => {
    const t = { kills: { forest_rat: 6 }, eliteKills: {}, salvage: {}, regions: ["uf_forest", "uf_deeper_forest"], goals: ["uf_cave"], rescued: ["rescue_herbalist"] };
    expect(objectiveDone({ type: "reach", regionId: "uf_cave", goal: true }, t)).toBe(true);
    expect(objectiveDone({ type: "reach", regionId: "uf_deeper_forest", goal: true }, t)).toBe(false);
    expect(objectiveDone({ type: "reach", regionId: "uf_deeper_forest", goal: false }, t)).toBe(true);
    expect(objectiveDone({ type: "rescue", eventId: "rescue_herbalist", regionId: "uf_deep_forest" }, t)).toBe(true);
    expect(objectiveDone({ type: "killCount", monsterId: "forest_rat", count: 6 }, t)).toBe(true);
  });

  it("기한: 받은 날 + 기한을 넘기면 초과", () => {
    const q = getQuest("q_rats")!; // 기한 5일
    expect(questOverdue(q, 1, 6)).toBe(false);
    expect(questOverdue(q, 1, 7)).toBe(true);
    expect(questOverdue(getQuest("q_exam_silver")!, 1, 99)).toBe(false);
  });

  it("주간 제한: 전술 교본·종족 유물은 이번 주에 받았으면 고를 수 없다", () => {
    expect(rewardBlocked({ type: "tacticBook", count: 1 }, { book: true, relic: false })).toBeTruthy();
    expect(rewardBlocked({ type: "relic", relicId: "random" }, { book: false, relic: true })).toBeTruthy();
    expect(rewardBlocked({ type: "gold", amount: 10 }, { book: true, relic: true })).toBeNull();
  });

  it("명성 조건: 도전·지명 의뢰는 명성이 모자라면 붙지 않고, 지명 의뢰는 이름난부터 고정으로 붙는다", () => {
    const ids = new Set(Array.from({ length: 60 }, (_, seed) => rollBoard(seed, [], { guildGrade: "bronze", fame: 0, explored: [] })).flat());
    expect(ids.has("q_no_priest")).toBe(false);
    expect(ids.has("q_spider_queen")).toBe(false);
    expect(fixedQuests({ guildGrade: "bronze", fame: 0, explored: [] }, [], [], [])).not.toContain("q_orc_captain");
    expect(fixedQuests({ guildGrade: "bronze", fame: 60, explored: [] }, [], [], [])).toContain("q_orc_captain");
    expect(fixedQuests({ guildGrade: "bronze", fame: 60, explored: [] }, [], [], ["q_orc_captain"])).not.toContain("q_orc_captain");
  });
});
