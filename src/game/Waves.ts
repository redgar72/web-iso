/**
 * Wave system: composition rules, spawn positions, current wave state.
 * Clear/spawn is done by main via onStartWave callback.
 */

import {
  WAVE_SEED,
  BATTLE_MIN,
  BATTLE_MAX,
  RESURRECTOR_COUNT,
  TELEPORTER_COUNT,
} from '../config/Constants';

/** Empty arena: no wave spawns, no auto wave progression — explore a clean grid. */
export const FRESH_GRID_MODE = true;

export interface WaveComposition {
  grunts: number;
  casters: number;
  resurrectors: number;
  teleporters: number;
}

export interface WaveSpawnPosition {
  x: number;
  y: number;
  z: number;
}

export interface WaveCallbacks {
  /** Called with wave number, composition, and a getter for spawn position (index, out). */
  onStartWave(
    wave: number,
    composition: WaveComposition,
    getSpawnPosition: (index: number, out: WaveSpawnPosition) => void
  ): void;
}

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wave 1: 1 of every monster. Wave 2: 2 grunts. Wave 3: 1 caster. Wave 4: 2 casters. Wave 5+: grunts + 2 casters + resurrector(s) + teleporter(s). */
export function getWaveComposition(wave: number): WaveComposition {
  if (FRESH_GRID_MODE) {
    return { grunts: 0, casters: 0, resurrectors: 0, teleporters: 0 };
  }
  if (wave >= 5) {
    const resurrectors = Math.min(1 + Math.floor((wave - 5) / 2), RESURRECTOR_COUNT);
    const teleporters = Math.min(1 + Math.floor((wave - 5) / 3), TELEPORTER_COUNT);
    const grunts = Math.min(1 + (wave - 5), 4);
    return { grunts, casters: 2, resurrectors, teleporters };
  }
  if (wave === 1) return { grunts: 1, casters: 1, resurrectors: 1, teleporters: 1 };
  if (wave === 2) return { grunts: 2, casters: 0, resurrectors: 0, teleporters: 1 };
  if (wave === 3) return { grunts: 0, casters: 1, resurrectors: 0, teleporters: 1 };
  if (wave === 4) return { grunts: 0, casters: 2, resurrectors: 0, teleporters: 1 };
  return { grunts: 0, casters: 2, resurrectors: 0, teleporters: 0 };
}

export function getWaveSpawnPosition(wave: number, index: number, out: WaveSpawnPosition): void {
  const rng = seededRandom(WAVE_SEED + wave * 1000 + index);
  out.x = BATTLE_MIN + rng() * (BATTLE_MAX - BATTLE_MIN);
  out.z = BATTLE_MIN + rng() * (BATTLE_MAX - BATTLE_MIN);
  out.y = 0;
}

export interface WavesAPI {
  getCurrentWave(): number;
  getWaveComposition(wave: number): WaveComposition;
  getWaveSpawnPosition(wave: number, index: number, out: WaveSpawnPosition): void;
  getLevelGruntsCount(): number;
  getLevelCastersCount(): number;
  getLevelResurrectorsCount(): number;
  getLevelTeleportersCount(): number;
  startWave(wave: number): void;
  isWaveComplete(checkAlive: () => boolean): boolean;
}

export function createWaves(callbacks: WaveCallbacks): WavesAPI {
  let currentWave = 1;

  function getLevelGruntsCount(): number {
    return getWaveComposition(currentWave).grunts;
  }
  function getLevelCastersCount(): number {
    return getWaveComposition(currentWave).casters;
  }
  function getLevelResurrectorsCount(): number {
    return getWaveComposition(currentWave).resurrectors;
  }
  function getLevelTeleportersCount(): number {
    return getWaveComposition(currentWave).teleporters;
  }

  function startWave(wave: number): void {
    currentWave = wave;
    const composition = getWaveComposition(wave);
    const getSpawnPosition = (index: number, out: WaveSpawnPosition) =>
      getWaveSpawnPosition(wave, index, out);
    callbacks.onStartWave(wave, composition, getSpawnPosition);
  }

  function isWaveComplete(checkAlive: () => boolean): boolean {
    return !checkAlive();
  }

  return {
    getCurrentWave: () => currentWave,
    getWaveComposition,
    getWaveSpawnPosition,
    getLevelGruntsCount,
    getLevelCastersCount,
    getLevelResurrectorsCount,
    getLevelTeleportersCount,
    startWave,
    isWaveComplete,
  };
}
