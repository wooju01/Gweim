// 길드 명단: 고유 용병(직접 설계)과 랜덤 용병(시드)을 같은 방식으로 다룬다.
import { getMerc } from "../data/mercs";
import type { MercRef } from "../lib/schemas";
import { buildMerc } from "./generate";
import type { Merc } from "./types";

/** 요청에 담긴 용병 참조를 실제 용병으로 바꾼다. 잘못된 참조면 null */
export function mercFromRef(ref: MercRef): Merc | null {
  return ref.kind === "unique"
    ? (getMerc(ref.id) ?? null)
    : buildMerc(ref.seed);
}

export function refId(ref: MercRef): string {
  return ref.kind === "unique" ? ref.id : ref.seed.id;
}
