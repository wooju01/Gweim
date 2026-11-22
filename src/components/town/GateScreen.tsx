import { useState } from "react";
import { DUNGEONS, FIRST_DUNGEON, bossNames, getDungeon, getRegion, recommendedLabel } from "@/data/regions";
import { KEY_ITEMS, type KeyItemId } from "@/data/keyItems";
import { getMonster } from "@/data/monsters";
import { layoutDungeon } from "@/game/dungeon/atlas";
import { DungeonTree } from "@/components/dungeon/DungeonTree";
import { WorldMap } from "./WorldMap";
import { SUPPLY, type SupplyKind } from "@/data/combat";
import { CURRENCY } from "@/data/economy";
import { INFIRMARY, STACK } from "@/data/facilities";
import { autoCarry, supplySlots } from "@/game/state/state";
import { getStage } from "@/game/merc/affinity";
import { GUIDE, MERC_SLOTS } from "@/game/merc/party";
import type { Merc } from "@/game/types";
import { wageOf } from "@/game/merc/wages";
import { Button } from "@/components/common/parts";
import type { MercProgress, TownPlace } from "@/game/state/state";
import { TownBar } from "./TownBar";

type Props = {
  day: number;
  gold: number;
  party: Merc[];
  progress: Record<string, MercProgress>;
  pack: Record<SupplyKind, number>;
  explored: string[];
  conquered: string[];
  /** 클랜 창고의 히든 열쇠 */
  keyItems: KeyItemId[];
  /** 가방 칸 수, 의무실 레벨 (출발 때 무료 물자) */
  bag: number;
  infirmary: number;
  onDepart: (dungeonId: string, carry: Record<SupplyKind, number>, keys: KeyItemId[]) => void;
  onGo: (place: TownPlace) => void;
};

const SUPPLY_ORDER: SupplyKind[] = ["bandage", "antidote", "potion", "greaterPotion"];

/** 던전 입구: 파티와 짐을 확인하고 출발한다 */
export function GateScreen({ day, gold, party, progress, pack, explored, conquered, keyItems, bag, infirmary, onDepart, onGo }: Props) {
  const [dungeonId, setDungeonId] = useState(FIRST_DUNGEON);
  const [regionId, setRegionId] = useState<string | null>(null);
  const dungeon = getDungeon(dungeonId)!;
  const mapProgress = Object.fromEntries(
    DUNGEONS.filter((d) => d.open).map((d) => {
      const ids = layoutDungeon(d.id).nodes.filter((n) => !n.region.hidden || explored.includes(n.region.id)).map((n) => n.region.id);
      return [d.id, { explored: ids.filter((id) => explored.includes(id)).length, total: ids.length, conquered: ids.filter((id) => conquered.includes(id)).length }];
    }),
  );
  const region = regionId ? getRegion(regionId) : undefined;
  const regionKnown = !!region && explored.includes(region.id);
  const packed = Object.values(pack).reduce((a, b) => a + b, 0);
  // 가방: 가져갈 물자(처음엔 자동: 칸의 절반까지)와 히든 열쇠 (가방에 있어야 히든 사건이 나온다)
  const [carry, setCarry] = useState<Record<SupplyKind, number> | null>(null);
  const [keys, setKeys] = useState<KeyItemId[] | null>(null);
  const carried = carry ?? autoCarry(pack, bag);
  const bringKeys = (keys ?? keyItems).filter((k) => keyItems.includes(k));
  const used = supplySlots(carried) + bringKeys.length;
  const free = INFIRMARY[infirmary - 1];
  const change = (k: SupplyKind, d: number) => {
    const n = Math.max(0, Math.min(pack[k] ?? 0, (carried[k] ?? 0) + d));
    const next = { ...carried, [k]: n };
    if (d > 0 && supplySlots(next) + bringKeys.length > bag) return;
    setCarry(next);
  };
  const wages = party.reduce((s, m) => s + (progress[m.id]?.wage ?? wageOf(m)), 0);
  const hostile = party.filter((m) => getStage(progress[m.id]?.affinity ?? 50) === "hostile");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="던전 입구" day={day} gold={gold} onBack={() => onGo("town")} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">던전 입구</h1>
        <p className="text-sm text-ash">한번 내려가면 목적지에 닿거나 후퇴할 때까지 마을로 돌아올 수 없다.</p>
        {keyItems.length > 0 && (
          <p className="text-sm text-frost" title="원정 중 어딘가에서 이 열쇠가 숨겨진 길을 연다">
            클랜 창고의 열쇠: {keyItems.map((k) => KEY_ITEMS[k].name).join(", ")}
          </p>
        )}
      </header>

      <section aria-label="지도" className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <WorldMap
          selected={dungeonId}
          progress={mapProgress}
          onSelect={(id) => {
            setDungeonId(id);
            setRegionId(null);
          }}
        />
        <div className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
          <h2 className="font-bold">
            {dungeon.name} <span className="text-xs font-normal text-ash">{dungeon.open ? dungeon.level : "미개척"}</span>
          </h2>
          <p className="text-sm text-bone/80">{dungeon.description}</p>
          {dungeon.open ? (
            <>
              <DungeonTree dungeonId={dungeon.id} explored={explored} conquered={conquered} selected={regionId} onSelect={setRegionId} />
              {region ? (
                <div className="flex flex-col gap-1 text-xs">
                  <b className="text-sm">
                    {region.depth}층 {regionKnown ? region.name : "???"}{" "}
                    <span className="font-normal text-ember">{regionKnown ? `권장 ${recommendedLabel(region)}` : ""}</span>
                  </b>
                  {regionKnown ? (
                    <>
                      <span className="text-bone/70">{region.description}</span>
                      <span className="text-ash">
                        나오는 적: {region.monsters.map((m) => getMonster(m.id)?.name ?? m.id).join(", ")}
                      </span>
                      {bossNames(region).length > 0 && (
                        <span className={conquered.includes(region.id) ? "text-ember" : "text-blood"}>
                          우두머리: {bossNames(region).join(" / ")}
                          {region.boss!.chance < 1 ? " (가끔 나타난다)" : ""}
                          {conquered.includes(region.id) ? " · 쓰러뜨린 적 있다. 갈 때마다 다시 나타난다" : ""}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ash">아직 아무도 가 보지 않았다. 앞 층 끝에서 이 갈래를 고르면 알 수 있다.</span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-ash">지역을 누르면 자세히 볼 수 있다.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-ash">아직 길이 열리지 않았다. 언젠가 길드에 이곳의 소문이 들어올 것이다.</p>
          )}
        </div>
      </section>

      <section aria-label="원정 파티" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">
            원정 파티 {party.length} / {MERC_SLOTS}
          </h2>
          <button onClick={() => onGo("inn")} className="text-xs text-ash underline-offset-2 hover:text-ember hover:underline">
            숙소에서 바꾸기
          </button>
        </div>
        <p className="text-sm">
          {GUIDE.name} <span className="text-xs text-ash">({GUIDE.role})</span>
        </p>
        {party.map((m) => (
          <p key={m.id} className="text-sm">
            {m.name} <span className="text-xs text-ash">{m.title}</span>
          </p>
        ))}
        {party.length > 0 && (
          <p className="text-xs text-ash">
            돌아오면 보수로 {CURRENCY} {wages}을(를) 나눠 줘야 한다. (지금 {CURRENCY} {gold})
          </p>
        )}
      </section>

      <section aria-label="가방" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">
            가방 <span className={`text-xs font-normal ${used > bag ? "text-blood" : "text-ash"}`}>{used} / {bag}칸</span>
          </h2>
          <button onClick={() => onGo("shop")} className="text-xs text-ash underline-offset-2 hover:text-ember hover:underline">
            상점에 들르기
          </button>
        </div>
        <p className="text-xs text-ash">
          물자는 한 칸에 {STACK.supply}개, 던전에서 얻는 재료·유실물은 한 칸에 {STACK.item}개, 유물·히든 열쇠는 한 칸에 하나. 남은 칸에 전리품을 담는다.
          {free ? ` 의무실이 ${Object.entries(free).map(([k, n]) => `${SUPPLY[k as SupplyKind].name} ${n}`).join(", ")}을(를) 더 챙겨 준다 (칸이 남을 때).` : ""}
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {SUPPLY_ORDER.filter((k) => k !== "greaterPotion" || (pack[k] ?? 0) > 0).map((k) => (
            <div key={k} className="flex items-center justify-between gap-2 rounded-sm bg-ink/50 px-2.5 py-1.5 text-xs">
              <span>
                <b>{SUPPLY[k].name}</b> {carried[k] ?? 0}
                <span className="ml-1 text-ash">(창고 {pack[k] ?? 0} · {Math.ceil((carried[k] ?? 0) / STACK.supply)}칸)</span>
              </span>
              <span className="flex gap-1">
                <Button className="!px-2 !py-0 text-xs" disabled={(carried[k] ?? 0) <= 0} onClick={() => change(k, -1)}>
                  −
                </Button>
                <Button className="!px-2 !py-0 text-xs" disabled={(carried[k] ?? 0) >= (pack[k] ?? 0)} onClick={() => change(k, 1)}>
                  +
                </Button>
              </span>
            </div>
          ))}
        </div>
        {keyItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-frost">히든 열쇠 (가방에 넣어 가야 히든 사건이 나온다):</span>
            {keyItems.map((k) => (
              <label key={k} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={bringKeys.includes(k)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...bringKeys, k] : bringKeys.filter((x) => x !== k);
                    if (e.target.checked && supplySlots(carried) + next.length > bag) return;
                    setKeys(next);
                  }}
                />
                {KEY_ITEMS[k].name}
              </label>
            ))}
          </div>
        )}
        {packed > Object.values(carried).reduce((a, b) => a + b, 0) && <p className="text-xs text-ash">창고에 {packed - Object.values(carried).reduce((a, b) => a + b, 0)}개가 남는다.</p>}
      </section>

      <div className="flex flex-col items-start gap-2">
        {party.length === 0 && <p className="text-sm text-blood">원정 파티가 비어 있다. 용병 길드에서 고용하거나 숙소에서 정한다.</p>}
        {party.length > 0 && packed === 0 && (
          <p className="text-sm text-blood">짐이 비어 있다. 물자 없이 내려가면 다친 동료를 돌볼 수 없다.</p>
        )}
        {wages > gold && party.length > 0 && (
          <p className="text-sm text-ember">지금 금화로는 보수를 다 줄 수 없다. 던전에서 벌어 오지 못하면 체불된다.</p>
        )}
        {hostile.length > 0 && (
          <p className="text-sm text-ember">
            {hostile.map((m) => m.name).join(", ")}은(는) 당신을 적대한다. 던전에서 명령을 듣지 않을 수 있다.
          </p>
        )}
        <Button variant="ember" disabled={party.length === 0 || !dungeon.open} onClick={() => onDepart(dungeon.id, carried, bringKeys)}>
          {dungeon.open ? `${dungeon.name}(으)로 떠난다` : `${dungeon.name}은(는) 아직 갈 수 없다`}
        </Button>
      </div>
    </main>
  );
}
