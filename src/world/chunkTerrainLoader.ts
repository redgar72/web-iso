import * as THREE from 'three';
import {
  addHeightDeltaAtWorldTile,
  chunkKey,
  paintTextureAtWorldTile,
  readWorldCornerHeightFromMap,
  setWaterAtWorldTile,
} from '../../shared/chunkTerrainMutations';
import { forEachUniqueTileInBrush } from '../../shared/terrainBrush';
import {
  CHUNK_SIZE,
  cornerHeightIndex,
  createEmptyChunkV1,
  parseLevelChunkJson,
  serializeLevelChunk,
  tileIndexXZ64,
  type LevelChunkV1,
} from '../../shared/levelChunk';
import { buildChunkWaterSurfaceMesh, setSharedWaterTime } from '../scene/chunkWaterMesh';
import type { GridTile, TileNavProfile } from './TilePathfinding';
import {
  CHUNK_LOAD_RADIUS_CHUNKS,
  TILE_SIZE,
  TERRAIN_GRID_DEPTH,
  TERRAIN_GRID_WIDTH,
  WORLD_CHUNK_COUNT_X,
  WORLD_CHUNK_COUNT_Z,
} from '../../shared/world';
import { buildChunkTerrainMesh } from '../scene/chunkTerrainMesh';

function disposeChunkMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  const mat = mesh.material;
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat.dispose();
}

export interface ChunkTerrainLoaderOptions {
  /** Override global default when testing. */
  loadRadiusChunks?: number;
  /** URL prefix including trailing path; files are `${prefix}${cx}_${cz}.chunk.json`. */
  levelBaseUrl: string;
  /** After any chunk mesh is built or rebuilt (dev terrain overlay, etc.). */
  onChunkMeshRebuilt?: () => void;
}

/**
 * Loads `.chunk.json` terrain meshes around the player (GPU) while the logical grid
 * remains `TERRAIN_GRID_*` from shared world config.
 *
 * Keeps a persistent {@link chunkData} map so in-game edits survive chunk unload when the player walks away.
 */
const BLOCK_WATER_TILE_NAV: TileNavProfile = {
  north: false,
  east: false,
  south: false,
  west: false,
  occupiable: false,
};

export class ChunkTerrainLoader {
  readonly terrainRoot = new THREE.Group();
  private readonly loaded = new Map<string, THREE.Mesh>();
  private readonly loadedWater = new Map<string, THREE.Mesh>();
  /** Authoritative chunk JSON (including edits); not cleared when meshes unload. */
  private readonly chunkData = new Map<string, LevelChunkV1>();
  private readonly loadRadius: number;
  private readonly baseUrl: string;
  private readonly onChunkMeshRebuilt?: () => void;

  constructor(_scene: THREE.Scene, options: ChunkTerrainLoaderOptions) {
    this.loadRadius = options.loadRadiusChunks ?? CHUNK_LOAD_RADIUS_CHUNKS;
    this.baseUrl = options.levelBaseUrl;
    this.onChunkMeshRebuilt = options.onChunkMeshRebuilt;
    _scene.add(this.terrainRoot);
  }

  private notifyChunkMeshRebuilt(): void {
    this.onChunkMeshRebuilt?.();
  }

  /** Pathfinding entries for all water tiles present in loaded chunk data. */
  getWaterTileNavExceptions(): ReadonlyArray<{ tile: GridTile; profile: TileNavProfile }> {
    const out: Array<{ tile: GridTile; profile: TileNavProfile }> = [];
    for (const [key, ch] of this.chunkData) {
      if (!ch.water) continue;
      const [sx, sz] = key.split(',');
      const cx = Number(sx);
      const cz = Number(sz);
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          if (!ch.water[tileIndexXZ64(lx, lz)]) continue;
          out.push({
            tile: { x: cx * CHUNK_SIZE + lx, z: cz * CHUNK_SIZE + lz },
            profile: BLOCK_WATER_TILE_NAV,
          });
        }
      }
    }
    return out;
  }

  /** Animate shared water shader (call each frame). */
  updateWaterEffect(timeSeconds: number): void {
    setSharedWaterTime(timeSeconds);
  }

  /** World tile coords (global). */
  async syncToWorldTile(tileX: number, tileZ: number): Promise<void> {
    const pcx = Math.floor(tileX / CHUNK_SIZE);
    const pcz = Math.floor(tileZ / CHUNK_SIZE);
    const want = new Set<string>();

    const r = this.loadRadius;
    for (let dcx = -r; dcx <= r; dcx++) {
      for (let dcz = -r; dcz <= r; dcz++) {
        const cx = pcx + dcx;
        const cz = pcz + dcz;
        if (cx < 0 || cz < 0 || cx >= WORLD_CHUNK_COUNT_X || cz >= WORLD_CHUNK_COUNT_Z) continue;
        want.add(chunkKey(cx, cz));
      }
    }

    for (const [key, mesh] of this.loaded) {
      if (!want.has(key)) {
        this.terrainRoot.remove(mesh);
        disposeChunkMesh(mesh);
        this.loaded.delete(key);
        const wm = this.loadedWater.get(key);
        if (wm) {
          this.terrainRoot.remove(wm);
          wm.geometry.dispose();
          this.loadedWater.delete(key);
        }
      }
    }

    const pending: Promise<void>[] = [];
    for (const key of want) {
      if (this.loaded.has(key)) continue;
      const [sx, sz] = key.split(',');
      const cx = Number(sx);
      const cz = Number(sz);
      pending.push(this.loadOne(cx, cz, key));
    }
    await Promise.all(pending);
  }

  private async loadOne(cx: number, cz: number, key: string): Promise<void> {
    let chunk: LevelChunkV1;
    if (this.chunkData.has(key)) {
      chunk = this.chunkData.get(key)!;
      /**
       * First fetch failures used to cache a flat {@link createEmptyChunkV1} forever.
       * Retry from disk while the cached chunk is still the `_fallback` placeholder.
       */
      if (chunk.name?.endsWith('_fallback')) {
        const url = `${this.baseUrl}chunk_${cx}_${cz}.chunk.json`;
        try {
          const res = await fetch(url);
          if (res.ok) {
            chunk = parseLevelChunkJson(await res.text());
            this.chunkData.set(key, chunk);
          }
        } catch {
          /* keep fallback */
        }
      }
    } else {
      const url = `${this.baseUrl}chunk_${cx}_${cz}.chunk.json`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        chunk = parseLevelChunkJson(await res.text());
      } catch {
        chunk = createEmptyChunkV1(`chunk_${cx}_${cz}_fallback`);
      }
      this.chunkData.set(key, chunk);
    }

    const mesh = buildChunkTerrainMesh(chunk);
    const w = CHUNK_SIZE * TILE_SIZE;
    mesh.position.set(cx * w, 0, cz * w);
    this.terrainRoot.add(mesh);
    this.loaded.set(key, mesh);
    this.attachWaterMesh(key, chunk, cx, cz, w);
    this.notifyChunkMeshRebuilt();
  }

  private attachWaterMesh(key: string, chunk: LevelChunkV1, cx: number, cz: number, chunkWorldSpan: number): void {
    const oldW = this.loadedWater.get(key);
    if (oldW) {
      this.terrainRoot.remove(oldW);
      oldW.geometry.dispose();
      this.loadedWater.delete(key);
    }
    const waterMesh = buildChunkWaterSurfaceMesh(chunk);
    if (!waterMesh) return;
    waterMesh.position.set(cx * chunkWorldSpan, 0, cz * chunkWorldSpan);
    this.terrainRoot.add(waterMesh);
    this.loadedWater.set(key, waterMesh);
  }

  getChunkData(cx: number, cz: number): LevelChunkV1 | undefined {
    return this.chunkData.get(chunkKey(cx, cz));
  }

  /** Global tile index; false if chunk not in session data or tile out of range. */
  tileHasWaterWorld(gtx: number, gtz: number): boolean {
    const cx = Math.floor(gtx / CHUNK_SIZE);
    const cz = Math.floor(gtz / CHUNK_SIZE);
    const ch = this.chunkData.get(chunkKey(cx, cz));
    if (!ch?.water) return false;
    const lx = gtx - cx * CHUNK_SIZE;
    const lz = gtz - cz * CHUNK_SIZE;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return false;
    return !!ch.water[tileIndexXZ64(lx, lz)];
  }

  /** Any loaded chunk (for texture palette in editor UI). */
  getAnyLoadedChunk(): LevelChunkV1 | null {
    for (const key of this.loaded.keys()) {
      const ch = this.chunkData.get(key);
      if (ch) return ch;
    }
    return null;
  }

  readWorldCornerHeight(wcx: number, wcz: number): number {
    return readWorldCornerHeightFromMap(this.chunkData, wcx, wcz);
  }

  /** Bilinear height on the terrain surface at world XZ (same units as tile mesh positions). */
  sampleSurfaceHeightAtWorldXZ(wx: number, wz: number): number {
    const tx = wx / TILE_SIZE;
    const tz = wz / TILE_SIZE;
    const i0 = Math.max(0, Math.min(TERRAIN_GRID_WIDTH - 1, Math.floor(tx)));
    const j0 = Math.max(0, Math.min(TERRAIN_GRID_DEPTH - 1, Math.floor(tz)));
    const i1 = Math.min(TERRAIN_GRID_WIDTH, i0 + 1);
    const j1 = Math.min(TERRAIN_GRID_DEPTH, j0 + 1);
    const fx = Math.min(1, Math.max(0, tx - i0));
    const fz = Math.min(1, Math.max(0, tz - j0));
    const h00 = this.readWorldCornerHeight(i0, j0);
    const h10 = this.readWorldCornerHeight(i1, j0);
    const h01 = this.readWorldCornerHeight(i0, j1);
    const h11 = this.readWorldCornerHeight(i1, j1);
    const hx0 = h00 * (1 - fx) + h10 * fx;
    const hx1 = h01 * (1 - fx) + h11 * fx;
    return hx0 * (1 - fz) + hx1 * fz;
  }

  addHeightDeltaAtTile(gtx: number, gtz: number, delta: number): void {
    const dirty = new Set<string>();
    addHeightDeltaAtWorldTile(this.chunkData, gtx, gtz, delta, dirty);
    for (const k of dirty) {
      const [sx, sz] = k.split(',');
      this.rebuildMesh(Number(sx), Number(sz));
    }
  }

  paintTextureAtTile(gtx: number, gtz: number, paletteIndex: number): void {
    const k = paintTextureAtWorldTile(this.chunkData, gtx, gtz, paletteIndex);
    if (k === null) return;
    const [sx, sz] = k.split(',');
    this.rebuildMesh(Number(sx), Number(sz));
  }

  /** Paint or clear water flags for all tiles in brush (chebyshev radius). */
  paintWaterBrush(centerTx: number, centerTz: number, brushRadius: number, wet: boolean): void {
    const dirty = new Set<string>();
    forEachUniqueTileInBrush(centerTx, centerTz, brushRadius, (gx, gz) => {
      const k = setWaterAtWorldTile(this.chunkData, gx, gz, wet);
      if (k) dirty.add(k);
    });
    for (const k of dirty) {
      const [sx, sz] = k.split(',').map(Number);
      this.rebuildMesh(sx, sz);
    }
  }

  private rebuildMesh(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const ch = this.chunkData.get(key);
    const oldMesh = this.loaded.get(key);
    if (!ch || !oldMesh) return;
    const newMesh = buildChunkTerrainMesh(ch);
    newMesh.position.copy(oldMesh.position);
    this.terrainRoot.remove(oldMesh);
    disposeChunkMesh(oldMesh);
    this.terrainRoot.add(newMesh);
    this.loaded.set(key, newMesh);
    const w = CHUNK_SIZE * TILE_SIZE;
    this.attachWaterMesh(key, ch, Math.floor(cx), Math.floor(cz), w);
    this.notifyChunkMeshRebuilt();
  }

  triggerDownloadChunk(cx: number, cz: number, pretty = true): void {
    const ch = this.chunkData.get(chunkKey(cx, cz));
    if (!ch) return;
    const base = (ch.name ?? `chunk_${cx}_${cz}`).replace(/[^a-z0-9-_]+/gi, '_');
    const blob = new Blob([serializeLevelChunk(ch, pretty)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}.chunk.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Stagger downloads so browsers allow all files. */
  triggerDownloadAllChunkData(delayMs = 120): void {
    const entries = [...this.chunkData.entries()];
    if (entries.length === 0) return;
    let i = 0;
    const tick = (): void => {
      if (i >= entries.length) return;
      const [key, ch] = entries[i]!;
      const [sx, sz] = key.split(',').map(Number);
      this.triggerDownloadChunk(sx, sz, true);
      i++;
      if (i < entries.length) window.setTimeout(tick, delayMs);
    };
    tick();
  }
}
