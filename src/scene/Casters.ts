import * as THREE from 'three';
import {
  type Effect,
  tickBurnEffects,
  removeExpiredEffects,
  getSpeedMultiplier,
  isStunned,
} from '../effects/Effects';

/** Body that casters can resurrect (grunt corpse). */
export interface ResurrectBody {
  mesh: THREE.Mesh;
  enemyIndex: number;
  position: THREE.Vector3;
}

export interface CasterConfig {
  count: number;
  size: number;
  speed: number;
  preferredRange: number;
  fireballCooldown: number;
  maxHealth: number;
  resurrectCooldown: number;
  resurrectRange: number;
  fireballSpeed: number;
  fireballTtl: number;
}

export interface CasterCallbacks {
  showFloatingDamage: (position: THREE.Vector3, amount: number) => void;
  onDeath: (position: THREE.Vector3) => void;
  onThrowFireball: (origin: THREE.Vector3, velocity: THREE.Vector3) => void;
  getBodies: () => ResurrectBody[];
  getLevelGruntsCount: () => number;
  onResurrect: (body: ResurrectBody) => void;
}

export interface CasterAPI {
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

export function createCasters(
  scene: THREE.Scene,
  config: CasterConfig,
  callbacks: CasterCallbacks
): CasterAPI {
  const {
    count,
    size,
    speed,
    preferredRange,
    fireballCooldown,
    maxHealth,
    resurrectCooldown,
    resurrectRange,
    fireballSpeed,
    fireballTtl,
  } = config;

  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const alive: boolean[] = [];
  const health: number[] = [];
  const lastThrowTime: number[] = [];
  const lastResurrectTime: number[] = [];
  const effects: Effect[][] = Array.from({ length: count }, () => []);

  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(size * 0.35, size * 0.5, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x7040a0, roughness: 0.6, metalness: 0.1 })
    );
    mesh.position.set(8 + Math.random() * 16, size / 2, 8 + Math.random() * 16);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes.push(mesh);
    alive.push(true);
    lastThrowTime.push(-999);
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
    for (let c = 0; c < count; c++) {
      if (!alive[c]) continue;
      const eff = effects[c];
      const burnDmg = tickBurnEffects(eff, gameTime);
      if (burnDmg > 0) damage(c, burnDmg);
      removeExpiredEffects(eff, gameTime);

      const pos = meshes[c].position;
      if (!isStunned(eff, gameTime)) {
        const dx = playerPos.x - pos.x;
        const dz = playerPos.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const speedMult = getSpeedMultiplier(eff, gameTime);
        if (dist > 0.02) {
          const targetDist = preferredRange;
          const moveAmount = speed * speedMult * dt;
          // Only move toward player when beyond preferred range; stand still when within range
          if (dist > targetDist) {
            const move = Math.min(moveAmount, dist - targetDist);
            pos.x += (dx / dist) * move;
            pos.z += (dz / dist) * move;
          }
          // When dist <= targetDist: do not move (no backing away)
        }
      }
      pos.y = size / 2;

      if (isStunned(eff, gameTime)) continue;

      const bodies = callbacks.getBodies();
      const levelGruntsCount = callbacks.getLevelGruntsCount();
      if (gameTime - lastResurrectTime[c] >= resurrectCooldown && bodies.length > 0) {
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
          lastResurrectTime[c] = gameTime;
        }
      }

      if (gameTime - lastThrowTime[c] >= fireballCooldown) {
        lastThrowTime[c] = gameTime;
        const dir = new THREE.Vector3(
          playerPos.x - pos.x,
          0,
          playerPos.z - pos.z
        ).normalize();
        const origin = new THREE.Vector3(pos.x, size * 0.6, pos.z);
        const velocity = dir.multiplyScalar(fireballSpeed);
        callbacks.onThrowFireball(origin, velocity);
      }
    }
  }

  function clear(): void {
    for (let c = 0; c < count; c++) {
      group.remove(meshes[c]);
      alive[c] = false;
      effects[c].length = 0;
    }
  }

  function spawn(spawnCount: number, getSpawnPosition: (slot: number) => THREE.Vector3): void {
    for (let c = 0; c < spawnCount; c++) {
      const pos = getSpawnPosition(c);
      meshes[c].position.copy(pos);
      meshes[c].position.y = size / 2;
      group.add(meshes[c]);
      alive[c] = true;
      health[c] = maxHealth;
      lastThrowTime[c] = -999;
      lastResurrectTime[c] = -999;
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
