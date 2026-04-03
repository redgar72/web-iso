import * as THREE from 'three';
import type { GridTile } from '../world/TilePathfinding';
import { tileCenterXZ } from '../world/TilePathfinding';
import { PEN_RAT_COUNT } from './PenRats';
import { STARTING_WILDLIFE_COUNT, STARTING_WILDLIFE_INITIAL_TILES } from './StartingAreaWildlife';
import { createPenRatNpcs, createWildlifeNpcs, type PenRatNpc, type WildlifeNpc } from './npc';
import { createPenRatGroup, createStartingWildlifeGroup, createEnemies } from './meshes';

/** Starting tiles for pen rats (pathfinding demo pen). */
export const PEN_RAT_INITIAL_TILES: GridTile[] = [
  { x: 18, z: 5 },
  { x: 19, z: 5 },
  { x: 17, z: 6 },
  { x: 19, z: 6 },
];

export interface NpcSceneBundle {
  penRatNpcs: PenRatNpc[];
  penRatGroup: THREE.Group;
  wildlifeNpcs: WildlifeNpc[];
  startingWildlifeGroup: THREE.Group;
  enemies: THREE.Group;
}

export interface NpcSceneContentOptions {
  /**
   * When false, no local starting wildlife meshes/logic — use server-driven NPCs (SpacetimeDB) instead.
   * @default true
   */
  includeLegacyStartingWildlife?: boolean;
}

/**
 * Builds all NPC logical state, meshes, and grunt group in one place.
 * Add new NPC populations here; keep mesh factories under `scene/meshes/`.
 */
export function createNpcSceneContent(options?: NpcSceneContentOptions): NpcSceneBundle {
  const legacy = options?.includeLegacyStartingWildlife !== false;
  const penRatNpcs = createPenRatNpcs();
  const penRatGroup = createPenRatGroup();
  const wildlifeNpcs = legacy ? createWildlifeNpcs() : [];
  const startingWildlifeGroup = legacy ? createStartingWildlifeGroup() : new THREE.Group();
  const enemies = createEnemies();

  for (let ri = 0; ri < PEN_RAT_COUNT; ri++) {
    const tile = PEN_RAT_INITIAL_TILES[ri] ?? { x: 18, z: 5 };
    penRatNpcs[ri].placeAtTile(tile);
    const c = tileCenterXZ(tile);
    const rat = penRatGroup.children[ri] as THREE.Group;
    if (rat) rat.position.set(c.x, 0, c.z);
  }

  if (legacy) {
    for (let wi = 0; wi < STARTING_WILDLIFE_COUNT; wi++) {
      const tile = STARTING_WILDLIFE_INITIAL_TILES[wi] ?? { x: 7, z: 5 };
      wildlifeNpcs[wi]?.placeAtTile(tile);
      const c = tileCenterXZ(tile);
      const mob = startingWildlifeGroup.children[wi] as THREE.Group;
      if (mob) mob.position.set(c.x, 0, c.z);
    }
  }

  return { penRatNpcs, penRatGroup, wildlifeNpcs, startingWildlifeGroup, enemies };
}
