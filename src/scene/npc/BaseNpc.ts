import * as THREE from 'three';
import type { GridTile } from '../../world/TilePathfinding';
import { tileCenterXZ } from '../../world/TilePathfinding';
import { pickNpcIdleStep, DEFAULT_NPC_MAX_WANDER_TILES } from '../NpcBehavior';

/**
 * Shared server-tick + render-lerp state for tile-based NPCs (OSRS-style).
 * Subclasses define combat size, mesh height, and bite stats.
 */
export abstract class BaseNpc {
  readonly logicalTile: GridTile = { x: 0, z: 0 };
  readonly homeTile: GridTile = { x: 0, z: 0 };
  readonly visFrom = { x: 0, z: 0 };
  readonly visTo = { x: 0, z: 0 };
  /** Logical standing point (tile center, Y = ground clearance for combat/collision). */
  readonly position = new THREE.Vector3();

  alive = true;
  health: number;

  aggressive = true;
  attackable = true;
  maxWanderTiles = DEFAULT_NPC_MAX_WANDER_TILES;

  /** Counts ticks while orthogonally adjacent to an attack target (player); compared to {@link biteIntervalTicks}. */
  biteTick = 0;
  biteIntervalTicks = 3;
  /** Melee lunge visual: -1 = idle, else game time when lurch began. */
  lurchStartGameTime = -1;

  protected constructor(maxHealth: number) {
    this.health = maxHealth;
  }

  /** XZ disk radius for movement blocking vs player and ranged hit tests. */
  abstract get collisionRadius(): number;
  /** World Y for {@link position} when standing on a tile center. */
  abstract get visualGroundY(): number;
  abstract get biteDamage(): number;

  placeAtTile(tile: GridTile): void {
    this.homeTile.x = this.logicalTile.x = tile.x;
    this.homeTile.z = this.logicalTile.z = tile.z;
    const c = tileCenterXZ(tile);
    this.visFrom.x = this.visTo.x = c.x;
    this.visFrom.z = this.visTo.z = c.z;
    this.position.set(c.x, this.visualGroundY, c.z);
  }

  commitTileStep(newTile: GridTile, oldTile: GridTile): void {
    const ro = tileCenterXZ(oldTile);
    const rn = tileCenterXZ(newTile);
    this.logicalTile.x = newTile.x;
    this.logicalTile.z = newTile.z;
    this.visFrom.x = ro.x;
    this.visFrom.z = ro.z;
    this.visTo.x = rn.x;
    this.visTo.z = rn.z;
    this.position.set(rn.x, this.visualGroundY, rn.z);
  }

  /**
   * @returns New tile after wander, or `null` to stay in place (`occupied` must still account for current tile).
   */
  tryIdleWanderStep(
    oldTile: GridTile,
    occupied: Set<number>,
    rng: () => number,
    idleChance: number
  ): GridTile | null {
    if (rng() >= idleChance) return null;
    return pickNpcIdleStep(oldTile, this.homeTile, this.maxWanderTiles, occupied, rng);
  }

  resetBiteAccumulator(): void {
    this.biteTick = 0;
  }
}
