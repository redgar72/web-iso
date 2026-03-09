# Refactoring ideas (modularization)

`main.ts` is the single large entry point. These refactors would improve structure without changing behavior.

## Done

- **Floating damage** → `src/ui/FloatingDamage.ts`  
  - `createFloatingDamage(parent, getGameTime)` returns `{ show, update }`.  
  - Keeps world→screen projection and float/fade logic in one place.

- **Constants / config** → `src/config/Constants.ts`  
  - All game balance and tuning constants (player, XP, combat, enemies, waves, pickups, UI sizes, etc.) live in one file.  
  - main.ts imports what it needs; no duplicate magic numbers.

- **Player state** → `src/state/PlayerState.ts`  
  - `createPlayerState(config?)` returns getters/setters, `addXp`, `allocateStat`, damage helpers, and `setOnDeath` / `setOnLevelUp`. Main wires callbacks after creation and syncs bar DOM via `updateHealthBar`, `updateManaBar`, `updateStatsDisplay`, `updateXpDisplay`.

## Recommended next steps

### 1. ~~Player state module~~ (done) (`src/state/PlayerState.ts` or `src/game/PlayerState.ts`)
- **Move:** `health`, `mana`, `strength`, `intelligence`, `dexterity`, `vitality`, `statPointsToAllocate`, `level`, `xp`; `getMaxHealth`, `getMeleeDamage`, `getMagicDamage`, `getRangedDamage`, `getXpForNextLevel`; `setHealth`, `setMana`, `addXp`, `allocateStat`, `updateStatsDisplay`, `updateXpDisplay`.
- **Expose:** A small API (e.g. `createPlayerState(config)`) that returns getters/setters and damage helpers. Main (or UI) would pass callbacks for “on death”, “on level up”, etc.
- **Benefit:** Single place for stats and formulas; easier to test and to add persistence later.

### 2. ~~Constants / config~~ (done)
- **Move:** Combat and balance constants (e.g. `BASE_FIREBALL_DAMAGE`, `ENEMY_SPEED`, `CASTER_COUNT`, wave/XP values) into `src/config/Constants.ts` or split by domain (`config/combat.ts`, `config/enemies.ts`).
- **Benefit:** Easier tuning and fewer magic numbers in main.

### 3. ~~Enemy “manager” or split by type~~ (Option B done)
- **Option A:** One module that owns grunts + casters + resurrectors: creation, health arrays, `damageRedCube` / `damageCaster` / `damageResurrector`, effect arrays, and wave spawn/clear. Main only calls something like `enemyManager.update(dt, gameTime)` and `enemyManager.damage(...)`.
- **Option B (done):** Grunts stay in `scene/Enemies.ts`. `scene/Casters.ts` and `scene/Resurrectors.ts` export `createCasters(scene, config, callbacks)` and `createResurrectors(scene, config, callbacks)` with their own `update`, `damage`, `getCount`, `getPosition`, `isAlive`, `getHealth`, `getMesh`, `getEffects`, `clear`, and `spawn` APIs.
- **Benefit:** main.ts stops being the only place that knows every enemy type; adding a new enemy is a new module.

### 3. Combat / weapons
- **Sword:** Move orbiting blades (creation, `updateSword`, hit detection) into e.g. `src/combat/Sword.ts`. It takes `scene`, `character`, and a callback `onHit(worldPos)` (or `damageInRadius`). Main wires that to `damageRedCube` / `damageCaster` / `damageResurrector`.
- **Fireballs / rocks:** Same idea: `src/combat/Fireballs.ts` and `src/combat/Rocks.ts` (or one `Projectiles.ts`) that own meshes, velocity, and collision; they call a provided `onHit(entityType, index, position)` (and optionally `applyBurn`).
- **Benefit:** main.ts becomes “wire combat to damage/effects” instead of “implement all combat”.

### 4. Wave system
- **Move:** `currentWave`, `levelGruntsCount`, `levelCastersCount`, `levelResurrectorsCount`, `getWaveComposition`, `isAnyEnemyAlive`, `startWave`, and the “clear bodies + effects + spawn” logic into e.g. `src/game/Waves.ts`.
- **Expose:** `startWave(waveNumber)` and `isWaveComplete()` (or `isAnyEnemyAlive()`). Wave module calls into enemy manager (or main) to spawn/kill/clear.
- **Benefit:** Wave rules and composition live in one place; main just checks “wave complete?” and calls `startWave(next)`.

### 5. HUD / UI
- **Move:** Health/mana/XP bars, timer, FPS, enemy health bar container, and their update logic into `src/ui/HUD.ts` or `src/ui/GameHUD.ts`. It receives “current health/max”, “current mana/max”, “xp/needed”, “run time”, and camera/canvas for projecting enemy bars.
- **Benefit:** main only updates state and calls `hud.update(...)`; all bar/timer DOM lives in one module.

### 6. Burn visuals
- **Move:** Burn overlay InstancedMesh and `updateBurnVisuals` into `src/effects/BurnVisuals.ts`. It takes scene, counts (ENEMY_COUNT, etc.), and a “state getter” (alive arrays, effect arrays, positions, caster/resurrector meshes) and exposes `update(gameTime)`.
- **Benefit:** Effect visuals live next to effect logic; main only passes state and calls update.

---

## Order of operations

1. **Constants** – Done.  
2. **Player state** – Done.  
3. **Floating damage** – Done.  
4. **Burn visuals** – Small, self-contained.  
5. **Waves** – Then **enemy manager** (or per-type modules), so wave logic talks to one place.  
6. **Combat (sword, fireballs, rocks)** – After enemies are behind an API.  
7. **HUD** – Can be done anytime; mostly DOM and projection.

Avoid doing “everything in one PR”. One or two modules per change keeps reviews and rollbacks manageable.
