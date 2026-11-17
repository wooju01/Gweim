import type {
  HistoryLine,
  MercProfile,
  MercReply,
  Stage,
  Tone,
} from "../../lib/schemas";
import type { Resolve } from "../../game/affinity";
import type { Merc, Trait } from "../../game/types";

export type Direction = "up" | "down" | "none";

/** AI에게 넘기는 이번 턴의 사건. 숫자는 넣지 않는다. */
export type TurnEvent =
  | { kind: "open" }
  | {
      kind: "talk";
      playerText: string;
      tone: Tone;
      /** 이번 말로 호감도(마음)가 어떻게 움직였나 */
      affinity: Direction;
      /** 이번 말로 고용 의향(같이 갈 마음)이 어떻게 움직였나 */
      willingness: Direction;
      /** 반응표의 속마음 힌트 */
      note?: string;
    }
  | { kind: "propose"; joined: boolean };

export type ReplyContext = {
  merc: Merc;
  /** 이번 턴의 계산이 끝난 뒤의 호감도 단계 */
  stage: Stage;
  /** 이번 턴의 계산이 끝난 뒤의 고용 의향 단계 */
  resolve: Resolve;
  history: HistoryLine[];
  /** 오래된 대화를 요약한 기억 (없으면 빈 문자열) */
  memory: string;
  event: TurnEvent;
};

/** 기억 요약 입력. 기존 기억에 오래된 대화를 합쳐 새 기억을 만든다. */
export type SummaryInput = {
  merc: Merc;
  memory: string;
  /** 기억으로 접을 오래된 대화 */
  lines: HistoryLine[];
};

/** 랜덤 용병 프로필 생성 입력. 코드가 뽑은 특성만 넘긴다. */
export type ProfileInput = {
  traits: Trait[];
  /** 이미 쓰이는 이름 */
  avoidNames: string[];
};

/** 실제 AI와 mock이 똑같이 구현하는 인터페이스 */
export interface MercAI {
  readonly mode: "mock" | "live";
  reply(ctx: ReplyContext): Promise<MercReply>;
  classify(text: string, merc: Merc): Promise<Tone>;
  /** 특성 조합으로 캐릭터 설정을 한 번 만든다 */
  createProfile(input: ProfileInput): Promise<MercProfile>;
  /** 오래된 대화를 기억으로 요약한다 */
  summarize(input: SummaryInput): Promise<string>;
}
