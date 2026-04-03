import { ScheduleAt } from 'spacetimedb';
import { schema, table, t, SenderError } from 'spacetimedb/server';
import { affectedChunkKeys, applyTerrainStrokeToChunkMap } from './applyTerrainReducerEdit';
import { TERRAIN_CHUNK_SEEDS } from './chunkSeeds';
import { parseLevelChunkJson, serializeLevelChunk } from '../../shared/levelChunk';
import { isServerNpcTemplateKey } from '../../shared/serverNpcTemplates';
import { hashPassword, identitySpawnSeed } from './passwordHash';
import { areOrthogonallyAdjacent, clampGlobalTile, isTileWalkableNpc } from './npcWorld';
import { runServerNpcLifecycle } from './npcTick';

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

/** Private: password hashes are never replicated to clients. */
const UserCredentials = table(
  {
    name: 'user_credentials',
    indexes: [{ name: 'by_bound_owner', algorithm: 'btree', columns: ['boundOwner'] }],
  },
  {
    username: t.string().primaryKey(),
    passwordHash: t.string(),
    boundOwner: t.identity(),
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

const TerrainChunk = table(
  { name: 'terrain_chunk', public: true },
  {
    chunkKey: t.string().primaryKey(),
    json: t.string(),
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

const ChatMessage = table(
  { name: 'chat_message', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    fromPublicId: t.u32(),
    tick: t.u64(),
    text: t.string(),
  }
);

/** Server-placed NPC spawner (1 live {@link ServerNpc} at a time). */
const NpcSpawner = table(
  {
    name: 'npc_spawner',
    public: true,
    indexes: [{ name: 'by_tile', algorithm: 'btree', columns: ['tx', 'tz'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    tx: t.u32(),
    tz: t.u32(),
    templateKey: t.string(),
    /** Whole-world ticks until respawn after death. */
    respawnTicks: t.u32(),
    /** Chebyshev wander radius in tiles from spawn. */
    wanderTiles: t.u32(),
    /** 0 = use template default HP. */
    hpOverride: t.u32(),
    /** 0 = use template default melee damage. */
    dmgOverride: t.u32(),
    /** Earliest {@link WorldState.tick} at which a new NPC may spawn. */
    nextSpawnTick: t.u64(),
  }
);

const ServerNpc = table(
  {
    name: 'server_npc',
    public: true,
    indexes: [{ name: 'by_spawner_id', algorithm: 'btree', columns: ['spawnerId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    spawnerId: t.u64(),
    templateKey: t.string(),
    tx: t.u32(),
    tz: t.u32(),
    goalTx: t.u32(),
    goalTz: t.u32(),
    hp: t.u32(),
    maxHp: t.u32(),
    biteDamage: t.u32(),
  }
);

export const spacetimedb = schema(
  WorldState,
  IdGen,
  Player,
  UserCredentials,
  TickJob,
  TerrainStroke,
  TerrainChunk,
  HitSplat,
  ChatMessage,
  NpcSpawner,
  ServerNpc
);

spacetimedb.init((ctx) => {
  ctx.db.worldState.insert({ id: 0, tick: 0n });
  ctx.db.idGen.insert({ id: 0, nextPublicId: 1 });
  for (const [chunkKey, json] of Object.entries(TERRAIN_CHUNK_SEEDS)) {
    ctx.db.terrainChunk.insert({ chunkKey, json });
  }
  ctx.db.tickJob.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + OSRS_TICK_MICROS),
  });
});

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

function validateCredentials(username: string, password: string): void {
  if (username.length < 3 || username.length > 24) {
    throw new SenderError('Username must be 3–24 characters after trimming.');
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    throw new SenderError('Username may only contain a–z, 0–9, and underscores.');
  }
  if (password.length < 4 || password.length > 128) {
    throw new SenderError('Password must be 4–128 characters.');
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function allocPublicId(ctx: any): number {
  const genRow = ctx.db.idGen.id.find(0);
  if (!genRow) throw new SenderError('Server not initialized.');
  const publicId = genRow.nextPublicId;
  ctx.db.idGen.id.update({ ...genRow, nextPublicId: publicId + 1 });
  return publicId;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectOccupiedTiles(ctx: any): { tx: number; tz: number }[] {
  const positions: { tx: number; tz: number }[] = [];
  for (const p of ctx.db.player.iter()) {
    positions.push({ tx: p.tx, tz: p.tz });
  }
  return positions;
}

function spawnTilesForSeed(seed: number, positions: { tx: number; tz: number }[]): { tx: number; tz: number } {
  if (positions.length > 0) {
    const anchor = positions[seed % positions.length]!;
    const dtx = (seed >>> 8) % 5;
    const dtz = (seed >>> 16) % 5;
    return clampTile(anchor.tx + dtx - 2, anchor.tz + dtz - 2);
  }
  return clampTile(5, 5);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensurePlayerRow(ctx: any): void {
  if (ctx.db.player.owner.find(ctx.sender)) return;
  const seed = identitySpawnSeed(ctx.sender.toHexString());
  const positions = collectOccupiedTiles(ctx);
  const c = spawnTilesForSeed(seed, positions);
  const publicId = allocPublicId(ctx);
  ctx.db.player.insert({
    owner: ctx.sender,
    publicId,
    tx: c.tx,
    tz: c.tz,
    goalTx: c.tx,
    goalTz: c.tz,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function credentialForSender(ctx: any): { username: string; passwordHash: string; boundOwner: { toHexString: () => string } } | undefined {
  for (const row of ctx.db.userCredentials.by_bound_owner.filter(ctx.sender)) {
    return row;
  }
  return undefined;
}

spacetimedb.clientConnected((ctx) => {
  /* `init` only runs on brand-new databases; upgrades leave `terrain_chunk` empty until filled. */
  for (const [chunkKey, json] of Object.entries(TERRAIN_CHUNK_SEEDS)) {
    if (ctx.db.terrainChunk.chunkKey.find(chunkKey) === undefined) {
      ctx.db.terrainChunk.insert({ chunkKey, json });
    }
  }
  /*
   * Every session needs a `player` row so reducers like `move`, `terrain_edit`, and `send_chat`
   * can run. Anonymous clients have no `user_credentials` row yet; without this call, terrain
   * edits would only apply locally and disappear on refresh.
   */
  ensurePlayerRow(ctx);
});

spacetimedb.clientDisconnected((ctx) => {
  ctx.db.player.owner.delete(ctx.sender);
});

spacetimedb.reducer(
  'register_account',
  { username: t.string(), password: t.string() },
  (ctx, { username, password }) => {
    const u = normalizeUsername(username);
    validateCredentials(u, password);
    if (credentialForSender(ctx)) {
      throw new SenderError('This session already has an account.');
    }
    if (ctx.db.userCredentials.username.find(u)) {
      throw new SenderError('Username already taken.');
    }
    ctx.db.userCredentials.insert({
      username: u,
      passwordHash: hashPassword(u, password),
      boundOwner: ctx.sender,
    });
    ensurePlayerRow(ctx);
  }
);

spacetimedb.reducer(
  'login_with_password',
  { username: t.string(), password: t.string() },
  (ctx, { username, password }) => {
    const u = normalizeUsername(username);
    validateCredentials(u, password);
    const row = ctx.db.userCredentials.username.find(u);
    if (!row) {
      throw new SenderError('Unknown username.');
    }
    if (row.passwordHash !== hashPassword(u, password)) {
      throw new SenderError('Incorrect password.');
    }

    const mine = credentialForSender(ctx);
    if (mine !== undefined && mine.username !== u) {
      throw new SenderError('This session already has a different account.');
    }

    if (row.boundOwner.toHexString() === ctx.sender.toHexString()) {
      ensurePlayerRow(ctx);
      return;
    }

    const oldPlayer = ctx.db.player.owner.find(row.boundOwner);
    let publicId: number;
    let tx: number;
    let tz: number;
    let goalTx: number;
    let goalTz: number;
    if (oldPlayer) {
      publicId = oldPlayer.publicId;
      tx = oldPlayer.tx;
      tz = oldPlayer.tz;
      goalTx = oldPlayer.goalTx;
      goalTz = oldPlayer.goalTz;
      ctx.db.player.owner.delete(row.boundOwner);
    } else {
      publicId = allocPublicId(ctx);
      const seed = identitySpawnSeed(ctx.sender.toHexString());
      const positions = collectOccupiedTiles(ctx);
      const c = spawnTilesForSeed(seed, positions);
      tx = c.tx;
      tz = c.tz;
      goalTx = c.tx;
      goalTz = c.tz;
    }

    ctx.db.userCredentials.username.update({
      ...row,
      boundOwner: ctx.sender,
    });

    if (ctx.db.player.owner.find(ctx.sender)) {
      return;
    }
    ctx.db.player.insert({
      owner: ctx.sender,
      publicId,
      tx,
      tz,
      goalTx,
      goalTz,
    });
  }
);

spacetimedb.reducer('run_server_tick', { arg: TickJob.rowType }, (ctx, { arg }) => {
  void arg;
  const ws = ctx.db.worldState.id.find(0);
  let tick = 0n;
  if (ws) {
    tick = ws.tick + 1n;
    ctx.db.worldState.id.update({ ...ws, tick });
    runServerNpcLifecycle(ctx, tick);
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

const CHAT_TEXT_MAX = 220;

spacetimedb.reducer('send_chat', { text: t.string() }, (ctx, { text }) => {
  const p = ctx.db.player.owner.find(ctx.sender);
  if (!p) return;
  const trimmed = text.trim().slice(0, CHAT_TEXT_MAX);
  if (!trimmed) return;
  const ws = ctx.db.worldState.id.find(0);
  const tick = ws ? ws.tick : 0n;
  ctx.db.chatMessage.insert({
    id: 0n,
    fromPublicId: p.publicId,
    tick,
    text: trimmed,
  });
});

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

    const keys = affectedChunkKeys(tx, tz, brushR);
    const chunkData = new Map();
    for (const k of keys) {
      const row = ctx.db.terrainChunk.chunkKey.find(k);
      if (!row) continue;
      chunkData.set(k, parseLevelChunkJson(row.json));
    }
    if (chunkData.size === 0) return;
    const dirty = applyTerrainStrokeToChunkMap(chunkData, tx, tz, m, tex, step, brushR);
    for (const k of dirty) {
      const ch = chunkData.get(k);
      if (!ch) continue;
      const row = ctx.db.terrainChunk.chunkKey.find(k);
      if (!row) continue;
      ctx.db.terrainChunk.chunkKey.update({
        chunkKey: k,
        json: serializeLevelChunk(ch, false),
      });
    }
  }
);

spacetimedb.reducer(
  'npc_spawner_place',
  {
    tx: t.u32(),
    tz: t.u32(),
    templateKey: t.string(),
    respawnTicks: t.u32(),
    wanderTiles: t.u32(),
    hpOverride: t.u32(),
    dmgOverride: t.u32(),
  },
  (ctx, { tx, tz, templateKey, respawnTicks, wanderTiles, hpOverride, dmgOverride }) => {
    const p = ctx.db.player.owner.find(ctx.sender);
    if (!p) return;
    const tpl = templateKey.trim().toLowerCase();
    if (!isServerNpcTemplateKey(tpl)) {
      throw new SenderError('Unknown NPC template.');
    }
    const c = clampGlobalTile(tx, tz);
    if (!isTileWalkableNpc(ctx.db.terrainChunk, c.tx, c.tz)) {
      throw new SenderError('Cannot place spawner on blocked tile.');
    }
    const rt = Math.max(1, Math.min(600, Math.floor(Number(respawnTicks) || 25)));
    const wt = Math.max(0, Math.min(32, Math.floor(Number(wanderTiles) || 8)));
    const hpO = Math.min(10_000, Math.max(0, Math.floor(Number(hpOverride) || 0)));
    const dmgO = Math.min(500, Math.max(0, Math.floor(Number(dmgOverride) || 0)));
    const ws = ctx.db.worldState.id.find(0);
    const tNow = ws ? ws.tick : 0n;
    ctx.db.npcSpawner.insert({
      id: 0n,
      tx: c.tx,
      tz: c.tz,
      templateKey: tpl,
      respawnTicks: rt,
      wanderTiles: wt,
      hpOverride: hpO,
      dmgOverride: dmgO,
      nextSpawnTick: tNow,
    });
  }
);

spacetimedb.reducer(
  'npc_spawner_update',
  {
    spawnerId: t.u64(),
    templateKey: t.string(),
    respawnTicks: t.u32(),
    wanderTiles: t.u32(),
    hpOverride: t.u32(),
    dmgOverride: t.u32(),
  },
  (ctx, { spawnerId, templateKey, respawnTicks, wanderTiles, hpOverride, dmgOverride }) => {
    const p = ctx.db.player.owner.find(ctx.sender);
    if (!p) return;
    const row = ctx.db.npcSpawner.id.find(spawnerId);
    if (!row) throw new SenderError('Spawner not found.');
    const tpl = templateKey.trim().toLowerCase();
    if (!isServerNpcTemplateKey(tpl)) {
      throw new SenderError('Unknown NPC template.');
    }
    const rt = Math.max(1, Math.min(600, Math.floor(Number(respawnTicks) || 25)));
    const wt = Math.max(0, Math.min(32, Math.floor(Number(wanderTiles) || 8)));
    const hpO = Math.min(10_000, Math.max(0, Math.floor(Number(hpOverride) || 0)));
    const dmgO = Math.min(500, Math.max(0, Math.floor(Number(dmgOverride) || 0)));
    ctx.db.npcSpawner.id.update({
      ...row,
      templateKey: tpl,
      respawnTicks: rt,
      wanderTiles: wt,
      hpOverride: hpO,
      dmgOverride: dmgO,
    });
  }
);

spacetimedb.reducer('npc_spawner_delete', { spawnerId: t.u64() }, (ctx, { spawnerId }) => {
  const p = ctx.db.player.owner.find(ctx.sender);
  if (!p) return;
  const row = ctx.db.npcSpawner.id.find(spawnerId);
  if (!row) return;
  for (const npc of ctx.db.serverNpc.iter()) {
    if (npc.spawnerId === spawnerId) {
      ctx.db.serverNpc.id.delete(npc.id);
      break;
    }
  }
  ctx.db.npcSpawner.id.delete(spawnerId);
});

spacetimedb.reducer(
  'attack_server_npc',
  { entityId: t.u64(), damage: t.u32() },
  (ctx, { entityId, damage }) => {
    const p = ctx.db.player.owner.find(ctx.sender);
    if (!p) return;
    const npc = ctx.db.serverNpc.id.find(entityId);
    if (!npc) return;
    if (
      !areOrthogonallyAdjacent(p.tx as number, p.tz as number, npc.tx as number, npc.tz as number)
    ) {
      throw new SenderError('Target is out of melee range.');
    }
    const dmg = Math.max(1, Math.min(100, Math.floor(Number(damage) || 1)));
    const hp = (npc.hp as number) - dmg;
    if (hp <= 0) {
      const sp = ctx.db.npcSpawner.id.find(npc.spawnerId);
      const ws = ctx.db.worldState.id.find(0);
      const tick = ws ? ws.tick : 0n;
      if (sp) {
        ctx.db.npcSpawner.id.update({
          ...sp,
          nextSpawnTick: tick + BigInt(sp.respawnTicks as number),
        });
      }
      ctx.db.serverNpc.id.delete(entityId);
    } else {
      ctx.db.serverNpc.id.update({ ...npc, hp });
    }
  }
);
