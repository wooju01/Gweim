import type { HistoryLine, MercReply, Stage, Tone } from "../../lib/schemas";
import type { Merc } from "../../game/types";

/** AI에게 넘기는 이번 턴의 사건. 숫자는 넣지 않는다. */
export type TurnEvent =
  | { kind: "open" }
  | { kind: "talk"; playerText: string; tone: Tone; reaction: "liked" | "disliked" | "indifferent" }
  | { kind: "propose"; joined: boolean };

export type ReplyContext = {
  merc: Merc;
  /** 이번 턴의 계산이 끝난 뒤의 단계 */
  stage: Stage;
  history: HistoryLine[];
  event: TurnEvent;
};

/** 실제 AI와 mock이 똑같이 구현하는 인터페이스 */
export interface MercAI {
  readonly mode: "mock" | "live";
  reply(ctx: ReplyContext): Promise<MercReply>;
  classify(text: string, merc: Merc): Promise<Tone>;
}
