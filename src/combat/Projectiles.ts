/**
 * Player projectiles: fireballs (right-click), rocks (Q), arrows (bow).
 * Each owns meshes and movement; hit detection uses CombatState and damage callbacks.
 */

import * as THREE from 'three';
import {
  PROJECTILE_GRAVITY,
  LAUNCH_HEIGHT,
  MAX_PROJECTILE_RANGE,
  FIREBALL_SPEED,
  FIREBALL_RADIUS,
  FIREBALL_TTL,
  EXPLOSION_DURATION,
  EXPLOSION_MAX_SCALE,
  ROCK_SPEED,
  ROCK_RADIUS,
  ROCK_TTL,
  ARROW_SPEED,
  ARROW_RADIUS,
  ARROW_TTL,
} from '../config/Constants';
import { getLandingVelocity } from './util';
import type { CombatDamageCallbacks, CombatState } from './types';

// --- Fireballs ---

interface Fireball {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
  state: 'flying' | 'exploding';
  explosionElapsed: number;
}

export interface FireballsConfig {
  getMagicDamage: () => number;
  hasExplosionAugment: () => boolean;
  getExplosionHitRadius: () => number;
}

export interface FireballsAPI {
  spawn: (origin: THREE.Vector3, target: THREE.Vector3) => void;
  update: (dt: number, state: CombatState) => void;
}

function createFireballMesh(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(FIREBALL_RADIUS, 12, 10);
  const material = new THREE.MeshStandardMaterial({
    color: 0xff6600,
    emissive: 0xff3300,
    emissiveIntensity: 0.6,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

function applyExplosionDamage(
  pos: THREE.Vector3,
  state: CombatState,
  getDmg: () => number,
  getRadius: () => number,
  callbacks: CombatDamageCallbacks
): void {
  const r = getRadius();
  for (let k = 0; k < state.enemyPositions.length; k++) {
    if (!state.enemyAlive[k]) continue;
    if (pos.distanceTo(state.enemyPositions[k]) <= r) callbacks.damageEnemy(k, getDmg());
  }
  for (let c = 0; c < state.casterPositions.length; c++) {
    if (!state.casterAlive[c]) continue;
    if (pos.distanceTo(state.casterPositions[c]) <= r) callbacks.damageCaster(c, getDmg());
  }
  for (let r2 = 0; r2 < state.resurrectorPositions.length; r2++) {
    if (!state.resurrectorAlive[r2]) continue;
    if (pos.distanceTo(state.resurrectorPositions[r2]) <= r) callbacks.damageResurrector(r2, getDmg());
  }
  for (let t = 0; t < state.teleporterPositions.length; t++) {
    if (!state.teleporterAlive[t]) continue;
    if (pos.distanceTo(state.teleporterPositions[t]) <= r) callbacks.damageTeleporter(t, getDmg());
  }
  if (state.bossAlive && pos.distanceTo(state.bossPosition) <= r) callbacks.damageBoss(getDmg());
}

export function createFireballs(
  scene: THREE.Scene,
  config: FireballsConfig,
  callbacks: CombatDamageCallbacks
): FireballsAPI {
  const fireballs: Fireball[] = [];

  function spawn(origin: THREE.Vector3, target: THREE.Vector3): void {
    const mesh = createFireballMesh();
    mesh.position.copy(origin);
    mesh.position.y = LAUNCH_HEIGHT;
    scene.add(mesh);
    const vel = new THREE.Vector3();
    getLandingVelocity(origin, target, FIREBALL_SPEED, PROJECTILE_GRAVITY, MAX_PROJECTILE_RANGE, vel);
    fireballs.push({
      mesh,
      velocity: vel,
      ttl: FIREBALL_TTL,
      state: 'flying',
      explosionElapsed: 0,
    });
  }

  function update(dt: number, state: CombatState): void {
    const hitRadius = state.enemySize / 2 + FIREBALL_RADIUS;
    const getDmg = config.getMagicDamage;
    const getRadius = config.getExplosionHitRadius;

    for (let i = fireballs.length - 1; i >= 0; i--) {
      const fb = fireballs[i];

      if (fb.state === 'exploding') {
        fb.explosionElapsed += dt;
        const t = Math.min(1, fb.explosionElapsed / EXPLOSION_DURATION);
        const scale = 1 + (EXPLOSION_MAX_SCALE - 1) * t;
        fb.mesh.scale.setScalar(scale);
        const mat = fb.mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = 1 - t;
        if (fb.explosionElapsed >= EXPLOSION_DURATION) {
          scene.remove(fb.mesh);
          (fb.mesh.geometry as THREE.BufferGeometry).dispose();
          mat.dispose();
          fireballs.splice(i, 1);
        }
        continue;
      }

      fb.velocity.y -= PROJECTILE_GRAVITY * dt;
      fb.mesh.position.addScaledVector(fb.velocity, dt);
      fb.ttl -= dt;

      if (fb.mesh.position.y < 0) {
        fb.mesh.position.y = 0;
        if (config.hasExplosionAugment()) {
          fb.state = 'exploding';
          fb.velocity.set(0, 0, 0);
          fb.explosionElapsed = 0;
          applyExplosionDamage(fb.mesh.position, state, getDmg, getRadius, callbacks);
        } else {
          scene.remove(fb.mesh);
          (fb.mesh.geometry as THREE.BufferGeometry).dispose();
          (fb.mesh.material as THREE.Material).dispose();
          fireballs.splice(i, 1);
        }
        continue;
      }
      if (fb.ttl <= 0) {
        scene.remove(fb.mesh);
        (fb.mesh.geometry as THREE.BufferGeometry).dispose();
        (fb.mesh.material as THREE.Material).dispose();
        fireballs.splice(i, 1);
        continue;
      }

      for (let j = 0; j < state.enemyPositions.length; j++) {
        if (!state.enemyAlive[j]) continue;
        if (fb.mesh.position.distanceTo(state.enemyPositions[j]) < hitRadius) {
          if (config.hasExplosionAugment()) {
            fb.state = 'exploding';
            fb.velocity.set(0, 0, 0);
            fb.explosionElapsed = 0;
            fb.mesh.position.copy(state.enemyPositions[j]);
            applyExplosionDamage(fb.mesh.position, state, getDmg, getRadius, callbacks);
          } else {
            callbacks.damageEnemy(j, getDmg());
            scene.remove(fb.mesh);
            (fb.mesh.geometry as THREE.BufferGeometry).dispose();
            (fb.mesh.material as THREE.Material).dispose();
            fireballs.splice(i, 1);
          }
          break;
        }
      }
      if (fireballs[i] !== fb) continue;

      for (let c = 0; c < state.casterPositions.length; c++) {
        if (!state.casterAlive[c]) continue;
        if (fb.mesh.position.distanceTo(state.casterPositions[c]) < state.casterSize / 2 + FIREBALL_RADIUS) {
          if (config.hasExplosionAugment()) {
            fb.state = 'exploding';
            fb.velocity.set(0, 0, 0);
            fb.explosionElapsed = 0;
            fb.mesh.position.copy(state.casterPositions[c]);
            applyExplosionDamage(fb.mesh.position, state, getDmg, getRadius, callbacks);
          } else {
            callbacks.damageCaster(c, getDmg());
            scene.remove(fb.mesh);
            (fb.mesh.geometry as THREE.BufferGeometry).dispose();
            (fb.mesh.material as THREE.Material).dispose();
            fireballs.splice(i, 1);
          }
          break;
        }
      }
      if (fireballs[i] !== fb) continue;

      for (let r = 0; r < state.resurrectorPositions.length; r++) {
        if (!state.resurrectorAlive[r]) continue;
        if (fb.mesh.position.distanceTo(state.resurrectorPositions[r]) < state.resurrectorSize / 2 + FIREBALL_RADIUS) {
          if (config.hasExplosionAugment()) {
            fb.state = 'exploding';
            fb.velocity.set(0, 0, 0);
            fb.explosionElapsed = 0;
            fb.mesh.position.copy(state.resurrectorPositions[r]);
            applyExplosionDamage(fb.mesh.position, state, getDmg, getRadius, callbacks);
          } else {
            callbacks.damageResurrector(r, getDmg());
            scene.remove(fb.mesh);
            (fb.mesh.geometry as THREE.BufferGeometry).dispose();
            (fb.mesh.material as THREE.Material).dispose();
            fireballs.splice(i, 1);
          }
          break;
        }
      }
      if (fireballs[i] !== fb) continue;

      for (let t = 0; t < state.teleporterPositions.length; t++) {
        if (!state.teleporterAlive[t]) continue;
        if (fb.mesh.position.distanceTo(state.teleporterPositions[t]) < state.teleporterSize / 2 + FIREBALL_RADIUS) {
          if (config.hasExplosionAugment()) {
            fb.state = 'exploding';
            fb.velocity.set(0, 0, 0);
            fb.explosionElapsed = 0;
            fb.mesh.position.copy(state.teleporterPositions[t]);
            applyExplosionDamage(fb.mesh.position, state, getDmg, getRadius, callbacks);
          } else {
            callbacks.damageTeleporter(t, getDmg());
            scene.remove(fb.mesh);
            (fb.mesh.geometry as THREE.BufferGeometry).dispose();
            (fb.mesh.material as THREE.Material).dispose();
            fireballs.splice(i, 1);
          }
          break;
        }
      }
    }
  }

  return { spawn, update };
}

// --- Rocks ---

interface Rock {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
}

export interface RocksConfig {
  getRangedDamage: () => number;
}

export interface RocksAPI {
  throw: (origin: THREE.Vector3, target: THREE.Vector3, spreadAngleRad: number) => void;
  update: (dt: number, state: CombatState) => void;
}

function createRockMesh(): THREE.Mesh {
  const geometry = new THREE.DodecahedronGeometry(ROCK_RADIUS, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6a5a4a,
    roughness: 0.9,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

export function createRocks(
  scene: THREE.Scene,
  config: RocksConfig,
  callbacks: CombatDamageCallbacks
): RocksAPI {
  const rocks: Rock[] = [];

  function throwRock(origin: THREE.Vector3, target: THREE.Vector3, spreadAngleRad: number): void {
    let aim = target.clone();
    if (spreadAngleRad !== 0) {
      const dir = new THREE.Vector3().subVectors(target, origin).setY(0);
      if (dir.lengthSq() > 0.01) {
        dir.normalize();
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spreadAngleRad);
        aim = origin.clone().add(dir.multiplyScalar(origin.distanceTo(target)));
        aim.y = 0;
      }
    }
    const mesh = createRockMesh();
    mesh.position.copy(origin);
    mesh.position.y = LAUNCH_HEIGHT;
    scene.add(mesh);
    const vel = new THREE.Vector3();
    getLandingVelocity(origin, aim, ROCK_SPEED, PROJECTILE_GRAVITY, MAX_PROJECTILE_RANGE, vel);
    rocks.push({ mesh, velocity: vel, ttl: ROCK_TTL });
  }

  function update(dt: number, state: CombatState): void {
    const hitRadius = state.enemySize / 2 + ROCK_RADIUS;
    const dmg = config.getRangedDamage();

    for (let i = rocks.length - 1; i >= 0; i--) {
      const rock = rocks[i];
      rock.velocity.y -= PROJECTILE_GRAVITY * dt;
      rock.mesh.position.addScaledVector(rock.velocity, dt);
      rock.ttl -= dt;

      if (rock.mesh.position.y < 0) {
        scene.remove(rock.mesh);
        (rock.mesh.geometry as THREE.BufferGeometry).dispose();
        (rock.mesh.material as THREE.Material).dispose();
        rocks.splice(i, 1);
        continue;
      }
      if (rock.ttl <= 0) {
        scene.remove(rock.mesh);
        (rock.mesh.geometry as THREE.BufferGeometry).dispose();
        (rock.mesh.material as THREE.Material).dispose();
        rocks.splice(i, 1);
        continue;
      }

      for (let j = 0; j < state.enemyPositions.length; j++) {
        if (!state.enemyAlive[j]) continue;
        if (rock.mesh.position.distanceTo(state.enemyPositions[j]) < hitRadius) {
          callbacks.damageEnemy(j, dmg);
          scene.remove(rock.mesh);
          (rock.mesh.geometry as THREE.BufferGeometry).dispose();
          (rock.mesh.material as THREE.Material).dispose();
          rocks.splice(i, 1);
          break;
        }
      }
      if (i >= rocks.length) continue;

      const casterRadius = state.casterSize / 2 + ROCK_RADIUS;
      for (let c = 0; c < state.casterPositions.length; c++) {
        if (!state.casterAlive[c]) continue;
        if (rock.mesh.position.distanceTo(state.casterPositions[c]) < casterRadius) {
          callbacks.damageCaster(c, dmg);
          scene.remove(rock.mesh);
          (rock.mesh.geometry as THREE.BufferGeometry).dispose();
          (rock.mesh.material as THREE.Material).dispose();
          rocks.splice(i, 1);
          break;
        }
      }
      if (i >= rocks.length) continue;

      const resurrectorRadius = state.resurrectorSize / 2 + ROCK_RADIUS;
      for (let r = 0; r < state.resurrectorPositions.length; r++) {
        if (!state.resurrectorAlive[r]) continue;
        if (rock.mesh.position.distanceTo(state.resurrectorPositions[r]) < resurrectorRadius) {
          callbacks.damageResurrector(r, dmg);
          scene.remove(rock.mesh);
          (rock.mesh.geometry as THREE.BufferGeometry).dispose();
          (rock.mesh.material as THREE.Material).dispose();
          rocks.splice(i, 1);
          break;
        }
      }
      if (i >= rocks.length) continue;

      const teleporterRadius = state.teleporterSize / 2 + ROCK_RADIUS;
      for (let t = 0; t < state.teleporterPositions.length; t++) {
        if (!state.teleporterAlive[t]) continue;
        if (rock.mesh.position.distanceTo(state.teleporterPositions[t]) < teleporterRadius) {
          callbacks.damageTeleporter(t, dmg);
          scene.remove(rock.mesh);
          (rock.mesh.geometry as THREE.BufferGeometry).dispose();
          (rock.mesh.material as THREE.Material).dispose();
          rocks.splice(i, 1);
          break;
        }
      }
      if (i >= rocks.length) continue;

      if (state.bossAlive && rock.mesh.position.distanceTo(state.bossPosition) < state.bossHitboxRadius + ROCK_RADIUS) {
        callbacks.damageBoss(dmg);
        scene.remove(rock.mesh);
        (rock.mesh.geometry as THREE.BufferGeometry).dispose();
        (rock.mesh.material as THREE.Material).dispose();
        rocks.splice(i, 1);
      }
    }
  }

  return { throw: throwRock, update };
}

// --- Arrows ---

interface Arrow {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
}

export interface ArrowsConfig {
  getRangedDamage: () => number;
}

export interface ArrowsAPI {
  shoot: (origin: THREE.Vector3, targetPos: THREE.Vector3) => void;
  update: (dt: number, state: CombatState) => void;
}

function createArrowMesh(): THREE.Mesh {
  const length = 0.5;
  const geometry = new THREE.CylinderGeometry(ARROW_RADIUS * 0.5, ARROW_RADIUS * 0.5, length, 6);
  const material = new THREE.MeshStandardMaterial({
    color: 0x8b7355,
    roughness: 0.7,
    metalness: 0.3,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

export function createArrows(
  scene: THREE.Scene,
  config: ArrowsConfig,
  callbacks: CombatDamageCallbacks
): ArrowsAPI {
  const arrows: Arrow[] = [];

  function shoot(origin: THREE.Vector3, targetPos: THREE.Vector3): void {
    const o = origin.clone();
    o.y = LAUNCH_HEIGHT;
    const dir = new THREE.Vector3().subVectors(targetPos, o).setY(0);
    const dist = dir.length();
    if (dist < 0.01) return;
    dir.normalize();
    const velocity = dir.multiplyScalar(ARROW_SPEED);
    velocity.y = 0;
    const mesh = createArrowMesh();
    mesh.position.copy(o);
    scene.add(mesh);
    arrows.push({ mesh, velocity: velocity.clone(), ttl: ARROW_TTL });
  }

  function update(dt: number, state: CombatState): void {
    const hitRadius = state.enemySize / 2 + ARROW_RADIUS;
    const dmg = config.getRangedDamage();

    for (let i = arrows.length - 1; i >= 0; i--) {
      const arrow = arrows[i];
      arrow.mesh.position.addScaledVector(arrow.velocity, dt);
      arrow.ttl -= dt;

      if (arrow.ttl <= 0) {
        scene.remove(arrow.mesh);
        (arrow.mesh.geometry as THREE.BufferGeometry).dispose();
        (arrow.mesh.material as THREE.Material).dispose();
        arrows.splice(i, 1);
        continue;
      }

      for (let j = 0; j < state.enemyPositions.length; j++) {
        if (!state.enemyAlive[j]) continue;
        if (arrow.mesh.position.distanceTo(state.enemyPositions[j]) < hitRadius) {
          callbacks.damageEnemy(j, dmg);
          scene.remove(arrow.mesh);
          (arrow.mesh.geometry as THREE.BufferGeometry).dispose();
          (arrow.mesh.material as THREE.Material).dispose();
          arrows.splice(i, 1);
          break;
        }
      }
      if (i >= arrows.length) continue;

      const casterRadius = state.casterSize / 2 + ARROW_RADIUS;
      for (let c = 0; c < state.casterPositions.length; c++) {
        if (!state.casterAlive[c]) continue;
        if (arrow.mesh.position.distanceTo(state.casterPositions[c]) < casterRadius) {
          callbacks.damageCaster(c, dmg);
          scene.remove(arrow.mesh);
          (arrow.mesh.geometry as THREE.BufferGeometry).dispose();
          (arrow.mesh.material as THREE.Material).dispose();
          arrows.splice(i, 1);
          break;
        }
      }
      if (i >= arrows.length) continue;

      const resurrectorRadius = state.resurrectorSize / 2 + ARROW_RADIUS;
      for (let r = 0; r < state.resurrectorPositions.length; r++) {
        if (!state.resurrectorAlive[r]) continue;
        if (arrow.mesh.position.distanceTo(state.resurrectorPositions[r]) < resurrectorRadius) {
          callbacks.damageResurrector(r, dmg);
          scene.remove(arrow.mesh);
          (arrow.mesh.geometry as THREE.BufferGeometry).dispose();
          (arrow.mesh.material as THREE.Material).dispose();
          arrows.splice(i, 1);
          break;
        }
      }
      if (i >= arrows.length) continue;

      const teleporterRadius = state.teleporterSize / 2 + ARROW_RADIUS;
      for (let t = 0; t < state.teleporterPositions.length; t++) {
        if (!state.teleporterAlive[t]) continue;
        if (arrow.mesh.position.distanceTo(state.teleporterPositions[t]) < teleporterRadius) {
          callbacks.damageTeleporter(t, dmg);
          scene.remove(arrow.mesh);
          (arrow.mesh.geometry as THREE.BufferGeometry).dispose();
          (arrow.mesh.material as THREE.Material).dispose();
          arrows.splice(i, 1);
          break;
        }
      }
      if (i >= arrows.length) continue;

      if (state.bossAlive && arrow.mesh.position.distanceTo(state.bossPosition) < state.bossHitboxRadius + ARROW_RADIUS) {
        callbacks.damageBoss(dmg);
        scene.remove(arrow.mesh);
        (arrow.mesh.geometry as THREE.BufferGeometry).dispose();
        (arrow.mesh.material as THREE.Material).dispose();
        arrows.splice(i, 1);
      }
    }
  }

  return { shoot, update };
}
