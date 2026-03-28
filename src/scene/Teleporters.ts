/**
 * Teleporter enemies: teleport away when player is close, place poison pools via callback.
 */

import * as THREE from 'three';
import {
  TELEPORTER_COUNT,
  TELEPORTER_SIZE,
  TELEPORTER_TELEPORT_RANGE,
  TELEPORTER_TELEPORT_COOLDOWN,
  TELEPORTER_POISON_POOL_COOLDOWN,
  POISON_THROW_DISTANCE,
  BATTLE_MIN,
  BATTLE_MAX,
  MAX_TELEPORTER_HEALTH,
} from '../config/Constants';

export interface TeleporterCallbacks {
  onCreateHitMarker: (position: THREE.Vector3, amount: number) => void;
  onDeath: (index: number, position: THREE.Vector3) => void;
  addIncomingPoisonPool: (position: THREE.Vector3, gameTime: number) => void;
}

export interface TeleporterAPI {
  getCount: () => number;
  getPosition: (index: number) => THREE.Vector3;
  getPositions: () => THREE.Vector3[];
  isAlive: (index: number) => boolean;
  getAlive: () => boolean[];
  getHealth: (index: number) => number;
  getHealthArray: () => number[];
  getMaxHealth: () => number;
  damage: (index: number, amount: number) => boolean;
  update: (dt: number, gameTime: number, playerPosition: THREE.Vector3) => void;
  clear: () => void;
  spawn: (count: number, getSpawnPosition: (index: number) => THREE.Vector3) => void;
}

export function createTeleporters(
  scene: THREE.Scene,
  callbacks: TeleporterCallbacks
): TeleporterAPI {
  const group = new THREE.Group();
  const meshes: THREE.Sprite[] = [];
  const alive: boolean[] = [];
  const health: number[] = [];
  const lastTeleportTime: number[] = [];
  const lastPoisonPoolTime: number[] = [];

  const textureLoader = new THREE.TextureLoader();
  const spriteTexture = textureLoader.load('/sprites/grunt.png');
  spriteTexture.colorSpace = THREE.SRGBColorSpace;

  for (let i = 0; i < TELEPORTER_COUNT; i++) {
    const material = new THREE.SpriteMaterial({
      map: spriteTexture,
      color: 0x50e090,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(8 + Math.random() * 16, TELEPORTER_SIZE / 2, 8 + Math.random() * 16);
    sprite.scale.set(TELEPORTER_SIZE * 3, TELEPORTER_SIZE * 3, 1);
    group.add(sprite);
    meshes.push(sprite);
    alive.push(false);
    health.push(MAX_TELEPORTER_HEALTH);
    lastTeleportTime.push(-999);
    lastPoisonPoolTime.push(-999);
  }

  scene.add(group);

  return {
    getCount: () => TELEPORTER_COUNT,
    getPosition: (index: number) => meshes[index].position,
    getPositions: () => meshes.map((m) => m.position),
    isAlive: (index: number) => alive[index],
    getAlive: () => alive,
    getHealth: (index: number) => health[index],
    getHealthArray: () => health,
    getMaxHealth: () => MAX_TELEPORTER_HEALTH,
    damage(index: number, amount: number): boolean {
      callbacks.onCreateHitMarker(meshes[index].position, amount);
      health[index] = Math.max(0, health[index] - amount);
      if (health[index] <= 0) {
        callbacks.onDeath(index, meshes[index].position.clone());
        group.remove(meshes[index]);
        alive[index] = false;
        return true;
      }
      return false;
    },
    update(_dt: number, gameTime: number, playerPosition: THREE.Vector3): void {
      for (let t = 0; t < TELEPORTER_COUNT; t++) {
        if (!alive[t]) continue;
        const pos = meshes[t].position;
        const dx = playerPosition.x - pos.x;
        const dz = playerPosition.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < TELEPORTER_TELEPORT_RANGE && gameTime - lastTeleportTime[t] >= TELEPORTER_TELEPORT_COOLDOWN) {
          pos.x = BATTLE_MIN + Math.random() * (BATTLE_MAX - BATTLE_MIN);
          pos.z = BATTLE_MIN + Math.random() * (BATTLE_MAX - BATTLE_MIN);
          pos.y = TELEPORTER_SIZE / 2;
          lastTeleportTime[t] = gameTime;
        }

        if (gameTime - lastPoisonPoolTime[t] >= TELEPORTER_POISON_POOL_COOLDOWN) {
          const dir = new THREE.Vector3(dx, 0, dz);
          if (dir.lengthSq() > 0.01) {
            dir.normalize();
            const landX = Math.max(BATTLE_MIN, Math.min(BATTLE_MAX, pos.x + dir.x * POISON_THROW_DISTANCE));
            const landZ = Math.max(BATTLE_MIN, Math.min(BATTLE_MAX, pos.z + dir.z * POISON_THROW_DISTANCE));
            callbacks.addIncomingPoisonPool(new THREE.Vector3(landX, 0, landZ), gameTime);
          } else {
            callbacks.addIncomingPoisonPool(new THREE.Vector3(pos.x, 0, pos.z), gameTime);
          }
          lastPoisonPoolTime[t] = gameTime;
        }

        pos.y = TELEPORTER_SIZE / 2;
      }
    },
    clear(): void {
      for (let t = 0; t < TELEPORTER_COUNT; t++) {
        group.remove(meshes[t]);
        alive[t] = false;
      }
    },
    spawn(spawnCount: number, getSpawnPosition: (index: number) => THREE.Vector3): void {
      for (let t = 0; t < spawnCount; t++) {
        const pos = getSpawnPosition(t);
        meshes[t].position.copy(pos);
        group.add(meshes[t]);
        alive[t] = true;
        health[t] = MAX_TELEPORTER_HEALTH;
        lastTeleportTime[t] = -999;
        lastPoisonPoolTime[t] = -999;
      }
    },
  };
}
