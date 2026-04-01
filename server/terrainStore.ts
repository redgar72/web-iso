import fs from 'node:fs';
import path from 'node:path';
import {
  addHeightDeltaAtWorldTile,
  chunkKey,
  paintTextureAtWorldTile,
  setWaterAtWorldTile,
  type EnsureChunkFn,
} from '../shared/chunkTerrainMutations';
import {
  createEmptyChunkV1,
  parseLevelChunkJson,
  serializeLevelChunk,
  type LevelChunkV1,
} from '../shared/levelChunk';
import { forEachUniqueTileInBrush, type TerrainPaintMode } from '../shared/terrainBrush';
import { WORLD_CHUNK_COUNT_X, WORLD_CHUNK_COUNT_Z } from '../shared/world';

/**
 * Chunk JSON directory. Override if the server runs with a different cwd.
 * Defaults to `public/levels` under the repo root when `npm run server` is used.
 */
export const LEVELS_DIR = process.env.WEB_ISO_LEVELS_DIR ?? path.join(process.cwd(), 'public', 'levels');

/** In-memory cache so repeated edits hit the same object graph as on disk. */
const chunkDiskCache = new Map<string, LevelChunkV1>();

function loadChunkFromDisk(cx: number, cz: number): LevelChunkV1 {
  const key = chunkKey(cx, cz);
  const hit = chunkDiskCache.get(key);
  if (hit) return hit;
  const fp = path.join(LEVELS_DIR, `chunk_${cx}_${cz}.chunk.json`);
  let ch: LevelChunkV1;
  try {
    ch = parseLevelChunkJson(fs.readFileSync(fp, 'utf8'));
  } catch {
    ch = createEmptyChunkV1(`chunk_${cx}_${cz}`);
  }
  chunkDiskCache.set(key, ch);
  return ch;
}

function saveChunkToDisk(cx: number, cz: number, ch: LevelChunkV1): void {
  const fp = path.join(LEVELS_DIR, `chunk_${cx}_${cz}.chunk.json`);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, serializeLevelChunk(ch, false), 'utf8');
}

function ensureChunkOnServer(cx: number, cz: number): LevelChunkV1 | undefined {
  if (cx < 0 || cz < 0 || cx >= WORLD_CHUNK_COUNT_X || cz >= WORLD_CHUNK_COUNT_Z) return undefined;
  return loadChunkFromDisk(cx, cz);
}

/**
 * Applies one terrain brush stroke (same semantics as the game client) and writes affected chunk files.
 */
export function persistTerrainEdit(
  tx: number,
  tz: number,
  mode: TerrainPaintMode,
  textureIndex: number,
  heightStep: number,
  brushRadius: number
): Set<string> {
  const working = new Map<string, LevelChunkV1>();
  const dirty = new Set<string>();

  const ensureChunk: EnsureChunkFn = (cx, cz) => {
    const ch = ensureChunkOnServer(cx, cz);
    if (!ch) return undefined;
    working.set(chunkKey(cx, cz), ch);
    return ch;
  };

  const delta = mode === 'raise' ? heightStep : mode === 'lower' ? -heightStep : 0;

  forEachUniqueTileInBrush(tx, tz, brushRadius, (gx, gz) => {
    if (mode === 'water' || mode === 'water_erase') {
      const k = setWaterAtWorldTile(working, gx, gz, mode === 'water', ensureChunk);
      if (k) dirty.add(k);
    } else if (mode === 'texture') {
      const k = paintTextureAtWorldTile(working, gx, gz, textureIndex, ensureChunk);
      if (k) dirty.add(k);
    } else {
      addHeightDeltaAtWorldTile(working, gx, gz, delta, dirty, ensureChunk);
    }
  });

  for (const k of dirty) {
    const ch = working.get(k);
    if (!ch) continue;
    chunkDiskCache.set(k, ch);
    const [sx, sz] = k.split(',').map(Number) as [number, number];
    saveChunkToDisk(sx, sz, ch);
  }

  return dirty;
}
