/**
 * Drop tables per monster type. When a monster dies, roll its table to spawn a pickup.
 */

export type DropType = 'health' | 'mana' | null;

export type MonsterType = 'redCube' | 'caster' | 'resurrector';

interface DropEntry {
  chance: number;
  drop: DropType;
}

/** Weighted drop table: chance should sum to 1. */
const DROP_TABLES: Record<MonsterType, DropEntry[]> = {
  redCube: [
    { chance: 0.55, drop: null },
    { chance: 0.30, drop: 'health' },
    { chance: 0.15, drop: 'mana' },
  ],
  caster: [
    { chance: 0.40, drop: null },
    { chance: 0.25, drop: 'health' },
    { chance: 0.35, drop: 'mana' },
  ],
  resurrector: [
    { chance: 0.35, drop: null },
    { chance: 0.30, drop: 'health' },
    { chance: 0.35, drop: 'mana' },
  ],
};

/**
 * Rolls the drop table for the given monster type. Returns the drop type or null.
 */
export function rollDrop(monsterType: MonsterType): DropType {
  const table = DROP_TABLES[monsterType];
  let r = Math.random();
  for (const entry of table) {
    r -= entry.chance;
    if (r <= 0) return entry.drop;
  }
  return null;
}
