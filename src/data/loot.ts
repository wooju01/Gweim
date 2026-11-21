// 유실물: 쓰러뜨린 적에게서 떨어지는 것. 상점에 팔거나 대장간·전수관 재료로 쓴다. 던전마다 재료가 다르다.
// (유물은 사건·보물 칸에서만 나온다. data/relics.ts)
import type { Rng } from "@/game/random";

/**
 * 전리품 종류. loot(유실물)만 상점에 판다. 나머지는 전수관 재료 (data/drops.ts가 떨어뜨린다)
 * shard 기술 파편 / book 전술 교본 / material 계열 재료 / raceRelic 종족 유물 / bossToken 보스 증표
 */
export type ItemKind = "loot" | "shard" | "book" | "material" | "raceRelic" | "bossToken";

export type Salvage = {
  id: string;
  name: string;
  description: string;
  /** 상점에 팔 때 받는 금화 (유실물만 판다) */
  value: number;
  /** 없으면 유실물 */
  kind?: ItemKind;
};

export const kindOf = (s: Salvage): ItemKind => s.kind ?? "loot";
/** 상점에 팔 수 있나 (유실물만) */
export const sellable = (id: string): boolean => {
  const s = getSalvage(id);
  return !!s && kindOf(s) === "loot";
};

export const SALVAGE: Salvage[] = [
  // ── 전수관 재료 (팔지 않는다) ──
  { id: "tech_shard", kind: "shard", name: "기술 파편", description: "싸움의 요령이 깃든 작은 조각. 부 조각을 익히고 다듬는 데 쓴다.", value: 0 },
  { id: "tactic_book", kind: "book", name: "전술 교본", description: "손때 묻은 전술서. 은 등급 메인 조각과 종족 메인 조각을 익히는 데 쓴다.", value: 0 },
  { id: "boss_token", kind: "bossToken", name: "보스 증표", description: "던전의 주인을 쓰러뜨린 증거. 부 조각을 끝까지 다듬는 데 쓴다.", value: 0 },
  { id: "mat_whetstone", kind: "material", name: "고블린 숫돌", description: "고블린이 날을 세우던 숫돌. 치명·위력 계열 조각의 재료.", value: 0 },
  { id: "mat_jelly", kind: "material", name: "슬라임 젤", description: "끈적하게 늘어나는 젤. 둔화·회피 계열 조각의 재료.", value: 0 },
  { id: "mat_fang", kind: "material", name: "늑대 송곳니", description: "피 냄새가 밴 송곳니. 출혈 계열 조각의 재료.", value: 0 },
  { id: "mat_venom", kind: "material", name: "거미 독샘", description: "독이 고인 주머니. 독 계열 조각의 재료.", value: 0 },
  { id: "mat_arrowhead", kind: "material", name: "단단한 화살촉", description: "벼려 둔 화살촉. 고정 피해 계열 조각의 재료.", value: 0 },
  { id: "mat_sap", kind: "material", name: "빛나는 수액", description: "어둠 속에서 은은하게 빛나는 수액. 회복·보호 계열 조각의 재료.", value: 0 },
  { id: "mat_mace", kind: "material", name: "오크 철퇴 조각", description: "부서진 철퇴의 머리. 기절·방어 감소 계열 조각의 재료.", value: 0 },
  { id: "relic_crest", kind: "raceRelic", name: "빛바랜 기사 문장", description: "옛 기사단의 문장. 인간 전용 조각의 재료.", value: 0 },
  { id: "relic_spirit", kind: "raceRelic", name: "정령석", description: "정령이 깃든 돌. 엘프 전용 조각의 재료.", value: 0 },
  { id: "relic_rune", kind: "raceRelic", name: "룬석", description: "룬이 새겨진 돌. 드워프 전용 조각의 재료.", value: 0 },
  { id: "relic_beastfang", kind: "raceRelic", name: "맹수의 송곳니", description: "무리의 우두머리가 지니던 송곳니. 수인 전용 조각의 재료.", value: 0 },
  { id: "relic_totem", kind: "raceRelic", name: "조상의 뼈 토템", description: "뼈를 깎아 만든 토템. 바바리안 전용 조각의 재료.", value: 0 },

  // ── 미지의 숲 유실물 ──
  { id: "soft_pelt", name: "부드러운 털가죽", description: "숲 짐승의 보드라운 털가죽. 덧대기 좋다.", value: 3 },
  { id: "slime_jelly", name: "슬라임 젤리", description: "말랑하고 차가운 젤리. 약재상이 반긴다.", value: 2 },
  { id: "crude_iron", name: "조잡한 쇠붙이", description: "고블린이 두들겨 만든 쇳조각. 녹이면 쓸 만하다.", value: 3 },
  { id: "spider_silk", name: "거미줄 실타래", description: "질기고 가벼운 실. 재봉사들이 탐낸다.", value: 3 },
  { id: "bat_wing", name: "박쥐 날개막", description: "얇고 질긴 막. 바람을 잘 탄다.", value: 3 },
  // 계열 재료 "늑대 송곳니"(mat_fang)와 헷갈리지 않게 이름을 바꿨다 (id는 저장 호환으로 그대로)
  { id: "wolf_fang", name: "부러진 늑대 이빨", description: "끝이 부러진 이빨. 사냥꾼들이 목걸이로 꿴다.", value: 4 },
  { id: "shiny_trinket", name: "고블린의 반짝이", description: "고블린이 모아 둔 반짝이는 잡동사니. 가끔 진짜 보석이 섞여 있다.", value: 6 },
  { id: "slime_core", name: "슬라임 핵", description: "슬라임 한가운데 있던 투명한 구슬. 손에 쥐면 말랑하게 떨린다.", value: 8 },
  // 계열 재료 "거미 독샘"(mat_venom)과 헷갈리지 않게
  { id: "venom_gland", name: "독 주머니", description: "독거미나 독 슬라임에게서 나온 주머니. 약재상이 해독제를 만든다.", value: 6 },
  { id: "orc_tusk", name: "오크 엄니", description: "굵고 묵직한 엄니. 오크 전사의 훈장이다.", value: 7 },
  { id: "shaman_feather", name: "주술 깃털", description: "주술사가 지니던 알록달록한 깃털. 희미한 힘이 남아 있다.", value: 6 },
  { id: "chief_token", name: "우두머리의 증표", description: "무리의 우두머리가 지니던 장식. 길드에서 무용담의 증거로 쳐준다.", value: 15 },
  // 계열 재료 "빛나는 수액"(mat_sap)과 헷갈리지 않게
  { id: "glowing_sap", name: "굳은 수액 덩어리", description: "나무 거인의 상처에서 흘러나와 굳은 수액. 향료상이 사 간다.", value: 10 },
  { id: "withered_petal", name: "시든 꽃잎", description: "타락한 숲에서 주운 검은 꽃잎. 손에 쥐면 서늘하다.", value: 6 },
  { id: "rat_hide", name: "쥐 가죽", description: "작고 얇은 가죽. 헝겊 대신 덧대 쓴다.", value: 2 },
  { id: "boar_hide", name: "멧돼지 가죽", description: "뻣뻣한 털이 박힌 두꺼운 가죽.", value: 4 },
  { id: "boar_tusk", name: "멧돼지 엄니", description: "누렇게 휜 엄니. 손잡이 장식으로 쓴다.", value: 8 },
  { id: "big_bat_wing", name: "큰 박쥐 날개", description: "펼치면 사람 키만 한 날개막.", value: 10 },
  { id: "crystal_chip", name: "수정 조각", description: "거미 등딱지에서 떨어진 수정. 빛에 비추면 무지갯빛이 돈다.", value: 9 },
  { id: "powder_pouch", name: "화약 주머니", description: "터지지 않은 고블린 화약. 조심해서 팔아야 한다.", value: 5 },
  { id: "feather_hide", name: "깃털 가죽", description: "오울베어의 깃털이 붙은 가죽. 따뜻하고 가볍다.", value: 12 },
  { id: "war_drum", name: "전투 북", description: "오크 군악병의 북. 아직 둥둥 울린다.", value: 10 },
  // ── 다음 던전용 (기존 적 5종) ──
  { id: "rat_fang", name: "쥐 이빨", description: "누렇게 변한 앞니. 갈아서 쓰는 사람이 있다.", value: 2 },
  { id: "ash_hide", name: "잿빛 가죽", description: "털이 빠진 질긴 가죽. 덧대기 좋다.", value: 4 },
  { id: "rotten_bone", name: "오래된 뼈", description: "누구의 것인지 모를 오래된 뼈. 불에 넣으면 이상한 연기가 난다.", value: 2 },
  { id: "wretch_nail", name: "검은 손톱", description: "독이 밴 검은 손톱. 약재상이 해독제 재료로 사 간다.", value: 5 },
  { id: "rust_plate", name: "녹슨 갑옷 조각", description: "녹을 벗기면 아직 쓸 만한 쇠다.", value: 6 },
  { id: "warden_crest", name: "파수병 문장", description: "옛 왕국 파수병의 가슴 문장. 수집가가 찾는다.", value: 12 },
  { id: "hound_fang", name: "사냥개 송곳니", description: "속이 텅 빈 송곳니. 피리처럼 소리가 난다.", value: 4 },
  { id: "hollow_heart", name: "희미한 핵", description: "사냥개 몸속에서 나온 돌 같은 핵. 아직 희미하게 따뜻하다.", value: 10 },
  { id: "spore_sac", name: "포자 주머니", description: "건드리면 터진다. 조심해서 들고 다녀야 한다.", value: 3 },
  { id: "husk_shell", name: "굳은 껍질", description: "나무껍질처럼 단단한 껍질 조각.", value: 5 },
];

/** 적 종류(data/combat.ts의 ENEMIES id)별 드롭표: 쓰러뜨린 적마다 항목별로 굴린다 */
const c = (id: string, chance: number) => ({ id, chance });

export const DROPS: Record<string, { id: string; chance: number }[]> = {
  ash_rat: [
    { id: "rat_fang", chance: 0.5 },
    { id: "ash_hide", chance: 0.15 },
  ],
  pit_wretch: [
    { id: "rotten_bone", chance: 0.5 },
    { id: "wretch_nail", chance: 0.15 },
  ],
  rust_warden: [
    { id: "rust_plate", chance: 0.5 },
    { id: "warden_crest", chance: 0.15 },
  ],
  hollow_hound: [
    { id: "hound_fang", chance: 0.5 },
    { id: "hollow_heart", chance: 0.15 },
  ],
  spore_husk: [
    { id: "spore_sac", chance: 0.5 },
    { id: "husk_shell", chance: 0.15 },
  ],
  // ── 미지의 숲 몬스터 ──
  goblin_grunt: [c("crude_iron", 0.5), c("shiny_trinket", 0.1)],
  green_slime: [c("slime_jelly", 0.6), c("slime_core", 0.05)],
  forest_rat: [c("rat_hide", 0.5), c("soft_pelt", 0.2)],
  forest_boar: [c("boar_hide", 0.5)],
  giant_boar: [c("boar_hide", 1), c("boar_tusk", 1)],
  giant_cave_bat: [c("big_bat_wing", 1), c("bat_wing", 1)],
  crystal_spider: [c("crystal_chip", 0.6)],
  goblin_bomber: [c("powder_pouch", 0.5)],
  owlbear: [c("feather_hide", 0.6)],
  orc_drummer: [c("war_drum", 0.4), c("orc_tusk", 0.2)],
  goblin_slinger: [c("crude_iron", 0.4), c("shiny_trinket", 0.15)],
  blue_slime: [c("slime_jelly", 0.6), c("slime_core", 0.15)],
  goblin_shaman: [c("shaman_feather", 0.4), c("shiny_trinket", 0.2)],
  cave_spider: [c("spider_silk", 0.5), c("venom_gland", 0.1)],
  vampire_bat: [c("bat_wing", 0.5)],
  cave_wolf: [c("wolf_fang", 0.5), c("soft_pelt", 0.3)],
  goblin_warrior: [c("crude_iron", 0.6), c("shiny_trinket", 0.15)],
  hobgoblin: [c("crude_iron", 0.6), c("shiny_trinket", 0.3)],
  hungry_wolf: [c("wolf_fang", 0.5), c("soft_pelt", 0.3)],
  venom_spider: [c("venom_gland", 0.4), c("spider_silk", 0.3)],
  egg_sac: [c("spider_silk", 0.4)],
  spiderling: [c("spider_silk", 0.2)],
  poison_slime: [c("slime_jelly", 0.5), c("venom_gland", 0.2)],
  acid_slime: [c("slime_jelly", 0.5), c("slime_core", 0.15)],
  split_slime: [c("slime_jelly", 0.5)],
  slimelet: [c("slime_jelly", 0.3)],
  orc_warrior: [c("orc_tusk", 0.4), c("crude_iron", 0.4)],
  orc_archer: [c("orc_tusk", 0.3), c("soft_pelt", 0.4)],
  orc_berserker: [c("orc_tusk", 0.5)],
  orc_shaman: [c("shaman_feather", 0.5), c("orc_tusk", 0.2)],
  // 층 보스·던전 보스: 우두머리의 증표와 드문 재료를 확실히
  goblin_glutton: [c("chief_token", 1), c("shiny_trinket", 1)],
  goblin_marksman: [c("chief_token", 1), c("crude_iron", 1)],
  wolf_tamer: [c("chief_token", 1), c("wolf_fang", 1)],
  hobgoblin_chief: [c("chief_token", 1), c("shiny_trinket", 1)],
  goblin_king: [c("chief_token", 1), c("chief_token", 1), c("shiny_trinket", 1)],
  slime_king: [c("chief_token", 1), c("slime_core", 1), c("slime_core", 1)],
  orc_king: [c("chief_token", 1), c("chief_token", 1), c("orc_tusk", 1)],
  spider_queen: [c("chief_token", 1), c("venom_gland", 1), c("spider_silk", 1)],
  alpha_wolf: [c("chief_token", 1), c("wolf_fang", 1), c("soft_pelt", 1)],
  tree_giant: [c("glowing_sap", 1), c("chief_token", 1)],
  // ── 타락한 엘프의 숲 ──
  // 새 몬스터 (2026-11-21)는 드롭 미정: 재료 시스템이 정해지면 채운다 (여기 없으면 드롭 없음)
  corrupted_spirit_king: [c("chief_token", 1), c("glowing_sap", 1), c("withered_petal", 1)],
  corrupted_elf_queen: [c("chief_token", 1), c("withered_petal", 1)],
};


export function getSalvage(id: string): Salvage | undefined {
  return SALVAGE.find((s) => s.id === id);
}

/** 쓰러뜨린 적 하나의 드롭 */
export function rollDrops(kind: string | undefined, rng: Rng): string[] {
  return (DROPS[kind ?? ""] ?? []).flatMap((d) => (rng.next() < d.chance ? [d.id] : []));
}

/** 유실물 묶음을 합친다 */
export function addSalvage(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [id, n] of Object.entries(b)) out[id] = (out[id] ?? 0) + n;
  return out;
}

export const salvageCount = (s: Record<string, number>) => Object.values(s).reduce((a, b) => a + b, 0);

/** 팔 수 없는 물건의 종류 (판매가 대신 아이콘으로 따로 보인다) */
export const UNSELLABLE_KINDS: Exclude<ItemKind, "loot">[] = ["material", "shard", "book", "raceRelic", "bossToken"];
export const KIND_LABEL: Record<Exclude<ItemKind, "loot">, { icon: string; name: string }> = {
  material: { icon: "⚒", name: "재료" },
  shard: { icon: "◆", name: "기술 파편" },
  book: { icon: "📖", name: "전술 교본" },
  raceRelic: { icon: "🗿", name: "종족 유물" },
  bossToken: { icon: "🏅", name: "보스 증표" },
};

/**
 * 들고 있는 것의 값: 금화 + 팔 수 있는 유실물·유물의 상점 판매가 합.
 * 팔 수 없는 것(재료·파편·교본·종족 유물·보스 증표)은 종류별 개수로 따로.
 */
export function carriedValue(gold: number, relicValues: number[], salvage: Record<string, number>): { value: number; unsellable: Partial<Record<Exclude<ItemKind, "loot">, number>> } {
  let value = gold + relicValues.reduce((a, b) => a + b, 0);
  const unsellable: Partial<Record<Exclude<ItemKind, "loot">, number>> = {};
  for (const [id, n] of Object.entries(salvage)) {
    const item = getSalvage(id);
    if (!item || n <= 0) continue;
    const kind = kindOf(item);
    if (kind === "loot") value += item.value * n;
    else unsellable[kind] = (unsellable[kind] ?? 0) + n;
  }
  return { value, unsellable };
}
