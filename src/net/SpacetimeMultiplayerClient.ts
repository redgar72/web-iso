import type { Infer } from 'spacetimedb';
import type { TerrainPaintMode } from '../../shared/terrainBrush';
import {
  AOI_MAX_TILE_RADIUS,
  MAX_VISIBLE_PEERS,
  chebyshevTileDist,
  tileCenterXZ,
} from '../../shared/world';
import type { NetPeer, ServerMsg } from '../../shared/protocol';
import { DbConnection, type EventContext } from './stdb';
import HitSplatTbl from './stdb/hit_splat_table';
import PlayerTbl from './stdb/player_table';
import TerrainStrokeTbl from './stdb/terrain_stroke_table';
import type { MultiplayerHandlers } from './MultiplayerClient';

type PlayerRow = Infer<typeof PlayerTbl>;
type HitSplatRow = Infer<typeof HitSplatTbl>;
type TerrainStrokeRow = Infer<typeof TerrainStrokeTbl>;

export interface SpacetimeMultiplayerConfig {
  uri: string;
  moduleName: string;
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

  constructor(
    private readonly config: SpacetimeMultiplayerConfig,
    handlers: MultiplayerHandlers = {}
  ) {
    this.handlers = handlers;
  }

  getLatencyMs(): number | null {
    return null;
  }

  connect(_name?: string): void {
    if (this.conn !== null) return;

    this.conn = DbConnection.builder()
      .withUri(this.config.uri)
      .withModuleName(this.config.moduleName)
      .onDisconnect(() => {
        this.conn = null;
        this.identityHex = null;
        this.welcomeSent = false;
        this.selfPublicId = null;
      })
      .onConnectError((_ctx, err) => {
        console.warn('[spacetimedb]', err);
      })
      .onConnect((conn, identity) => {
        this.identityHex = identity.toHexString();
        this.welcomeSent = false;
        this.selfPublicId = null;
        this.attachRowCallbacks(conn);
        conn
          .subscriptionBuilder()
          .onApplied(() => {
            this.emitWelcomeIfNeeded(conn);
            this.emitSnap(conn);
          })
          .subscribe([
            'SELECT * FROM player',
            'SELECT * FROM world_state',
            'SELECT * FROM hit_splat',
            'SELECT * FROM terrain_stroke',
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
    conn.db.terrainStroke.onInsert((_ctx: EventContext, row: TerrainStrokeRow) => {
      if (this.selfPublicId !== null && row.fromPublicId === this.selfPublicId) {
        return;
      }
      const msg: Extract<ServerMsg, { t: 'terrainEdit' }> = {
        t: 'terrainEdit',
        fromPlayerId: row.fromPublicId,
        tx: row.tx,
        tz: row.tz,
        mode: row.mode as TerrainPaintMode,
        textureIndex: row.textureIndex,
        heightStep: row.heightStep,
        brushRadius: row.brushRadius,
      };
      this.handlers.onTerrainEditFromPeer?.(msg);
    });
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
  }
}
