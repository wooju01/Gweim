// 의뢰 (게시판·주점). 판정은 코드(game/quests.ts), 결과 보고 문장은 AI.
// 직접 의뢰: 파티가 던전에서 목표를 이루면 귀환할 때 보상.
// 파견 의뢰: 클랜원만 보낸다 (플레이어는 안 간다). 며칠 뒤 코드가 성공·실패·부상·사망을 정한다.
// 금액·일수·확률은 초안이다.
import type { MercLevel } from "@/lib/schemas";

export type Reward = { gold: number; salvage?: Record<string, number> };

export type Objective =
  | { type: "killBoss"; monsterId: string }
  | { type: "killElite"; monsterId: string; count: number }
  | { type: "collect"; itemId: string; count: number };

export type Risk = "low" | "mid" | "high";

export type Quest =
  | { kind: "direct"; id: string; title: string; dungeonId: string; objective: Objective; reward: Reward }
  | {
      kind: "dispatch";
      id: string;
      title: string;
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

export const QUESTS: Quest[] = [
  // ── 직접 의뢰 (미지의 숲) ──
  { kind: "direct", id: "q_goblin_king", title: "고블린 킹 토벌", dungeonId: "unknown_forest", objective: { type: "killBoss", monsterId: "goblin_king" }, reward: { gold: 60 } },
  { kind: "direct", id: "q_slime_king", title: "늪의 슬라임 킹", dungeonId: "unknown_forest", objective: { type: "killBoss", monsterId: "slime_king" }, reward: { gold: 60 } },
  { kind: "direct", id: "q_spider_queen", title: "거미 여왕의 둥지", dungeonId: "unknown_forest", objective: { type: "killBoss", monsterId: "spider_queen" }, reward: { gold: 70 } },
  { kind: "direct", id: "q_alpha_wolf", title: "늑대 굴의 우두머리", dungeonId: "unknown_forest", objective: { type: "killBoss", monsterId: "alpha_wolf" }, reward: { gold: 60 } },
  { kind: "direct", id: "q_tree_giant", title: "움직이는 거목", dungeonId: "unknown_forest", objective: { type: "killBoss", monsterId: "tree_giant" }, reward: { gold: 45 } },
  { kind: "direct", id: "q_owlbear", title: "오울베어 사냥", dungeonId: "unknown_forest", objective: { type: "killElite", monsterId: "owlbear", count: 1 }, reward: { gold: 40 } },
  { kind: "direct", id: "q_golden_rat", title: "황금 쥐를 잡아라", dungeonId: "unknown_forest", objective: { type: "killElite", monsterId: "golden_rat", count: 1 }, reward: { gold: 30 } },
  { kind: "direct", id: "q_jelly", title: "약재상의 젤리 주문", dungeonId: "unknown_forest", objective: { type: "collect", itemId: "slime_jelly", count: 5 }, reward: { gold: 25 } },
  { kind: "direct", id: "q_wolf_fang", title: "송곳니 수집", dungeonId: "unknown_forest", objective: { type: "collect", itemId: "wolf_fang", count: 4 }, reward: { gold: 30 } },
  { kind: "direct", id: "q_silk", title: "재봉사의 거미줄", dungeonId: "unknown_forest", objective: { type: "collect", itemId: "spider_silk", count: 4 }, reward: { gold: 25 } },

  // ── 파견 의뢰 ──
  { kind: "dispatch", id: "d_escort", title: "상단 호위", days: 2, difficulty: 30, recommendedGrade: "bronze", risk: "low", reward: { gold: 35 }, likedBy: ["honorable", "kind"], dislikedBy: ["reckless"], size: [1, 2] },
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
/** 동시에 받아 둘 수 있는 직접 의뢰 수 */
export const MAX_ACTIVE_DIRECT = 3;

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
