import * as THREE from 'three';

export const ENEMY_SIZE = 0.8;
export const ENEMY_COUNT = 24;

// Hide by moving below the world
const HIDDEN_Y = -1000;

/**
 * Creates enemy sprites using the grunt sprite texture.
 * Similar to how casters are rendered.
 */
export function createEnemies(): THREE.Group {
  const group = new THREE.Group();
  
  // Load grunt sprite texture
  const textureLoader = new THREE.TextureLoader();
  const gruntSpriteTexture = textureLoader.load('/sprites/grunt.png');
  gruntSpriteTexture.colorSpace = THREE.SRGBColorSpace;
  
  // Create sprite for each enemy
  for (let i = 0; i < ENEMY_COUNT; i++) {
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: gruntSpriteTexture,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.set(
      2 + Math.random() * 20,
      ENEMY_SIZE / 2,
      2 + Math.random() * 20
    );
    // Scale sprite - sprites scale in world units, make it visible
    // Using a larger scale since sprites are 2D and need to be prominent
    sprite.scale.set(ENEMY_SIZE * 3, ENEMY_SIZE * 3, 1);
    group.add(sprite);
  }
  
  return group;
}

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
