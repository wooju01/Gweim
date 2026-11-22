import { useState } from "react";
import { DUNGEONS, FIRST_DUNGEON, bossNames, getDungeon, getRegion, recommendedLabel } from "@/data/regions";
import { KEY_ITEMS, type KeyItemId } from "@/data/keyItems";
import { getMonster } from "@/data/monsters";
import { layoutDungeon } from "@/game/dungeon/atlas";
import { DungeonTree } from "@/components/dungeon/DungeonTree";
import { WorldMap } from "./WorldMap";
import { SUPPLY, type SupplyKind } from "@/data/combat";
import { CURRENCY, PACK_LIMIT } from "@/data/economy";
import { packFor } from "@/game/state/state";
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
  onDepart: (dungeonId: string) => void;
  onGo: (place: TownPlace) => void;
};

const SUPPLY_ORDER: SupplyKind[] = ["bandage", "antidote", "potion", "greaterPotion"];

/** 던전 입구: 파티와 짐을 확인하고 출발한다 */
export function GateScreen({ day, gold, party, progress, pack, explored, conquered, keyItems, onDepart, onGo }: Props) {
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
  const carried = packFor(pack).carried;
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

      <section aria-label="원정 짐" className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">원정 짐</h2>
          <button onClick={() => onGo("shop")} className="text-xs text-ash underline-offset-2 hover:text-ember hover:underline">
            상점에 들르기
          </button>
        </div>
        {/* 창고에서 PACK_LIMIT개까지 챙긴다 (물약부터) */}
        <p className="text-sm">
          {SUPPLY_ORDER.filter((k) => carried[k] > 0 || k !== "greaterPotion").map((k) => `${SUPPLY[k].name} ${carried[k]}`).join(" · ")}
        </p>
        {packed > PACK_LIMIT && <p className="text-xs text-ash">창고에 {packed - PACK_LIMIT}개가 남는다 (원정엔 {PACK_LIMIT}개까지, 물약부터 챙긴다)</p>}
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
        <Button variant="ember" disabled={party.length === 0 || !dungeon.open} onClick={() => onDepart(dungeon.id)}>
          {dungeon.open ? `${dungeon.name}(으)로 떠난다` : `${dungeon.name}은(는) 아직 갈 수 없다`}
        </Button>
      </div>
    </main>
  );
}
