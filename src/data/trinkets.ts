// 장신구 (2026-11-22 개편): 직업 장신구 36종(직업 전용, 2차 갈래마다 2개) + 공용 생존 장신구 4종 + 의뢰 보상 장신구 4종.
// 용병당 2칸 (생존 장신구는 그중 1개까지). 강화는 무조건 성공한다 (최대 3단계).
// 보물 칸에서 낮은 확률로 1단계 직업 장신구가 나온다. 용병이 죽으면 그 전투를 이겼을 때만 돌려받는다.
// 효과는 3단계 값. 1·2단계는 LEVEL_SHARE(1/3, 2/3)를 곱해 반올림한다 (정수 효과는 최소 1). 생존 장신구는 단계별 표를 쓴다.
import type { Rng } from "@/game/random";

/**
 * 장신구 효과 (낀 장신구들의 효과는 더한다). 확률·비율은 0~1.
 * 정수: attack 공격, maxHp 최대 체력, defense 방어(받는 피해 -), speed 속도, mag 마력, thornsFlat 반사 피해 +,
 * duelReduce 결투 상대에게 받는 피해 추가 -, poisonStack 거는 중독 +, debuffTurns 거는 약화 지속 +,
 * downedTurns 쓰러져 버티는 차례 +, lastBreath 원정당 버팀 횟수, potionReviveFlat 쓰러진 채 받은 물약 회복 +
 */
export type TrinketBonus = {
  attack?: number;
  maxHp?: number;
  defense?: number;
  speed?: number;
  mag?: number;
  evade?: number;
  crit?: number;
  poisonRes?: number;
  bleedRes?: number;
  stunRes?: number;
  /** 상점 판매가 + (낀 용병이 길드에 있으면) */
  sellBonus?: number;
  /** 준 피해의 비율만큼 회복 */
  lifesteal?: number;
  /** 치명타 피해 배율 + */
  critDamage?: number;
  /** 적 하나를 노리는 공격 / 여럿을 치는 공격 위력 + */
  singlePower?: number;
  areaPower?: number;
  /** 체력 50% 이하일 때 위력 + */
  lowHpPower?: number;
  /** 신성을 따르는 공격 위력 + */
  holyPower?: number;
  /** 원소 부 조각이 든 스킬 위력 + */
  elementPower?: number;
  /** 반격(반격 태세·되받아치기 등) 위력 + */
  counterPower?: number;
  thornsFlat?: number;
  /** 감싸기로 대신 맞을 때 받는 피해 - */
  coverTaken?: number;
  duelReduce?: number;
  poisonStack?: number;
  /** 거는 기절·출혈 확률 + */
  stunChance?: number;
  bleedChance?: number;
  /** 공격이 맞으면 위축을 걸 확률 */
  witherChance?: number;
  /** 거는 비율 약화(표적·취약·회피 감소·비전 각인) 수치 + */
  markPlus?: number;
  /** 적에게 거는 약화 수치 × (1 + 이 값) */
  debuffPower?: number;
  debuffTurns?: number;
  /** 상태이상을 건 적에게 흔들림(기절 저항 -)도 건다 */
  songStunResDown?: number;
  /** 전투 첫 라운드 회피 + */
  firstRoundEvade?: number;
  /** 노래 강화(공격·방어 강화, 가속)를 받고 있는 동안 회피 + */
  songEvade?: number;
  /** 주는 회복(스킬 회복·재생) × (1 + 이 값) */
  healPower?: number;
  /** 쓰러진 아군을 일으킬 때 회복 + */
  reviveHeal?: number;
  /** 주는 보호막 + */
  shieldPower?: number;
  // ── 생존 장신구 ──
  downedTurns?: number;
  /** 일어날 때 받는 회복 + */
  riseHeal?: number;
  lastBreath?: number;
  /** 마지막 숨결로 버틴 뒤 그 차례 받는 피해 - */
  breathGuard?: number;
  /** 받는 물약 회복 + */
  potionPower?: number;
  potionReviveFlat?: number;
  /** 전투당 1번, 체력이 30% 아래로 떨어지면 최대 체력의 이 비율만큼 회복 */
  braceHeal?: number;
};

export type TrinketKind = "job" | "survival" | "quest";

export type Trinket = {
  id: string;
  name: string;
  /** job: 직업 전용 / survival: 공용 생존 (누구나, 1명당 1개) / quest: 의뢰 보상 (누구나, 1단계 고정, 만들 수 없다) */
  kind: TrinketKind;
  /** 낄 수 있는 직업 ("any"면 누구나) */
  job: string;
  /** 직업 장신구: 어울리는 2차 갈래 id (표시만, 전직 전에도 낄 수 있다) */
  build?: string;
  /** 의뢰 보상 장신구 (kind === "quest") */
  quest?: boolean;
  /** 직업·의뢰 장신구: 3단계(의뢰는 1단계) 효과 */
  effect: TrinketBonus;
  /** 생존 장신구: 단계별 효과 (1~3단계) */
  levels?: [TrinketBonus, TrinketBonus, TrinketBonus];
  /** 직업 장신구: 단계마다 드는 유실물·재료 (3단계는 두 배) / 생존 장신구: 단계별 재료 */
  material: { id: string; n: number }[];
  levelMaterial?: [{ id: string; n: number }[], { id: string; n: number }[], { id: string; n: number }[]];
  description: string;
};

/** 가진 장신구 하나 (단계 1~3) */
export type OwnedTrinket = { id: string; lv: number };

export const TRINKET_MAX_LV = 3;

/** 용병 한 명이 낄 수 있는 장신구 수 (생존 장신구는 그중 SURVIVAL_LIMIT개까지) */
export const TRINKET_SLOTS = 2;
export const SURVIVAL_LIMIT = 1;

/** 단계별 효과 비율 (3단계 = 1) */
export const LEVEL_SHARE = [0, 1 / 3, 2 / 3, 1] as const;

/** 정수로 다루는 효과 (나머지는 비율이라 1% 단위로 반올림) */
const INT_KEYS = new Set<keyof TrinketBonus>(["attack", "maxHp", "defense", "speed", "mag", "thornsFlat", "duelReduce", "poisonStack", "debuffTurns", "downedTurns", "lastBreath", "potionReviveFlat"]);

/** 3단계 효과를 lv단계 값으로 */
export function scaleBonus(full: TrinketBonus, lv: number): TrinketBonus {
  const share = LEVEL_SHARE[Math.max(1, Math.min(TRINKET_MAX_LV, lv))];
  const out: TrinketBonus = {};
  for (const [k, v] of Object.entries(full) as [keyof TrinketBonus, number][]) {
    if (!v) continue;
    out[k] = INT_KEYS.has(k) ? Math.max(1, Math.round(v * share)) : Math.round(v * share * 100) / 100;
  }
  return out;
}

/** 장신구 하나의 효과 (단계 반영) */
export function trinketBonus(owned: OwnedTrinket | undefined): TrinketBonus {
  const t = owned && getTrinket(owned.id);
  if (!t) return {};
  if (t.kind === "quest") return { ...t.effect };
  if (t.levels) return { ...t.levels[Math.max(1, Math.min(TRINKET_MAX_LV, owned!.lv)) - 1] };
  return scaleBonus(t.effect, owned!.lv);
}

/** 낀 장신구들의 효과 합 */
export function trinketsBonus(worn: OwnedTrinket[] | undefined): TrinketBonus {
  const out: TrinketBonus = {};
  for (const o of worn ?? [])
    for (const [k, v] of Object.entries(trinketBonus(o)) as [keyof TrinketBonus, number][]) out[k] = Math.round(((out[k] ?? 0) + v) * 100) / 100;
  return out;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** 효과 한 줄씩 ("받는 피해 -3", "흡혈 8%") */
const BONUS_TEXT: { [K in keyof Required<TrinketBonus>]: (v: number) => string } = {
  attack: (v) => `공격 +${v}`,
  maxHp: (v) => `최대 체력 +${v}`,
  defense: (v) => `받는 피해 -${v}`,
  speed: (v) => `속도 +${v}`,
  mag: (v) => `마력 +${v}`,
  evade: (v) => `회피 +${pct(v)}`,
  crit: (v) => `치명 +${pct(v)}`,
  poisonRes: (v) => `중독 저항 +${pct(v)}`,
  bleedRes: (v) => `출혈 저항 +${pct(v)}`,
  stunRes: (v) => `기절 저항 +${pct(v)}`,
  sellBonus: (v) => `상점 판매가 +${pct(v)}`,
  lifesteal: (v) => `준 피해의 ${pct(v)} 흡혈`,
  critDamage: (v) => `치명 피해 +${pct(v)}`,
  singlePower: (v) => `단일 공격 위력 +${pct(v)}`,
  areaPower: (v) => `범위 공격 위력 +${pct(v)}`,
  lowHpPower: (v) => `체력 50% 이하일 때 위력 +${pct(v)}`,
  holyPower: (v) => `신성 피해 +${pct(v)}`,
  elementPower: (v) => `원소 스킬 위력 +${pct(v)}`,
  counterPower: (v) => `반격 위력 +${pct(v)}`,
  thornsFlat: (v) => `반사 피해 +${v}`,
  coverTaken: (v) => `대신 맞을 때 받는 피해 -${pct(v)}`,
  duelReduce: (v) => `결투 상대에게 받는 피해 추가 -${v}`,
  poisonStack: (v) => `거는 중독 +${v}`,
  stunChance: (v) => `기절 확률 +${pct(v)}`,
  bleedChance: (v) => `출혈 확률 +${pct(v)}`,
  witherChance: (v) => `공격 시 위축 ${pct(v)}`,
  markPlus: (v) => `표적·약화 효과 +${Math.round(v * 100)}%p`,
  debuffPower: (v) => `거는 약화 효과 +${pct(v)}`,
  debuffTurns: (v) => `거는 약화 지속 +${v}턴`,
  songStunResDown: (v) => `상태이상을 건 적 기절 저항 -${pct(v)}`,
  firstRoundEvade: (v) => `첫 라운드 회피 +${pct(v)}`,
  songEvade: (v) => `노래 강화 중 회피 +${pct(v)}`,
  healPower: (v) => `회복량 +${pct(v)}`,
  reviveHeal: (v) => `일으킬 때 회복 +${pct(v)}`,
  shieldPower: (v) => `보호막 +${pct(v)}`,
  downedTurns: (v) => `쓰러져 버티는 차례 +${v}`,
  riseHeal: (v) => `일어날 때 회복 +${pct(v)}`,
  lastBreath: (v) => `원정당 ${v}회 쓰러질 피해를 체력 1로 버팀`,
  breathGuard: (v) => `버틴 뒤 그 차례 받는 피해 -${pct(v)}`,
  potionPower: (v) => `받는 물약 회복 +${pct(v)}`,
  potionReviveFlat: (v) => `쓰러진 채 받은 물약 회복 +${v}`,
  braceHeal: (v) => `전투당 1번, 체력 30% 아래로 떨어지면 최대 체력 ${pct(v)} 회복`,
};

export function bonusText(b: TrinketBonus): string {
  return (Object.entries(b) as [keyof TrinketBonus, number][])
    .filter(([, v]) => v)
    .map(([k, v]) => BONUS_TEXT[k](v))
    .join(" · ");
}

/** 장신구 하나의 효과 한 줄 (단계 반영) */
export function trinketText(owned: OwnedTrinket): string {
  return bonusText(trinketBonus(owned));
}

const m = (id: string, n: number) => ({ id, n });
const job = (id: string, name: string, jobId: string, build: string, effect: TrinketBonus, material: { id: string; n: number }[], description: string): Trinket => ({
  id,
  name,
  kind: "job",
  job: jobId,
  build,
  effect,
  material,
  description,
});
const quest = (id: string, name: string, effect: TrinketBonus, description: string): Trinket => ({ id, name, kind: "quest", job: "any", quest: true, effect, material: [], description });
const survival = (id: string, name: string, levels: [TrinketBonus, TrinketBonus, TrinketBonus], elite: string, relic: string, description: string): Trinket => ({
  id,
  name,
  kind: "survival",
  job: "any",
  effect: levels[2],
  levels,
  material: [],
  levelMaterial: [[m(elite, 3)], [m(relic, 1)], [m("boss_token", 1)]],
  description,
});

// 재료: 유실물(털가죽 soft_pelt, 박쥐 날개 bat_wing, 거미줄 spider_silk, 고블린 쇠붙이 crude_iron, 오크 엄니 orc_tusk, 슬라임 핵 slime_core, 반짝이 shiny_trinket, 주술 깃털 shaman_feather)
// 계열 재료(수액 mat_sap, 송곳니 mat_fang, 철퇴 mat_mace, 젤 mat_jelly, 숫돌 mat_whetstone, 독샘 mat_venom, 화살촉 mat_arrowhead)
export const TRINKETS: Trinket[] = [
  // ── 기사 ──
  job("t_oath_badge", "맹세의 성표", "knight", "saber", { defense: 3 }, [m("orc_tusk", 1), m("mat_sap", 2)], "맹세를 새긴 성표. 가슴에 달면 한 걸음도 물러서지 않게 된다."),
  job("t_vow_cloak", "서약의 망토", "knight", "saber", { duelReduce: 2, defense: 2 }, [m("soft_pelt", 3)], "결투를 청할 때 펼쳐 드는 망토. 상대의 칼끝이 망토 자락에 걸린다."),
  job("t_blood_gauntlet", "핏빛 건틀릿", "knight", "dark_saber", { lifesteal: 0.08 }, [m("bat_wing", 3), m("mat_fang", 1)], "베어 낸 피를 빨아들이는 건틀릿. 끼고 나면 손이 따뜻하다."),
  job("t_cursed_helm", "저주받은 투구", "knight", "dark_saber", { attack: 3, lowHpPower: 0.1 }, [m("mat_mace", 2)], "벗을 수 없을 것 같은 투구. 피를 흘릴수록 눈앞이 붉게 맑아진다."),
  // ── 가디언 ──
  job("t_rampart_stud", "성벽의 징", "guardian", "rampart", { defense: 3 }, [m("crude_iron", 3)], "방패 가장자리에 박은 굵은 징. 웬만한 칼날은 미끄러진다."),
  job("t_guard_chain", "수호자의 쇠사슬", "guardian", "rampart", { coverTaken: 0.15 }, [m("spider_silk", 3)], "동료와 방패를 잇는 가는 사슬. 대신 맞을 때 충격을 나눠 받는다."),
  job("t_thorn_rim", "가시 방패테", "guardian", "avenger", { thornsFlat: 4 }, [m("mat_fang", 3)], "송곳니를 촘촘히 박은 방패테. 방패를 치는 자가 먼저 피를 본다."),
  job("t_vengeance_crest", "복수의 문장", "guardian", "avenger", { counterPower: 0.2, maxHp: 9 }, [m("orc_tusk", 1)], "맞은 만큼 돌려주라는 문장. 방패 안쪽에 새겨 둔다."),
  // ── 대검사 ──
  job("t_heavy_sheath", "무거운 칼집", "greatsword", "crusher", { singlePower: 0.12 }, [m("mat_mace", 2)], "철퇴 조각을 녹여 두른 칼집. 뽑아 내리칠 때 무게가 실린다."),
  job("t_giant_bangle", "거인 뼈 팔찌", "greatsword", "crusher", { maxHp: 18 }, [m("soft_pelt", 3)], "거인의 뼈를 깎아 털가죽으로 감싼 팔찌. 묵직하게 몸을 붙든다."),
  job("t_wind_ribbon", "바람 깃 리본", "greatsword", "gale_blade", { areaPower: 0.12 }, [m("bat_wing", 3)], "칼자루에 매단 리본. 휘두를 때마다 바람이 따라 돈다."),
  job("t_whirl_band", "회오리 띠", "greatsword", "gale_blade", { evade: 0.06, speed: 1 }, [m("mat_jelly", 3)], "탄력 있는 젤로 엮은 허리띠. 몸이 회오리처럼 가볍게 돈다."),
  // ── 암살자 ──
  job("t_exec_gloves", "처형인의 장갑", "assassin", "executioner", { crit: 0.06, critDamage: 0.15 }, [m("mat_whetstone", 3)], "숫돌로 다듬은 손끝. 급소를 더듬어 찾는다."),
  job("t_shadow_cloak", "그림자 망토", "assassin", "executioner", { evade: 0.08 }, [m("bat_wing", 3)], "박쥐 날개막을 이어 붙인 망토. 어둠에 녹아든다."),
  job("t_venom_ring", "독샘 반지", "assassin", "poisoner", { poisonStack: 2 }, [m("mat_venom", 3)], "반지 속 홈에 독을 숨겨 둔다. 스치기만 해도 독이 스민다."),
  job("t_antidote_charm", "해독 부적", "assassin", "poisoner", { poisonRes: 0.3, bleedRes: 0.3, maxHp: 9 }, [m("mat_sap", 2), m("mat_venom", 1)], "독을 다루는 자가 먼저 챙기는 부적."),
  // ── 무투가 ──
  job("t_steel_knuckle", "강철 손등", "monk", "iron_fist", { stunChance: 0.1 }, [m("mat_mace", 2)], "손등에 댄 쇳조각. 맞은 자의 눈앞이 하얘진다."),
  job("t_iron_girdle", "무쇠 복대", "monk", "iron_fist", { maxHp: 18 }, [m("soft_pelt", 3)], "배를 단단히 조이는 복대. 숨이 깊어진다."),
  job("t_wave_anklet", "물결 발찌", "monk", "flowing", { evade: 0.08 }, [m("mat_jelly", 3)], "발목에서 찰랑이는 발찌. 발걸음이 물결처럼 흐른다."),
  job("t_flow_cord", "흐름의 끈", "monk", "flowing", { counterPower: 0.2 }, [m("mat_fang", 3)], "손목에 감은 끈. 받은 힘을 그대로 흘려 돌려준다."),
  // ── 궁수 ──
  job("t_hawk_feather", "매의 깃털", "archer", "sniper", { crit: 0.08 }, [m("mat_arrowhead", 3)], "화살 깃에 섞어 단 매의 깃털. 바람을 읽는다."),
  job("t_camo_cloak", "위장 망토", "archer", "sniper", { firstRoundEvade: 0.3 }, [m("soft_pelt", 3)], "풀잎과 털가죽을 엮은 망토. 첫 화살을 쏘기 전까지는 보이지 않는다."),
  job("t_hunter_string", "사냥꾼의 활시위", "archer", "hunter", { markPlus: 0.05, bleedChance: 0.1 }, [m("spider_silk", 3)], "거미줄을 꼬아 만든 시위. 노린 짐승을 놓치지 않는다."),
  job("t_leather_vest", "가죽 조끼", "archer", "hunter", { maxHp: 15, evade: 0.03 }, [m("soft_pelt", 3)], "사냥꾼들이 즐겨 입는 가벼운 조끼."),
  // ── 사제 ──
  job("t_core_rosary", "슬라임 핵 묵주", "priest", "saint", { healPower: 0.15 }, [m("slime_core", 1), m("mat_sap", 2)], "투명한 구슬이 기도할 때마다 은은하게 빛난다."),
  job("t_silver_chalice", "은빛 성배", "priest", "saint", { reviveHeal: 0.25 }, [m("shiny_trinket", 1), m("mat_sap", 2)], "쓰러진 자의 입술을 적시는 작은 성배."),
  job("t_judgment_badge", "심판의 성표", "priest", "chastiser", { holyPower: 0.12 }, [m("mat_whetstone", 3)], "날을 세운 성표. 기도가 칼끝이 된다."),
  job("t_penance_chain", "참회의 사슬", "priest", "chastiser", { defense: 2, witherChance: 0.1 }, [m("orc_tusk", 1)], "몸에 감은 사슬. 맞는 자도 때리는 자도 움츠러든다."),
  // ── 마법사 ──
  job("t_element_ring", "원소 결정 반지", "mage", "elementalist", { elementPower: 0.15 }, [m("mat_jelly", 2), m("mat_whetstone", 1)], "원소가 맺힌 결정을 박은 반지. 원소 주문이 한층 거세진다."),
  job("t_mana_necklace", "마력 순환 목걸이", "mage", "elementalist", { shieldPower: 0.3, maxHp: 9 }, [m("mat_sap", 3)], "수액이 고리를 따라 도는 목걸이. 방벽이 두꺼워진다."),
  job("t_blood_seal", "피의 인장", "mage", "warlock", { lifesteal: 0.06, mag: 2 }, [m("bat_wing", 3)], "피로 찍는 인장. 주문이 상대의 생기를 끌어온다."),
  job("t_skull_ring", "해골 반지", "mage", "warlock", { debuffTurns: 1 }, [m("shaman_feather", 1)], "작은 해골을 깎은 반지. 건 저주가 쉽게 풀리지 않는다."),
  // ── 바드 ──
  job("t_jelly_sachet", "젤리 향낭", "minstrel", "troubadour", { healPower: 0.2 }, [m("mat_jelly", 3)], "말린 젤을 넣은 향낭. 노래가 상처를 어루만진다."),
  job("t_lute_strap", "여행자의 류트끈", "minstrel", "troubadour", { maxHp: 15, songEvade: 0.05 }, [m("soft_pelt", 3)], "먼 길을 함께한 류트끈. 노래하는 동안 몸이 가볍다."),
  job("t_tusk_bell", "엄니 방울", "minstrel", "thrill_player", { debuffPower: 0.2 }, [m("orc_tusk", 1)], "박자에 맞춰 짤랑거린다. 듣는 적의 다리가 풀린다."),
  job("t_discord_pipe", "불협 피리", "minstrel", "thrill_player", { songStunResDown: 0.1 }, [m("spider_silk", 3)], "귀를 긁는 피리. 노래를 들은 적이 휘청인다."),
  // ── 공용 생존 장신구 (누구나, 1명당 1개) ──
  survival("t_life_charm", "생명의 부적", [{ downedTurns: 1 }, { downedTurns: 1, riseHeal: 0.1 }, { downedTurns: 1, riseHeal: 0.2 }], "mat_sap", "relic_spirit", "쓰러진 자의 숨을 붙드는 부적."),
  survival("t_last_breath", "마지막 숨결 펜던트", [{ lastBreath: 1 }, { lastBreath: 1, breathGuard: 0.5 }, { lastBreath: 2, breathGuard: 0.5 }], "mat_fang", "relic_beastfang", "죽음의 문턱에서 한 번 더 버티게 하는 펜던트."),
  survival("t_aid_belt", "구급 허리띠", [{ potionPower: 0.3 }, { potionPower: 0.45 }, { potionPower: 0.6, potionReviveFlat: 10 }], "mat_jelly", "relic_rune", "물약을 바로 꺼내 쓸 수 있게 꽂아 둔 허리띠."),
  survival("t_brace_bangle", "버팀 팔찌", [{ braceHeal: 0.1 }, { braceHeal: 0.12 }, { braceHeal: 0.15 }], "mat_whetstone", "relic_totem", "위태로울 때 조여 와 정신을 붙잡아 주는 팔찌."),
  // ── 의뢰 보상 장신구 (중요 의뢰 전용, 누구나 낄 수 있다) ──
  quest("t_queen_venom_ring", "여왕의 독낭 반지", { poisonRes: 0.3 }, "거미 여왕의 독낭을 깎아 만든 반지. 웬만한 독은 몸에 스미지 않는다. (중독 저항 +30%)"),
  quest("t_guild_seal", "조합의 인장", { sellBonus: 0.1 }, "상인 조합이 믿을 만한 길드에 내주는 인장. 상점이 값을 더 쳐준다. (상점 판매가 +10%)"),
  quest("t_silver_crest", "은빛 길드 휘장", { attack: 2, stunRes: 0.1 }, "길드 본부가 승급 시험을 통과한 길드에 내리는 휘장. (공격 +2, 기절 저항 +10%)"),
  // 효과는 나중에 정한다 (임시: 공격 +3)
  quest("t_orc_tusk_necklace", "오크 왕의 엄니 목걸이", { attack: 3 }, "오크 킹의 엄니를 꿰어 만든 목걸이. 목에 걸면 피가 끓는다. (공격 +3)"),
];

/** 이 직업이 낄 수 있나 */
export function trinketFits(t: Trinket | undefined, job: string | undefined): boolean {
  return !!t && (t.job === "any" || t.job === job);
}

/** 장신구의 최대 단계 (의뢰 장신구는 1) */
export function trinketMaxLv(t: Trinket): number {
  return t.kind === "quest" ? 1 : TRINKET_MAX_LV;
}

/** 대장간에서 만들 수 있는 장신구 (의뢰 장신구 빼고) */
export const FORGEABLE = (): Trinket[] => TRINKETS.filter((x) => x.kind !== "quest");

/** 이 용병이 이 장신구를 더 낄 수 있나 (같은 장신구 둘, 생존 장신구 SURVIVAL_LIMIT개 넘게는 안 된다). worn: 지금 낀 것 (바꿀 칸은 빼고) */
export function canWear(t: Trinket | undefined, worn: OwnedTrinket[]): boolean {
  if (!t || worn.some((w) => w.id === t.id)) return false;
  if (t.kind === "survival" && worn.filter((w) => getTrinket(w.id)?.kind === "survival").length >= SURVIVAL_LIMIT) return false;
  return true;
}

export function getTrinket(id: string): Trinket | undefined {
  return TRINKETS.find((t) => t.id === id);
}

/** 단계별 금화: 직업 장신구 60 / 120 / 250, 생존 장신구 200 / 400 / 800 */
export const FORGE_GOLD: Record<"job" | "survival", readonly [number, number, number]> = { job: [60, 120, 250], survival: [200, 400, 800] };

/** 단계 lv로 만들거나(1) 강화하는(2·3) 비용. 직업 장신구 재료는 3단계에서 두 배 */
export function forgeCost(t: Trinket, lv: number): { gold: number; salvage: Record<string, number> } {
  const i = Math.max(1, Math.min(TRINKET_MAX_LV, lv)) - 1;
  if (t.kind === "quest") return { gold: 0, salvage: {} };
  const gold = FORGE_GOLD[t.kind][i];
  const salvage: Record<string, number> = {};
  const mats = t.kind === "survival" ? (t.levelMaterial?.[i] ?? []) : t.material.map((x) => ({ id: x.id, n: x.n * (lv >= TRINKET_MAX_LV ? 2 : 1) }));
  for (const x of mats) salvage[x.id] = (salvage[x.id] ?? 0) + x.n;
  return { gold, salvage };
}

/** 보물 칸에서 장신구가 나올 확률 (1단계 직업 장신구) */
export const TREASURE_TRINKET_CHANCE = 0.1;

export function rollTrinket(rng: Rng): Trinket {
  const pool = TRINKETS.filter((t) => t.kind === "job");
  return pool[Math.floor(rng.next() * pool.length)];
}

/** 대장간 할인 (의뢰 보상) */
export const FORGE_DISCOUNT = 0.3;
