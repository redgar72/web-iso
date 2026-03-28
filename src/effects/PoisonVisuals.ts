/**
 * Player poison visuals: green particles and emissive tint when poisoned (e.g. from poison pools).
 */

import * as THREE from 'three';

export interface PlayerPoisonState {
  playerPoisoned: boolean;
  playerPoisonStartTime: number;
  poisonDuration: number;
  character: THREE.Object3D;
}

export interface PlayerPoisonVisualsAPI {
  update: (gameTime: number) => void;
}

function createPoisonParticle(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.05, 6, 6);
  const material = new THREE.MeshBasicMaterial({
    color: 0x44ff88,
    transparent: true,
    opacity: 0.8,
  });
  return new THREE.Mesh(geometry, material);
}

/**
 * Creates the player poison visuals (particles + character emissive). Call update(gameTime) each frame.
 */
export function createPlayerPoisonVisuals(
  scene: THREE.Scene,
  getState: () => PlayerPoisonState
): PlayerPoisonVisualsAPI {
  const poisonParticlesGroup = new THREE.Group();
  scene.add(poisonParticlesGroup);
  const poisonParticles: THREE.Mesh[] = [];

  function update(gameTime: number): void {
    for (const particle of poisonParticles) {
      poisonParticlesGroup.remove(particle);
      (particle.geometry as THREE.BufferGeometry).dispose();
      (particle.material as THREE.Material).dispose();
    }
    poisonParticles.length = 0;

    const { playerPoisoned, playerPoisonStartTime, poisonDuration, character } = getState();
    if (!playerPoisoned) {
      character.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive.setHex(0x000000);
          child.material.emissiveIntensity = 0;
        }
      });
      return;
    }

    const charPos = character.position;
    const poisonAge = gameTime - playerPoisonStartTime;
    const poisonProgress = poisonAge / poisonDuration;

    const particleCount = 8;
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 0.4 + Math.sin(poisonProgress * Math.PI * 4 + angle) * 0.1;
      const height = 0.3 + Math.sin(poisonProgress * Math.PI * 6 + angle * 2) * 0.2;

      const particle = createPoisonParticle();
      particle.position.set(
        charPos.x + Math.cos(angle) * radius,
        charPos.y + height,
        charPos.z + Math.sin(angle) * radius
      );

      const mat = particle.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.8 * (1 - poisonProgress);

      poisonParticlesGroup.add(particle);
      poisonParticles.push(particle);
    }

    character.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const mat = child.material;
        mat.emissive.setHex(0x228844);
        mat.emissiveIntensity = 0.25 + Math.sin(poisonProgress * Math.PI * 8) * 0.15;
      }
    });
  }

  return { update };
}
