// 의뢰 (게시판·주점). 판정과 보상은 코드(game/quests.ts), 결과 보고 문장은 AI.
// 직접 의뢰: 파티가 던전에서 목표를 이루면 귀환할 때 완료. 보상은 두 가지 중 하나를 고른다 (승급 시험은 고정).
// 파견 의뢰: 클랜원만 보낸다 (플레이어는 안 간다). 며칠 뒤 코드가 성공·실패·부상·사망을 정한다. 보상은 고정.
// 기한은 받은 날부터 날짜(day)로 센다. 귀환할 때 확인하고, 넘기면 실패 + 명성 하락.
// 의뢰 문구(소개·의뢰인 대사)는 blurb에 기본 문장을 둔다. AI 생성은 보류 (2026-11-22):
// 나중에 붙일 때는 의뢰를 받는(수락하는) 시점에 한 번만 만들어 저장한다 (게시판에 붙을 때마다 만들지 않는다).
// 금화 소·중·대는 GOLD_S·M·L (원정 수입 기준 초안: 1층 귀환 약 150, 2층 약 430, 2026-11-21 시뮬레이션).
import type { MercLevel } from "@/lib/schemas";
import type { StageKey } from "./ranks";
import { FAME_L, FAME_M, FAME_S, type FameTier } from "./fame";

/** 금화 보상 소·중·대 */
export const GOLD_S = 40;
export const GOLD_M = 80;
export const GOLD_L = 150;

/** 보상 하나. 의뢰를 마치면 choices 중 하나를 고른다 */
export type QuestReward =
  | { type: "gold"; amount: number }
  /** 계열 재료·유실물 (창고로) */
  | { type: "material"; itemId: string; count: number }
  | { type: "shard"; count: number }
  /** 전술 교본: 의뢰 보상으로는 주(정산 주기)에 1개까지 */
  | { type: "tacticBook"; count: number }
  /** 종족 유물 (random이면 무작위): 의뢰 보상으로는 주에 1개까지 */
  | { type: "relic"; relicId: string | "random" }
  /** 물자 (원정 짐으로) */
  | { type: "consumable"; itemId: "potion" | "antidote" | "bandage"; count: number }
  /** 장신구 (중요 의뢰 전용, data/trinkets.ts의 의뢰 장신구) */
  | { type: "accessory"; accessoryId: string }
  /** 용병이 고용비 없이 합류 (동3, 직업 무작위) */
  | { type: "recruit"; mercTemplateId: string }
  /** 정보 (히든 단서 등, QUEST_INFO의 글) */
  | { type: "info"; infoId: string }
  /** 시설 이용료 할인 (days일 동안) */
  | { type: "discount"; facility: "forge"; days: number }
  /** 명성 */
  | { type: "fame"; amount: number };

/** 예전 보상 형식 (파견 의뢰): 금화 + 유실물, 명성 */
export type Reward = { gold: number; salvage?: Record<string, number>; fame?: number };

export type Objective =
  | { type: "killBoss"; monsterId: string }
  /** 이 보스들 중 아무나 하나 처치 (길드 승급 시험) */
  | { type: "killAnyBoss"; monsterIds: string[] }
  | { type: "killElite"; monsterId: string; count: number }
  /** 몬스터 count마리 처치 (등급 상관없이) */
  | { type: "killCount"; monsterId: string; count: number }
  /** 귀환할 때 창고에 있으면 낸다 (예전 수집 의뢰) */
  | { type: "collect"; itemId: string; count: number }
  /** 재료 납품: 게시판에서 창고의 재료를 내고 바로 마친다 */
  | { type: "deliver"; itemId: string; count: number }
  /** 지역 도달: goal이면 그 지역의 끝 칸(목적지)까지, 아니면 그 지역에 들어서기만 하면 */
  | { type: "reach"; regionId: string; goal: boolean }
  /** 조건부 보스 처치: 보스(넷 중 아무나) + 조건 (그 직업이 파티에 없이 / 그 전투에서 아무도 안 쓰러지고) */
  | { type: "killWithCondition"; monsterIds: string[]; noJob?: string; noDowned?: boolean }
  /** 구출: 의뢰를 받은 상태에서만 그 지역 사건 칸에 eventId 사건이 나온다. 구하면 완료 */
  | { type: "rescue"; eventId: string; regionId: string };

export type QuestKind = "hunt" | "collect" | "explore" | "challenge" | "rescue" | "dispatch" | "named" | "promotion";

export type Risk = "low" | "mid" | "high";

export type DirectQuest = {
  kind: Exclude<QuestKind, "dispatch">;
  id: string;
  title: string;
  /** 의뢰인 */
  client: string;
  /** 짧은 소개 (AI가 다시 쓸 수 있다) */
  blurb?: string;
  dungeonId: string;
  /** 권장 등급 (표시) */
  recommended?: StageKey;
  /** 게시판에 나올 조건 */
  requires?: { guildGrade?: MercLevel; fame?: FameTier; reached?: string[] };
  objective: Objective;
  /** 받은 날부터 이 날수 안에 마쳐야 한다. 없으면 기한 없음 */
  deadlineDays?: number;
  /** 고르는 보상 둘 (승급 시험은 fixed) */
  rewards: { choices?: [QuestReward, QuestReward]; fixed?: QuestReward[] };
  /** 중요 의뢰 (장신구 보상이 나올 수 있다) */
  important?: boolean;
  /** 길드 승급 시험: 마치면 이 등급으로 길드를 올릴 수 있다 (조건이 되면 게시판에 고정으로 붙는다) */
  exam?: MercLevel;
  /** 예전 칸 (쓰지 않으면 비운다) */
  grade?: MercLevel;
  appearAfter?: string;
};

export type DispatchQuest = {
  kind: "dispatch";
  id: string;
  title: string;
  client?: string;
  /** 걸리는 날 수 */
  days: number;
  /** 이 수치와 보낸 사람들의 힘을 비교한다 */
  difficulty: number;
  recommendedGrade: MercLevel;
  risk: Risk;
  reward: Reward;
  /** 이 성격이 있으면 다녀와서 호감 +, dislikedBy면 - */
  likedBy?: string[];
  dislikedBy?: string[];
  /** 보내는 인원 [최소, 최대] */
  size: readonly [number, number];
};

export type Quest = (DirectQuest & { kind: Exclude<QuestKind, "dispatch"> }) | DispatchQuest;

/** 의뢰를 마쳤을 때 오르는 명성: 일반 소 / 토벌·도전 중 / 지명·승급 대 */
export const FAME_BY_KIND: Record<QuestKind, number> = {
  collect: FAME_S,
  explore: FAME_S,
  rescue: FAME_S,
  dispatch: FAME_S,
  hunt: FAME_M,
  challenge: FAME_M,
  named: FAME_L,
  promotion: FAME_L,
};

/** 정보 보상의 글 (게시판 "알아낸 것"에 남는다) */
export const QUEST_INFO: Record<string, { title: string; text: string }> = {
  info_cave_paths: {
    title: "동굴 너머의 두 갈래",
    text: "미지의 동굴 끝에서 길이 둘로 갈린다. 한쪽은 늑대 울음이 끊이지 않는 늑대 굴, 다른 쪽은 거미줄이 천장을 뒤덮은 거미 둥지다.",
  },
  info_world_tree: {
    title: "거인과 세계수의 가지",
    text: "깊은 숲의 나무 거인은 세계수의 가지를 품고 있다고 한다. 그 가지를 지닌 채 더 깊은 숲에 들어서면, 숲이 숨겨 둔 길이 열린다는 시가 전해진다.",
  },
  info_orc_village: {
    title: "오크 마을의 북소리",
    text: "더 깊은 숲 너머에 오크 마을이 있다. 오크 킹을 쓰러뜨린 길드는 본부에서 한 등급 높이 쳐준다는 소문이 돈다.",
  },
};

const gold = (amount: number): QuestReward => ({ type: "gold", amount });
const THIRD_FLOOR_BOSSES = ["goblin_king", "slime_king", "spider_queen", "alpha_wolf"];

export const QUESTS: Quest[] = [
  // ── 미지의 숲 (2026-11-22, 23개) ──
  // 토벌
  { kind: "hunt", id: "q_rats", title: "숲 쥐 여섯 마리", client: "밀농가 할머니", blurb: "곳간을 갉아 먹는 쥐들 좀 잡아 주구려.", dungeonId: "unknown_forest", recommended: "bronze3", objective: { type: "killCount", monsterId: "forest_rat", count: 6 }, deadlineDays: 5, rewards: { choices: [gold(GOLD_S), { type: "shard", count: 2 }] } },
  { kind: "hunt", id: "q_giant_boar", title: "거대 숲 멧돼지", client: "사냥꾼 조합", blurb: "숲의 주인 노릇 하는 멧돼지 때문에 덫을 놓을 수가 없소.", dungeonId: "unknown_forest", recommended: "bronze3", objective: { type: "killBoss", monsterId: "giant_boar" }, deadlineDays: 10, rewards: { choices: [gold(GOLD_M), { type: "consumable", itemId: "potion", count: 2 }] } },
  { kind: "hunt", id: "q_hobgoblins", title: "홉고블린 세 마리", client: "마을 경비대", blurb: "고블린 마을의 홉고블린들이 순찰로까지 내려온다.", dungeonId: "unknown_forest", recommended: "bronze1", objective: { type: "killCount", monsterId: "hobgoblin", count: 3 }, deadlineDays: 7, rewards: { choices: [gold(GOLD_M), { type: "material", itemId: "mat_whetstone", count: 4 }] } },
  { kind: "hunt", id: "q_goblin_king", title: "고블린 킹 토벌", client: "마을 경비대", blurb: "고블린 킹만 없으면 저 무리는 흩어진다.", dungeonId: "unknown_forest", recommended: "bronze1", objective: { type: "killBoss", monsterId: "goblin_king" }, deadlineDays: 7, rewards: { choices: [gold(GOLD_L), { type: "tacticBook", count: 1 }] } },
  { kind: "hunt", id: "q_slime_king", title: "늪의 슬라임 킹", client: "약재상", blurb: "늪에서 약초를 캘 수가 없어요. 그 커다란 것 좀…", dungeonId: "unknown_forest", recommended: "bronze1", objective: { type: "killBoss", monsterId: "slime_king" }, deadlineDays: 7, rewards: { choices: [gold(GOLD_L), { type: "shard", count: 6 }] } },
  { kind: "hunt", id: "q_alpha_wolf", title: "늑대 굴의 우두머리", client: "사냥꾼 조합", blurb: "우두머리가 쓰러지면 늑대 떼도 흩어질 거요.", dungeonId: "unknown_forest", recommended: "bronze1", objective: { type: "killBoss", monsterId: "alpha_wolf" }, deadlineDays: 7, rewards: { choices: [gold(GOLD_L), { type: "relic", relicId: "relic_beastfang" }] } },
  { kind: "hunt", id: "q_spider_queen", title: "거미 여왕의 둥지", client: "약재상", blurb: "여왕의 독낭은 귀한 약재가 됩니다. 반지로 만들어 드리죠.", dungeonId: "unknown_forest", recommended: "bronze1", requires: { fame: "known" }, important: true, objective: { type: "killBoss", monsterId: "spider_queen" }, deadlineDays: 7, rewards: { choices: [{ type: "accessory", accessoryId: "t_queen_venom_ring" }, gold(GOLD_L)] } },
  // 납품
  { kind: "collect", id: "q_jelly", title: "슬라임 젤 납품", client: "약재상", blurb: "연고 만들 젤이 다 떨어졌어요.", dungeonId: "unknown_forest", recommended: "bronze3", objective: { type: "deliver", itemId: "mat_jelly", count: 5 }, deadlineDays: 7, rewards: { choices: [gold(GOLD_M), { type: "consumable", itemId: "antidote", count: 2 }] } },
  { kind: "collect", id: "q_venom", title: "거미 독샘 납품", client: "약재상", blurb: "해독제는 독으로 만드는 법이죠.", dungeonId: "unknown_forest", recommended: "bronze2", objective: { type: "deliver", itemId: "mat_venom", count: 4 }, deadlineDays: 7, rewards: { choices: [{ type: "consumable", itemId: "antidote", count: 3 }, { type: "material", itemId: "mat_sap", count: 2 }] } },
  { kind: "collect", id: "q_fangs", title: "늑대 송곳니 납품", client: "무기점", blurb: "송곳니로 화살촉을 깎으면 잘 박히지.", dungeonId: "unknown_forest", recommended: "bronze2", objective: { type: "deliver", itemId: "mat_fang", count: 4 }, deadlineDays: 7, rewards: { choices: [gold(GOLD_M), { type: "material", itemId: "mat_arrowhead", count: 2 }] } },
  { kind: "collect", id: "q_sap", title: "빛나는 수액 납품", client: "마을 치료소", blurb: "수액이 있으면 물약을 더 만들 수 있어요.", dungeonId: "unknown_forest", recommended: "bronze2", objective: { type: "deliver", itemId: "mat_sap", count: 3 }, deadlineDays: 7, rewards: { choices: [{ type: "consumable", itemId: "potion", count: 3 }, gold(GOLD_M)] } },
  // 탐사
  { kind: "explore", id: "q_map_cave", title: "미지의 동굴 지도", client: "지도 제작자", blurb: "동굴 끝까지 가서 길을 기억해 와 주게.", dungeonId: "unknown_forest", recommended: "bronze2", objective: { type: "reach", regionId: "uf_cave", goal: true }, deadlineDays: 7, rewards: { choices: [{ type: "info", infoId: "info_cave_paths" }, { type: "shard", count: 3 }] } },
  { kind: "explore", id: "q_deep_forest", title: "깊은 숲의 끝", client: "엘프 떠돌이 시인", blurb: "깊은 숲 끝의 풍경을 들려주면, 내가 아는 시를 하나 알려 주지.", dungeonId: "unknown_forest", recommended: "bronze2", objective: { type: "reach", regionId: "uf_deep_forest", goal: true }, deadlineDays: 7, rewards: { choices: [{ type: "info", infoId: "info_world_tree" }, { type: "shard", count: 3 }] } },
  { kind: "explore", id: "q_deeper_forest", title: "더 깊은 숲 정찰", client: "마을 경비대", blurb: "3층 더 깊은 숲에 무엇이 있는지 확인해 주시오.", dungeonId: "unknown_forest", recommended: "bronze1", objective: { type: "reach", regionId: "uf_deeper_forest", goal: false }, deadlineDays: 7, rewards: { choices: [{ type: "info", infoId: "info_orc_village" }, gold(GOLD_M)] } },
  // 도전
  { kind: "challenge", id: "q_no_priest", title: "사제 없이 슬라임 킹", client: "괴짜 연금술사", blurb: "기도 없이도 이길 수 있는지 보고 싶군.", dungeonId: "unknown_forest", recommended: "bronze1", requires: { fame: "known" }, objective: { type: "killWithCondition", monsterIds: ["slime_king"], noJob: "priest" }, deadlineDays: 10, rewards: { choices: [{ type: "relic", relicId: "random" }, gold(GOLD_L)] } },
  { kind: "challenge", id: "q_flawless", title: "아무도 쓰러지지 않고", client: "은퇴한 모험가", blurb: "3층 던전 보스를 누구 하나 쓰러지지 않고 잡아 보게.", dungeonId: "unknown_forest", recommended: "bronze1", requires: { fame: "known" }, objective: { type: "killWithCondition", monsterIds: THIRD_FLOOR_BOSSES, noDowned: true }, deadlineDays: 10, rewards: { choices: [{ type: "tacticBook", count: 1 }, { type: "fame", amount: FAME_L }] } },
  // 구출 (의뢰를 받았을 때만 그 지역 사건 칸에 나온다)
  { kind: "rescue", id: "q_lost_herbalist", title: "길 잃은 약초꾼", client: "약초꾼의 가족", blurb: "아버지가 깊은 숲에 약초를 캐러 갔다가 돌아오지 않아요.", dungeonId: "unknown_forest", recommended: "bronze2", objective: { type: "rescue", eventId: "rescue_herbalist", regionId: "uf_deep_forest" }, deadlineDays: 5, rewards: { choices: [{ type: "recruit", mercTemplateId: "bronze_any" }, gold(GOLD_M)] } },
  { kind: "rescue", id: "q_lost_apprentice", title: "대장간 견습생", client: "대장장이", blurb: "광석 캐러 동굴에 간 녀석이 안 돌아와.", dungeonId: "unknown_forest", recommended: "bronze2", objective: { type: "rescue", eventId: "rescue_apprentice", regionId: "uf_cave" }, deadlineDays: 5, rewards: { choices: [{ type: "discount", facility: "forge", days: 7 }, gold(GOLD_M)] } },
  // 지명 (명성 이름난부터)
  { kind: "named", id: "q_orc_captain", title: "지명: 오크 대장 처치", client: "상인 조합", blurb: "당신 길드를 콕 집어 부탁하오. 오크 대장이 상단을 노리고 있소.", dungeonId: "unknown_forest", recommended: "silver3", requires: { fame: "renowned" }, important: true, objective: { type: "killBoss", monsterId: "orc_captain" }, deadlineDays: 7, rewards: { choices: [{ type: "accessory", accessoryId: "t_guild_seal" }, gold(GOLD_L)] } },
  // 승급 시험: 동 → 은. 3층 던전 보스 넷 중 아무나 하나 (2026-11-22 결정). 길드가 동이면 늘 게시판에 붙는다. 기한·선택 없음
  { kind: "promotion", id: "q_exam_silver", title: "승급 시험: 3층 던전 보스 토벌", client: "길드 본부", blurb: "3층의 우두머리 하나를 쓰러뜨려 실력을 증명하라.", dungeonId: "unknown_forest", recommended: "bronze1", important: true, exam: "silver", objective: { type: "killAnyBoss", monsterIds: THIRD_FLOOR_BOSSES }, rewards: { fixed: [{ type: "accessory", accessoryId: "t_silver_crest" }] } },
  // 은 등급 길드부터
  { kind: "hunt", id: "q_orc_king", title: "오크 킹 토벌", client: "마을 경비대", blurb: "오크 마을의 북소리가 날마다 가까워진다. 은 등급 길드라면 맡길 수 있겠지.", dungeonId: "unknown_forest", recommended: "silver3", requires: { guildGrade: "silver" }, important: true, objective: { type: "killBoss", monsterId: "orc_king" }, deadlineDays: 7, rewards: { choices: [{ type: "accessory", accessoryId: "t_orc_tusk_necklace" }, gold(GOLD_L)] } },
  // ── 파견 의뢰 (보상 고정) ──
  { kind: "dispatch", id: "d_goblin_scouts", title: "고블린 정찰대 퇴치", client: "마을 경비대", days: 2, difficulty: 25, recommendedGrade: "bronze", risk: "low", reward: { gold: GOLD_S, salvage: { mat_whetstone: 2 } }, likedBy: ["honorable", "reckless"], dislikedBy: ["timid"], size: [1, 2] },
  { kind: "dispatch", id: "d_escort", title: "상단 호위", client: "상인", days: 3, difficulty: 45, recommendedGrade: "bronze", risk: "mid", reward: { gold: GOLD_M, fame: FAME_S }, likedBy: ["honorable", "kind"], dislikedBy: ["reckless"], size: [1, 2] },
  { kind: "dispatch", id: "d_herbs", title: "약초 채집 길잡이", days: 1, difficulty: 20, recommendedGrade: "bronze", risk: "low", reward: { gold: 20, salvage: { slime_jelly: 2 } }, likedBy: ["curious", "easygoing"], dislikedBy: ["proud"], size: [1, 1] },
  { kind: "dispatch", id: "d_bandits", title: "산적 소탕", days: 3, difficulty: 60, recommendedGrade: "silver", risk: "mid", reward: { gold: 80 }, likedBy: ["reckless", "proud"], dislikedBy: ["timid", "kind"], size: [2, 3] },
  { kind: "dispatch", id: "d_beast", title: "마을을 노리는 짐승", days: 2, difficulty: 45, recommendedGrade: "bronze", risk: "mid", reward: { gold: 50, salvage: { wolf_fang: 2 } }, likedBy: ["honorable"], dislikedBy: ["timid"], size: [1, 3] },
  { kind: "dispatch", id: "d_ruins", title: "무너진 탑 조사", days: 4, difficulty: 90, recommendedGrade: "silver", risk: "high", reward: { gold: 140 }, likedBy: ["curious", "reckless"], dislikedBy: ["paranoid", "timid"], size: [2, 3] },
  { kind: "dispatch", id: "d_festival", title: "축제 경비", days: 1, difficulty: 15, recommendedGrade: "bronze", risk: "low", reward: { gold: 15 }, likedBy: ["jovial", "drinker"], dislikedBy: ["cynical"], size: [1, 2] },
];

export function getQuest(id: string): Quest | undefined {
  return QUESTS.find((q) => q.id === id);
}

/** 게시판에 붙는 의뢰 수 (직접, 파견) */
export const BOARD_SIZE = { direct: 3, dispatch: 3 } as const;
/** 동시에 받아 둘 수 있는 직접 의뢰 수 (명성 단계별은 data/fame.ts의 QUEST_SLOTS. 이것은 가장 큰 값) */
export const MAX_ACTIVE_DIRECT = 4;

export const RISK_NAME: Record<Risk, string> = { low: "낮음", mid: "보통", high: "높음" };

/**
 * 파견 판정. 힘 = Σ(등급 점수 + 쌓인 스탯 합). ratio = 힘 / 난이도.
 * 성공 확률 = clamp(base + slope × (ratio - 1)), 사람마다 부상·사망 확률은 위험도에 따라, 힘이 모자랄수록 커진다
 */
export const DISPATCH = {
  rankPower: { bronze: 15, silver: 30, gold: 50, mithril: 75, diamond: 105, radiant: 140 } as Record<MercLevel, number>,
  success: { base: 0.6, slope: 0.5, min: 0.05, max: 0.95 },
  injury: { low: 0.1, mid: 0.2, high: 0.3 } as Record<Risk, number>,
  death: { low: 0.01, mid: 0.04, high: 0.1 } as Record<Risk, number>,
  /** 부상: 이만큼 더 쉬어야 한다 (일) */
  injuryDays: 3,
  /** 호감 변화 */
  affinity: { success: 5, failure: -3, allyDeath: -10, liked: 3, disliked: -3 },
} as const;
