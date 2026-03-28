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
}

export interface HUDState {
  canvasWidth: number;
  canvasHeight: number;
  camera: THREE.Camera;
  runTime: number;
  smoothedFps: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  level: number;
  xp: number;
  xpForNextLevel: number;
  strength: number;
  intelligence: number;
  dexterity: number;
  vitality: number;
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
  const { enemyCount, casterCount, resurrectorCount, teleporterCount } = config;
  const projectionVec = new THREE.Vector3();

  const fpsEl = document.createElement('div');
  fpsEl.id = 'fps';
  fpsEl.textContent = '— FPS';
  container.appendChild(fpsEl);

  const timerEl = document.createElement('div');
  timerEl.id = 'timer';
  timerEl.textContent = 'Time: 0:00';
  container.appendChild(timerEl);

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

  const statsEl = document.createElement('div');
  statsEl.style.cssText = 'display:flex;gap:12px;font:11px sans-serif;color:rgba(255,255,255,0.85);margin-top:6px;';
  const strengthEl = document.createElement('span');
  const intelligenceEl = document.createElement('span');
  const dexterityEl = document.createElement('span');
  const vitalityEl = document.createElement('span');
  statsEl.appendChild(strengthEl);
  statsEl.appendChild(intelligenceEl);
  statsEl.appendChild(dexterityEl);
  statsEl.appendChild(vitalityEl);

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

  const skillTreeHintBar = document.createElement('div');
  skillTreeHintBar.textContent = 'Space — Melee  |  K — Skill tree  |  I — Inventory';
  skillTreeHintBar.style.cssText = 'font:10px sans-serif;color:rgba(255,255,255,0.5);margin-top:4px;';

  const waveLabelEl = document.createElement('div');
  waveLabelEl.style.cssText = 'font:10px sans-serif;color:rgba(255,255,255,0.6);margin-top:6px;margin-bottom:2px;';
  waveLabelEl.textContent = 'Current wave';
  const waveEl = document.createElement('div');
  waveEl.style.cssText = 'font:14px sans-serif;color:#e8c050;font-weight:bold;';

  barsEl.appendChild(healthLabel);
  barsEl.appendChild(healthBarWrap);
  barsEl.appendChild(manaLabel);
  barsEl.appendChild(manaBarWrap);
  barsEl.appendChild(statsEl);
  barsEl.appendChild(levelXpEl);
  barsEl.appendChild(skillTreeHintBar);
  barsEl.appendChild(waveLabelEl);
  barsEl.appendChild(waveEl);
  container.appendChild(barsEl);

  const enemyHealthBarsContainer = document.createElement('div');
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

  container.appendChild(enemyHealthBarsContainer);

  function update(state: HUDState): void {
    const { canvasWidth: cw, canvasHeight: ch, camera } = state;

    fpsEl.textContent = `${Math.round(state.smoothedFps)} FPS`;
    timerEl.textContent = `Time: ${formatTime(state.runTime)}`;

    healthBarWrap.title = `${state.health} / ${state.maxHealth}`;
    healthFill.style.width = `${state.maxHealth > 0 ? (state.health / state.maxHealth) * 100 : 0}%`;

    manaBarWrap.title = `${state.mana} / ${state.maxMana}`;
    manaFill.style.width = `${state.maxMana > 0 ? (state.mana / state.maxMana) * 100 : 0}%`;

    strengthEl.textContent = `Str ${state.strength}`;
    strengthEl.title = 'Melee damage';
    intelligenceEl.textContent = `Int ${state.intelligence}`;
    intelligenceEl.title = 'Magic damage';
    dexterityEl.textContent = `Dex ${state.dexterity}`;
    dexterityEl.title = 'Ranged damage';
    vitalityEl.textContent = `Vit ${state.vitality}`;
    vitalityEl.title = 'Max health';

    levelLabel.textContent = `Level ${state.level}`;
    const xpPct = state.xpForNextLevel > 0 ? (state.xp / state.xpForNextLevel) * 100 : 0;
    xpFill.style.width = `${xpPct}%`;
    xpBarWrap.title = `${state.xp} / ${state.xpForNextLevel} XP`;

    waveEl.textContent = String(state.currentWave);

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
