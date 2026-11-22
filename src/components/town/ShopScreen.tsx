import { SUPPLY, type SupplyKind } from "@/data/combat";
import { CURRENCY, MATERIAL_SHOP, PACK_LIMIT, PRICE, materialPrice, storageCaps, storageCost } from "@/data/economy";
import { getRelic } from "@/data/relics";
import { getSalvage, sellable } from "@/data/loot";
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
  /** 재료 사기 (계열 재료·기술 파편). bought: 이번 원정 사이에 산 개수 */
  materialBought: Record<string, number>;
  onBuyMaterial: (id: string) => void;
  /** 창고 확장 횟수와 확장하기 */
  storageLevel: number;
  onExpand: () => void;
  /** 물자별 지금 가격 (할인 반영) */
  prices: Record<SupplyKind, number>;
  onBack: () => void;
};

const SUPPLY_ORDER: SupplyKind[] = ["bandage", "antidote", "potion", "greaterPotion"];

/** 상점: 원정 물자를 사서 짐에 넣고, 던전에서 가져온 유물을 판다 */
/** 상점에서 파는 재료 (계열 재료 7종 + 기술 파편) */
const MATERIAL_IDS = ["mat_whetstone", "mat_jelly", "mat_fang", "mat_venom", "mat_arrowhead", "mat_sap", "mat_mace", "tech_shard"];

export function ShopScreen({ day, gold, pack, stock, relics, salvage, onBuy, onSell, onSellSalvage, materialBought, onBuyMaterial, storageLevel, onExpand, prices, onBack }: Props) {
  const caps = storageCaps(storageLevel);
  const expandCost = storageCost(storageLevel);
  // 전수관 재료(기술 파편·계열 재료 등)는 팔지 않는다
  const salvageItems = Object.entries(salvage).filter(([id, n]) => n > 0 && sellable(id));
  const packed = Object.values(pack).reduce((a, b) => a + b, 0);
  const total = relics.reduce((s, id) => s + (getRelic(id)?.value ?? 0), 0);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="상점" day={day} gold={gold} onBack={onBack} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">상점</h1>
        <p className="text-sm text-ash">
          재고는 원정에서 돌아올 때마다 새로 들어온다. 산 물자는 창고(물자 {caps.supply}개까지)에 두고, 떠날 때 {PACK_LIMIT}개까지 챙긴다 (물약부터).
          재료·유실물은 종류별 {caps.item}개까지.
        </p>
      </header>

      <section aria-label="물자" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">원정 물자</h2>
          <span className="flex items-center gap-2">
            <span className={`text-sm ${packed >= caps.supply ? "text-blood" : "text-ash"}`}>
              창고 물자 {packed} / {caps.supply}
            </span>
            <Button className="!px-2 !py-0.5 text-[11px]" disabled={gold < expandCost} onClick={onExpand} title={`종류별 +10칸, 물자 +20개`}>
              창고 확장 · {CURRENCY} {expandCost}
            </Button>
          </span>
        </div>
        {SUPPLY_ORDER.filter((k) => k !== "greaterPotion" || stock[k] > 0 || pack[k] > 0).map((k) => {
          const why = stock[k] <= 0 ? "재고 없음" : gold < prices[k] ? "금화 부족" : packed >= caps.supply ? "창고가 가득" : null;
          return (
            <div key={k} className="flex items-center justify-between gap-3 border-t border-edge/60 pt-2">
              <div className="flex flex-col">
                <span className="font-bold">
                  {SUPPLY[k].name}
                  <span className="ml-2 text-xs font-normal text-ash">
                    창고 {pack[k]} · 재고 {stock[k]}
                  </span>
                </span>
                <span className="text-xs text-bone/70">{SUPPLY[k].description}</span>
              </div>
              <div className="flex items-center gap-2">
                {why && <span className="text-[11px] text-ash">{why}</span>}
                <Button className="!px-3 !py-1 text-xs" disabled={!!why} onClick={() => onBuy(k)}>
                  {CURRENCY} {prices[k]}
                  {prices[k] < PRICE[k] ? " (할인)" : ""} · 사기
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      <section aria-label="재료" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">재료</h2>
          <span className="text-[11px] text-ash">원정에서 돌아올 때마다 종류별 {MATERIAL_SHOP.perExpedition}개까지 · 전술 교본·종족 유물·보스 증표는 팔지 않는다</span>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {MATERIAL_IDS.map((id) => {
            const price = materialPrice(id)!;
            const left = MATERIAL_SHOP.perExpedition - (materialBought[id] ?? 0);
            return (
              <div key={id} className="flex items-center justify-between gap-2 rounded-sm bg-ink/50 px-2.5 py-1.5 text-xs">
                <span>
                  <b>{getSalvage(id)?.name ?? id}</b> <span className="text-ash">가진 것 {salvage[id] ?? 0} · 남은 수량 {left}</span>
                </span>
                <Button className="!px-2.5 !py-0.5 text-xs" disabled={left <= 0 || gold < price} onClick={() => onBuyMaterial(id)}>
                  {CURRENCY} {price}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="유실물" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">유실물 팔기</h2>
          <span className="text-xs text-ash">대장간 재료로도 쓰인다. 전수관 재료는 팔 수 없다</span>
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
