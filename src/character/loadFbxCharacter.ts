import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export interface FbxCharacterOptions {
  /** URL to the .fbx file (e.g. '/models/character.fbx') */
  url: string;
  /** Scale applied to the model (FBX units often differ from scene) */
  scale?: number;
  /** Position in world space [x, y, z] */
  position?: [number, number, number];
  /** Enable shadow casting/receiving on meshes */
  shadows?: boolean;
}

type ObjectWithAnimations = THREE.Object3D & { animations?: THREE.AnimationClip[] };

/** Collect animation clip names from the root and any descendant (FBXLoader may attach to root or a child). */
function getAnimationNamesFromGroup(group: THREE.Object3D): string[] {
  const seen = new Set<string>();
  group.traverse((obj: THREE.Object3D) => {
    const clips = (obj as ObjectWithAnimations).animations;
    if (clips?.length) {
      clips.forEach((c: THREE.AnimationClip) => seen.add(c.name));
    }
  });
  return Array.from(seen);
}

/**
 * Loads a character from an FBX file and returns a Group ready to add to the scene.
 * On failure, returns a simple placeholder mesh so the game still runs.
 */
export function loadFbxCharacter(
  options: FbxCharacterOptions
): Promise<THREE.Group> {
  const {
    url,
    scale = 1,
    position = [0, 0, 0],
    shadows = true,
  } = options;

  const loader = new FBXLoader();

  return new Promise((resolve) => {
    loader.load(
      url,
      (group: THREE.Group) => {
        group.scale.setScalar(scale);
        // Put feet on the ground: FBX origin may be at center or base
        const box = new THREE.Box3().setFromObject(group);
        const minY = box.min.y;
        group.position.set(position[0], position[1] - minY * scale, position[2]);
        group.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            if (shadows) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          }
        });
        const names = getAnimationNamesFromGroup(group);
        group.userData.animationNames = names;
        if (names.length) console.log('FBX animations:', names);
        else console.log('FBX animations: (none) — this FBX may have no animation data, or animations may be in a separate file.');
        resolve(group);
      },
      undefined,
      () => {
        console.warn(`FBX load failed: ${url}, using placeholder`);
        resolve(createPlaceholderCharacter(position));
      }
    );
  });
}

/** Creates a capsule placeholder character (no FBX). Use this to move on with gameplay. */
export function createPlaceholderCharacter(
  position: [number, number, number] = [0, 0, 0]
): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 0.6, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x4488aa })
  );
  body.position.y = 0.6;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  group.position.set(...position);
  group.userData.animationNames = [];
  return group;
}
