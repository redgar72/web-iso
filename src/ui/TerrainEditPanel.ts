import { previewHexForTextureIndex, type LevelChunkV1 } from '../../shared/levelChunk';
import type { TerrainPaintMode } from '../../shared/terrainBrush';

const PANEL_Z = 40;

const shellStyle =
  'background:linear-gradient(180deg,#252230 0%,#1a1820 100%);border:1px solid rgba(255,255,255,0.18);border-radius:12px;padding:12px 14px 14px;min-width:260px;max-width:min(320px,92vw);box-shadow:0 10px 36px rgba(0,0,0,0.55);font:13px sans-serif;color:#e4e0d8;';

export interface TerrainEditPanelOptions {
  /** Shown texture swatches (palette) — refetch when opening or after load. */
  getPaletteSource: () => LevelChunkV1 | null;
  /** Fires whenever the panel opens or closes (F4, close button, Escape). */
  onVisibilityChange?: (open: boolean) => void;
}

export interface TerrainEditPanelApi {
  root: HTMLElement;
  isOpen: () => boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  containsEventTarget: (t: EventTarget | null) => boolean;
  getMode: () => TerrainPaintMode;
  getTextureBrushIndex: () => number;
  getHeightStep: () => number;
  getBrushRadius: () => number;
  refreshPalette: () => void;
  setExportHandlers: (h: { exportThis: () => void; exportAll: () => void }) => void;
  dispose: () => void;
}

export function createTerrainEditPanel(host: HTMLElement, options: TerrainEditPanelOptions): TerrainEditPanelApi {
  let open = false;
  let mode: TerrainPaintMode = 'texture';
  let textureBrushIndex = 0;
  let heightStep = 0.5;
  let brushRadius = 0;
  const wrap = document.createElement('div');
  wrap.dataset.webIso = 'terrain-edit';
  wrap.style.cssText = [
    'position:absolute',
    'top:198px',
    'right:12px',
    `z-index:${PANEL_Z}`,
    'display:none',
    'flex-direction:column',
    'gap:10px',
    'pointer-events:auto',
  ].join(';');

  const shell = document.createElement('div');
  shell.style.cssText = shellStyle;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:2px;';
  const title = document.createElement('div');
  title.textContent = 'Terrain editor';
  title.style.cssText = 'font-weight:600;font-size:14px;color:#f0ebe4;';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close (F4)';
  closeBtn.style.cssText =
    'width:28px;height:28px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.35);color:#ccc;cursor:pointer;font-size:18px;line-height:1;padding:0;';
  closeBtn.addEventListener('click', () => setOpen(false));
  header.append(title, closeBtn);

  const hint = document.createElement('div');
  hint.textContent =
    'F4 toggles this panel. Cyan tiles show water while this is open. Left-click / drag to paint. Water/Dry only use brush size. Middle mouse orbits; wheel zooms (not over this panel).';
  hint.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.5);line-height:1.35;';

  const modeRow = document.createElement('div');
  modeRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;';
  const modeLabel = document.createElement('span');
  modeLabel.textContent = 'Mode';
  modeLabel.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.45);width:100%;';
  modeRow.appendChild(modeLabel);

  function modeBtn(label: string, m: TerrainPaintMode): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText =
      'padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.14);background:rgba(0,0,0,0.35);color:#ddd;cursor:pointer;font:12px sans-serif;';
    b.addEventListener('click', () => {
      mode = m;
      syncModeButtons();
      syncSections();
    });
    return b;
  }

  const btnTex = modeBtn('Texture', 'texture');
  const btnUp = modeBtn('Raise', 'raise');
  const btnDown = modeBtn('Lower', 'lower');
  const btnWater = modeBtn('Water', 'water');
  const btnDry = modeBtn('Dry', 'water_erase');
  modeRow.append(btnTex, btnUp, btnDown, btnWater, btnDry);

  const radiusRow = document.createElement('label');
  radiusRow.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,0.75);';
  radiusRow.appendChild(document.createTextNode('Brush (tiles)'));
  const radiusInput = document.createElement('input');
  radiusInput.type = 'number';
  radiusInput.min = '0';
  radiusInput.max = '8';
  radiusInput.step = '1';
  radiusInput.value = '0';
  radiusInput.style.cssText =
    'width:52px;padding:4px 6px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:#0e0c12;color:#eee;font:12px monospace;';
  function syncRadiusFromInput(): void {
    brushRadius = Math.max(0, Math.min(8, Math.floor(Number(radiusInput.value) || 0)));
    radiusInput.value = String(brushRadius);
  }
  radiusInput.addEventListener('change', syncRadiusFromInput);
  radiusInput.addEventListener('input', syncRadiusFromInput);
  radiusRow.appendChild(radiusInput);

  const stepRow = document.createElement('label');
  stepRow.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,0.75);';
  stepRow.appendChild(document.createTextNode('Height step'));
  const stepSelect = document.createElement('select');
  stepSelect.style.cssText =
    'flex:1;max-width:120px;padding:4px 6px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:#0e0c12;color:#eee;font:12px sans-serif;';
  for (const s of [0.1, 0.25, 0.5, 1, 2]) {
    const o = document.createElement('option');
    o.value = String(s);
    o.textContent = String(s);
    stepSelect.appendChild(o);
  }
  stepSelect.value = '0.5';
  stepSelect.addEventListener('change', () => {
    heightStep = Number(stepSelect.value) || 0.5;
  });
  stepRow.appendChild(stepSelect);

  const texSection = document.createElement('div');
  texSection.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  const texTitle = document.createElement('div');
  texTitle.textContent = 'Texture palette';
  texTitle.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.45);';
  const paletteMount = document.createElement('div');
  paletteMount.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:160px;overflow-y:auto;padding-right:4px;';
  texSection.append(texTitle, paletteMount);

  const exportRow = document.createElement('div');
  exportRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;';
  const exportThis = document.createElement('button');
  exportThis.type = 'button';
  exportThis.textContent = 'Export player chunk';
  exportThis.style.cssText =
    'padding:8px 10px;border-radius:8px;border:1px solid rgba(120,180,255,0.35);background:rgba(40,70,120,0.35);color:#cfe0ff;cursor:pointer;font:12px sans-serif;flex:1;min-width:112px;';
  const exportAll = document.createElement('button');
  exportAll.type = 'button';
  exportAll.textContent = 'Export all chunks';
  exportAll.title = 'Downloads every chunk JSON known to this session (staggered).';
  exportAll.style.cssText =
    'padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.14);background:rgba(0,0,0,0.35);color:#ddd;cursor:pointer;font:12px sans-serif;flex:1;min-width:112px;';
  exportRow.append(exportThis, exportAll);

  shell.append(header, hint, modeRow, radiusRow, stepRow, texSection, exportRow);
  wrap.appendChild(shell);
  host.appendChild(wrap);

  function syncModeButtons(): void {
    const buttons: [TerrainPaintMode, HTMLButtonElement][] = [
      ['texture', btnTex],
      ['raise', btnUp],
      ['lower', btnDown],
      ['water', btnWater],
      ['water_erase', btnDry],
    ];
    for (const [m, b] of buttons) {
      const on = m === mode;
      b.style.borderColor = on ? 'rgba(120,200,255,0.5)' : 'rgba(255,255,255,0.14)';
      b.style.background = on ? 'rgba(60,100,140,0.45)' : 'rgba(0,0,0,0.35)';
    }
  }

  function syncSections(): void {
    const showTex = mode === 'texture';
    const showStep = mode === 'raise' || mode === 'lower';
    texSection.style.display = showTex ? 'flex' : 'none';
    stepRow.style.display = showStep ? 'flex' : 'none';
  }

  function refreshPalette(): void {
    paletteMount.replaceChildren();
    const src = options.getPaletteSource();
    if (!src || src.texturePalette.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'Load terrain near you to see palette.';
      empty.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.4);';
      paletteMount.appendChild(empty);
      return;
    }
    textureBrushIndex = Math.min(textureBrushIndex, Math.max(0, src.texturePalette.length - 1));
    src.texturePalette.forEach((_id, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'width:100%',
        'padding:6px 8px',
        'border-radius:8px',
        'border:1px solid rgba(255,255,255,0.12)',
        'background:rgba(0,0,0,0.25)',
        'cursor:pointer',
        'text-align:left',
      ].join(';');
      const dot = document.createElement('span');
      dot.style.cssText = `display:inline-block;width:14px;height:14px;border-radius:4px;background:${previewHexForTextureIndex(i)};flex-shrink:0;border:1px solid rgba(255,255,255,0.2);`;
      const lab = document.createElement('span');
      lab.textContent = `${i}: ${src.texturePalette[i]}`;
      lab.style.cssText = 'font:12px sans-serif;color:#ddd;';
      row.append(dot, lab);
      row.addEventListener('click', () => {
        textureBrushIndex = i;
        refreshPalette();
      });
      if (i === textureBrushIndex) {
        row.style.borderColor = 'rgba(120,200,255,0.55)';
        row.style.background = 'rgba(50,80,110,0.4)';
      }
      paletteMount.appendChild(row);
    });
  }

  let onExportThis: ((() => void) | null) = null;
  let onExportAll: ((() => void) | null) = null;
  exportThis.addEventListener('click', () => onExportThis?.());
  exportAll.addEventListener('click', () => onExportAll?.());

  function setExportHandlers(h: { exportThis: () => void; exportAll: () => void }): void {
    onExportThis = h.exportThis;
    onExportAll = h.exportAll;
  }

  function setOpen(v: boolean): void {
    if (open === v) return;
    open = v;
    wrap.style.display = v ? 'flex' : 'none';
    if (v) refreshPalette();
    options.onVisibilityChange?.(v);
  }

  function isOpen(): boolean {
    return open;
  }

  function toggle(): void {
    setOpen(!open); // onVisibilityChange fired from setOpen
  }

  function containsEventTarget(t: EventTarget | null): boolean {
    return t instanceof Node && wrap.contains(t);
  }

  syncModeButtons();
  syncSections();
  refreshPalette();

  return {
    root: wrap,
    isOpen,
    setOpen,
    toggle,
    containsEventTarget,
    getMode: (): TerrainPaintMode => mode,
    getTextureBrushIndex: () => textureBrushIndex,
    getHeightStep: () => heightStep,
    getBrushRadius: () => brushRadius,
    refreshPalette,
    setExportHandlers,
    dispose: () => {
      wrap.remove();
    },
  };
}