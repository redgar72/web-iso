import type { Infer } from 'spacetimedb';
import { affectedChunkKeysForTerrainBrush } from '../../shared/chunkTerrainMutations';
import type { TerrainPaintMode } from '../../shared/terrainBrush';
import {
  AOI_MAX_TILE_RADIUS,
  MAX_VISIBLE_PEERS,
  chebyshevTileDist,
  tileCenterXZ,
} from '../../shared/world';
import type { NetPeer, ServerMsg } from '../../shared/protocol';
import { DbConnection, type EventContext, type ReducerEventContext } from './stdb';
import HitSplatTbl from './stdb/hit_splat_table';
import PlayerTbl from './stdb/player_table';
import TerrainChunkTbl from './stdb/terrain_chunk_table';
import type { MultiplayerHandlers } from './MultiplayerClient';

type PlayerRow = Infer<typeof PlayerTbl>;
type HitSplatRow = Infer<typeof HitSplatTbl>;
type TerrainChunkRow = Infer<typeof TerrainChunkTbl>;

/** {@link DbConnectionImpl.isActive} — WebSocket is OPEN; safe to call reducers. */
type DbConnectionWithActive = DbConnection & { isActive: boolean };

export interface SpacetimeMultiplayerConfig {
  uri: string;
  moduleName: string;
  /** When set, the token from {@link DbConnection} `onConnect` is persisted for reconnects. */
  authTokenStorageKey?: string;
  /** Cleared with the auth token on {@link logout} / {@link clearStoredAuthToken}. */
  usernameStorageKey?: string;
}

function peerDto(p: PlayerRow): NetPeer {
  const { x, z } = tileCenterXZ(p.tx, p.tz);
  return {
    id: p.publicId,
    tx: p.tx,
    tz: p.tz,
    goalTx: p.goalTx,
    goalTz: p.goalTz,
    x,
    z,
  };
}

function visiblePeers(self: PlayerRow, everyone: PlayerRow[]): NetPeer[] {
  const candidates = everyone.filter(
    (o) =>
      o.publicId !== self.publicId &&
      chebyshevTileDist(self, o) <= AOI_MAX_TILE_RADIUS
  );
  candidates.sort(
    (a, b) =>
      chebyshevTileDist(self, a) - chebyshevTileDist(self, b) ||
      a.publicId - b.publicId
  );
  return candidates.slice(0, MAX_VISIBLE_PEERS).map(peerDto);
}

export class SpacetimeMultiplayerClient {
  private conn: DbConnection | null = null;
  private identityHex: string | null = null;
  private handlers: MultiplayerHandlers;
  private welcomeSent = false;
  /** Latest known public id for this connection (set once `player` row exists). */
  private selfPublicId: number | null = null;
  private spacetimeSnapshotNotified = false;

  constructor(
    private readonly config: SpacetimeMultiplayerConfig,
    handlers: MultiplayerHandlers = {}
  ) {
    this.handlers = handlers;
  }

  getLatencyMs(): number | null {
    return null;
  }

  /**
   * @param opts.token pass `null` to connect anonymously (ignore stored token). Otherwise stored token is used when `authTokenStorageKey` is set.
   */
  connect(opts?: { token?: string | null }): void {
    if (this.conn !== null) return;

    let initialToken: string | undefined;
    if (opts?.token !== undefined) {
      initialToken = opts.token === null ? undefined : opts.token || undefined;
    } else if (this.config.authTokenStorageKey) {
      initialToken = localStorage.getItem(this.config.authTokenStorageKey) ?? undefined;
    }

    this.conn = DbConnection.builder()
      .withUri(this.config.uri)
      .withModuleName(this.config.moduleName)
      .withToken(initialToken)
      .onDisconnect((closedConn) => {
        // A new socket may already be `this.conn`; only clear if this close is for the active one.
        if (this.conn !== closedConn) return;
        this.conn = null;
        this.identityHex = null;
        this.welcomeSent = false;
        this.selfPublicId = null;
        this.spacetimeSnapshotNotified = false;
      })
      .onConnectError((_ctx, err) => {
        console.warn('[spacetimedb]', err);
        this.handlers.onSpacetimeConnectError?.(
          typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message?: unknown }).message ?? err)
            : String(err)
        );
      })
      .onConnect((conn, identity, token) => {
        this.identityHex = identity.toHexString();
        if (this.config.authTokenStorageKey && token) {
          localStorage.setItem(this.config.authTokenStorageKey, token);
        }
        this.welcomeSent = false;
        this.selfPublicId = null;
        this.attachRowCallbacks(conn);
        conn
          .subscriptionBuilder()
          .onApplied(() => {
            this.emitWelcomeIfNeeded(conn);
            this.emitSnap(conn);
            this.syncAllTerrainChunks(conn);
            if (!this.spacetimeSnapshotNotified) {
              this.spacetimeSnapshotNotified = true;
              this.handlers.onSpacetimeSubscriptionApplied?.();
            }
          })
          .subscribe([
            'SELECT * FROM player',
            'SELECT * FROM world_state',
            'SELECT * FROM hit_splat',
            'SELECT * FROM terrain_chunk',
          ]);
      })
      .build();
  }

  private attachRowCallbacks(conn: DbConnection): void {
    conn.db.player.onInsert((_ctx: EventContext, _row: PlayerRow) => {
      this.emitWelcomeIfNeeded(conn);
      this.emitSnap(conn);
    });
    conn.db.player.onUpdate((_ctx: EventContext, _oldRow: PlayerRow, _row: PlayerRow) => {
      this.emitSnap(conn);
    });
    conn.db.player.onDelete((_ctx: EventContext, _row: PlayerRow) => {
      this.emitSnap(conn);
    });
    conn.db.worldState.onUpdate((_ctx: EventContext, _old, _row) => {
      this.emitSnap(conn);
    });
    conn.db.hitSplat.onInsert((_ctx: EventContext, row: HitSplatRow) => {
      if (this.selfPublicId !== null && row.fromPublicId === this.selfPublicId) {
        return;
      }
      const msg: Extract<ServerMsg, { t: 'peerHitSplat' }> = {
        t: 'peerHitSplat',
        playerId: row.fromPublicId,
        x: row.x,
        y: row.y,
        z: row.z,
        amount: row.amount,
      };
      this.handlers.onPeerHitSplat?.(msg);
    });
    conn.db.terrainChunk.onInsert((_ctx: EventContext, row: TerrainChunkRow) => {
      this.emitTerrainChunk(row);
    });
    conn.db.terrainChunk.onUpdate(
      (_ctx: EventContext, _oldRow: TerrainChunkRow, row: TerrainChunkRow) => {
        this.emitTerrainChunk(row);
      }
    );
    conn.reducers.onTerrainEdit((ctx: ReducerEventContext, args) => {
      if (ctx.event.status.tag !== 'Committed') return;
      const keys = affectedChunkKeysForTerrainBrush(args.tx, args.tz, args.brushRadius);
      for (const k of keys) {
        const row = conn.db.terrainChunk.chunkKey.find(k);
        if (row) {
          this.emitTerrainChunk(row);
        }
      }
    });
  }

  private syncAllTerrainChunks(conn: DbConnection): void {
    for (const row of conn.db.terrainChunk.iter()) {
      this.emitTerrainChunk(row);
    }
  }

  private emitTerrainChunk(row: TerrainChunkRow): void {
    this.handlers.onTerrainChunkFromServer?.(row.chunkKey, row.json);
  }

  private findSelf(conn: DbConnection): PlayerRow | undefined {
    if (this.identityHex === null) return undefined;
    for (const p of conn.db.player.iter()) {
      if (p.owner.toHexString() === this.identityHex) {
        return p;
      }
    }
    return undefined;
  }

  private currentTick(conn: DbConnection): bigint {
    for (const w of conn.db.worldState.iter()) {
      if (w.id === 0) return w.tick;
    }
    return 0n;
  }

  private emitWelcomeIfNeeded(conn: DbConnection): void {
    if (this.welcomeSent) return;
    const self = this.findSelf(conn);
    if (!self) return;
    this.welcomeSent = true;
    this.selfPublicId = self.publicId;
    const tick = Number(this.currentTick(conn));
    this.handlers.onWelcome?.(self.publicId, tick);
  }

  private emitSnap(conn: DbConnection): void {
    const self = this.findSelf(conn);
    if (!self) return;
    this.selfPublicId = self.publicId;
    const everyone = [...conn.db.player.iter()];
    const msg: Extract<ServerMsg, { t: 'snap' }> = {
      t: 'snap',
      tick: Number(this.currentTick(conn)),
      self: peerDto(self),
      peers: visiblePeers(self, everyone),
    };
    this.handlers.onSnap?.(msg);
  }

  sendMove(tx: number, tz: number, goalTx: number, goalTz: number): void {
    this.conn?.reducers.move({ tx, tz, goalTx, goalTz });
  }

  sendHitSplat(x: number, y: number, z: number, amount: number): void {
    this.conn?.reducers.emitHitSplat({
      x,
      y,
      z,
      amount: Math.max(0, Math.round(amount)),
    });
  }

  sendTerrainEdit(
    tx: number,
    tz: number,
    mode: TerrainPaintMode,
    textureIndex: number,
    heightStep: number,
    brushRadius: number
  ): void {
    this.conn?.reducers.terrainEdit({
      tx,
      tz,
      mode,
      textureIndex,
      heightStep,
      brushRadius,
    });
  }

  disconnect(): void {
    this.conn?.disconnect();
    this.conn = null;
    this.identityHex = null;
    this.welcomeSent = false;
    this.selfPublicId = null;
    this.spacetimeSnapshotNotified = false;
  }

  clearStoredAuthToken(): void {
    if (this.config.authTokenStorageKey) {
      localStorage.removeItem(this.config.authTokenStorageKey);
    }
    if (this.config.usernameStorageKey) {
      localStorage.removeItem(this.config.usernameStorageKey);
    }
  }

  logout(): void {
    this.clearStoredAuthToken();
    this.disconnect();
  }

  registerAccount(username: string, password: string): Promise<void> {
    return this.invokePasswordReducer('register', { username, password });
  }

  loginWithPassword(username: string, password: string): Promise<void> {
    return this.invokePasswordReducer('login', { username, password });
  }

  /**
   * Password reducers require an open WebSocket and Identity from the server.
   * `this.conn` is set when the SDK builds, but `identityHex` is only set in `onConnect`;
   * after logout/reconnect, callers can run before that completes unless we wait here.
   */
  private async waitForUsableConnection(): Promise<DbConnection> {
    const maxMs = 25_000;
    const started = performance.now();
    while (performance.now() - started < maxMs) {
      const c = this.conn as DbConnectionWithActive | null;
      if (c !== null && this.identityHex !== null && c.isActive) {
        return c;
      }
      if (this.conn === null) {
        this.connect();
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(
      'Not connected to multiplayer. Check that SpacetimeDB is running, the module is published, and VITE_SPACETIMEDB_URI is correct.'
    );
  }

  private invokePasswordReducer(
    kind: 'register' | 'login',
    params: { username: string; password: string }
  ): Promise<void> {
    return (async () => {
      const conn = await this.waitForUsableConnection();
      await new Promise<void>((resolve, reject) => {
        const handler = (ctx: ReducerEventContext, _args: { username: string; password: string }) => {
          if (
            this.identityHex === null ||
            ctx.event.callerIdentity.toHexString() !== this.identityHex
          ) {
            return;
          }
          const { tag } = ctx.event.status;
          if (tag === 'Committed') {
            unsub();
            resolve();
          } else {
            unsub();
            const msg =
              tag === 'Failed'
                ? ctx.event.status.value
                : tag === 'OutOfEnergy'
                  ? 'Out of energy'
                  : 'Request failed';
            reject(new Error(msg));
          }
        };
        const unsub =
          kind === 'register'
            ? () => conn.reducers.removeOnRegisterAccount(handler)
            : () => conn.reducers.removeOnLoginWithPassword(handler);
        if (kind === 'register') {
          conn.reducers.onRegisterAccount(handler);
          conn.reducers.registerAccount(params);
        } else {
          conn.reducers.onLoginWithPassword(handler);
          conn.reducers.loginWithPassword(params);
        }
      });
    })();
  }
}
