/**
 * Skill tree: 3 pages (one per skill). Each page has a base skill and augments.
 * Base skills are unlocked with 1 point; augments are additional nodes on that skill's tree.
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

/** Augment IDs are scoped per skill (e.g. fireball_explosion, sword_twin). */
export type AugmentId =
  | 'sword_twin'
  | 'sword_whirl'
  | 'sword_quickslash'
  | 'rock_triple'
  | 'rock_quickdraw'
  | 'rock_heavy'
  | 'fireball_explosion'
  | 'fireball_scorch'
  | 'fireball_radius';

export interface AugmentDef {
  id: AugmentId;
  skillId: SkillId;
  name: string;
  description: string;
  /** Required level to unlock this augment. */
  requiredLevel: number;
  /** Another augment that must be unlocked first (optional). */
  prerequisite?: AugmentId;
}

export const SKILL_TREE: SkillDef[] = [
  { id: 'sword', name: 'Orbiting Sword', description: 'A sword orbits you, damaging nearby enemies.', requiredLevel: 1, prerequisite: undefined },
  { id: 'rock', name: 'Throw Rock', description: 'Default ranged attack (Q). Thrown weapon, infinite ammo, slow attack rate. Damage scales with Dex.', requiredLevel: 3, prerequisite: 'sword' },
  { id: 'fireball', name: 'Fireball', description: 'Launch a fireball at the cursor (right-click). Costs mana. Single-target impact.', requiredLevel: 5, prerequisite: 'rock' },
];

export const AUGMENT_TREE: AugmentDef[] = [
  // Sword augments
  { id: 'sword_twin', skillId: 'sword', name: 'Twin Blades', description: 'A second sword orbits in the opposite direction.', requiredLevel: 2, prerequisite: undefined },
  { id: 'sword_whirl', skillId: 'sword', name: 'Whirl', description: 'Larger orbit and hit radius.', requiredLevel: 4, prerequisite: undefined },
  { id: 'sword_quickslash', skillId: 'sword', name: 'Quick Slash', description: 'Reduced hit cooldown; enemies are hit more often.', requiredLevel: 6, prerequisite: 'sword_twin' },
  // Rock augments
  { id: 'rock_triple', skillId: 'rock', name: 'Triple Toss', description: 'Throw 3 rocks in a spread.', requiredLevel: 4, prerequisite: undefined },
  { id: 'rock_quickdraw', skillId: 'rock', name: 'Quick Draw', description: 'Reduce rock cooldown.', requiredLevel: 5, prerequisite: undefined },
  { id: 'rock_heavy', skillId: 'rock', name: 'Heavy Rock', description: 'Increased ranged damage.', requiredLevel: 6, prerequisite: 'rock_triple' },
  // Fireball augments
  { id: 'fireball_explosion', skillId: 'fireball', name: 'Explosion', description: 'Fireball explodes on impact, damaging all enemies in radius.', requiredLevel: 6, prerequisite: undefined },
  { id: 'fireball_scorch', skillId: 'fireball', name: 'Scorch', description: 'Enemies hit burn for a short time.', requiredLevel: 7, prerequisite: 'fireball_explosion' },
  { id: 'fireball_radius', skillId: 'fireball', name: 'Inferno', description: 'Larger explosion radius.', requiredLevel: 8, prerequisite: 'fireball_explosion' },
];

/** Unlocked base skill IDs. */
const unlockedSkills = new Set<SkillId>();

/** Unlocked augment IDs. */
const unlockedAugments = new Set<AugmentId>();

/** Unspent skill points (gained on level up). */
let skillPoints = 0;

export function getUnlocked(): Set<SkillId> {
  return new Set(unlockedSkills);
}

export function isSkillUnlocked(id: SkillId): boolean {
  return unlockedSkills.has(id);
}

export function isAugmentUnlocked(id: AugmentId): boolean {
  return unlockedAugments.has(id);
}

export function getSkillPoints(): number {
  return skillPoints;
}

export function addSkillPoint(): void {
  skillPoints++;
}

export function getAugmentsForSkill(skillId: SkillId): AugmentDef[] {
  return AUGMENT_TREE.filter((a) => a.skillId === skillId);
}

export function getSkillDef(id: SkillId): SkillDef | undefined {
  return SKILL_TREE.find((s) => s.id === id);
}

export function getAugmentDef(id: AugmentId): AugmentDef | undefined {
  return AUGMENT_TREE.find((a) => a.id === id);
}

export function canUnlockSkill(id: SkillId, currentLevel: number): boolean {
  if (unlockedSkills.has(id)) return false;
  if (skillPoints < 1) return false;
  const def = SKILL_TREE.find((s) => s.id === id);
  if (!def || currentLevel < def.requiredLevel) return false;
  if (def.prerequisite != null && !unlockedSkills.has(def.prerequisite)) return false;
  return true;
}

/** Spend 1 skill point to unlock a base skill. Returns true if unlocked. */
export function unlockSkill(id: SkillId, currentLevel: number): boolean {
  if (!canUnlockSkill(id, currentLevel)) return false;
  skillPoints--;
  unlockedSkills.add(id);
  return true;
}

export function canUnlockAugment(augmentId: AugmentId, currentLevel: number): boolean {
  if (unlockedAugments.has(augmentId)) return false;
  if (skillPoints < 1) return false;
  const def = AUGMENT_TREE.find((a) => a.id === augmentId);
  if (!def) return false;
  if (!unlockedSkills.has(def.skillId)) return false;
  if (currentLevel < def.requiredLevel) return false;
  if (def.prerequisite != null && !unlockedAugments.has(def.prerequisite)) return false;
  return true;
}

/** Spend 1 skill point to unlock an augment. Returns true if unlocked. */
export function unlockAugment(augmentId: AugmentId, currentLevel: number): boolean {
  if (!canUnlockAugment(augmentId, currentLevel)) return false;
  skillPoints--;
  unlockedAugments.add(augmentId);
  return true;
}
