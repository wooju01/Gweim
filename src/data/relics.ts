// 유물. 던전에서 얻어 마을에서 판다. (나중: 유물에서 직업 전용 장비가 나온다)
import type { Rng } from "../game/random";

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
  { id: "cracked_chalice", name: "금 간 성배", description: "바닥에 말라붙은 무언가가 남아 있다. 누가 마지막으로 마셨을까.", value: 30, rarity: 10 },
  { id: "feather_charm", name: "검은 깃털 부적", description: "끈이 닳아 끊어지기 직전이다. 주인을 지켜 주지는 못한 모양이다.", value: 25, rarity: 10 },
  { id: "nameless_idol", name: "이름 없는 신상", description: "얼굴이 깎여 나간 작은 석상. 무엇을 섬기던 것인지 아무도 모른다.", value: 35, rarity: 8 },
  { id: "spirit_shard", name: "정령석 파편", description: "손에 쥐면 희미하게 따뜻하다. 안에서 무언가 숨 쉬는 듯하다.", value: 40, rarity: 6 },
  { id: "crown_fragment", name: "녹슨 왕관 조각", description: "무너진 지하 왕국의 문장이 반쯤 남아 있다.", value: 45, rarity: 5 },
  { id: "crystal_eye", name: "수정 눈알", description: "들여다보면 이쪽을 마주 보는 것 같다.", value: 50, rarity: 4 },
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
