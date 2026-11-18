import { describe, expect, it } from "vitest";
import { BROKEN_KEY, SAVE_KEY, SAVE_VERSION, fromSave, loadGame, saveGame, toSave } from "./save";
import { gameReducer, initialState, type GameState } from "./state";

/** 테스트용 저장소 (localStorage 대신) */
function memoryStore(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const booted = (s: GameState) => gameReducer(s, { type: "load", state: s });

/** 샘플 용병 넷을 데리고 던전에 들어간 상태 */
function inDungeon(seed = 3): GameState {
  let s = booted(initialState());
  const ids = ["s-bran", "s-durgan", "s-mirel", "s-tob"];
  s = { ...s, party: ids, progress: { ...s.progress, ...Object.fromEntries(ids.map((id) => [id, { ...s.progress[id], hired: true }])) } };
  return gameReducer(s, { type: "enterDungeon", seed });
}

describe("저장", () => {
  it("저장했다가 불러오면 명단·호감·파티·탐험이 그대로다", () => {
    const store = memoryStore();
    const s = inDungeon();
    expect(saveGame(store, s)).toBe(true);
    const { state } = loadGame(store);
    expect(state).not.toBeNull();
    expect(state!.roster).toEqual(s.roster);
    expect(state!.progress).toEqual(s.progress);
    expect(state!.party).toEqual(s.party);
    expect(state!.expedition).toEqual(s.expedition);
    expect(state!.screen.kind).toBe("dungeon");
  });

  it("전투 중이면 전투 그대로 돌아온다 (새로고침으로 도망칠 수 없다)", () => {
    // 입구 바로 다음에 전투 칸이 있는 맵을 찾는다
    let s = inDungeon();
    let battleId: string | undefined;
    for (let seed = 0; !battleId; seed++) {
      s = inDungeon(seed);
      const exp = s.expedition!;
      const start = exp.map.nodes.find((x) => x.id === exp.at)!;
      battleId = exp.map.nodes.find((n) => n.kind === "battle" && start.next.includes(n.id))?.id;
    }
    s = gameReducer(s, { type: "move", nodeId: battleId, seed: 9 });
    expect(s.screen.kind).toBe("battle");
    const store = memoryStore();
    saveGame(store, s);
    const loaded = loadGame(store).state!;
    expect(loaded.screen).toEqual(s.screen);
  });

  it("대화 화면·대기 상태는 저장하지 않고 길드로 돌아온다", () => {
    let s = booted(initialState());
    s = gameReducer(s, { type: "enterTalk", mercId: "s-bran" });
    expect(toSave(s).state.screen).toEqual({ kind: "guild" });
    const { state } = fromSave(JSON.parse(JSON.stringify(toSave({ ...s, recruit: { pending: true, error: null } })))) as { state: GameState };
    expect(state.recruit.pending).toBe(false);
    expect(state.screen.kind).toBe("guild");
  });

  it("명성·평판 자리가 있고 저장된다", () => {
    const s = { ...booted(initialState()), renown: 3, reputation: -2 };
    const back = fromSave(JSON.parse(JSON.stringify(toSave(s)))) as { state: GameState };
    expect(back.state).toMatchObject({ renown: 3, reputation: -2 });
  });

  it("읽지 못하는 저장은 따로 옮겨 두고 지운 뒤 이유를 알린다", () => {
    const store = memoryStore({ [SAVE_KEY]: "{이건 JSON이 아니다" });
    const result = loadGame(store);
    expect(result.state).toBeNull();
    expect(result.error).toBeTruthy();
    expect(store.data.get(BROKEN_KEY)).toBe("{이건 JSON이 아니다");
    expect(store.data.has(SAVE_KEY)).toBe(false);
  });

  it("규칙을 어긴 용병, 명단에 없는 파티원, 더 새로운 버전은 거부한다", () => {
    const good = JSON.parse(JSON.stringify(toSave(booted(initialState()))));
    const badMerc = structuredClone(good);
    badMerc.state.roster[0].seed.traits.job = "dragon";
    expect("error" in fromSave(badMerc)).toBe(true);

    const ghost = structuredClone(good);
    ghost.state.party = ["nobody"];
    expect("error" in fromSave(ghost)).toBe(true);

    expect(fromSave({ ...good, version: SAVE_VERSION + 1 })).toEqual({ error: `더 새로운 버전(${SAVE_VERSION + 1})의 저장이다` });
  });

  it("저장이 없으면 null (처음 시작)", () => {
    expect(loadGame(memoryStore())).toEqual({ state: null });
  });
});
