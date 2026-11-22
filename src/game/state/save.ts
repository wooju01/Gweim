// 자동 저장. 브라우저(localStorage)에 한 칸만 두고, 상태가 바뀔 때마다 덮어쓴다 (되돌리기 없음).
// 저장 데이터는 Zod 스키마로 검사하고 버전 번호를 붙인다. 버전이 다르면 읽지 않고 새 게임으로 시작한다
// (형식이 크게 바뀔 때 변환하지 않고 초기화하기로 했다. 2026-11-20: 직업·등급·스킬 조각 개편 → 버전 3,
// 2026-11-21: 시간·클랜·의뢰 → 버전 4, 2026-11-22: 길드 등급·용병 승급 증명 → 버전 5, 게시판 개선(명성·기한·보상 선택)·시작 용병 8명 → 버전 6, 밸런스 1차(창고·중급 물약)는 기본값으로 읽어서 버전 6 그대로, 장신구 개편(직업 36종·생존 4종) → 버전 7).
// 대화 화면·AI 응답 대기처럼 잠깐 거치는 상태는 저장하지 않는다.
// 전투 중이면 전투 그대로 저장한다 (새로고침으로 도망칠 수 없게).
import { z } from "zod";
import { MercLevel, MercRef, SkillBuild, TalkState } from "@/lib/schemas";
import { START_GOLD, START_PACK, START_STOCK } from "@/data/economy";
import { entryId, initialState, mercOf, type GameState } from "./state";

export const SAVE_KEY = "ashen-save";
/** 읽지 못한 저장을 지우기 전에 옮겨 두는 곳 (직접 살펴볼 수 있게) */
export const BROKEN_KEY = "ashen-save-broken";
export const SAVE_VERSION = 7;

const MercProgressSave = TalkState.extend({
  hired: z.boolean(),
  wage: z.number().int().min(0).optional(),
  // 성장 (이전 저장에는 없다)
  xp: z.number().int().min(0).default(0),
  lv: z.number().int().min(0).default(0),
  stats: z.record(z.string(), z.number().int().min(0)).default({}),
  trainable: z.number().int().min(0).default(0),
  learned: z.array(SkillBuild).max(40).default([]),
  pieces: z.array(z.string().max(40)).default([]),
  levels: z.record(z.string().max(40), z.number().int().min(1).max(3)).default({}),
  // 장신구 두 칸 (예전 저장의 한 칸 trinket은 읽을 때 옮긴다)
  trinkets: z.array(z.object({ id: z.string().max(40), lv: z.number().int().min(1).max(3) })).max(2).default([]),
  trinket: z.object({ id: z.string().max(40), lv: z.number().int().min(1).max(3) }).optional(),
  kind: z.enum(["merc", "member"]).default("merc"),
  pledged: z.boolean().optional(),
  busyUntilDay: z.number().int().optional(),
  clanAskedDay: z.number().int().optional(),
  // 살아서 이긴 던전 보스 (승급 증명)
  bossWins: z.array(z.string().max(40)).max(40).default([]),
});
const Supplies = z.object({
  bandage: z.number().int().min(0),
  antidote: z.number().int().min(0),
  potion: z.number().int().min(0),
  greaterPotion: z.number().int().min(0).default(0),
});

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
  supplies: z.looseObject({ bandage: z.number(), antidote: z.number(), potion: z.number(), greaterPotion: z.number().default(0) }),
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
    fame: z.number().min(0).default(0),
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
    salvage: z.record(z.string(), z.number().int().min(0)).default({}),
    stock: Supplies.default({ ...START_STOCK }),
    trinkets: z.array(z.object({ id: z.string().max(40), lv: z.number().int().min(1).max(3) })).default([]),
    explored: z.array(z.string().max(40)).default([]),
    conquered: z.array(z.string().max(40)).default([]),
    keyItems: z.array(z.enum(["world_tree_branch", "blood_invitation"])).max(2).default([]),
    home: z.enum(["inn", "clanHall"]).default("inn"),
    lastSettlementDay: z.number().int().min(1).default(1),
    arrearsWeeks: z.number().int().min(0).default(0),
    clanDebt: z.number().int().min(0).default(0),
    talksLeft: z.number().int().min(0).default(2),
    board: z.array(z.string().max(40)).default([]),
    activeQuests: z.array(z.string().max(40)).default([]),
    dispatches: z.array(z.object({ questId: z.string().max(40), members: z.array(z.string()), endDay: z.number().int() })).default([]),
    dispatchLog: z
      .array(
        z.object({
          questId: z.string(),
          title: z.string(),
          day: z.number().int(),
          success: z.boolean(),
          members: z.array(z.object({ id: z.string(), name: z.string(), outcome: z.enum(["ok", "injured", "dead"]) })),
          lines: z.array(z.string()),
          story: z.string().nullable(),
        }),
      )
      .default([]),
    homeScene: z.object({ ids: z.tuple([z.string(), z.string()]), text: z.string().nullable(), day: z.number().int() }).nullable().default(null),
    guildGrade: MercLevel.default("bronze"),
    guildExams: z.array(MercLevel).default([]),
    questAccepted: z.record(z.string().max(40), z.number().int()).default({}),
    questsDone: z.array(z.string().max(40)).default([]),
    pendingRewards: z.array(z.string().max(40)).default([]),
    weeklyRewards: z.object({ book: z.boolean(), relic: z.boolean() }).default({ book: false, relic: false }),
    infos: z.array(z.string().max(40)).default([]),
    discounts: z.array(z.object({ facility: z.enum(["forge", "shop"]), untilDay: z.number().int() })).default([]),
    eventsSeen: z.array(z.string().max(40)).max(200).default([]),
    pendingJoins: z.number().int().min(0).max(5).default(0),
    bossesSlain: z.array(z.string().max(40)).default([]),
    storageLevel: z.number().int().min(0).default(0),
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
      fame: state.fame,
      reputation: state.reputation,
      day: state.day,
      memorial: state.memorial,
      gold: state.gold,
      pack: state.pack,
      relics: state.relics,
      salvage: state.salvage,
      stock: state.stock,
      trinkets: state.trinkets,
      explored: state.explored,
      conquered: state.conquered,
      keyItems: state.keyItems,
      home: state.home,
      lastSettlementDay: state.lastSettlementDay,
      arrearsWeeks: state.arrearsWeeks,
      clanDebt: state.clanDebt,
      talksLeft: state.talksLeft,
      board: state.board,
      activeQuests: state.activeQuests,
      dispatches: state.dispatches,
      dispatchLog: state.dispatchLog,
      homeScene: state.homeScene,
      guildGrade: state.guildGrade,
      guildExams: state.guildExams,
      questAccepted: state.questAccepted,
      questsDone: state.questsDone,
      pendingRewards: state.pendingRewards,
      weeklyRewards: state.weeklyRewards,
      infos: state.infos,
      discounts: state.discounts,
      pendingJoins: state.pendingJoins,
      bossesSlain: state.bossesSlain,
      storageLevel: state.storageLevel,
      eventsSeen: state.eventsSeen,
    } as SaveFile["state"],
  };
}

/** 저장 데이터 → 게임 상태. 읽을 수 없으면 null과 이유 */
export function fromSave(raw: unknown): { state: GameState } | { error: string } {
  const data = raw as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return { error: "저장 데이터가 비어 있다" };
  const version = typeof data.version === "number" ? data.version : 0;
  if (version > SAVE_VERSION) return { error: `더 새로운 버전(${version})의 저장이다` };
  if (version < SAVE_VERSION) return { error: `예전 버전(${version})의 저장이라 새 게임으로 시작한다` };

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
    ? ({ gold: 0, loot: [], salvage: {}, ...s.expedition } as unknown as NonNullable<GameState["expedition"]>)
    : null;
  const room = expedition?.room;
  const base = initialState();
  return {
    state: {
      ...base,
      roster: s.roster,
      // 예전 저장의 한 칸 장신구(trinket)는 두 칸 목록으로 옮긴다
      progress: Object.fromEntries(
        Object.entries(s.progress).map(([id, p]) => {
          const { trinket, ...rest } = p;
          return [id, { ...rest, trinkets: rest.trinkets.length ? rest.trinkets : trinket ? [trinket] : [] }];
        }),
      ),
      party: s.party,
      screen: (s.screen.kind === "guild" ? { kind: "town" } : s.screen) as GameState["screen"],
      day: s.day,
      expedition,
      notices: s.notices,
      fame: s.fame,
      reputation: s.reputation,
      // 마지막 말을 기다리다 끊겼으면 기본 문장 없이 비워 둔다
      memorial: s.memorial.map((f) => ({ ...f, words: f.words ?? "…" })),
      gold: s.gold,
      pack: s.pack,
      relics: s.relics,
      salvage: s.salvage,
      stock: s.stock,
      trinkets: s.trinkets,
      explored: s.explored,
      conquered: s.conquered,
      keyItems: s.keyItems,
      home: s.home,
      lastSettlementDay: s.lastSettlementDay,
      arrearsWeeks: s.arrearsWeeks,
      clanDebt: s.clanDebt,
      talksLeft: s.talksLeft,
      board: s.board,
      activeQuests: s.activeQuests,
      dispatches: s.dispatches,
      dispatchLog: s.dispatchLog,
      homeScene: s.homeScene,
      guildGrade: s.guildGrade,
      guildExams: s.guildExams,
      questAccepted: s.questAccepted,
      questsDone: s.questsDone,
      pendingRewards: s.pendingRewards,
      weeklyRewards: s.weeklyRewards,
      infos: s.infos,
      discounts: s.discounts,
      pendingJoins: s.pendingJoins,
      bossesSlain: s.bossesSlain,
      storageLevel: s.storageLevel,
      eventsSeen: s.eventsSeen,
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
