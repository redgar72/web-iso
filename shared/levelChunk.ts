/**
 * Level / terrain chunk format (shared by editor, runtime, and server).
 *
 * **Why JSON (`.chunk.json`)?**
 * - No extra dependencies; works with `fetch`, `JSON.parse`, and CLI tools.
 * - Easy to extend (optional fields, nested spawns) and to migrate via `version`.
 * - Diffs in Git are useful for small edits; for huge binary blobs use separate assets.
 * - At 64×64, even verbose JSON is fine; enable gzip on CDN. Later you can add
 *   `textureIndices` as a base64 u16 buffer or MessagePack if size matters.
 */

export const CHUNK_SIZE = 64;
export const CHUNK_TILE_COUNT = CHUNK_SIZE * CHUNK_SIZE;
/** Corners per axis (tile corners); height samples at each vertex of the terrain lattice. */
export const CHUNK_CORNER_STRIDE = CHUNK_SIZE + 1;
/** `(CHUNK_SIZE + 1)²` — index with {@link cornerHeightIndex}. */
export const CHUNK_CORNER_COUNT = CHUNK_CORNER_STRIDE * CHUNK_CORNER_STRIDE;

/** Fallback tint per palette index until real textures load (editor + runtime stay in sync). */
export const TEXTURE_INDEX_PREVIEW_HEX: readonly string[] = [
  '#5a5668',
  '#6b5344',
  '#5a6578',
  '#8b7a58',
  '#3d5c4a',
  '#6a5a70',
  '#4a5048',
  '#7a6048',
];

export function previewHexForTextureIndex(index: number): string {
  if (index >= 0 && index < TEXTURE_INDEX_PREVIEW_HEX.length) {
    return TEXTURE_INDEX_PREVIEW_HEX[index]!;
  }
  const i = Math.max(0, index);
  return `hsl(${(i * 47) % 360} 35% ${45 + (i % 3) * 6}%)`;
}

export const LEVEL_CHUNK_FORMAT = 'web-iso-chunk' as const;

/** Current serialized schema version; bump when breaking layout. */
export const LEVEL_CHUNK_VERSION = 1 as const;

/** World Y of the visible water surface (Three.js up). Basins use terrain heights below this. */
export const WATER_SURFACE_Y_WORLD = 0;

export type LevelChunkFormat = typeof LEVEL_CHUNK_FORMAT;
export type LevelChunkVersion = typeof LEVEL_CHUNK_VERSION;

/**
 * One chunk: square grid, axis convention matches game tiles (x, z), +z = north.
 * Linear index: `x * CHUNK_SIZE + z` (same pattern as `tileKey` with depth = CHUNK_SIZE).
 */
export interface LevelChunkV1 {
  format: LevelChunkFormat;
  version: LevelChunkVersion;
  /** Optional label for editors / debugging. */
  name?: string;
  /**
   * Texture ids referenced by `textureIndices` (palette).
   * Index 0 is expected to be the default ground type at runtime.
   */
  texturePalette: string[];
  /** Length must be CHUNK_TILE_COUNT; values index into `texturePalette`. */
  textureIndices: number[];
  /**
   * World-space Y (Three.js up) at each tile corner, chunk-local grid.
   * Index `ix * CHUNK_CORNER_STRIDE + iz` for `ix, iz ∈ [0, CHUNK_SIZE]`.
   * Adjacent chunks must use matching heights on shared boundary corners.
   */
  cornerHeights: number[];
  /**
   * When true, this tile is water: volume from the terrain surface up to {@link WATER_SURFACE_Y_WORLD}
   * is treated as water (not walkable). The visible surface is a flat plane at that world Y.
   */
  water?: boolean[];
  // --- Reserved for future (keep optional for forward compatibility) ---
  /** Future: ground item spawn points keyed by linear tile index. */
  // groundItemSpawns?: Record<string, GroundItemSpawnDef[]>;
  /** Future: npc / object markers. */
  // entities?: LevelEntitySpawn[];
}

export function cornerHeightIndex(ix: number, iz: number): number {
  return ix * CHUNK_CORNER_STRIDE + iz;
}

export function tileIndexXZ64(x: number, z: number): number {
  return x * CHUNK_SIZE + z;
}

export function indexToXZ64(i: number): { x: number; z: number } {
  return { x: Math.floor(i / CHUNK_SIZE), z: i % CHUNK_SIZE };
}

export function createEmptyChunkV1(name?: string): LevelChunkV1 {
  return {
    format: LEVEL_CHUNK_FORMAT,
    version: LEVEL_CHUNK_VERSION,
    name,
    texturePalette: ['terrain.default', 'terrain.dirt', 'terrain.stone', 'terrain.sand'],
    textureIndices: new Array<number>(CHUNK_TILE_COUNT).fill(0),
    cornerHeights: new Array<number>(CHUNK_CORNER_COUNT).fill(0),
    water: new Array<boolean>(CHUNK_TILE_COUNT).fill(false),
  };
}

/** Ensure `cornerHeights` exists and has correct length (mutates legacy parsed chunks). */
export function ensureChunkCornerHeights(chunk: LevelChunkV1): void {
  if (chunk.cornerHeights?.length === CHUNK_CORNER_COUNT) return;
  chunk.cornerHeights = new Array<number>(CHUNK_CORNER_COUNT).fill(0);
}

/** Ensure `water` exists and has correct length (mutates legacy parsed chunks). */
export function ensureChunkWater(chunk: LevelChunkV1): void {
  if (chunk.water?.length === CHUNK_TILE_COUNT) return;
  chunk.water = new Array<boolean>(CHUNK_TILE_COUNT).fill(false);
}

export function tileHasWater(chunk: LevelChunkV1, lx: number, lz: number): boolean {
  if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE) return false;
  return !!chunk.water?.[tileIndexXZ64(lx, lz)];
}

export function isLevelChunkV1(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (o.format !== LEVEL_CHUNK_FORMAT) return false;
  if (o.version !== LEVEL_CHUNK_VERSION) return false;
  if (!Array.isArray(o.texturePalette)) return false;
  if (!Array.isArray(o.textureIndices)) return false;
  if (o.textureIndices.length !== CHUNK_TILE_COUNT) return false;
  if (!o.textureIndices.every((n) => typeof n === 'number' && n === Math.floor(n) && n >= 0)) return false;
  if (o.cornerHeights !== undefined) {
    if (!Array.isArray(o.cornerHeights)) return false;
    if (o.cornerHeights.length !== CHUNK_CORNER_COUNT) return false;
    if (!o.cornerHeights.every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  }
  if (o.water !== undefined) {
    if (!Array.isArray(o.water)) return false;
    if (o.water.length !== CHUNK_TILE_COUNT) return false;
    if (
      !o.water.every(
        (b) => typeof b === 'boolean' || (typeof b === 'number' && (b === 0 || b === 1))
      )
    ) {
      return false;
    }
  }
  return true;
}

/** Coerce JSON `water` entries to booleans (some tools emit 0/1). */
function normalizeChunkWaterInPlace(chunk: LevelChunkV1): void {
  if (chunk.water === undefined) {
    ensureChunkWater(chunk);
    return;
  }
  if (chunk.water.length !== CHUNK_TILE_COUNT) {
    ensureChunkWater(chunk);
    return;
  }
  for (let i = 0; i < CHUNK_TILE_COUNT; i++) {
    const v = chunk.water[i] as unknown;
    chunk.water[i] = v === true || v === 1;
  }
}

export function parseLevelChunkJson(text: string): LevelChunkV1 {
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Invalid JSON');
  }
  if (!isLevelChunkV1(data)) throw new Error('Not a valid web-iso-chunk v1 file');
  const chunk = data as LevelChunkV1;
  for (let i = 0; i < CHUNK_TILE_COUNT; i++) {
    const idx = chunk.textureIndices[i]!;
    if (idx >= chunk.texturePalette.length) throw new Error(`textureIndices[${i}] out of palette range`);
  }
  ensureChunkCornerHeights(chunk);
  normalizeChunkWaterInPlace(chunk);
  return chunk;
}

export function serializeLevelChunk(chunk: LevelChunkV1, pretty = true): string {
  return pretty ? JSON.stringify(chunk, null, 2) : JSON.stringify(chunk);
}
