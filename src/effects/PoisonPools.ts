/**
 * Poison pools on the ground: visuals and overlap check. Pools are added by teleporter enemies.
 * Supports "incoming" indicators that show where a pool will land before it appears.
 */

import * as THREE from 'three';

export interface PoisonPoolConfig {
  radius: number;
  duration: number;
  /** How long the incoming indicator shows before the pool spawns. */
  indicatorDuration: number;
}

export interface PoisonPoolsAPI {
  addPool: (position: THREE.Vector3, gameTime: number) => void;
  /** Schedule a pool to land at position after indicatorDuration; shows an indicator until then. */
  addIncomingPool: (position: THREE.Vector3, gameTime: number) => void;
  update: (gameTime: number, playerPosition: THREE.Vector3) => boolean;
}

const POOL_Y_OFFSET = 0.2; // Sit above floor so we're clearly in front
const POOL_RENDER_ORDER = 1;
// Bias depth toward camera so the pool always wins over the floor (no grid bleed-through)
const POOL_POLYGON_OFFSET_FACTOR = -2;
const POOL_POLYGON_OFFSET_UNITS = -2;

function createPoolMesh(radius: number): THREE.Group {
  const group = new THREE.Group();
  group.position.y = POOL_Y_OFFSET;

  const depthBias = {
    polygonOffset: true,
    polygonOffsetFactor: POOL_POLYGON_OFFSET_FACTOR,
    polygonOffsetUnits: POOL_POLYGON_OFFSET_UNITS,
  };

  // Main fill: bright toxic green
  const fillGeom = new THREE.CircleGeometry(radius * 0.92, 24);
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0x30e070,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    ...depthBias,
  });
  const fill = new THREE.Mesh(fillGeom, fillMat);
  fill.rotation.x = -Math.PI / 2;
  fill.renderOrder = POOL_RENDER_ORDER;
  group.add(fill);

  // Ring border
  const ringGeom = new THREE.RingGeometry(radius * 0.88, radius, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x80ff40,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
    ...depthBias,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = POOL_RENDER_ORDER;
  group.add(ring);

  return group;
}

function createIndicatorMesh(radius: number): THREE.Group {
  const group = new THREE.Group();
  group.position.y = POOL_Y_OFFSET;

  const ringGeom = new THREE.RingGeometry(radius * 0.7, radius, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xb0ff60,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: POOL_POLYGON_OFFSET_FACTOR,
    polygonOffsetUnits: POOL_POLYGON_OFFSET_UNITS,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = POOL_RENDER_ORDER;
  group.add(ring);

  return group;
}

export function createPoisonPools(
  scene: THREE.Scene,
  config: PoisonPoolConfig
): PoisonPoolsAPI {
  const { radius, duration, indicatorDuration } = config;
  const group = new THREE.Group();
  scene.add(group);

  interface Pool {
    position: THREE.Vector3;
    spawnTime: number;
    group: THREE.Group;
  }
  const pools: Pool[] = [];

  interface Incoming {
    position: THREE.Vector3;
    landTime: number;
    group: THREE.Group;
  }
  const incoming: Incoming[] = [];

  function addPool(position: THREE.Vector3, gameTime: number): void {
    const poolGroup = createPoolMesh(radius);
    poolGroup.position.set(position.x, 0, position.z);
    group.add(poolGroup);
    pools.push({
      position: position.clone(),
      spawnTime: gameTime,
      group: poolGroup,
    });
  }

  function addIncomingPool(position: THREE.Vector3, gameTime: number): void {
    const landTime = gameTime + indicatorDuration;
    const indGroup = createIndicatorMesh(radius);
    indGroup.position.set(position.x, 0, position.z);
    group.add(indGroup);
    incoming.push({
      position: position.clone(),
      landTime,
      group: indGroup,
    });
  }

  function update(gameTime: number, playerPosition: THREE.Vector3): boolean {
    let playerInPoison = false;
    const playerX = playerPosition.x;
    const playerZ = playerPosition.z;

    // Update incoming indicators; spawn real pool when time is up
    for (let i = incoming.length - 1; i >= 0; i--) {
      const inc = incoming[i];
      if (gameTime >= inc.landTime) {
        group.remove(inc.group);
        inc.group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            (child.geometry as THREE.BufferGeometry).dispose();
            (child.material as THREE.Material).dispose();
          }
        });
        incoming.splice(i, 1);
        addPool(inc.position, gameTime);
        continue;
      }
      const timeLeft = inc.landTime - gameTime;
      const pulse = 0.5 + 0.5 * Math.sin(gameTime * 12);
      const ringMesh = inc.group.children[0] as THREE.Mesh;
      if (ringMesh.material instanceof THREE.MeshBasicMaterial) {
        ringMesh.material.opacity = 0.5 + 0.4 * pulse;
      }
    }

    for (let i = pools.length - 1; i >= 0; i--) {
      const pool = pools[i];
      const age = gameTime - pool.spawnTime;
      if (age >= duration) {
        group.remove(pool.group);
        pool.group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            (child.geometry as THREE.BufferGeometry).dispose();
            (child.material as THREE.Material).dispose();
          }
        });
        pools.splice(i, 1);
        continue;
      }
      const dx = playerX - pool.position.x;
      const dz = playerZ - pool.position.z;
      if (dx * dx + dz * dz <= radius * radius) {
        playerInPoison = true;
      }
      const lifeRatio = 1 - age / duration;
      const fillMesh = pool.group.children[0] as THREE.Mesh;
      const ringMesh = pool.group.children[1] as THREE.Mesh;
      if (fillMesh.material instanceof THREE.MeshBasicMaterial) fillMesh.material.opacity = 0.75 * lifeRatio;
      if (ringMesh.material instanceof THREE.MeshBasicMaterial) ringMesh.material.opacity = 0.9 * lifeRatio;
    }

    return playerInPoison;
  }

  return { addPool, addIncomingPool, update };
}
