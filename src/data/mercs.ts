import type { Merc } from "@/game/types";

/**
 * 스토리가 있는 고유 용병. 랜덤 용병과 달리 직접 설계한다.
 * 아직 없다. 추가하면 길드 명단(components/game/state.ts의 initialState)에 넣는다.
 */
export const MERCS: Merc[] = [];

export function getMerc(id: string): Merc | undefined {
  return MERCS.find((m) => m.id === id);
}
