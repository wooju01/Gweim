// 장신구: 대장간에서 유실물로 만드는 직업 전용 장신구. 용병당 1칸, 효과는 작다.
// 강화는 무조건 성공한다 (최대 3단계). 보물 칸에서 낮은 확률로 1단계짜리가 나온다.
// 용병이 죽으면 그 전투를 이겼을 때만 돌려받는다 (지거나 도망치면 잃는다).
// 수치는 초안이다. 밸런스는 나중에 시뮬레이션으로 조정한다.
import type { Rng } from "@/game/random";
import type { StatBlock } from "./growth";

export type Trinket = {
  id: string;
  name: string;
  /** 낄 수 있는 직업 ("any"면 누구나) */
  job: string;
  /** 의뢰 보상 장신구: 대장간에서 만들거나 강화할 수 없고, 보물 칸에서 나오지 않는다 (1단계 고정) */
  quest?: boolean;
  /** 스탯 밖의 효과 (의뢰 장신구) */
  bonus?: TrinketBonus;
  description: string;
  /** 단계마다 붙는 스탯 포인트 (data/growth.ts의 PER_POINT로 효과가 정해진다) */
  perLevel: StatBlock;
  /** 만들고 강화하는 데 드는 유실물 (단계마다 이만큼, 마지막 단계는 두 배) */
  material: { id: string; n: number };
};

/** 스탯 밖의 효과: 공격 +, 중독·기절 저항 +, 상점 판매가 + (낀 용병이 길드에 있으면) */
export type TrinketBonus = { attack?: number; poisonRes?: number; stunRes?: number; sellBonus?: number };

/** 가진 장신구 하나 (단계 1~3) */
export type OwnedTrinket = { id: string; lv: number };

export const TRINKET_MAX_LV = 3;

/** 용병 한 명이 낄 수 있는 장신구 수 (2026-11-22: 1 → 2) */
export const TRINKET_SLOTS = 2;

/** 낀 장신구들의 스탯 합 */
export function trinketsStats(worn: OwnedTrinket[] | undefined): StatBlock {
  const out: StatBlock = {};
  for (const o of worn ?? []) for (const [k, v] of Object.entries(trinketStats(o))) out[k as keyof StatBlock] = (out[k as keyof StatBlock] ?? 0) + (v ?? 0);
  return out;
}

/** 낀 장신구들의 스탯 밖 효과 합 */
export function trinketsBonus(worn: OwnedTrinket[] | undefined): TrinketBonus {
  const out: TrinketBonus = {};
  for (const o of worn ?? []) {
    const b = getTrinket(o.id)?.bonus;
    if (!b) continue;
    for (const k of ["attack", "poisonRes", "stunRes", "sellBonus"] as const) if (b[k]) out[k] = (out[k] ?? 0) + b[k]!;
  }
  return out;
}

export const TRINKETS: Trinket[] = [
  // id는 저장 호환을 위해 그대로 둔다 (이름·재료는 미지의 숲 기준)
  { id: "t_warden_badge", name: "우두머리 증표 방패걸이", job: "knight", perLevel: { defense: 1 }, material: { id: "chief_token", n: 1 }, description: "쓰러뜨린 우두머리의 증표를 방패에 건다. 보는 사람마다 한마디씩 한다." },
  { id: "t_rust_pauldron", name: "쇠붙이 어깨받이", job: "knight", perLevel: { hp: 2 }, material: { id: "crude_iron", n: 3 }, description: "고블린 쇠붙이를 녹여 덧댔다. 생각보다 튼튼하다." },
  { id: "t_fang_necklace", name: "늑대 송곳니 목걸이", job: "greatsword", perLevel: { str: 1 }, material: { id: "wolf_fang", n: 3 }, description: "휘두를 때마다 송곳니들이 부딪쳐 딸랑거린다." },
  { id: "t_ash_wrap", name: "털가죽 손목띠", job: "greatsword", perLevel: { hp: 2 }, material: { id: "soft_pelt", n: 3 }, description: "보드라운 털가죽으로 손목을 감아 칼을 버틴다." },
  { id: "t_nail_ring", name: "독샘 반지", job: "assassin", perLevel: { crit: 1 }, material: { id: "venom_gland", n: 1 }, description: "반지 속 작은 홈에 독을 한 방울 숨겨 둔다." },
  { id: "t_rat_anklet", name: "박쥐 날개 발찌", job: "assassin", perLevel: { speed: 1 }, material: { id: "bat_wing", n: 3 }, description: "발걸음이 바람처럼 가벼워진다는 부적." },
  { id: "t_fang_whistle", name: "송곳니 피리", job: "archer", perLevel: { evade: 1 }, material: { id: "wolf_fang", n: 3 }, description: "불면 짐승이 먼저 고개를 돌린다." },
  { id: "t_hide_thumb", name: "거미줄 활시위", job: "archer", perLevel: { str: 1 }, material: { id: "spider_silk", n: 3 }, description: "거미줄을 꼬아 만든 시위. 더 세게 당길 수 있다." },
  { id: "t_heart_rosary", name: "슬라임 핵 묵주", job: "priest", perLevel: { faith: 1 }, material: { id: "slime_core", n: 1 }, description: "투명한 구슬이 기도할 때마다 은은하게 빛난다." },
  { id: "t_bone_rosary", name: "반짝이 묵주", job: "priest", perLevel: { hp: 2 }, material: { id: "shiny_trinket", n: 1 }, description: "고블린의 반짝이를 꿰어 만든 묵주. 조금 요란하다." },
  { id: "t_husk_charm", name: "거미줄 방패끈", job: "guardian", perLevel: { hp: 2 }, material: { id: "spider_silk", n: 3 }, description: "촘촘한 거미줄로 엮은 방패끈. 큰 방패가 손에서 빠지지 않는다." },
  { id: "t_tusk_boss", name: "엄니 방패징", job: "guardian", perLevel: { defense: 1 }, material: { id: "orc_tusk", n: 1 }, description: "오크 엄니를 깎아 방패 한가운데 박았다." },
  { id: "t_pelt_wrap", name: "털가죽 주먹싸개", job: "monk", perLevel: { str: 1 }, material: { id: "soft_pelt", n: 3 }, description: "보드라운 털가죽으로 주먹을 감싼다. 때려도 손이 덜 아프다." },
  { id: "t_wing_sash", name: "날개막 허리띠", job: "monk", perLevel: { speed: 1 }, material: { id: "bat_wing", n: 3 }, description: "가볍고 질긴 날개막으로 짠 허리띠. 몸놀림이 빨라진다." },
  { id: "t_spore_sachet", name: "젤리 향낭", job: "minstrel", perLevel: { mag: 1 }, material: { id: "slime_jelly", n: 3 }, description: "말린 슬라임 젤리를 넣은 향낭. 목이 맑게 트인다." },
  { id: "t_husk_bell", name: "엄니 방울", job: "minstrel", perLevel: { evade: 1 }, material: { id: "orc_tusk", n: 1 }, description: "박자에 맞춰 짤랑거린다. 듣는 쪽 발걸음이 가벼워진다." },
  { id: "t_bone_focus", name: "주술 깃털 장식", job: "mage", perLevel: { mag: 1 }, material: { id: "shaman_feather", n: 1 }, description: "지팡이 끝에 단 깃털. 주문이 한결 매끄럽다." },
  { id: "t_heart_stone", name: "슬라임 핵 반지", job: "mage", perLevel: { crit: 1 }, material: { id: "slime_core", n: 1 }, description: "말랑한 구슬을 깎아 만든 반지. 마력이 한곳에 모인다." },
  // ── 의뢰 보상 장신구 (중요 의뢰 전용, 누구나 낄 수 있다) ──
  { id: "t_queen_venom_ring", name: "여왕의 독낭 반지", job: "any", quest: true, perLevel: {}, bonus: { poisonRes: 0.3 }, material: { id: "mat_venom", n: 0 }, description: "거미 여왕의 독낭을 깎아 만든 반지. 웬만한 독은 몸에 스미지 않는다. (중독 저항 +30%)" },
  { id: "t_guild_seal", name: "조합의 인장", job: "any", quest: true, perLevel: {}, bonus: { sellBonus: 0.1 }, material: { id: "mat_whetstone", n: 0 }, description: "상인 조합이 믿을 만한 길드에 내주는 인장. 상점이 값을 더 쳐준다. (상점 판매가 +10%)" },
  { id: "t_silver_crest", name: "은빛 길드 휘장", job: "any", quest: true, perLevel: {}, bonus: { attack: 2, stunRes: 0.1 }, material: { id: "mat_whetstone", n: 0 }, description: "길드 본부가 승급 시험을 통과한 길드에 내리는 휘장. (공격 +2, 기절 저항 +10%)" },
  // 효과는 나중에 정한다 (임시: 공격 +3)
  { id: "t_orc_tusk_necklace", name: "오크 왕의 엄니 목걸이", job: "any", quest: true, perLevel: {}, bonus: { attack: 3 }, material: { id: "mat_whetstone", n: 0 }, description: "오크 킹의 엄니를 꿰어 만든 목걸이. 목에 걸면 피가 끓는다. (공격 +3)" },
];

/** 이 직업이 낄 수 있나 */
export function trinketFits(t: Trinket | undefined, job: string | undefined): boolean {
  return !!t && (t.job === "any" || t.job === job);
}

/** 장신구의 최대 단계 (의뢰 장신구는 1) */
export function trinketMaxLv(t: Trinket): number {
  return t.quest ? 1 : TRINKET_MAX_LV;
}

/** 대장간에서 만들 수 있는 장신구 (의뢰 장신구 빼고) */
export const FORGEABLE = (): Trinket[] => TRINKETS.filter((x) => !x.quest);

export function getTrinket(id: string): Trinket | undefined {
  return TRINKETS.find((t) => t.id === id);
}

/** 단계 lv로 만들거나(1) 강화하는(2·3) 비용 */
export function forgeCost(t: Trinket, lv: number): { gold: number; salvage: Record<string, number> } {
  const gold = [0, 60, 80, 120][lv] ?? 0;
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
  const pool = TRINKETS.filter((t) => !t.quest);
  return pool[Math.floor(rng.next() * pool.length)];
}

/** 대장간 할인 (의뢰 보상) */
export const FORGE_DISCOUNT = 0.3;
