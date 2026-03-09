import * as THREE from 'three';
import {
  type Effect,
  tickBurnEffects,
  removeExpiredEffects,
  getSpeedMultiplier,
  isStunned,
} from '../effects/Effects';

/** Body that resurrectors can resurrect (grunt corpse). */
export interface ResurrectBody {
  mesh: THREE.Mesh;
  enemyIndex: number;
  position: THREE.Vector3;
}

export interface ResurrectorConfig {
  count: number;
  size: number;
  speed: number;
  preferredRange: number;
  maxHealth: number;
  resurrectCooldown: number;
  resurrectRange: number;
}

export interface ResurrectorCallbacks {
  showFloatingDamage: (position: THREE.Vector3, amount: number) => void;
  onDeath: (position: THREE.Vector3) => void;
  getBodies: () => ResurrectBody[];
  getLevelGruntsCount: () => number;
  onResurrect: (body: ResurrectBody) => void;
}

export interface ResurrectorAPI {
  update: (dt: number, gameTime: number, playerPos: THREE.Vector3) => void;
  damage: (index: number, amount: number) => boolean;
  getCount: () => number;
  getPosition: (index: number) => THREE.Vector3;
  isAlive: (index: number) => boolean;
  getHealth: (index: number) => number;
  getMaxHealth: () => number;
  getMesh: (index: number) => THREE.Mesh;
  getEffects: () => Effect[][];
  clear: () => void;
  spawn: (count: number, getSpawnPosition: (slot: number) => THREE.Vector3) => void;
}

export function createResurrectors(
  scene: THREE.Scene,
  config: ResurrectorConfig,
  callbacks: ResurrectorCallbacks
): ResurrectorAPI {
  const { count, size, speed, preferredRange, maxHealth, resurrectCooldown, resurrectRange } = config;

  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const alive: boolean[] = [];
  const health: number[] = [];
  const lastResurrectTime: number[] = [];
  const effects: Effect[][] = Array.from({ length: count }, () => []);

  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(size * 0.55, size * 1.2, 6),
      new THREE.MeshStandardMaterial({
        color: 0x2d5a4a,
        roughness: 0.7,
        metalness: 0.05,
        emissive: 0x0a2018,
      })
    );
    mesh.position.set(8 + Math.random() * 16, size / 2, 8 + Math.random() * 16);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes.push(mesh);
    alive.push(false);
    lastResurrectTime.push(-999);
    health.push(maxHealth);
  }
  scene.add(group);

  function damage(index: number, amount: number): boolean {
    callbacks.showFloatingDamage(meshes[index].position.clone(), amount);
    health[index] = Math.max(0, health[index] - amount);
    if (health[index] <= 0) {
      callbacks.onDeath(meshes[index].position.clone());
      group.remove(meshes[index]);
      alive[index] = false;
      return true;
    }
    return false;
  }

  function update(dt: number, gameTime: number, playerPos: THREE.Vector3): void {
    for (let r = 0; r < count; r++) {
      if (!alive[r]) continue;
      const eff = effects[r];
      const burnDmg = tickBurnEffects(eff, gameTime);
      if (burnDmg > 0) damage(r, burnDmg);
      removeExpiredEffects(eff, gameTime);

      const pos = meshes[r].position;
      if (!isStunned(eff, gameTime)) {
        const dx = playerPos.x - pos.x;
        const dz = playerPos.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const speedMult = getSpeedMultiplier(eff, gameTime);
        if (dist > 0.02) {
          const targetDist = preferredRange;
          const moveAmount = speed * speedMult * dt;
          if (dist > targetDist) {
            const move = Math.min(moveAmount, dist - targetDist);
            pos.x += (dx / dist) * move;
            pos.z += (dz / dist) * move;
          } else if (dist < targetDist) {
            const move = Math.min(moveAmount, targetDist - dist);
            pos.x -= (dx / dist) * move;
            pos.z -= (dz / dist) * move;
          }
        }
      }
      pos.y = size / 2;

      if (isStunned(eff, gameTime)) continue;

      const bodies = callbacks.getBodies();
      const levelGruntsCount = callbacks.getLevelGruntsCount();
      if (gameTime - lastResurrectTime[r] >= resurrectCooldown && bodies.length > 0) {
        let nearestIdx = -1;
        let nearestDist = resurrectRange;
        for (let b = 0; b < bodies.length; b++) {
          const body = bodies[b];
          if (body.enemyIndex >= levelGruntsCount) continue;
          const d = pos.distanceTo(body.position);
          if (d < nearestDist) {
            nearestDist = d;
            nearestIdx = b;
          }
        }
        if (nearestIdx >= 0) {
          callbacks.onResurrect(bodies[nearestIdx]);
          lastResurrectTime[r] = gameTime;
        }
      }
    }
  }

  function clear(): void {
    for (let r = 0; r < count; r++) {
      group.remove(meshes[r]);
      alive[r] = false;
      effects[r].length = 0;
    }
  }

  function spawn(spawnCount: number, getSpawnPosition: (slot: number) => THREE.Vector3): void {
    for (let r = 0; r < spawnCount; r++) {
      const pos = getSpawnPosition(r);
      meshes[r].position.copy(pos);
      meshes[r].position.y = size / 2;
      group.add(meshes[r]);
      alive[r] = true;
      health[r] = maxHealth;
      lastResurrectTime[r] = -999;
    }
  }

  return {
    update,
    damage,
    getCount: () => count,
    getPosition: (i) => meshes[i].position,
    isAlive: (i) => alive[i],
    getHealth: (i) => health[i],
    getMaxHealth: () => maxHealth,
    getMesh: (i) => meshes[i],
    getEffects: () => effects,
    clear,
    spawn,
  };
}
