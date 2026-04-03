/**
 * Player state: health, mana, level, XP (optional module; main.ts owns live game state today).
 * Flat max health and fixed combat numbers — no Str/Int/Dex/Vit.
 */

import {
  BASE_MAX_HEALTH,
  MAX_MANA,
  XP_PER_LEVEL_BASE,
  BASE_SWORD_DAMAGE,
  BASE_ROCK_DAMAGE,
} from '../config/Constants';

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
  getLevel: () => number;
  getXp: () => number;
  getXpForNextLevel: () => number;
  getMeleeDamage: () => number;
  getBaseRangedDamage: () => number;
  setOnDeath: (fn: () => void) => void;
  setOnLevelUp: (fn: () => void) => void;
}

export function createPlayerState(config: PlayerStateConfig = {}): PlayerStateAPI {
  let onDeath = config.onDeath;
  let onLevelUp = config.onLevelUp;

  let health: number;
  let mana = MAX_MANA;
  let level = 1;
  let xp = 0;

  function getMaxHealth(): number {
    return BASE_MAX_HEALTH;
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
      setHealth(getMaxHealth());
      onLevelUp?.();
    }
  }

  return {
    getHealth: () => health,
    getMaxHealth,
    getMana: () => mana,
    getMaxMana: () => MAX_MANA,
    setHealth,
    setMana,
    addXp,
    getLevel: () => level,
    getXp: () => xp,
    getXpForNextLevel,
    getMeleeDamage: () => BASE_SWORD_DAMAGE,
    getBaseRangedDamage: () => BASE_ROCK_DAMAGE,
    setOnDeath: (fn) => {
      onDeath = fn;
    },
    setOnLevelUp: (fn) => {
      onLevelUp = fn;
    },
  };
}
