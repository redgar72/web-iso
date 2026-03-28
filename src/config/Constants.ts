/**
 * Game balance and tuning constants. Single place to adjust combat, enemies, waves, etc.
 */

// --- Persistence / UI ---
export const BEST_TIME_KEY = 'web-iso-best-time';
export const CHAT_MAX_MESSAGES = 50;

// --- Player / resources ---
export const BASE_MAX_HEALTH = 100;
export const MAX_MANA = 100;
export const FIREBALL_MANA_COST = 18;
export const MANA_REGEN_PER_SECOND = 5;
export const SPAWN_POSITION_X = 10;
export const SPAWN_POSITION_Z = 10;

// --- XP / leveling ---
export const XP_RED_CUBE = 12;
export const XP_CASTER = 35;
export const XP_RESURRECTOR = 40;
export const XP_TELEPORTER = 38;
export const XP_PER_LEVEL_BASE = 80; // e.g. 80 to reach 2, 160 to reach 3

// --- Enemy health bars (projected UI) ---
export const ENEMY_HEALTH_BAR_WIDTH = 36;
export const ENEMY_HEALTH_BAR_HEIGHT = 5;
export const HEALTH_BAR_Y_OFFSET = 1.2;

// --- Burn overlay (grunt instanced glow) ---
export const BURN_OVERLAY_HIDDEN_Y = -1000;

// --- Sword (orbiting melee) ---
export const SWORD_ORBIT_RADIUS = 1.4;
export const SWORD_ANGULAR_SPEED = Math.PI * 2; // one full rotation per second
export const SWORD_HIT_RADIUS = 0.6;
export const SWORD_HIT_COOLDOWN = 0.4;

// --- Caster enemies ---
export const CASTER_COUNT = 5;
export const CASTER_SPEED = 2.2;
export const CASTER_SIZE = 0.6;
export const CASTER_PREFERRED_RANGE = 10;
export const CASTER_FIREBALL_COOLDOWN = 2.2;
export const MAX_CASTER_HEALTH = 90;

// --- Enemy fireballs (casters throw at player) ---
export const ENEMY_FIREBALL_SPEED = 12;
export const ENEMY_FIREBALL_RADIUS = 0.3;
export const ENEMY_FIREBALL_DAMAGE = 10;
export const ENEMY_FIREBALL_TTL = 3;

// --- Resurrector enemies ---
export const RESURRECTOR_COUNT = 3;
export const RESURRECTOR_SPEED = 1.8;
export const RESURRECTOR_SIZE = 0.85;
export const RESURRECTOR_PREFERRED_RANGE = 8;
export const MAX_RESURRECTOR_HEALTH = 70;

// --- Teleporter (poison) enemies ---
export const TELEPORTER_COUNT = 3;
export const TELEPORTER_SIZE = 0.65;
export const TELEPORTER_TELEPORT_RANGE = 4;
export const TELEPORTER_TELEPORT_COOLDOWN = 2;
export const TELEPORTER_POISON_POOL_COOLDOWN = 5;
export const POISON_THROW_DISTANCE = 7; // How far toward the player the pool lands
export const POISON_POOL_RADIUS = 1.8;
export const POISON_INDICATOR_DURATION = 1.2; // Seconds the "incoming" indicator shows before pool lands
export const POISON_POOL_DURATION = 8;
export const MAX_TELEPORTER_HEALTH = 50;
export const POISON_DURATION = 4;
export const POISON_DAMAGE_PER_TICK = 2;
export const POISON_TICK_INTERVAL = 0.5;

// --- Boss (center of map, exploding fireballs) ---
export const BOSS_SIZE = 1.2;
export const BOSS_POSITION_X = 24;
export const BOSS_POSITION_Z = 24;
export const BOSS_HITBOX_RADIUS = 6.0;
export const MAX_BOSS_HEALTH = 500;
export const BOSS_FIREBALL_COOLDOWN = 3.5;
export const BOSS_FIREBALL_RADIUS = 0.4;
export const BOSS_FIREBALL_DAMAGE = 15;
export const BOSS_FIREBALL_EXPLOSION_RADIUS = 3.5;
export const BOSS_FIREBALL_WARNING_DURATION = 2.0;
export const BOSS_FIREBALL_BURN_DURATION = 4.0;
export const BOSS_FIREBALL_BURN_DAMAGE_PER_SECOND = 3.0;
export const BOSS_FIREBALL_BURN_TICK_INTERVAL = 0.5;
export const XP_BOSS = 200;

// --- Movement / terrain ---
export const TERRAIN_XZ_MIN = 0;
export const TERRAIN_XZ_MAX = 48;
export const CHARACTER_MOVE_SPEED = 12;
export const MOVE_ARRIVAL_DIST = 0.05;

// --- Player projectiles (fireball) ---
export const PROJECTILE_GRAVITY = 22;
export const LAUNCH_HEIGHT = 0.5;
export const MAX_PROJECTILE_RANGE = 28;
export const FIREBALL_SPEED = 18;
export const FIREBALL_RADIUS = 0.35;
export const FIREBALL_TTL = 2;

// --- Explosion (fireball augment) ---
export const EXPLOSION_DURATION = 0.25;
export const EXPLOSION_MAX_SCALE = 7;
export const EXPLOSION_HIT_RADIUS_BASE = FIREBALL_RADIUS * EXPLOSION_MAX_SCALE;
export const EXPLOSION_HIT_RADIUS_INFERNO = EXPLOSION_HIT_RADIUS_BASE * 1.5;

// --- Combat (base damage; scaled by stats) ---
export const MAX_ENEMY_HEALTH = 30;
export const BASE_FIREBALL_DAMAGE = 25;
export const BASE_ROCK_DAMAGE = 18;
export const BASE_SWORD_DAMAGE = 12;
export const MELEE_RANGE = 2.0;
export const MELEE_COOLDOWN = 0.55;
export const RANGED_ROCK_COOLDOWN = 1.2;

// --- Grunt enemies (explode when in range) ---
export const ENEMY_SPEED = 3.5;
export const ENEMY_EXPLOSION_RADIUS = 2.2;
export const ENEMY_EXPLOSION_RANGE = ENEMY_EXPLOSION_RADIUS * 0.8;
export const ENEMY_EXPLOSION_DELAY = 0.9;
export const ENEMY_EXPLOSION_COOLDOWN = 1.4;
export const ENEMY_DAMAGE = 8;
export const ENEMY_ATTACK_EFFECT_DURATION = 0.5;

// --- Grunt separation (boids-like) ---
export const ENEMY_SEPARATION_RADIUS = 1.4;
export const ENEMY_SEPARATION_STRENGTH = 2.5;

// --- Waves (spawn bounds, seed) ---
export const WAVE_SEED = 12345;
export const BATTLE_MIN = 6;
export const BATTLE_MAX = 42;

// --- Bodies / resurrect ---
export const RESURRECT_RANGE = 3;
export const RESURRECT_COOLDOWN = 4;

// --- Pickups ---
export const PICKUP_RADIUS = 0.9;
export const HEALTH_ORB_VALUE = 15;
export const MANA_ORB_VALUE = 12;

// --- Rocks (thrown projectile) ---
export const ROCK_SPEED = 14;
export const ROCK_RADIUS = 0.25;
export const ROCK_TTL = 1.8;

// --- Bow (arrow projectile) ---
export const ARROW_SPEED = 28;
export const ARROW_RADIUS = 0.2;
export const ARROW_TTL = 1.5;

// --- Sword (equipped swing animation) ---
export const SWORD_SWING_DURATION = 0.3;
