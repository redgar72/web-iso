/**
 * Drop tables per monster type. When a monster dies, roll its table to spawn a pickup.
 */

export type DropType = 'health' | 'mana' | 'coin' | null;

export type MonsterType = 'redCube' | 'caster' | 'resurrector' | 'teleporter';

interface DropEntry {
  chance: number;
  drop: DropType;
}

/** Weighted drop table: chance should sum to 1. */
const DROP_TABLES: Record<MonsterType, DropEntry[]> = {
  redCube: [
    { chance: 0.48, drop: null },
    { chance: 0.26, drop: 'health' },
    { chance: 0.13, drop: 'mana' },
    { chance: 0.13, drop: 'coin' },
  ],
  caster: [
    { chance: 0.34, drop: null },
    { chance: 0.22, drop: 'health' },
    { chance: 0.30, drop: 'mana' },
    { chance: 0.14, drop: 'coin' },
  ],
  resurrector: [
    { chance: 0.30, drop: null },
    { chance: 0.26, drop: 'health' },
    { chance: 0.30, drop: 'mana' },
    { chance: 0.14, drop: 'coin' },
  ],
  teleporter: [
    { chance: 0.38, drop: null },
    { chance: 0.22, drop: 'health' },
    { chance: 0.26, drop: 'mana' },
    { chance: 0.14, drop: 'coin' },
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
