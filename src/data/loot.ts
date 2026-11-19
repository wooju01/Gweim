// 유실물: 쓰러뜨린 적에게서 떨어지는 것. 상점에 팔거나, 나중에 대장간·전수관 재료로 쓴다.
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
  { id: "rat_fang", name: "쥐 이빨", description: "누렇게 변한 앞니. 갈아서 쓰는 사람이 있다.", value: 2 },
  { id: "ash_hide", name: "잿빛 가죽", description: "털이 빠진 질긴 가죽. 덧대기 좋다.", value: 4 },
  { id: "rotten_bone", name: "썩은 뼈", description: "망자의 뼈. 불에 넣으면 이상한 연기가 난다.", value: 2 },
  { id: "wretch_nail", name: "망자의 손톱", description: "독이 밴 검은 손톱. 약재상이 사 간다.", value: 5 },
  { id: "rust_plate", name: "녹슨 갑옷 조각", description: "녹을 벗기면 아직 쓸 만한 쇠다.", value: 6 },
  { id: "warden_crest", name: "파수병 문장", description: "무너진 왕국 파수병의 가슴 문장. 수집가가 찾는다.", value: 12 },
  { id: "hound_fang", name: "사냥개 송곳니", description: "속이 텅 빈 송곳니. 피리처럼 소리가 난다.", value: 4 },
  { id: "hollow_heart", name: "빈 심장", description: "말라붙은 심장. 아직 희미하게 뛰는 것 같다.", value: 10 },
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
  // 미지의 숲 몬스터 (지금은 기존 유실물을 나눠 쓴다. 숲 전용 재료는 나중에)
  goblin_grunt: [c("rat_fang", 0.3), c("rust_plate", 0.2)],
  green_slime: [c("spore_sac", 0.5)],
  forest_rat: [c("rat_fang", 0.5), c("ash_hide", 0.1)],
  goblin_slinger: [c("rust_plate", 0.3)],
  blue_slime: [c("spore_sac", 0.5), c("husk_shell", 0.1)],
  goblin_shaman: [c("rotten_bone", 0.5), c("hollow_heart", 0.1)],
  cave_spider: [c("husk_shell", 0.3), c("wretch_nail", 0.15)],
  vampire_bat: [c("rotten_bone", 0.4), c("ash_hide", 0.1)],
  cave_wolf: [c("hound_fang", 0.5), c("ash_hide", 0.15)],
  goblin_warrior: [c("rust_plate", 0.5), c("warden_crest", 0.1)],
  hobgoblin: [c("rust_plate", 0.6), c("warden_crest", 0.2)],
  hungry_wolf: [c("hound_fang", 0.5), c("ash_hide", 0.2)],
  venom_spider: [c("wretch_nail", 0.4), c("husk_shell", 0.2)],
  egg_sac: [c("husk_shell", 0.5)],
  spiderling: [c("husk_shell", 0.2)],
  poison_slime: [c("spore_sac", 0.5), c("wretch_nail", 0.15)],
  acid_slime: [c("spore_sac", 0.5), c("husk_shell", 0.15)],
  split_slime: [c("spore_sac", 0.5)],
  slimelet: [c("spore_sac", 0.2)],
  orc_warrior: [c("rust_plate", 0.5), c("warden_crest", 0.15)],
  orc_archer: [c("ash_hide", 0.4), c("hound_fang", 0.2)],
  orc_berserker: [c("rust_plate", 0.4), c("hollow_heart", 0.15)],
  orc_shaman: [c("rotten_bone", 0.5), c("hollow_heart", 0.2)],
  // 보스: 드문 재료를 많이
  goblin_glutton: [c("hollow_heart", 1), c("warden_crest", 0.5)],
  goblin_marksman: [c("warden_crest", 1), c("ash_hide", 0.5)],
  wolf_tamer: [c("hound_fang", 1), c("ash_hide", 1)],
  hobgoblin_chief: [c("warden_crest", 1), c("rust_plate", 1)],
  goblin_king: [c("warden_crest", 1), c("hollow_heart", 1), c("rust_plate", 1)],
  slime_king: [c("hollow_heart", 1), c("spore_sac", 1), c("husk_shell", 1)],
  orc_king: [c("warden_crest", 1), c("hollow_heart", 1), c("hollow_heart", 0.5)],
  spider_queen: [c("wretch_nail", 1), c("husk_shell", 1), c("hollow_heart", 1)],
  alpha_wolf: [c("hound_fang", 1), c("ash_hide", 1), c("hollow_heart", 1)],
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
