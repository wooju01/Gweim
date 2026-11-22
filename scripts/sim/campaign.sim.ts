// 캠페인 시뮬레이션: 동3 파티 4명으로 원정 TRIPS번 연속. 죽으면 동3 새로 고용 (무료), 남는 금화는 아래 순서로 쓴다.
// 물자(짐 5) → 시설(의무실 → 가방 → 훈련장 → 위령비) → 생존 장신구 → [재료 구매 →] 해금·조립 → [재료 구매 →] 강화 → 직업 장신구 → 단련 → 승급
// 실행: npm run sim:campaign  (CAMPAIGNS=50, POLICY=retreat|none|both, CONFIGS=trinkets|none,trinkets)
// 결과: scripts/sim/results/날짜-campaign.md. 수치를 바꿔 다시 돌릴 때는 게임 데이터(data/*)만 고치면 된다
import { it } from "vitest";
import { JOB_STAT, PROMOTE_BONUS, XP_TO_NEXT, trainingCost, type StatBlock } from "@/data/growth";
import { MATERIAL_SHOP, PRICE, START_GOLD, materialPrice } from "@/data/economy";
import { getRelic } from "@/data/relics";
import { CRAFT_COST, MAX_SUB_LEVEL, getFragment, upgradeCost } from "@/data/fragments";
import { GUILD_PROMOTION, PROOF_BOSSES } from "@/data/guild";
import { RANKS, rankLabel } from "@/data/ranks";
import { sampleSeeds } from "@/data/sampleRoster";
import { TRINKETS, forgeCost, getTrinket, trinketsBonus, type OwnedTrinket } from "@/data/trinkets";
import { BRANCHES } from "@/data/jobs";
import { wageOf } from "@/game/merc/wages";
import { buildMerc } from "@/game/merc/generate";
import { NO_GROWTH, addStats, canPromote, gainXp, type Growth } from "@/game/merc/growth";
import { promote, promotionChoices } from "@/game/merc/promotion";
import { knownFragments, paySalvage } from "@/game/merc/skillhall";
import { fragmentsFor, normalize, validateSkill } from "@/game/skills";
import { xpFor } from "@/game/dungeon/expedition";
import type { Merc } from "@/game/types";
import type { MercSeed } from "@/lib/schemas";
import type { SupplyKind } from "@/data/combat";
import { run } from "./expedition";
import { FACILITY_SLOTS, INFIRMARY, NEW_HIRE_DAYS, SCOUT_CHANCE, TRAINING_XP, bagSlots, getFacility, type FacilityId, type FacilityLevels } from "@/data/facilities";

/** 시설을 짓는 순서 */
const FACILITY_ORDER: FacilityId[] = ["infirmary", "bag", "training", "memorial"];
import { rng } from "./party";
import { Report, mean, pct } from "./report";
import { assertMockAI } from "./setup";

const CAMPAIGNS = Number(process.env.CAMPAIGNS ?? 50);
const TRIPS = Number(process.env.TRIPS ?? 20);
/** 보스 앞 후퇴 정책 (후퇴 정책일 때): 다음 칸이 보스인데 파티 체력이 이 비율 아래이거나 죽은 동료가 있으면 돌아간다 */
const BOSS_RETREAT = Number(process.env.BOSS_RETREAT ?? 0.7);
/** 목표 (보고 표시용) */
const TARGET = { deaths: [8, 10], gold: 700 } as const;
const KINDS: SupplyKind[] = ["bandage", "antidote", "potion", "greaterPotion"];

// ── 캠페인 ──────────────────────────────────────────

type Member = {
  seed: MercSeed;
  growth: Growth;
  unlocked: string[];
  levels: Record<string, number>;
  bossWin: boolean;
  invested: number;
  unlocks: number;
  upgrades: number;
  trainings: number;
  /** 장신구: 생존 장신구 종류, 고른 빌드, 낀 것, 장신구에 쓴 금화 (거둬 오면 투자가 날아가지 않는다) */
  survival: string;
  build: string;
  worn: OwnedTrinket[];
  trinketGold: number;
  /** 고용한 날 (훈련장: 고용 NEW_HIRE_DAYS일 안이면 경험치 +) */
  hiredDay: number;
};
const SPEND = ["보수", "물자", "시설", "생존 장신구", "재료 구매", "해금·조립", "강화", "직업 장신구", "단련", "용병 승급", "길드 승급"] as const;
type Spend = (typeof SPEND)[number];
const SEEDS = sampleSeeds();
const PACK5: Record<SupplyKind, number> = { bandage: 2, antidote: 1, potion: 2, greaterPotion: 0 };

/** 단계 지표: 동3=0, 동2=1, 동1=2, 은3=3 … */
const stageIdx = (m: Member) => (m.seed.level === "bronze" ? 0 : 3) + m.growth.lv;
const mercOf = (m: Member): Merc => ({ ...buildMerc(m.seed)!, stats: m.growth.stats, subLevels: m.levels, gear: trinketsBonus(m.worn) });
const SURVIVALS = TRINKETS.filter((t) => t.kind === "survival").map((t) => t.id);
/** 빌드의 생존용 장신구 (먼저 산다). 나머지 하나는 공격용 */
const DEFENSIVE = new Set([
  "t_oath_badge", "t_blood_gauntlet", "t_rampart_stud", "t_vengeance_crest", "t_giant_bangle", "t_whirl_band", "t_shadow_cloak", "t_antidote_charm",
  "t_iron_girdle", "t_wave_anklet", "t_camo_cloak", "t_leather_vest", "t_core_rosary", "t_penance_chain", "t_mana_necklace", "t_blood_seal", "t_lute_strap", "t_tusk_bell",
]);
const jobTrinkets = (job: string, build: string) =>
  TRINKETS.filter((t) => t.kind === "job" && t.job === job && t.build === build).sort((a, b) => Number(DEFENSIVE.has(b.id)) - Number(DEFENSIVE.has(a.id)));

type Config = { trinkets: boolean; name: string };

function campaign(c: number, retreat: boolean, cfg: Config) {
  const r = rng(c + 77);
  let hires = 0;
  /** 날짜 (원정마다 내려간 층수만큼 지난다), 시설 레벨 (숙소 3칸) */
  let day = 1;
  const facilities: FacilityLevels = {};
  let discarded = 0;
  let bossRetreats = 0;
  const hire = (exclude: string[]): Member => {
    const pool = SEEDS.filter((s) => !exclude.includes(s.id));
    const base = pool[Math.floor(r() * pool.length)];
    const branches = BRANCHES[base.traits.job as keyof typeof BRANCHES];
    return {
      seed: { ...base, id: `${base.id}#${hires++}`, _base: base.id } as MercSeed,
      growth: { ...NO_GROWTH, stats: {} }, unlocked: [], levels: {}, bossWin: false, invested: 0, unlocks: 0, upgrades: 0, trainings: 0,
      survival: SURVIVALS[Math.floor(r() * SURVIVALS.length)],
      build: branches[Math.floor(r() * branches.length)].id,
      worn: [],
      trinketGold: 0,
      hiredDay: day,
    };
  };
  const baseId = (m: Member) => (m.seed as MercSeed & { _base: string })._base;
  const party: Member[] = [];
  while (party.length < 4) party.push(hire(party.map(baseId)));
  let gold = START_GOLD;
  let salvage: Record<string, number> = {};
  const stash = { ...PACK5 };
  let guildSilver = false, examDone = false;
  const spent: Record<Spend, number> = Object.fromEntries(SPEND.map((k) => [k, 0])) as Record<Spend, number>;
  let income = 0, lost = 0, deaths = 0, unpaid = 0, wipes = 0, lostTrinketGold = 0, bossDeaths = 0;
  /** 거둬 온 장신구 (보관함). 금화는 그 장신구에 든 금화 */
  const box: { t: OwnedTrinket; gold: number }[] = [];
  /** 이번 원정 사이에 상점에서 산 재료 (종류별) */
  const bought: Record<string, number> = {};
  /**
   * 막힌 해금·강화에 필요한 재료를 상점에서 산다 (계열 재료·기술 파편만, 종류별 한도).
   * 모자란 재료를 다 살 수 있고 그 뒤 본 비용(extraGold)도 낼 수 있을 때만 산다
   */
  const cover = (need: Record<string, number>, extraGold: number, m?: Member): boolean => {
    const buys: [string, number, number][] = [];
    let buyGold = 0;
    for (const [id, n] of Object.entries(need)) {
      const miss = n - (salvage[id] ?? 0);
      if (miss <= 0) continue;
      const price = materialPrice(id);
      if (price === null || (bought[id] ?? 0) + miss > MATERIAL_SHOP.perExpedition) return false;
      buys.push([id, miss, price]);
      buyGold += price * miss;
    }
    if (gold < buyGold + extraGold) return false;
    for (const [id, miss, price] of buys) {
      salvage[id] = (salvage[id] ?? 0) + miss;
      bought[id] = (bought[id] ?? 0) + miss;
      pay("재료 구매", price * miss, m);
    }
    return true;
  };
  const canPay = (cost: { gold: number; salvage: Record<string, number> }) => gold >= cost.gold && Object.entries(cost.salvage).every(([k, n]) => (salvage[k] ?? 0) >= n);
  /** 장신구 한 단계 (만들기·강화). 됐으면 true */
  const forge = (m: Member, id: string, kind: Spend): boolean => {
    const owned = m.worn.find((w) => w.id === id);
    const lv = owned ? owned.lv + 1 : 1;
    if (lv > 3) return false;
    const cost = forgeCost(getTrinket(id)!, lv);
    if (!canPay(cost)) return false;
    salvage = paySalvage(salvage, cost.salvage);
    pay(kind, cost.gold);
    m.trinketGold += cost.gold;
    if (owned) owned.lv = lv;
    else m.worn.push({ id, lv: 1 });
    return true;
  };
  /** 보관함에서 낄 만한 장신구를 꺼내 낀다 */
  const fromBox = (m: Member, ok: (id: string) => boolean) => {
    if (m.worn.length >= 2) return;
    const i = box.findIndex((x) => ok(x.t.id) && !m.worn.some((w) => w.id === x.t.id));
    if (i < 0) return;
    const [x] = box.splice(i, 1);
    m.worn.push(x.t);
    m.trinketGold += x.gold;
  };
  const goldBefore: number[] = [], goldAfter: number[] = [], depths: number[] = [];
  const pay = (k: Spend, n: number, m?: Member) => {
    gold -= n;
    spent[k] += n;
    if (m) m.invested += n;
  };

  for (let t = 1; t <= TRIPS; t++) {
    const avg = party.reduce((a, m) => a + stageIdx(m), 0) / party.length;
    const depth = Math.min(3, 1 + Math.floor(avg));
    depths.push(depth);
    const mercs = party.map(mercOf);
    // 가방: 시작 짐 5개를 챙기고(나머지는 창고), 의무실 무료 물자를 더한다
    const carry = Object.fromEntries(KINDS.map((k) => [k, Math.min(stash[k], PACK5[k])])) as Record<SupplyKind, number>;
    for (const k of KINDS) stash[k] -= carry[k];
    for (const [k, n] of Object.entries(INFIRMARY[(facilities.infirmary ?? 0) - 1] ?? {}) as [SupplyKind, number][]) carry[k] += n;
    const res = run(mercs, depth, c * 1000 + t * 17 + (retreat ? 7 : 0), retreat, carry, { bag: bagSlots(facilities), scout: SCOUT_CHANCE[guildSilver ? "silver" : "bronze"], bossRetreat: BOSS_RETREAT });
    if (res.bossRetreated) bossRetreats++;
    discarded += res.discarded;
    day += res.exp.depth;
    // 상점 재료 구매 한도는 원정마다 다시 찬다
    for (const k of Object.keys(bought)) delete bought[k];
    const exp = res.exp;
    if (!res.ok) wipes++;
    bossDeaths += res.bossDeaths;
    // 들고 간 물자: 살아 돌아오면 남은 것, 전멸하면 잃는다
    if (res.ok) for (const k of KINDS) stash[k] += exp.supplies[k] ?? 0;
    // 수입: 금화 + 유물 판매 (재료는 팔지 않고 해금·강화용으로 모은다)
    if (res.ok) {
      const got = exp.gold + exp.loot.reduce((a, id) => a + (getRelic(id)?.value ?? 0), 0);
      income += got;
      gold += got;
      for (const [id, n] of Object.entries(exp.salvage ?? {})) salvage[id] = (salvage[id] ?? 0) + n;
    }
    const bossHere = res.ok && (exp.feats ?? []).some((f) => (PROOF_BOSSES.bronze ?? []).includes(f.monsterId));
    if (bossHere) examDone = true;
    // 경험치·사망
    for (let i = 0; i < party.length; i++) {
      const m = party[i];
      const mem = exp.members.find((x) => x.id === m.seed.id)!;
      if (mem.dead) {
        deaths++;
        lost += m.invested;
        // 장신구: 살아 돌아온 원정이면 (이 시뮬은 전투 중에 도망치지 않아 죽은 전투는 이긴 전투) 거둬 온다, 전멸이면 잃는다
        if (res.ok) for (const w of m.worn) box.push({ t: w, gold: Math.round(m.trinketGold / m.worn.length) });
        else {
          lost += m.trinketGold;
          lostTrinketGold += m.trinketGold;
        }
        party[i] = hire(party.map(baseId));
        continue;
      }
      if (!res.ok) continue;
      if (bossHere) m.bossWin = true;
      // 훈련장: 고용 NEW_HIRE_DAYS일 안이면 경험치 +
      const fresh = (facilities.training ?? 0) > 0 && day - m.hiredDay < NEW_HIRE_DAYS;
      const xp = Math.round(xpFor(exp, m.seed.level) * (fresh ? 1 + TRAINING_XP[(facilities.training ?? 1) - 1] : 1));
      m.growth = gainXp(m.growth, xp, m.seed.traits.job).growth;
    }
    // 보수: 살아 돌아온 동행 용병 (새로 고용한 용병은 다음 원정부터)
    const survivors = party.filter((m) => exp.members.some((x) => x.id === m.seed.id && !x.dead));
    for (const m of survivors) {
      const w = wageOf(mercOf(m));
      const paid = Math.min(w, Math.max(0, gold));
      unpaid += w - paid;
      pay("보수", paid);
    }
    goldBefore.push(gold);

    // 1) 물자 보충: 시작 짐 5개 (붕대 2, 해독제 1, 물약 2)
    for (const k of KINDS)
      while (stash[k] < PACK5[k] && gold >= PRICE[k]) {
        stash[k]++;
        pay("물자", PRICE[k]);
      }
    // 1.5) 시설: 의무실 → 가방 → 훈련장 → 위령비 (숙소는 3칸이라 위령비는 칸이 없다). 길드 은이면 2레벨도 같은 순서로
    for (const want of [1, 2]) {
      if (want === 2 && !guildSilver) break;
      for (const id of FACILITY_ORDER) {
        const lv = facilities[id] ?? 0;
        if (lv !== want - 1) continue;
        const used = Object.values(facilities).filter((x) => (x ?? 0) > 0).length;
        if (lv === 0 && used >= FACILITY_SLOTS.inn) continue;
        const cost = getFacility(id).cost[lv];
        if (gold < cost) break;
        pay("시설", cost);
        facilities[id] = lv + 1;
      }
    }
    // 2) 공용 생존 장신구: 모두 1단계를 먼저, 그다음 2·3단계 (1명당 1개)
    if (cfg.trinkets) {
      for (const m of party) {
        fromBox(m, (id) => getTrinket(id)?.kind === "survival" && !m.worn.some((w) => getTrinket(w.id)?.kind === "survival"));
        if (!m.worn.some((w) => getTrinket(w.id)?.kind === "survival")) forge(m, m.survival, "생존 장신구");
      }
      for (let lv = 2; lv <= 3; lv++)
        for (const m of party) {
          const s0 = m.worn.find((w) => getTrinket(w.id)?.kind === "survival");
          if (s0 && s0.lv === lv - 1) forge(m, s0.id, "생존 장신구");
        }
    }
    // 3) 조각 해금: 동 메인 조각을 뚫어 바로 조립 (장착 4칸까지). 재료가 모자라면 상점에서 사서 (재료 구매)
    for (const m of party) {
      for (;;) {
        if (m.seed.skills.length >= 4) break;
        const owner = { job: m.seed.traits.job, race: m.seed.traits.race, level: m.seed.level };
        const known = knownFragments(m.seed, [], m.unlocked);
        const mains = fragmentsFor(owner)
          .filter((f) => f.kind === "main" && f.cost && (f.tier ?? "bronze") === "bronze" && !known.includes(f.id))
          .sort((a, b) => a.cost!.gold - b.cost!.gold);
        // 재료가 모자라면 상점에서 사서 채운다 (cover)
        const f = mains.find((x) => gold >= x.cost!.gold + CRAFT_COST && cover(x.cost!.salvage, x.cost!.gold + CRAFT_COST, m));
        if (!f) break;
        const subs = known.filter((id) => getFragment(id)?.kind === "sub");
        const build = [...subs.map((id) => normalize({ main: f.id, subs: [id] })), normalize({ main: f.id, subs: [] })].find((b) => !validateSkill(owner, b));
        if (!build) break;
        salvage = paySalvage(salvage, f.cost!.salvage);
        pay("해금·조립", f.cost!.gold + CRAFT_COST, m);
        m.unlocked.push(f.id);
        m.seed = { ...m.seed, skills: [...m.seed.skills, build] };
        m.unlocks++;
      }
    }
    // 4) 강화: 장착한 스킬의 부 조각. 재료가 모자라면 상점에서 사서 (재료 구매)
    for (const m of party)
      for (const id of [...new Set(m.seed.skills.flatMap((b) => b.subs))]) {
        const f = getFragment(id);
        if (!f) continue;
        for (let lv = m.levels[id] ?? 1; lv < MAX_SUB_LEVEL; lv++) {
          const cost = upgradeCost(f, lv + 1);
          if (!cost || gold < cost.gold || !cover(cost.salvage, cost.gold, m)) break;
          salvage = paySalvage(salvage, cost.salvage);
          pay("강화", cost.gold, m);
          m.levels[id] = lv + 1;
          m.upgrades++;
        }
      }
    // 5) 직업 장신구: 빌드의 생존용 먼저 (칸이 2개라 생존 장신구를 끼면 직업 장신구는 1개). 1단계 → 3단계
    if (cfg.trinkets)
      for (const m of party) {
        const job = m.seed.traits.job;
        fromBox(m, (id) => getTrinket(id)?.kind === "job" && getTrinket(id)?.job === job);
        for (const t of jobTrinkets(job, m.build)) {
          const has = m.worn.find((w) => w.id === t.id);
          if (!has && m.worn.length >= 2) continue;
          while (forge(m, t.id, "직업 장신구"));
          if (m.worn.find((w) => w.id === t.id)?.lv !== 3) break;
        }
      }
    // 6) 단련: 주 스탯에 3점 (비용은 그 용병의 단련 횟수만큼 오른다)
    for (const m of party)
      while (m.growth.trainable > 0 && gold >= trainingCost(m.trainings)) {
        pay("단련", trainingCost(m.trainings), m);
        const stat = JOB_STAT[m.seed.traits.job];
        m.growth = { ...m.growth, trainable: m.growth.trainable - 1, stats: addStats(m.growth.stats, { [stat]: 3 } as StatBlock) };
        m.trainings++;
      }
    // 7) 승급: 길드 승급 (시험 = 3층 던전 보스, 금화) → 용병 승급 (승급용 경험치 + 보스 승리 기록 + 길드 은 + 금화)
    const guildCost = GUILD_PROMOTION.silver!.gold;
    if (!guildSilver && examDone && gold >= guildCost) {
      pay("길드 승급", guildCost);
      guildSilver = true;
    }
    for (const m of party) {
      const cost = RANKS.silver.promoteCost!;
      if (m.seed.level !== "bronze" || !canPromote(m.growth) || !m.bossWin || !guildSilver || gold < cost) continue;
      // 승급 패시브는 A/B 중 무작위
      const choices = promotionChoices(m.seed).passives;
      const next = promote(m.seed, { passive: choices[Math.floor(r() * choices.length)] });
      if (!next) continue;
      pay("용병 승급", cost, m);
      m.seed = next;
      m.growth = { lv: 0, xp: 0, trainable: m.growth.trainable + PROMOTE_BONUS.trainable, stats: addStats(m.growth.stats, { hp: PROMOTE_BONUS.hp }) };
    }
    goldAfter.push(gold);
  }
  return {
    goldBefore, goldAfter, depths, spent, income, lost, deaths, bossDeaths, unpaid, wipes, guildSilver, discarded, bossRetreats,
    facilities: FACILITY_ORDER.map((id) => `${getFacility(id).name} ${facilities[id] ?? 0}`).join(", "),
    stage: party.reduce((a, m) => a + stageIdx(m), 0) / party.length,
    silver: party.filter((m) => m.seed.level !== "bronze").length,
    unlocks: party.reduce((a, m) => a + m.unlocks, 0),
    upgrades: party.reduce((a, m) => a + m.upgrades, 0),
    trainings: party.reduce((a, m) => a + m.trainings, 0),
    salvageLeft: Object.values(salvage).reduce((a, b) => a + b, 0),
    lostTrinketGold,
    trinketLv: party.reduce((a, m) => a + m.worn.reduce((x, w) => x + w.lv, 0), 0),
    survivalOn: party.filter((m) => m.worn.some((w) => getTrinket(w.id)?.kind === "survival")).length,
  };
}

const STAGE_NAME = (x: number) => {
  const i = Math.floor(x);
  return i >= 3 ? rankLabel("silver", i - 3) : rankLabel("bronze", i);
};

it("캠페인", () => {
  assertMockAI();
  const POLICIES = (process.env.POLICY ?? "retreat") === "both" ? [false, true] : [(process.env.POLICY ?? "retreat") === "retreat"];
  const CONFIGS: Config[] = (process.env.CONFIGS ?? "trinkets")
    .split(",")
    .map((k) => (k === "none" ? { trinkets: false, name: "장신구 없음" } : { trinkets: true, name: "장신구 있음" }));
  const pol = (r: boolean) => (r ? "후퇴 정책" : "후퇴 없음");
  const all: { cfg: Config; retreat: boolean; xs: ReturnType<typeof campaign>[] }[] = [];
  for (const cfg of CONFIGS) for (const retreat of POLICIES) all.push({ cfg, retreat, xs: Array.from({ length: CAMPAIGNS }, (_, c) => campaign(c + 1, retreat, cfg)) });
  const label = (x: (typeof all)[number]) => `${x.cfg.name} · ${pol(x.retreat)}`;

  const r = new Report("campaign");
  r.line(`# 캠페인 시뮬레이션 · ${CAMPAIGNS}캠페인 × 원정 ${TRIPS}번`);
  r.line(`시작 금화 ${START_GOLD} · 시작 짐 5개 · 깨우기 포함 · 필요 경험치 ${XP_TO_NEXT.join("/")} · 단련 ${trainingCost(0)}+10×횟수 · 상점 재료 계열 ${MATERIAL_SHOP.material}·파편 ${MATERIAL_SHOP.shard} (원정마다 종류별 ${MATERIAL_SHOP.perExpedition}개)`);
  r.line("층: 파티 평균 단계 내림 + 1 (최대 3층) · 수입 = 금화 + 유물 판매가 (유실물·재료는 팔지 않는다)");
  r.line("지출 순서: 물자 → 시설(의무실 → 가방 → 훈련장 → 위령비, 숙소 3칸) → 생존 장신구 → (재료 구매) 해금·조립 → (재료 구매) 강화 → 직업 장신구 → 단련 → 승급");
  r.line(`보스 앞 후퇴: 다음 칸이 보스인데 파티 체력 ${pct(BOSS_RETREAT)} 아래이거나 죽은 동료가 있으면 돌아간다 · 목표: 사망 ${TARGET.deaths[0]}~${TARGET.deaths[1]}명, 남은 금화 ${TARGET.gold} 이하`);
  r.line("가방: 시설 레벨 칸 수, 넘치면 가치가 낮은 칸부터 자동으로 버린다 · 길잡이 능력: 길드 등급 확률 · 클랜은 만들지 않는다 (숙소 단계)\n");
  r.line(`## 요약 (${TRIPS}회 시점)\n`);
  r.table(
    ["설정", "사망 (합)", "그중 목적지 전투", "보스 앞 후퇴", "전멸 원정", "가방이 꽉 차 버린 개수", "남은 금화", "평균 단계", "은 용병", "길드 은", "장신구 단계 합", "날아간 투자"],
    all.map((x) => {
      const st = mean(x.xs.map((v) => v.stage));
      return [
        label(x),
        mean(x.xs.map((v) => v.deaths)).toFixed(1),
        mean(x.xs.map((v) => v.bossDeaths)).toFixed(1),
        mean(x.xs.map((v) => v.bossRetreats)).toFixed(1),
        mean(x.xs.map((v) => v.wipes)).toFixed(2),
        mean(x.xs.map((v) => v.discarded)).toFixed(1),
        mean(x.xs.map((v) => v.goldAfter[TRIPS - 1])).toFixed(0),
        `${st.toFixed(2)} (${STAGE_NAME(st)})`,
        mean(x.xs.map((v) => v.silver)).toFixed(2),
        pct(mean(x.xs.map((v) => (v.guildSilver ? 1 : 0)))),
        mean(x.xs.map((v) => v.trinketLv)).toFixed(1),
        mean(x.xs.map((v) => v.lost)).toFixed(0),
      ];
    }),
  );
  r.line(`시설 (첫 캠페인 예): ${all[0]?.xs[0]?.facilities ?? ""}\n`);
  r.line("## 총수입 대비 지출처\n");
  r.table(
    ["설정", "총수입", ...SPEND, "남은 금화"],
    all.map((x) => {
      const inc = mean(x.xs.map((v) => v.income));
      return [label(x), inc.toFixed(0), ...SPEND.map((k) => `${mean(x.xs.map((y) => y.spent[k])).toFixed(0)} (${pct(mean(x.xs.map((y) => y.spent[k])) / inc)})`), mean(x.xs.map((v) => v.goldAfter[TRIPS - 1])).toFixed(0)];
    }),
  );
  r.line("## 회차별 보유 금화 (지출 후 평균)\n");
  r.table(["회차", ...all.map(label)], Array.from({ length: TRIPS }, (_, t) => [t + 1, ...all.map((x) => mean(x.xs.map((v) => v.goldAfter[t])).toFixed(0))]));
  console.log(`[sim] ${r.save()}`);
}, 3_600_000);
