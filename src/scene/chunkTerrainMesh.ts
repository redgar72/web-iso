import * as THREE from 'three';
import {
  CHUNK_CORNER_COUNT,
  CHUNK_SIZE,
  cornerHeightIndex,
  previewHexForTextureIndex,
  tileIndexXZ64,
  type LevelChunkV1,
} from '../../shared/levelChunk';
import { TILE_SIZE } from './IsoTerrain';

function cornerVertexColor(chunk: LevelChunkV1, ix: number, iz: number): THREE.Color {
  const tiles: [number, number][] = [
    [ix - 1, iz - 1],
    [ix, iz - 1],
    [ix - 1, iz],
    [ix, iz],
  ];
  const acc = new THREE.Color(0, 0, 0);
  let n = 0;
  for (const [tx, tz] of tiles) {
    if (tx >= 0 && tz >= 0 && tx < CHUNK_SIZE && tz < CHUNK_SIZE) {
      const ti = tileIndexXZ64(tx, tz);
      const pal = chunk.textureIndices[ti] ?? 0;
      acc.add(new THREE.Color(previewHexForTextureIndex(pal)));
      n++;
    }
  }
  if (n > 0) acc.multiplyScalar(1 / n);
  else acc.setHex(0x5a5668);
  return acc;
}

/**
 * Single merged mesh per chunk: shared vertices on a (CHUNK_SIZE+1)² lattice so neighbors match at boundaries
 * when chunk JSON agrees on shared `cornerHeights`.
 */
export function buildChunkTerrainMesh(
  chunk: LevelChunkV1,
  materialOptions: { color?: number; roughness?: number; metalness?: number } = {}
): THREE.Mesh {
  const heights = chunk.cornerHeights;
  const positions = new Float32Array(CHUNK_CORNER_COUNT * 3);
  const colors = new Float32Array(CHUNK_CORNER_COUNT * 3);

  for (let ix = 0; ix <= CHUNK_SIZE; ix++) {
    for (let iz = 0; iz <= CHUNK_SIZE; iz++) {
      const vi = cornerHeightIndex(ix, iz);
      const h = heights[vi] ?? 0;
      const base = vi * 3;
      positions[base] = ix * TILE_SIZE;
      positions[base + 1] = h;
      positions[base + 2] = iz * TILE_SIZE;
      const c = cornerVertexColor(chunk, ix, iz);
      colors[base] = c.r;
      colors[base + 1] = c.g;
      colors[base + 2] = c.b;
    }
  }

  const indices: number[] = [];
  for (let tx = 0; tx < CHUNK_SIZE; tx++) {
    for (let tz = 0; tz < CHUNK_SIZE; tz++) {
      const i00 = cornerHeightIndex(tx, tz);
      const i10 = cornerHeightIndex(tx + 1, tz);
      const i11 = cornerHeightIndex(tx + 1, tz + 1);
      const i01 = cornerHeightIndex(tx, tz + 1);
      indices.push(i00, i01, i11, i00, i11, i10);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: materialOptions.color ?? 0xffffff,
    roughness: materialOptions.roughness ?? 0.88,
    metalness: materialOptions.metalness ?? 0.05,
    flatShading: false,
    vertexColors: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}
