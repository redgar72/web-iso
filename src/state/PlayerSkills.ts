/**
 * Player skill levels (RuneScape-style categories): combat + gathering stats for the Skills panel.
 * Separate from `SkillTree` (K key: unlock points / augments).
 */

export type PlayerSkillId =
  | 'attack'
  | 'strength'
  | 'archery'
  | 'arcane'
  | 'divinity'
  | 'mining'
  | 'forestry'
  | 'fishing';

export const PLAYER_SKILL_IDS: readonly PlayerSkillId[] = [
  'attack',
  'strength',
  'archery',
  'arcane',
  'divinity',
  'mining',
  'forestry',
  'fishing',
] as const;

export const PLAYER_SKILL_LABEL: Record<PlayerSkillId, string> = {
  attack: 'Attack',
  strength: 'Strength',
  archery: 'Archery',
  arcane: 'Arcane',
  divinity: 'Divinity',
  mining: 'Mining',
  forestry: 'Forestry',
  fishing: 'Fishing',
};

export const PLAYER_SKILL_SECTIONS: ReadonlyArray<{ title: string; skills: readonly PlayerSkillId[] }> = [
  { title: 'Combat', skills: ['attack', 'strength', 'archery', 'arcane', 'divinity'] },
  { title: 'Gathering', skills: ['mining', 'forestry', 'fishing'] },
];

const XP_PER_LEVEL = 100;
const MAX_LEVEL = 99;

export function skillLevelFromTotalXp(totalXp: number): number {
  return Math.min(MAX_LEVEL, 1 + Math.floor(Math.max(0, totalXp) / XP_PER_LEVEL));
}

export function skillXpProgress(
  totalXp: number
): { level: number; intoLevel: number; requiredForNext: number; atMax: boolean } {
  const level = skillLevelFromTotalXp(totalXp);
  if (level >= MAX_LEVEL) {
    return { level: MAX_LEVEL, intoLevel: XP_PER_LEVEL, requiredForNext: XP_PER_LEVEL, atMax: true };
  }
  const base = (level - 1) * XP_PER_LEVEL;
  return {
    level,
    intoLevel: totalXp - base,
    requiredForNext: XP_PER_LEVEL,
    atMax: false,
  };
}

export interface PlayerSkillsAPI {
  getTotalXp: (id: PlayerSkillId) => number;
  getLevel: (id: PlayerSkillId) => number;
  getXpProgress: (id: PlayerSkillId) => ReturnType<typeof skillXpProgress>;
  addXp: (id: PlayerSkillId, amount: number) => void;
  snapshot: () => Record<PlayerSkillId, { xp: number; level: number }>;
  subscribe: (fn: () => void) => () => void;
}

export function createPlayerSkills(): PlayerSkillsAPI {
  const xp: Record<PlayerSkillId, number> = {
    attack: 0,
    strength: 0,
    archery: 0,
    arcane: 0,
    divinity: 0,
    mining: 0,
    forestry: 0,
    fishing: 0,
  };
  const listeners: Array<() => void> = [];

  function getTotalXp(id: PlayerSkillId): number {
    return xp[id];
  }

  function getLevel(id: PlayerSkillId): number {
    return skillLevelFromTotalXp(xp[id]);
  }

  function getXpProgress(id: PlayerSkillId) {
    return skillXpProgress(xp[id]);
  }

  function addXp(id: PlayerSkillId, amount: number): void {
    if (amount <= 0) return;
    const capXp = (MAX_LEVEL - 1) * XP_PER_LEVEL + (XP_PER_LEVEL - 1);
    xp[id] = Math.min(capXp, xp[id] + Math.floor(amount));
    listeners.forEach((fn) => fn());
  }

  function snapshot(): Record<PlayerSkillId, { xp: number; level: number }> {
    const o = {} as Record<PlayerSkillId, { xp: number; level: number }>;
    for (const id of PLAYER_SKILL_IDS) {
      o[id] = { xp: xp[id], level: getLevel(id) };
    }
    return o;
  }

  function subscribe(fn: () => void): () => void {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  return { getTotalXp, getLevel, getXpProgress, addXp, snapshot, subscribe };
}

/** XP granted per successful gather (inventory received an item). */
export const GATHERING_SUCCESS_SKILL_XP = 25;
