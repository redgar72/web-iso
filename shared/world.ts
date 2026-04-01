import { CHUNK_SIZE } from './levelChunk';

export const TILE_SIZE = 2;
export const TILE_HALF = TILE_SIZE / 2;

/**
 * Fixed world size in chunks (non-negative chunk indices `[0, count)`).
 * Total tiles per axis = `CHUNK_SIZE * count`.
 */
export const WORLD_CHUNK_COUNT_X = 3;
export const WORLD_CHUNK_COUNT_Z = 3;

/**
 * Chebyshev radius in chunk space: load chunks where `max(|cx - pcx|, |cz - pcz|) <= R`.
 * `R = 0` → only the chunk under the player; `R = 1` → up to 3×3.
 */
export const CHUNK_LOAD_RADIUS_CHUNKS = 1;

/** Global tile grid spanning all loaded chunk columns/rows. */
export const TERRAIN_GRID_WIDTH = CHUNK_SIZE * WORLD_CHUNK_COUNT_X;
export const TERRAIN_GRID_DEPTH = CHUNK_SIZE * WORLD_CHUNK_COUNT_Z;

/** Chebyshev tile distance — “square” AOI. */
export const AOI_MAX_TILE_RADIUS = 10;

/** Max other players replicated to one client (server-enforced). */
export const MAX_VISIBLE_PEERS = 20;

export function tileCenterXZ(tx: number, tz: number): { x: number; z: number } {
  return {
    x: tx * TILE_SIZE + TILE_HALF,
    z: tz * TILE_SIZE + TILE_HALF,
  };
}

export function chebyshevTileDist(a: { tx: number; tz: number }, b: { tx: number; tz: number }): number {
  return Math.max(Math.abs(a.tx - b.tx), Math.abs(a.tz - b.tz));
}

export function clampTile(tx: number, tz: number): { tx: number; tz: number } {
  return {
    tx: Math.max(0, Math.min(TERRAIN_GRID_WIDTH - 1, Math.floor(tx))),
    tz: Math.max(0, Math.min(TERRAIN_GRID_DEPTH - 1, Math.floor(tz))),
  };
}

export { OSRS_TICK_MS } from './tick';
