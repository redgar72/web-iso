import { TERRAIN_GRID_DEPTH, TERRAIN_GRID_WIDTH } from './world';

export type TerrainPaintMode = 'texture' | 'raise' | 'lower' | 'water' | 'water_erase';

function clampTileCoord(tx: number, tz: number): { tx: number; tz: number } {
  return {
    tx: Math.max(0, Math.min(TERRAIN_GRID_WIDTH - 1, tx)),
    tz: Math.max(0, Math.min(TERRAIN_GRID_DEPTH - 1, tz)),
  };
}

export function forEachUniqueTileInBrush(
  centerTx: number,
  centerTz: number,
  brushRadius: number,
  fn: (tx: number, tz: number) => void
): void {
  const seen = new Set<string>();
  const r = Math.max(0, Math.floor(brushRadius));
  const visit = (tx: number, tz: number): void => {
    const c = clampTileCoord(tx, tz);
    const k = `${c.tx},${c.tz}`;
    if (seen.has(k)) return;
    seen.add(k);
    fn(c.tx, c.tz);
  };
  if (r === 0) {
    visit(centerTx, centerTz);
    return;
  }
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) > r) continue;
      visit(centerTx + dx, centerTz + dz);
    }
  }
}
