import type * as THREE from 'three';

export const GAME_OPTIONS_STORAGE_KEY = 'web-iso-game-options-v1';

export interface GameOptionsState {
  pixelRatio1: boolean;
  shadows: boolean;
  showPerfHud: boolean;
  showEnemyHealthBars: boolean;
  showTickBar: boolean;
}

export const defaultGameOptions: GameOptionsState = {
  pixelRatio1: false,
  shadows: false,
  showPerfHud: true,
  showEnemyHealthBars: true,
  showTickBar: true,
};

export function loadGameOptions(): GameOptionsState {
  try {
    const raw = localStorage.getItem(GAME_OPTIONS_STORAGE_KEY);
    if (!raw) return { ...defaultGameOptions };
    const o = JSON.parse(raw) as Partial<GameOptionsState>;
    return { ...defaultGameOptions, ...o };
  } catch {
    return { ...defaultGameOptions };
  }
}

export function saveGameOptions(state: GameOptionsState): void {
  try {
    localStorage.setItem(GAME_OPTIONS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function getRendererPixelRatio(gameOptions: GameOptionsState): number {
  return gameOptions.pixelRatio1 ? 1 : Math.min(window.devicePixelRatio, 2);
}

export function applyGameOptions(renderer: THREE.WebGLRenderer, gameOptions: GameOptionsState): void {
  renderer.setPixelRatio(getRendererPixelRatio(gameOptions));
  renderer.shadowMap.enabled = gameOptions.shadows;
  const perf = document.getElementById('hud-perf');
  const fps = document.getElementById('fps');
  const latency = document.getElementById('latency');
  // Keep #hud-perf visible so the multiplayer name (#hud-account) still shows when FPS/latency are off.
  if (perf) perf.style.display = 'flex';
  if (fps) fps.style.display = gameOptions.showPerfHud ? '' : 'none';
  if (latency) latency.style.display = gameOptions.showPerfHud ? '' : 'none';
  const tickBar = document.getElementById('hud-tick-bar');
  if (tickBar) tickBar.style.display = gameOptions.showTickBar ? '' : 'none';
  const enemyBars = document.getElementById('hud-enemy-health-bars');
  if (enemyBars) enemyBars.style.display = gameOptions.showEnemyHealthBars ? '' : 'none';
}
