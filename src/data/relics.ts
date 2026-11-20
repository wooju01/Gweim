// 유물. 던전에서 얻어 마을에서 판다. (나중: 유물에서 직업 전용 장비가 나온다)
import type { Rng } from "@/game/random";

export type Relic = {
  id: string;
  name: string;
  description: string;
  /** 상점에 팔 때 받는 금화 */
  value: number;
  /** 등장 가중치 */
  rarity: number;
};

export const RELICS: Relic[] = [
  { id: "cracked_chalice", name: "금 간 은잔", description: "금이 갔어도 세공이 곱다. 옛 연회에서 쓰던 잔이다.", value: 30, rarity: 10 },
  { id: "feather_charm", name: "무지개 깃털 부적", description: "알록달록한 깃털을 엮었다. 행운을 부른다는 말이 있다.", value: 25, rarity: 10 },
  { id: "nameless_idol", name: "이름 없는 신상", description: "손바닥만 한 석상. 무엇을 섬기던 것인지 학자들도 의견이 갈린다.", value: 35, rarity: 8 },
  { id: "spirit_shard", name: "정령석 파편", description: "손에 쥐면 따뜻하다. 엘프들은 정령이 잠깐 쉬어 가는 돌이라고 한다.", value: 40, rarity: 6 },
  { id: "crown_fragment", name: "옛 왕관 조각", description: "옛 왕국의 문장이 반쯤 남아 있다. 어느 왕의 것이었을까.", value: 45, rarity: 5 },
  { id: "crystal_eye", name: "수정 구슬", description: "들여다보면 반짝이는 무늬가 천천히 소용돌이친다.", value: 50, rarity: 4 },
  { id: "dwarf_signet", name: "씨족 인장 반지", description: "무거운 금반지. 안쪽에 낯선 씨족의 이름이 새겨져 있다.", value: 55, rarity: 3 },
  { id: "sealed_scroll", name: "봉인된 두루마리", description: "밀랍 봉인이 그대로다. 학자들이 비싸게 사 간다.", value: 70, rarity: 2 },
];

export function getRelic(id: string): Relic | undefined {
  return RELICS.find((r) => r.id === id);
}

/** 희귀도 가중치로 유물 하나 */
export function rollRelic(rng: Rng): Relic {
  const total = RELICS.reduce((s, r) => s + r.rarity, 0);
  let roll = rng.next() * total;
  return RELICS.find((r) => (roll -= r.rarity) < 0) ?? RELICS[0];
}
