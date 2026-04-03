/**
 * Player projectiles: bow arrows.
 * Owns meshes and movement; hit detection uses CombatState and damage callbacks.
 */

import * as THREE from 'three';
import { ARROW_SPEED, ARROW_RADIUS, ARROW_TTL } from '../config/Constants';
import type { CombatDamageCallbacks, CombatState } from './types';

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
    o.y = 0.5;
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

      const penArrowR = state.penRatSize / 2 + ARROW_RADIUS;
      for (let p = 0; p < state.penRatPositions.length; p++) {
        if (!state.penRatAlive[p] || !state.penRatAttackable[p]) continue;
        if (arrow.mesh.position.distanceTo(state.penRatPositions[p]) < penArrowR) {
          callbacks.damagePenRat(p, dmg);
          scene.remove(arrow.mesh);
          (arrow.mesh.geometry as THREE.BufferGeometry).dispose();
          (arrow.mesh.material as THREE.Material).dispose();
          arrows.splice(i, 1);
          break;
        }
      }
      if (i >= arrows.length) continue;

      for (let w = 0; w < state.wildlifePositions.length; w++) {
        if (!state.wildlifeAlive[w] || !state.wildlifeAttackable[w]) continue;
        const wildArrowR = state.wildlifeHitRadius[w] + ARROW_RADIUS;
        if (arrow.mesh.position.distanceTo(state.wildlifePositions[w]) < wildArrowR) {
          callbacks.damageWildlife(w, dmg);
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
