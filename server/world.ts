import type { WebSocket } from 'ws';
import type { NetPeer, ServerMsg } from '../shared/protocol';
import {
  AOI_MAX_TILE_RADIUS,
  MAX_VISIBLE_PEERS,
  chebyshevTileDist,
  clampTile,
  tileCenterXZ,
} from '../shared/world';

let nextPlayerId = 1;

export interface ServerPlayer {
  id: number;
  socket: WebSocket;
  tx: number;
  tz: number;
  goalTx: number;
  goalTz: number;
}

function peerDto(p: ServerPlayer): NetPeer {
  const { x, z } = tileCenterXZ(p.tx, p.tz);
  return {
    id: p.id,
    tx: p.tx,
    tz: p.tz,
    goalTx: p.goalTx,
    goalTz: p.goalTz,
    x,
    z,
  };
}

function visiblePeersFor(viewer: ServerPlayer, everyone: ServerPlayer[]): NetPeer[] {
  const candidates: ServerPlayer[] = [];
  for (const o of everyone) {
    if (o.id === viewer.id) continue;
    if (chebyshevTileDist(viewer, o) > AOI_MAX_TILE_RADIUS) continue;
    candidates.push(o);
  }
  candidates.sort(
    (a, b) =>
      chebyshevTileDist(viewer, a) - chebyshevTileDist(viewer, b) || a.id - b.id
  );
  const top = candidates.slice(0, MAX_VISIBLE_PEERS);
  return top.map(peerDto);
}

export class GameWorld {
  tick = 0;
  private players = new Map<number, ServerPlayer>();
  /** socket -> id for disconnect */
  private bySocket = new Map<WebSocket, number>();

  addPlayer(socket: WebSocket, name?: string): ServerPlayer {
    void name;
    const id = nextPlayerId++;
    const existing = [...this.players.values()];
    let tx: number;
    let tz: number;
    if (existing.length > 0) {
      const anchor = existing[Math.floor(Math.random() * existing.length)]!;
      const dtx = Math.floor(Math.random() * 5) - 2;
      const dtz = Math.floor(Math.random() * 5) - 2;
      const c = clampTile(anchor.tx + dtx, anchor.tz + dtz);
      tx = c.tx;
      tz = c.tz;
    } else {
      /** Match client single-player spawn tile; (12,12) sits in chunk_0_0 starter pond. */
      const hub = clampTile(5, 5);
      tx = hub.tx;
      tz = hub.tz;
    }
    const p: ServerPlayer = { id, socket, tx, tz, goalTx: tx, goalTz: tz };
    this.players.set(id, p);
    this.bySocket.set(socket, id);
    return p;
  }

  removeBySocket(socket: WebSocket): void {
    const id = this.bySocket.get(socket);
    if (id === undefined) return;
    this.bySocket.delete(socket);
    this.players.delete(id);
  }

  getBySocket(socket: WebSocket): ServerPlayer | undefined {
    const id = this.bySocket.get(socket);
    if (id === undefined) return undefined;
    return this.players.get(id);
  }

  applyMove(socket: WebSocket, tx: number, tz: number, goalTx: number, goalTz: number): void {
    const p = this.getBySocket(socket);
    if (!p) return;
    const c = clampTile(tx, tz);
    const g = clampTile(goalTx, goalTz);
    p.tx = c.tx;
    p.tz = c.tz;
    p.goalTx = g.tx;
    p.goalTz = g.tz;
  }

  welcomeMsg(player: ServerPlayer): ServerMsg {
    return { t: 'welcome', playerId: player.id, tick: this.tick };
  }

  snapForPlayer(player: ServerPlayer): ServerMsg {
    const list = [...this.players.values()];
    return {
      t: 'snap',
      tick: this.tick,
      self: peerDto(player),
      peers: visiblePeersFor(player, list),
    };
  }

  broadcastSnapshots(): void {
    const list = [...this.players.values()];
    for (const p of list) {
      const msg = this.snapForPlayer(p);
      if (p.socket.readyState === 1 /* OPEN */) {
        p.socket.send(JSON.stringify(msg));
      }
    }
  }

  /** Relay another player's hit splat to everyone in AOI (sender does not receive). */
  broadcastPeerHitSplat(
    from: ServerPlayer,
    x: number,
    y: number,
    z: number,
    amount: number
  ): void {
    const msg: ServerMsg = {
      t: 'peerHitSplat',
      playerId: from.id,
      x,
      y,
      z,
      amount: Math.max(0, Math.round(amount)),
    };
    const raw = JSON.stringify(msg);
    const list = [...this.players.values()];
    for (const viewer of list) {
      if (viewer.id === from.id) continue;
      if (chebyshevTileDist(viewer, from) > AOI_MAX_TILE_RADIUS) continue;
      if (viewer.socket.readyState === 1) viewer.socket.send(raw);
    }
  }
}
