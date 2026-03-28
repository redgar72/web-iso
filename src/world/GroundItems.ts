/**
 * World pickups that show a screen-space label and go to inventory on click
 * (3D mesh raycast or label element).
 */

import * as THREE from 'three';
import type { ItemId } from '../items/ItemTypes';
import { getItemDef } from '../items/ItemTypes';

const GROUND_ITEM_USERDATA = 'groundItemId';

export interface GroundItemsOptions {
  scene: THREE.Scene;
  getCamera: () => THREE.Camera;
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  tryAddToInventory: (itemId: ItemId) => boolean;
  canInteract: () => boolean;
}

export interface GroundItemsAPI {
  spawn: (position: THREE.Vector3, itemId: ItemId) => void;
  updateLabels: () => void;
  tryPickupFromRaycast: (raycaster: THREE.Raycaster) => boolean;
}

interface GroundItemEntry {
  id: number;
  itemId: ItemId;
  mesh: THREE.Mesh;
  labelEl: HTMLDivElement;
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

  function pickupById(id: number): boolean {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return false;
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
      pickupById(id);
    });

    labelLayer.appendChild(labelEl);
    group.add(mesh);
    entries.push({ id, itemId, mesh, labelEl });
  }

  function updateLabels(): void {
    const camera = options.getCamera();
    const rect = options.canvas.getBoundingClientRect();
    const containerRect = options.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      for (const e of entries) e.labelEl.style.display = 'none';
      return;
    }

    for (const e of entries) {
      e.mesh.getWorldPosition(tmpVec);
      tmpVec.y += 0.55;
      tmpVec.project(camera);
      if (tmpVec.z < -1 || tmpVec.z > 1) {
        e.labelEl.style.display = 'none';
        continue;
      }
      const sx = rect.left + (tmpVec.x * 0.5 + 0.5) * rect.width - containerRect.left;
      const sy = rect.top + (-tmpVec.y * 0.5 + 0.5) * rect.height - containerRect.top;
      e.labelEl.style.display = 'block';
      e.labelEl.style.left = `${sx}px`;
      e.labelEl.style.top = `${sy}px`;
      e.labelEl.style.transform = 'translate(-50%, -100%)';
    }
  }

  function tryPickupFromRaycast(raycaster: THREE.Raycaster): boolean {
    if (!options.canInteract()) return false;
    const hits = raycaster.intersectObject(group, true);
    if (hits.length === 0) return false;
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj) {
      const gid = obj.userData[GROUND_ITEM_USERDATA];
      if (typeof gid === 'number') {
        return pickupById(gid);
      }
      obj = obj.parent;
    }
    return false;
  }

  return { spawn, updateLabels, tryPickupFromRaycast };
}
