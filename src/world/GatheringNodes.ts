import * as THREE from 'three';
import { TILE_HALF } from '../scene/IsoTerrain';
import { tileCenterXZ, type GridTile, type TileNavProfile } from './TilePathfinding';
import type { ItemId } from '../items/ItemTypes';

export type GatheringKind = 'mining' | 'forestry' | 'fishing';

export interface GatheringNodeDefinition {
  tile: GridTile;
  kind: GatheringKind;
}

/** Spots kept clear of the training dummy (14,14) and pathfinding pen (~17–19, 5–7). */
export const GATHERING_NODE_DEFINITIONS: readonly GatheringNodeDefinition[] = [
  { tile: { x: 3, z: 3 }, kind: 'mining' },
  { tile: { x: 3, z: 20 }, kind: 'forestry' },
  { tile: { x: 20, z: 3 }, kind: 'fishing' },
];

export const GATHERING_REWARDS: Record<GatheringKind, ItemId[]> = {
  mining: ['copper_ore', 'tin_ore', 'iron_ore'],
  forestry: ['oak_log', 'willow_log', 'maple_log'],
  fishing: ['raw_trout', 'raw_salmon', 'raw_lobster'],
};

export const GATHERING_HARVEST_TICK_INTERVAL = 5;
/** Chance per attempt to receive an item (otherwise a failed attempt message). */
export const GATHERING_SUCCESS_CHANCE = 0.58;

const USERDATA_KEY = 'gatheringNodeIndex';

/** Solid nodes: cannot stand on the tile or pass through its edges. */
const GATHERING_SOLID_NAV: TileNavProfile = {
  north: false,
  east: false,
  south: false,
  west: false,
  occupiable: false,
};

export function gatheringTileNavExceptions(): ReadonlyArray<{ tile: GridTile; profile: TileNavProfile }> {
  return GATHERING_NODE_DEFINITIONS.map((d) => ({ tile: d.tile, profile: GATHERING_SOLID_NAV }));
}

/** @deprecated Use {@link gatheringTileNavExceptions} for navigation. */
export function gatheringBlockedTiles(): GridTile[] {
  return GATHERING_NODE_DEFINITIONS.map((d) => d.tile);
}

/** Walk up parent chain from a raycast hit to find which gathering node was clicked. */
export function gatheringNodeIndexFromIntersection(hit: THREE.Intersection): number | null {
  let o: THREE.Object3D | null = hit.object;
  while (o) {
    const idx = o.userData[USERDATA_KEY];
    if (typeof idx === 'number' && idx >= 0 && idx < GATHERING_NODE_DEFINITIONS.length) return idx;
    o = o.parent;
  }
  return null;
}

function buildRockMesh(): THREE.Object3D {
  const geo = new THREE.DodecahedronGeometry(0.55, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6d6d78,
    roughness: 0.92,
    metalness: 0.15,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = 0.45;
  return mesh;
}

function buildTreeMesh(): THREE.Object3D {
  const root = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.18, 0.9, 8),
    new THREE.MeshStandardMaterial({ color: 0x5c4030, roughness: 0.88 })
  );
  trunk.position.y = 0.45;
  trunk.castShadow = true;
  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(0.72, 1.15, 10),
    new THREE.MeshStandardMaterial({ color: 0x2d6b3a, roughness: 0.82, flatShading: true })
  );
  foliage.position.y = 1.15;
  foliage.castShadow = true;
  root.add(trunk);
  root.add(foliage);
  return root;
}

function buildFishingSpotMesh(): THREE.Object3D {
  const geo = new THREE.CircleGeometry(TILE_HALF * 0.85, 28);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a6a8c,
    roughness: 0.25,
    metalness: 0.08,
    transparent: true,
    opacity: 0.88,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  mesh.receiveShadow = true;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(TILE_HALF * 0.35, TILE_HALF * 0.48, 24),
    new THREE.MeshStandardMaterial({ color: 0x8cc8e8, roughness: 0.4, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  const root = new THREE.Group();
  root.add(mesh);
  root.add(ring);
  return root;
}

function buildKindMesh(kind: GatheringKind): THREE.Object3D {
  if (kind === 'mining') return buildRockMesh();
  if (kind === 'forestry') return buildTreeMesh();
  return buildFishingSpotMesh();
}

/** Root group for raycasts; each node's meshes carry `gatheringNodeIndex`. */
export function createGatheringNodesRoot(): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < GATHERING_NODE_DEFINITIONS.length; i++) {
    const def = GATHERING_NODE_DEFINITIONS[i]!;
    const wxz = tileCenterXZ(def.tile);
    const sub = buildKindMesh(def.kind);
    sub.position.set(wxz.x, 0, wxz.z);
    sub.traverse((ch) => {
      ch.userData[USERDATA_KEY] = i;
    });
    group.add(sub);
  }
  return group;
}

export function gatheringExamineLine(nodeIndex: number): string {
  const def = GATHERING_NODE_DEFINITIONS[nodeIndex];
  if (!def) return 'Resource spot.';
  if (def.kind === 'mining') return 'Rock — you can mine ore here.';
  if (def.kind === 'forestry') return 'Tree — you can chop logs here.';
  return 'Sparkling water — you can fish here.';
}

export function pickGatheringReward(kind: GatheringKind): ItemId {
  const pool = GATHERING_REWARDS[kind];
  return pool[Math.floor(Math.random() * pool.length)]!;
}
