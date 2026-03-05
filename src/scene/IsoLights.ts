import * as THREE from 'three';

/**
 * Diablo-style lighting: main directional (sun), fill, and ambient.
 * Bright enough to read the scene clearly while keeping shadow definition.
 */
export function createIsoLights(scene: THREE.Scene): void {
  const ambient = new THREE.AmbientLight(0xe8e4f0, 0.7);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  sun.position.set(14, 22, 14);
  sun.castShadow = true;
  const size = 28;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -size;
  sun.shadow.camera.right = size;
  sun.shadow.camera.top = size;
  sun.shadow.camera.bottom = -size;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xa0b8e8, 0.5);
  fill.position.set(-10, 8, -10);
  scene.add(fill);
}
