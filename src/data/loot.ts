// 유실물: 쓰러뜨린 적에게서 떨어지는 것. 상점에 팔거나 대장간·전수관 재료로 쓴다. 던전마다 재료가 다르다.
// (유물은 사건·보물 칸에서만 나온다. data/relics.ts)
import type { Rng } from "../game/random";

export type Salvage = {
  id: string;
  name: string;
  description: string;
  /** 상점에 팔 때 받는 금화 */
  value: number;
};

export const SALVAGE: Salvage[] = [
  // ── 미지의 숲 ──
  { id: "soft_pelt", name: "부드러운 털가죽", description: "숲 짐승의 보드라운 털가죽. 덧대기 좋다.", value: 3 },
  { id: "slime_jelly", name: "슬라임 젤리", description: "말랑하고 차가운 젤리. 약재상이 반긴다.", value: 2 },
  { id: "crude_iron", name: "조잡한 쇠붙이", description: "고블린이 두들겨 만든 쇳조각. 녹이면 쓸 만하다.", value: 3 },
  { id: "spider_silk", name: "거미줄 실타래", description: "질기고 가벼운 실. 재봉사들이 탐낸다.", value: 3 },
  { id: "bat_wing", name: "박쥐 날개막", description: "얇고 질긴 막. 바람을 잘 탄다.", value: 3 },
  { id: "wolf_fang", name: "늑대 송곳니", description: "날카롭게 휜 송곳니. 사냥꾼들의 자랑거리.", value: 4 },
  { id: "shiny_trinket", name: "고블린의 반짝이", description: "고블린이 모아 둔 반짝이는 잡동사니. 가끔 진짜 보석이 섞여 있다.", value: 6 },
  { id: "slime_core", name: "슬라임 핵", description: "슬라임 한가운데 있던 투명한 구슬. 손에 쥐면 말랑하게 떨린다.", value: 8 },
  { id: "venom_gland", name: "독샘", description: "독거미나 독 슬라임에게서 나온 주머니. 조심해서 다뤄야 한다.", value: 6 },
  { id: "orc_tusk", name: "오크 엄니", description: "굵고 묵직한 엄니. 오크 전사의 훈장이다.", value: 7 },
  { id: "shaman_feather", name: "주술 깃털", description: "주술사가 지니던 알록달록한 깃털. 희미한 힘이 남아 있다.", value: 6 },
  { id: "chief_token", name: "우두머리의 증표", description: "무리의 우두머리가 지니던 장식. 길드에서 무용담의 증거로 쳐준다.", value: 15 },
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
  forest_rat: [c("soft_pelt", 0.5)],
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
