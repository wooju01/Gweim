import { describe, expect, it } from "vitest";
import { BOARD_SIZE, QUESTS, getQuest } from "@/data/quests";
import { getMonster } from "@/data/monsters";
import { getSalvage } from "@/data/loot";
import { UPKEEP } from "@/data/clan";
import { clanJoinChance, dispatchChance, objectiveDone, objectiveProgress, resolveDispatch, rollBoard, settlementsDue, upkeepCost } from "./quests";

const member = (id: string, level: "bronze" | "silver" = "bronze", personalities: string[] = []) => ({ id, level, stats: {}, personalities });

describe("의뢰 데이터", () => {
  it("직접 의뢰 목표는 있는 몬스터·유실물을 가리키고, 파견 의뢰는 위험도·일수·인원이 있다", () => {
    for (const q of QUESTS) {
      if (q.kind === "direct") {
        const o = q.objective;
        if (o.type === "collect") expect(getSalvage(o.itemId), q.id).toBeDefined();
        else if (o.type === "killAnyBoss") for (const id of o.monsterIds) expect(getMonster(id), q.id).toBeDefined();
        else expect(getMonster(o.monsterId), q.id).toBeDefined();
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
    expect(board.filter((id) => getQuest(id)!.kind === "direct")).toHaveLength(BOARD_SIZE.direct);
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
    expect(upkeepCost("inn", 5)).toBe(0);
    expect(upkeepCost("clanHall", 5)).toBe(UPKEEP.clanHall.base + 5 * UPKEEP.clanHall.perMember);
    expect(settlementsDue(1, 7)).toBe(0);
    expect(settlementsDue(1, 8)).toBe(1);
    expect(settlementsDue(1, 16)).toBe(2);
  });
});
