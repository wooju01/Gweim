import { SUPPLY, type SupplyKind } from "@/data/combat";
import { CURRENCY, PACK_LIMIT, PRICE } from "@/data/economy";
import { getRelic } from "@/data/relics";
import { getSalvage } from "@/data/loot";
import { Button } from "@/components/common/parts";
import { TownBar } from "./TownBar";

type Props = {
  day: number;
  gold: number;
  pack: Record<SupplyKind, number>;
  stock: Record<SupplyKind, number>;
  relics: string[];
  salvage: Record<string, number>;
  onBuy: (item: SupplyKind) => void;
  onSell: (index: number) => void;
  onSellSalvage: (id: string, all: boolean) => void;
  onBack: () => void;
};

const SUPPLY_ORDER: SupplyKind[] = ["bandage", "antidote", "potion"];

/** 상점: 원정 물자를 사서 짐에 넣고, 던전에서 가져온 유물을 판다 */
export function ShopScreen({ day, gold, pack, stock, relics, salvage, onBuy, onSell, onSellSalvage, onBack }: Props) {
  const salvageItems = Object.entries(salvage).filter(([, n]) => n > 0);
  const packed = Object.values(pack).reduce((a, b) => a + b, 0);
  const total = relics.reduce((s, id) => s + (getRelic(id)?.value ?? 0), 0);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="상점" day={day} gold={gold} onBack={onBack} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">상점</h1>
        <p className="text-sm text-ash">재고는 원정에서 돌아올 때마다 새로 들어온다. 남은 물자는 짐에 그대로 남는다.</p>
      </header>

      <section aria-label="물자" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">원정 물자</h2>
          <span className={`text-sm ${packed >= PACK_LIMIT ? "text-blood" : "text-ash"}`}>
            원정 짐 {packed} / {PACK_LIMIT}
          </span>
        </div>
        {SUPPLY_ORDER.map((k) => {
          const why = stock[k] <= 0 ? "재고 없음" : gold < PRICE[k] ? "금화 부족" : packed >= PACK_LIMIT ? "짐이 가득" : null;
          return (
            <div key={k} className="flex items-center justify-between gap-3 border-t border-edge/60 pt-2">
              <div className="flex flex-col">
                <span className="font-bold">
                  {SUPPLY[k].name}
                  <span className="ml-2 text-xs font-normal text-ash">
                    짐 {pack[k]} · 재고 {stock[k]}
                  </span>
                </span>
                <span className="text-xs text-bone/70">{SUPPLY[k].description}</span>
              </div>
              <div className="flex items-center gap-2">
                {why && <span className="text-[11px] text-ash">{why}</span>}
                <Button className="!px-3 !py-1 text-xs" disabled={!!why} onClick={() => onBuy(k)}>
                  {CURRENCY} {PRICE[k]} · 사기
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      <section aria-label="유실물" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">유실물 팔기</h2>
          <span className="text-xs text-ash">나중에 대장간·전수관의 재료로도 쓰인다</span>
        </div>
        {salvageItems.length === 0 ? (
          <p className="text-sm text-ash">팔 유실물이 없다. 전투에서 쓰러뜨린 적에게서 얻는다.</p>
        ) : (
          salvageItems.map(([id, n]) => {
            const item = getSalvage(id);
            return (
              item && (
                <div key={id} className="flex items-center justify-between gap-3 border-t border-edge/60 pt-2">
                  <div className="flex flex-col">
                    <span className="font-bold">
                      {item.name} <span className="text-xs font-normal text-ash">×{n}</span>
                    </span>
                    <span className="text-xs text-bone/70">{item.description}</span>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button className="!px-2.5 !py-1 text-xs" onClick={() => onSellSalvage(id, false)}>
                      {CURRENCY} {item.value} · 하나
                    </Button>
                    {n > 1 && (
                      <Button className="!px-2.5 !py-1 text-xs" onClick={() => onSellSalvage(id, true)}>
                        {CURRENCY} {item.value * n} · 전부
                      </Button>
                    )}
                  </div>
                </div>
              )
            );
          })
        )}
      </section>

      <section aria-label="유물" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">유물 팔기</h2>
          {relics.length > 0 && (
            <span className="text-sm text-ash">
              전부 팔면 {CURRENCY} {total}
            </span>
          )}
        </div>
        {relics.length === 0 ? (
          <p className="text-sm text-ash">팔 유물이 없다. 던전의 보물 칸·전투·사건에서 얻는다.</p>
        ) : (
          relics.map((id, i) => {
            const r = getRelic(id);
            return (
              r && (
                <div key={`${id}-${i}`} className="flex items-center justify-between gap-3 border-t border-edge/60 pt-2">
                  <div className="flex flex-col">
                    <span className="font-bold">{r.name}</span>
                    <span className="text-xs text-bone/70">{r.description}</span>
                  </div>
                  <Button className="!px-3 !py-1 text-xs" onClick={() => onSell(i)}>
                    {CURRENCY} {r.value} · 팔기
                  </Button>
                </div>
              )
            );
          })
        )}
      </section>
    </main>
  );
}
