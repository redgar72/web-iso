import {
  CHUNK_SIZE,
  cornerHeightIndex,
  ensureChunkWater,
  tileIndexXZ64,
  type LevelChunkV1,
} from './levelChunk';
import { forEachUniqueTileInBrush } from './terrainBrush';
import { WORLD_CHUNK_COUNT_X, WORLD_CHUNK_COUNT_Z } from './world';

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/** Chunk map keys (`"cx,cz"`) intersected by a terrain brush in world tile space. */
export function affectedChunkKeysForTerrainBrush(
  centerTx: number,
  centerTz: number,
  brushRadius: number
): string[] {
  const keys = new Set<string>();
  forEachUniqueTileInBrush(centerTx, centerTz, brushRadius, (gx, gz) => {
    const cx = Math.floor(gx / CHUNK_SIZE);
    const cz = Math.floor(gz / CHUNK_SIZE);
    if (cx < 0 || cz < 0 || cx >= WORLD_CHUNK_COUNT_X || cz >= WORLD_CHUNK_COUNT_Z) return;
    keys.add(chunkKey(cx, cz));
  });
  return [...keys];
}

/** @internal Exported for server + loader; matches chunk loader seam logic. */
export function worldCornerOwners(
  wcx: number,
  wcz: number,
  worldChunksX: number,
  worldChunksZ: number
): { cx: number; cz: number; ix: number; iz: number }[] {
  const cxCand = new Set<number>();
  if (wcx % CHUNK_SIZE === 0 && wcx > 0) {
    cxCand.add(wcx / CHUNK_SIZE - 1);
    cxCand.add(wcx / CHUNK_SIZE);
  } else {
    cxCand.add(Math.floor(wcx / CHUNK_SIZE));
  }
  const czCand = new Set<number>();
  if (wcz % CHUNK_SIZE === 0 && wcz > 0) {
    czCand.add(wcz / CHUNK_SIZE - 1);
    czCand.add(wcz / CHUNK_SIZE);
  } else {
    czCand.add(Math.floor(wcz / CHUNK_SIZE));
  }
  const out: { cx: number; cz: number; ix: number; iz: number }[] = [];
  for (const cx of cxCand) {
    for (const cz of czCand) {
      if (cx < 0 || cz < 0 || cx >= worldChunksX || cz >= worldChunksZ) continue;
      const ix = wcx - cx * CHUNK_SIZE;
      const iz = wcz - cz * CHUNK_SIZE;
      if (ix < 0 || ix > CHUNK_SIZE || iz < 0 || iz > CHUNK_SIZE) continue;
      out.push({ cx, cz, ix, iz });
    }
  }
  return out;
}

export type EnsureChunkFn = (cx: number, cz: number) => LevelChunkV1 | undefined;

export function readWorldCornerHeightFromMap(
  chunkData: ReadonlyMap<string, LevelChunkV1>,
  wcx: number,
  wcz: number,
  ensureChunk?: EnsureChunkFn
): number {
  for (const { cx, cz, ix, iz } of worldCornerOwners(
    wcx,
    wcz,
    WORLD_CHUNK_COUNT_X,
    WORLD_CHUNK_COUNT_Z
  )) {
    const k = chunkKey(cx, cz);
    let ch = chunkData.get(k);
    if (!ch && ensureChunk) ch = ensureChunk(cx, cz);
    if (ch) return ch.cornerHeights[cornerHeightIndex(ix, iz)] ?? 0;
  }
  return 0;
}

function applyWorldCornerY(
  chunkData: Map<string, LevelChunkV1>,
  wcx: number,
  wcz: number,
  y: number,
  dirtyKeys: Set<string>,
  ensureChunk?: EnsureChunkFn
): void {
  for (const { cx, cz, ix, iz } of worldCornerOwners(
    wcx,
    wcz,
    WORLD_CHUNK_COUNT_X,
    WORLD_CHUNK_COUNT_Z
  )) {
    const k = chunkKey(cx, cz);
    let ch = chunkData.get(k);
    if (!ch && ensureChunk) ch = ensureChunk(cx, cz);
    if (!ch) continue;
    chunkData.set(k, ch);
    ch.cornerHeights[cornerHeightIndex(ix, iz)] = y;
    dirtyKeys.add(k);
  }
}

export function paintTextureAtWorldTile(
  chunkData: Map<string, LevelChunkV1>,
  gtx: number,
  gtz: number,
  paletteIndex: number,
  ensureChunk?: EnsureChunkFn
): string | null {
  const cx = Math.floor(gtx / CHUNK_SIZE);
  const cz = Math.floor(gtz / CHUNK_SIZE);
  const k = chunkKey(cx, cz);
  let ch = chunkData.get(k);
  if (!ch && ensureChunk) ch = ensureChunk(cx, cz);
  if (!ch) return null;
  chunkData.set(k, ch);
  const lx = gtx - cx * CHUNK_SIZE;
  const lz = gtz - cz * CHUNK_SIZE;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return null;
  if (paletteIndex < 0 || paletteIndex >= ch.texturePalette.length) return null;
  ch.textureIndices[tileIndexXZ64(lx, lz)] = paletteIndex;
  return k;
}

export function setWaterAtWorldTile(
  chunkData: Map<string, LevelChunkV1>,
  gtx: number,
  gtz: number,
  wet: boolean,
  ensureChunk?: EnsureChunkFn
): string | null {
  const cx = Math.floor(gtx / CHUNK_SIZE);
  const cz = Math.floor(gtz / CHUNK_SIZE);
  const k = chunkKey(cx, cz);
  let ch = chunkData.get(k);
  if (!ch && ensureChunk) ch = ensureChunk(cx, cz);
  if (!ch) return null;
  chunkData.set(k, ch);
  ensureChunkWater(ch);
  const lx = gtx - cx * CHUNK_SIZE;
  const lz = gtz - cz * CHUNK_SIZE;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return null;
  ch.water![tileIndexXZ64(lx, lz)] = wet;
  return k;
}

export function addHeightDeltaAtWorldTile(
  chunkData: Map<string, LevelChunkV1>,
  gtx: number,
  gtz: number,
  delta: number,
  dirtyKeys: Set<string>,
  ensureChunk?: EnsureChunkFn
): void {
  const corners: [number, number][] = [
    [gtx, gtz],
    [gtx + 1, gtz],
    [gtx + 1, gtz + 1],
    [gtx, gtz + 1],
  ];
  for (const [wcx, wcz] of corners) {
    const y =
      readWorldCornerHeightFromMap(chunkData, wcx, wcz, ensureChunk) + delta;
    applyWorldCornerY(chunkData, wcx, wcz, y, dirtyKeys, ensureChunk);
  }
}
