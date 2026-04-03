import { TILE_HALF, TILE_SIZE } from '../scene/IsoTerrain';
import { TERRAIN_GRID_DEPTH, TERRAIN_GRID_WIDTH } from '../../shared/world';

/** Tile indices match instancing in IsoTerrain: x → world X, z → world Z. */
export interface GridTile {
  x: number;
  z: number;
}

export { TERRAIN_GRID_WIDTH, TERRAIN_GRID_DEPTH };

/**
 * Passable edges from a tile center: whether you can step to the neighbor in that direction (+z = north).
 * Two adjacent tiles must both allow the shared edge for a step to succeed.
 */
export interface TileNavProfile {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
  /** If false, nothing may stand here (goals, diagonal corner cuts). Default true. */
  occupiable?: boolean;
}

export const DEFAULT_TILE_NAV: TileNavProfile = {
  north: true,
  east: true,
  south: true,
  west: true,
};

/**
 * OSRS pathfinding expands neighbors in this order (cardinals before diagonals; east/west before south/north).
 * @see https://oldschool.runescape.wiki/w/Pathfinding
 */
const BFS_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], // West
  [1, 0], // East
  [0, -1], // South
  [0, 1], // North
  [-1, -1], // South-west
  [1, -1], // South-east
  [-1, 1], // North-west
  [1, 1], // North-east
];

/** Cardinal neighbours only (edges, not corners). */
export const ORTHOGONAL_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function clampToGrid(tile: GridTile): GridTile {
  return {
    x: Math.max(0, Math.min(TERRAIN_GRID_WIDTH - 1, tile.x)),
    z: Math.max(0, Math.min(TERRAIN_GRID_DEPTH - 1, tile.z)),
  };
}

export function tileKey(t: GridTile): number {
  return t.x * TERRAIN_GRID_DEPTH + t.z;
}

export function worldXZToTile(wx: number, wz: number): GridTile {
  const x = Math.floor(wx / TILE_SIZE);
  const z = Math.floor(wz / TILE_SIZE);
  return clampToGrid({ x, z });
}

export function tileCenterXZ(tile: GridTile): { x: number; z: number } {
  return {
    x: tile.x * TILE_SIZE + TILE_HALF,
    z: tile.z * TILE_SIZE + TILE_HALF,
  };
}

/** Coords not in this map use {@link DEFAULT_TILE_NAV}. */
const tileNavExceptions = new Map<number, TileNavProfile>();

export function getTileNavProfile(tile: GridTile): TileNavProfile {
  return tileNavExceptions.get(tileKey(clampToGrid(tile))) ?? DEFAULT_TILE_NAV;
}

export function isTileOccupiable(tile: GridTile): boolean {
  return getTileNavProfile(clampToGrid(tile)).occupiable !== false;
}

/** True if a unit may stand on this cell (used for goals and diagonal corner checks). */
export function isTileWalkableForPathfinding(tile: GridTile): boolean {
  return isTileOccupiable(tile);
}

/**
 * Shortest grid distance (BFS over 4-neighbors) to an {@link isTileOccupiable} cell, including `start`.
 * Returns null only if the entire reachable component has no occupiable tiles (should not happen for valid worlds).
 */
export function findNearestOccupiableTile(start: GridTile): GridTile | null {
  const s = clampToGrid(start);
  const startK = tileKey(s);
  if (isTileOccupiable(s)) return s;

  const visited = new Set<number>([startK]);
  const q: GridTile[] = [s];

  while (q.length > 0) {
    const cur = q.shift()!;
    for (const [dx, dz] of ORTHOGONAL_OFFSETS) {
      const nx = cur.x + dx;
      const nz = cur.z + dz;
      if (nx < 0 || nx >= TERRAIN_GRID_WIDTH || nz < 0 || nz >= TERRAIN_GRID_DEPTH) continue;
      const next: GridTile = { x: nx, z: nz };
      const nk = tileKey(next);
      if (visited.has(nk)) continue;
      visited.add(nk);
      if (isTileOccupiable(next)) return next;
      q.push(next);
    }
  }

  return null;
}

/**
 * Replace all navigation exceptions. Omit a coordinate to use the default profile for that tile.
 * Typical caller merges static barriers, gathering nodes, and dynamic gates in one list.
 */
export function replaceTileNavExceptions(
  entries: ReadonlyArray<{ tile: GridTile; profile: TileNavProfile }>
): void {
  tileNavExceptions.clear();
  for (const { tile, profile } of entries) {
    tileNavExceptions.set(tileKey(clampToGrid(tile)), { ...profile });
  }
}

export function clearTileNavExceptions(): void {
  tileNavExceptions.clear();
}

/** Orthogonal step from `from` onto `to` (must be edge-adjacent). */
export function canCrossOrthogonalEdge(from: GridTile, to: GridTile): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.abs(dx) + Math.abs(dz) !== 1) return false;
  const pf = getTileNavProfile(from);
  const pt = getTileNavProfile(to);
  if (dx === 1) return pf.east && pt.west;
  if (dx === -1) return pf.west && pt.east;
  if (dz === 1) return pf.north && pt.south;
  return pf.south && pt.north;
}

export function canEnterTileOrthogonally(from: GridTile, to: GridTile): boolean {
  if (!isTileOccupiable(to)) return false;
  return canCrossOrthogonalEdge(from, to);
}

function canStepTo(cur: GridTile, dx: number, dz: number): boolean {
  const nx = cur.x + dx;
  const nz = cur.z + dz;
  if (nx < 0 || nx >= TERRAIN_GRID_WIDTH || nz < 0 || nz >= TERRAIN_GRID_DEPTH) return false;
  const dest: GridTile = { x: nx, z: nz };
  if (!isTileOccupiable(dest)) return false;

  if (dx === 0 || dz === 0) {
    return canCrossOrthogonalEdge(cur, dest);
  }

  const midX: GridTile = { x: cur.x + dx, z: cur.z };
  const midZ: GridTile = { x: cur.x, z: cur.z + dz };
  if (!isTileOccupiable(midX)) return false;
  if (!isTileOccupiable(midZ)) return false;
  if (!canCrossOrthogonalEdge(cur, midX)) return false;
  if (!canCrossOrthogonalEdge(cur, midZ)) return false;
  if (!canCrossOrthogonalEdge(midX, dest)) return false;
  if (!canCrossOrthogonalEdge(midZ, dest)) return false;
  return true;
}

/** 8-neighbour BFS with OSRS expansion order; respects tile nav profiles. */
export function findTilePath(start: GridTile, goal: GridTile): GridTile[] | null {
  const s = clampToGrid(start);
  const g = clampToGrid(goal);
  if (!isTileOccupiable(s) || !isTileOccupiable(g)) return null;
  if (s.x === g.x && s.z === g.z) return [s];

  const startK = tileKey(s);
  const goalK = tileKey(g);
  const visited = new Set<number>([startK]);
  const prev = new Map<number, number>();
  const q: GridTile[] = [s];

  while (q.length > 0) {
    const cur = q.shift()!;
    const ck = tileKey(cur);
    if (ck === goalK) {
      const out: GridTile[] = [];
      let k: number | undefined = goalK;
      while (k !== undefined) {
        const z = k % TERRAIN_GRID_DEPTH;
        const x = (k - z) / TERRAIN_GRID_DEPTH;
        out.push({ x, z });
        k = prev.get(k);
      }
      out.reverse();
      return out;
    }

    for (const [dx, dz] of BFS_OFFSETS) {
      if (!canStepTo(cur, dx, dz)) continue;
      const nx = cur.x + dx;
      const nz = cur.z + dz;
      const nk = nx * TERRAIN_GRID_DEPTH + nz;
      if (visited.has(nk)) continue;
      visited.add(nk);
      prev.set(nk, ck);
      q.push({ x: nx, z: nz });
    }
  }

  return null;
}

/** First step along the OSRS BFS path from start toward goal (one tile), or null if already at goal / unreachable. */
export function nextTileTowardGoal(from: GridTile, goal: GridTile): GridTile | null {
  const path = findTilePath(from, goal);
  if (!path || path.length < 2) return null;
  return path[1];
}

export function areOrthogonallyAdjacent(a: GridTile, b: GridTile): boolean {
  const dx = Math.abs(a.x - b.x);
  const dz = Math.abs(a.z - b.z);
  return (dx === 1 && dz === 0) || (dx === 0 && dz === 1);
}

/**
 * Among tiles that share an edge with `targetTile`, pick one reachable from `start` with the shortest path.
 * Ties keep the first candidate in ORTHOGONAL_OFFSETS order.
 *
 * Requires {@link canCrossOrthogonalEdge} from neighbor into `targetTile` — correct when you must step onto
 * the target (e.g. open ground). Not for solid interactables (trees, rocks): use
 * {@link findClosestReachableOrthAdjacentStandTile}.
 */
export function findClosestReachableOrthAdjacentTile(start: GridTile, targetTile: GridTile): GridTile | null {
  const s = clampToGrid(start);
  const t = clampToGrid(targetTile);
  let best: GridTile | null = null;
  let bestLen = Infinity;
  for (const [dx, dz] of ORTHOGONAL_OFFSETS) {
    const nx = t.x + dx;
    const nz = t.z + dz;
    if (nx < 0 || nx >= TERRAIN_GRID_WIDTH || nz < 0 || nz >= TERRAIN_GRID_DEPTH) continue;
    const neighbor: GridTile = { x: nx, z: nz };
    if (!isTileOccupiable(neighbor)) continue;
    if (!canCrossOrthogonalEdge(neighbor, t)) continue;
    const path = findTilePath(s, neighbor);
    if (path === null) continue;
    if (path.length < bestLen) {
      bestLen = path.length;
      best = neighbor;
    }
  }
  return best;
}

/**
 * Orthogonal neighbors of `solidTargetTile` that are occupiable and reachable from `start`, picking the
 * shortest path. Does not require crossing into `solidTargetTile` (gathering nodes block all inward edges).
 */
export function findClosestReachableOrthAdjacentStandTile(
  start: GridTile,
  solidTargetTile: GridTile
): GridTile | null {
  const s = clampToGrid(start);
  const t = clampToGrid(solidTargetTile);
  let best: GridTile | null = null;
  let bestLen = Infinity;
  for (const [dx, dz] of ORTHOGONAL_OFFSETS) {
    const nx = t.x + dx;
    const nz = t.z + dz;
    if (nx < 0 || nx >= TERRAIN_GRID_WIDTH || nz < 0 || nz >= TERRAIN_GRID_DEPTH) continue;
    const neighbor: GridTile = { x: nx, z: nz };
    if (!isTileOccupiable(neighbor)) continue;
    const path = findTilePath(s, neighbor);
    if (path === null) continue;
    if (path.length < bestLen) {
      bestLen = path.length;
      best = neighbor;
    }
  }
  return best;
}

/**
 * Among adjacent tiles (OSRS neighbour order), pick one that maximizes tile-distance² from `awayFromTile`
 * (kite / retreat).
 */
export function pickGreedyStepAway(from: GridTile, awayFromTile: GridTile): GridTile | null {
  let best: GridTile | null = null;
  let bestScore = -1;
  const px = awayFromTile.x;
  const pz = awayFromTile.z;
  for (const [dx, dz] of BFS_OFFSETS) {
    if (!canStepTo(from, dx, dz)) continue;
    const nx = from.x + dx;
    const nz = from.z + dz;
    const score = (nx - px) * (nx - px) + (nz - pz) * (nz - pz);
    if (score > bestScore) {
      bestScore = score;
      best = { x: nx, z: nz };
    }
  }
  return best;
}
