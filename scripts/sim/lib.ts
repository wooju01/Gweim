// 시뮬레이션 공용: 샘플 용병, 갈래, 전투 정책(길안내자·용병), 맵 정책
import { sampleSeeds } from "@/data/sampleRoster";
import { buildMerc } from "@/game/merc/generate";
import type { Merc } from "@/game/types";
import { act, currentActor, hasStatus, isDowned, living, revivesOne, skillDef, validate, type Battle, type BattleAction, type Unit } from "@/game/combat/engine";
import { alive, giveSupply, supplyProblem, type Expedition } from "@/game/dungeon/expedition";
import { nodeById } from "@/game/dungeon/map";

export const MERCS: Merc[] = sampleSeeds().map((s) => buildMerc(s)!);
export const byId = (id: string) => MERCS.find((m) => m.id === id)!;

export const ROUTES: string[][] = [
  ["uf_forest", "uf_deep_forest", "uf_goblin_village"],
  ["uf_forest", "uf_deep_forest", "uf_swamp"],
  ["uf_forest", "uf_cave", "uf_spider_nest"],
  ["uf_forest", "uf_cave", "uf_wolf_den"],
];

/** 길안내자: 쓰러진 용병 물약 → 위험한 용병 물약 → 해독제 → 붕대 */
export function guideAction(b: Battle): BattleAction | null {
  if (b.guideUsed) return null;
  const mercs = b.units.filter((u) => u.side === "merc" && !u.dead);
  const tryA = (a: BattleAction) => (validate(b, a) === null ? a : null);
  for (const u of mercs) if (isDowned(u)) {
    const a = tryA({ type: "guide", item: "potion", target: u.id });
    if (a) return a;
  }
  for (const u of mercs) if (u.hp > 0 && u.hp < u.maxHp * 0.35) {
    const a = tryA({ type: "guide", item: "potion", target: u.id });
    if (a) return a;
  }
  for (const u of mercs) if (u.hp > 0 && hasStatus(u, "poison")) {
    const a = tryA({ type: "guide", item: "antidote", target: u.id });
    if (a) return a;
  }
  for (const u of mercs) if (u.hp > 0 && hasStatus(u, "bleed")) {
    const a = tryA({ type: "guide", item: "bandage", target: u.id });
    if (a) return a;
  }
  return null;
}

type Def = NonNullable<ReturnType<typeof skillDef>>;

/** 예고에 대응: 기절로 끊기 → 도발 → 감싸기 → 보호막 → 회복 */
function answerCharge(b: Battle, actor: Unit): BattleAction | null {
  const charger = living(b, "enemy").find((u) => u.charging);
  if (!charger) return null;
  const allies = living(b, "merc").sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp);
  const aimed = charger.charging!.target ? living(b, "merc").find((u) => u.id === charger.charging!.target) : undefined;
  const has = (def: Def, k: string) =>
    def.effects.some((e) => e.kind === k || (e.kind === "applyStatus" && (e as { status: string }).status === k && (e as { who?: string }).who !== "self"));
  const tryA = (a: BattleAction) => (validate(b, a) === null ? a : null);
  const order: [string, (sk: string, def: Def) => BattleAction | null][] = [
    ["stun", (sk, def) => (def.target === "enemy" ? tryA({ type: "skill", skill: sk, target: charger.id }) : def.target === "none" ? tryA({ type: "skill", skill: sk }) : null)],
    ["taunt", (sk) => tryA({ type: "skill", skill: sk })],
    ["provoke", (sk) => tryA({ type: "skill", skill: sk })],
    ["cover", (sk, def) => (def.target === "ally" ? tryA({ type: "skill", skill: sk, target: (aimed ?? allies[0]).id }) : tryA({ type: "skill", skill: sk }))],
    ["shield", (sk, def) => (def.target === "ally" ? tryA({ type: "skill", skill: sk, target: (aimed ?? allies[0]).id }) : tryA({ type: "skill", skill: sk }))],
    ["heal", (sk, def) => (def.target === "ally" ? tryA({ type: "skill", skill: sk, target: allies[0].id }) : tryA({ type: "skill", skill: sk }))],
  ];
  for (const [kind, make] of order)
    for (const sk of actor.skills) {
      const def = skillDef(actor, sk);
      if (!def || !has(def, kind)) continue;
      if (kind === "heal" && allies[0].hp >= allies[0].maxHp * 0.85) continue;
      const a = make(sk, def);
      if (a) return a;
    }
  return null;
}

/** 맞아야 효과가 나는 자기 강화 (카운터, 회피 계열, 가시): 노려질 것 같을 때만 쓴다 */
const REACTIVE = new Set(["counter", "evadeUp", "evadeCounter", "evadeCharge", "thorns"]);
function isReactive(def: Def): boolean {
  return def.target === "none" && def.effects.some((e) => e.kind === "applyStatus" && (e as { who?: string }).who === "self" && REACTIVE.has((e as { status: string }).status));
}

/** 다음 자기 차례 전에 노려질 것 같나: 예고 대상, 도발·결투 중, 무작위로 한 번 이상 맞을 확률 50% 이상 */
function likelyTargeted(b: Battle, actor: Unit): boolean {
  const enemies = living(b, "enemy");
  if (enemies.some((e) => e.charging?.target === actor.id)) return true;
  if (enemies.some((e) => e.statuses.some((x) => (x.kind === "provoked" || x.kind === "duel") && x.source === actor.id))) return true;
  const allies = living(b, "merc").length;
  return 1 - Math.pow(1 - 1 / Math.max(1, allies), enemies.length) >= 0.5;
}

export function mercAction(b: Battle, actor: Unit): BattleAction {
  // 쓰러진 아군이 있으면 한 명 대상 회복 스킬로 일으킨다
  const down = b.units.find((u) => u.side === "merc" && isDowned(u));
  if (down)
    for (const sk of actor.skills) {
      const def = skillDef(actor, sk);
      if (!def || !revivesOne(def)) continue;
      const a: BattleAction = { type: "skill", skill: sk, target: down.id };
      if (validate(b, a) === null) return a;
    }
  // 깨우기: 회복 스킬로 못 일으키면 차례를 써서 깨운다
  if (down) {
    const a: BattleAction = { type: "wake", target: down.id };
    if (validate(b, a) === null) return a;
  }
  const answer = answerCharge(b, actor);
  if (answer) return answer;
  const targeted = likelyTargeted(b, actor);
  if (targeted && actor.hp >= actor.maxHp * 0.3)
    for (const sk of actor.skills) {
      const def = skillDef(actor, sk);
      if (!def || !isReactive(def)) continue;
      const a: BattleAction = { type: "skill", skill: sk };
      if (validate(b, a) === null) return a;
    }
  const enemies = living(b, "enemy").sort((x, y) => x.hp - y.hp);
  const weakest = enemies[0].id;
  const allies = living(b, "merc").sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp);
  for (const sk of actor.skills) {
    const def = skillDef(actor, sk);
    if (!def || (isReactive(def) && !targeted)) continue;
    let a: BattleAction;
    if (def.target === "none") a = { type: "skill", skill: sk };
    else if (def.target === "enemy") a = { type: "skill", skill: sk, target: weakest };
    else {
      if (allies[0].hp >= allies[0].maxHp * 0.7) continue;
      a = { type: "skill", skill: sk, target: allies[0].id };
    }
    if (validate(b, a) === null) return a;
  }
  return { type: "attack", target: weakest };
}

export function fight(battle: Battle): Battle {
  let b = battle;
  for (let step = 0; step < 1500 && !b.outcome; step++) {
    const g = guideAction(b);
    if (g) {
      b = act(b, g);
      continue;
    }
    const actor = currentActor(b);
    if (!actor) break;
    b = act(b, mercAction(b, actor));
  }
  return b;
}

/** 전투 사이: 출혈 붕대, 중독 해독제, 체력 35% 아래면 물약 */
export function patchUp(exp: Expedition): Expedition {
  let e = exp;
  for (const m of alive(e)) {
    if (!supplyProblem(e, "bandage", m.id)) e = giveSupply(e, "bandage", m.id);
    if (!supplyProblem(e, "antidote", m.id)) e = giveSupply(e, "antidote", m.id);
    while (e.members.find((x) => x.id === m.id)!.hp < m.maxHp * 0.35 && !supplyProblem(e, "potion", m.id)) e = giveSupply(e, "potion", m.id);
  }
  return e;
}

/** 다음 칸: 체력이 낮으면 휴식, 보물·사건 우선, 목적지는 마지막 */
export function pickNext(exp: Expedition, nexts: string[]): string {
  const al = alive(exp);
  const ratio = al.reduce((s, m) => s + m.hp, 0) / al.reduce((s, m) => s + m.maxHp, 0);
  const score = (id: string) => {
    const k = nodeById(exp.map, id)!.kind;
    if (k === "goal") return 0;
    if (k === "rest") return ratio < 0.75 ? 10 : 3;
    if (k === "treasure") return 6;
    if (k === "event") return 5;
    return 1;
  };
  return [...nexts].sort((a, b) => score(b) - score(a))[0];
}
