import { chunkKey } from '../../shared/chunkTerrainMutations';
import {
  CHUNK_SIZE,
  ensureChunkWater,
  parseLevelChunkJson,
  tileIndexXZ64,
} from '../../shared/levelChunk';
import {
  TERRAIN_GRID_DEPTH,
  TERRAIN_GRID_WIDTH,
  WORLD_CHUNK_COUNT_X,
  WORLD_CHUNK_COUNT_Z,
} from '../../shared/world';

export function clampGlobalTile(tx: number, tz: number): { tx: number; tz: number } {
  const x = Math.max(0, Math.min(TERRAIN_GRID_WIDTH - 1, Math.floor(tx)));
  const z = Math.max(0, Math.min(TERRAIN_GRID_DEPTH - 1, Math.floor(tz)));
  return { tx: x, tz: z };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TerrainChunkDb = { chunkKey: { find: (k: string) => { json: string } | undefined } };

export function isGlobalTileWater(db: TerrainChunkDb, tx: number, tz: number): boolean {
  const cx = Math.floor(tx / CHUNK_SIZE);
  const cz = Math.floor(tz / CHUNK_SIZE);
  if (cx < 0 || cz < 0 || cx >= WORLD_CHUNK_COUNT_X || cz >= WORLD_CHUNK_COUNT_Z) return true;
  const row = db.chunkKey.find(chunkKey(cx, cz));
  if (!row) return true;
  const ch = parseLevelChunkJson(row.json);
  ensureChunkWater(ch);
  const lx = tx - cx * CHUNK_SIZE;
  const lz = tz - cz * CHUNK_SIZE;
  return ch.water![tileIndexXZ64(lx, lz)] === true;
}

export function isTileWalkableNpc(db: TerrainChunkDb, tx: number, tz: number): boolean {
  const c = clampGlobalTile(tx, tz);
  return !isGlobalTileWater(db, c.tx, c.tz);
}

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function randomOrthoStep(seed: bigint): readonly [number, number] {
  const i = Number(seed % 4n);
  return ORTHO[i]!;
}

/**
 * Pick a wander goal within Chebyshev distance `radius` of home; tries a few pseudo-random tiles.
 */
export function pickWanderGoal(
  db: TerrainChunkDb,
  homeTx: number,
  homeTz: number,
  radius: number,
  seed: bigint
): { tx: number; tz: number } | null {
  const r = Math.max(0, Math.floor(radius));
  if (r === 0) {
    const h = clampGlobalTile(homeTx, homeTz);
    return isTileWalkableNpc(db, h.tx, h.tz) ? h : null;
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    const s = seed + BigInt(attempt * 31);
    const rdx = Number((s * 1103515245n + 12345n) % BigInt(2 * r + 1)) - r;
    const rdz = Number((s * 2246822519n + 12345n) % BigInt(2 * r + 1)) - r;
    const tx = homeTx + rdx;
    const tz = homeTz + rdz;
    const g = clampGlobalTile(tx, tz);
    if (Math.max(Math.abs(g.tx - homeTx), Math.abs(g.tz - homeTz)) > r) continue;
    if (isTileWalkableNpc(db, g.tx, g.tz)) return g;
  }
  return null;
}

export function stepToward(curTx: number, curTz: number, goalTx: number, goalTz: number): {
  tx: number;
  tz: number;
} {
  const dx = goalTx - curTx;
  const dz = goalTz - curTz;
  if (dx === 0 && dz === 0) return { tx: curTx, tz: curTz };
  if (Math.abs(dx) >= Math.abs(dz)) {
    return { tx: curTx + (dx > 0 ? 1 : -1), tz: curTz };
  }
  return { tx: curTx, tz: curTz + (dz > 0 ? 1 : -1) };
}

export function chebyshev(aTx: number, aTz: number, bTx: number, bTz: number): number {
  return Math.max(Math.abs(aTx - bTx), Math.abs(aTz - bTz));
}

export function areOrthogonallyAdjacent(aTx: number, aTz: number, bTx: number, bTz: number): boolean {
  const d = Math.abs(aTx - bTx) + Math.abs(aTz - bTz);
  return d === 1;
}
