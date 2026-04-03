import * as THREE from 'three';
import {
  STARTING_SPIDER_COUNT,
  STARTING_BEAR_COUNT,
  STARTING_WILDLIFE_COUNT,
  SPIDER_SIZE,
  BEAR_SIZE,
  type StartingWildlifeKind,
} from '../StartingAreaWildlife';

const USERDATA_KEY = 'startingWildlifeIndex';

/** Pick server-driven wildlife hits (see {@link serverWildlifeEntityFromIntersection}). */
export const SERVER_NPC_ENTITY_KEY = 'serverNpcEntityId';
/** Pick NPC spawner preview meshes in terrain edit mode. */
export const NPC_SPAWNER_KEY = 'npcSpawnerId';

export function wildlifeKindFromTemplateKey(key: string): StartingWildlifeKind {
  return key === 'bear' ? 'bear' : 'spider';
}

/** One mob mesh for dynamic / replicated NPCs (not wired to legacy slot index userdata). */
export function createWildlifeMobGroupForTemplate(templateKey: string): THREE.Group {
  const kind = wildlifeKindFromTemplateKey(templateKey);
  if (kind === 'spider') {
    const spiderMat = new THREE.MeshStandardMaterial({ color: 0x262018, roughness: 0.92 });
    const spiderEyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a06, roughness: 0.4 });
    const spider = new THREE.Group();
    const s = SPIDER_SIZE;
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 8, 6), spiderMat);
    abdomen.scale.set(1, 0.6, 1.2);
    abdomen.position.y = s * 0.32;
    abdomen.castShadow = true;
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(s * 0.28, 6, 5), spiderMat);
    thorax.position.set(0, s * 0.38, s * 0.42);
    thorax.castShadow = true;
    for (let leg = 0; leg < 4; leg++) {
      const side = leg < 2 ? -1 : 1;
      const zOff = -0.2 + (leg % 2) * 0.45;
      const legM = new THREE.Mesh(
        new THREE.CylinderGeometry(s * 0.04, s * 0.04, s * 0.85, 4),
        spiderMat
      );
      legM.rotation.z = side * (Math.PI / 2.3);
      legM.rotation.z += side * zOff * 0.08;
      legM.position.set(side * s * 0.42, s * 0.12, zOff * s);
      legM.castShadow = true;
      spider.add(legM);
    }
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(s * 0.08, s * 0.06, s * 0.06), spiderEyeMat);
    eyeL.position.set(-s * 0.1, s * 0.42, s * 0.58);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(s * 0.08, s * 0.06, s * 0.06), spiderEyeMat);
    eyeR.position.set(s * 0.1, s * 0.42, s * 0.58);
    spider.add(abdomen, thorax, eyeL, eyeR);
    return spider;
  }
  const bearMat = new THREE.MeshStandardMaterial({ color: 0x4d3828, roughness: 0.88 });
  const bearSnoutMat = new THREE.MeshStandardMaterial({ color: 0x3e2a1f, roughness: 0.82 });
  const z = BEAR_SIZE;
  const bear = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(z * 1.05, z * 0.62, z * 0.72), bearMat);
  body.position.y = z * 0.38;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(z * 0.52, z * 0.42, z * 0.48), bearSnoutMat);
  head.position.set(0, z * 0.52, z * 0.52);
  head.castShadow = true;
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(z * 0.35, z * 0.22, z * 0.28), bearSnoutMat);
  muzzle.position.set(0, z * 0.46, z * 0.78);
  muzzle.castShadow = true;
  const earL = new THREE.Mesh(new THREE.BoxGeometry(z * 0.12, z * 0.14, z * 0.1), bearMat);
  earL.position.set(-z * 0.28, z * 0.66, z * 0.38);
  const earR = new THREE.Mesh(new THREE.BoxGeometry(z * 0.12, z * 0.14, z * 0.1), bearMat);
  earR.position.set(z * 0.28, z * 0.66, z * 0.38);
  bear.add(body, head, muzzle, earL, earR);
  return bear;
}

export function serverWildlifeEntityFromIntersection(hit: THREE.Intersection): bigint | null {
  let o: THREE.Object3D | null = hit.object;
  while (o) {
    const raw = o.userData[SERVER_NPC_ENTITY_KEY];
    if (raw !== undefined && raw !== null) {
      if (typeof raw === 'bigint') return raw;
      try {
        return BigInt(String(raw));
      } catch {
        return null;
      }
    }
    o = o.parent;
  }
  return null;
}

export function npcSpawnerIdFromIntersection(hit: THREE.Intersection): bigint | null {
  let o: THREE.Object3D | null = hit.object;
  while (o) {
    const raw = o.userData[NPC_SPAWNER_KEY];
    if (raw !== undefined && raw !== null) {
      if (typeof raw === 'bigint') return raw;
      try {
        return BigInt(String(raw));
      } catch {
        return null;
      }
    }
    o = o.parent;
  }
  return null;
}

export function createStartingWildlifeGroup(): THREE.Group {
  const group = new THREE.Group();
  const spiderMat = new THREE.MeshStandardMaterial({ color: 0x262018, roughness: 0.92 });
  const spiderEyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a06, roughness: 0.4 });

  for (let i = 0; i < STARTING_SPIDER_COUNT; i++) {
    const spider = new THREE.Group();
    const s = SPIDER_SIZE;
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 8, 6), spiderMat);
    abdomen.scale.set(1, 0.6, 1.2);
    abdomen.position.y = s * 0.32;
    abdomen.castShadow = true;
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(s * 0.28, 6, 5), spiderMat);
    thorax.position.set(0, s * 0.38, s * 0.42);
    thorax.castShadow = true;
    for (let leg = 0; leg < 4; leg++) {
      const side = leg < 2 ? -1 : 1;
      const zOff = -0.2 + (leg % 2) * 0.45;
      const legM = new THREE.Mesh(
        new THREE.CylinderGeometry(s * 0.04, s * 0.04, s * 0.85, 4),
        spiderMat
      );
      legM.rotation.z = side * (Math.PI / 2.3);
      legM.rotation.z += side * zOff * 0.08;
      legM.position.set(side * s * 0.42, s * 0.12, zOff * s);
      legM.castShadow = true;
      spider.add(legM);
    }
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(s * 0.08, s * 0.06, s * 0.06), spiderEyeMat);
    eyeL.position.set(-s * 0.1, s * 0.42, s * 0.58);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(s * 0.08, s * 0.06, s * 0.06), spiderEyeMat);
    eyeR.position.set(s * 0.1, s * 0.42, s * 0.58);
    spider.add(abdomen, thorax, eyeL, eyeR);
    spider.userData[USERDATA_KEY] = i;
    spider.traverse((ch) => {
      ch.userData[USERDATA_KEY] = i;
    });
    group.add(spider);
  }

  const bearMat = new THREE.MeshStandardMaterial({ color: 0x4d3828, roughness: 0.88 });
  const bearSnoutMat = new THREE.MeshStandardMaterial({ color: 0x3e2a1f, roughness: 0.82 });

  for (let b = 0; b < STARTING_BEAR_COUNT; b++) {
    const idx = STARTING_SPIDER_COUNT + b;
    const bear = new THREE.Group();
    const z = BEAR_SIZE;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(z * 1.05, z * 0.62, z * 0.72),
      bearMat
    );
    body.position.y = z * 0.38;
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(z * 0.52, z * 0.42, z * 0.48),
      bearSnoutMat
    );
    head.position.set(0, z * 0.52, z * 0.52);
    head.castShadow = true;
    const muzzle = new THREE.Mesh(
      new THREE.BoxGeometry(z * 0.35, z * 0.22, z * 0.28),
      bearSnoutMat
    );
    muzzle.position.set(0, z * 0.46, z * 0.78);
    muzzle.castShadow = true;
    const earL = new THREE.Mesh(new THREE.BoxGeometry(z * 0.12, z * 0.14, z * 0.1), bearMat);
    earL.position.set(-z * 0.28, z * 0.66, z * 0.38);
    const earR = new THREE.Mesh(new THREE.BoxGeometry(z * 0.12, z * 0.14, z * 0.1), bearMat);
    earR.position.set(z * 0.28, z * 0.66, z * 0.38);
    bear.add(body, head, muzzle, earL, earR);
    bear.userData[USERDATA_KEY] = idx;
    bear.traverse((ch) => {
      ch.userData[USERDATA_KEY] = idx;
    });
    group.add(bear);
  }

  return group;
}

export function startingWildlifeIndexFromIntersection(hit: THREE.Intersection): number | null {
  let o: THREE.Object3D | null = hit.object;
  while (o) {
    const idx = o.userData[USERDATA_KEY];
    if (typeof idx === 'number' && idx >= 0 && idx < STARTING_WILDLIFE_COUNT) return idx;
    o = o.parent;
  }
  return null;
}
