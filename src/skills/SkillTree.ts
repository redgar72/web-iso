/**
 * Skill tree: skills are locked until the player spends skill points.
 * One skill point is granted per level up. Each skill has a required level and optional prerequisite.
 */

export type SkillId = 'sword' | 'rock' | 'fireball';

export interface SkillDef {
  id: SkillId;
  name: string;
  description: string;
  requiredLevel: number;
  /** Parent skill that must be unlocked first (undefined = no prereq). */
  prerequisite?: SkillId;
}

export const SKILL_TREE: SkillDef[] = [
  { id: 'sword', name: 'Orbiting Sword', description: 'A sword orbits you, damaging nearby enemies.', requiredLevel: 1, prerequisite: undefined },
  { id: 'rock', name: 'Throw Rock', description: 'Hurl a rock at the cursor (Q). Costs mana.', requiredLevel: 3, prerequisite: 'sword' },
  { id: 'fireball', name: 'Fireball', description: 'Launch a fireball at the cursor (right-click). Costs mana.', requiredLevel: 5, prerequisite: 'rock' },
];

/** Unlocked skill IDs. */
const unlocked = new Set<SkillId>(['sword']); // TODO: remove 'sword' for production — start with sword for testing

/** Unspent skill points (gained on level up). */
let skillPoints = 0;

export function getUnlocked(): Set<SkillId> {
  return unlocked;
}

export function isSkillUnlocked(id: SkillId): boolean {
  return unlocked.has(id);
}

export function getSkillPoints(): number {
  return skillPoints;
}

export function addSkillPoint(): void {
  skillPoints++;
}

export function canUnlockSkill(id: SkillId, currentLevel: number): boolean {
  if (unlocked.has(id)) return false;
  if (skillPoints < 1) return false;
  const def = SKILL_TREE.find((s) => s.id === id);
  if (!def || currentLevel < def.requiredLevel) return false;
  if (def.prerequisite != null && !unlocked.has(def.prerequisite)) return false;
  return true;
}

/** Spend 1 skill point to unlock a skill. Returns true if unlocked. */
export function unlockSkill(id: SkillId, currentLevel: number): boolean {
  if (!canUnlockSkill(id, currentLevel)) return false;
  skillPoints--;
  unlocked.add(id);
  return true;
}

export function getSkillDef(id: SkillId): SkillDef | undefined {
  return SKILL_TREE.find((s) => s.id === id);
}
