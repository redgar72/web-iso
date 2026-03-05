import * as THREE from 'three';
import { IsoCamera } from './core/IsoCamera';
import { GameLoop } from './core/GameLoop';
import { createIsoTerrain } from './scene/IsoTerrain';
import { createIsoLights } from './scene/IsoLights';
import { createEnemies, ENEMY_COUNT, ENEMY_SIZE, killEnemyInstance, resurrectEnemyInstance } from './scene/Enemies';
import { createPortal } from './scene/Portal';
import { rollDrop, type MonsterType, type DropType } from './drops/DropTables';
import { createPlaceholderCharacter } from './character/loadFbxCharacter';

const container = document.getElementById('app')!;
let width = container.clientWidth;
let height = container.clientHeight;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1820);
scene.fog = new THREE.Fog(0x1a1820, 35, 55);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'default',
  stencil: false,
  depth: true,
  preserveDrawingBuffer: true,
});
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const clickOverlay = document.createElement('div');
clickOverlay.style.cssText = 'position:absolute;inset:0;z-index:1;';
container.appendChild(clickOverlay);

let glContextLost = false;
const contextLostEl = document.createElement('div');
contextLostEl.id = 'context-lost';
contextLostEl.textContent = 'Graphics reset — reloading…';
contextLostEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#1a1820;color:#ccc;font:18px sans-serif;z-index:10;pointer-events:none;';
container.appendChild(contextLostEl);

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  glContextLost = true;
  contextLostEl.style.display = 'flex';
  console.warn('WebGL context lost — reloading to restore scene');
  setTimeout(() => location.reload(), 2000);
});
canvas.addEventListener('webglcontextrestored', () => {
  glContextLost = false;
  contextLostEl.style.display = 'none';
  lastFrameTime = performance.now();
  console.log('WebGL context restored');
});

const fpsEl = document.createElement('div');
fpsEl.id = 'fps';
fpsEl.textContent = '— FPS';
container.appendChild(fpsEl);

// Health & Mana bars
const BASE_MAX_HEALTH = 100;
const MAX_MANA = 100;
let mana = MAX_MANA;
const FIREBALL_MANA_COST = 18;
const THROW_MANA_COST = 5;

// Character base stats (at 10 = 100% of base)
let strength = 10;     // melee damage
let intelligence = 10;  // magic damage
let dexterity = 10;     // ranged damage
let vitality = 10;      // max health

function getMaxHealth(): number {
  return Math.round(BASE_MAX_HEALTH * (vitality / 10));
}

// XP and leveling
let level = 1;
let xp = 0;
const XP_RED_CUBE = 12;
const XP_CASTER = 35;

function getXpForNextLevel(): number {
  return 80 * level; // e.g. 80 to reach 2, 160 to reach 3
}

let health = getMaxHealth();

const barsEl = document.createElement('div');
barsEl.style.cssText = 'position:absolute;bottom:12px;left:12px;z-index:5;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
const barStyle = 'width:180px;height:14px;background:rgba(0,0,0,0.6);border-radius:7px;overflow:hidden;border:1px solid rgba(255,255,255,0.15);';
const fillStyle = 'height:100%;border-radius:6px;transition:width 0.15s ease-out;';

const healthBarWrap = document.createElement('div');
healthBarWrap.style.cssText = barStyle + 'pointer-events:auto;cursor:default;';
healthBarWrap.title = `${health} / ${getMaxHealth()}`;
const healthFill = document.createElement('div');
healthFill.style.cssText = `width:100%;background:linear-gradient(90deg,#c04040,#e06060);${fillStyle}`;
healthBarWrap.appendChild(healthFill);

const manaBarWrap = document.createElement('div');
manaBarWrap.style.cssText = barStyle + 'pointer-events:auto;cursor:default;';
manaBarWrap.title = `${mana} / ${MAX_MANA}`;
const manaFill = document.createElement('div');
manaFill.style.cssText = `width:100%;background:linear-gradient(90deg,#3060a0,#50a0e0);${fillStyle}`;
manaBarWrap.appendChild(manaFill);

const healthLabel = document.createElement('div');
healthLabel.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.85);margin-bottom:2px;';
healthLabel.textContent = 'Health';
const manaLabel = document.createElement('div');
manaLabel.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.85);margin-bottom:2px;';
manaLabel.textContent = 'Mana';
barsEl.appendChild(healthLabel);
barsEl.appendChild(healthBarWrap);
barsEl.appendChild(manaLabel);
barsEl.appendChild(manaBarWrap);
// Stats display (Str / Int / Dex / Vit)
const statsEl = document.createElement('div');
statsEl.style.cssText = 'display:flex;gap:12px;font:11px sans-serif;color:rgba(255,255,255,0.85);margin-top:6px;';
const statLabel = (name: string, value: number, title: string) => {
  const s = document.createElement('span');
  s.title = title;
  s.textContent = `${name} ${value}`;
  return s;
};
const strengthEl = statLabel('Str', strength, 'Melee damage');
const intelligenceEl = statLabel('Int', intelligence, 'Magic damage');
const dexterityEl = statLabel('Dex', dexterity, 'Ranged damage');
const vitalityEl = statLabel('Vit', vitality, 'Max health');
statsEl.appendChild(strengthEl);
statsEl.appendChild(intelligenceEl);
statsEl.appendChild(dexterityEl);
statsEl.appendChild(vitalityEl);
barsEl.appendChild(statsEl);

function updateStatsDisplay(): void {
  strengthEl.textContent = `Str ${strength}`;
  intelligenceEl.textContent = `Int ${intelligence}`;
  dexterityEl.textContent = `Dex ${dexterity}`;
  vitalityEl.textContent = `Vit ${vitality}`;
}
updateStatsDisplay();

// Level & XP bar
const levelXpEl = document.createElement('div');
levelXpEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-top:8px;';
const levelLabel = document.createElement('div');
levelLabel.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.9);';
levelLabel.textContent = `Level ${level}`;
const xpBarWrap = document.createElement('div');
xpBarWrap.style.cssText = barStyle;
xpBarWrap.title = `${xp} / ${getXpForNextLevel()} XP`;
const xpFill = document.createElement('div');
xpFill.style.cssText = `width:0%;background:linear-gradient(90deg,#c0a030,#e8c050);${fillStyle}`;
xpBarWrap.appendChild(xpFill);
levelXpEl.appendChild(levelLabel);
levelXpEl.appendChild(xpBarWrap);
barsEl.appendChild(levelXpEl);

function updateXpDisplay(): void {
  const needed = getXpForNextLevel();
  levelLabel.textContent = `Level ${level}`;
  xpFill.style.width = `${needed > 0 ? (xp / needed) * 100 : 0}%`;
  xpBarWrap.title = `${xp} / ${needed} XP`;
}
updateXpDisplay();

container.appendChild(barsEl);

// Game over state & overlay
const SPAWN_POSITION = new THREE.Vector3(10, 0, 10);
let isDead = false;

const gameOverEl = document.createElement('div');
gameOverEl.id = 'game-over';
gameOverEl.style.cssText =
  'position:absolute;inset:0;z-index:20;display:none;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);';
const gameOverTitle = document.createElement('div');
gameOverTitle.textContent = 'You died';
gameOverTitle.style.cssText = 'font:32px sans-serif;color:#e8a0a0;font-weight:bold;text-shadow:0 0 20px rgba(200,80,80,0.5);';
const respawnBtn = document.createElement('button');
respawnBtn.textContent = 'Respawn';
respawnBtn.style.cssText =
  'padding:12px 28px;font:16px sans-serif;color:#1a1820;background:linear-gradient(180deg,#70c0a0,#50a080);border:2px solid rgba(255,255,255,0.3);border-radius:8px;cursor:pointer;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.4);';
respawnBtn.addEventListener('mouseenter', () => {
  respawnBtn.style.background = 'linear-gradient(180deg,#80d0b0,#60b090)';
});
respawnBtn.addEventListener('mouseleave', () => {
  respawnBtn.style.background = 'linear-gradient(180deg,#70c0a0,#50a080)';
});
gameOverEl.appendChild(gameOverTitle);
gameOverEl.appendChild(respawnBtn);
container.appendChild(gameOverEl);

function showGameOver(): void {
  isDead = true;
  gameOverEl.style.display = 'flex';
}

function respawn(): void {
  isDead = false;
  gameOverEl.style.display = 'none';
  setHealth(getMaxHealth());
  setMana(MAX_MANA);
  character.position.copy(SPAWN_POSITION);
  moveTarget = null;
}

respawnBtn.addEventListener('click', respawn);

// Pause state & overlay
let isPaused = false;
const pauseEl = document.createElement('div');
pauseEl.id = 'pause';
pauseEl.style.cssText =
  'position:absolute;inset:0;z-index:15;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(0,0,0,0.5);pointer-events:none;';
const pauseTitle = document.createElement('div');
pauseTitle.textContent = 'Paused';
pauseTitle.style.cssText = 'font:28px sans-serif;color:#ccc;font-weight:bold;';
const pauseHint = document.createElement('div');
pauseHint.textContent = 'Press P or Esc to resume';
pauseHint.style.cssText = 'font:14px sans-serif;color:rgba(255,255,255,0.7);';
pauseEl.appendChild(pauseTitle);
pauseEl.appendChild(pauseHint);
container.appendChild(pauseEl);

function setPaused(paused: boolean): void {
  if (isDead) return;
  isPaused = paused;
  pauseEl.style.display = isPaused ? 'flex' : 'none';
}

// Enemy health bars (above each enemy, updated in render)
const enemyHealthBarsContainer = document.createElement('div');
enemyHealthBarsContainer.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;';
const ENEMY_HEALTH_BAR_WIDTH = 36;
const ENEMY_HEALTH_BAR_HEIGHT = 5;
const enemyHealthBarEls: { wrap: HTMLDivElement; fill: HTMLDivElement }[] = [];
const casterHealthBarEls: { wrap: HTMLDivElement; fill: HTMLDivElement }[] = [];
const healthBarProjectionVec = new THREE.Vector3();
const HEALTH_BAR_Y_OFFSET = 1.2;

function createEnemyHealthBar(): { wrap: HTMLDivElement; fill: HTMLDivElement } {
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:absolute;width:${ENEMY_HEALTH_BAR_WIDTH}px;height:${ENEMY_HEALTH_BAR_HEIGHT}px;background:rgba(0,0,0,0.7);border-radius:2px;overflow:hidden;visibility:hidden;`;
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;background:linear-gradient(90deg,#c04040,#e06060);border-radius:2px;transition:width 0.08s;';
  wrap.appendChild(fill);
  return { wrap, fill };
}

for (let j = 0; j < ENEMY_COUNT; j++) {
  const bar = createEnemyHealthBar();
  enemyHealthBarsContainer.appendChild(bar.wrap);
  enemyHealthBarEls.push(bar);
}
container.appendChild(enemyHealthBarsContainer);

function setHealth(value: number): void {
  const max = getMaxHealth();
  health = Math.max(0, Math.min(max, value));
  healthFill.style.width = `${(health / max) * 100}%`;
  healthBarWrap.title = `${health} / ${max}`;
  if (health <= 0) showGameOver();
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
    setHealth(getMaxHealth()); // heal to new max on level up
    updateStatsDisplay();
  }
  updateXpDisplay();
}

function setMana(value: number): void {
  mana = Math.max(0, Math.min(MAX_MANA, value));
  manaFill.style.width = `${(mana / MAX_MANA) * 100}%`;
  manaBarWrap.title = `${mana} / ${MAX_MANA}`;
}
const isoCamera = new IsoCamera(width, height);
isoCamera.setWorldFocus(10, 0, 10);
isoCamera.setZoom(1.2);
isoCamera.setDistance(28);

const terrain = createIsoTerrain(24, 24, { color: 0x5a5668 });
scene.add(terrain);

const enemies = createEnemies();
scene.add(enemies);

// Portal: enemies spawn here over time instead of starting on the map (visible from spawn)
const PORTAL_POSITION = new THREE.Vector3(22, 0, 22);
const portal = createPortal(PORTAL_POSITION.clone());
scene.add(portal);

createIsoLights(scene);

const character = createPlaceholderCharacter([10, 0, 10]);
scene.add(character);

// Orbiting sword (orbits character, damages enemies on contact)
const SWORD_ORBIT_RADIUS = 1.4;
const SWORD_ANGULAR_SPEED = Math.PI * 2; // one full rotation per second
const SWORD_HIT_RADIUS = 0.6;
const SWORD_HIT_COOLDOWN = 0.4; // seconds before same enemy can be hit again

const swordOrbit = new THREE.Group();
const swordMesh = (() => {
  const group = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.6, roughness: 0.4 })
  );
  blade.position.z = 0.35;
  blade.castShadow = true;
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x4a3728, metalness: 0.2, roughness: 0.8 })
  );
  handle.position.z = 0.125;
  handle.castShadow = true;
  group.add(blade);
  group.add(handle);
  return group;
})();
swordMesh.position.set(SWORD_ORBIT_RADIUS, 0.6, 0);
swordOrbit.add(swordMesh);
scene.add(swordOrbit);

const swordWorldPos = new THREE.Vector3();
const lastSwordHitByEnemy: number[] = Array(ENEMY_COUNT).fill(-999);

// Caster enemies: purple capsules that throw fireballs at the player
const CASTER_COUNT = 5;
const CASTER_SPEED = 2.2;
const CASTER_SIZE = 0.6;
const CASTER_FIREBALL_COOLDOWN = 2.2;
const ENEMY_FIREBALL_SPEED = 12;
const ENEMY_FIREBALL_RADIUS = 0.3;
const ENEMY_FIREBALL_DAMAGE = 10;
const ENEMY_FIREBALL_TTL = 3;

const casterGroup = new THREE.Group();
const casterMeshes: THREE.Mesh[] = [];
const casterAlive: boolean[] = [];
const lastCasterThrowTime: number[] = [];

for (let i = 0; i < CASTER_COUNT; i++) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(CASTER_SIZE * 0.35, CASTER_SIZE * 0.5, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x7040a0, roughness: 0.6, metalness: 0.1 })
  );
  mesh.position.set(8 + Math.random() * 16, CASTER_SIZE / 2, 8 + Math.random() * 16);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  casterGroup.add(mesh);
  casterMeshes.push(mesh);
  casterAlive.push(true);
  lastCasterThrowTime.push(-999);
}
const MAX_CASTER_HEALTH = 90;
const casterHealth = Array(CASTER_COUNT).fill(MAX_CASTER_HEALTH);
const lastCasterResurrectTime: number[] = Array(CASTER_COUNT).fill(-999);

/** Returns true if the caster died. */
function damageCaster(c: number, amount: number): boolean {
  casterHealth[c] = Math.max(0, casterHealth[c] - amount);
  if (casterHealth[c] <= 0) {
    addXp(XP_CASTER);
    trySpawnDrop(casterMeshes[c].position.clone(), 'caster');
    casterGroup.remove(casterMeshes[c]);
    (casterMeshes[c].geometry as THREE.BufferGeometry).dispose();
    (casterMeshes[c].material as THREE.Material).dispose();
    casterAlive[c] = false;
    return true;
  }
  return false;
}

for (let c = 0; c < CASTER_COUNT; c++) {
  const bar = createEnemyHealthBar();
  bar.fill.style.background = 'linear-gradient(90deg,#8040a0,#b060c0)';
  enemyHealthBarsContainer.appendChild(bar.wrap);
  casterHealthBarEls.push(bar);
}
scene.add(casterGroup);

interface EnemyFireball {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
}
const enemyFireballs: EnemyFireball[] = [];

function createEnemyFireballMesh(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(ENEMY_FIREBALL_RADIUS, 10, 8);
  const material = new THREE.MeshStandardMaterial({
    color: 0xa040c0,
    emissive: 0x602080,
    emissiveIntensity: 0.5,
    roughness: 0.4,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const TERRAIN_XZ_MIN = 0;
const TERRAIN_XZ_MAX = 48;
const CHARACTER_MOVE_SPEED = 12;
const MOVE_ARRIVAL_DIST = 0.05;

let moveTarget: THREE.Vector3 | null = null;

function setMoveTargetFromMouse(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, isoCamera.three);
  const hits = raycaster.intersectObject(terrain);
  if (hits.length > 0) {
    const p = hits[0].point;
    const x = Math.max(TERRAIN_XZ_MIN, Math.min(TERRAIN_XZ_MAX, p.x));
    const z = Math.max(TERRAIN_XZ_MIN, Math.min(TERRAIN_XZ_MAX, p.z));
    if (moveTarget === null) moveTarget = new THREE.Vector3();
    moveTarget.set(x, 0, z);
  }
}

// Right-click: prevent context menu
clickOverlay.addEventListener('contextmenu', (e) => e.preventDefault());

clickOverlay.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // left button only
  if (isDead || isPaused) return;
  setMoveTargetFromMouse(e.clientX, e.clientY);
});

clickOverlay.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  if (!isDead && !isPaused && (e.buttons & 1) !== 0) setMoveTargetFromMouse(e.clientX, e.clientY);
});

function updateCharacterMove(dt: number): void {
  if (moveTarget === null) return;
  const dx = moveTarget.x - character.position.x;
  const dz = moveTarget.z - character.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist <= MOVE_ARRIVAL_DIST) {
    character.position.set(moveTarget.x, 0, moveTarget.z);
    moveTarget = null;
    return;
  }
  const step = CHARACTER_MOVE_SPEED * dt;
  const t = Math.min(1, step / dist);
  character.position.x += dx * t;
  character.position.z += dz * t;
  character.position.y = 0;
}

// Projectile ballistics (parabolic arc, land at cursor)
const PROJECTILE_GRAVITY = 22;
const LAUNCH_HEIGHT = 0.5;
const MAX_PROJECTILE_RANGE = 28;

/** Returns initial velocity so a projectile launched from origin (at launchHeight) lands at target (y=0), clamped to maxRange. */
function getLandingVelocity(
  origin: THREE.Vector3,
  target: THREE.Vector3,
  horizontalSpeed: number,
  gravity: number,
  maxRange: number,
  outVel: THREE.Vector3
): void {
  let dx = target.x - origin.x;
  let dz = target.z - origin.z;
  let d = Math.sqrt(dx * dx + dz * dz);
  if (d > maxRange) {
    d = maxRange;
    const scale = d / Math.sqrt(dx * dx + dz * dz);
    dx *= scale;
    dz *= scale;
  }
  if (d < 0.1) {
    outVel.set(horizontalSpeed, 0, 0);
    return;
  }
  outVel.x = (dx / d) * horizontalSpeed;
  outVel.z = (dz / d) * horizontalSpeed;
  const t = d / horizontalSpeed;
  let vy = 0.5 * gravity * t - LAUNCH_HEIGHT / t;
  if (vy < 0) vy = 0;
  outVel.y = vy;
}

// Fireballs: right-click shoots toward cursor
const FIREBALL_SPEED = 18;
const FIREBALL_RADIUS = 0.35;
const FIREBALL_TTL = 2;
const enemyAlive = Array.from({ length: ENEMY_COUNT }, () => false);
const enemyMatrix = new THREE.Matrix4();
const enemyPosition = new THREE.Vector3();
const enemyQuat = new THREE.Quaternion();
const enemyScale = new THREE.Vector3();

// Enemy health (grunts) and skill damage (base values; scaled by stats)
const MAX_ENEMY_HEALTH = 30;
const enemyHealth = Array(ENEMY_COUNT).fill(MAX_ENEMY_HEALTH);
const BASE_FIREBALL_DAMAGE = 25;
const BASE_ROCK_DAMAGE = 18;
const BASE_SWORD_DAMAGE = 12;

function getMeleeDamage(): number {
  return Math.round(BASE_SWORD_DAMAGE * (strength / 10));
}
function getMagicDamage(): number {
  return Math.round(BASE_FIREBALL_DAMAGE * (intelligence / 10));
}
function getRangedDamage(): number {
  return Math.round(BASE_ROCK_DAMAGE * (dexterity / 10));
}

/** Returns true if the enemy died. */
function damageRedCube(j: number, amount: number): boolean {
  enemyHealth[j] = Math.max(0, enemyHealth[j] - amount);
  if (enemyHealth[j] <= 0) {
    addXp(XP_RED_CUBE);
    trySpawnDrop(enemyPositions[j].clone(), 'redCube');
    createBody(enemyPositions[j].clone(), j);
    killEnemyInstance(enemies, j);
    enemyAlive[j] = false;
    return true;
  }
  return false;
}

// Enemies chase the character and deal contact damage
const ENEMY_SPEED = 3.5;
const ENEMY_TOUCH_RADIUS = 0.7; // character + enemy overlap
const ENEMY_DAMAGE = 8;
const ENEMY_DAMAGE_COOLDOWN = 1; // seconds between damage from same enemy
const lastEnemyDamageTime: number[] = Array(ENEMY_COUNT).fill(-999);

// Separation so enemies don't stack
const ENEMY_SEPARATION_RADIUS = 1.4;
const ENEMY_SEPARATION_STRENGTH = 2.5;
const enemyPositions = Array.from({ length: ENEMY_COUNT }, () => new THREE.Vector3());
const separationVec = new THREE.Vector3();

// Portal spawn: start with all grunts hidden; they spawn from the portal over time
const SPAWN_INTERVAL = 2.5;
let nextSpawnTime = 0; // first spawn immediately so cubes appear right away
const portalSpawnPos = new THREE.Vector3(PORTAL_POSITION.x, ENEMY_SIZE / 2, PORTAL_POSITION.z);
for (let j = 0; j < ENEMY_COUNT; j++) {
  killEnemyInstance(enemies, j);
}
enemies.instanceMatrix.needsUpdate = true;

// Bodies: when red cubes die they leave a corpse that casters can resurrect
interface Body {
  mesh: THREE.Mesh;
  enemyIndex: number;
  position: THREE.Vector3;
}
const bodies: Body[] = [];
const bodiesGroup = new THREE.Group();
scene.add(bodiesGroup);

const RESURRECT_RANGE = 3;
const RESURRECT_COOLDOWN = 4;

function createBody(position: THREE.Vector3, enemyIndex: number): void {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(ENEMY_SIZE * 0.9, ENEMY_SIZE * 0.3, ENEMY_SIZE * 0.9),
    new THREE.MeshStandardMaterial({ color: 0x4a2020, roughness: 0.9, metalness: 0 })
  );
  mesh.position.copy(position);
  mesh.position.y = ENEMY_SIZE * 0.15;
  mesh.rotation.x = Math.PI * 0.5;
  mesh.castShadow = true;
  bodiesGroup.add(mesh);
  bodies.push({ mesh, enemyIndex, position: position.clone() });
}

// Drop tables & pickups (health/mana orbs from dead monsters)
const PICKUP_RADIUS = 0.9;
const HEALTH_ORB_VALUE = 15;
const MANA_ORB_VALUE = 12;

interface Pickup {
  mesh: THREE.Mesh;
  type: DropType;
}

const pickupsGroup = new THREE.Group();
scene.add(pickupsGroup);
const pickups: Pickup[] = [];

function trySpawnDrop(position: THREE.Vector3, monsterType: MonsterType): void {
  const drop = rollDrop(monsterType);
  if (drop) createPickup(position, drop);
}

function createPickup(position: THREE.Vector3, type: NonNullable<DropType>): void {
  const isHealth = type === 'health';
  const geometry = new THREE.SphereGeometry(0.25, 10, 8);
  const material = new THREE.MeshStandardMaterial({
    color: isHealth ? 0xe05050 : 0x5080c0,
    emissive: isHealth ? 0x802020 : 0x204060,
    emissiveIntensity: 0.4,
    roughness: 0.4,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.position.y = 0.35;
  mesh.castShadow = true;
  mesh.userData = { type };
  pickupsGroup.add(mesh);
  pickups.push({ mesh, type });
}

function updatePickups(dt: number): void {
  const charPos = character.position;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const dist = p.mesh.position.distanceTo(charPos);
    if (dist < PICKUP_RADIUS) {
      if (p.type === 'health') setHealth(health + HEALTH_ORB_VALUE);
      else setMana(mana + MANA_ORB_VALUE);
      pickupsGroup.remove(p.mesh);
      (p.mesh.geometry as THREE.BufferGeometry).dispose();
      (p.mesh.material as THREE.Material).dispose();
      pickups.splice(i, 1);
    }
  }
}

const EXPLOSION_DURATION = 0.25;
const EXPLOSION_MAX_SCALE = 7; // doubled from 3.5
const EXPLOSION_HIT_RADIUS = FIREBALL_RADIUS * EXPLOSION_MAX_SCALE; // damage all enemies in this radius

interface Fireball {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
  state: 'flying' | 'exploding';
  explosionElapsed: number;
}

const fireballs: Fireball[] = [];

function createFireballMesh(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(FIREBALL_RADIUS, 12, 10);
  const material = new THREE.MeshStandardMaterial({
    color: 0xff6600,
    emissive: 0xff3300,
    emissiveIntensity: 0.6,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

clickOverlay.addEventListener('contextmenu', (e) => {
  if (isDead || isPaused || mana < FIREBALL_MANA_COST) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, isoCamera.three);
  const hits = raycaster.intersectObject(terrain);
  if (hits.length > 0) {
    setMana(mana - FIREBALL_MANA_COST);
    const target = hits[0].point.clone();
    target.y = 0;
    const mesh = createFireballMesh();
    mesh.position.copy(character.position);
    mesh.position.y = LAUNCH_HEIGHT;
    scene.add(mesh);
    const vel = new THREE.Vector3();
    getLandingVelocity(character.position, target, FIREBALL_SPEED, PROJECTILE_GRAVITY, MAX_PROJECTILE_RANGE, vel);
    fireballs.push({
      mesh,
      velocity: vel,
      ttl: FIREBALL_TTL,
      state: 'flying',
      explosionElapsed: 0,
    });
  }
});

function updateFireballs(dt: number): void {
  const hitRadius = ENEMY_SIZE / 2 + FIREBALL_RADIUS;
  for (let i = fireballs.length - 1; i >= 0; i--) {
    const fb = fireballs[i];

    if (fb.state === 'exploding') {
      fb.explosionElapsed += dt;
      const t = Math.min(1, fb.explosionElapsed / EXPLOSION_DURATION);
      const scale = 1 + (EXPLOSION_MAX_SCALE - 1) * t;
      fb.mesh.scale.setScalar(scale);
      const mat = fb.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 1 - t;
      if (fb.explosionElapsed >= EXPLOSION_DURATION) {
        scene.remove(fb.mesh);
        (fb.mesh.geometry as THREE.BufferGeometry).dispose();
        mat.dispose();
        fireballs.splice(i, 1);
      }
      continue;
    }

    fb.velocity.y -= PROJECTILE_GRAVITY * dt;
    fb.mesh.position.addScaledVector(fb.velocity, dt);
    fb.ttl -= dt;
    if (fb.mesh.position.y < 0) {
      fb.mesh.position.y = 0;
      fb.state = 'exploding';
      fb.velocity.set(0, 0, 0);
      fb.explosionElapsed = 0;
      for (let k = 0; k < ENEMY_COUNT; k++) {
        if (!enemyAlive[k]) continue;
        enemies.getMatrixAt(k, enemyMatrix);
        enemyPosition.setFromMatrixPosition(enemyMatrix);
        if (fb.mesh.position.distanceTo(enemyPosition) <= EXPLOSION_HIT_RADIUS) {
          damageRedCube(k, getMagicDamage());
        }
      }
      for (let c = 0; c < CASTER_COUNT; c++) {
        if (!casterAlive[c]) continue;
        if (fb.mesh.position.distanceTo(casterMeshes[c].position) <= EXPLOSION_HIT_RADIUS) {
          damageCaster(c, getMagicDamage());
        }
      }
      continue;
    }
    if (fb.ttl <= 0) {
      scene.remove(fb.mesh);
      (fb.mesh.geometry as THREE.BufferGeometry).dispose();
      (fb.mesh.material as THREE.Material).dispose();
      fireballs.splice(i, 1);
      continue;
    }
    for (let j = 0; j < ENEMY_COUNT; j++) {
      if (!enemyAlive[j]) continue;
      enemies.getMatrixAt(j, enemyMatrix);
      enemyPosition.setFromMatrixPosition(enemyMatrix);
      if (fb.mesh.position.distanceTo(enemyPosition) < hitRadius) {
        fb.state = 'exploding';
        fb.velocity.set(0, 0, 0);
        fb.explosionElapsed = 0;
        fb.mesh.position.copy(enemyPosition);
        for (let k = 0; k < ENEMY_COUNT; k++) {
          if (!enemyAlive[k]) continue;
          enemies.getMatrixAt(k, enemyMatrix);
          enemyPosition.setFromMatrixPosition(enemyMatrix);
          if (fb.mesh.position.distanceTo(enemyPosition) <= EXPLOSION_HIT_RADIUS) {
            damageRedCube(k, getMagicDamage());
          }
        }
        for (let c = 0; c < CASTER_COUNT; c++) {
          if (!casterAlive[c]) continue;
          if (fb.mesh.position.distanceTo(casterMeshes[c].position) <= EXPLOSION_HIT_RADIUS) {
            damageCaster(c, getMagicDamage());
          }
        }
        break;
      }
    }
    for (let c = 0; c < CASTER_COUNT; c++) {
      if (!casterAlive[c]) continue;
      if (fb.mesh.position.distanceTo(casterMeshes[c].position) < CASTER_SIZE / 2 + FIREBALL_RADIUS) {
        fb.state = 'exploding';
        fb.velocity.set(0, 0, 0);
        fb.explosionElapsed = 0;
        fb.mesh.position.copy(casterMeshes[c].position);
        for (let k = 0; k < ENEMY_COUNT; k++) {
          if (!enemyAlive[k]) continue;
          enemies.getMatrixAt(k, enemyMatrix);
          enemyPosition.setFromMatrixPosition(enemyMatrix);
          if (fb.mesh.position.distanceTo(enemyPosition) <= EXPLOSION_HIT_RADIUS) {
            damageRedCube(k, getMagicDamage());
          }
        }
        for (let c2 = 0; c2 < CASTER_COUNT; c2++) {
          if (!casterAlive[c2]) continue;
          if (fb.mesh.position.distanceTo(casterMeshes[c2].position) <= EXPLOSION_HIT_RADIUS) {
            damageCaster(c2, getMagicDamage());
          }
        }
        break;
      }
    }
  }
}

// Throw skill: rock projectiles (Q key, toward cursor)
const ROCK_SPEED = 14;
const ROCK_RADIUS = 0.25;
const ROCK_TTL = 1.8;

interface Rock {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
}

const rocks: Rock[] = [];

function createRockMesh(): THREE.Mesh {
  const geometry = new THREE.DodecahedronGeometry(ROCK_RADIUS, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6a5a4a,
    roughness: 0.9,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

function throwRock(): void {
  if (mana < THROW_MANA_COST) return;
  raycaster.setFromCamera(pointer, isoCamera.three);
  const hits = raycaster.intersectObject(terrain);
  if (hits.length === 0) return;
  setMana(mana - THROW_MANA_COST);
  const target = hits[0].point.clone();
  target.y = 0;
  const mesh = createRockMesh();
  mesh.position.copy(character.position);
  mesh.position.y = LAUNCH_HEIGHT;
  scene.add(mesh);
  const vel = new THREE.Vector3();
  getLandingVelocity(character.position, target, ROCK_SPEED, PROJECTILE_GRAVITY, MAX_PROJECTILE_RANGE, vel);
  rocks.push({
    mesh,
    velocity: vel,
    ttl: ROCK_TTL,
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    e.preventDefault();
    if (!isDead) setPaused(!isPaused);
    return;
  }
  if (e.key === 'q' || e.key === 'Q') {
    e.preventDefault();
    if (!isDead && !isPaused) throwRock();
  }
});

function updateRocks(dt: number): void {
  const hitRadius = ENEMY_SIZE / 2 + ROCK_RADIUS;
  for (let i = rocks.length - 1; i >= 0; i--) {
    const rock = rocks[i];
    rock.velocity.y -= PROJECTILE_GRAVITY * dt;
    rock.mesh.position.addScaledVector(rock.velocity, dt);
    rock.ttl -= dt;
    if (rock.mesh.position.y < 0) {
      scene.remove(rock.mesh);
      (rock.mesh.geometry as THREE.BufferGeometry).dispose();
      (rock.mesh.material as THREE.Material).dispose();
      rocks.splice(i, 1);
      continue;
    }
    if (rock.ttl <= 0) {
      scene.remove(rock.mesh);
      (rock.mesh.geometry as THREE.BufferGeometry).dispose();
      (rock.mesh.material as THREE.Material).dispose();
      rocks.splice(i, 1);
      continue;
    }
    for (let j = 0; j < ENEMY_COUNT; j++) {
      if (!enemyAlive[j]) continue;
      enemies.getMatrixAt(j, enemyMatrix);
      enemyPosition.setFromMatrixPosition(enemyMatrix);
      if (rock.mesh.position.distanceTo(enemyPosition) < hitRadius) {
        damageRedCube(j, getRangedDamage());
        scene.remove(rock.mesh);
        (rock.mesh.geometry as THREE.BufferGeometry).dispose();
        (rock.mesh.material as THREE.Material).dispose();
        rocks.splice(i, 1);
        break;
      }
    }
    const rockCasterRadius = CASTER_SIZE / 2 + ROCK_RADIUS;
    for (let c = 0; c < CASTER_COUNT; c++) {
      if (!casterAlive[c]) continue;
      if (rock.mesh.position.distanceTo(casterMeshes[c].position) < rockCasterRadius) {
        damageCaster(c, getRangedDamage());
        scene.remove(rock.mesh);
        (rock.mesh.geometry as THREE.BufferGeometry).dispose();
        (rock.mesh.material as THREE.Material).dispose();
        rocks.splice(i, 1);
        break;
      }
    }
  }
}

function updateSword(dt: number, gameTime: number): void {
  swordOrbit.position.copy(character.position);
  swordOrbit.rotation.y += SWORD_ANGULAR_SPEED * dt;
  swordMesh.getWorldPosition(swordWorldPos);
  const hitDist = ENEMY_SIZE / 2 + SWORD_HIT_RADIUS;
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    if (gameTime - lastSwordHitByEnemy[j] < SWORD_HIT_COOLDOWN) continue;
    enemies.getMatrixAt(j, enemyMatrix);
    enemyPosition.setFromMatrixPosition(enemyMatrix);
    if (swordWorldPos.distanceTo(enemyPosition) < hitDist) {
      damageRedCube(j, getMeleeDamage());
      lastSwordHitByEnemy[j] = gameTime;
    }
  }
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (!casterAlive[c]) continue;
    if (swordWorldPos.distanceTo(casterMeshes[c].position) < CASTER_SIZE / 2 + SWORD_HIT_RADIUS) {
      damageCaster(c, getMeleeDamage());
    }
  }
}

function updateCasters(dt: number, gameTime: number): void {
  const charPos = character.position;
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (!casterAlive[c]) continue;
    const pos = casterMeshes[c].position;
    const dx = charPos.x - pos.x;
    const dz = charPos.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.02) {
      const move = Math.min(CASTER_SPEED * dt, dist);
      pos.x += (dx / dist) * move;
      pos.z += (dz / dist) * move;
    }
    pos.y = CASTER_SIZE / 2;

    if (gameTime - lastCasterResurrectTime[c] >= RESURRECT_COOLDOWN && bodies.length > 0) {
      let nearestIdx = -1;
      let nearestDist = RESURRECT_RANGE;
      for (let b = 0; b < bodies.length; b++) {
        const d = pos.distanceTo(bodies[b].position);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = b;
        }
      }
      if (nearestIdx >= 0) {
        const body = bodies[nearestIdx];
        resurrectEnemyInstance(enemies, body.enemyIndex, body.position);
        enemyPositions[body.enemyIndex].copy(body.position);
        enemyHealth[body.enemyIndex] = MAX_ENEMY_HEALTH;
        enemyAlive[body.enemyIndex] = true;
        bodiesGroup.remove(body.mesh);
        (body.mesh.geometry as THREE.BufferGeometry).dispose();
        (body.mesh.material as THREE.Material).dispose();
        bodies.splice(nearestIdx, 1);
        lastCasterResurrectTime[c] = gameTime;
      }
    }

    if (gameTime - lastCasterThrowTime[c] >= CASTER_FIREBALL_COOLDOWN) {
      lastCasterThrowTime[c] = gameTime;
      const dir = new THREE.Vector3(charPos.x - pos.x, 0, charPos.z - pos.z).normalize();
      const mesh = createEnemyFireballMesh();
      mesh.position.copy(pos);
      mesh.position.y = CASTER_SIZE * 0.6;
      scene.add(mesh);
      enemyFireballs.push({
        mesh,
        velocity: dir.multiplyScalar(ENEMY_FIREBALL_SPEED),
        ttl: ENEMY_FIREBALL_TTL,
      });
    }
  }
}

function updateEnemyFireballs(dt: number): void {
  const charPos = character.position;
  const hitRadius = 0.5 + ENEMY_FIREBALL_RADIUS;
  for (let i = enemyFireballs.length - 1; i >= 0; i--) {
    const ef = enemyFireballs[i];
    ef.mesh.position.addScaledVector(ef.velocity, dt);
    ef.ttl -= dt;
    if (ef.mesh.position.distanceTo(charPos) < hitRadius) {
      setHealth(health - ENEMY_FIREBALL_DAMAGE);
      scene.remove(ef.mesh);
      (ef.mesh.geometry as THREE.BufferGeometry).dispose();
      (ef.mesh.material as THREE.Material).dispose();
      enemyFireballs.splice(i, 1);
      continue;
    }
    if (ef.ttl <= 0) {
      scene.remove(ef.mesh);
      (ef.mesh.geometry as THREE.BufferGeometry).dispose();
      (ef.mesh.material as THREE.Material).dispose();
      enemyFireballs.splice(i, 1);
    }
  }
}

function updateEnemies(dt: number, gameTime: number): void {
  const charPos = character.position;

  // Pass 1: move each alive enemy toward the character, store new position
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    enemies.getMatrixAt(j, enemyMatrix);
    enemyMatrix.decompose(enemyPosition, enemyQuat, enemyScale);
    const dx = charPos.x - enemyPosition.x;
    const dz = charPos.z - enemyPosition.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.01) {
      const move = Math.min(ENEMY_SPEED * dt, dist);
      enemyPosition.x += (dx / dist) * move;
      enemyPosition.z += (dz / dist) * move;
    }
    enemyPosition.y = ENEMY_SIZE / 2;
    enemyPositions[j].copy(enemyPosition);
  }

  // Pass 2: separation - push apart from nearby enemies
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    separationVec.set(0, 0, 0);
    for (let k = 0; k < ENEMY_COUNT; k++) {
      if (k === j || !enemyAlive[k]) continue;
      const d = enemyPositions[j].distanceTo(enemyPositions[k]);
      if (d < ENEMY_SEPARATION_RADIUS && d > 0.001) {
        enemyPosition.copy(enemyPositions[j]).sub(enemyPositions[k]).normalize().multiplyScalar(1 - d / ENEMY_SEPARATION_RADIUS);
        separationVec.add(enemyPosition);
      }
    }
    enemyPositions[j].addScaledVector(separationVec, ENEMY_SEPARATION_STRENGTH * dt);
    enemyPositions[j].y = ENEMY_SIZE / 2;
  }

  // Pass 3: write back to matrices and check contact damage
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    enemies.getMatrixAt(j, enemyMatrix);
    enemyMatrix.decompose(enemyPosition, enemyQuat, enemyScale);
    enemyMatrix.compose(enemyPositions[j], enemyQuat, enemyScale);
    enemies.setMatrixAt(j, enemyMatrix);

    if (enemyPositions[j].distanceTo(charPos) < ENEMY_TOUCH_RADIUS && gameTime - lastEnemyDamageTime[j] >= ENEMY_DAMAGE_COOLDOWN) {
      setHealth(health - ENEMY_DAMAGE);
      lastEnemyDamageTime[j] = gameTime;
    }
  }
  enemies.instanceMatrix.needsUpdate = true;
}

let lastFrameTime = performance.now();
let smoothedFps = 60;
let gameTime = 0;

const sizeWarningEl = document.createElement('div');
sizeWarningEl.style.cssText = 'position:absolute;bottom:10px;left:50%;transform:translateX(-50%);padding:6px 12px;background:rgba(0,0,0,0.8);color:#f88;font:12px sans-serif;border-radius:4px;display:none;z-index:5;pointer-events:none;';
sizeWarningEl.textContent = 'Canvas collapsed (0 size) — release drag or resize window';
container.appendChild(sizeWarningEl);

const MANA_REGEN_PER_SECOND = 5;

const gameLoop = new GameLoop(
  (dt) => {
    if (isPaused) return;
    gameTime += dt;
    isoCamera.setWorldFocus(character.position.x, character.position.y, character.position.z);
    if (isDead) return;
    setMana(mana + MANA_REGEN_PER_SECOND * dt);
    // Spawn an enemy from the portal when the timer is up
    if (gameTime >= nextSpawnTime) {
      nextSpawnTime = gameTime + SPAWN_INTERVAL;
      for (let j = 0; j < ENEMY_COUNT; j++) {
        if (!enemyAlive[j]) {
          resurrectEnemyInstance(enemies, j, portalSpawnPos);
          enemyAlive[j] = true;
          enemyHealth[j] = MAX_ENEMY_HEALTH;
          enemyPositions[j].copy(portalSpawnPos);
          lastEnemyDamageTime[j] = -999;
          lastSwordHitByEnemy[j] = -999;
          break;
        }
      }
    }
    updateCharacterMove(dt);
    updateEnemies(dt, gameTime);
    updateCasters(dt, gameTime);
    updateSword(dt, gameTime);
    updateFireballs(dt);
    updateRocks(dt);
    updateEnemyFireballs(dt);
    updatePickups(dt);
  },
  () => {
    if (glContextLost) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (cw <= 0 || ch <= 0) {
      sizeWarningEl.style.display = 'block';
      onResize();
      return;
    }
    sizeWarningEl.style.display = 'none';
    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    if (dt > 0) {
      const instant = 1 / dt;
      smoothedFps += (instant - smoothedFps) * 0.08;
      fpsEl.textContent = `${Math.round(smoothedFps)} FPS`;
    }
    const camera = isoCamera.three;
    for (let j = 0; j < ENEMY_COUNT; j++) {
      const bar = enemyHealthBarEls[j];
      if (!enemyAlive[j]) {
        bar.wrap.style.visibility = 'hidden';
        continue;
      }
      healthBarProjectionVec.set(enemyPositions[j].x, enemyPositions[j].y + HEALTH_BAR_Y_OFFSET, enemyPositions[j].z);
      healthBarProjectionVec.project(camera);
      const px = (healthBarProjectionVec.x * 0.5 + 0.5) * cw;
      const py = (1 - (healthBarProjectionVec.y * 0.5 + 0.5)) * ch;
      bar.wrap.style.left = `${px - ENEMY_HEALTH_BAR_WIDTH / 2}px`;
      bar.wrap.style.top = `${py - ENEMY_HEALTH_BAR_HEIGHT - 4}px`;
      bar.wrap.style.visibility = 'visible';
      bar.fill.style.width = `${(enemyHealth[j] / MAX_ENEMY_HEALTH) * 100}%`;
    }
    for (let c = 0; c < CASTER_COUNT; c++) {
      const bar = casterHealthBarEls[c];
      if (!casterAlive[c]) {
        bar.wrap.style.visibility = 'hidden';
        continue;
      }
      const pos = casterMeshes[c].position;
      healthBarProjectionVec.set(pos.x, pos.y + HEALTH_BAR_Y_OFFSET, pos.z);
      healthBarProjectionVec.project(camera);
      const px = (healthBarProjectionVec.x * 0.5 + 0.5) * cw;
      const py = (1 - (healthBarProjectionVec.y * 0.5 + 0.5)) * ch;
      bar.wrap.style.left = `${px - ENEMY_HEALTH_BAR_WIDTH / 2}px`;
      bar.wrap.style.top = `${py - ENEMY_HEALTH_BAR_HEIGHT - 4}px`;
      bar.wrap.style.visibility = 'visible';
      bar.fill.style.width = `${(casterHealth[c] / MAX_CASTER_HEALTH) * 100}%`;
    }
    renderer.render(scene, isoCamera.three);
  }
);

function onResize(): void {
  let w = container.clientWidth;
  let h = container.clientHeight;
  if (w <= 0 || h <= 0) {
    w = window.innerWidth;
    h = window.innerHeight;
  }
  if (w <= 0 || h <= 0) return;
  width = w;
  height = h;
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  isoCamera.resize(width, height);
}

window.addEventListener('resize', onResize);

function forceRepaint(): void {
  if (!glContextLost && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
    renderer.render(scene, isoCamera.three);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') forceRepaint();
});

gameLoop.start();
