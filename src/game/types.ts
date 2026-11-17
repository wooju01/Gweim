import type { ChoiceTone } from "../lib/schemas";

export type Merc = {
  id: string;
  name: string;
  /** 카드에 붙는 짧은 호칭 */
  title: string;
  /** 프롬프트용 성격 요약 */
  persona: string;
  /** 플레이어가 대화로 알 수 있는 과거 */
  background: string;
  /** 높은 호감도에서만 드러나는 비밀. 지금은 프롬프트에만 쓰고 UI엔 노출하지 않는다. */
  secret: string;
  speechStyle: string;
  exampleLines: string[];
  likes: ChoiceTone[];
  dislikes: ChoiceTone[];
  joinThreshold: number;
  startAffinity: number;
};
