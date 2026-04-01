import * as THREE from 'three';
import type { NetPeer } from '../../shared/protocol';
import { CHARACTER_MOVE_SPEED } from '../config/Constants';
import { tileCenterXZ } from '../../shared/world';

const REMOTE_COLORS = [0x6eb5ff, 0xff8c6b, 0x9bffa8, 0xe0b0ff, 0xffe08a];

const STAND_PULL_PER_SECOND = 14;

type Entry = {
  mesh: THREE.Mesh;
  authTx: number;
  authTz: number;
  goalTx: number;
  goalTz: number;
};

/**
 * Remote players: chase `goal` at {@link CHARACTER_MOVE_SPEED} using latest auth tile as a floor along the segment to goal.
 */
export function createRemotePlayers(): {
  group: THREE.Group;
  ingestSnap(peers: NetPeer[]): void;
  updateInterpolation(dt: number): void;
  dispose(): void;
  getMinimapPositions(): { x: number; z: number }[];
} {
  const group = new THREE.Group();
  const geom = new THREE.BoxGeometry(0.7, 1.2, 0.7);
  const pool: THREE.Mesh[] = [];
  const freeMeshes: THREE.Mesh[] = [];

  for (let i = 0; i < 20; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: REMOTE_COLORS[i % REMOTE_COLORS.length],
      roughness: 0.7,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.visible = false;
    mesh.position.y = 0.6;
    pool.push(mesh);
    freeMeshes.push(mesh);
    group.add(mesh);
  }

  const active = new Map<number, Entry>();

  function takeMesh(): THREE.Mesh {
    const m = freeMeshes.pop();
    if (!m) {
      return pool[0]!;
    }
    m.visible = true;
    return m;
  }

  function releaseMesh(m: THREE.Mesh): void {
    m.visible = false;
    freeMeshes.push(m);
  }

  function ingestSnap(peers: NetPeer[]): void {
    const seen = new Set<number>();
    const y = 0.6;

    for (const p of peers) {
      seen.add(p.id);
      let e = active.get(p.id);
      if (!e) {
        const mesh = takeMesh();
        mesh.position.set(p.x, y, p.z);
        e = {
          mesh,
          authTx: p.tx,
          authTz: p.tz,
          goalTx: p.goalTx,
          goalTz: p.goalTz,
        };
        active.set(p.id, e);
      } else {
        e.authTx = p.tx;
        e.authTz = p.tz;
        e.goalTx = p.goalTx;
        e.goalTz = p.goalTz;
      }
    }

    for (const [id, e] of [...active]) {
      if (seen.has(id)) continue;
      active.delete(id);
      releaseMesh(e.mesh);
    }
  }

  function updateInterpolation(dt: number): void {
    const y = 0.6;
    for (const e of active.values()) {
      const mesh = e.mesh;
      const auth = tileCenterXZ(e.authTx, e.authTz);
      const goal = tileCenterXZ(e.goalTx, e.goalTz);
      let px = mesh.position.x;
      let pz = mesh.position.z;

      if (e.authTx === e.goalTx && e.authTz === e.goalTz) {
        const k = 1 - Math.exp(-STAND_PULL_PER_SECOND * dt);
        px += (auth.x - px) * k;
        pz += (auth.z - pz) * k;
      } else {
        const gdx = goal.x - px;
        const gdz = goal.z - pz;
        const gdist = Math.hypot(gdx, gdz);
        if (gdist > 1e-4) {
          const step = CHARACTER_MOVE_SPEED * dt;
          const m = Math.min(1, step / gdist);
          px += gdx * m;
          pz += gdz * m;
        }

        const adx = goal.x - auth.x;
        const adz = goal.z - auth.z;
        const alen2 = adx * adx + adz * adz;
        if (alen2 > 1e-6) {
          const mx = px - auth.x;
          const mz = pz - auth.z;
          const proj = (mx * adx + mz * adz) / alen2;
          if (proj < 0) {
            px = auth.x;
            pz = auth.z;
          }
        }
      }

      mesh.position.set(px, y, pz);
    }
  }

  function dispose(): void {
    geom.dispose();
    for (const m of pool) {
      (m.material as THREE.Material).dispose();
    }
  }

  function getMinimapPositions(): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (const e of active.values()) {
      if (!e.mesh.visible) continue;
      out.push({ x: e.mesh.position.x, z: e.mesh.position.z });
    }
    return out;
  }

  return { group, ingestSnap, updateInterpolation, dispose, getMinimapPositions };
}
