import type { Infer } from 'spacetimedb';
import * as THREE from 'three';
import { getServerNpcTemplate } from '../../shared/serverNpcTemplates';
import type { DbConnection } from '../net/stdb';
import NpcSpawnerTbl from '../net/stdb/npc_spawner_table';
import ServerNpcTbl from '../net/stdb/server_npc_table';
import { BEAR_SIZE, SPIDER_SIZE } from './StartingAreaWildlife';
import { OSRS_TICK_SECONDS } from '../../shared/tick';
import { tileCenterXZ } from '../world/TilePathfinding';
import {
  wildlifeKindFromTemplateKey,
  createWildlifeMobGroupForTemplate,
  NPC_SPAWNER_KEY,
  SERVER_NPC_ENTITY_KEY,
} from './meshes/StartingWildlifeMeshes';

type ServerNpcRow = Infer<typeof ServerNpcTbl>;
type NpcSpawnerRow = Infer<typeof NpcSpawnerTbl>;

function asU64(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  return BigInt(Math.floor(Number(v)));
}

export interface ServerWildlifeCombatRow {
  entityId: bigint;
  templateKey: string;
  position: THREE.Vector3;
  alive: boolean;
  attackable: boolean;
  hitRadius: number;
  /** Ground Y offset for mob mesh (half height). */
  meshBaseY: number;
  biteDamage: number;
  biteIntervalTicks: number;
  aggroTiles: number;
}

interface InterpState {
  visFrom: THREE.Vector3;
  visTo: THREE.Vector3;
  lastTile: { x: number; z: number };
  /** Interpolation 0→1 uses {@link refreshFromConnection} gameTime elapsed since last replicated tile. */
  stepStartGameTime: number;
  lurchStartGameTime: number;
}

export interface ServerWildlifeRuntimeApi {
  liveRoot: THREE.Group;
  spawnerGhostRoot: THREE.Group;
  /**
   * Sync meshes + interpolation targets from DB. Pass the same `gameTime` as
   * {@link updateVisuals} so motion interpolates over one OSRS server-tick duration without
   * snapping when the local game tick clock rolls over.
   */
  refreshFromConnection(conn: DbConnection, gameTime: number): void;
  /** @param _tickAlpha unused for server wildlife positions (kept for call-site compatibility). */
  updateVisuals(_tickAlpha: number, terrainEditorOpen: boolean, gameTime: number): void;
  getCombatRows(gameTime: number): ServerWildlifeCombatRow[];
  /** Stable sorted entity ids (matches combat row index). */
  getSortedEntityIds(): bigint[];
  /** Last replicated spawner rows (after {@link refreshFromConnection}). */
  getSpawnerRows(): NpcSpawnerRow[];
  getTemplateKey(entityId: bigint): string | undefined;
  getLogicalTile(entityId: bigint): { x: number; z: number } | undefined;
  setGroundSampler(fn: (wx: number, wz: number) => number): void;
  noteBiteLurch(entityId: bigint, gameTime: number): void;
}

export function createServerWildlifeRuntime(): ServerWildlifeRuntimeApi {
  const liveRoot = new THREE.Group();
  const spawnerGhostRoot = new THREE.Group();
  liveRoot.name = 'serverWildlifeLive';
  spawnerGhostRoot.name = 'serverWildlifeSpawnerGhosts';

  const npcMeshes = new Map<string, THREE.Group>();
  const interp = new Map<string, InterpState>();
  const rowByEntityId = new Map<string, ServerNpcRow>();
  const templateByEntityId = new Map<string, string>();

  const spawnerMeshes = new Map<string, THREE.Group>();
  let lastSpawnerRows: NpcSpawnerRow[] = [];

  let sampleGround: (wx: number, wz: number) => number = () => 0;

  function meshYForTemplate(templateKey: string, wx: number, wz: number): number {
    const kind = wildlifeKindFromTemplateKey(templateKey);
    const half = kind === 'bear' ? BEAR_SIZE / 2 : SPIDER_SIZE / 2;
    return sampleGround(wx, wz) + half;
  }

  function tileCoord(v: unknown): number {
    return typeof v === 'bigint' ? Number(v) : Math.floor(Number(v));
  }

  function tilesEqual(a: { x: number; z: number }, tx: number, tz: number): boolean {
    return a.x === tx && a.z === tz;
  }

  function ensureInterp(idStr: string, txRaw: unknown, tzRaw: unknown, tpl: string, gameTime: number): InterpState {
    const tx = tileCoord(txRaw);
    const tz = tileCoord(tzRaw);
    let s = interp.get(idStr);
    const c = tileCenterXZ({ x: tx, z: tz });
    const y = meshYForTemplate(tpl, c.x, c.z);
    if (!s) {
      s = {
        visFrom: new THREE.Vector3(c.x, y, c.z),
        visTo: new THREE.Vector3(c.x, y, c.z),
        lastTile: { x: tx, z: tz },
        stepStartGameTime: gameTime,
        lurchStartGameTime: -1,
      };
      interp.set(idStr, s);
      return s;
    }
    if (!tilesEqual(s.lastTile, tx, tz)) {
      const mesh = npcMeshes.get(idStr);
      if (mesh) s.visFrom.copy(mesh.position);
      else {
        const a = THREE.MathUtils.clamp((gameTime - s.stepStartGameTime) / OSRS_TICK_SECONDS, 0, 1);
        s.visFrom.lerpVectors(s.visFrom, s.visTo, a);
      }
      s.visTo.set(c.x, y, c.z);
      s.lastTile = { x: tx, z: tz };
      s.stepStartGameTime = gameTime;
    }
    s.visTo.y = y;
    return s;
  }

  function syncSpawnerGhosts(conn: DbConnection): void {
    const rows = [...conn.db.npcSpawner.iter()].sort((a, b) => (asU64(a.id) < asU64(b.id) ? -1 : 1));
    lastSpawnerRows = rows;
    const seen = new Set<string>();
    for (const row of rows) {
      const sid = asU64(row.id);
      const idStr = sid.toString();
      seen.add(idStr);
      let mesh = spawnerMeshes.get(idStr);
      const tpl = String(row.templateKey);
      if (!mesh) {
        mesh = createWildlifeMobGroupForTemplate(tpl);
        mesh.userData[NPC_SPAWNER_KEY] = sid;
        mesh.traverse((ch) => {
          ch.userData[NPC_SPAWNER_KEY] = sid;
        });
        spawnerGhostRoot.add(mesh);
        spawnerMeshes.set(idStr, mesh);
      }
      const t = tileCenterXZ({ x: row.tx as number, z: row.tz as number });
      const y = meshYForTemplate(tpl, t.x, t.z);
      mesh.position.set(t.x, y, t.z);
    }
    for (const [idStr, mesh] of spawnerMeshes) {
      if (!seen.has(idStr)) {
        spawnerGhostRoot.remove(mesh);
        spawnerMeshes.delete(idStr);
      }
    }
  }

  function refreshFromConnection(conn: DbConnection, gameTime: number): void {
    const rows = [...conn.db.serverNpc.iter()].sort((a, b) => (asU64(a.id) < asU64(b.id) ? -1 : 1));
    const seen = new Set<string>();
    rowByEntityId.clear();
    templateByEntityId.clear();

    for (const row of rows) {
      const eid = asU64(row.id);
      const idStr = eid.toString();
      seen.add(idStr);
      rowByEntityId.set(idStr, row);
      const tpl = String(row.templateKey);
      templateByEntityId.set(idStr, tpl);

      let mesh = npcMeshes.get(idStr);
      if (!mesh) {
        mesh = createWildlifeMobGroupForTemplate(tpl);
        mesh.userData[SERVER_NPC_ENTITY_KEY] = eid;
        mesh.traverse((ch) => {
          ch.userData[SERVER_NPC_ENTITY_KEY] = eid;
        });
        liveRoot.add(mesh);
        npcMeshes.set(idStr, mesh);
        const tx = tileCoord(row.tx);
        const tz = tileCoord(row.tz);
        const t = tileCenterXZ({ x: tx, z: tz });
        const y = meshYForTemplate(tpl, t.x, t.z);
        interp.set(idStr, {
          visFrom: new THREE.Vector3(t.x, y, t.z),
          visTo: new THREE.Vector3(t.x, y, t.z),
          lastTile: { x: tx, z: tz },
          stepStartGameTime: gameTime,
          lurchStartGameTime: -1,
        });
      }
      ensureInterp(idStr, row.tx, row.tz, tpl, gameTime);
    }

    for (const [idStr, mesh] of npcMeshes) {
      if (!seen.has(idStr)) {
        liveRoot.remove(mesh);
        npcMeshes.delete(idStr);
        interp.delete(idStr);
      }
    }

    syncSpawnerGhosts(conn);
  }

  function updateVisuals(_tickAlpha: number, terrainEditorOpen: boolean, gameTime: number): void {
    const hideLive = terrainEditorOpen;
    liveRoot.visible = !hideLive;
    spawnerGhostRoot.visible = terrainEditorOpen;

    if (hideLive) return;

    const lurchDur = 0.26;
    const lurchMag = 0.4;
    const hopY = 0.07;

    for (const [idStr, mesh] of npcMeshes) {
      const s = interp.get(idStr);
      if (!s) continue;
      const a = THREE.MathUtils.clamp((gameTime - s.stepStartGameTime) / OSRS_TICK_SECONDS, 0, 1);
      let lx = THREE.MathUtils.lerp(s.visFrom.x, s.visTo.x, a);
      let ly = THREE.MathUtils.lerp(s.visFrom.y, s.visTo.y, a);
      let lz = THREE.MathUtils.lerp(s.visFrom.z, s.visTo.z, a);

      if (s.lurchStartGameTime >= 0) {
        const u = (gameTime - s.lurchStartGameTime) / lurchDur;
        if (u >= 1) s.lurchStartGameTime = -1;
        else {
          const k = Math.sin(u * Math.PI);
          lx += (s.visTo.x - s.visFrom.x) * lurchMag * k * 0.15;
          lz += (s.visTo.z - s.visFrom.z) * lurchMag * k * 0.15;
          ly += hopY * k;
        }
      }

      mesh.position.set(lx, ly, lz);
    }
  }

  function getCombatRows(gameTime: number): ServerWildlifeCombatRow[] {
    const out: ServerWildlifeCombatRow[] = [];
    const ids = sortedEntityIds();
    for (const eid of ids) {
      const idStr = eid.toString();
      const row = rowByEntityId.get(idStr);
      if (!row) continue;
      const tpl = String(row.templateKey);
      const s = interp.get(idStr);
      const t = tileCenterXZ({ x: tileCoord(row.tx), z: tileCoord(row.tz) });
      const a = s
        ? THREE.MathUtils.clamp((gameTime - s.stepStartGameTime) / OSRS_TICK_SECONDS, 0, 1)
        : 0;
      const pos = s
        ? new THREE.Vector3().lerpVectors(s.visFrom, s.visTo, a)
        : new THREE.Vector3(t.x, meshYForTemplate(tpl, t.x, t.z), t.z);
      const tmpl = getServerNpcTemplate(tpl);
      out.push({
        entityId: eid,
        templateKey: tpl,
        position: pos,
        alive: true,
        attackable: true,
        hitRadius: tmpl.collisionRadius,
        meshBaseY: wildlifeKindFromTemplateKey(tpl) === 'bear' ? BEAR_SIZE / 2 : SPIDER_SIZE / 2,
        biteDamage: row.biteDamage as number,
        biteIntervalTicks: tmpl.biteIntervalTicks,
        aggroTiles: tmpl.aggroTiles,
      });
    }
    return out;
  }

  function sortedEntityIds(): bigint[] {
    return [...rowByEntityId.keys()].map((k) => BigInt(k)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  function getSortedEntityIds(): bigint[] {
    return sortedEntityIds();
  }

  return {
    liveRoot,
    spawnerGhostRoot,
    refreshFromConnection,
    updateVisuals,
    getCombatRows,
    getSortedEntityIds,
    getSpawnerRows: () => lastSpawnerRows.slice(),
    getTemplateKey: (entityId: bigint) => templateByEntityId.get(entityId.toString()),
    getLogicalTile: (entityId: bigint) => {
      const row = rowByEntityId.get(entityId.toString());
      if (!row) return undefined;
      return { x: row.tx as number, z: row.tz as number };
    },
    setGroundSampler(fn: (wx: number, wz: number) => number): void {
      sampleGround = fn;
    },
    noteBiteLurch(entityId: bigint, gameTime: number): void {
      const s = interp.get(entityId.toString());
      if (s) s.lurchStartGameTime = gameTime;
    },
  };
}
