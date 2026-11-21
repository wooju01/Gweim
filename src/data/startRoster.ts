// 새 게임 시작 용병: 숙소에 고용된 채로 시작하는 동 등급 8명 (2026-11-22, 직접 시험해 보기 쉽게).
// 직업 8개가 모두 다르고(바드 제외), 종족×직업 조합도 모두 다르다. 호감은 30~80 사이로 고르게.
// 프로필은 AI 없이 직접 쓴 것이다. 실제 모집(모집 공고)은 그대로 AI로 만든다.
// (테스트·시뮬레이션용 고정 명단은 data/sampleRoster.ts)
import { resolveTraits, rollStart, seededRandom } from "@/game/merc/generate";
import { rollStartSkills } from "@/game/skills";
import type { MercProfile, MercSeed, MercTraits } from "@/lib/schemas";

type Start = { id: string; traits: MercTraits; passives: string[]; affinity: number; profile: MercProfile };

const STARTERS: Start[] = [
  {
    id: "m-garen",
    traits: { race: "human", job: "guardian", personalities: ["honorable"], background: "veteran", gender: "male" },
    passives: ["solidarity"],
    affinity: 55,
    profile: {
      name: "가렌",
      title: "방패를 내려놓지 않는 수호자",
      persona: "동료가 뒤에 있는 한 물러서지 않는다. 대신 무모한 명령에는 끝까지 이유를 묻는다.",
      background: "성문 수비대에서 이십 년을 서 있었다. 성이 함락된 날에도 마지막까지 문을 지켰다.",
      secret: "그날 문을 연 배신자가 누구인지 알고 있지만 아무에게도 말하지 않았다.",
      speechStyle: "느리고 무게 있는 존댓말.",
      exampleLines: ["뒤는 걱정 마십시오.", "이유를 들려주시면 따르겠습니다."],
    },
  },
  {
    id: "m-sylra",
    traits: { race: "elf", job: "archer", personalities: ["curious"], background: "wanderer", gender: "female" },
    passives: ["keen_eye"],
    affinity: 40,
    profile: {
      name: "실라",
      title: "새 것을 쫓는 궁수",
      persona: "처음 보는 것이면 위험해도 가까이 가 본다. 활 솜씨만큼은 진지하다.",
      background: "숲의 경계 너머가 궁금해서 떠났다. 인간 마을의 시장을 특히 좋아한다.",
      secret: "고향 숲에서는 이미 죽은 사람으로 이름이 지워졌다.",
      speechStyle: "가볍고 빠른 반말. 질문이 많다.",
      exampleLines: ["저건 뭐야? 가 보자!", "한 발이면 충분해."],
    },
  },
  {
    id: "m-borin",
    traits: { race: "dwarf", job: "priest", personalities: ["devout"], background: "excommunicated", gender: "male" },
    passives: ["steel_heart"],
    affinity: 70,
    profile: {
      name: "보린",
      title: "파문당한 망치 사제",
      persona: "교단에서 쫓겨났어도 기도는 멈추지 않는다. 다친 사람을 두고 지나치지 못한다.",
      background: "금지된 치유술을 썼다는 이유로 교단에서 파문당했다. 그 덕에 살아난 아이가 있다.",
      secret: "다시 교단으로 돌아갈 수 있다면 무엇이든 할 생각이다.",
      speechStyle: "투박한 반말에 기도문이 섞인다.",
      exampleLines: ["숨 쉬어. 신께서 아직 널 놓지 않으셨다.", "망치로 고치는 것도 기도다."],
    },
  },
  {
    id: "m-raka",
    traits: { race: "beastfolk", job: "assassin", personalities: ["cynical"], background: "ex_slave", gender: "female" },
    passives: ["chase_instinct"],
    affinity: 35,
    profile: {
      name: "라카",
      title: "웃지 않는 그림자",
      persona: "세상은 값으로 움직인다고 믿는다. 약속보다 선금을 더 믿는다.",
      background: "투기장에서 싸우다 주인을 죽이고 도망쳤다. 그 뒤로 누구에게도 목줄을 허락하지 않는다.",
      secret: "투기장에 두고 온 동생을 찾고 있다.",
      speechStyle: "짧고 냉소적인 반말.",
      exampleLines: ["공짜는 없어.", "등 뒤는 내가 볼게. 값은 따로."],
    },
  },
  {
    id: "m-ulfa",
    traits: { race: "barbarian", job: "greatsword", personalities: ["reckless"], background: "war_orphan", gender: "female" },
    passives: ["blood_thirst"],
    affinity: 60,
    profile: {
      name: "울파",
      title: "먼저 뛰어드는 대검사",
      persona: "생각보다 칼이 먼저 나간다. 이기면 크게 웃고 지면 더 크게 웃는다.",
      background: "전쟁터에서 주운 대검 하나로 자랐다. 부족 이름은 기억나지 않는다.",
      secret: "칼을 처음 쥐여 준 사람이 적군 병사였다.",
      speechStyle: "크고 거친 반말.",
      exampleLines: ["비켜! 내가 먼저다!", "하하, 아직 안 죽었어!"],
    },
  },
  {
    id: "m-nell",
    traits: { race: "human", job: "mage", personalities: ["timid"], background: "academy_dropout", gender: "male" },
    passives: ["improvise"],
    affinity: 45,
    profile: {
      name: "넬",
      title: "겁 많은 낙제 마법사",
      persona: "늘 최악을 먼저 떠올린다. 그래서 준비만큼은 누구보다 철저하다.",
      background: "마법 학원에서 실기 시험만 세 번 떨어졌다. 학비를 갚으려고 길드에 왔다.",
      secret: "시험에서 떨어진 건 실력이 아니라 무대 공포 때문이다.",
      speechStyle: "작고 조심스러운 존댓말. 말끝을 흐린다.",
      exampleLines: ["저, 저기… 함정일 수도 있어요…", "주문은 외워 뒀어요. 아마도요."],
    },
  },
  {
    id: "m-thane",
    traits: { race: "dwarf", job: "knight", personalities: ["proud"], background: "fallen_noble", gender: "male" },
    passives: ["rock_root"],
    affinity: 80,
    profile: {
      name: "세인",
      title: "몰락한 가문의 기사",
      persona: "가문의 이름에 먹칠하는 일은 하지 않는다. 그 이름을 다시 세우는 것이 꿈이다.",
      background: "광산 귀족 가문의 막내였다. 가문이 빚에 무너진 뒤 갑옷 한 벌만 남았다.",
      secret: "가문을 무너뜨린 빚은 형이 도박으로 진 것이다.",
      speechStyle: "격식 차린 하오체.",
      exampleLines: ["내 가문의 이름을 걸고 지키겠소.", "기사는 등을 보이지 않소."],
    },
  },
  {
    id: "m-mika",
    traits: { race: "beastfolk", job: "monk", personalities: ["optimistic"], background: "aspiring_adventurer", gender: "female" },
    passives: ["wild_recovery"],
    affinity: 30,
    profile: {
      name: "미카",
      title: "모험을 꿈꾸는 무투가",
      persona: "뭐든 잘될 거라고 믿는다. 넘어져도 툭 털고 일어난다.",
      background: "산골 수도원에서 권법을 배우다 모험담에 빠져 뛰쳐나왔다.",
      secret: "수도원에는 잠깐 바람 쐬러 나간다고만 말했다.",
      speechStyle: "밝고 힘찬 반말.",
      exampleLines: ["괜찮아, 다음엔 잘될 거야!", "주먹이면 다 돼!"],
    },
  },
];

/** 시작 용병 시드 (시드 고정이라 매번 같다) */
export function startSeeds(): MercSeed[] {
  return STARTERS.map((s, i) => ({
    id: s.id,
    traits: s.traits,
    start: { ...rollStart(resolveTraits(s.traits) ?? [], seededRandom(3000 + i)), affinity: s.affinity, willingness: 100 },
    level: "bronze",
    passives: s.passives,
    skills: rollStartSkills({ job: s.traits.job, race: s.traits.race, level: "bronze" }, seededRandom(4000 + i)),
    profile: s.profile,
  }));
}

/** 처음 원정 파티 (숙소에서 바꿀 수 있다): 수호자·사제·궁수·대검사 */
export const START_PARTY = ["m-garen", "m-borin", "m-sylra", "m-ulfa"];
