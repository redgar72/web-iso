/**
 * Drop tables per monster type. When a monster dies, roll its table to spawn a pickup.
 */

export type DropType = 'mana' | 'coin' | null;

export type MonsterType =
  | 'redCube'
  | 'caster'
  | 'resurrector'
  | 'teleporter'
  | 'spider'
  | 'rat'
  | 'bear';

interface DropEntry {
  chance: number;
  drop: DropType;
}

/** Weighted drop table: chance should sum to 1. */
const DROP_TABLES: Record<MonsterType, DropEntry[]> = {
  redCube: [
    { chance: 0.48, drop: null },
    { chance: 0.39, drop: 'mana' },
    { chance: 0.13, drop: 'coin' },
  ],
  caster: [
    { chance: 0.34, drop: null },
    { chance: 0.52, drop: 'mana' },
    { chance: 0.14, drop: 'coin' },
  ],
  resurrector: [
    { chance: 0.30, drop: null },
    { chance: 0.56, drop: 'mana' },
    { chance: 0.14, drop: 'coin' },
  ],
  teleporter: [
    { chance: 0.38, drop: null },
    { chance: 0.48, drop: 'mana' },
    { chance: 0.14, drop: 'coin' },
  ],
  spider: [
    { chance: 0.55, drop: null },
    { chance: 0.22, drop: 'coin' },
    { chance: 0.23, drop: 'mana' },
  ],
  rat: [
    { chance: 0.55, drop: null },
    { chance: 0.22, drop: 'coin' },
    { chance: 0.23, drop: 'mana' },
  ],
  bear: [
    { chance: 0.40, drop: null },
    { chance: 0.42, drop: 'mana' },
    { chance: 0.18, drop: 'coin' },
  ],
};

/**
 * Rolls the drop table for the given monster type. Returns the drop type or null.
 */
export function rollDrop(monsterType: MonsterType): DropType {
  const roll = Math.random();
  let acc = 0;
  for (const entry of DROP_TABLES[monsterType]) {
    acc += entry.chance;
    if (roll < acc) return entry.drop;
  }
  return null;
}
