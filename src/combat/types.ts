/**
 * Shared types for combat modules. Main builds CombatState each frame and passes
 * it to Sword and Projectiles for hit detection and damage callbacks.
 */

import type * as THREE from 'three';

export interface CombatDamageCallbacks {
  damageEnemy: (index: number, amount: number) => boolean;
  damageCaster: (index: number, amount: number) => boolean;
  damageResurrector: (index: number, amount: number) => boolean;
  damageTeleporter: (index: number, amount: number) => boolean;
  damageBoss: (amount: number) => boolean;
  damagePenRat: (index: number, amount: number) => boolean;
  damageWildlife: (index: number, amount: number) => boolean;
}

/** State snapshot for hit detection; main fills this each frame. */
export interface CombatState {
  enemyPositions: THREE.Vector3[];
  enemyAlive: boolean[];
  casterPositions: THREE.Vector3[];
  casterAlive: boolean[];
  resurrectorPositions: THREE.Vector3[];
  resurrectorAlive: boolean[];
  teleporterPositions: THREE.Vector3[];
  teleporterAlive: boolean[];
  bossPosition: THREE.Vector3;
  bossAlive: boolean;
  penRatPositions: THREE.Vector3[];
  penRatAlive: boolean[];
  penRatAttackable: boolean[];
  /** Per-mob XZ hit radius (half-extent) for disk checks; same role as `enemySize / 2`. */
  wildlifePositions: THREE.Vector3[];
  wildlifeAlive: boolean[];
  wildlifeAttackable: boolean[];
  wildlifeHitRadius: number[];
  enemySize: number;
  casterSize: number;
  resurrectorSize: number;
  teleporterSize: number;
  penRatSize: number;
  bossHitboxRadius: number;
}
