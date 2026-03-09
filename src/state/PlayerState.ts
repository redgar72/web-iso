/**
 * Player state: health, mana, stats (Str/Int/Dex/Vit), level, XP.
 * Owns all state and formulas; callbacks for onDeath and onLevelUp.
 * DOM (bars, labels) stays in main and is updated from getters.
 */

import {
  BASE_MAX_HEALTH,
  MAX_MANA,
  XP_PER_LEVEL_BASE,
  BASE_FIREBALL_DAMAGE,
  BASE_ROCK_DAMAGE,
  BASE_SWORD_DAMAGE,
} from '../config/Constants';

export type StatId = 'strength' | 'intelligence' | 'dexterity' | 'vitality';

export interface PlayerStateConfig {
  onDeath?: () => void;
  onLevelUp?: () => void;
}

export interface PlayerStateAPI {
  getHealth: () => number;
  getMaxHealth: () => number;
  getMana: () => number;
  getMaxMana: () => number;
  setHealth: (value: number) => void;
  setMana: (value: number) => void;
  addXp: (amount: number) => void;
  allocateStat: (stat: StatId) => void;
  getLevel: () => number;
  getXp: () => number;
  getXpForNextLevel: () => number;
  getStrength: () => number;
  getIntelligence: () => number;
  getDexterity: () => number;
  getVitality: () => number;
  getStatPointsToAllocate: () => number;
  getMeleeDamage: () => number;
  getMagicDamage: () => number;
  getBaseRangedDamage: () => number;
  /** Set after creation so main can wire showGameOver etc. */
  setOnDeath: (fn: () => void) => void;
  setOnLevelUp: (fn: () => void) => void;
}

export function createPlayerState(config: PlayerStateConfig = {}): PlayerStateAPI {
  let onDeath = config.onDeath;
  let onLevelUp = config.onLevelUp;

  let health: number;
  let mana = MAX_MANA;
  let strength = 10;
  let intelligence = 10;
  let dexterity = 10;
  let vitality = 10;
  let statPointsToAllocate = 0;
  let level = 1;
  let xp = 0;

  function getMaxHealth(): number {
    return Math.round(BASE_MAX_HEALTH * (vitality / 10));
  }

  function getXpForNextLevel(): number {
    return XP_PER_LEVEL_BASE * level;
  }

  health = getMaxHealth();

  function setHealth(value: number): void {
    const max = getMaxHealth();
    health = Math.max(0, Math.min(max, value));
    if (health <= 0) onDeath?.();
  }

  function setMana(value: number): void {
    mana = Math.max(0, Math.min(MAX_MANA, value));
  }

  function addXp(amount: number): void {
    xp += amount;
    while (xp >= getXpForNextLevel()) {
      const needed = getXpForNextLevel();
      xp -= needed;
      level++;
      strength++;
      intelligence++;
      dexterity++;
      vitality++;
      statPointsToAllocate += 3;
      setHealth(getMaxHealth());
      onLevelUp?.();
    }
  }

  function allocateStat(stat: StatId): void {
    if (statPointsToAllocate <= 0) return;
    statPointsToAllocate--;
    if (stat === 'strength') strength++;
    else if (stat === 'intelligence') intelligence++;
    else if (stat === 'dexterity') dexterity++;
    else {
      const oldMax = getMaxHealth();
      vitality++;
      const newMax = getMaxHealth();
      health = Math.min(health + (newMax - oldMax), newMax);
    }
  }

  function getMeleeDamage(): number {
    return Math.round(BASE_SWORD_DAMAGE * (strength / 10));
  }

  function getMagicDamage(): number {
    return Math.round(BASE_FIREBALL_DAMAGE * (intelligence / 10));
  }

  function getBaseRangedDamage(): number {
    return Math.round(BASE_ROCK_DAMAGE * (dexterity / 10));
  }

  return {
    getHealth: () => health,
    getMaxHealth,
    getMana: () => mana,
    getMaxMana: () => MAX_MANA,
    setHealth,
    setMana,
    addXp,
    allocateStat,
    getLevel: () => level,
    getXp: () => xp,
    getXpForNextLevel,
    getStrength: () => strength,
    getIntelligence: () => intelligence,
    getDexterity: () => dexterity,
    getVitality: () => vitality,
    getStatPointsToAllocate: () => statPointsToAllocate,
    getMeleeDamage,
    getMagicDamage,
    getBaseRangedDamage,
    setOnDeath: (fn) => { onDeath = fn; },
    setOnLevelUp: (fn) => { onLevelUp = fn; },
  };
}
