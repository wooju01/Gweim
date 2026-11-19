// 자동 저장. 브라우저(localStorage)에 한 칸만 두고, 상태가 바뀔 때마다 덮어쓴다 (되돌리기 없음).
// 저장 데이터는 Zod 스키마로 검사하고 버전 번호를 붙인다. 형식이 바뀌면 MIGRATIONS에 변환을 더한다.
// 대화 화면·AI 응답 대기처럼 잠깐 거치는 상태는 저장하지 않는다.
// 전투 중이면 전투 그대로 저장한다 (새로고침으로 도망칠 수 없게).
import { z } from "zod";
import { MercRef, TalkState } from "@/lib/schemas";
import { START_GOLD, START_PACK, START_STOCK } from "@/data/economy";
import { entryId, initialState, mercOf, type GameState } from "./state";

export const SAVE_KEY = "ashen-save";
/** 읽지 못한 저장을 지우기 전에 옮겨 두는 곳 (직접 살펴볼 수 있게) */
export const BROKEN_KEY = "ashen-save-broken";
export const SAVE_VERSION = 1;

/** 버전 n의 데이터를 n+1로 바꾸는 함수들. 형식을 바꿀 때 여기에 더한다 */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

const MercProgressSave = TalkState.extend({ hired: z.boolean(), wage: z.number().int().min(0).optional() });
const Supplies = z.object({ bandage: z.number().int().min(0), antidote: z.number().int().min(0), potion: z.number().int().min(0) });

// 탐험·전투는 엔진이 만든 큰 구조라 핵심 칸만 검사하고 나머지는 그대로 둔다
const ExpeditionSave = z.looseObject({
  map: z.looseObject({
    nodes: z.array(z.looseObject({ id: z.string(), next: z.array(z.string()) })),
    startId: z.string(),
    goalId: z.string(),
  }),
  at: z.string(),
  visited: z.array(z.string()),
  members: z.array(z.looseObject({ id: z.string(), hp: z.number(), maxHp: z.number(), down: z.boolean() })),
  supplies: z.looseObject({ bandage: z.number(), antidote: z.number(), potion: z.number() }),
  depth: z.number(),
});

const BattleSave = z.looseObject({
  round: z.number(),
  units: z.array(z.looseObject({ id: z.string(), side: z.enum(["merc", "enemy"]), hp: z.number(), maxHp: z.number() })),
  order: z.array(z.string()),
  turn: z.number(),
  rng: z.number(),
  log: z.array(z.unknown()),
});

const ScreenSave = z.discriminatedUnion("kind", [
  // 마을 안 화면은 모두 마을(홈)로 저장한다. "guild"는 마을이 생기기 전 저장
  z.object({ kind: z.literal("town") }),
  z.object({ kind: z.literal("guild") }),
  z.object({ kind: z.literal("dungeon") }),
  z.object({ kind: z.literal("battle"), battle: BattleSave }),
]);

export const SaveFile = z.object({
  version: z.literal(SAVE_VERSION),
  savedAt: z.string(),
  state: z.object({
    roster: z.array(MercRef),
    progress: z.record(z.string(), MercProgressSave),
    party: z.array(z.string()).max(4),
    screen: ScreenSave,
    expedition: ExpeditionSave.nullable(),
    notices: z.array(z.string()).default([]),
    renown: z.number().default(0),
    reputation: z.number().default(0),
    day: z.number().int().min(1).default(1),
    memorial: z
      .array(
        z.object({ id: z.string(), name: z.string(), title: z.string(), words: z.string().nullable(), depth: z.number(), day: z.number().optional() }),
      )
      .default([]),
    gold: z.number().int().min(0).default(START_GOLD),
    pack: Supplies.default({ ...START_PACK }),
    relics: z.array(z.string()).default([]),
    stock: Supplies.default({ ...START_STOCK }),
  }),
});
export type SaveFile = z.infer<typeof SaveFile>;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 게임 상태 → 저장 데이터. 잠깐 거치는 상태는 뺀다 */
export function toSave(state: GameState, now = new Date()): SaveFile {
  const screen =
    state.screen.kind === "battle"
      ? state.screen
      : state.screen.kind === "dungeon" && state.expedition
        ? state.screen
        : { kind: "town" as const };
  return {
    version: SAVE_VERSION,
    savedAt: now.toISOString(),
    state: {
      roster: state.roster,
      progress: state.progress,
      party: state.party,
      screen,
      expedition: state.expedition,
      notices: state.notices,
      renown: state.renown,
      reputation: state.reputation,
      day: state.day,
      memorial: state.memorial,
      gold: state.gold,
      pack: state.pack,
      relics: state.relics,
      stock: state.stock,
    } as SaveFile["state"],
  };
}

/** 저장 데이터 → 게임 상태. 읽을 수 없으면 null과 이유 */
export function fromSave(raw: unknown): { state: GameState } | { error: string } {
  let data = raw as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return { error: "저장 데이터가 비어 있다" };
  const version = typeof data.version === "number" ? data.version : 0;
  if (version > SAVE_VERSION) return { error: `더 새로운 버전(${version})의 저장이다` };
  for (let v = version; v < SAVE_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return { error: `버전 ${v} 저장은 읽을 수 없다` };
    data = { ...migrate(data), version: v + 1 };
  }

  const parsed = SaveFile.safeParse(data);
  if (!parsed.success) return { error: "저장 형식이 맞지 않는다" };
  const s = parsed.data.state;

  // 명단의 모든 용병이 실제로 만들어지는지(특성·스킬 규칙) 확인한다
  try {
    s.roster.forEach(mercOf);
  } catch {
    return { error: "저장된 용병 정보가 잘못됐다" };
  }
  const ids = new Set(s.roster.map(entryId));
  if (s.party.some((id) => !ids.has(id))) return { error: "파티에 명단에 없는 용병이 있다" };

  // 금화 기능 이전의 저장: 원정에 금화·유물 칸이 없으면 0으로
  const expedition = s.expedition
    ? ({ gold: 0, loot: [], ...s.expedition } as unknown as NonNullable<GameState["expedition"]>)
    : null;
  const room = expedition?.room;
  const base = initialState();
  return {
    state: {
      ...base,
      roster: s.roster,
      progress: s.progress,
      party: s.party,
      screen: (s.screen.kind === "guild" ? { kind: "town" } : s.screen) as GameState["screen"],
      day: s.day,
      expedition,
      notices: s.notices,
      renown: s.renown,
      reputation: s.reputation,
      // 마지막 말을 기다리다 끊겼으면 기본 문장 없이 비워 둔다
      memorial: s.memorial.map((f) => ({ ...f, words: f.words ?? "…" })),
      gold: s.gold,
      pack: s.pack,
      relics: s.relics,
      stock: s.stock,
      // 사건 칸에서 멈췄으면 AI 묘사 없이 기본 문장으로 이어 간다
      narration: room?.kind === "event" && !room.result ? { eventId: room.eventId, pending: false, data: null } : null,
    },
  };
}

/** 저장을 읽는다. 없으면 null. 읽지 못하면 옮겨 두고 지운 뒤 이유를 돌려준다 */
export function loadGame(store: Store): { state: GameState | null; error?: string } {
  let raw: string | null = null;
  try {
    raw = store.getItem(SAVE_KEY);
  } catch {
    return { state: null, error: "브라우저 저장소를 쓸 수 없다" };
  }
  if (!raw) return { state: null };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  const result = fromSave(json);
  if ("state" in result) return { state: result.state };
  try {
    store.setItem(BROKEN_KEY, raw);
    store.removeItem(SAVE_KEY);
  } catch {
    // 옮기지 못해도 게임은 새로 시작한다
  }
  return { state: null, error: result.error };
}

export function saveGame(store: Store, state: GameState): boolean {
  try {
    store.setItem(SAVE_KEY, JSON.stringify(toSave(state)));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(store: Store) {
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    // 지우지 못해도 새로 시작은 한다
  }
}
