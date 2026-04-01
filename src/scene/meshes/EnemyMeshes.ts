import * as THREE from 'three';
import { ENEMY_COUNT, ENEMY_SIZE } from '../Enemies';

/**
 * Creates enemy sprites using the grunt sprite texture.
 * Similar to how casters are rendered.
 */
export function createEnemies(): THREE.Group {
  const group = new THREE.Group();

  const textureLoader = new THREE.TextureLoader();
  const gruntSpriteTexture = textureLoader.load('/sprites/grunt.png');
  gruntSpriteTexture.colorSpace = THREE.SRGBColorSpace;

  for (let i = 0; i < ENEMY_COUNT; i++) {
    const spriteMaterial = new THREE.SpriteMaterial({
      map: gruntSpriteTexture,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.set(2 + Math.random() * 20, ENEMY_SIZE / 2, 2 + Math.random() * 20);
    sprite.scale.set(ENEMY_SIZE * 3, ENEMY_SIZE * 3, 1);
    group.add(sprite);
  }

  return group;
}
