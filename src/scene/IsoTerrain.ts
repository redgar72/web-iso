import * as THREE from 'three';

const TILE_SIZE = 2;
const TILE_HALF = TILE_SIZE / 2;

/**
 * GPU-friendly instanced grid for 2.5D isometric terrain.
 * One draw call for all floor tiles.
 */
export function createIsoTerrain(
  gridWidth: number,
  gridDepth: number,
  options: { color?: number; roughness?: number; metalness?: number } = {}
): THREE.InstancedMesh {
  const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(TILE_HALF, 0, TILE_HALF);

  const material = new THREE.MeshStandardMaterial({
    color: options.color ?? 0x4a4658,
    roughness: options.roughness ?? 0.85,
    metalness: options.metalness ?? 0.05,
    flatShading: false,
  });

  const count = gridWidth * gridDepth;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.receiveShadow = true;
  mesh.castShadow = false;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  let i = 0;
  for (let z = 0; z < gridDepth; z++) {
    for (let x = 0; x < gridWidth; x++) {
      position.set(x * TILE_SIZE, 0, z * TILE_SIZE);
      matrix.setPosition(position);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, new THREE.Color().setHex(0xffffff));
      i++;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return mesh;
}
