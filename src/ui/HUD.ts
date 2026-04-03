/**
 * Game HUD: health/mana/XP bars, stats, timer, FPS, wave, and enemy health bars (world-projected).
 * Main passes full state each frame; HUD owns all DOM and updates from state.
 */

import * as THREE from 'three';
import {
  ENEMY_HEALTH_BAR_WIDTH,
  ENEMY_HEALTH_BAR_HEIGHT,
  HEALTH_BAR_Y_OFFSET,
} from '../config/Constants';

export interface HUDConfig {
  enemyCount: number;
  casterCount: number;
  resurrectorCount: number;
  teleporterCount: number;
  /** Flip run vs walk (tiles advanced per game tick). */
  onRunToggle: () => void;
}

export interface HUDState {
  canvasWidth: number;
  canvasHeight: number;
  camera: THREE.Camera;
  runTime: number;
  smoothedFps: number;
  /** Round-trip latency (ms) when multiplayer ping is active; null otherwise. */
  latencyMs: number | null;
  /** Game tick progress: 0 at tick boundary → 1 just before the next tick (~0.6s OSRS-style). */
  tickAlpha: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  level: number;
  xp: number;
  xpForNextLevel: number;
  currentWave: number;
  enemyPositions: THREE.Vector3[];
  enemyAlive: boolean[];
  enemyHealth: number[];
  enemyMaxHealth: number;
  casterPositions: THREE.Vector3[];
  casterAlive: boolean[];
  casterHealth: number[];
  casterMaxHealth: number;
  resurrectorPositions: THREE.Vector3[];
  resurrectorAlive: boolean[];
  resurrectorHealth: number[];
  resurrectorMaxHealth: number;
  teleporterPositions: THREE.Vector3[];
  teleporterAlive: boolean[];
  teleporterHealth: number[];
  teleporterMaxHealth: number;
  bossPosition: THREE.Vector3;
  bossAlive: boolean;
  bossHealth: number;
  bossMaxHealth: number;
  /** When true, path advances 2 tiles per tick; when false, 1 tile per tick. */
  runEnabled: boolean;
  runEnergy: number;
  runEnergyMax: number;
  /** Logged-in account name (SpacetimeDB); null hides the label. */
  accountUsername: string | null;
  /** World hover hint (walk / interact); empty hides. */
  hoverTooltip: string;
  /** Gathering: show a tick-style bar under the player; progress 0–1 until next harvest roll. */
  harvestTimerVisible: boolean;
  harvestTimerProgress: number;
  harvestTimerAnchor: THREE.Vector3;
}

export interface HUDAPI {
  update: (state: HUDState) => void;
  getBarsRoot: () => HTMLElement;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function createEnemyHealthBar(): { wrap: HTMLDivElement; fill: HTMLDivElement } {
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:absolute;width:${ENEMY_HEALTH_BAR_WIDTH}px;height:${ENEMY_HEALTH_BAR_HEIGHT}px;background:rgba(0,0,0,0.7);border-radius:2px;overflow:hidden;visibility:hidden;`;
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;background:linear-gradient(90deg,#c04040,#e06060);border-radius:2px;transition:width 0.08s;';
  wrap.appendChild(fill);
  return { wrap, fill };
}

export function createHUD(container: HTMLElement, config: HUDConfig): HUDAPI {
  const { enemyCount, casterCount, resurrectorCount, teleporterCount, onRunToggle } = config;
  const projectionVec = new THREE.Vector3();

  const perfStack = document.createElement('div');
  perfStack.id = 'hud-perf';
  const accountEl = document.createElement('div');
  accountEl.id = 'hud-account';
  accountEl.style.display = 'none';
  const fpsEl = document.createElement('div');
  fpsEl.id = 'fps';
  fpsEl.textContent = '— FPS';
  const latencyEl = document.createElement('div');
  latencyEl.id = 'latency';
  latencyEl.textContent = '— ms';
  perfStack.appendChild(accountEl);
  perfStack.appendChild(fpsEl);
  perfStack.appendChild(latencyEl);
  const hoverTooltipEl = document.createElement('div');
  hoverTooltipEl.id = 'hud-hover-tooltip';
  hoverTooltipEl.style.cssText =
    'font:12px system-ui,sans-serif;color:#d8d4e0;line-height:1.35;max-width:min(340px,92vw);' +
    'margin-top:6px;text-shadow:0 0 6px rgba(0,0,0,0.85);white-space:normal;';
  perfStack.appendChild(hoverTooltipEl);
  container.appendChild(perfStack);

  const timerEl = document.createElement('div');
  timerEl.id = 'timer';
  timerEl.textContent = 'Time: 0:00';
  container.appendChild(timerEl);

  const tickHud = document.createElement('div');
  tickHud.id = 'hud-tick-bar';
  tickHud.style.cssText =
    'position:absolute;top:40px;left:50%;transform:translateX(-50%);z-index:5;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;';
  const tickTrack = document.createElement('div');
  tickTrack.style.cssText =
    'position:relative;width:160px;height:8px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.2);border-radius:4px;box-sizing:border-box;';
  const tickNeedle = document.createElement('div');
  tickNeedle.style.cssText =
    'position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:rgba(255,220,120,0.95);border-radius:1px;box-shadow:0 0 6px rgba(255,200,80,0.5);left:0%;';
  tickTrack.appendChild(tickNeedle);
  tickHud.appendChild(tickTrack);
  container.appendChild(tickHud);

  const barStyle = 'width:180px;height:14px;background:rgba(0,0,0,0.6);border-radius:7px;overflow:hidden;border:1px solid rgba(255,255,255,0.15);';
  const fillStyle = 'height:100%;border-radius:6px;transition:width 0.15s ease-out;';

  const barsEl = document.createElement('div');
  barsEl.style.cssText = 'position:absolute;bottom:12px;left:12px;z-index:5;display:flex;flex-direction:column;gap:8px;pointer-events:none;';

  const healthLabel = document.createElement('div');
  healthLabel.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.85);margin-bottom:2px;';
  healthLabel.textContent = 'Health';
  const healthBarWrap = document.createElement('div');
  healthBarWrap.style.cssText = barStyle + 'pointer-events:auto;cursor:default;';
  const healthFill = document.createElement('div');
  healthFill.style.cssText = `width:100%;background:linear-gradient(90deg,#c04040,#e06060);${fillStyle}`;
  healthBarWrap.appendChild(healthFill);

  const manaLabel = document.createElement('div');
  manaLabel.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.85);margin-bottom:2px;';
  manaLabel.textContent = 'Mana';
  const manaBarWrap = document.createElement('div');
  manaBarWrap.style.cssText = barStyle + 'pointer-events:auto;cursor:default;';
  const manaFill = document.createElement('div');
  manaFill.style.cssText = `width:100%;background:linear-gradient(90deg,#3060a0,#50a0e0);${fillStyle}`;
  manaBarWrap.appendChild(manaFill);

  const levelXpEl = document.createElement('div');
  levelXpEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:8px;';
  const levelLabel = document.createElement('div');
  levelLabel.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.9);';
  const xpBarWrap = document.createElement('div');
  xpBarWrap.style.cssText = barStyle;
  const xpFill = document.createElement('div');
  xpFill.style.cssText = `width:0%;background:linear-gradient(90deg,#c0a030,#e8c050);${fillStyle}`;
  xpBarWrap.appendChild(xpFill);
  levelXpEl.appendChild(levelLabel);
  levelXpEl.appendChild(xpBarWrap);

  const controlsHintBar = document.createElement('div');
  controlsHintBar.textContent =
    'Space — Melee  |  K — Skills  |  I — Menu  |  RMB — Context menu';
  controlsHintBar.style.cssText = 'font:10px sans-serif;color:rgba(255,255,255,0.5);margin-top:4px;';

  const runEnergyLabel = document.createElement('div');
  runEnergyLabel.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.75);margin-top:8px;';
  runEnergyLabel.textContent = 'Run energy';
  const runEnergyBarWrap = document.createElement('div');
  runEnergyBarWrap.style.cssText =
    barStyle + 'width:180px;height:10px;pointer-events:auto;margin-top:2px;border-radius:5px;';
  const runEnergyFill = document.createElement('div');
  runEnergyFill.style.cssText =
    `width:100%;height:100%;border-radius:4px;background:linear-gradient(90deg,#b08020,#e8c860);${fillStyle}`;
  runEnergyBarWrap.appendChild(runEnergyFill);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.style.cssText =
    'align-self:flex-start;margin-top:8px;padding:6px 12px;font:12px sans-serif;border-radius:6px;cursor:pointer;' +
    'border:1px solid rgba(255,255,255,0.28);background:rgba(28,28,36,0.92);color:#eee;pointer-events:auto;' +
    'transition:opacity 0.12s,border-color 0.12s;';
  runBtn.addEventListener('click', () => onRunToggle());

  const waveLabelEl = document.createElement('div');
  waveLabelEl.style.cssText = 'font:10px sans-serif;color:rgba(255,255,255,0.6);margin-top:6px;margin-bottom:2px;';
  waveLabelEl.textContent = 'Current wave';
  const waveEl = document.createElement('div');
  waveEl.style.cssText = 'font:14px sans-serif;color:#e8c050;font-weight:bold;';

  barsEl.appendChild(healthLabel);
  barsEl.appendChild(healthBarWrap);
  barsEl.appendChild(manaLabel);
  barsEl.appendChild(manaBarWrap);
  barsEl.appendChild(levelXpEl);
  barsEl.appendChild(runEnergyLabel);
  barsEl.appendChild(runEnergyBarWrap);
  barsEl.appendChild(runBtn);
  barsEl.appendChild(controlsHintBar);
  barsEl.appendChild(waveLabelEl);
  barsEl.appendChild(waveEl);
  container.appendChild(barsEl);

  const enemyHealthBarsContainer = document.createElement('div');
  enemyHealthBarsContainer.id = 'hud-enemy-health-bars';
  enemyHealthBarsContainer.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;';

  const enemyHealthBarEls: { wrap: HTMLDivElement; fill: HTMLDivElement }[] = [];
  for (let j = 0; j < enemyCount; j++) {
    const bar = createEnemyHealthBar();
    enemyHealthBarsContainer.appendChild(bar.wrap);
    enemyHealthBarEls.push(bar);
  }
  const casterHealthBarEls: { wrap: HTMLDivElement; fill: HTMLDivElement }[] = [];
  for (let c = 0; c < casterCount; c++) {
    const bar = createEnemyHealthBar();
    enemyHealthBarsContainer.appendChild(bar.wrap);
    casterHealthBarEls.push(bar);
  }
  const resurrectorHealthBarEls: { wrap: HTMLDivElement; fill: HTMLDivElement }[] = [];
  for (let r = 0; r < resurrectorCount; r++) {
    const bar = createEnemyHealthBar();
    enemyHealthBarsContainer.appendChild(bar.wrap);
    resurrectorHealthBarEls.push(bar);
  }
  const teleporterHealthBarEls: { wrap: HTMLDivElement; fill: HTMLDivElement }[] = [];
  for (let t = 0; t < teleporterCount; t++) {
    const bar = createEnemyHealthBar();
    bar.fill.style.background = 'linear-gradient(90deg,#206040,#40a060)';
    enemyHealthBarsContainer.appendChild(bar.wrap);
    teleporterHealthBarEls.push(bar);
  }
  const bossHealthBarEl = createEnemyHealthBar();
  bossHealthBarEl.fill.style.background = 'linear-gradient(90deg,#8b0000,#c03030)';
  enemyHealthBarsContainer.appendChild(bossHealthBarEl.wrap);

  const HARVEST_TIMER_BAR_W = 80;
  const HARVEST_TIMER_BAR_H = 8;
  const harvestTimerWrap = document.createElement('div');
  harvestTimerWrap.id = 'hud-harvest-timer';
  harvestTimerWrap.style.cssText = `position:absolute;width:${HARVEST_TIMER_BAR_W}px;z-index:4;pointer-events:none;visibility:hidden;display:flex;flex-direction:column;align-items:center;gap:3px;`;
  const harvestTimerTrack = document.createElement('div');
  harvestTimerTrack.style.cssText = `position:relative;width:100%;height:${HARVEST_TIMER_BAR_H}px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.2);border-radius:4px;box-sizing:border-box;`;
  const harvestTimerNeedle = document.createElement('div');
  harvestTimerNeedle.style.cssText =
    'position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:rgba(120,200,140,0.95);border-radius:1px;box-shadow:0 0 6px rgba(80,180,100,0.55);left:0%;';
  harvestTimerTrack.appendChild(harvestTimerNeedle);
  harvestTimerWrap.appendChild(harvestTimerTrack);
  enemyHealthBarsContainer.appendChild(harvestTimerWrap);

  container.appendChild(enemyHealthBarsContainer);

  function update(state: HUDState): void {
    const { canvasWidth: cw, canvasHeight: ch, camera } = state;

    const un = state.accountUsername;
    if (un) {
      accountEl.style.display = '';
      accountEl.textContent = un;
    } else {
      accountEl.style.display = 'none';
    }

    fpsEl.textContent = `${Math.round(state.smoothedFps)} FPS`;
    latencyEl.textContent =
      state.latencyMs !== null ? `${Math.round(state.latencyMs)} ms` : '— ms';
    const ht = state.hoverTooltip;
    if (ht) {
      hoverTooltipEl.style.display = '';
      hoverTooltipEl.textContent = ht;
    } else {
      hoverTooltipEl.style.display = 'none';
    }
    timerEl.textContent = `Time: ${formatTime(state.runTime)}`;

    const a = Math.min(1, Math.max(0, state.tickAlpha));
    tickNeedle.style.left = `${a * 100}%`;

    if (state.harvestTimerVisible) {
      const anchor = state.harvestTimerAnchor;
      projectionVec.set(anchor.x, anchor.y, anchor.z);
      projectionVec.project(camera);
      const px = (projectionVec.x * 0.5 + 0.5) * cw;
      const py = (1 - (projectionVec.y * 0.5 + 0.5)) * ch;
      const prog = Math.min(1, Math.max(0, state.harvestTimerProgress));
      harvestTimerNeedle.style.left = `${prog * 100}%`;
      harvestTimerWrap.style.left = `${px - HARVEST_TIMER_BAR_W / 2}px`;
      harvestTimerWrap.style.top = `${py + 14}px`;
      harvestTimerWrap.style.visibility = 'visible';
    } else {
      harvestTimerWrap.style.visibility = 'hidden';
    }

    healthBarWrap.title = `${state.health} / ${state.maxHealth}`;
    healthFill.style.width = `${state.maxHealth > 0 ? (state.health / state.maxHealth) * 100 : 0}%`;

    manaBarWrap.title = `${state.mana} / ${state.maxMana}`;
    manaFill.style.width = `${state.maxMana > 0 ? (state.mana / state.maxMana) * 100 : 0}%`;

    levelLabel.textContent = `Level ${state.level}`;
    const xpPct = state.xpForNextLevel > 0 ? (state.xp / state.xpForNextLevel) * 100 : 0;
    xpFill.style.width = `${xpPct}%`;
    xpBarWrap.title = `${state.xp} / ${state.xpForNextLevel} XP`;

    waveEl.textContent = String(state.currentWave);

    const reMax = state.runEnergyMax > 0 ? state.runEnergyMax : 1;
    const rePct = Math.min(100, (state.runEnergy / reMax) * 100);
    runEnergyFill.style.width = `${rePct}%`;
    runEnergyBarWrap.title = `${Math.round(state.runEnergy)} / ${state.runEnergyMax} — drains only when a tick moves 2 tiles; 1-tile steps cost nothing; regains while idle`;

    runBtn.textContent = state.runEnabled ? 'Run' : 'Walk';
    runBtn.title = state.runEnabled
      ? 'Running: 2 tiles per tick when path allows; energy drops only on those 2-tile steps. Click to walk.'
      : `Walking: 1 tile per tick. Need run energy to run (${Math.round(state.runEnergy)} now).`;
    const canRun = state.runEnergy > 0;
    runBtn.style.opacity = state.runEnabled ? '1' : canRun ? '0.88' : '0.55';
    runBtn.style.borderColor = state.runEnabled
      ? 'rgba(120, 200, 140, 0.55)'
      : canRun
        ? 'rgba(255,255,255,0.22)'
        : 'rgba(255,255,255,0.12)';

    for (let j = 0; j < enemyCount; j++) {
      const bar = enemyHealthBarEls[j];
      if (!state.enemyAlive[j]) {
        bar.wrap.style.visibility = 'hidden';
        continue;
      }
      projectionVec.set(
        state.enemyPositions[j].x,
        state.enemyPositions[j].y + HEALTH_BAR_Y_OFFSET,
        state.enemyPositions[j].z
      );
      projectionVec.project(camera);
      const px = (projectionVec.x * 0.5 + 0.5) * cw;
      const py = (1 - (projectionVec.y * 0.5 + 0.5)) * ch;
      bar.wrap.style.left = `${px - ENEMY_HEALTH_BAR_WIDTH / 2}px`;
      bar.wrap.style.top = `${py - ENEMY_HEALTH_BAR_HEIGHT - 4}px`;
      bar.wrap.style.visibility = 'visible';
      bar.fill.style.width = `${(state.enemyHealth[j] / state.enemyMaxHealth) * 100}%`;
    }
    for (let c = 0; c < casterCount; c++) {
      const bar = casterHealthBarEls[c];
      if (!state.casterAlive[c]) {
        bar.wrap.style.visibility = 'hidden';
        continue;
      }
      const pos = state.casterPositions[c];
      projectionVec.set(pos.x, pos.y + HEALTH_BAR_Y_OFFSET, pos.z);
      projectionVec.project(camera);
      const px = (projectionVec.x * 0.5 + 0.5) * cw;
      const py = (1 - (projectionVec.y * 0.5 + 0.5)) * ch;
      bar.wrap.style.left = `${px - ENEMY_HEALTH_BAR_WIDTH / 2}px`;
      bar.wrap.style.top = `${py - ENEMY_HEALTH_BAR_HEIGHT - 4}px`;
      bar.wrap.style.visibility = 'visible';
      bar.fill.style.width = `${(state.casterHealth[c] / state.casterMaxHealth) * 100}%`;
    }
    for (let r = 0; r < resurrectorCount; r++) {
      const bar = resurrectorHealthBarEls[r];
      if (!state.resurrectorAlive[r]) {
        bar.wrap.style.visibility = 'hidden';
        continue;
      }
      const pos = state.resurrectorPositions[r];
      projectionVec.set(pos.x, pos.y + HEALTH_BAR_Y_OFFSET, pos.z);
      projectionVec.project(camera);
      const px = (projectionVec.x * 0.5 + 0.5) * cw;
      const py = (1 - (projectionVec.y * 0.5 + 0.5)) * ch;
      bar.wrap.style.left = `${px - ENEMY_HEALTH_BAR_WIDTH / 2}px`;
      bar.wrap.style.top = `${py - ENEMY_HEALTH_BAR_HEIGHT - 4}px`;
      bar.wrap.style.visibility = 'visible';
      bar.fill.style.width = `${(state.resurrectorHealth[r] / state.resurrectorMaxHealth) * 100}%`;
    }
    for (let t = 0; t < teleporterCount; t++) {
      const bar = teleporterHealthBarEls[t];
      if (!state.teleporterAlive[t]) {
        bar.wrap.style.visibility = 'hidden';
        continue;
      }
      const pos = state.teleporterPositions[t];
      projectionVec.set(pos.x, pos.y + HEALTH_BAR_Y_OFFSET, pos.z);
      projectionVec.project(camera);
      const px = (projectionVec.x * 0.5 + 0.5) * cw;
      const py = (1 - (projectionVec.y * 0.5 + 0.5)) * ch;
      bar.wrap.style.left = `${px - ENEMY_HEALTH_BAR_WIDTH / 2}px`;
      bar.wrap.style.top = `${py - ENEMY_HEALTH_BAR_HEIGHT - 4}px`;
      bar.wrap.style.visibility = 'visible';
      bar.fill.style.width = `${(state.teleporterHealth[t] / state.teleporterMaxHealth) * 100}%`;
    }
    if (!state.bossAlive) {
      bossHealthBarEl.wrap.style.visibility = 'hidden';
    } else {
      projectionVec.set(
        state.bossPosition.x,
        state.bossPosition.y + HEALTH_BAR_Y_OFFSET,
        state.bossPosition.z
      );
      projectionVec.project(camera);
      const px = (projectionVec.x * 0.5 + 0.5) * cw;
      const py = (1 - (projectionVec.y * 0.5 + 0.5)) * ch;
      bossHealthBarEl.wrap.style.left = `${px - ENEMY_HEALTH_BAR_WIDTH / 2}px`;
      bossHealthBarEl.wrap.style.top = `${py - ENEMY_HEALTH_BAR_HEIGHT - 4}px`;
      bossHealthBarEl.wrap.style.visibility = 'visible';
      bossHealthBarEl.fill.style.width = `${(state.bossHealth / state.bossMaxHealth) * 100}%`;
    }
  }

  return {
    update,
    getBarsRoot: () => barsEl,
  };
}
