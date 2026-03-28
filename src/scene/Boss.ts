/**
 * Boss: stationary in the center of the map, throws exploding fireballs at the player.
 * Owns mesh, hitbox indicator, fireball projectiles and their ground indicators.
 */

import * as THREE from 'three';
import {
  BOSS_SIZE,
  BOSS_POSITION_X,
  BOSS_POSITION_Z,
  BOSS_HITBOX_RADIUS,
  MAX_BOSS_HEALTH,
  BOSS_FIREBALL_COOLDOWN,
  BOSS_FIREBALL_RADIUS,
  BOSS_FIREBALL_DAMAGE,
  BOSS_FIREBALL_EXPLOSION_RADIUS,
  BOSS_FIREBALL_WARNING_DURATION,
  PROJECTILE_GRAVITY,
} from '../config/Constants';

const BOSS_POSITION = new THREE.Vector3(BOSS_POSITION_X, 0, BOSS_POSITION_Z);

export interface BossCallbacks {
  getPlayerPosition: () => THREE.Vector3;
  applyDamageToPlayer: (amount: number, damageType: 'melee' | 'mage' | 'range') => void;
  setPlayerBurning: () => void;
  onCreateHitMarker: (position: THREE.Vector3, amount: number) => void;
  onDeath: (position: THREE.Vector3) => void;
  addExplosionEffect: (position: THREE.Vector3) => void;
}

export interface BossApi {
  getPosition(): THREE.Vector3;
  isAlive(): boolean;
  getHealth(): number;
  getMaxHealth(): number;
  getHitboxRadius(): number;
  damage(amount: number): boolean;
  spawn(): void;
  update(dt: number, gameTime: number): void;
  clearFireballs(): void;
  getHitboxIndicator(): THREE.Mesh;
}

interface BossFireball {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
  targetPosition: THREE.Vector3;
  warningTime: number;
  indicatorOuter: THREE.Mesh;
  indicatorInner: THREE.Mesh;
}

function createBossMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(BOSS_SIZE * 0.6, BOSS_SIZE * 1.5, 8),
    new THREE.MeshStandardMaterial({
      color: 0x8b0000,
      roughness: 0.6,
      metalness: 0.2,
      emissive: 0x4a0000,
      emissiveIntensity: 0.3,
    })
  );
  mesh.position.copy(BOSS_POSITION);
  mesh.position.y = (BOSS_SIZE / 2) * 10;
  mesh.scale.set(10, 10, 10);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createBossFireballMesh(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(BOSS_FIREBALL_RADIUS, 12, 10);
  const material = new THREE.MeshStandardMaterial({
    color: 0xff4400,
    emissive: 0xff2200,
    emissiveIntensity: 0.7,
    roughness: 0.3,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

function createBossFireballIndicator(
  targetPos: THREE.Vector3,
  indicatorGroup: THREE.Group
): { outer: THREE.Mesh; inner: THREE.Mesh } {
  const outerGeometry = new THREE.RingGeometry(
    BOSS_FIREBALL_EXPLOSION_RADIUS * 0.9,
    BOSS_FIREBALL_EXPLOSION_RADIUS,
    32
  );
  const outerMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const outerMesh = new THREE.Mesh(outerGeometry, outerMaterial);
  outerMesh.position.copy(targetPos);
  outerMesh.position.y = 0.1;
  outerMesh.rotation.x = -Math.PI / 2;

  const innerGeometry = new THREE.RingGeometry(0.1, 0.3, 24);
  const innerMaterial = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
  innerMesh.position.copy(targetPos);
  innerMesh.position.y = 0.11;
  innerMesh.rotation.x = -Math.PI / 2;

  indicatorGroup.add(outerMesh);
  indicatorGroup.add(innerMesh);

  return { outer: outerMesh, inner: innerMesh };
}

function disposeBossFireball(bf: BossFireball, scene: THREE.Scene, indicatorGroup: THREE.Group): void {
  scene.remove(bf.mesh);
  (bf.mesh.geometry as THREE.BufferGeometry).dispose();
  (bf.mesh.material as THREE.Material).dispose();
  indicatorGroup.remove(bf.indicatorOuter);
  indicatorGroup.remove(bf.indicatorInner);
  (bf.indicatorOuter.geometry as THREE.BufferGeometry).dispose();
  (bf.indicatorOuter.material as THREE.Material).dispose();
  (bf.indicatorInner.geometry as THREE.BufferGeometry).dispose();
  (bf.indicatorInner.material as THREE.Material).dispose();
}

export function createBoss(
  scene: THREE.Scene,
  callbacks: BossCallbacks
): BossApi {
  const bossGroup = new THREE.Group();
  let bossMesh: THREE.Mesh | null = null;
  let health = MAX_BOSS_HEALTH;
  let alive = false;
  let lastBossFireballTime = -999;

  const bossFireballs: BossFireball[] = [];
  const bossFireballIndicatorGroup = new THREE.Group();
  scene.add(bossFireballIndicatorGroup);

  const hitboxIndicator = new THREE.Mesh(
    new THREE.RingGeometry(BOSS_HITBOX_RADIUS * 0.95, BOSS_HITBOX_RADIUS, 32),
    new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  hitboxIndicator.position.copy(BOSS_POSITION);
  hitboxIndicator.position.y = 0.05;
  hitboxIndicator.rotation.x = -Math.PI / 2;
  scene.add(hitboxIndicator);

  bossMesh = createBossMesh();
  bossGroup.add(bossMesh);
  scene.add(bossGroup);

  return {
    getPosition() {
      return BOSS_POSITION;
    },
    isAlive() {
      return alive;
    },
    getHealth() {
      return health;
    },
    getMaxHealth() {
      return MAX_BOSS_HEALTH;
    },
    getHitboxRadius() {
      return BOSS_HITBOX_RADIUS;
    },
    damage(amount: number): boolean {
      callbacks.onCreateHitMarker(BOSS_POSITION, amount);
      health = Math.max(0, health - amount);
      if (health <= 0) {
        callbacks.onDeath(BOSS_POSITION.clone());
        if (bossMesh) bossGroup.remove(bossMesh);
        alive = false;
        return true;
      }
      return false;
    },
    spawn() {
      if (bossMesh === null) {
        bossMesh = createBossMesh();
      }
      if (!bossGroup.children.includes(bossMesh)) {
        bossGroup.add(bossMesh);
      }
      if (!alive) {
        alive = true;
        health = MAX_BOSS_HEALTH;
        lastBossFireballTime = -999;
      }
    },
    update(dt: number, gameTime: number): void {
      if (!alive) return;

      const charPos = callbacks.getPlayerPosition();
      if (gameTime - lastBossFireballTime >= BOSS_FIREBALL_COOLDOWN) {
        lastBossFireballTime = gameTime;
        const targetPos = charPos.clone();
        targetPos.y = 0;

        const mesh = createBossFireballMesh();
        mesh.position.copy(BOSS_POSITION);
        mesh.position.y = BOSS_SIZE * 0.8 * 10;
        scene.add(mesh);

        const vel = new THREE.Vector3();
        const travelTime = BOSS_FIREBALL_WARNING_DURATION;
        const startPos = BOSS_POSITION.clone();
        startPos.y = BOSS_SIZE * 0.8 * 10;

        const dx = targetPos.x - startPos.x;
        const dz = targetPos.z - startPos.z;
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);

        if (horizontalDist > 0.01) {
          vel.x = (dx / horizontalDist) * (horizontalDist / travelTime);
          vel.z = (dz / horizontalDist) * (horizontalDist / travelTime);
        } else {
          vel.x = 0;
          vel.z = 0;
        }

        const y0 = startPos.y;
        vel.y = (0.5 * PROJECTILE_GRAVITY * travelTime * travelTime - y0) / travelTime;

        const indicators = createBossFireballIndicator(targetPos, bossFireballIndicatorGroup);
        bossFireballs.push({
          mesh,
          velocity: vel,
          ttl: 5,
          targetPosition: targetPos,
          warningTime: gameTime,
          indicatorOuter: indicators.outer,
          indicatorInner: indicators.inner,
        });
      }

      for (let i = bossFireballs.length - 1; i >= 0; i--) {
        const bf = bossFireballs[i];
        const timeSinceWarning = gameTime - bf.warningTime;

        if (timeSinceWarning < BOSS_FIREBALL_WARNING_DURATION) {
          const t = timeSinceWarning / BOSS_FIREBALL_WARNING_DURATION;
          const innerRadius = 0.1 + (BOSS_FIREBALL_EXPLOSION_RADIUS * 0.9 - 0.1) * t;
          const innerThickness = 0.2 + (0.1 - 0.2) * t;

          bf.indicatorInner.geometry.dispose();
          bf.indicatorInner.geometry = new THREE.RingGeometry(
            Math.max(0.05, innerRadius - innerThickness),
            innerRadius,
            24
          );

          const outerMat = bf.indicatorOuter.material as THREE.MeshBasicMaterial;
          outerMat.opacity = 0.6 * (1 - t * 0.3);

          const innerMat = bf.indicatorInner.material as THREE.MeshBasicMaterial;
          innerMat.opacity = 0.8 + 0.2 * t;
          innerMat.color.setHex(0xffaa00 + Math.floor(t * 0x550000));
        }

        bf.velocity.y -= PROJECTILE_GRAVITY * dt;
        bf.mesh.position.addScaledVector(bf.velocity, dt);
        bf.ttl -= dt;

        if (bf.mesh.position.y <= 0 || timeSinceWarning >= BOSS_FIREBALL_WARNING_DURATION) {
          bf.mesh.position.y = 0;
          const explosionPos = bf.targetPosition;
          if (charPos.distanceTo(explosionPos) <= BOSS_FIREBALL_EXPLOSION_RADIUS) {
            callbacks.applyDamageToPlayer(BOSS_FIREBALL_DAMAGE, 'mage');
            callbacks.setPlayerBurning();
          }
          callbacks.addExplosionEffect(explosionPos);
          disposeBossFireball(bf, scene, bossFireballIndicatorGroup);
          bossFireballs.splice(i, 1);
          continue;
        }

        if (bf.ttl <= 0) {
          disposeBossFireball(bf, scene, bossFireballIndicatorGroup);
          bossFireballs.splice(i, 1);
        }
      }
    },
    clearFireballs(): void {
      while (bossFireballs.length > 0) {
        const bf = bossFireballs.pop()!;
        disposeBossFireball(bf, scene, bossFireballIndicatorGroup);
      }
    },
    getHitboxIndicator(): THREE.Mesh {
      return hitboxIndicator;
    },
  };
}
