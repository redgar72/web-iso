/**
 * Combat utilities: projectile trajectory, etc.
 */

import type * as THREE from 'three';
import { LAUNCH_HEIGHT } from '../config/Constants';

/**
 * Writes initial velocity so a projectile launched from origin (at launchHeight)
 * lands at target (y=0), clamped to maxRange.
 */
export function getLandingVelocity(
  origin: THREE.Vector3,
  target: THREE.Vector3,
  horizontalSpeed: number,
  gravity: number,
  maxRange: number,
  outVel: THREE.Vector3
): void {
  let dx = target.x - origin.x;
  let dz = target.z - origin.z;
  let d = Math.sqrt(dx * dx + dz * dz);
  if (d > maxRange) {
    d = maxRange;
    const scale = d / Math.sqrt(dx * dx + dz * dz);
    dx *= scale;
    dz *= scale;
  }
  if (d < 0.1) {
    outVel.set(horizontalSpeed, 0, 0);
    return;
  }
  outVel.x = (dx / d) * horizontalSpeed;
  outVel.z = (dz / d) * horizontalSpeed;
  const t = d / horizontalSpeed;
  let vy = 0.5 * gravity * t - LAUNCH_HEIGHT / t;
  if (vy < 0) vy = 0;
  outVel.y = vy;
}
