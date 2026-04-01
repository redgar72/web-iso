import * as THREE from 'three';
import type { ChunkTerrainLoader } from '../world/chunkTerrainLoader';

/**
 * World-space grid lines on tile boundaries, elevated slightly and shaped to match `cornerHeights`
 * (same corner indexing as chunk meshes).
 */
export function buildTerrainFollowingGridGeometry(
  loader: ChunkTerrainLoader,
  gridTiles: number,
  tileSize: number,
  yOffset: number
): THREE.BufferGeometry {
  const positions: number[] = [];

  for (let wx = 0; wx <= gridTiles; wx++) {
    for (let wz = 0; wz < gridTiles; wz++) {
      const x = wx * tileSize;
      const z0 = wz * tileSize;
      const z1 = (wz + 1) * tileSize;
      const h0 = loader.readWorldCornerHeight(wx, wz);
      const h1 = loader.readWorldCornerHeight(wx, wz + 1);
      positions.push(x, h0 + yOffset, z0, x, h1 + yOffset, z1);
    }
  }

  for (let wz = 0; wz <= gridTiles; wz++) {
    for (let wx = 0; wx < gridTiles; wx++) {
      const z = wz * tileSize;
      const x0 = wx * tileSize;
      const x1 = (wx + 1) * tileSize;
      const h0 = loader.readWorldCornerHeight(wx, wz);
      const h1 = loader.readWorldCornerHeight(wx + 1, wz);
      positions.push(x0, h0 + yOffset, z, x1, h1 + yOffset, z);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}
