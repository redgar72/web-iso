import type { GridTile } from '../world/TilePathfinding';
import { ORTHOGONAL_OFFSETS, canEnterTileOrthogonally, tileKey } from '../world/TilePathfinding';

/** Default Chebyshev radius from spawn/home tile for idle wandering. */
export const DEFAULT_NPC_MAX_WANDER_TILES = 4;

export function chebyshevTileDistance(a: GridTile, b: GridTile): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}

/**
 * One idle tick: either random wander within `maxWanderChebyshev` of `home`, or — if the NPC
 * left that radius while chasing — one step back toward `home`.
 */
export function pickNpcIdleStep(
  current: GridTile,
  home: GridTile,
  maxWanderChebyshev: number,
  occupied: Set<number>,
  rng01: () => number
): GridTile | null {
  const curDist = chebyshevTileDistance(current, home);
  const outsideLeash = curDist > maxWanderChebyshev;

  const orthNeighbors: GridTile[] = [];
  for (const [dx, dz] of ORTHOGONAL_OFFSETS) {
    const nx = current.x + dx;
    const nz = current.z + dz;
    const next = { x: nx, z: nz };
    if (!canEnterTileOrthogonally(current, next)) continue;
    if (occupied.has(tileKey(next))) continue;
    orthNeighbors.push(next);
  }
  if (orthNeighbors.length === 0) return null;

  if (outsideLeash) {
    let best = orthNeighbors[0]!;
    let bestD = chebyshevTileDistance(best, home);
    const ties: GridTile[] = [best];
    for (let i = 1; i < orthNeighbors.length; i++) {
      const n = orthNeighbors[i]!;
      const d = chebyshevTileDistance(n, home);
      if (d < bestD) {
        best = n;
        bestD = d;
        ties.length = 0;
        ties.push(n);
      } else if (d === bestD) {
        ties.push(n);
      }
    }
    return ties[Math.floor(rng01() * ties.length)]!;
  }

  const inWander: GridTile[] = [];
  for (const n of orthNeighbors) {
    if (chebyshevTileDistance(n, home) <= maxWanderChebyshev) inWander.push(n);
  }
  if (inWander.length === 0) return null;
  return inWander[Math.floor(rng01() * inWander.length)]!;
}
