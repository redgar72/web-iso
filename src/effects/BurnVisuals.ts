/**
 * Player burn visuals: particles around character and emissive glow when burning (e.g. boss fireball).
 * Owns the particle group and mesh lifecycle; main passes state each frame.
 */

import * as THREE from 'three';

export interface PlayerBurnState {
  playerBurning: boolean;
  playerBurnStartTime: number;
  burnDuration: number;
  character: THREE.Object3D;
}

export interface PlayerBurnVisualsAPI {
  update: (gameTime: number) => void;
}

function createBurningParticle(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.05, 6, 6);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.8,
  });
  return new THREE.Mesh(geometry, material);
}

/**
 * Creates the player burn visuals (particles + character emissive). Call update(gameTime) each frame.
 * getState is called each frame to read current burn state from main.
 */
export function createPlayerBurnVisuals(
  scene: THREE.Scene,
  getState: () => PlayerBurnState
): PlayerBurnVisualsAPI {
  const burningParticlesGroup = new THREE.Group();
  scene.add(burningParticlesGroup);
  const burningParticles: THREE.Mesh[] = [];

  function update(gameTime: number): void {
    for (const particle of burningParticles) {
      burningParticlesGroup.remove(particle);
      (particle.geometry as THREE.BufferGeometry).dispose();
      (particle.material as THREE.Material).dispose();
    }
    burningParticles.length = 0;

    const { playerBurning, playerBurnStartTime, burnDuration, character } = getState();
    if (!playerBurning) {
      character.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive.setHex(0x000000);
          child.material.emissiveIntensity = 0;
        }
      });
      return;
    }

    const charPos = character.position;
    const burnAge = gameTime - playerBurnStartTime;
    const burnProgress = burnAge / burnDuration;

    const particleCount = 8;
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 0.4 + Math.sin(burnProgress * Math.PI * 4 + angle) * 0.1;
      const height = 0.3 + Math.sin(burnProgress * Math.PI * 6 + angle * 2) * 0.2;

      const particle = createBurningParticle();
      particle.position.set(
        charPos.x + Math.cos(angle) * radius,
        charPos.y + height,
        charPos.z + Math.sin(angle) * radius
      );

      const mat = particle.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.8 * (1 - burnProgress);

      burningParticlesGroup.add(particle);
      burningParticles.push(particle);
    }

    character.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const mat = child.material;
        mat.emissive.setHex(0xff2200);
        mat.emissiveIntensity = 0.3 + Math.sin(burnProgress * Math.PI * 8) * 0.2;
      }
    });
  }

  return { update };
}
