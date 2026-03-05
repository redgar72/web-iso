import * as THREE from 'three';

export const ENEMY_SIZE = 0.8;
export const ENEMY_COUNT = 24;

/**
 * Spawns a bunch of enemies as red cubes, scattered on the terrain.
 */
export function createEnemies(): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(ENEMY_SIZE, ENEMY_SIZE, ENEMY_SIZE);
  const material = new THREE.MeshStandardMaterial({
    color: 0xc03030,
    roughness: 0.6,
    metalness: 0.15,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, ENEMY_COUNT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // InstancedMesh only uses the base geometry's bounds (around origin) for culling, so instances
  // at the portal or below the world can be culled. Disable so all instances are always drawn.
  mesh.frustumCulled = false;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  for (let i = 0; i < ENEMY_COUNT; i++) {
    position.set(
      2 + Math.random() * 20,
      ENEMY_SIZE / 2,
      2 + Math.random() * 20
    );
    matrix.setPosition(position);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

const _tempMatrix = new THREE.Matrix4();

// Hide by moving below the world (keep scale 1). Zero-scale can leave instances invisible on some GPUs.
const HIDDEN_Y = -1000;

/** Hides an enemy instance (e.g. when killed by a fireball). */
export function killEnemyInstance(mesh: THREE.InstancedMesh, index: number): void {
  _tempMatrix.identity();
  _tempMatrix.setPosition(0, HIDDEN_Y, 0);
  mesh.setMatrixAt(index, _tempMatrix);
  mesh.instanceMatrix.needsUpdate = true;
}

/** Restores an enemy instance at the given position (e.g. when resurrected from a body). */
export function resurrectEnemyInstance(mesh: THREE.InstancedMesh, index: number, position: THREE.Vector3): void {
  _tempMatrix.identity();
  _tempMatrix.setPosition(position.x, position.y, position.z);
  mesh.setMatrixAt(index, _tempMatrix);
  mesh.instanceMatrix.needsUpdate = true;
}
