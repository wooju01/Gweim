import { useState } from "react";
import { CURRENCY } from "@/data/economy";
import { PER_POINT, PROMOTE_BONUS } from "@/data/growth";
import type { Passive } from "@/data/passives";
import type { Skill } from "@/data/skills";
import { Element } from "@/lib/schemas";
import { Button } from "@/components/common/parts";

/** 2차 전직 갈래 (화면용) */
export type BranchOption = { id: string; name: string; hint?: string; dualElement?: boolean };
/** 승급 후보. blocks가 있으면 아직 승급할 수 없다 (부족한 조건) */
export type PromotionOffer = { next: string; cost: number; passives: Passive[]; branches: BranchOption[]; ultimate?: Skill; blocks: string[] };
export type PromotionPick = { passive?: string; branch?: string; elements?: Element[] };

const ELEMENT_NAME: Record<Element, string> = { fire: "불", water: "물", wind: "바람", earth: "흙" };

/** 승급: 패시브 후보에서 하나, 금으로 오를 때는 전직 갈래(원소술사면 원소 둘)도 고르고 금화를 낸다 */
export function Promotion({ offer, gold, onDone }: { offer: PromotionOffer; gold: number; onDone: (choice: PromotionPick) => void }) {
  const [passive, setPassive] = useState<string | undefined>();
  const [branch, setBranch] = useState<string | undefined>();
  const [elements, setElements] = useState<Element[]>([]);
  const dual = offer.branches.find((b) => b.id === branch)?.dualElement ?? false;
  const ready =
    offer.blocks.length === 0 && (offer.passives.length === 0 || passive) && (offer.branches.length === 0 || branch) && (!dual || elements.length === 2) && gold >= offer.cost;
  const option = (on: boolean) =>
    `flex flex-col gap-0.5 rounded-sm border px-3 py-2 text-left text-xs transition-colors ${
      on ? "border-ember bg-ember/10" : "border-edge bg-ink/50 hover:border-ember/50"
    }`;
  const toggleElement = (e: Element) =>
    setElements((xs) => (xs.includes(e) ? xs.filter((x) => x !== e) : xs.length < 2 ? [...xs, e] : xs));

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-ember/40 bg-ember/5 p-3">
      <p className="text-sm">
        <b className="text-ember">{offer.next}</b>(으)로 승급 · 최대 체력 +{PROMOTE_BONUS.hp * PER_POINT.hp}, 단련 기회 +{PROMOTE_BONUS.trainable} · 3단계부터 다시 오르고, 보수도 오른다
      </p>
      {offer.blocks.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-blood">
          {offer.blocks.map((b) => (
            <li key={b}>✗ {b}</li>
          ))}
        </ul>
      )}
      {offer.branches.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-ash">2차 전직 (한 번 고르면 바꿀 수 없다)</span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {offer.branches.map((b) => (
              <button key={b.id} className={option(branch === b.id)} onClick={() => setBranch(b.id)}>
                <b>{b.name}</b>
                {b.hint && <span className="text-bone/70">{b.hint}</span>}
              </button>
            ))}
          </div>
          {dual && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-ash">함께 쓸 원소 둘:</span>
              {Element.options.map((e) => (
                <button key={e} className={option(elements.includes(e))} onClick={() => toggleElement(e)}>
                  {ELEMENT_NAME[e]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {offer.passives.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-ash">새 패시브 하나</span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {offer.passives.map((ps) => (
              <button key={ps.id} className={option(passive === ps.id)} onClick={() => setPassive(ps.id)}>
                <b>✦ {ps.name}</b>
                <span className="text-bone/70">{ps.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {offer.ultimate && (
        <p className="text-xs">
          궁극기가 열린다: <b className="text-ember">{offer.ultimate.name}</b>{" "}
          <span className="text-bone/70">— {offer.ultimate.description} (전투당 1번)</span>
        </p>
      )}
      <Button
        variant="ember"
        className="self-start"
        disabled={!ready}
        onClick={() => onDone({ passive, branch, elements: dual ? elements : undefined })}
      >
        {offer.blocks.length > 0 ? "조건이 모자라다" : `${CURRENCY} ${offer.cost} · 승급한다`}
      </Button>
    </div>
  );
}

