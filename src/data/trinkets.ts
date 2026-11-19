// 장신구: 대장간에서 유실물로 만드는 직업 전용 장신구. 용병당 1칸, 효과는 작다.
// 강화는 무조건 성공한다 (최대 3단계). 보물 칸에서 낮은 확률로 1단계짜리가 나온다.
// 용병이 죽으면 그 전투를 이겼을 때만 돌려받는다 (지거나 도망치면 잃는다).
// 수치는 초안이다. 밸런스는 나중에 시뮬레이션으로 조정한다.
import type { Rng } from "../game/random";
import type { StatBlock } from "./growth";

export type Trinket = {
  id: string;
  name: string;
  /** 낄 수 있는 직업 */
  job: string;
  description: string;
  /** 단계마다 붙는 스탯 포인트 (data/growth.ts의 PER_POINT로 효과가 정해진다) */
  perLevel: StatBlock;
  /** 만들고 강화하는 데 드는 유실물 (단계마다 이만큼, 마지막 단계는 두 배) */
  material: { id: string; n: number };
};

/** 가진 장신구 하나 (단계 1~3) */
export type OwnedTrinket = { id: string; lv: number };

export const TRINKET_MAX_LV = 3;

export const TRINKETS: Trinket[] = [
  { id: "t_warden_badge", name: "파수병 문장 방패걸이", job: "knight", perLevel: { defense: 1 }, material: { id: "warden_crest", n: 1 }, description: "무너진 왕국의 문장을 방패에 건다. 아직 무게가 있다." },
  { id: "t_rust_pauldron", name: "녹쇠 어깨받이", job: "knight", perLevel: { hp: 2 }, material: { id: "rust_plate", n: 3 }, description: "녹을 벗긴 갑옷 조각을 덧댔다." },
  { id: "t_fang_necklace", name: "송곳니 목걸이", job: "greatsword", perLevel: { str: 1 }, material: { id: "hound_fang", n: 3 }, description: "휘두를 때마다 이빨들이 부딪쳐 운다." },
  { id: "t_ash_wrap", name: "잿빛 손목띠", job: "greatsword", perLevel: { hp: 2 }, material: { id: "ash_hide", n: 1 }, description: "질긴 가죽으로 손목을 감아 칼을 버틴다." },
  { id: "t_nail_ring", name: "망자 손톱 반지", job: "assassin", perLevel: { crit: 1 }, material: { id: "wretch_nail", n: 1 }, description: "손톱 끝에 밴 독이 손끝을 날카롭게 한다." },
  { id: "t_rat_anklet", name: "쥐 이빨 발찌", job: "assassin", perLevel: { speed: 1 }, material: { id: "rat_fang", n: 3 }, description: "소리 없이 달리는 것들의 이빨." },
  { id: "t_fang_whistle", name: "송곳니 피리", job: "archer", perLevel: { evade: 1 }, material: { id: "hound_fang", n: 3 }, description: "불면 짐승이 먼저 고개를 돌린다." },
  { id: "t_hide_thumb", name: "가죽 깍지", job: "archer", perLevel: { str: 1 }, material: { id: "ash_hide", n: 1 }, description: "시위를 더 세게 당길 수 있다." },
  { id: "t_heart_rosary", name: "빈 심장 묵주", job: "nun", perLevel: { faith: 1 }, material: { id: "hollow_heart", n: 1 }, description: "기도할 때 희미하게 뛴다." },
  { id: "t_bone_rosary", name: "뼈 묵주", job: "nun", perLevel: { hp: 2 }, material: { id: "rotten_bone", n: 3 }, description: "망자를 위해 기도하는 손에 쥔다." },
  { id: "t_spore_sachet", name: "포자 향낭", job: "herbalist", perLevel: { mag: 1 }, material: { id: "spore_sac", n: 3 }, description: "조심스럽게 말린 포자. 약효가 짙어진다." },
  { id: "t_husk_charm", name: "껍질 부적", job: "herbalist", perLevel: { hp: 2 }, material: { id: "husk_shell", n: 1 }, description: "나무껍질처럼 단단한 부적." },
  { id: "t_bone_focus", name: "뼈 지팡이 장식", job: "mage", perLevel: { mag: 1 }, material: { id: "rotten_bone", n: 3 }, description: "불에 넣으면 나던 이상한 연기가 주문에 섞인다." },
  { id: "t_heart_stone", name: "심장석 반지", job: "mage", perLevel: { crit: 1 }, material: { id: "hollow_heart", n: 1 }, description: "말라붙은 심장을 깎아 만든 반지." },
  { id: "t_husk_bell", name: "껍질 방울", job: "spiritcaller", perLevel: { evade: 1 }, material: { id: "husk_shell", n: 1 }, description: "정령이 이 소리를 따라 몸을 감싼다." },
  { id: "t_spore_charm", name: "포자 부적", job: "spiritcaller", perLevel: { mag: 1 }, material: { id: "spore_sac", n: 3 }, description: "정령들이 좋아하는 냄새가 난다." },
];

export function getTrinket(id: string): Trinket | undefined {
  return TRINKETS.find((t) => t.id === id);
}

/** 단계 lv로 만들거나(1) 강화하는(2·3) 비용 */
export function forgeCost(t: Trinket, lv: number): { gold: number; salvage: Record<string, number> } {
  const gold = [0, 15, 20, 30][lv] ?? 0;
  return { gold, salvage: { [t.material.id]: t.material.n * (lv >= TRINKET_MAX_LV ? 2 : 1) } };
}

/** 장신구가 주는 스탯 포인트 */
export function trinketStats(owned: OwnedTrinket | undefined): StatBlock {
  const t = owned && getTrinket(owned.id);
  if (!t) return {};
  return Object.fromEntries(Object.entries(t.perLevel).map(([k, n]) => [k, n! * owned!.lv])) as StatBlock;
}

/** 보물 칸에서 장신구가 나올 확률 */
export const TREASURE_TRINKET_CHANCE = 0.1;

export function rollTrinket(rng: Rng): Trinket {
  return TRINKETS[Math.floor(rng.next() * TRINKETS.length)];
}
