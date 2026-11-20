// 직업: 종족×직업 가능 표, 전직 갈래와 단계별 이름, 조각 재료.
// 직업의 이름·설명·등장 가중치는 data/traits.ts(JOBS), 전투 능력은 data/combat.ts(JOB_STATS),
// 성장표와 기술 스탯은 data/growth.ts(GROWTH, JOB_STAT)에 있다.
import type { Gender, MercLevel } from "@/lib/schemas";
import { RANKS } from "./ranks";

export const JOB_IDS = ["knight", "guardian", "greatsword", "assassin", "monk", "archer", "priest", "mage", "minstrel"] as const;
export type JobId = (typeof JOB_IDS)[number];

export const RACE_IDS = ["human", "elf", "dwarf", "beastfolk", "barbarian"] as const;
export type RaceId = (typeof RACE_IDS)[number];

/** 종족 × 직업 가능 표 (33조합). 용병을 만들 때 이 표 밖의 조합은 나오지 않는다 */
export const RACE_JOBS: Record<RaceId, JobId[]> = {
  human: ["knight", "guardian", "greatsword", "assassin", "monk", "archer", "priest", "mage", "minstrel"],
  elf: ["knight", "assassin", "archer", "priest", "mage", "minstrel"],
  dwarf: ["knight", "guardian", "greatsword", "monk", "priest", "mage"],
  beastfolk: ["greatsword", "assassin", "monk", "archer", "priest", "minstrel"],
  barbarian: ["guardian", "greatsword", "monk", "archer", "priest", "minstrel"],
};

/** 이 종족이 이 직업을 가질 수 있나 */
export function canBe(race: string, job: string): boolean {
  return (RACE_JOBS[race as RaceId] as string[] | undefined)?.includes(job) ?? false;
}

/** 이름. 성별에 따라 다르면 둘 다 */
export type Title = string | { female: string; male: string };

/** 2차 전직 갈래. 3차 이름은 종족 공통, 4차 이름만 종족별 (정하지 않은 단계는 앞 단계 이름을 쓴다) */
export type Branch = {
  id: string;
  /** 2차 이름 */
  name: Title;
  /** 한 줄 성격 (승급 화면) */
  hint?: string;
  tier3?: Title;
  tier4?: Partial<Record<RaceId, Title>>;
  /** 원소술사: 고른 원소 2개를 한 스킬에 같이 낄 수 있다 */
  dualElement?: boolean;
};

export const BRANCHES: Record<JobId, [Branch, Branch]> = {
  knight: [
    { id: "saber", name: "세이버", tier3: "소드마스터", tier4: { human: "소드 세인트", dwarf: "룬 팔라딘", elf: "정령 기사" } },
    { id: "dark_saber", name: "다크 세이버", tier3: "데스나이트", tier4: { human: "데스 로드", dwarf: "혈룬 기사", elf: "그림자 기사" } },
  ],
  guardian: [
    { id: "rampart", name: "성벽 수호자", hint: "버티고 지킨다" },
    { id: "avenger", name: "응징자", hint: "맞은 만큼 돌려준다" },
  ],
  greatsword: [
    { id: "crusher", name: "파쇄자", hint: "한 놈을 확실히" },
    { id: "gale_blade", name: "검풍사", hint: "여럿을 한꺼번에" },
  ],
  assassin: [
    { id: "executioner", name: "처형자", hint: "숨통을 끊는다" },
    { id: "poisoner", name: "독술사", hint: "독으로 말린다" },
  ],
  monk: [
    { id: "iron_fist", name: "철권", hint: "강타와 기절" },
    { id: "flowing", name: "유수", hint: "회피와 반격" },
  ],
  archer: [
    { id: "sniper", name: "저격수", hint: "한 발에 꿰뚫는다" },
    { id: "hunter", name: "사냥꾼", hint: "몰고 쫓는다" },
  ],
  priest: [
    { id: "saint", name: { female: "성녀", male: "성자" }, hint: "회복" },
    { id: "chastiser", name: "징벌자", hint: "신성 공격" },
  ],
  mage: [
    { id: "elementalist", name: "원소술사", hint: "고른 원소 둘을 한 스킬에", dualElement: true },
    { id: "warlock", name: "흑마법사", hint: "어둠의 마법" },
  ],
  minstrel: [
    { id: "troubadour", name: "음유시인", hint: "아군을 북돋는다" },
    { id: "thrill_player", name: "전율의 악사", hint: "적을 흔든다" },
  ],
};

export function getBranch(job: string, branch: string | undefined): Branch | undefined {
  return branch ? BRANCHES[job as JobId]?.find((b) => b.id === branch) : undefined;
}

function pick(title: Title | undefined, gender: Gender | undefined): string | undefined {
  if (title === undefined || typeof title === "string") return title;
  return gender ? title[gender] : `${title.female}/${title.male}`;
}

/**
 * 지금 등급의 직업 이름. 1차는 기본 직업, 2차부터 갈래 이름, 정하지 않은 3·4차는 앞 단계 이름.
 * 부제 없이 이름 하나만 돌려준다
 */
export function jobTitle(m: { job: string; level: MercLevel; branch?: string; race?: string; gender?: Gender }, baseName: string): string {
  const tier = RANKS[m.level].tier;
  const b = getBranch(m.job, m.branch);
  if (tier < 2 || !b) return baseName;
  const t2 = pick(b.name, m.gender) ?? baseName;
  const t3 = pick(b.tier3, m.gender) ?? t2;
  if (tier === 2) return t2;
  if (tier === 3) return t3;
  return pick(b.tier4?.[m.race as RaceId], m.gender) ?? t3;
}

// ── 조각 재료 (전수관 해금·강화 비용에 쓴다. 미지의 숲에서 나는 유실물) ──

/** 직업 조각에 드는 유실물 */
export const JOB_MATERIAL: Record<JobId, string> = {
  knight: "crude_iron",
  guardian: "orc_tusk",
  greatsword: "wolf_fang",
  assassin: "venom_gland",
  monk: "soft_pelt",
  archer: "spider_silk",
  priest: "slime_core",
  mage: "shaman_feather",
  minstrel: "bat_wing",
};

/** 종족 조각에 드는 유실물 */
export const RACE_MATERIAL: Record<RaceId, string> = {
  human: "shiny_trinket",
  elf: "slime_jelly",
  dwarf: "crude_iron",
  beastfolk: "wolf_fang",
  barbarian: "orc_tusk",
};
