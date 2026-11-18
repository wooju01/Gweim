import { useState } from "react";
import { STATUS, SUPPLY, type SupplyKind } from "@/data/combat";
import { PATH_LENGTH, ROOM_NAME, type RoomKind } from "@/data/dungeon";
import { getEvent } from "@/data/events";
import { canMove, choiceAvailable, supplyProblem, type Expedition, type Member } from "@/game/dungeon/expedition";
import { byStep, type MapNode } from "@/game/dungeon/map";
import { GUIDE } from "@/game/party";
import type { EventResponse } from "@/lib/schemas";
import { Button } from "./parts";

type Props = {
  exp: Expedition;
  narration: { eventId: string; pending: boolean; data: EventResponse | null } | null;
  reactions: string[];
  onMove: (nodeId: string) => void;
  onChoose: (choiceId: string) => void;
  onLeaveRoom: () => void;
  onGive: (item: SupplyKind, target: string) => void;
  onEnd: () => void;
};

const SUPPLY_ORDER: SupplyKind[] = ["bandage", "antidote", "potion"];

const KIND_STYLE: Record<RoomKind, string> = {
  start: "border-edge text-ash",
  battle: "border-blood/60 text-blood",
  rest: "border-moss/60 text-moss",
  event: "border-ember/60 text-ember",
  treasure: "border-bone/50 text-bone",
  goal: "border-bone text-bone",
};

export function DungeonScreen({ exp, narration, reactions, onMove, onChoose, onLeaveRoom, onGive, onEnd }: Props) {
  const [item, setItem] = useState<SupplyKind | null>(null);
  const over = exp.room?.kind === "goal" || exp.room?.kind === "defeat";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-edge pb-4">
        <div>
          <p className="text-xs tracking-[0.3em] text-ash">무너진 던전 · {exp.depth}층</p>
          <h1 className="text-2xl font-bold">
            {Math.max(0, exp.visited.length - 1)} / {PATH_LENGTH} 칸
          </h1>
        </div>
        {!over && (
          <Button variant="danger" onClick={onEnd}>
            후퇴한다
          </Button>
        )}
      </header>

      <DungeonMap exp={exp} onMove={onMove} />

      {exp.room ? (
        <RoomPanel exp={exp} narration={narration} reactions={reactions} onChoose={onChoose} onLeaveRoom={onLeaveRoom} onEnd={onEnd} />
      ) : (
        <p className="text-sm text-ash">빛나는 칸 중 다음으로 갈 곳을 고른다. 체력과 물자는 다음 칸으로 그대로 이어진다.</p>
      )}

      <section aria-label="파티" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {exp.members.map((m) => (
          <MemberCard key={m.id} member={m}>
            {item && !supplyProblem(exp, item, m.id) && (
              <Button
                variant="ember"
                className="w-full !py-1"
                onClick={() => {
                  onGive(item, m.id);
                  setItem(null);
                }}
              >
                {SUPPLY[item].name} 건네기
              </Button>
            )}
          </MemberCard>
        ))}
      </section>

      {!over && (
        <div className="flex flex-col gap-2 rounded-sm border border-edge bg-panel p-4">
          <p className="text-sm">
            <span className="font-bold">{GUIDE.role}</span>의 물자 <span className="text-xs text-ash">· 이동 중에도 건넬 수 있다</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {SUPPLY_ORDER.map((kind) => (
              <Button
                key={kind}
                variant={item === kind ? "ember" : "ghost"}
                disabled={exp.supplies[kind] <= 0}
                onClick={() => setItem(item === kind ? null : kind)}
                title={SUPPLY[kind].description}
              >
                {SUPPLY[kind].name} {exp.supplies[kind]}
              </Button>
            ))}
          </div>
          <p className="text-xs text-ash">
            {item ? `${SUPPLY[item].description}. 위의 용병 카드에서 건넬 대상을 고른다.` : "물자를 고르면 건넬 수 있는 용병이 표시된다."}
          </p>
        </div>
      )}
    </main>
  );
}

/** 단계를 가로로, 갈림길을 세로로 놓은 맵. 이어진 칸은 선으로 잇는다 */
function DungeonMap({ exp, onMove }: { exp: Expedition; onMove: (id: string) => void }) {
  const steps = byStep(exp.map);
  const pos = (n: MapNode) => {
    const count = steps[n.step].length;
    return {
      x: ((n.step + 0.5) / steps.length) * 100,
      y: count === 1 ? 50 : 18 + (n.lane / (count - 1)) * 64,
    };
  };
  const visited = new Set(exp.visited);
  const walked = (a: string, b: string) => {
    const i = exp.visited.indexOf(a);
    return i >= 0 && exp.visited[i + 1] === b;
  };

  return (
    <section aria-label="던전 지도" className="relative h-64 w-full overflow-hidden rounded-sm border border-edge bg-ink">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {exp.map.nodes.flatMap((n) =>
          n.next.map((id) => {
            const to = exp.map.nodes.find((x) => x.id === id)!;
            const a = pos(n);
            const b = pos(to);
            return (
              <line
                key={`${n.id}-${id}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                vectorEffect="non-scaling-stroke"
                className={walked(n.id, id) ? "stroke-ember" : "stroke-edge"}
                strokeWidth={walked(n.id, id) ? 2 : 1}
              />
            );
          }),
        )}
      </svg>
      {exp.map.nodes.map((n) => {
        const { x, y } = pos(n);
        const here = n.id === exp.at;
        const reachable = canMove(exp, n.id);
        return (
          <button
            key={n.id}
            disabled={!reachable}
            onClick={() => onMove(n.id)}
            style={{ left: `${x}%`, top: `${y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-sm border bg-panel px-1.5 py-1 text-[11px] transition-all sm:px-2 sm:text-xs ${KIND_STYLE[n.kind]} ${
              here
                ? "ring-2 ring-ember"
                : reachable
                  ? "animate-pulse cursor-pointer hover:bg-panel-hi"
                  : visited.has(n.id)
                    ? "opacity-60"
                    : "opacity-35"
            }`}
          >
            {ROOM_NAME[n.kind]}
          </button>
        );
      })}
    </section>
  );
}

function RoomPanel({
  exp,
  narration,
  reactions,
  onChoose,
  onLeaveRoom,
  onEnd,
}: Pick<Props, "exp" | "narration" | "reactions" | "onChoose" | "onLeaveRoom" | "onEnd">) {
  const room = exp.room!;
  const box = "flex flex-col items-start gap-3 rounded-sm border p-4";
  const next = (
    <Button variant="ember" onClick={onLeaveRoom}>
      계속 나아간다
    </Button>
  );

  switch (room.kind) {
    case "rest":
      return (
        <div className={`${box} border-moss/50 bg-moss/10`}>
          <p className="text-moss">무너진 기둥 아래 숨을 곳을 찾았다. 잠시 상처를 돌보며 쉬었다.</p>
          <Lines lines={room.lines} />
          {next}
        </div>
      );
    case "treasure":
      return (
        <div className={`${box} border-bone/40 bg-panel`}>
          <p>누군가 숨겨 둔 꾸러미를 찾았다.</p>
          <Lines lines={room.lines} />
          {next}
        </div>
      );
    case "goal":
      return (
        <div className={`${box} border-ember/50 bg-ember/10`}>
          <p className="text-ember">목적지에 닿았다. 살아남은 자들과 함께 지상으로 돌아간다.</p>
          <p className="text-xs text-ash">귀환하면 모두 회복한다. 더 깊은 층은 아직 열리지 않았다.</p>
          <Button variant="ember" onClick={onEnd}>
            귀환한다
          </Button>
        </div>
      );
    case "defeat":
      return (
        <div className={`${box} border-blood/50 bg-blood/10`}>
          <p className="text-blood">파티가 전멸했다. 당신은 쓰러진 동료들을 끌고 간신히 빠져나왔다.</p>
          <Button variant="ember" onClick={onEnd}>
            길드로 돌아간다
          </Button>
        </div>
      );
    case "event": {
      const template = getEvent(room.eventId)!;
      const data = narration?.eventId === room.eventId ? narration.data : null;
      const pending = narration?.eventId === room.eventId && narration.pending;
      const textOf = (id: string) => data?.choices.find((c) => c.id === id)?.text ?? template.choices.find((c) => c.id === id)!.text;
      return (
        <div className={`${box} border-ember/40 bg-panel`}>
          <div className="flex w-full items-center justify-between">
            <p className="text-xs tracking-widest text-ember">{template.title}</p>
            {data?.mode === "fallback" && <span className="text-[11px] text-blood">FALLBACK</span>}
          </div>
          {pending ? (
            <p className="animate-pulse text-sm text-ash">…</p>
          ) : (
            <p className="leading-relaxed">{data?.intro ?? template.intro}</p>
          )}
          {room.result ? (
            <>
              <p className="border-l-2 border-ember/50 pl-3 text-sm text-ash italic">— {textOf(room.result.choiceId)}</p>
              <p className="leading-relaxed">{room.result.text}</p>
              <Lines lines={room.result.lines} />
              {reactions.length > 0 && <Lines lines={reactions} tone="ember" />}
              {next}
            </>
          ) : (
            !pending && (
              <ol className="flex w-full flex-col gap-2">
                {template.choices.map((c, i) => (
                  <li key={c.id}>
                    <button
                      disabled={!choiceAvailable(exp, room.eventId, c.id)}
                      onClick={() => onChoose(c.id)}
                      className="w-full rounded-sm border border-edge bg-ink px-4 py-2.5 text-left text-sm transition-colors hover:border-ember/60 hover:bg-panel-hi disabled:opacity-40"
                    >
                      <span className="mr-2 text-ash">{i + 1}.</span>
                      {textOf(c.id)}
                      {c.needs && (
                        <span className="ml-2 text-[11px] text-ash">
                          ({Object.entries(c.needs).map(([k, n]) => `${SUPPLY[k as SupplyKind].name} ${n}`).join(", ")} 필요)
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            )
          )}
        </div>
      );
    }
  }
}

function Lines({ lines, tone = "ash" }: { lines: string[]; tone?: "ash" | "ember" }) {
  if (lines.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${tone === "ember" ? "text-ember" : "text-ash"}`}>
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

function MemberCard({ member, children }: { member: Member; children?: React.ReactNode }) {
  const ratio = member.hp / member.maxHp;
  return (
    <article className={`flex flex-col gap-2 rounded-sm border border-edge bg-panel p-3 ${member.down ? "opacity-40" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-bold">{member.name}</h3>
        {member.down && <span className="text-[11px] text-blood">쓰러짐</span>}
      </div>
      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink ring-1 ring-edge">
          <div
            className={`h-full transition-all duration-500 ${ratio > 0.5 ? "bg-moss" : ratio > 0.25 ? "bg-ember" : "bg-blood"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-ash">
          체력 {member.hp} / {member.maxHp}
        </p>
      </div>
      {member.statuses.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {member.statuses.map((s) => (
            <li
              key={s.kind}
              className={`rounded-sm px-1.5 py-0.5 text-[11px] ${s.kind === "bleed" ? "bg-blood/20 text-blood" : "bg-moss/20 text-moss"}`}
            >
              {STATUS[s.kind].name} {s.turns}
            </li>
          ))}
        </ul>
      )}
      {children}
    </article>
  );
}
