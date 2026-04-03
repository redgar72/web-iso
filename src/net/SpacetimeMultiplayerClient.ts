import { Identity, type Infer } from 'spacetimedb';
import type { TerrainPaintMode } from '../../shared/terrainBrush';
import { MAX_VISIBLE_PEERS, tileCenterXZ } from '../../shared/world';
import type { NetPeer, ServerMsg } from '../../shared/protocol';
import { DbConnection, type EventContext, type ReducerEventContext } from './stdb';
import ChatMessageTbl from './stdb/chat_message_table';
import HitSplatTbl from './stdb/hit_splat_table';
import PlayerTbl from './stdb/player_table';
import ServerNpcTbl from './stdb/server_npc_table';
import TerrainChunkTbl from './stdb/terrain_chunk_table';
import type { MultiplayerHandlers } from './MultiplayerClient';

type PlayerRow = Infer<typeof PlayerTbl>;
type HitSplatRow = Infer<typeof HitSplatTbl>;
type TerrainChunkRow = Infer<typeof TerrainChunkTbl>;
type ChatMessageRow = Infer<typeof ChatMessageTbl>;
type ServerNpcRowType = Infer<typeof ServerNpcTbl>;

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

/** BSATN may decode `u32` as `number` or `bigint`; normalize before `Math.abs` / equality checks. */
function asU32(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  return Math.floor(Number(v));
}

function normalizeIdentityHex(hex: string): string {
  return hex.replace(/^0x/i, '').toLowerCase();
}

/** Resolve row `owner` to hex — BSATN / client cache may use `Identity` or `{ __identity__: bigint }`. */
function rowOwnerHex(owner: unknown): string | null {
  if (owner == null) return null;
  if (typeof owner === 'object') {
    const o = owner as { toHexString?: () => string; __identity__?: bigint };
    if (typeof o.toHexString === 'function') {
      return normalizeIdentityHex(o.toHexString());
    }
    if (typeof o.__identity__ === 'bigint') {
      return normalizeIdentityHex(new Identity(o.__identity__).toHexString());
    }
  }
  return null;
}

function peerDto(p: PlayerRow): NetPeer {
  const tx = asU32(p.tx);
  const tz = asU32(p.tz);
  const goalTx = asU32(p.goalTx);
  const goalTz = asU32(p.goalTz);
  const { x, z } = tileCenterXZ(tx, tz);
  return {
    id: asU32(p.publicId),
    tx,
    tz,
    goalTx,
    goalTz,
    x,
    z,
  };
}

export class SpacetimeMultiplayerClient {
  private conn: DbConnection | null = null;
  private identityHex: string | null = null;
  private handlers: MultiplayerHandlers;
  private welcomeSent = false;
  /** Latest known public id for this connection (set once `player` row exists). */
  private selfPublicId: number | null = null;
  private spacetimeSnapshotNotified = false;
  /** Dedupe UI chat lines when syncing from cache vs `onInsert` callbacks. */
  private seenChatMessageIds = new Set<string>();

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
        this.seenChatMessageIds.clear();
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
        this.identityHex = normalizeIdentityHex(identity.toHexString());
        if (this.config.authTokenStorageKey && token) {
          localStorage.setItem(this.config.authTokenStorageKey, token);
        }
        this.welcomeSent = false;
        this.selfPublicId = null;
        this.seenChatMessageIds.clear();
        this.attachRowCallbacks(conn);
        conn
          .subscriptionBuilder()
          .onApplied(() => {
            this.syncChatFromCache(conn);
            this.emitWelcomeIfNeeded(conn);
            this.emitSnap(conn);
            this.syncAllTerrainChunks(conn);
            this.handlers.onServerWildlifeDirty?.(conn);
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
            'SELECT * FROM chat_message',
            'SELECT * FROM npc_spawner',
            'SELECT * FROM server_npc',
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
    conn.db.chatMessage.onInsert((_ctx: EventContext, row: ChatMessageRow) => {
      this.emitChatRowIfNew(row);
    });
    conn.db.hitSplat.onInsert((_ctx: EventContext, row: HitSplatRow) => {
      if (this.selfPublicId !== null && asU32(row.fromPublicId) === this.selfPublicId) {
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
    const bumpWildlife = (): void => {
      this.handlers.onServerWildlifeDirty?.(conn);
    };
    conn.db.npcSpawner.onInsert(bumpWildlife);
    conn.db.npcSpawner.onUpdate(bumpWildlife);
    conn.db.npcSpawner.onDelete(bumpWildlife);
    conn.db.serverNpc.onInsert(bumpWildlife);
    conn.db.serverNpc.onUpdate(bumpWildlife);
    conn.db.serverNpc.onDelete((_ctx: EventContext, row: ServerNpcRowType) => {
      this.handlers.onServerNpcDeleted?.({
        entityId:
          typeof row.id === 'bigint' ? row.id : BigInt(Math.floor(Number(row.id))),
        templateKey: String(row.templateKey),
        tx: asU32(row.tx),
        tz: asU32(row.tz),
      });
      bumpWildlife();
    });
  }

  private syncAllTerrainChunks(conn: DbConnection): void {
    for (const row of conn.db.terrainChunk.iter()) {
      this.emitTerrainChunk(row);
    }
  }

  private emitChatRowIfNew(row: ChatMessageRow): void {
    const idKey = row.id.toString();
    if (this.seenChatMessageIds.has(idKey)) return;
    this.seenChatMessageIds.add(idKey);
    this.handlers.onSpacetimeChat?.(row.fromPublicId, row.text);
  }

  /** Runs on each subscription apply; rows are already in the client cache (see SDK `SubscribeApplied` order). */
  private syncChatFromCache(conn: DbConnection): void {
    for (const row of conn.db.chatMessage.iter()) {
      this.emitChatRowIfNew(row);
    }
  }

  private emitTerrainChunk(row: TerrainChunkRow): void {
    this.handlers.onTerrainChunkFromServer?.(row.chunkKey, row.json);
  }

  private findSelf(conn: DbConnection): PlayerRow | undefined {
    const fromConn = conn.identity;
    if (fromConn !== undefined) {
      for (const p of conn.db.player.iter()) {
        const ow = p.owner as Identity | null | undefined;
        if (ow != null && typeof ow === 'object' && typeof ow.isEqual === 'function') {
          try {
            if (ow.isEqual(fromConn)) return p;
          } catch {
            /* ignore malformed row */
          }
        }
      }
    }
    if (this.identityHex === null) return undefined;
    const target = this.identityHex;
    for (const p of conn.db.player.iter()) {
      const h = rowOwnerHex(p.owner);
      if (h !== null && h === target) {
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
    this.selfPublicId = asU32(self.publicId);
    const tick = Number(this.currentTick(conn));
    this.handlers.onWelcome?.(asU32(self.publicId), tick);
  }

  private emitSnap(conn: DbConnection): void {
    const self = this.findSelf(conn);
    if (!self) return;
    this.selfPublicId = asU32(self.publicId);
    const everyone = [...conn.db.player.iter()];
    const selfPid = asU32(self.publicId);
    const peers = everyone
      .filter((o) => asU32(o.publicId) !== selfPid)
      .slice(0, MAX_VISIBLE_PEERS)
      .map(peerDto);
    const msg: Extract<ServerMsg, { t: 'snap' }> = {
      t: 'snap',
      tick: Number(this.currentTick(conn)),
      self: peerDto(self),
      peers,
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

  sendChat(text: string): void {
    this.conn?.reducers.sendChat({ text });
  }

  npcSpawnerPlace(
    tx: number,
    tz: number,
    templateKey: string,
    respawnTicks: number,
    wanderTiles: number,
    hpOverride: number,
    dmgOverride: number
  ): void {
    this.conn?.reducers.npcSpawnerPlace({
      tx,
      tz,
      templateKey,
      respawnTicks,
      wanderTiles,
      hpOverride,
      dmgOverride,
    });
  }

  npcSpawnerUpdate(
    spawnerId: bigint,
    templateKey: string,
    respawnTicks: number,
    wanderTiles: number,
    hpOverride: number,
    dmgOverride: number
  ): void {
    this.conn?.reducers.npcSpawnerUpdate({
      spawnerId,
      templateKey,
      respawnTicks,
      wanderTiles,
      hpOverride,
      dmgOverride,
    });
  }

  npcSpawnerDelete(spawnerId: bigint): void {
    this.conn?.reducers.npcSpawnerDelete({ spawnerId });
  }

  attackServerNpc(entityId: bigint, damage: number): void {
    this.conn?.reducers.attackServerNpc({
      entityId,
      damage: Math.max(1, Math.min(100, Math.round(damage))),
    });
  }

  /** Push latest `player` / `world_state` snapshot to handlers (e.g. when login overlay closes). */
  refreshSnapFromCache(): void {
    const c = this.conn;
    if (c === null) return;
    this.emitSnap(c);
  }

  disconnect(): void {
    this.conn?.disconnect();
    this.conn = null;
    this.identityHex = null;
    this.welcomeSent = false;
    this.selfPublicId = null;
    this.spacetimeSnapshotNotified = false;
    this.seenChatMessageIds.clear();
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
            normalizeIdentityHex(ctx.event.callerIdentity.toHexString()) !== this.identityHex
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
