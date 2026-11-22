// 클랜 단계 시뮬레이션: 객실 용병이 GUEST_DAYS일 안에 신뢰(호감 75)에 닿아 클랜에 가입하는 비율.
// 실제 게임의 호감 규칙을 그대로 쓴다: 전투에서 물자를 받으면 +, 쓰러진 동료를 데려오면 +, 사건 선택지의 태도에 반응,
// 동료가 죽으면 -, 집에서 1:1 대화(태도 반응·반복 감쇠). 보수는 제때 준다고 본다.
// 가정: 원정 파티 = 클랜원 3명(MEMBERS 등급) + 객실 용병 1명(동3, 새로 모집한 시작 호감), 후퇴 정책 + 보스 앞 후퇴,
//       귀환마다 대화 2회 중 1회는 객실 용병 (가장 좋아하는 태도를 고른다), 호감 75 이상이면 가입을 청한다 (실패하면 다음 귀환에)
// 실행: npm run sim -- clan  (GUESTS=300, MEMBERS=bronze1). 결과: scripts/sim/results/날짜-clan.md
import { it } from "vitest";
import { BOND } from "@/data/bond";
import { CLAN_JOIN, GUEST_DAYS } from "@/data/clan";
import { DEATH } from "@/data/death";
import { applyTone, clampStat, toneDeltas } from "@/game/merc/affinity";
import { buildMerc, resolveTraits, rollStart } from "@/game/merc/generate";
import { clanJoinChance } from "@/game/quests";
import { rescueBonds } from "@/game/dungeon/expedition";
import { ChoiceTone } from "@/lib/schemas";
import type { Merc } from "@/game/types";
import { sampleSeeds } from "@/data/sampleRoster";
import { run, PACKS } from "./expedition";
import { GRADES, gradeParty, rng } from "./party";
import { Report, mean, pct } from "./report";
import { assertMockAI } from "./setup";

const GUESTS = Number(process.env.GUESTS ?? 300);
const MEMBERS = process.env.MEMBERS ?? "bronze1";
/** 보스 앞 후퇴: 파티 체력 이 비율 아래면 (캠페인과 같다) */
const BOSS_RETREAT = 0.7;

type Trial = { joined: boolean; day: number | null; died: boolean; left: boolean; start: number; end: number; trips: number; reachedTrust: boolean };

function trial(i: number): Trial {
  const r = rng(i + 4242);
  const g = GRADES[MEMBERS];
  // 클랜원 3명 (객실 용병과 겹치지 않게)
  const seeds = sampleSeeds();
  const guestSeed = seeds[Math.floor(r() * seeds.length)];
  const members = gradeParty(i + 1, g).filter((m) => m.id !== guestSeed.id).slice(0, 3);
  // 새로 모집한 용병의 시작 호감 (모집 규칙 그대로)
  const start = rollStart(resolveTraits(guestSeed.traits) ?? [], r).affinity;
  const guest: Merc = { ...buildMerc(guestSeed)!, id: "guest", level: "bronze", stats: {} };
  let affinity = start;
  let recentTones: ReturnType<typeof applyTone>["recentTones"] = [];
  let reachedTrust = start >= CLAN_JOIN.minAffinity;
  const party = [...members, guest];
  const stageOf = (m: Merc) => (m.id === "guest" ? 0 : g.levels);
  const depth = Math.min(3, 1 + Math.floor(party.reduce((a, m) => a + stageOf(m), 0) / party.length));
  let day = 1;
  for (let t = 0; t < 40; t++) {
    const res = run(party, depth, i * 977 + t * 13 + 5, true, { ...PACKS["5"] }, { bossRetreat: BOSS_RETREAT });
    day += res.exp.depth;
    const me = res.exp.members.find((m) => m.id === "guest")!;
    if (me.dead) return { joined: false, day: null, died: true, left: false, start, end: affinity, trips: t + 1, reachedTrust };
    // 원정 중 호감: 물자를 받음, 사건 태도 반응, 쓰러진 동료를 데려옴, 동료의 죽음
    affinity = clampStat(affinity + (res.gifts.guest ?? 0) * BOND.giftAffinity);
    for (const tone of res.tones) affinity = applyTone(guest, { affinity, willingness: 100, recentTones: [] }, tone).affinity;
    if (res.ok) affinity = clampStat(affinity + (rescueBonds(res.exp).guest ?? 0));
    const dead = res.exp.members.filter((m) => m.dead && m.id !== "guest").length;
    affinity = clampStat(affinity + dead * DEATH.allyAffinity);
    // 기한이 지났으면 떠난다
    if (day > 1 + GUEST_DAYS) return { joined: false, day: null, died: false, left: true, start, end: affinity, trips: t + 1, reachedTrust };
    // 집: 1:1 대화 한 번 (가장 좋아하는 태도, 반복 감쇠)
    const best = ChoiceTone.options.map((tone) => ({ tone, d: toneDeltas(guest, tone, recentTones).affinity })).sort((a, b) => b.d - a.d)[0];
    const talked = applyTone(guest, { affinity, willingness: 100, recentTones }, best.tone);
    affinity = talked.affinity;
    recentTones = talked.recentTones;
    if (affinity >= CLAN_JOIN.minAffinity) reachedTrust = true;
    // 가입을 청한다
    const chance = clanJoinChance(affinity, guest.traitIds?.personalities ?? [], guest.traitIds?.background, 0);
    if (chance > 0 && r() < chance) return { joined: true, day, died: false, left: false, start, end: affinity, trips: t + 1, reachedTrust };
  }
  return { joined: false, day: null, died: false, left: true, start, end: affinity, trips: 40, reachedTrust };
}

it("클랜 단계: 객실 용병 가입 비율", () => {
  assertMockAI();
  const xs = Array.from({ length: GUESTS }, (_, i) => trial(i));
  const r = new Report("clan");
  r.line(`# 클랜 단계 시뮬레이션 · 객실 용병 ${GUESTS}명`);
  r.line(`클랜원 3명(${GRADES[MEMBERS].name}) + 객실 용병 1명(동3) · 후퇴 정책 + 보스 앞 후퇴(체력 ${pct(BOSS_RETREAT)} 아래) · 기한 ${GUEST_DAYS}일 · 가입 조건 호감 ${CLAN_JOIN.minAffinity} 이상 + 수락 판정`);
  r.line("호감: 실제 규칙 (전투에서 물자 받기 +2, 쓰러진 뒤 데려옴, 사건 태도, 동료 사망 -5, 귀환마다 1:1 대화 1회 = 가장 좋아하는 태도). 보수는 제때 준다\n");
  const joined = xs.filter((x) => x.joined);
  r.table(
    ["20일 안에 가입", "신뢰(75)에 닿음", "기한이 지나 떠남", "원정 중 사망", "가입까지 평균 일수", "시작 호감 평균", "끝 호감 평균", "원정 수 평균"],
    [[
      pct(joined.length / GUESTS),
      pct(xs.filter((x) => x.reachedTrust).length / GUESTS),
      pct(xs.filter((x) => x.left).length / GUESTS),
      pct(xs.filter((x) => x.died).length / GUESTS),
      joined.length ? mean(joined.map((x) => x.day! - 1)).toFixed(1) : "-",
      mean(xs.map((x) => x.start)).toFixed(0),
      mean(xs.map((x) => x.end)).toFixed(0),
      mean(xs.map((x) => x.trips)).toFixed(1),
    ]],
  );
  r.line("## 시작 호감별\n");
  const bands: [string, (x: Trial) => boolean][] = [
    ["~39", (x) => x.start < 40],
    ["40~59", (x) => x.start >= 40 && x.start < 60],
    ["60~74", (x) => x.start >= 60 && x.start < 75],
    ["75~", (x) => x.start >= 75],
  ];
  r.table(
    ["시작 호감", "인원", "20일 안에 가입"],
    bands.map(([name, f]) => {
      const b = xs.filter(f);
      return [name, b.length, b.length ? pct(b.filter((x) => x.joined).length / b.length) : "-"];
    }),
  );
  console.log(`[sim] ${r.save()}`);
}, 3_600_000);
