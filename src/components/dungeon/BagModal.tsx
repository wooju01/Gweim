// 가방 창: 가방에 든 것과 칸, 전리품 가치. 가방이 넘치면 저절로 열리고, 버릴 것을 골라야 움직일 수 있다
import { useState } from "react";
import { SUPPLY, type SupplyKind } from "@/data/combat";
import { CURRENCY } from "@/data/economy";
import { KEY_ITEMS, type KeyItemId } from "@/data/keyItems";
import { getRelic } from "@/data/relics";
import { carriedValue, getSalvage } from "@/data/loot";
import { STACK } from "@/data/facilities";
import { bagItems, bagUsed, cheapestSlot, type BagItem, type Expedition } from "@/game/dungeon/expedition";
import { Button } from "@/components/common/parts";

type Props = {
  exp: Expedition;
  onDiscard: (item: { kind: BagItem["kind"]; id: string; n?: number }) => void;
  onClose: () => void;
};

function nameOf(x: BagItem): string {
  switch (x.kind) {
    case "supply":
      return SUPPLY[x.id as SupplyKind]?.name ?? x.id;
    case "salvage":
      return getSalvage(x.id)?.name ?? x.id;
    case "relic":
      return getRelic(x.id)?.name ?? x.id;
    case "key":
      return KEY_ITEMS[x.id as KeyItemId]?.name ?? x.id;
  }
}

export function BagModal({ exp, onDiscard, onClose }: Props) {
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const items = bagItems(exp);
  const used = bagUsed(exp);
  const cap = exp.bag ?? 8;
  const over = used > cap;
  const { value } = carriedValue(exp.gold, exp.loot.map((id) => getRelic(id)?.value ?? 0), exp.salvage ?? {});
  const cheapest = cheapestSlot(exp);
  /** 한 칸을 비우는 데 버릴 개수 */
  const oneSlot = (x: BagItem) => {
    const stack = x.kind === "supply" ? STACK.supply : x.kind === "salvage" ? STACK.item : 1;
    return Math.min(x.n, x.n % stack || stack);
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 p-3" onClick={over ? undefined : onClose} role="dialog" aria-modal aria-label="가방">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-sm border border-ember/40 bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">
              가방 <span className={`text-sm font-normal ${over ? "text-blood" : "text-ash"}`}>{used} / {cap}칸</span>
            </h2>
            <p className="text-xs text-ember">
              전리품 가치 {CURRENCY} {value} (금화 {exp.gold} 포함, 금화는 칸이 없다)
            </p>
            {over && <p className="text-sm text-blood">가방이 꽉 찼다. {used - cap}칸만큼 버려야 다시 움직일 수 있다.</p>}
          </div>
          {!over && (
            <Button className="!px-3 !py-1 text-xs" onClick={onClose}>
              닫기
            </Button>
          )}
        </header>
        {cheapest && (
          <Button className="self-start !px-3 !py-1 text-xs" onClick={() => onDiscard(cheapest)} title="판매가가 가장 낮은 것 한 칸 (히든 열쇠·물자·팔 수 없는 재료는 빼고)">
            가장 싼 것 버리기 · {nameOf(bagItems(exp).find((x) => x.kind === cheapest.kind && x.id === cheapest.id)!)} {cheapest.n}개
          </Button>
        )}
        <p className="text-[11px] text-ash">
          물자 한 칸 {STACK.supply}개 · 재료·유실물 한 칸 {STACK.item}개 · 유물·히든 열쇠는 한 칸에 하나. 버린 것은 되찾을 수 없다.
        </p>
        <ul className="flex flex-col gap-1.5">
          {items.map((x) => (
            <li key={`${x.kind}-${x.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-ink/50 px-3 py-1.5 text-xs">
              <span>
                <b className={x.kind === "key" ? "text-frost" : ""}>{nameOf(x)}</b> ×{x.n}
                <span className="ml-1.5 text-ash">
                  {x.slots}칸{x.value > 0 ? ` · ${CURRENCY} ${x.value}` : ""}
                </span>
              </span>
              {x.kind === "key" ? (
                confirmKey === x.id ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-blood">버리면 사라진다 (창고에서도)</span>
                    <Button
                      variant="danger"
                      className="!px-2 !py-0.5 text-xs"
                      onClick={() => {
                        onDiscard({ kind: "key", id: x.id });
                        setConfirmKey(null);
                      }}
                    >
                      정말 버린다
                    </Button>
                    <Button className="!px-2 !py-0.5 text-xs" onClick={() => setConfirmKey(null)}>
                      그만둔다
                    </Button>
                  </span>
                ) : (
                  <Button className="!px-2 !py-0.5 text-xs" onClick={() => setConfirmKey(x.id)}>
                    버리기
                  </Button>
                )
              ) : (
                <span className="flex gap-1">
                  <Button className="!px-2 !py-0.5 text-xs" onClick={() => onDiscard({ kind: x.kind, id: x.id, n: 1 })}>
                    1개 버리기
                  </Button>
                  {oneSlot(x) > 1 && (
                    <Button className="!px-2 !py-0.5 text-xs" onClick={() => onDiscard({ kind: x.kind, id: x.id, n: oneSlot(x) })}>
                      한 칸 비우기 ({oneSlot(x)}개)
                    </Button>
                  )}
                </span>
              )}
            </li>
          ))}
          {items.length === 0 && <li className="text-xs text-ash">가방이 비어 있다.</li>}
        </ul>
      </div>
    </div>
  );
}
