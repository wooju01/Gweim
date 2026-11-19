// 보수와 조건 제시 규칙. 순수 함수.
import { WAGE, PAY_TEMPER } from "../data/wages";
import type { Merc } from "./types";

export type OfferKind = "advance" | "share";

/** 용병이 원하는 원정 1회 보수 (몫 약속을 했으면 더 많다) */
export function wageOf(merc: Merc, share = false): number {
  const base = WAGE.base[merc.level ?? "apprentice"];
  const ids = [...(merc.traitIds?.personalities ?? []), merc.traitIds?.background ?? ""];
  const extra = ids.reduce((s, id) => s + (WAGE.extra[id] ?? 0), 0);
  return Math.round((base + extra) * (share ? WAGE.shareMultiplier : 1));
}

/** 선금 액수 */
export function advanceCost(merc: Merc): number {
  return wageOf(merc) * WAGE.advanceMultiple;
}

/** 조건 제시의 효과. 고용 의향·호감 변화와 속마음 */
export function offerEffect(merc: Merc, kind: OfferKind): { willingness: number; affinity: number; note?: string } {
  const ids = [...(merc.traitIds?.personalities ?? []), merc.traitIds?.background ?? ""];
  const tempers = ids.flatMap((id) => (PAY_TEMPER[id] ? [PAY_TEMPER[id]] : []));
  const mult = tempers.reduce((m, t) => m * t.mult, 1);
  const affinity = tempers.reduce((s, t) => s + t.affinity, 0);
  const base = kind === "advance" ? WAGE.advanceWillingness : WAGE.shareWillingness;
  const notes = tempers.flatMap((t) => (t.note ? [t.note] : []));
  return { willingness: Math.round(base * mult), affinity, ...(notes.length ? { note: notes.join(" ") } : {}) };
}
