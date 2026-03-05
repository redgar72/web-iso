import * as THREE from 'three';

/**
 * Creates a portal mesh (ring + glow) at the given position.
 * Enemies will spawn from this position.
 */
export function createPortal(position: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(position);

  // Main ring (torus lying flat)
  const ringGeometry = new THREE.TorusGeometry(1.2, 0.15, 16, 32);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x4060a0,
    emissive: 0x2040a0,
    emissiveIntensity: 0.6,
    roughness: 0.3,
    metalness: 0.4,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.y = 0.02;
  ring.castShadow = true;
  group.add(ring);

  // Inner ring (smaller, more emissive)
  const innerRingGeometry = new THREE.TorusGeometry(0.6, 0.08, 12, 24);
  innerRingGeometry.rotateX(-Math.PI / 2);
  const innerMaterial = new THREE.MeshStandardMaterial({
    color: 0x80a0ff,
    emissive: 0x4080ff,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    metalness: 0.2,
  });
  const innerRing = new THREE.Mesh(innerRingGeometry, innerMaterial);
  innerRing.position.y = 0.03;
  group.add(innerRing);

  // Base disc (slightly below ground so ring sits on terrain)
  const discGeometry = new THREE.CircleGeometry(1.35, 32);
  discGeometry.rotateX(-Math.PI / 2);
  const discMaterial = new THREE.MeshStandardMaterial({
    color: 0x182840,
    emissive: 0x102030,
    emissiveIntensity: 0.2,
    roughness: 0.9,
    metalness: 0.1,
  });
  const disc = new THREE.Mesh(discGeometry, discMaterial);
  disc.position.y = -0.01;
  disc.receiveShadow = true;
  group.add(disc);

  return group;
}
