import type { GridTile } from '../world/TilePathfinding';

export const STARTING_SPIDER_COUNT = 3;
export const STARTING_BEAR_COUNT = 2;
export const STARTING_WILDLIFE_COUNT = STARTING_SPIDER_COUNT + STARTING_BEAR_COUNT;

export const SPIDER_SIZE = 0.34;
export const BEAR_SIZE = 0.78;

export const MAX_SPIDER_HEALTH = 11;
export const MAX_BEAR_HEALTH = 36;

export const SPIDER_BITE_DAMAGE = 3;
export const BEAR_BITE_DAMAGE = 7;

/** Game ticks between melee hits when orthogonally adjacent to the player. */
export const SPIDER_ATTACK_TICK_INTERVAL = 3;
export const BEAR_ATTACK_TICK_INTERVAL = 2;

export type StartingWildlifeKind = 'spider' | 'bear' | 'rat';

/** Tile centers south / east of spawn (player ~tile 5,5). */
export const STARTING_WILDLIFE_INITIAL_TILES: GridTile[] = [
  { x: 7, z: 5 },
  { x: 6, z: 4 },
  { x: 8, z: 4 },
  { x: 4, z: 7 },
  { x: 9, z: 7 },
];

export function wildlifeKindAt(index: number): StartingWildlifeKind {
  return index < STARTING_SPIDER_COUNT ? 'spider' : 'bear';
}

export function wildlifeSizeAt(index: number): number {
  return wildlifeKindAt(index) === 'spider' ? SPIDER_SIZE : BEAR_SIZE;
}

/** Collision / hit radius (XZ), matches pen-rat style `size * 0.45`. */
export function wildlifeCollisionRadiusAt(index: number): number {
  return wildlifeSizeAt(index) * 0.45;
}

export function wildlifeMaxHealthAt(index: number): number {
  return wildlifeKindAt(index) === 'spider' ? MAX_SPIDER_HEALTH : MAX_BEAR_HEALTH;
}

export function wildlifeBiteDamageAt(index: number): number {
  return wildlifeKindAt(index) === 'spider' ? SPIDER_BITE_DAMAGE : BEAR_BITE_DAMAGE;
}

export function wildlifeAttackTickIntervalAt(index: number): number {
  return wildlifeKindAt(index) === 'spider' ? SPIDER_ATTACK_TICK_INTERVAL : BEAR_ATTACK_TICK_INTERVAL;
}
