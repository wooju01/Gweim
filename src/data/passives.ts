// 종족 패시브.
// 모집 시 뽑고, 카드와 AI 프롬프트에 보여 주고, 전투 엔진(combat/engine.ts)이 효과를 낸다.
// 수치는 data/combat.ts의 PASSIVE에 있다. 초안이고 시드 시뮬레이션으로 조정한다.

// 등급표와 모집 확률은 data/ranks.ts에 있다.

export type Passive = {
  id: string;
  /** 종족 id (traits.ts) */
  race: string;
  name: string;
  description: string;
};

export const PASSIVES: Passive[] = [
  // 드워프
  { id: "rock_root", race: "dwarf", name: "바위의 뿌리", description: "방어 +1 (받는 피해 감소 %는 방어 곡선으로)" },
  { id: "crafters_eye", race: "dwarf", name: "장인의 눈썰미", description: "공격 시 20% 확률로 적에게 균열 (받는 피해 +2, 2턴)" },
  { id: "steel_heart", race: "dwarf", name: "강철 심장", description: "출혈·중독에 걸릴 확률 절반" },
  { id: "deep_blood", race: "dwarf", name: "깊은 곳의 피", description: "탐험에서 지나온 칸 2칸마다 공격력 +1 (최대 +3)" },
  { id: "rising_cheer", race: "dwarf", name: "흥이 오른다", description: "맞을 때마다 흥 +1, 3이 되면 다음 공격 2배" },
  // 바바리안
  { id: "blood_thirst", race: "barbarian", name: "피의 갈증", description: "잃은 체력이 많을수록 공격력 증가 (최대 +5)" },
  { id: "pain_oblivion", race: "barbarian", name: "고통 망각", description: "잃은 체력이 많을수록 방어 + (최대 +3)" },
  { id: "war_cry", race: "barbarian", name: "포효", description: "전투 시작 시 적 전체 회피 -10%, 공격력 -2 (2턴)" },
  { id: "peerless_spirit", race: "barbarian", name: "무쌍의 투혼", description: "살아 있는 적 1마리당 공격력 +1" },
  { id: "warrior_pride", race: "barbarian", name: "전사의 긍지", description: "자기 체력 60% 이상일 때 체력 30% 이하인 아군 대신 공격을 맞는다 (라운드당 1회)" },
  // 엘프
  { id: "keen_eye", race: "elf", name: "예리한 눈", description: "치명타 확률 +8%" },
  { id: "wind_blessing", race: "elf", name: "바람 정령의 가호", description: "속도 +3. 라운드에서 먼저 행동할 확률 증가" },
  { id: "feather_step", race: "elf", name: "깃털의 발걸음", description: "공격 회피 10%" },
  { id: "first_strike", race: "elf", name: "선제 일격", description: "전투에서 첫 공격 피해 +50%" },
  { id: "wind_dance", race: "elf", name: "바람의 춤", description: "회피 5%. 회피에 성공하면 다음 공격 피해 +3" },
  // 수인
  { id: "hunters_focus", race: "beastfolk", name: "사냥꾼의 집념", description: "같은 적을 연속 공격할수록 피해 +1 (최대 +3, 대상을 바꾸면 초기화)" },
  { id: "finishing_bite", race: "beastfolk", name: "숨통 끊기", description: "적을 쓰러뜨리면 즉시 한 번 더 행동 (라운드당 1회)" },
  { id: "chase_instinct", race: "beastfolk", name: "추격 본능", description: "체력 30% 이하인 적에게 피해 +3" },
  { id: "beast_reflex", race: "beastfolk", name: "야수의 반사신경", description: "회피 8%, 피하면 즉시 반격" },
  { id: "wild_recovery", race: "beastfolk", name: "야생의 회복력", description: "라운드 시작마다 체력 1 회복" },
  // 인간
  { id: "last_stand", race: "human", name: "사선 돌파", description: "체력 25% 이하가 되면 한 번 각성 (2턴 동안 공격 +4)" },
  { id: "solidarity", race: "human", name: "결속", description: "파티 4명이 모두 살아 있으면 공격 +1" },
  { id: "in_sync", race: "human", name: "손발이 맞는다", description: "길안내자가 건넨 물자 효과 +50%" },
  { id: "improvise", race: "human", name: "임기응변", description: "출혈·중독이 쌓이는 양 -1" },
  { id: "adapt", race: "human", name: "적응", description: "같은 전투에서 같은 적에게 맞을 때마다 그 적을 상대로 방어 +1 (최대 +2)" },
];

export function getPassive(id: string): Passive | undefined {
  return PASSIVES.find((p) => p.id === id);
}

export function passivesOf(race: string): Passive[] {
  return PASSIVES.filter((p) => p.race === race);
}
