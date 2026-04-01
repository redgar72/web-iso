import type { TerrainPaintMode } from './terrainBrush';

export type ClientTerrainEditMsg = {
  t: 'terrainEdit';
  tx: number;
  tz: number;
  mode: TerrainPaintMode;
  textureIndex: number;
  heightStep: number;
  brushRadius: number;
};

export type ClientMsg =
  | { t: 'join'; name?: string }
  | { t: 'move'; tx: number; tz: number; goalTx: number; goalTz: number }
  | { t: 'ping'; clientTime: number }
  /** Floating damage at world position (shown to nearby peers). */
  | { t: 'hitSplat'; x: number; y: number; z: number; amount: number }
  /** In-game terrain brush stroke (authoritative persist on server, relayed to other clients). */
  | ClientTerrainEditMsg;

/** `tx,tz` = authoritative tile; `goalTx,goalTz` = click/ path destination (same as tx,tz when idle). */
export interface NetPeer {
  id: number;
  tx: number;
  tz: number;
  goalTx: number;
  goalTz: number;
  x: number;
  z: number;
}

export type ServerTerrainEditMsg = {
  t: 'terrainEdit';
  fromPlayerId: number;
  tx: number;
  tz: number;
  mode: TerrainPaintMode;
  textureIndex: number;
  heightStep: number;
  brushRadius: number;
};

export type ServerMsg =
  | { t: 'welcome'; playerId: number; tick: number }
  | { t: 'snap'; tick: number; self: NetPeer; peers: NetPeer[] }
  | { t: 'pong'; clientTime: number }
  | {
      t: 'peerHitSplat';
      playerId: number;
      x: number;
      y: number;
      z: number;
      amount: number;
    }
  /** Relayed terrain stroke from another player (apply locally; do not echo back to server). */
  | ServerTerrainEditMsg;
