import * as THREE from 'three';
import { TILE_HALF } from '../scene/IsoTerrain';
import { tileCenterXZ, type GridTile, type TileNavProfile } from './TilePathfinding';
import type { NpcId } from '../npc/NpcIds';
import { NPC_IDS } from '../npc/NpcIds';

const USERDATA_KEY = 'friendlyNpcIndex';

/** Solid tile under the NPC (stand beside to talk, like gathering nodes). */
const FRIENDLY_NPC_SOLID_NAV: TileNavProfile = {
  north: false,
  east: false,
  south: false,
  west: false,
  occupiable: false,
};

export interface FriendlyNpcDefinition {
  npcId: NpcId;
  tile: GridTile;
  /** Tint for the simple placeholder mesh */
  color: number;
}

/**
 * Static non-combat NPCs. Add rows here and matching dialog in `npc/dialogTrees.ts`.
 * Tiles chosen to avoid training dummy (14,14), gathering nodes, and pathfinding pen.
 */
export const FRIENDLY_NPC_DEFINITIONS: readonly FriendlyNpcDefinition[] = [
  { npcId: NPC_IDS.mentor_elara, tile: { x: 11, z: 14 }, color: 0xc8a882 },
  { npcId: NPC_IDS.barnaby, tile: { x: 8, z: 18 }, color: 0x6b8c9e },
];

export function friendlyNpcTileNavExceptions(): ReadonlyArray<{ tile: GridTile; profile: TileNavProfile }> {
  return FRIENDLY_NPC_DEFINITIONS.map((d) => ({ tile: d.tile, profile: FRIENDLY_NPC_SOLID_NAV }));
}

export function friendlyNpcIndexFromIntersection(hit: THREE.Intersection): number | null {
  let o: THREE.Object3D | null = hit.object;
  while (o) {
    const idx = o.userData[USERDATA_KEY];
    if (typeof idx === 'number' && idx >= 0 && idx < FRIENDLY_NPC_DEFINITIONS.length) return idx;
    o = o.parent;
  }
  return null;
}

function buildPlaceholderVillager(color: number): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 0.72, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.06 })
  );
  body.position.y = 0.36;
  body.castShadow = true;
  body.receiveShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8d4c4, roughness: 0.85 })
  );
  head.position.y = 0.86;
  head.castShadow = true;
  root.add(body);
  root.add(head);
  return root;
}

/** Root group for raycasts; meshes carry `friendlyNpcIndex` in userData. */
export function createFriendlyNpcsRoot(): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < FRIENDLY_NPC_DEFINITIONS.length; i++) {
    const def = FRIENDLY_NPC_DEFINITIONS[i]!;
    const wxz = tileCenterXZ(def.tile);
    const sub = buildPlaceholderVillager(def.color);
    sub.position.set(wxz.x, 0, wxz.z);
    sub.traverse((ch) => {
      ch.userData[USERDATA_KEY] = i;
    });
    group.add(sub);
  }
  return group;
}

export function friendlyNpcExamineLine(index: number): string {
  const def = FRIENDLY_NPC_DEFINITIONS[index];
  if (!def) return 'Someone standing about.';
  if (def.npcId === NPC_IDS.mentor_elara) {
    return 'Elara — looks like a veteran trainer, watching the practice dummy.';
  }
  return 'Barnaby — relaxed posture, smells faintly of river water.';
}

/** Ground-hit radius for click / context menu when the ray hits terrain behind the NPC. */
export function friendlyNpcClickExtraRadius(): number {
  return TILE_HALF * 0.95;
}
