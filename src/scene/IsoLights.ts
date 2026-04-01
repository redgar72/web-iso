import * as THREE from 'three';

/**
 * Outdoor-style lighting: directional sun + fill + ambient (works for iso or perspective).
 */
export function createIsoLights(scene: THREE.Scene): void {
  const ambient = new THREE.AmbientLight(0xe8e4f0, 0.72);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4e0, 2);
  sun.position.set(46, 72, 38);
  sun.castShadow = true;
  const size = 110;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -size;
  sun.shadow.camera.right = size;
  sun.shadow.camera.top = size;
  sun.shadow.camera.bottom = -size;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xa0b8e8, 0.5);
  fill.position.set(-10, 8, -10);
  scene.add(fill);
}
