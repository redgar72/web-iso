/**
 * Status effects: burn (DoT), slow (reduced move speed), stun (no movement/actions).
 * Effects are stored per-entity in main; this module provides types and helpers.
 */

export type EffectKind = 'burn' | 'slow' | 'stun';

export interface BurnEffect {
  kind: 'burn';
  endTime: number;
  damagePerTick: number;
  tickInterval: number;
  lastTickTime: number;
}

export interface SlowEffect {
  kind: 'slow';
  endTime: number;
  /** 0–1, e.g. 0.5 = 50% slow → 50% speed */
  factor: number;
}

export interface StunEffect {
  kind: 'stun';
  endTime: number;
}

export type Effect = BurnEffect | SlowEffect | StunEffect;

const BURN_DURATION = 3;
const BURN_DAMAGE_PER_TICK = 4;
const BURN_TICK_INTERVAL = 0.5;

const SLOW_DURATION = 2;
const SLOW_FACTOR = 0.5;

const STUN_DURATION = 1;

/** Create a burn effect (DoT). Duration in seconds. */
export function createBurnEffect(
  gameTime: number,
  duration = BURN_DURATION,
  damagePerTick = BURN_DAMAGE_PER_TICK,
  tickInterval = BURN_TICK_INTERVAL
): BurnEffect {
  return {
    kind: 'burn',
    endTime: gameTime + duration,
    damagePerTick,
    tickInterval,
    lastTickTime: gameTime,
  };
}

/** Create a slow effect. factor 0–1 (e.g. 0.5 = half speed). */
export function createSlowEffect(
  gameTime: number,
  duration = SLOW_DURATION,
  factor = SLOW_FACTOR
): SlowEffect {
  return { kind: 'slow', endTime: gameTime + duration, factor };
}

/** Create a stun effect (no move/actions). */
export function createStunEffect(
  gameTime: number,
  duration = STUN_DURATION
): StunEffect {
  return { kind: 'stun', endTime: gameTime + duration };
}

/** Remove effects that have expired. Mutates the array. */
export function removeExpiredEffects(effects: Effect[], gameTime: number): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    if (effects[i].endTime <= gameTime) effects.splice(i, 1);
  }
}

/**
 * Tick burn effects and return total damage to apply this frame.
 * Updates lastTickTime on burn effects. Caller applies damage to the entity.
 */
export function tickBurnEffects(effects: Effect[], gameTime: number): number {
  let damage = 0;
  for (const e of effects) {
    if (e.kind !== 'burn') continue;
    if (e.endTime <= gameTime) continue;
    while (e.lastTickTime + e.tickInterval <= gameTime) {
      e.lastTickTime += e.tickInterval;
      if (e.lastTickTime < e.endTime) damage += e.damagePerTick;
    }
  }
  return damage;
}

/** Speed multiplier from slow effects (e.g. 0.5 if one 50% slow). Multiple slows multiply. */
export function getSpeedMultiplier(effects: Effect[], gameTime: number): number {
  let mult = 1;
  for (const e of effects) {
    if (e.kind === 'slow' && e.endTime > gameTime) mult *= 1 - e.factor;
  }
  return Math.max(0, mult);
}

/** True if any stun is currently active. */
export function isStunned(effects: Effect[], gameTime: number): boolean {
  return effects.some((e) => e.kind === 'stun' && e.endTime > gameTime);
}

/** True if any burn is currently active (for visual effect). */
export function hasBurn(effects: Effect[], gameTime: number): boolean {
  return effects.some((e) => e.kind === 'burn' && e.endTime > gameTime);
}

/** Apply or refresh an effect. For burn we replace existing burn; for slow/stun we push (stack). */
export function applyEffect(effects: Effect[], newEffect: Effect): void {
  if (newEffect.kind === 'burn') {
    const idx = effects.findIndex((e) => e.kind === 'burn');
    if (idx >= 0) effects[idx] = newEffect;
    else effects.push(newEffect);
    return;
  }
  if (newEffect.kind === 'slow' || newEffect.kind === 'stun') {
    effects.push(newEffect);
  }
}
