// 효과 조각을 무작위로 조합해 스킬을 만든다. 직접 만든 종족·직업 스킬이 다 채워지기 전까지
// 빈 슬롯을 채우는 임시(목) 스킬이다. id는 "gen:번호"이고, 같은 번호면 언제나 같은 스킬이 나온다.
// 그래서 용병 시드에는 id만 저장하고, 내용은 필요할 때 다시 만든다.
import { createRng, rollInt } from "../game/random";
import type { StatusKind } from "./combat";
import { DEFAULT_SKILL, JOB_SKILL, SKILLS, SKILL_SLOTS, describeSkill, skillsFrom, type Skill, type SkillEffect, type SkillTarget } from "./skills";

export const GEN_PREFIX = "gen:";

const STATUS_WORD: Record<StatusKind, string> = {
  bleed: "피를 부르는",
  poison: "독 묻은",
  crack: "갑옷을 깨는",
  weaken: "기를 꺾는",
  awaken: "깨어나는",
};

/** 위력 점수 → 대기 턴 (강할수록 오래 기다린다) */
function cooldownFor(power: number): number {
  return Math.max(1, Math.min(4, Math.round(1 + power)));
}

export function generateSkill(n: number): Skill {
  const r = createRng(n);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r.next() * xs.length)];
  const effects: SkillEffect[] = [];
  let power = 0;
  let target: SkillTarget;
  let adjective: string;
  let noun: string;

  switch (pick(["strike", "strike", "strike", "sweep", "support", "support", "guard"] as const)) {
    case "strike": {
      target = "enemy";
      noun = pick(["베기", "찌르기", "일격", "내리치기", "후려치기"]);
      adjective = pick(["날카로운", "묵직한", "재빠른"]);
      if (r.next() < 0.5) {
        const multiplier = pick([1.3, 1.5, 1.8, 2]);
        effects.push({ kind: "damage", multiplier });
        power += (multiplier - 1) * 3;
      } else {
        const bonus = rollInt(r.next, 2, 5);
        effects.push({ kind: "damage", bonus });
        power += bonus * 0.6;
      }
      if (r.next() < 0.5) {
        const status = pick(["bleed", "poison", "crack", "weaken"] as const);
        effects.push({ kind: "applyStatus", status });
        adjective = STATUS_WORD[status];
        power += 1.5;
      }
      if (power >= 2.5 && r.next() < 0.5) {
        effects.push({ kind: "selfCost", hp: rollInt(r.next, 2, 4) });
        adjective = "무모한";
        power -= 1;
      }
      break;
    }
    case "sweep": {
      target = "none";
      noun = pick(["휩쓸기", "난무", "폭풍"]);
      if (r.next() < 0.6) {
        const lo = rollInt(r.next, 2, 3);
        effects.push({ kind: "damage", fixed: [lo, lo + rollInt(r.next, 1, 3)], area: "all", onHit: false });
        adjective = pick(["사나운", "거친"]);
        power += 3;
      } else {
        const status = pick(["poison", "weaken", "crack"] as const);
        effects.push({ kind: "applyStatus", status, area: "all" });
        adjective = STATUS_WORD[status];
        power += 2.5;
      }
      break;
    }
    case "support": {
      target = "ally";
      noun = pick(["손길", "가호", "기원"]);
      if (r.next() < 0.5) {
        const amount = rollInt(r.next, 5, 10);
        effects.push({ kind: "heal", amount });
        adjective = "따뜻한";
        power += amount / 3;
      } else {
        const amount = rollInt(r.next, 4, 8);
        effects.push({ kind: "shield", amount });
        adjective = "굳건한";
        power += amount / 3;
      }
      if (r.next() < 0.4) {
        effects.push({ kind: "cure" });
        adjective = "맑은";
        power += 1;
      }
      if (r.next() < 0.3) {
        // 실패 조각은 맨 앞에 둔다 (실패하면 아무 효과도 없다)
        effects.unshift({ kind: "fail", chance: 0.15 });
        adjective = "불안한";
        power -= 0.5;
      }
      break;
    }
    case "guard": {
      target = "none";
      noun = pick(["버티기", "도발", "방패 세우기"]);
      adjective = pick(["물러서지 않는", "꿋꿋한"]);
      effects.push({ kind: "taunt" });
      power += 1.5;
      break;
    }
  }

  const def = {
    id: `${GEN_PREFIX}${n}`,
    name: `${adjective} ${noun}`,
    source: {},
    cooldown: cooldownFor(power),
    target,
    effects,
  };
  return { ...def, description: describeSkill(def) };
}

/** "gen:번호" id면 번호, 아니면 null */
export function genNumber(id: string): number | null {
  if (!id.startsWith(GEN_PREFIX)) return null;
  const n = Number(id.slice(GEN_PREFIX.length));
  return Number.isInteger(n) && n >= 0 && n < 2 ** 32 ? n : null;
}

const cache = new Map<string, Skill>();

/** 스킬 조회. 직접 만든 스킬(SKILLS)이나 무작위 조합 스킬("gen:번호"). 없으면 undefined */
export function getSkill(id: string): Skill | undefined {
  if (SKILLS[id]) return SKILLS[id];
  const n = genNumber(id);
  if (n === null) return undefined;
  if (!cache.has(id)) cache.set(id, generateSkill(n));
  return cache.get(id);
}

/**
 * 시작 스킬 4칸: 직업 2 (대표 스킬 + 하나) + 종족 1 + 마지막 1칸은 남은 직업·종족 스킬 중 하나.
 * (조합 스킬이 생기면 마지막 칸은 30% 확률로 조합 초반 스킬이 된다)
 * 직업·종족 스킬이 모자라면(테스트용 용병 등) 무작위 조합 스킬로 채운다.
 */
export function rollSkills(job: string | undefined, race: string | undefined, rand: () => number): string[] {
  const draw = (pool: string[]): string | undefined => {
    const left = pool.filter((id) => !ids.includes(id));
    return left.length ? left[Math.floor(rand() * left.length)] : undefined;
  };
  const ids: string[] = [(job && JOB_SKILL[job]) || DEFAULT_SKILL];
  const jobPool = job ? skillsFrom({ job }) : [];
  const racePool = race ? skillsFrom({ race }) : [];
  // 하나씩 뽑아 넣는다 (먼저 뽑힌 스킬은 다음 뽑기에서 빠진다)
  for (const pool of [jobPool, racePool, [...jobPool, ...racePool]]) {
    const pick = draw(pool);
    if (pick) ids.push(pick);
  }

  const names = new Set(ids.map((id) => getSkill(id)!.name));
  // 모자란 칸은 무작위 조합 스킬로. 한 용병 안에서 이름이 겹치면 다시 뽑는다
  for (let tries = 0; ids.length < SKILL_SLOTS && tries < 50; tries++) {
    const id = `${GEN_PREFIX}${Math.floor(rand() * 2 ** 32)}`;
    const name = getSkill(id)!.name;
    if (names.has(name)) continue;
    ids.push(id);
    names.add(name);
  }
  return ids;
}

/** 장착 스킬 목록이 올바른가 (모두 존재, 겹치지 않음, 슬롯 수 이하) */
export function validSkills(ids: string[]): boolean {
  return ids.length <= SKILL_SLOTS && new Set(ids).size === ids.length && ids.every((id) => getSkill(id));
}

/** 이 직업·종족 용병이 가질 수 있는 스킬들인가 (다른 직업·종족 스킬이면 거부) */
export function validSkillsFor(ids: string[], job: string | undefined, race: string | undefined): boolean {
  if (!validSkills(ids)) return false;
  return ids.every((id) => {
    const { source } = getSkill(id)!;
    return (!source.job || source.job === job) && (!source.race || source.race === race);
  });
}
