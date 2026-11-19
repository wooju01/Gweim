// 파티 규칙.

/** 플레이어(길안내자)를 뺀 용병 자리 수 */
export const MERC_SLOTS = 4;

/** 플레이어. 던전의 길을 아는 안내자로, 고용한 용병들을 이끈다. */
export const GUIDE = {
  name: "당신",
  role: "길안내자",
  description: "던전의 길을 아는 안내자. 고용한 용병들을 이끌고 깊은 곳으로 내려간다.",
} as const;
