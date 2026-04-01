import * as THREE from 'three';
import type { ChunkTerrainLoader } from '../world/chunkTerrainLoader';

/**
 * Horizontal squares slightly above terrain for each water tile (terrain editor feedback).
 */
export function buildWaterTileIndicatorGeometry(
  loader: ChunkTerrainLoader,
  gridWidth: number,
  gridDepth: number,
  tileSize: number,
  yBias: number
): THREE.BufferGeometry | null {
  const inset = 0.08;
  const half = tileSize * 0.5 - inset;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let v = 0;

  for (let tx = 0; tx < gridWidth; tx++) {
    for (let tz = 0; tz < gridDepth; tz++) {
      if (!loader.tileHasWaterWorld(tx, tz)) continue;
      const cx = tx * tileSize + tileSize * 0.5;
      const cz = tz * tileSize + tileSize * 0.5;
      const y = loader.sampleSurfaceHeightAtWorldXZ(cx, cz) + yBias;
      positions.push(
        cx - half,
        y,
        cz - half,
        cx + half,
        y,
        cz - half,
        cx + half,
        y,
        cz + half,
        cx - half,
        y,
        cz + half
      );
      for (let i = 0; i < 4; i++) normals.push(0, 1, 0);
      indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }

  if (positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}
