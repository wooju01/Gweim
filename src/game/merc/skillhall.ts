// 전수관 규칙 (순수 함수): 용병이 아는 조각, 조각 해금, 스킬 조립, 장착 바꾸기.
import { CRAFT_COST, craftId, getPiece, modLimit, piecesIn, PIECES, validCraft } from "@/data/craft";
import { getSkill } from "@/data/skillgen";
import { SKILL_SLOTS } from "@/data/skills";
import type { MercSeed } from "@/lib/schemas";

/** 용병이 가진 스킬 (장착 + 배운 것 + 궁극기) */
export function ownedSkills(seed: MercSeed, learned: string[]): string[] {
  return [...seed.skills, ...learned, ...(seed.ultimate ? [seed.ultimate] : [])];
}

/** 용병이 아는 조각: 가진 스킬 안에 든 조각 + 전수관에서 뚫은 조각 (조각 목록 순서) */
export function knownPieces(seed: MercSeed, learned: string[], unlocked: string[]): string[] {
  const known = new Set(unlocked);
  for (const id of ownedSkills(seed, learned)) {
    const def = getSkill(id);
    if (def) for (const p of piecesIn(def)) known.add(p);
  }
  return PIECES.filter((p) => known.has(p.id)).map((p) => p.id);
}

/** 조각을 뚫을 수 없는 이유 (뚫을 수 있으면 null) */
export function unlockBlock(
  pieceId: string,
  known: string[],
  gold: number,
  salvage: Record<string, number>,
): "unknown" | "known" | "gold" | "salvage" | null {
  const piece = getPiece(pieceId);
  if (!piece) return "unknown";
  if (known.includes(pieceId)) return "known";
  if (gold < piece.cost.gold) return "gold";
  if (Object.entries(piece.cost.salvage).some(([id, n]) => (salvage[id] ?? 0) < n)) return "salvage";
  return null;
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

/**
 * 조립: 아는 조각으로만, 등급별 덧붙임 개수 안에서, 이미 가진 스킬이 아니면.
 * 장착 칸에 자리가 있으면 바로 장착, 없으면 배운 스킬로 보관. 안 되면 null
 */
export function craft(
  seed: MercSeed,
  learned: string[],
  unlocked: string[],
  gold: number,
  core: string,
  mods: string[],
): { seed: MercSeed; learned: string[]; skill: string } | null {
  if (gold < CRAFT_COST || !validCraft(core, mods) || mods.length > modLimit(seed.level)) return null;
  const known = knownPieces(seed, learned, unlocked);
  if (![core, ...mods].every((p) => known.includes(p))) return null;
  const skill = craftId(core, mods);
  if (ownedSkills(seed, learned).includes(skill)) return null;
  return seed.skills.length < SKILL_SLOTS
    ? { seed: { ...seed, skills: [...seed.skills, skill] }, learned, skill }
    : { seed, learned: [...learned, skill], skill };
}

/**
 * 장착 바꾸기. equip(배운 스킬)을 장착 칸에, unequip(장착 스킬)을 배운 스킬로.
 * 둘 다 주면 맞바꾼다. 장착 칸은 1개 이상 4개 이하로 남아야 한다. 안 되면 null
 */
export function swapSkills(
  seed: MercSeed,
  learned: string[],
  change: { equip?: string; unequip?: string },
): { seed: MercSeed; learned: string[] } | null {
  const { equip, unequip } = change;
  if (!equip && !unequip) return null;
  if (equip && !learned.includes(equip)) return null;
  if (unequip && !seed.skills.includes(unequip)) return null;
  let skills = seed.skills;
  let kept = learned;
  if (unequip) {
    const at = skills.indexOf(unequip);
    skills = equip ? skills.map((s, i) => (i === at ? equip : s)) : skills.filter((s) => s !== unequip);
    kept = [...kept, unequip];
  } else if (equip) {
    skills = [...skills, equip];
  }
  if (equip) kept = kept.filter((s) => s !== equip);
  if (skills.length < 1 || skills.length > SKILL_SLOTS) return null;
  return { seed: { ...seed, skills }, learned: kept };
}
