import * as THREE from 'three';

export const ENEMY_SIZE = 0.8;
export const ENEMY_COUNT = 24;

// Hide by moving below the world
const HIDDEN_Y = -1000;

/** Hides an enemy instance (e.g. when killed by a fireball). */
export function killEnemyInstance(group: THREE.Group, index: number): void {
  const enemy = group.children[index] as THREE.Object3D;
  if (enemy) {
    enemy.position.y = HIDDEN_Y;
  }
}

/** Restores an enemy instance at the given position (e.g. when resurrected from a body). */
export function resurrectEnemyInstance(group: THREE.Group, index: number, position: THREE.Vector3): void {
  const enemy = group.children[index] as THREE.Object3D;
  if (enemy) {
    // Position sprite at ground level (y = ENEMY_SIZE / 2 for sprites)
    enemy.position.set(position.x, ENEMY_SIZE / 2, position.z);
  }
}
