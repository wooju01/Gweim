import { FIRST_DUNGEON, getDungeon } from "@/data/regions";
import { SUPPLY, type SupplyKind } from "@/data/combat";
import { CURRENCY } from "@/data/economy";
import { getStage } from "@/game/affinity";
import { GUIDE, MERC_SLOTS } from "@/game/party";
import type { Merc } from "@/game/types";
import { wageOf } from "@/game/wages";
import { Button } from "../parts";
import type { MercProgress, TownPlace } from "../state";
import { TownBar } from "./TownBar";

type Props = {
  day: number;
  gold: number;
  party: Merc[];
  progress: Record<string, MercProgress>;
  pack: Record<SupplyKind, number>;
  onDepart: () => void;
  onGo: (place: TownPlace) => void;
};

const SUPPLY_ORDER: SupplyKind[] = ["bandage", "antidote", "potion"];

/** 던전 입구: 파티와 짐을 확인하고 출발한다 */
export function GateScreen({ day, gold, party, progress, pack, onDepart, onGo }: Props) {
  const packed = Object.values(pack).reduce((a, b) => a + b, 0);
  const wages = party.reduce((s, m) => s + (progress[m.id]?.wage ?? wageOf(m)), 0);
  const hostile = party.filter((m) => getStage(progress[m.id]?.affinity ?? 50) === "hostile");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <TownBar place="던전 입구" day={day} gold={gold} onBack={() => onGo("town")} />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">던전 입구 · {getDungeon(FIRST_DUNGEON)!.name}</h1>
        <p className="text-sm text-ash">{getDungeon(FIRST_DUNGEON)!.description}</p>
        <p className="text-sm text-ash">한번 내려가면 목적지에 닿거나 후퇴할 때까지 마을로 돌아올 수 없다.</p>
      </header>

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
        <p className="text-sm">{SUPPLY_ORDER.map((k) => `${SUPPLY[k].name} ${pack[k]}`).join(" · ")}</p>
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
        <Button variant="ember" disabled={party.length === 0} onClick={onDepart}>
          던전으로 내려간다
        </Button>
      </div>
    </main>
  );
}
