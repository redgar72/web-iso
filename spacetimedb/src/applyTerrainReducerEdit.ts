import {
  addHeightDeltaAtWorldTile,
  affectedChunkKeysForTerrainBrush,
  chunkKey,
  paintTextureAtWorldTile,
  setWaterAtWorldTile,
} from '../../shared/chunkTerrainMutations';
import { forEachUniqueTileInBrush } from '../../shared/terrainBrush';
import type { LevelChunkV1 } from '../../shared/levelChunk';

/**
 * Mutates chunks in `chunkData` (must be preloaded with all keys that intersect the brush).
 * Returns dirty chunk keys.
 */
export function applyTerrainStrokeToChunkMap(
  chunkData: Map<string, LevelChunkV1>,
  tx: number,
  tz: number,
  mode: string,
  textureIndex: number,
  heightStep: number,
  brushRadius: number
): Set<string> {
  const dirty = new Set<string>();
  if (mode === 'water' || mode === 'water_erase') {
    forEachUniqueTileInBrush(tx, tz, brushRadius, (gx, gz) => {
      const k = setWaterAtWorldTile(
        chunkData,
        gx,
        gz,
        mode === 'water',
        (cx, cz) => chunkData.get(chunkKey(cx, cz))
      );
      if (k) dirty.add(k);
    });
    return dirty;
  }
  const delta = mode === 'raise' ? heightStep : mode === 'lower' ? -heightStep : 0;
  forEachUniqueTileInBrush(tx, tz, brushRadius, (gx, gz) => {
    if (mode === 'texture') {
      const k = paintTextureAtWorldTile(
        chunkData,
        gx,
        gz,
        textureIndex,
        (cx, cz) => chunkData.get(chunkKey(cx, cz))
      );
      if (k) dirty.add(k);
    } else {
      addHeightDeltaAtWorldTile(
        chunkData,
        gx,
        gz,
        delta,
        dirty,
        (cx, cz) => chunkData.get(chunkKey(cx, cz))
      );
    }
  });
  return dirty;
}

export { affectedChunkKeysForTerrainBrush as affectedChunkKeys };
