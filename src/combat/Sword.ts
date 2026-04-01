/**
 * Sword combat: equipped mesh (swing animation), orbiting blades, and directional melee attack.
 * Hit detection calls provided damage callbacks; main wires those to enemy/caster/resurrector/boss damage.
 */

import * as THREE from 'three';
import {
  SWORD_ORBIT_RADIUS,
  SWORD_ANGULAR_SPEED,
  SWORD_HIT_RADIUS,
  SWORD_HIT_COOLDOWN,
  SWORD_SWING_DURATION,
  MELEE_RANGE,
} from '../config/Constants';
import type { CombatDamageCallbacks, CombatState } from './types';
import type { ItemId } from '../items/ItemTypes';

const SWORD_IDLE_ROTATION = { x: 0, y: Math.PI / 4, z: -Math.PI / 6 };
const SWORD_IDLE_POSITION = { x: 0.3, y: 0.4, z: -0.2 };
const MELEE_ARC = Math.PI / 3; // 60 degree arc in front

export interface SwordConfig {
  getEquippedWeapon: () => ItemId | null;
  getMeleeDamage: () => number;
  getOrbitRadius: () => number;
  getHitRadius: () => number;
  getHitCooldown: () => number;
  /** Skill tree: orbit blades visible when true. */
  hasOrbitSword: () => boolean;
  hasTwinBlades: () => boolean;
  enemyCount: number;
  casterCount: number;
  resurrectorCount: number;
  penRatCount: number;
  wildlifeCount: number;
}

export interface SwordAPI {
  /** Call each frame: updates orbit, hit detection, equipped visibility, swing animation. */
  update: (dt: number, gameTime: number, state: CombatState) => void;
  /** Call when player triggers melee attack (Space or auto-attack). */
  startMeleeSwing: (gameTime: number) => void;
  /**
   * Directional melee slash: hit enemies in arc in front; call after startMeleeSwing.
   * Optional `hitOrigin`: melee range / arc checks use this world XZ (e.g. true tile center) while the mesh keeps lerping.
   */
  performMeleeAttack: (
    gameTime: number,
    targetDirection: THREE.Vector3 | null,
    state: CombatState,
    hitOrigin?: THREE.Vector3 | null
  ) => void;
  /** The mesh parented to character (visibility controlled by update). */
  getEquippedMesh: () => THREE.Group;
}

function createSwordMesh(): THREE.Group {
  const group = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.6, roughness: 0.4 })
  );
  blade.position.z = 0.35;
  blade.castShadow = true;
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x4a3728, metalness: 0.2, roughness: 0.8 })
  );
  handle.position.z = 0.125;
  handle.castShadow = true;
  group.add(blade);
  group.add(handle);
  return group;
}

export function createSword(
  scene: THREE.Scene,
  character: THREE.Object3D,
  config: SwordConfig,
  callbacks: CombatDamageCallbacks
): SwordAPI {
  const equippedSword = createSwordMesh();
  equippedSword.position.set(SWORD_IDLE_POSITION.x, SWORD_IDLE_POSITION.y, SWORD_IDLE_POSITION.z);
  equippedSword.rotation.set(SWORD_IDLE_ROTATION.x, SWORD_IDLE_ROTATION.y, SWORD_IDLE_ROTATION.z);
  character.add(equippedSword);

  const swordOrbit = new THREE.Group();
  const swordMesh = createSwordMesh();
  swordMesh.position.set(SWORD_ORBIT_RADIUS, 0.6, 0);
  swordMesh.rotation.y = Math.PI / 2;
  swordOrbit.add(swordMesh);
  swordOrbit.visible = false;
  scene.add(swordOrbit);

  const swordOrbit2 = new THREE.Group();
  const swordMesh2 = createSwordMesh();
  swordMesh2.position.set(SWORD_ORBIT_RADIUS, 0.6, 0);
  swordMesh2.rotation.y = Math.PI / 2;
  swordOrbit2.add(swordMesh2);
  swordOrbit2.visible = false;
  scene.add(swordOrbit2);

  const swordWorldPos = new THREE.Vector3();
  const swordWorldPos2 = new THREE.Vector3();
  let swordSwingStartTime = -999;
  const lastSwordHitByEnemy: number[] = Array(config.enemyCount).fill(-999);
  const lastSwordHitByPenRat: number[] = Array(config.penRatCount).fill(-999);
  const lastSwordHitByWildlife: number[] = Array(config.wildlifeCount).fill(-999);

  function updateEquippedSword(gameTime: number): void {
    equippedSword.visible = config.getEquippedWeapon() === 'sword';
    const swingAge = gameTime - swordSwingStartTime;
    const isSwinging = swingAge >= 0 && swingAge < SWORD_SWING_DURATION;

    if (isSwinging) {
      const t = swingAge / SWORD_SWING_DURATION;
      const easeT = 1 - Math.pow(1 - t, 3);
      const arcAngle = easeT * Math.PI;
      const arcRadius = 0.6;
      const forwardDist = Math.sin(arcAngle) * arcRadius;
      const upDist = Math.sin(arcAngle * 0.5) * 0.2;
      const sideDist = (1 - Math.cos(arcAngle)) * arcRadius * 0.3;

      equippedSword.position.x = SWORD_IDLE_POSITION.x - sideDist;
      equippedSword.position.y = SWORD_IDLE_POSITION.y + upDist;
      equippedSword.position.z = SWORD_IDLE_POSITION.z + forwardDist;
      equippedSword.rotation.x = SWORD_IDLE_ROTATION.x + arcAngle * 0.4;
      equippedSword.rotation.y = SWORD_IDLE_ROTATION.y - arcAngle * 0.6;
      equippedSword.rotation.z = SWORD_IDLE_ROTATION.z + arcAngle * 0.3;
    } else {
      const returnT = Math.min(1, (swingAge - SWORD_SWING_DURATION) / 0.15);
      const easeReturn = 1 - Math.pow(1 - returnT, 2);
      const swingEndX = SWORD_IDLE_POSITION.x - 0.18;
      const swingEndY = SWORD_IDLE_POSITION.y + 0.1;
      const swingEndZ = SWORD_IDLE_POSITION.z + 0.6;
      const swingEndRotX = SWORD_IDLE_ROTATION.x + Math.PI * 0.4;
      const swingEndRotY = SWORD_IDLE_ROTATION.y - Math.PI * 0.6;
      const swingEndRotZ = SWORD_IDLE_ROTATION.z + Math.PI * 0.3;

      equippedSword.position.x = swingEndX + (SWORD_IDLE_POSITION.x - swingEndX) * easeReturn;
      equippedSword.position.y = swingEndY + (SWORD_IDLE_POSITION.y - swingEndY) * easeReturn;
      equippedSword.position.z = swingEndZ + (SWORD_IDLE_POSITION.z - swingEndZ) * easeReturn;
      equippedSword.rotation.x = swingEndRotX + (SWORD_IDLE_ROTATION.x - swingEndRotX) * easeReturn;
      equippedSword.rotation.y = swingEndRotY + (SWORD_IDLE_ROTATION.y - swingEndRotY) * easeReturn;
      equippedSword.rotation.z = swingEndRotZ + (SWORD_IDLE_ROTATION.z - swingEndRotZ) * easeReturn;

      if (returnT >= 1) {
        equippedSword.position.set(SWORD_IDLE_POSITION.x, SWORD_IDLE_POSITION.y, SWORD_IDLE_POSITION.z);
        equippedSword.rotation.set(SWORD_IDLE_ROTATION.x, SWORD_IDLE_ROTATION.y, SWORD_IDLE_ROTATION.z);
      }
    }
  }

  function checkOrbitHit(worldPos: THREE.Vector3, gameTime: number, state: CombatState): void {
    const hitR = config.getHitRadius();
    const hitCooldown = config.getHitCooldown();
    const dmg = config.getMeleeDamage();
    const hitDist = state.enemySize / 2 + hitR;

    for (let j = 0; j < state.enemyPositions.length; j++) {
      if (!state.enemyAlive[j]) continue;
      if (gameTime - lastSwordHitByEnemy[j] < hitCooldown) continue;
      if (worldPos.distanceTo(state.enemyPositions[j]) < hitDist) {
        callbacks.damageEnemy(j, dmg);
        lastSwordHitByEnemy[j] = gameTime;
      }
    }
    for (let c = 0; c < state.casterPositions.length; c++) {
      if (!state.casterAlive[c]) continue;
      if (worldPos.distanceTo(state.casterPositions[c]) < state.casterSize / 2 + hitR) {
        callbacks.damageCaster(c, dmg);
      }
    }
    for (let r = 0; r < state.resurrectorPositions.length; r++) {
      if (!state.resurrectorAlive[r]) continue;
      if (worldPos.distanceTo(state.resurrectorPositions[r]) < state.resurrectorSize / 2 + hitR) {
        callbacks.damageResurrector(r, dmg);
      }
    }
    for (let t = 0; t < state.teleporterPositions.length; t++) {
      if (!state.teleporterAlive[t]) continue;
      if (worldPos.distanceTo(state.teleporterPositions[t]) < state.teleporterSize / 2 + hitR) {
        callbacks.damageTeleporter(t, dmg);
      }
    }
    if (state.bossAlive && worldPos.distanceTo(state.bossPosition) < state.bossHitboxRadius + hitR) {
      callbacks.damageBoss(dmg);
    }
    const penHitDist = state.penRatSize / 2 + hitR;
    for (let p = 0; p < state.penRatPositions.length; p++) {
      if (!state.penRatAlive[p] || !state.penRatAttackable[p]) continue;
      if (gameTime - lastSwordHitByPenRat[p] < hitCooldown) continue;
      if (worldPos.distanceTo(state.penRatPositions[p]) < penHitDist) {
        callbacks.damagePenRat(p, dmg);
        lastSwordHitByPenRat[p] = gameTime;
      }
    }
    for (let w = 0; w < state.wildlifePositions.length; w++) {
      if (!state.wildlifeAlive[w] || !state.wildlifeAttackable[w]) continue;
      if (gameTime - lastSwordHitByWildlife[w] < hitCooldown) continue;
      const wh = state.wildlifeHitRadius[w] + hitR;
      if (worldPos.distanceTo(state.wildlifePositions[w]) < wh) {
        callbacks.damageWildlife(w, dmg);
        lastSwordHitByWildlife[w] = gameTime;
      }
    }
  }

  function update(dt: number, gameTime: number, state: CombatState): void {
    const hasSword = config.getEquippedWeapon() === 'sword'; // orbit visibility follows skill in main; we use weapon for equipped
    updateEquippedSword(gameTime);

    const hasOrbit = config.hasOrbitSword();
    const orbitR = config.getOrbitRadius();
    swordOrbit.visible = hasOrbit;
    swordOrbit2.visible = hasOrbit && config.hasTwinBlades();

    if (!hasOrbit) return;
    swordMesh.position.x = orbitR;
    swordOrbit.position.copy(character.position);
    swordOrbit.rotation.y += SWORD_ANGULAR_SPEED * dt;
    swordMesh.getWorldPosition(swordWorldPos);
    checkOrbitHit(swordWorldPos, gameTime, state);

    if (config.hasTwinBlades()) {
      swordMesh2.position.x = orbitR;
      swordOrbit2.position.copy(character.position);
      swordOrbit2.rotation.y -= SWORD_ANGULAR_SPEED * dt;
      swordMesh2.getWorldPosition(swordWorldPos2);
      checkOrbitHit(swordWorldPos2, gameTime, state);
    }
  }

  function startMeleeSwing(gameTime: number): void {
    swordSwingStartTime = gameTime;
  }

  function performMeleeAttack(
    gameTime: number,
    targetDirection: THREE.Vector3 | null,
    state: CombatState,
    hitOrigin?: THREE.Vector3 | null
  ): void {
    startMeleeSwing(gameTime);

    const hitPos = hitOrigin ?? character.position;
    let attackDir: THREE.Vector3;
    if (targetDirection && targetDirection.lengthSq() > 0.0001) {
      attackDir = targetDirection.clone().normalize();
      (character as THREE.Object3D & { rotation: { y: number } }).rotation.y = Math.atan2(attackDir.x, attackDir.z);
    } else {
      attackDir = new THREE.Vector3(
        Math.sin((character as THREE.Object3D & { rotation: { y: number } }).rotation.y),
        0,
        Math.cos((character as THREE.Object3D & { rotation: { y: number } }).rotation.y)
      );
    }

    const dmg = config.getMeleeDamage();
    const meleeDist = state.enemySize / 2 + MELEE_RANGE;

    for (let j = 0; j < state.enemyPositions.length; j++) {
      if (!state.enemyAlive[j]) continue;
      const toEnemy = new THREE.Vector3().subVectors(state.enemyPositions[j], hitPos);
      const dist = toEnemy.length();
      if (dist <= meleeDist && dist > 0.01) {
        toEnemy.normalize();
        const dot = attackDir.dot(toEnemy);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle <= MELEE_ARC / 2) callbacks.damageEnemy(j, dmg);
      }
    }

    const casterMeleeDist = state.casterSize / 2 + MELEE_RANGE;
    for (let c = 0; c < state.casterPositions.length; c++) {
      if (!state.casterAlive[c]) continue;
      const toCaster = new THREE.Vector3().subVectors(state.casterPositions[c], hitPos);
      const dist = toCaster.length();
      if (dist <= casterMeleeDist && dist > 0.01) {
        toCaster.normalize();
        const dot = attackDir.dot(toCaster);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle <= MELEE_ARC / 2) callbacks.damageCaster(c, dmg);
      }
    }

    const resMeleeDist = state.resurrectorSize / 2 + MELEE_RANGE;
    for (let r = 0; r < state.resurrectorPositions.length; r++) {
      if (!state.resurrectorAlive[r]) continue;
      const toRes = new THREE.Vector3().subVectors(state.resurrectorPositions[r], hitPos);
      const dist = toRes.length();
      if (dist <= resMeleeDist && dist > 0.01) {
        toRes.normalize();
        const dot = attackDir.dot(toRes);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle <= MELEE_ARC / 2) callbacks.damageResurrector(r, dmg);
      }
    }

    const teleporterMeleeDist = state.teleporterSize / 2 + MELEE_RANGE;
    for (let t = 0; t < state.teleporterPositions.length; t++) {
      if (!state.teleporterAlive[t]) continue;
      const toTele = new THREE.Vector3().subVectors(state.teleporterPositions[t], hitPos);
      const dist = toTele.length();
      if (dist <= teleporterMeleeDist && dist > 0.01) {
        toTele.normalize();
        const dot = attackDir.dot(toTele);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle <= MELEE_ARC / 2) callbacks.damageTeleporter(t, dmg);
      }
    }

    if (state.bossAlive) {
      const toBoss = new THREE.Vector3().subVectors(state.bossPosition, hitPos);
      const dist = toBoss.length();
      if (dist <= state.bossHitboxRadius + MELEE_RANGE && dist > 0.01) {
        toBoss.normalize();
        const dot = attackDir.dot(toBoss);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle <= MELEE_ARC / 2) callbacks.damageBoss(dmg);
      }
    }

    const ratMeleeDist = state.penRatSize / 2 + MELEE_RANGE;
    for (let p = 0; p < state.penRatPositions.length; p++) {
      if (!state.penRatAlive[p] || !state.penRatAttackable[p]) continue;
      const toRat = new THREE.Vector3().subVectors(state.penRatPositions[p], hitPos);
      const dist = toRat.length();
      if (dist <= ratMeleeDist && dist > 0.01) {
        toRat.normalize();
        const dot = attackDir.dot(toRat);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle <= MELEE_ARC / 2) callbacks.damagePenRat(p, dmg);
      }
    }

    for (let w = 0; w < state.wildlifePositions.length; w++) {
      if (!state.wildlifeAlive[w] || !state.wildlifeAttackable[w]) continue;
      const wildMeleeDist = state.wildlifeHitRadius[w] + MELEE_RANGE;
      const toW = new THREE.Vector3().subVectors(state.wildlifePositions[w], hitPos);
      const dist = toW.length();
      if (dist <= wildMeleeDist && dist > 0.01) {
        toW.normalize();
        const dot = attackDir.dot(toW);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle <= MELEE_ARC / 2) callbacks.damageWildlife(w, dmg);
      }
    }
  }

  return {
    update,
    startMeleeSwing,
    performMeleeAttack,
    getEquippedMesh: () => equippedSword,
  };
}
