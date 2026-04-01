import {
  CHUNK_SIZE,
  CHUNK_TILE_COUNT,
  createEmptyChunkV1,
  indexToXZ64,
  parseLevelChunkJson,
  previewHexForTextureIndex,
  serializeLevelChunk,
  tileIndexXZ64,
  type LevelChunkV1,
} from '../../shared/levelChunk';

const TILE_PX = 8;
const canvas = document.querySelector<HTMLCanvasElement>('#grid')!;
const ctx = canvas.getContext('2d')!;
const paletteEl = document.querySelector<HTMLDivElement>('#palette')!;

let chunk: LevelChunkV1 = createEmptyChunkV1('untitled');
let brushIndex = 0;
let isPainting = false;

function syncPaletteButtons(): void {
  paletteEl.replaceChildren();
  chunk.texturePalette.forEach((id, i) => {
    const row = document.createElement('div');
    row.className = 'swatch';
    row.dataset.active = String(i === brushIndex);
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.background = previewHexForTextureIndex(i);
    const label = document.createElement('span');
    label.textContent = `${i}: ${id}`;
    row.append(dot, label);
    row.addEventListener('click', () => {
      brushIndex = i;
      syncPaletteButtons();
    });
    paletteEl.append(row);
  });
}

function draw(): void {
  const { textureIndices } = chunk;
  for (let i = 0; i < CHUNK_TILE_COUNT; i++) {
    const p = textureIndices[i] ?? 0;
    const { x, z } = indexToXZ64(i);
    ctx.fillStyle = previewHexForTextureIndex(p);
    ctx.fillRect(x * TILE_PX, z * TILE_PX, TILE_PX, TILE_PX);
  }
}

function paintAtClient(clientX: number, clientY: number): void {
  const r = canvas.getBoundingClientRect();
  const scaleX = canvas.width / r.width;
  const scaleY = canvas.height / r.height;
  const cx = (clientX - r.left) * scaleX;
  const cy = (clientY - r.top) * scaleY;
  const x = Math.floor(cx / TILE_PX);
  const z = Math.floor(cy / TILE_PX);
  if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
  const i = tileIndexXZ64(x, z);
  chunk.textureIndices[i] = brushIndex;
  draw();
}

canvas.addEventListener('mousedown', (e) => {
  isPainting = true;
  paintAtClient(e.clientX, e.clientY);
});
window.addEventListener('mouseup', () => {
  isPainting = false;
});
canvas.addEventListener('mouseleave', () => {
  isPainting = false;
});
canvas.addEventListener('mousemove', (e) => {
  if (!isPainting) return;
  paintAtClient(e.clientX, e.clientY);
});

document.querySelector('#btn-new')!.addEventListener('click', () => {
  chunk = createEmptyChunkV1('untitled');
  brushIndex = 0;
  syncPaletteButtons();
  draw();
});

document.querySelector('#btn-save')!.addEventListener('click', () => {
  const base = (chunk.name ?? 'chunk').replace(/[^a-z0-9-_]+/gi, '_');
  const blob = new Blob([serializeLevelChunk(chunk)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${base}.chunk.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.querySelector('#file-open')!.addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const text = await file.text();
  try {
    chunk = parseLevelChunkJson(text);
    brushIndex = Math.min(brushIndex, Math.max(0, chunk.texturePalette.length - 1));
    syncPaletteButtons();
    draw();
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Failed to open file');
  }
});

syncPaletteButtons();
draw();
