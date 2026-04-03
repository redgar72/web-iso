/**
 * World pickups that show a screen-space label and go to inventory on click
 * (3D mesh raycast or label element).
 */

import * as THREE from 'three';
import type { ItemId } from '../items/ItemTypes';
import { getItemDef } from '../items/ItemTypes';
import { worldXZToTile, tileCenterXZ, type GridTile } from './TilePathfinding';

const GROUND_ITEM_USERDATA = 'groundItemId';

/** Wall-clock lifetime before a dropped item is removed from the world. */
const GROUND_ITEM_LIFETIME_MS = 60_000;

/** Extra space between stacked ground-item labels (screen px). */
const LABEL_STACK_GAP = 2;

function rectsOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
  pad: number,
): boolean {
  return !(
    a.right + pad <= b.left - pad ||
    a.left - pad >= b.right + pad ||
    a.bottom + pad <= b.top - pad ||
    a.top - pad >= b.bottom + pad
  );
}

export interface GroundItemsOptions {
  scene: THREE.Scene;
  getCamera: () => THREE.Camera;
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  tryAddToInventory: (itemId: ItemId) => boolean;
  canInteract: () => boolean;
  /** Player must share this tile with the item (ground mesh world XZ) to pick it up. */
  isPlayerOnItemTile: (itemTile: GridTile) => boolean;
  /** Called when a pickup is attempted but the player is not on the item's tile. */
  onPickupOutOfRange?: () => void;
  /** Label click / external “pick this up”: path to tile or pick up if already there. */
  requestWalkOrPickup: (itemId: number) => void;
}

export interface GroundItemRayHit {
  id: number;
  itemId: ItemId;
}

export interface GroundItemsAPI {
  spawn: (position: THREE.Vector3, itemId: ItemId) => void;
  updateLabels: () => void;
  tryPickupFromRaycast: (raycaster: THREE.Raycaster) => boolean;
  tryPickupFromIntersection: (hit: THREE.Intersection) => boolean;
  getGroup: () => THREE.Group;
  findAtRay: (raycaster: THREE.Raycaster) => GroundItemRayHit | null;
  resolveGroundItemFromIntersection: (hit: THREE.Intersection) => GroundItemRayHit | null;
  tryPickupById: (id: number) => boolean;
  /** World XZ center of the item's tile (for pathing onto the pickup tile). */
  getPickupGoalXZ: (id: number) => { x: number; z: number } | null;
  /** World XZ for each dropped item (minimap, etc.). */
  getMinimapPoints: () => { x: number; z: number }[];
}

interface GroundItemEntry {
  id: number;
  itemId: ItemId;
  mesh: THREE.Mesh;
  labelEl: HTMLDivElement;
  spawnTimeMs: number;
}

function createItemMesh(itemId: ItemId): THREE.Mesh {
  if (itemId === 'coin') {
    const geo = new THREE.CylinderGeometry(0.32, 0.32, 0.07, 20);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      emissive: 0x6a5200,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    return mesh;
  }
  const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.6 });
  return new THREE.Mesh(geo, mat);
}

export function createGroundItems(options: GroundItemsOptions): GroundItemsAPI {
  const group = new THREE.Group();
  options.scene.add(group);

  const labelLayer = document.createElement('div');
  labelLayer.style.cssText =
    'position:absolute;inset:0;z-index:2;pointer-events:none;overflow:visible;';
  options.container.appendChild(labelLayer);

  const entries: GroundItemEntry[] = [];
  let nextId = 1;
  const tmpVec = new THREE.Vector3();

  function removeEntry(entry: GroundItemEntry): void {
    group.remove(entry.mesh);
    (entry.mesh.geometry as THREE.BufferGeometry).dispose();
    (entry.mesh.material as THREE.Material).dispose();
    entry.labelEl.remove();
    const i = entries.indexOf(entry);
    if (i >= 0) entries.splice(i, 1);
  }

  function purgeExpired(nowMs: number): void {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (nowMs - entries[i].spawnTimeMs >= GROUND_ITEM_LIFETIME_MS) {
        removeEntry(entries[i]);
      }
    }
  }

  function pickupById(id: number): boolean {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return false;
    entry.mesh.getWorldPosition(tmpVec);
    const itemTile = worldXZToTile(tmpVec.x, tmpVec.z);
    if (!options.isPlayerOnItemTile(itemTile)) {
      options.onPickupOutOfRange?.();
      return false;
    }
    if (!options.tryAddToInventory(entry.itemId)) return false;
    removeEntry(entry);
    return true;
  }

  function spawn(position: THREE.Vector3, itemId: ItemId): void {
    const id = nextId++;
    const mesh = createItemMesh(itemId);
    mesh.position.copy(position);
    mesh.position.y = 0.2;
    mesh.userData[GROUND_ITEM_USERDATA] = id;

    const def = getItemDef(itemId);
    const labelEl = document.createElement('div');
    labelEl.textContent = def.label;
    labelEl.title = def.name;
    labelEl.style.cssText =
      'position:absolute;pointer-events:auto;padding:2px 8px;font:11px sans-serif;' +
      'color:#f5f0dc;background:rgba(20,18,28,0.88);border:1px solid rgba(212,175,55,0.55);' +
      'border-radius:4px;cursor:pointer;white-space:nowrap;user-select:none;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.45);';
    labelEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!options.canInteract()) return;
      e.preventDefault();
      e.stopPropagation();
      options.requestWalkOrPickup(id);
    });

    labelLayer.appendChild(labelEl);
    group.add(mesh);
    entries.push({ id, itemId, mesh, labelEl, spawnTimeMs: performance.now() });
  }

  function updateLabels(): void {
    purgeExpired(performance.now());
    const camera = options.getCamera();
    const rect = options.canvas.getBoundingClientRect();
    const containerRect = options.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      for (const e of entries) e.labelEl.style.display = 'none';
      return;
    }

    type Visible = {
      entry: GroundItemEntry;
      sx: number;
      baseSy: number;
      w: number;
      h: number;
    };

    const visible: Visible[] = [];

    for (const e of entries) {
      e.mesh.getWorldPosition(tmpVec);
      tmpVec.y += 0.55;
      tmpVec.project(camera);
      if (tmpVec.z < -1 || tmpVec.z > 1) {
        e.labelEl.style.display = 'none';
        continue;
      }
      const sx = rect.left + (tmpVec.x * 0.5 + 0.5) * rect.width - containerRect.left;
      const baseSy = rect.top + (-tmpVec.y * 0.5 + 0.5) * rect.height - containerRect.top;
      e.labelEl.style.display = 'block';
      e.labelEl.style.left = `${sx}px`;
      e.labelEl.style.top = `${baseSy}px`;
      e.labelEl.style.transform = 'translate(-50%, -100%)';
      const br = e.labelEl.getBoundingClientRect();
      visible.push({
        entry: e,
        sx,
        baseSy,
        w: br.width,
        h: br.height,
      });
    }

    if (visible.length === 0) return;

    // Lower on screen (larger baseSy) keeps anchor; others stack upward (smaller sy).
    visible.sort((a, b) => b.baseSy - a.baseSy || a.entry.id - b.entry.id);

    const pad = LABEL_STACK_GAP;
    const placed: { left: number; right: number; top: number; bottom: number }[] = [];

    for (const v of visible) {
      let sy = v.baseSy;
      const half = v.w * 0.5;
      for (let guard = 0; ; guard++) {
        const my = {
          left: v.sx - half,
          right: v.sx + half,
          top: sy - v.h,
          bottom: sy,
        };
        let hit = false;
        for (const p of placed) {
          if (rectsOverlap(my, p, pad)) {
            hit = true;
            break;
          }
        }
        if (!hit || guard >= 4000) {
          placed.push(my);
          v.entry.labelEl.style.top = `${sy}px`;
          break;
        }
        sy -= 1;
      }
    }
  }

  function tryPickupFromRaycast(raycaster: THREE.Raycaster): boolean {
    if (!options.canInteract()) return false;
    const hit = findAtRay(raycaster);
    if (!hit) return false;
    return pickupById(hit.id);
  }

  function resolveGroundItemFromIntersection(hit: THREE.Intersection): GroundItemRayHit | null {
    let obj: THREE.Object3D | null = hit.object;
    while (obj) {
      const gid = obj.userData[GROUND_ITEM_USERDATA];
      if (typeof gid === 'number') {
        const entry = entries.find((e) => e.id === gid);
        if (!entry) return null;
        return { id: entry.id, itemId: entry.itemId };
      }
      obj = obj.parent;
    }
    return null;
  }

  function tryPickupFromIntersection(hit: THREE.Intersection): boolean {
    if (!options.canInteract()) return false;
    const g = resolveGroundItemFromIntersection(hit);
    if (!g) return false;
    return pickupById(g.id);
  }

  function findAtRay(raycaster: THREE.Raycaster): GroundItemRayHit | null {
    const hits = raycaster.intersectObject(group, true);
    if (hits.length === 0) return null;
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj) {
      const gid = obj.userData[GROUND_ITEM_USERDATA];
      if (typeof gid === 'number') {
        const entry = entries.find((e) => e.id === gid);
        if (!entry) return null;
        return { id: entry.id, itemId: entry.itemId };
      }
      obj = obj.parent;
    }
    return null;
  }

  function tryPickupById(id: number): boolean {
    if (!options.canInteract()) return false;
    return pickupById(id);
  }

  function getPickupGoalXZ(id: number): { x: number; z: number } | null {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return null;
    entry.mesh.getWorldPosition(tmpVec);
    const tile = worldXZToTile(tmpVec.x, tmpVec.z);
    return tileCenterXZ(tile);
  }

  function getMinimapPoints(): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (const e of entries) {
      e.mesh.getWorldPosition(tmpVec);
      out.push({ x: tmpVec.x, z: tmpVec.z });
    }
    return out;
  }

  return {
    spawn,
    updateLabels,
    tryPickupFromRaycast,
    tryPickupFromIntersection,
    getGroup: () => group,
    findAtRay,
    resolveGroundItemFromIntersection,
    tryPickupById,
    getPickupGoalXZ,
    getMinimapPoints,
  };
}
