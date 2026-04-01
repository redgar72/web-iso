import { ScheduleAt } from 'spacetimedb';
import { schema, table, t } from 'spacetimedb/server';

/** Keep in sync with `shared/levelChunk` CHUNK_SIZE × `shared/world` WORLD_CHUNK_COUNT_* */
const TERRAIN_GRID_WIDTH = 64 * 3;
const TERRAIN_GRID_DEPTH = 64 * 3;
const OSRS_TICK_MICROS = 600_000n;

function clampTile(tx: number, tz: number): { tx: number; tz: number } {
  const x = Math.max(0, Math.min(TERRAIN_GRID_WIDTH - 1, Math.floor(tx)));
  const z = Math.max(0, Math.min(TERRAIN_GRID_DEPTH - 1, Math.floor(tz)));
  return { tx: x, tz: z };
}

const WorldState = table(
  { name: 'world_state', public: true },
  {
    id: t.u8().primaryKey(),
    tick: t.u64(),
  }
);

const IdGen = table(
  { name: 'id_gen' },
  {
    id: t.u8().primaryKey(),
    nextPublicId: t.u32(),
  }
);

const Player = table(
  {
    name: 'player',
    public: true,
    indexes: [{ name: 'by_public_id', algorithm: 'btree', columns: ['publicId'] }],
  },
  {
    owner: t.identity().primaryKey(),
    publicId: t.u32(),
    tx: t.u32(),
    tz: t.u32(),
    goalTx: t.u32(),
    goalTz: t.u32(),
  }
);

const TickJob = table(
  {
    name: 'tick_job',
    scheduled: 'run_server_tick',
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const TerrainStroke = table(
  { name: 'terrain_stroke', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    fromPublicId: t.u32(),
    tx: t.u32(),
    tz: t.u32(),
    mode: t.string(),
    textureIndex: t.u32(),
    heightStep: t.f64(),
    brushRadius: t.u32(),
  }
);

const HitSplat = table(
  { name: 'hit_splat', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    fromPublicId: t.u32(),
    x: t.f64(),
    y: t.f64(),
    z: t.f64(),
    amount: t.u32(),
  }
);

export const spacetimedb = schema(
  WorldState,
  IdGen,
  Player,
  TickJob,
  TerrainStroke,
  HitSplat
);

spacetimedb.init((ctx) => {
  ctx.db.worldState.insert({ id: 0, tick: 0n });
  ctx.db.idGen.insert({ id: 0, nextPublicId: 1 });
  ctx.db.tickJob.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + OSRS_TICK_MICROS),
  });
});

spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.player.owner.find(ctx.sender);
  if (existing) return;

  const genRow = ctx.db.idGen.id.find(0);
  if (!genRow) return;
  const publicId = genRow.nextPublicId;
  ctx.db.idGen.id.update({ ...genRow, nextPublicId: publicId + 1 });

  let tx: number;
  let tz: number;
  const positions: { tx: number; tz: number }[] = [];
  for (const p of ctx.db.player.iter()) {
    positions.push({ tx: p.tx, tz: p.tz });
  }
  if (positions.length > 0) {
    const anchor = positions[Math.floor(Math.random() * positions.length)]!;
    const dtx = Math.floor(Math.random() * 5) - 2;
    const dtz = Math.floor(Math.random() * 5) - 2;
    const c = clampTile(anchor.tx + dtx, anchor.tz + dtz);
    tx = c.tx;
    tz = c.tz;
  } else {
    const hub = clampTile(5, 5);
    tx = hub.tx;
    tz = hub.tz;
  }

  ctx.db.player.insert({
    owner: ctx.sender,
    publicId,
    tx,
    tz,
    goalTx: tx,
    goalTz: tz,
  });
});

spacetimedb.clientDisconnected((ctx) => {
  ctx.db.player.owner.delete(ctx.sender);
});

spacetimedb.reducer('run_server_tick', { arg: TickJob.rowType }, (ctx, { arg }) => {
  void arg;
  const ws = ctx.db.worldState.id.find(0);
  if (ws) {
    ctx.db.worldState.id.update({ ...ws, tick: ws.tick + 1n });
  }
  ctx.db.tickJob.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + OSRS_TICK_MICROS),
  });
});

spacetimedb.reducer(
  'move',
  {
    tx: t.u32(),
    tz: t.u32(),
    goalTx: t.u32(),
    goalTz: t.u32(),
  },
  (ctx, { tx, tz, goalTx, goalTz }) => {
    const p = ctx.db.player.owner.find(ctx.sender);
    if (!p) return;
    const c = clampTile(tx, tz);
    const g = clampTile(goalTx, goalTz);
    ctx.db.player.owner.update({
      ...p,
      tx: c.tx,
      tz: c.tz,
      goalTx: g.tx,
      goalTz: g.tz,
    });
  }
);

spacetimedb.reducer(
  'emit_hit_splat',
  { x: t.f64(), y: t.f64(), z: t.f64(), amount: t.u32() },
  (ctx, { x, y, z, amount }) => {
    const p = ctx.db.player.owner.find(ctx.sender);
    if (!p) return;
    ctx.db.hitSplat.insert({
      id: 0n,
      fromPublicId: p.publicId,
      x,
      y,
      z,
      amount,
    });
  }
);

spacetimedb.reducer(
  'terrain_edit',
  {
    tx: t.u32(),
    tz: t.u32(),
    mode: t.string(),
    textureIndex: t.u32(),
    heightStep: t.f64(),
    brushRadius: t.u32(),
  },
  (ctx, { tx, tz, mode, textureIndex, heightStep, brushRadius }) => {
    const p = ctx.db.player.owner.find(ctx.sender);
    if (!p) return;
    const brushR = Math.max(0, Math.min(8, Math.floor(Number(brushRadius) || 0)));
    const tex = Math.max(0, Math.floor(Number(textureIndex) || 0));
    const step = Math.min(4, Math.max(0.05, Number(heightStep) || 0.25));
    const m =
      mode === 'texture' ||
      mode === 'raise' ||
      mode === 'lower' ||
      mode === 'water' ||
      mode === 'water_erase'
        ? mode
        : 'texture';
    ctx.db.terrainStroke.insert({
      id: 0n,
      fromPublicId: p.publicId,
      tx,
      tz,
      mode: m,
      textureIndex: tex,
      heightStep: step,
      brushRadius: brushR,
    });
  }
);
