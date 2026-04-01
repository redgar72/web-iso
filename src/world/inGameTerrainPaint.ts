import { forEachUniqueTileInBrush, type TerrainPaintMode } from '../../shared/terrainBrush';
import type { ChunkTerrainLoader } from './chunkTerrainLoader';

export type { TerrainPaintMode } from '../../shared/terrainBrush';

export function applyTerrainPaintAtTile(
  loader: ChunkTerrainLoader,
  tx: number,
  tz: number,
  mode: TerrainPaintMode,
  textureIndex: number,
  heightStep: number,
  brushRadius: number
): void {
  if (mode === 'water' || mode === 'water_erase') {
    loader.paintWaterBrush(tx, tz, brushRadius, mode === 'water');
    return;
  }
  const delta = mode === 'raise' ? heightStep : mode === 'lower' ? -heightStep : 0;
  forEachUniqueTileInBrush(tx, tz, brushRadius, (gx, gz) => {
    if (mode === 'texture') loader.paintTextureAtTile(gx, gz, textureIndex);
    else loader.addHeightDeltaAtTile(gx, gz, delta);
  });
}
