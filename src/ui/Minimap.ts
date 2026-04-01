/**
 * Top-right minimap: player-centered, world XZ. Scroll wheel over the panel zooms (does not affect main camera).
 */

export interface MinimapUpdate {
  readonly playerX: number;
  readonly playerZ: number;
  /** Yellow — NPCs / enemies / ambient mobs. */
  readonly npcYellow: ReadonlyArray<{ x: number; z: number }>;
  /** White — other human players (not local). */
  readonly playersWhite: ReadonlyArray<{ x: number; z: number }>;
  /** Red — ground item pickups. */
  readonly itemsRed: ReadonlyArray<{ x: number; z: number }>;
}

const DEFAULT_SIZE = 176;

export function createMinimap(host: HTMLElement): {
  update: (state: MinimapUpdate) => void;
  dispose: () => void;
} {
  const wrap = document.createElement('div');
  wrap.dataset.webIso = 'minimap';
  wrap.title = 'Minimap — scroll to zoom';
  wrap.style.cssText = [
    'position:absolute',
    'top:12px',
    'right:12px',
    `width:${DEFAULT_SIZE}px`,
    `height:${DEFAULT_SIZE}px`,
    'z-index:8',
    'border:1px solid rgba(255,255,255,0.22)',
    'border-radius:10px',
    'box-shadow:0 6px 22px rgba(0,0,0,0.55)',
    'overflow:hidden',
    'background:rgba(6,8,14,0.96)',
    'pointer-events:auto',
    'touch-action:none',
  ].join(';');

  const canvas = document.createElement('canvas');
  canvas.width = DEFAULT_SIZE;
  canvas.height = DEFAULT_SIZE;
  canvas.style.cssText = 'display:block;width:100%;height:100%;vertical-align:top';
  wrap.appendChild(canvas);
  host.appendChild(wrap);

  const ctx = canvas.getContext('2d')!;
  /** World XZ half-span from player to map edge (smaller = more zoomed in). */
  let halfExtent = 40;
  const MIN_EXTENT = 12;
  const MAX_EXTENT = 145;
  const ZOOM_STEP = 3.2;

  let hover = false;
  wrap.addEventListener('mouseenter', () => {
    hover = true;
  });
  wrap.addEventListener('mouseleave', () => {
    hover = false;
  });
  wrap.addEventListener(
    'wheel',
    (e) => {
      if (!hover) return;
      e.preventDefault();
      e.stopPropagation();
      const next = halfExtent + Math.sign(e.deltaY) * ZOOM_STEP;
      halfExtent = Math.min(MAX_EXTENT, Math.max(MIN_EXTENT, next));
    },
    { passive: false }
  );

  function worldToMap(
    wx: number,
    wz: number,
    px: number,
    pz: number,
    scale: number,
    cx: number,
    cy: number
  ): { mx: number; my: number } {
    return {
      mx: cx + (wx - px) * scale,
      my: cy - (wz - pz) * scale,
    };
  }

  function fillDot(mx: number, my: number, r: number, fill: string, stroke?: string): void {
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function update(state: MinimapUpdate): void {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const scale = (w * 0.5) / halfExtent;

    ctx.fillStyle = 'rgba(10,12,18,1)';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    const gridStepWorld = 8;
    const gx0 = state.playerX - halfExtent;
    const gx1 = state.playerX + halfExtent;
    const gz0 = state.playerZ - halfExtent;
    const gz1 = state.playerZ + halfExtent;
    const xStart = Math.floor(gx0 / gridStepWorld) * gridStepWorld;
    const zStart = Math.floor(gz0 / gridStepWorld) * gridStepWorld;
    for (let x = xStart; x <= gx1; x += gridStepWorld) {
      const a = worldToMap(x, state.playerZ, state.playerX, state.playerZ, scale, cx, cy);
      ctx.beginPath();
      ctx.moveTo(a.mx, 0);
      ctx.lineTo(a.mx, h);
      ctx.stroke();
    }
    for (let z = zStart; z <= gz1; z += gridStepWorld) {
      const a = worldToMap(state.playerX, z, state.playerX, state.playerZ, scale, cx, cy);
      ctx.beginPath();
      ctx.moveTo(0, a.my);
      ctx.lineTo(w, a.my);
      ctx.stroke();
    }

    for (const p of state.npcYellow) {
      const { mx, my } = worldToMap(p.x, p.z, state.playerX, state.playerZ, scale, cx, cy);
      if (mx < -6 || mx > w + 6 || my < -6 || my > h + 6) continue;
      fillDot(mx, my, 3.2, '#d4af3a', 'rgba(0,0,0,0.45)');
    }

    for (const p of state.itemsRed) {
      const { mx, my } = worldToMap(p.x, p.z, state.playerX, state.playerZ, scale, cx, cy);
      if (mx < -5 || mx > w + 5 || my < -5 || my > h + 5) continue;
      fillDot(mx, my, 2.6, '#e04545', 'rgba(0,0,0,0.5)');
    }

    for (const p of state.playersWhite) {
      const { mx, my } = worldToMap(p.x, p.z, state.playerX, state.playerZ, scale, cx, cy);
      if (mx < -6 || mx > w + 6 || my < -6 || my > h + 6) continue;
      fillDot(mx, my, 3, '#f4f4f4', 'rgba(0,0,0,0.5)');
    }

    fillDot(cx, cy, 3.8, '#ffffff', 'rgba(0,0,0,0.55)');

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  function dispose(): void {
    wrap.remove();
  }

  return { update, dispose };
}
