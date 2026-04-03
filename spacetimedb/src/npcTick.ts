import {
  getServerNpcTemplate,
  isServerNpcTemplateKey,
  resolveServerNpcBiteDamage,
  resolveServerNpcMaxHp,
} from '../../shared/serverNpcTemplates';
import {
  areOrthogonallyAdjacent,
  chebyshev,
  clampGlobalTile,
  isTileWalkableNpc,
  pickWanderGoal,
  randomOrthoStep,
  stepToward,
} from './npcWorld';

const DEFAULT_WANDER_TILES = 8;
const NPC_IDLE_WANDER_CHANCE_PERMILLE = 350;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findNpcRowForSpawner(ctx: any, spawnerId: bigint): { id: bigint; spawnerId: bigint } | null {
  for (const row of ctx.db.serverNpc.iter()) {
    if (row.spawnerId === spawnerId) return row;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectOccupiedNpcTiles(ctx: any, skipEntityId: bigint): Set<string> {
  const s = new Set<string>();
  for (const row of ctx.db.serverNpc.iter()) {
    if (row.id === skipEntityId) continue;
    s.add(`${row.tx},${row.tz}`);
  }
  return s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectPlayerTiles(ctx: any): Set<string> {
  const s = new Set<string>();
  for (const p of ctx.db.player.iter()) {
    s.add(`${p.tx},${p.tz}`);
  }
  return s;
}

function tileKeyStr(tx: number, tz: number): string {
  return `${tx},${tz}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function spawnNpcForSpawnerIfDue(ctx: any, spawner: any, worldTick: bigint, db: any): void {
  if (findNpcRowForSpawner(ctx, spawner.id)) return;
  if (worldTick < spawner.nextSpawnTick) return;
  const sx = spawner.tx as number;
  const sz = spawner.tz as number;
  const tplKey = String(spawner.templateKey);
  if (!isServerNpcTemplateKey(tplKey)) return;
  const maxHp = resolveServerNpcMaxHp(tplKey, spawner.hpOverride as number);
  const bite = resolveServerNpcBiteDamage(tplKey, spawner.dmgOverride as number);
  if (!isTileWalkableNpc(db, sx, sz)) return;
    ctx.db.serverNpc.insert({
    id: 0n,
    spawnerId: spawner.id,
    templateKey: tplKey,
    tx: sx,
    tz: sz,
    goalTx: sx,
    goalTz: sz,
    hp: maxHp,
    maxHp,
    biteDamage: bite,
  });
}

/**
 * OSRS-style wander / chase using templates' aggro distance; one tile per world tick max (matches client pacing).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tickServerNpcAi(ctx: any, worldTick: bigint, db: any): void {
  const occupiedBase = collectPlayerTiles(ctx);

  for (const npc of ctx.db.serverNpc.iter()) {
    const tpl = getServerNpcTemplate(npc.templateKey as string);
    const spawner = ctx.db.npcSpawner.id.find(npc.spawnerId);
    const homeTx = spawner ? (spawner.tx as number) : (npc.tx as number);
    const homeTz = spawner ? (spawner.tz as number) : (npc.tz as number);
    const wanderR = spawner ? Math.max(0, Math.floor(Number(spawner.wanderTiles) || 0)) : DEFAULT_WANDER_TILES;

    const skipId = npc.id as bigint;
    let occupied = collectOccupiedNpcTiles(ctx, skipId);
    for (const k of occupiedBase) occupied.add(k);

    const curTx = npc.tx as number;
    const curTz = npc.tz as number;
    let goalTx = npc.goalTx as number;
    let goalTz = npc.goalTz as number;

    const seed = worldTick + (npc.id as bigint) * 7919n;

    /** Find nearest player tile for aggro */
    let playerTx = curTx;
    let playerTz = curTz;
    let playerDist = 999;
    for (const p of ctx.db.player.iter()) {
      const d = chebyshev(curTx, curTz, p.tx as number, p.tz as number);
      if (d < playerDist) {
        playerDist = d;
        playerTx = p.tx as number;
        playerTz = p.tz as number;
      }
    }

    const chasing = playerDist <= tpl.aggroTiles;

    let newTx = curTx;
    let newTz = curTz;
    let newGoalTx = goalTx;
    let newGoalTz = goalTz;

    if (chasing) {
      if (areOrthogonallyAdjacent(curTx, curTz, playerTx, playerTz)) {
        newTx = curTx;
        newTz = curTz;
        newGoalTx = playerTx;
        newGoalTz = playerTz;
      } else {
        const step = stepToward(curTx, curTz, playerTx, playerTz);
        const sk = tileKeyStr(step.tx, step.tz);
        if (isTileWalkableNpc(db, step.tx, step.tz) && !occupied.has(sk)) {
          newTx = step.tx;
          newTz = step.tz;
        }
        newGoalTx = playerTx;
        newGoalTz = playerTz;
      }
    } else {
      if (curTx === goalTx && curTz === goalTz) {
        const roll = Number((seed * 13n) % 1000n);
        if (roll < NPC_IDLE_WANDER_CHANCE_PERMILLE) {
          const wg = pickWanderGoal(db, homeTx, homeTz, wanderR, seed);
          if (wg) {
            newGoalTx = wg.tx;
            newGoalTz = wg.tz;
          }
        } else {
          const [dx, dz] = randomOrthoStep(seed);
          const candTx = curTx + dx;
          const candTz = curTz + dz;
          const ck = tileKeyStr(candTx, candTz);
          const g = clampGlobalTile(candTx, candTz);
          if (
            chebyshev(g.tx, g.tz, homeTx, homeTz) <= wanderR &&
            isTileWalkableNpc(db, g.tx, g.tz) &&
            !occupied.has(ck)
          ) {
            newTx = g.tx;
            newTz = g.tz;
          }
        }
      } else {
        const step = stepToward(curTx, curTz, goalTx, goalTz);
        const sk = tileKeyStr(step.tx, step.tz);
        if (isTileWalkableNpc(db, step.tx, step.tz) && !occupied.has(sk)) {
          newTx = step.tx;
          newTz = step.tz;
        } else {
          const wg = pickWanderGoal(db, homeTx, homeTz, wanderR, seed + 17n);
          if (wg) {
            newGoalTx = wg.tx;
            newGoalTz = wg.tz;
          }
        }
      }
    }

    ctx.db.serverNpc.id.update({
      ...npc,
      tx: newTx,
      tz: newTz,
      goalTx: newGoalTx,
      goalTz: newGoalTz,
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function runServerNpcLifecycle(ctx: any, worldTick: bigint): void {
  const db = ctx.db.terrainChunk;
  for (const spawner of ctx.db.npcSpawner.iter()) {
    spawnNpcForSpawnerIfDue(ctx, spawner, worldTick, db);
  }
  tickServerNpcAi(ctx, worldTick, db);
}
