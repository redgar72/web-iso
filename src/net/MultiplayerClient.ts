import type { ClientMsg, NetPeer, ServerMsg } from '../../shared/protocol';
import type { TerrainPaintMode } from '../../shared/terrainBrush';

const PING_INTERVAL_MS = 1000;

/** Narrow API for UI that only needs to relay floating combat text. */
export type MultiplayerHitSplatSink = {
  sendHitSplat(x: number, y: number, z: number, amount: number): void;
};

export interface MultiplayerHandlers {
  onWelcome?: (playerId: number, tick: number) => void;
  onSnap?: (msg: Extract<ServerMsg, { t: 'snap' }>) => void;
  onPeerHitSplat?: (msg: Extract<ServerMsg, { t: 'peerHitSplat' }>) => void;
  onTerrainEditFromPeer?: (msg: Extract<ServerMsg, { t: 'terrainEdit' }>) => void;
  /** SpacetimeDB: full chunk JSON from `terrain_chunk` (authoritative over disk fetch). */
  onTerrainChunkFromServer?: (chunkKey: string, json: string) => void;
  /** SpacetimeDB: after the first subscription batch applied (DB snapshot in client cache). */
  onSpacetimeSubscriptionApplied?: () => void;
  /** SpacetimeDB: connection handshake failed (e.g. invalid token). */
  onSpacetimeConnectError?: (message: string) => void;
  /** SpacetimeDB: row inserted into `chat_message`. */
  onSpacetimeChat?: (fromPublicId: number, text: string) => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private handlers: MultiplayerHandlers;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private latencyMs: number | null = null;

  constructor(
    private readonly url: string,
    handlers: MultiplayerHandlers = {}
  ) {
    this.handlers = handlers;
  }

  /** Smoothed round-trip time in ms, or null if not connected / no sample yet. */
  getLatencyMs(): number | null {
    return this.latencyMs;
  }

  connect(name?: string): void {
    if (this.ws !== null) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.send({ t: 'join', name });
      this.startPingLoop();
    });
    ws.addEventListener('message', (ev) => {
      let data: ServerMsg;
      try {
        data = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        return;
      }
      if (data.t === 'welcome') {
        this.handlers.onWelcome?.(data.playerId, data.tick);
      } else if (data.t === 'snap') {
        this.handlers.onSnap?.(data);
      } else if (data.t === 'peerHitSplat') {
        this.handlers.onPeerHitSplat?.(data);
      } else if (data.t === 'terrainEdit') {
        this.handlers.onTerrainEditFromPeer?.(data);
      } else if (data.t === 'pong') {
        const rtt = performance.now() - data.clientTime;
        if (this.latencyMs === null) {
          this.latencyMs = rtt;
        } else {
          this.latencyMs += (rtt - this.latencyMs) * 0.2;
        }
      }
    });
    ws.addEventListener('close', () => {
      this.stopPingLoop();
      this.ws = null;
      this.latencyMs = null;
    });
  }

  sendMove(tx: number, tz: number, goalTx: number, goalTz: number): void {
    this.send({ t: 'move', tx, tz, goalTx, goalTz });
  }

  sendHitSplat(x: number, y: number, z: number, amount: number): void {
    this.send({ t: 'hitSplat', x, y, z, amount: Math.max(0, Math.round(amount)) });
  }

  sendTerrainEdit(
    tx: number,
    tz: number,
    mode: TerrainPaintMode,
    textureIndex: number,
    heightStep: number,
    brushRadius: number
  ): void {
    this.send({
      t: 'terrainEdit',
      tx,
      tz,
      mode,
      textureIndex,
      heightStep,
      brushRadius,
    });
  }

  disconnect(): void {
    this.stopPingLoop();
    this.ws?.close();
    this.ws = null;
    this.latencyMs = null;
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    const ping = () => this.send({ t: 'ping', clientTime: performance.now() });
    ping();
    this.pingTimer = setInterval(ping, PING_INTERVAL_MS);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}

export type { NetPeer };
