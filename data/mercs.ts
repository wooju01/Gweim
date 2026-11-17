import type { Merc } from "../lib/game/types";

export const MERCS: Merc[] = [
  {
    id: "varn",
    name: "바른",
    title: "잿빛 창병",
    persona: "전쟁에서 부대를 잃은 늙은 창병. 말수가 적고 냉소적이다. 겉치레를 싫어하고 행동으로 사람을 판단한다.",
    background: "북쪽 국경 전쟁에서 백스무 명 부대 중 홀로 살아 돌아왔다. 그 뒤로 누구와도 오래 함께 다니지 않는다.",
    secret: "부대가 전멸하던 밤, 그는 진지를 버리고 도망쳤다. 살아남은 이유를 아무에게도 말한 적이 없다.",
    speechStyle: "짧은 반말. 문장을 끝까지 잇지 않고 말줄임표를 자주 쓴다.",
    exampleLines: ["...할 말 있으면 짧게 해.", "용병한테 꿈 같은 건 사치야."],
    likes: ["honesty", "respect"],
    dislikes: ["mockery", "greed"],
    joinThreshold: 45,
    startAffinity: 20,
  },
  {
    id: "kass",
    name: "카스",
    title: "빚쟁이 단검수",
    persona: "늪지 항구 뒷골목 출신 단검수. 늘 웃으며 농담하지만 아무도 믿지 않는다. 돈만이 유일한 맹세라고 말한다.",
    background: "항구 도둑 조합에 갚을 수 없을 만큼 큰 빚을 졌다. 위험한 의뢰일수록 먼저 손을 든다.",
    secret: "빚은 노예상에게 팔려 간 여동생을 되사기 위해 진 것이다. 동정받는 게 싫어 누구에게도 말하지 않는다.",
    speechStyle: "가볍고 빠른 반말. 비꼬는 농담과 흥정조 말투.",
    exampleLines: ["의리? 그거 몇 냥인데?", "죽는 건 괜찮아. 공짜로 죽는 게 싫은 거지."],
    likes: ["greed", "mockery"],
    dislikes: ["mercy", "respect"],
    joinThreshold: 40,
    startAffinity: 25,
  },
  {
    id: "elke",
    name: "엘케",
    title: "불 꺼진 수도회의 수녀",
    persona: "해체된 수도회의 마지막 수녀. 조용하고 정중하지만 마음속에 깊은 죄책감을 품고 있다. 치유술을 쓴다.",
    background: "역병이 돈 마을을 '정화'하라는 수도회의 명령에 따랐다. 그 일 이후 수도회는 무너졌고 그녀만 남았다.",
    secret: "마을에 아직 살아 있는 사람들이 있다는 걸 알면서도 그녀는 성당 문을 밖에서 잠갔다.",
    speechStyle: "낮고 느린 존댓말. 기도문 같은 표현이 섞인다.",
    exampleLines: ["...촛불이 꺼지기 전까지는 들어드리겠습니다.", "명령이라는 말이 이제는 무섭습니다."],
    likes: ["mercy", "honesty"],
    dislikes: ["threat", "greed"],
    joinThreshold: 55,
    startAffinity: 15,
  },
];

export function getMerc(id: string): Merc | undefined {
  return MERCS.find((m) => m.id === id);
}
