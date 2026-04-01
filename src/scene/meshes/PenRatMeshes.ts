import * as THREE from 'three';
import { PEN_RAT_COUNT, PEN_RAT_SIZE } from '../PenRats';

const USERDATA_KEY = 'penRatIndex';

export function createPenRatGroup(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a3c36, roughness: 0.88 });
  const snoutMat = new THREE.MeshStandardMaterial({ color: 0x8b7070, roughness: 0.75 });

  for (let i = 0; i < PEN_RAT_COUNT; i++) {
    const rat = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(PEN_RAT_SIZE * 0.95, PEN_RAT_SIZE * 0.5, PEN_RAT_SIZE * 1.15),
      mat
    );
    body.position.y = PEN_RAT_SIZE * 0.28;
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(PEN_RAT_SIZE * 0.5, PEN_RAT_SIZE * 0.42, PEN_RAT_SIZE * 0.55),
      snoutMat
    );
    head.position.set(0, PEN_RAT_SIZE * 0.32, PEN_RAT_SIZE * 0.62);
    head.castShadow = true;
    rat.add(body);
    rat.add(head);
    rat.userData[USERDATA_KEY] = i;
    rat.traverse((ch) => {
      ch.userData[USERDATA_KEY] = i;
    });
    group.add(rat);
  }
  return group;
}

export function penRatIndexFromIntersection(hit: THREE.Intersection): number | null {
  let o: THREE.Object3D | null = hit.object;
  while (o) {
    const idx = o.userData[USERDATA_KEY];
    if (typeof idx === 'number' && idx >= 0 && idx < PEN_RAT_COUNT) return idx;
    o = o.parent;
  }
  return null;
}
