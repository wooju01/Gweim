// 전수관 규칙 (순수 함수): 용병이 아는 조각, 조각 해금, 부 조각 강화, 스킬 조립, 장착 바꾸기.
import { CRAFT_COST, MAX_SUB_LEVEL, getFragment, upgradeCost } from "@/data/fragments";
import { SKILL_SLOTS } from "@/data/skills";
import { canUseFragment, fragmentsFor, fragmentsIn, normalize, skillKey, validateSkill, type SkillOwner, type SubLevels } from "@/game/skills";
import type { MercSeed, SkillBuild } from "@/lib/schemas";

export function ownerOf(seed: MercSeed): SkillOwner {
  return { job: seed.traits.job, race: seed.traits.race, level: seed.level, branch: seed.branch, elements: seed.elements };
}

/** 용병이 가진 스킬 (장착 + 배운 것) */
export function ownedSkills(seed: MercSeed, learned: SkillBuild[]): SkillBuild[] {
  return [...seed.skills, ...learned];
}

/** 용병이 아는 조각: 가진 스킬 안에 든 조각 + 전수관에서 뚫은 조각 (쓸 수 있는 것만, 조각 목록 순서) */
export function knownFragments(seed: MercSeed, learned: SkillBuild[], unlocked: string[]): string[] {
  const known = new Set(unlocked);
  for (const b of ownedSkills(seed, learned)) for (const id of fragmentsIn(b)) known.add(id);
  return fragmentsFor(ownerOf(seed))
    .filter((f) => known.has(f.id))
    .map((f) => f.id);
}

type Cost = { gold: number; salvage: Record<string, number> };

function shortOf(cost: Cost, gold: number, salvage: Record<string, number>): "gold" | "salvage" | null {
  if (gold < cost.gold) return "gold";
  if (Object.entries(cost.salvage).some(([id, n]) => (salvage[id] ?? 0) < n)) return "salvage";
  return null;
}

/** 조각을 뚫을 수 없는 이유 (뚫을 수 있으면 null). forbidden: 이 용병의 직업·종족 조각이 아니다 */
export function unlockBlock(
  fragmentId: string,
  seed: MercSeed,
  known: string[],
  gold: number,
  salvage: Record<string, number>,
): "unknown" | "forbidden" | "known" | "gold" | "salvage" | null {
  const f = getFragment(fragmentId);
  if (!f?.cost) return "unknown";
  if (!canUseFragment(ownerOf(seed), f)) return "forbidden";
  if (known.includes(fragmentId)) return "known";
  return shortOf(f.cost, gold, salvage);
}

/** 부 조각을 한 단계 올릴 수 없는 이유 (올릴 수 있으면 null) */
export function upgradeBlock(
  fragmentId: string,
  known: string[],
  levels: SubLevels,
  gold: number,
  salvage: Record<string, number>,
): "unknown" | "max" | "gold" | "salvage" | null {
  const f = getFragment(fragmentId);
  if (!f || f.kind !== "sub" || !known.includes(fragmentId)) return "unknown";
  const lv = levels[fragmentId] ?? 1;
  if (lv >= MAX_SUB_LEVEL) return "max";
  return shortOf(upgradeCost(f, lv + 1)!, gold, salvage);
}

/** 유실물에서 비용을 뺀다 (0개가 된 종류는 지운다) */
export function paySalvage(salvage: Record<string, number>, cost: Record<string, number>): Record<string, number> {
  const out = { ...salvage };
  for (const [id, n] of Object.entries(cost)) {
    out[id] = (out[id] ?? 0) - n;
    if (out[id] <= 0) delete out[id];
  }
  return out;
}

/** 조립할 수 없는 이유 (할 수 있으면 null) */
export function craftBlock(seed: MercSeed, learned: SkillBuild[], unlocked: string[], gold: number, build: SkillBuild): string | null {
  const why = validateSkill(ownerOf(seed), build);
  if (why) return why;
  const known = knownFragments(seed, learned, unlocked);
  if (!fragmentsIn(build).every((id) => known.includes(id))) return "모르는 조각이 있다";
  if (ownedSkills(seed, learned).some((b) => skillKey(b) === skillKey(build))) return "이미 가진 스킬";
  if (gold < CRAFT_COST) return "금화가 모자란다";
  return null;
}

/**
 * 조립: 아는 조각으로만, 등급별 부 조각 수 안에서, 이미 가진 스킬이 아니면.
 * 장착 칸에 자리가 있으면 바로 장착, 없으면 배운 스킬로 보관. 안 되면 null
 */
export function craft(
  seed: MercSeed,
  learned: SkillBuild[],
  unlocked: string[],
  gold: number,
  build: SkillBuild,
): { seed: MercSeed; learned: SkillBuild[]; skill: SkillBuild } | null {
  if (craftBlock(seed, learned, unlocked, gold, build)) return null;
  const skill = normalize(build);
  return seed.skills.length < SKILL_SLOTS
    ? { seed: { ...seed, skills: [...seed.skills, skill] }, learned, skill }
    : { seed, learned: [...learned, skill], skill };
}

/**
 * 장착 바꾸기 (스킬은 skillKey로 가리킨다). equip(배운 스킬)을 장착 칸에, unequip(장착 스킬)을 배운 스킬로.
 * 둘 다 주면 맞바꾼다. 장착 칸은 1개 이상 4개 이하로 남아야 한다. 안 되면 null
 */
export function swapSkills(
  seed: MercSeed,
  learned: SkillBuild[],
  change: { equip?: string; unequip?: string },
): { seed: MercSeed; learned: SkillBuild[] } | null {
  const { equip, unequip } = change;
  if (!equip && !unequip) return null;
  const toEquip = equip ? learned.find((b) => skillKey(b) === equip) : undefined;
  const toUnequip = unequip ? seed.skills.find((b) => skillKey(b) === unequip) : undefined;
  if ((equip && !toEquip) || (unequip && !toUnequip)) return null;
  let skills = seed.skills;
  let kept = learned;
  if (toUnequip) {
    skills = toEquip ? skills.map((s) => (s === toUnequip ? toEquip : s)) : skills.filter((s) => s !== toUnequip);
    kept = [...kept, toUnequip];
  } else if (toEquip) {
    skills = [...skills, toEquip];
  }
  if (toEquip) kept = kept.filter((s) => s !== toEquip);
  if (skills.length < 1 || skills.length > SKILL_SLOTS) return null;
  return { seed: { ...seed, skills }, learned: kept };
}
