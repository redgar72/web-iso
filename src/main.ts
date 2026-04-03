import * as THREE from 'three';
import { FollowCamera } from './core/FollowCamera';
import { GameLoop } from './core/GameLoop';
import { TickClock } from './core/GameTick';
import { TILE_SIZE } from './scene/IsoTerrain';
import {
  findTilePath,
  tileCenterXZ,
  worldXZToTile,
  tileKey,
  nextTileTowardGoal,
  pickGreedyStepAway,
  areOrthogonallyAdjacent,
  findClosestReachableOrthAdjacentTile,
  replaceTileNavExceptions,
  findNearestOccupiableTile,
  TERRAIN_GRID_DEPTH,
  TERRAIN_GRID_WIDTH,
  type GridTile,
  type TileNavProfile,
} from './world/TilePathfinding';
import {
  createGatheringNodesRoot,
  GATHERING_NODE_DEFINITIONS,
  gatheringTileNavExceptions,
  gatheringExamineLine,
  gatheringNodeIndexFromIntersection,
  GATHERING_HARVEST_TICK_INTERVAL,
  GATHERING_SUCCESS_CHANCE,
  pickGatheringReward,
} from './world/GatheringNodes';
import { createIsoLights } from './scene/IsoLights';
import { buildTerrainFollowingGridGeometry } from './scene/terrainDebugGrid';
import { buildWaterTileIndicatorGeometry } from './scene/waterTileIndicators';
import { ENEMY_COUNT, ENEMY_SIZE, killEnemyInstance, resurrectEnemyInstance } from './scene/Enemies';
import { rollDrop, type MonsterType } from './drops/DropTables';
import { createPlaceholderCharacter } from './character/loadFbxCharacter';
import { createWaves, FRESH_GRID_MODE } from './game/Waves';
import { createEquipment } from './state/Equipment';
import { createInventory, INVENTORY_SLOTS } from './state/Inventory';
import {
  createPlayerSkills,
  PLAYER_SKILL_SECTIONS,
  PLAYER_SKILL_LABEL,
  GATHERING_SUCCESS_SKILL_XP,
} from './state/PlayerSkills';
import {
  EQUIPMENT_SLOT_ORDER,
  getItemDef,
  getExamineMessage,
  type ItemId,
  type EquipmentSlotId,
} from './items/ItemTypes';
import { createSword } from './combat/Sword';
import { createArrows } from './combat/Projectiles';
import type { CombatState } from './combat/types';
import {
  TELEPORTER_COUNT,
  TELEPORTER_SIZE,
  TELEPORTER_TELEPORT_RANGE,
  TELEPORTER_TELEPORT_COOLDOWN,
  TELEPORTER_POISON_POOL_COOLDOWN,
  POISON_THROW_DISTANCE,
  POISON_POOL_RADIUS,
  POISON_INDICATOR_DURATION,
  POISON_POOL_DURATION,
  POISON_DURATION,
  POISON_DAMAGE_PER_TICK,
  POISON_TICK_INTERVAL,
  MAX_TELEPORTER_HEALTH,
  XP_TELEPORTER,
  BATTLE_MIN,
  BATTLE_MAX,
  XP_BOSS,
  BOSS_FIREBALL_BURN_DURATION,
  BOSS_FIREBALL_BURN_TICK_INTERVAL,
  BOSS_FIREBALL_BURN_DAMAGE_PER_SECOND,
  TERRAIN_XZ_MIN,
  TERRAIN_XZ_MAX,
} from './config/Constants';
import { createBoss, type BossApi } from './scene/Boss';
import { createTeleporters, type TeleporterAPI } from './scene/Teleporters';
import { createHUD, type HUDState } from './ui/HUD';
import { createMinimap } from './ui/Minimap';
import { createPlayerBurnVisuals } from './effects/BurnVisuals';
import { createPlayerPoisonVisuals } from './effects/PoisonVisuals';
import { createPoisonPools } from './effects/PoisonPools';
import { createGroundItems } from './world/GroundItems';
import { MultiplayerClient, type MultiplayerHandlers } from './net/MultiplayerClient';
import { SpacetimeMultiplayerClient } from './net/SpacetimeMultiplayerClient';
import { createRemotePlayers } from './scene/RemotePlayers';
import {
  loadGameOptions,
  saveGameOptions,
  getRendererPixelRatio,
  applyGameOptions,
  type GameOptionsState,
} from './game/GameOptions';
import { formatRunTime, getBestRunTimeSeconds, setBestRunTimeSeconds } from './game/RunRecord';
import { createHitMarkerOverlay } from './ui/HitMarkers';
import { PEN_RAT_COUNT, PEN_RAT_SIZE } from './scene/PenRats';
import { STARTING_WILDLIFE_COUNT, wildlifeKindAt } from './scene/StartingAreaWildlife';
import { createNpcSceneContent } from './scene/NpcSetup';
import { penRatIndexFromIntersection, startingWildlifeIndexFromIntersection } from './scene/meshes';
import { CHUNK_SIZE } from '../shared/levelChunk';
import { ChunkTerrainLoader } from './world/chunkTerrainLoader';
import { applyTerrainPaintAtTile } from './world/inGameTerrainPaint';
import { createTerrainEditPanel } from './ui/TerrainEditPanel';
import { createServerWildlifeRuntime } from './scene/serverWildlifeRuntime';
import type { DbConnection } from './net/stdb';
import {
  npcSpawnerIdFromIntersection,
  serverWildlifeEntityFromIntersection,
} from './scene/meshes/StartingWildlifeMeshes';
import { SERVER_NPC_TEMPLATE_KEYS } from '../shared/serverNpcTemplates';

const container = document.getElementById('app')!;

let levelEditorInvincible = false;

const spacetimeUriRaw =
  typeof import.meta.env.VITE_SPACETIMEDB_URI === 'string' ? import.meta.env.VITE_SPACETIMEDB_URI.trim() : '';
const spacetimeModuleRaw =
  typeof import.meta.env.VITE_SPACETIMEDB_MODULE === 'string'
    ? import.meta.env.VITE_SPACETIMEDB_MODULE.trim()
    : 'aidans-game';
const useSpacetimeMp = spacetimeUriRaw.length > 0;

let multiplayerClient: MultiplayerClient | SpacetimeMultiplayerClient | null = null;

// Equipment & inventory (sword equipped by default; bow in inventory for testing)
const equipment = createEquipment('sword');
const inventory = createInventory(['bow']);
const playerSkills = createPlayerSkills();
let width = container.clientWidth;
let height = container.clientHeight;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1820);
scene.fog = new THREE.Fog(0x1a1820, 55, 180);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'default',
  stencil: false,
  depth: true,
  preserveDrawingBuffer: true,
});
renderer.setSize(width, height);

let gameOptions = loadGameOptions();

applyGameOptions(renderer, gameOptions);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const clickOverlay = document.createElement('div');
clickOverlay.style.cssText = 'position:absolute;inset:0;z-index:1;';
container.appendChild(clickOverlay);

/** Screen-space ripples for left-clicks on the scene (below HUD menus). */
const clickRippleLayer = document.createElement('div');
clickRippleLayer.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;overflow:hidden;';
container.appendChild(clickRippleLayer);

type SceneClickRippleKind = 'walk' | 'interact';

function spawnSceneClickRipple(clientX: number, clientY: number, kind: SceneClickRippleKind): void {
  const rect = container.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const ring = document.createElement('div');
  const stroke =
    kind === 'walk'
      ? 'rgba(100, 180, 255, 0.95)'
      : 'rgba(255, 95, 95, 0.95)';
  ring.style.cssText =
    `position:absolute;left:${x}px;top:${y}px;width:14px;height:14px;margin:-7px 0 0 -7px;` +
    `border-radius:50%;border:2px solid ${stroke};box-sizing:border-box;` +
    'pointer-events:none;will-change:transform,opacity;';
  clickRippleLayer.appendChild(ring);
  ring.animate(
    [
      { transform: 'scale(0.35)', opacity: 1 },
      { transform: 'scale(3.2)', opacity: 0 },
    ],
    { duration: 420, easing: 'cubic-bezier(0.2, 0.75, 0.35, 1)' }
  ).onfinish = () => ring.remove();
}

let glContextLost = false;
const contextLostEl = document.createElement('div');
contextLostEl.id = 'context-lost';
contextLostEl.textContent = 'Graphics reset — reloading…';
contextLostEl.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#1a1820;color:#ccc;font:18px sans-serif;z-index:10;pointer-events:none;';
container.appendChild(contextLostEl);

canvas.addEventListener('webglcontextlost', (e: Event) => {
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

// Run timer (resets on respawn; best time persisted for competition). FPS/timer display in HUD.
let runTime = 0;

// Health & Mana bars (DOM moved to HUD; state stays here)
const BASE_MAX_HEALTH = 100;
const MAX_MANA = 100;
let mana = MAX_MANA;

// Character base stats (at 10 = 100% of base)
let strength = 10;     // melee damage
let intelligence = 10;  // magic damage
let dexterity = 10;     // ranged damage
let vitality = 10;      // max health
/** Unspent stat points from level ups (3 per level to allocate to Str/Int/Dex/Vit). */
let statPointsToAllocate = 0;

function getMaxHealth(): number {
  return Math.round(BASE_MAX_HEALTH * (vitality / 10));
}

// XP and leveling
let level = 1;
let xp = 0;
const XP_RED_CUBE = 12;
const XP_PEN_RAT = 5;
const XP_SPIDER = 4;
const XP_BEAR = 11;
const XP_CASTER = 35;
const XP_RESURRECTOR = 40;

function getXpForNextLevel(): number {
  return 80 * level; // e.g. 80 to reach 2, 160 to reach 3
}

let health = getMaxHealth();

/** Equipment slots — mounted under the Equipment tab of the game menu panel (I). */
const equipmentSlotsEl = document.createElement('div');
equipmentSlotsEl.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
const SLOT_SIZE = 44;
const slotStyle = `width:${SLOT_SIZE}px;height:${SLOT_SIZE}px;background:rgba(0,0,0,0.5);border:2px solid rgba(255,255,255,0.25);border-radius:8px;display:flex;align-items:center;justify-content:center;font:11px sans-serif;color:rgba(255,255,255,0.9);cursor:pointer;transition:border-color 0.15s,background 0.15s;`;
function renderEquipmentPanel(): void {
  equipmentSlotsEl.innerHTML = '';
  for (const slotId of EQUIPMENT_SLOT_ORDER) {
    const slotDiv = document.createElement('div');
    slotDiv.title = slotId === 'weapon' ? 'Weapon' : slotId;
    slotDiv.style.cssText = slotStyle;
    const itemId = equipment.getEquipped(slotId);
    if (itemId) {
      const def = getItemDef(itemId);
      slotDiv.textContent = def.label;
      slotDiv.style.background = 'rgba(60,80,120,0.5)';
      slotDiv.style.borderColor = 'rgba(255,255,255,0.4)';
      slotDiv.addEventListener('click', () => {
        const firstEmpty = inventory.findFirstEmpty();
        if (firstEmpty >= 0) {
          equipment.setEquipped(slotId, null);
          inventory.setSlot(firstEmpty, { itemId, count: 1 });
        }
      });
    } else {
      slotDiv.textContent = slotId === 'weapon' ? 'Weapon' : slotId;
      slotDiv.style.color = 'rgba(255,255,255,0.45)';
    }
    equipmentSlotsEl.appendChild(slotDiv);
  }
}

// Prayer system (RuneScape-style)
type PrayerType = 'melee' | 'mage' | 'range' | null;
let activePrayer: PrayerType = null;

const prayerEl = document.createElement('div');
prayerEl.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:12px;';
const prayerLabel = document.createElement('div');
prayerLabel.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.85);margin-bottom:2px;';
prayerLabel.textContent = 'Prayer';
prayerEl.appendChild(prayerLabel);

const prayerButtonsEl = document.createElement('div');
prayerButtonsEl.style.cssText = 'display:flex;gap:6px;';

function createPrayerButton(type: PrayerType, color: string, label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = `flex:1;padding:8px;font:11px sans-serif;border-radius:6px;border:2px solid ${color};background:rgba(0,0,0,0.4);color:${color};cursor:pointer;font-weight:bold;transition:all 0.2s;`;
  btn.addEventListener('click', () => {
    if (activePrayer === type) {
      activePrayer = null;
    } else {
      activePrayer = type;
    }
    updatePrayerButtons();
  });
  return btn;
}

const meleePrayerBtn = createPrayerButton('melee', '#ff4444', 'Melee');
const magePrayerBtn = createPrayerButton('mage', '#4488ff', 'Mage');
const rangePrayerBtn = createPrayerButton('range', '#44ff44', 'Range');

prayerButtonsEl.appendChild(meleePrayerBtn);
prayerButtonsEl.appendChild(magePrayerBtn);
prayerButtonsEl.appendChild(rangePrayerBtn);
prayerEl.appendChild(prayerButtonsEl);

// Position prayer buttons in center-bottom of screen (under character)
prayerEl.style.cssText = 'position:absolute;bottom:80px;left:50%;transform:translateX(-50%);z-index:5;display:flex;flex-direction:column;gap:6px;pointer-events:none;';
prayerLabel.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.85);margin-bottom:2px;text-align:center;';
prayerButtonsEl.style.cssText = 'display:flex;gap:6px;pointer-events:auto;';
container.appendChild(prayerEl);

function updatePrayerButtons(): void {
  const updateBtn = (btn: HTMLButtonElement, type: PrayerType) => {
    const isActive = activePrayer === type;
    if (type === 'melee') {
      btn.style.background = isActive ? 'rgba(255,68,68,0.6)' : 'rgba(0,0,0,0.4)';
      btn.style.boxShadow = isActive ? '0 0 8px rgba(255,68,68,0.8)' : 'none';
    } else if (type === 'mage') {
      btn.style.background = isActive ? 'rgba(68,136,255,0.6)' : 'rgba(0,0,0,0.4)';
      btn.style.boxShadow = isActive ? '0 0 8px rgba(68,136,255,0.8)' : 'none';
    } else if (type === 'range') {
      btn.style.background = isActive ? 'rgba(68,255,68,0.6)' : 'rgba(0,0,0,0.4)';
      btn.style.boxShadow = isActive ? '0 0 8px rgba(68,255,68,0.8)' : 'none';
    }
  };
  updateBtn(meleePrayerBtn, 'melee');
  updateBtn(magePrayerBtn, 'mage');
  updateBtn(rangePrayerBtn, 'range');
}

function isDamageBlocked(damageType: 'melee' | 'mage' | 'range'): boolean {
  return activePrayer === damageType;
}

// Chat section (wave completed messages, etc.)
const CHAT_MAX_MESSAGES = 50;
const chatSectionEl = document.createElement('div');
chatSectionEl.id = 'chat-section';
const chatTitleEl = document.createElement('div');
chatTitleEl.className = 'chat-title';
chatTitleEl.textContent = 'Chat';
const chatMessagesEl = document.createElement('div');
chatMessagesEl.id = 'chat-messages';
chatSectionEl.appendChild(chatTitleEl);
chatSectionEl.appendChild(chatMessagesEl);
container.appendChild(chatSectionEl);

const chatInputEl = document.createElement('input');
chatInputEl.id = 'chat-input';
chatInputEl.type = 'text';
chatInputEl.autocomplete = 'off';
chatInputEl.spellcheck = true;
chatInputEl.maxLength = 220;
chatInputEl.style.cssText =
  'display:none;width:100%;box-sizing:border-box;padding:6px 8px;border:none;border-top:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.5);color:#eee;font:12px sans-serif;outline:none';
chatSectionEl.appendChild(chatInputEl);

function isTypingInOtherFormField(target: EventTarget | null): boolean {
  if (
    !(
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    )
  ) {
    return false;
  }
  return target !== chatInputEl;
}

function spacetimeLoginOverlayBlocksChat(): boolean {
  const el = document.getElementById('spacetime-login-overlay');
  if (!el) return false;
  return getComputedStyle(el).display !== 'none';
}

function setChatOpen(open: boolean): void {
  chatSectionEl.style.borderColor = open ? 'rgba(120,170,255,0.45)' : 'rgba(255,255,255,0.15)';
  chatSectionEl.style.pointerEvents = open ? 'auto' : 'none';
  if (open) {
    chatInputEl.style.display = 'block';
    chatTitleEl.textContent = 'Chat — Enter to send, Esc to close';
    queueMicrotask(() => chatInputEl.focus());
  } else {
    chatInputEl.blur();
    chatInputEl.style.display = 'none';
    chatTitleEl.textContent = 'Chat';
  }
}

function addChatMessage(text: string): void {
  const msg = document.createElement('div');
  msg.className = 'chat-msg';
  msg.textContent = text;
  chatMessagesEl.appendChild(msg);
  while (chatMessagesEl.children.length > CHAT_MAX_MESSAGES) chatMessagesEl.removeChild(chatMessagesEl.firstChild!);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function updateXpDisplay(): void {
  // No-op: HUD shows XP from state each frame
}
function updateStatsDisplay(): void {
  // No-op: HUD shows stats from state each frame
}

// barsEl replaced by HUD; equipment panel inserted into HUD after createHUD()

// Game over state & overlay
/** Tile centers align with IsoTerrain instancing. */
const SPAWN_POSITION = new THREE.Vector3(5 * TILE_SIZE + TILE_SIZE / 2, 0, 5 * TILE_SIZE + TILE_SIZE / 2);
let isDead = false;

const gameOverEl = document.createElement('div');
gameOverEl.id = 'game-over';
gameOverEl.style.cssText =
  'position:absolute;inset:0;z-index:20;display:none;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);';
const gameOverTitle = document.createElement('div');
gameOverTitle.textContent = 'You died';
gameOverTitle.style.cssText = 'font:32px sans-serif;color:#e8a0a0;font-weight:bold;text-shadow:0 0 20px rgba(200,80,80,0.5);';
const gameOverTimeEl = document.createElement('div');
gameOverTimeEl.style.cssText = 'font:18px sans-serif;color:rgba(255,255,255,0.9);';
const gameOverBestEl = document.createElement('div');
gameOverBestEl.style.cssText = 'font:16px sans-serif;color:#a0c0a0;';
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
gameOverEl.appendChild(gameOverTimeEl);
gameOverEl.appendChild(gameOverBestEl);
gameOverEl.appendChild(respawnBtn);
container.appendChild(gameOverEl);

function showGameOver(): void {
  isDead = true;
  const best = getBestRunTimeSeconds();
  const isNewBest = runTime > best;
  if (isNewBest) setBestRunTimeSeconds(runTime);
  gameOverTimeEl.textContent = `Time: ${formatRunTime(runTime)}`;
  gameOverBestEl.textContent = isNewBest ? `New best! ${formatRunTime(runTime)}` : `Best: ${formatRunTime(best)}`;
  gameOverEl.style.display = 'flex';
}

function respawn(): void {
  isDead = false;
  runTime = 0;
  gameOverEl.style.display = 'none';
  setHealth(getMaxHealth());
  setMana(MAX_MANA);
  character.position.copy(SPAWN_POSITION);
  snapCharacterToWalkableGround();
  clearTileMovement();
  trainingDummyAlive = true;
  trainingDummyHealth = MAX_TRAINING_DUMMY_HP;
  trainingDummyGroup.visible = true;
  trainingDummyMeleeTickCounter = -1;
  pendingTrainingDummyMeleeSwings = 0;
  playerBurning = false; // Clear burning on respawn
  playerPoisoned = false; // Clear poison on respawn
  activePrayer = null; // Clear prayer on respawn
  updatePrayerButtons();
  waves.startWave(1);
  playerRunEnergy = RUN_ENERGY_MAX;
  playerRunEnabled = true;
}

respawnBtn.addEventListener('click', respawn);

/** Called when player levels up (e.g. to open character sheet for stat points). */
const levelUpNotifier: { callback: (() => void) | null } = { callback: null };

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

function makeOptionsSectionTitle(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText =
    'font:11px sans-serif;color:rgba(255,220,160,0.85);text-transform:uppercase;letter-spacing:0.06em;margin:14px 0 6px;';
  return el;
}

function makeOptionsCheckbox(label: string, key: keyof GameOptionsState): HTMLElement {
  const row = document.createElement('label');
  row.style.cssText =
    'display:flex;align-items:flex-start;gap:8px;font:12px sans-serif;color:#e0dce8;cursor:pointer;user-select:none;line-height:1.35;';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = gameOptions[key];
  input.addEventListener('change', () => {
    gameOptions[key] = input.checked;
    saveGameOptions(gameOptions);
    applyGameOptions(renderer, gameOptions);
  });
  const span = document.createElement('span');
  span.textContent = label;
  row.appendChild(input);
  row.appendChild(span);
  return row;
}

// Game menu panel: I toggles (remembers tab); K opens Skills tab. Tabs — Inventory, Equipment, Skills, Options
const gameMenuEl = document.createElement('div');
gameMenuEl.id = 'game-menu-panel';
gameMenuEl.style.cssText =
  'position:absolute;top:12px;right:12px;z-index:18;display:none;flex-direction:column;';
const gameMenuShell = document.createElement('div');
gameMenuShell.style.cssText =
  'background:linear-gradient(180deg,#2a2630 0%,#1e1a24 100%);border:2px solid rgba(255,255,255,0.2);border-radius:12px;padding:16px 18px 18px;min-width:280px;max-width:min(360px,92vw);box-shadow:0 8px 32px rgba(0,0,0,0.5);';

const tabBar = document.createElement('div');
tabBar.style.cssText =
  'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:12px;';
const tabBtnBase =
  'width:44px;height:44px;border-radius:10px;border:2px solid transparent;background:rgba(0,0,0,0.35);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#ece8e0;flex-shrink:0;transition:background 0.15s,border-color 0.15s,opacity 0.18s;padding:0;';

const tabInventoryBtn = document.createElement('button');
tabInventoryBtn.type = 'button';
tabInventoryBtn.title = 'Inventory';
tabInventoryBtn.style.cssText = tabBtnBase;
tabInventoryBtn.innerHTML =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8z"/><path d="M9 8V6a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3v2"/></svg>';

const tabEquipmentBtn = document.createElement('button');
tabEquipmentBtn.type = 'button';
tabEquipmentBtn.title = 'Equipment';
tabEquipmentBtn.style.cssText = tabBtnBase;
tabEquipmentBtn.innerHTML =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v5.5c0 3.5-2.5 6.8-8 8.5-5.5-1.7-8-5-8-8.5V6l8-4z"/><path d="M12 11v6"/></svg>';

const tabSkillsBtn = document.createElement('button');
tabSkillsBtn.type = 'button';
tabSkillsBtn.title = 'Skills (K)';
tabSkillsBtn.style.cssText = tabBtnBase;
tabSkillsBtn.innerHTML =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>';

const tabOptionsBtn = document.createElement('button');
tabOptionsBtn.type = 'button';
tabOptionsBtn.title = 'Options';
tabOptionsBtn.style.cssText = tabBtnBase;
tabOptionsBtn.innerHTML =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';

tabBar.appendChild(tabInventoryBtn);
tabBar.appendChild(tabEquipmentBtn);
tabBar.appendChild(tabSkillsBtn);
tabBar.appendChild(tabOptionsBtn);

const tabContentWrap = document.createElement('div');

const inventoryTabPane = document.createElement('div');
inventoryTabPane.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
const inventoryGridEl = document.createElement('div');
inventoryGridEl.style.cssText = 'display:grid;gap:6px;';

const equipmentTabPane = document.createElement('div');
equipmentTabPane.style.cssText = 'display:none;flex-direction:column;gap:10px;';
const equipmentTabHint = document.createElement('div');
equipmentTabHint.textContent =
  'Equipped items — click one to send it to the first free inventory slot.';
equipmentTabHint.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.55);line-height:1.35;';
equipmentTabPane.appendChild(equipmentTabHint);
equipmentTabPane.appendChild(equipmentSlotsEl);

const skillsTabPane = document.createElement('div');
skillsTabPane.style.cssText =
  'display:none;flex-direction:column;gap:12px;max-height:min(440px,58vh);overflow-y:auto;padding-right:4px;';
const skillsStatAllocMount = document.createElement('div');
skillsStatAllocMount.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
const skillsIntro = document.createElement('div');
skillsIntro.textContent =
  'Combat and gathering skills. Successful mining, forestry, and fishing attempts grant XP when you receive a resource.';
skillsIntro.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.55);line-height:1.35;';
skillsTabPane.appendChild(skillsStatAllocMount);
skillsTabPane.appendChild(skillsIntro);
const skillsListMount = document.createElement('div');
skillsListMount.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
skillsTabPane.appendChild(skillsListMount);

const optionsTabPane = document.createElement('div');
optionsTabPane.style.cssText = 'display:none;flex-direction:column;gap:4px;';
const optionsIntro = document.createElement('div');
optionsIntro.textContent = 'Display and debugging. Settings are saved in this browser.';
optionsIntro.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.5);line-height:1.35;margin-bottom:6px;';
optionsTabPane.appendChild(optionsIntro);

const displayTitle = makeOptionsSectionTitle('Display');
displayTitle.style.marginTop = '2px';
optionsTabPane.appendChild(displayTitle);
optionsTabPane.appendChild(
  makeOptionsCheckbox('Cap pixel ratio at 1× (sharper UI text, less GPU fill on high-DPI screens)', 'pixelRatio1')
);
optionsTabPane.appendChild(makeOptionsCheckbox('Enable renderer shadow maps (experimental; few lights cast shadows)', 'shadows'));
optionsTabPane.appendChild(makeOptionsCheckbox('Show FPS and latency (top-left)', 'showPerfHud'));
optionsTabPane.appendChild(makeOptionsCheckbox('Show overhead enemy and boss health bars', 'showEnemyHealthBars'));
optionsTabPane.appendChild(makeOptionsCheckbox('Show game tick progress bar (top center)', 'showTickBar'));

optionsTabPane.appendChild(makeOptionsSectionTitle('Debug'));
const debugHint = document.createElement('div');
debugHint.textContent =
  'Buttons log or tweak local state. Open the browser console (F12) to read snapshots.';
debugHint.style.cssText = 'font:10px sans-serif;color:rgba(255,255,255,0.45);line-height:1.4;';
optionsTabPane.appendChild(debugHint);

const debugBtnStyle =
  'align-self:flex-start;padding:8px 12px;font:12px sans-serif;border-radius:8px;cursor:pointer;margin-top:8px;' +
  'border:1px solid rgba(255,255,255,0.22);background:rgba(35,32,44,0.95);color:#e8e4ec;transition:background 0.12s;';

const snapshotBtn = document.createElement('button');
snapshotBtn.type = 'button';
snapshotBtn.id = 'options-debug-snapshot';
snapshotBtn.textContent = 'Print debug snapshot';
snapshotBtn.style.cssText = debugBtnStyle;
snapshotBtn.addEventListener('mouseenter', () => {
  snapshotBtn.style.background = 'rgba(50,46,62,0.98)';
});
snapshotBtn.addEventListener('mouseleave', () => {
  snapshotBtn.style.background = 'rgba(35,32,44,0.95)';
});
optionsTabPane.appendChild(snapshotBtn);

const fillVitalsBtn = document.createElement('button');
fillVitalsBtn.type = 'button';
fillVitalsBtn.id = 'options-debug-fill-vitals';
fillVitalsBtn.textContent = 'Fill health, mana & run energy';
fillVitalsBtn.style.cssText = debugBtnStyle;
fillVitalsBtn.addEventListener('mouseenter', () => {
  fillVitalsBtn.style.background = 'rgba(50,46,62,0.98)';
});
fillVitalsBtn.addEventListener('mouseleave', () => {
  fillVitalsBtn.style.background = 'rgba(35,32,44,0.95)';
});
optionsTabPane.appendChild(fillVitalsBtn);

const buildNote = document.createElement('div');
buildNote.style.cssText = 'font:10px sans-serif;color:rgba(255,255,255,0.38);margin-top:10px;line-height:1.35;';
buildNote.textContent = `Build: FRESH_GRID_MODE = ${FRESH_GRID_MODE} (wave progression only when false)`;
optionsTabPane.appendChild(buildNote);

inventoryTabPane.appendChild(inventoryGridEl);
const inventoryHint = document.createElement('div');
inventoryHint.textContent =
  'Left-click sword or bow to equip; right-click for Examine, Equip (sword/bow), Use (other items), and Drop. I toggles this menu; K opens the Skills tab.';
inventoryHint.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.5);margin-top:4px;line-height:1.35;';
inventoryTabPane.appendChild(inventoryHint);

tabContentWrap.appendChild(inventoryTabPane);
tabContentWrap.appendChild(equipmentTabPane);
tabContentWrap.appendChild(skillsTabPane);
tabContentWrap.appendChild(optionsTabPane);

gameMenuShell.appendChild(tabBar);
gameMenuShell.appendChild(tabContentWrap);
gameMenuEl.appendChild(gameMenuShell);
container.appendChild(gameMenuEl);

type GameMenuTabId = 'inventory' | 'equipment' | 'skills' | 'options';

const gameMenuTabs: { id: GameMenuTabId; btn: HTMLButtonElement; pane: HTMLElement }[] = [
  { id: 'inventory', btn: tabInventoryBtn, pane: inventoryTabPane },
  { id: 'equipment', btn: tabEquipmentBtn, pane: equipmentTabPane },
  { id: 'skills', btn: tabSkillsBtn, pane: skillsTabPane },
  { id: 'options', btn: tabOptionsBtn, pane: optionsTabPane },
];

let gameMenuActiveTab: GameMenuTabId = 'inventory';

function updateGameMenuTabStyle(): void {
  for (const { id, btn, pane } of gameMenuTabs) {
    const on = gameMenuActiveTab === id;
    pane.style.display = on ? 'flex' : 'none';
    btn.style.opacity = on ? '1' : '0.5';
    btn.style.borderColor = on ? 'rgba(130,175,255,0.55)' : 'transparent';
    btn.style.background = on ? 'rgba(45,75,130,0.5)' : 'rgba(0,0,0,0.35)';
  }
}

function setGameMenuTab(id: GameMenuTabId): void {
  gameMenuActiveTab = id;
  updateGameMenuTabStyle();
}

tabInventoryBtn.addEventListener('click', () => setGameMenuTab('inventory'));
tabEquipmentBtn.addEventListener('click', () => setGameMenuTab('equipment'));
tabSkillsBtn.addEventListener('click', () => setGameMenuTab('skills'));
tabOptionsBtn.addEventListener('click', () => setGameMenuTab('options'));

function renderSkillsStatAlloc(): void {
  skillsStatAllocMount.replaceChildren();
  const title = document.createElement('div');
  title.style.cssText = 'font:12px sans-serif;color:#e8e4ec;font-weight:bold;';
  title.textContent = `Level ${level} · Combat stats`;
  skillsStatAllocMount.appendChild(title);
  if (statPointsToAllocate > 0) {
    const label = document.createElement('div');
    label.style.cssText = 'font:11px sans-serif;color:#c0a060;';
    label.textContent = `Stat points to allocate: ${statPointsToAllocate}`;
    skillsStatAllocMount.appendChild(label);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
    const statColors: Record<'strength' | 'intelligence' | 'dexterity' | 'vitality', { top: string; bottom: string; text: string }> = {
      strength: { top: '#d4af37', bottom: '#b8860b', text: '#2a2200' },
      intelligence: { top: '#7dd3fc', bottom: '#38bdf8', text: '#0c1929' },
      dexterity: { top: '#4ade80', bottom: '#22c55e', text: '#052e16' },
      vitality: { top: '#f87171', bottom: '#dc2626', text: '#450a0a' },
    };
    const mkBtn = (name: string, stat: 'strength' | 'intelligence' | 'dexterity' | 'vitality') => {
      const c = statColors[stat];
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${name} +1`;
      b.style.cssText = `padding:6px 12px;font:12px sans-serif;background:linear-gradient(180deg,${c.top},${c.bottom});color:${c.text};border:none;border-radius:6px;cursor:pointer;`;
      b.addEventListener('click', () => allocateStat(stat));
      return b;
    };
    row.appendChild(mkBtn('Str', 'strength'));
    row.appendChild(mkBtn('Int', 'intelligence'));
    row.appendChild(mkBtn('Dex', 'dexterity'));
    row.appendChild(mkBtn('Vit', 'vitality'));
    skillsStatAllocMount.appendChild(row);
  } else {
    const note = document.createElement('div');
    note.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.48);line-height:1.35;';
    note.textContent = 'No stat points to spend. You gain 3 per level up.';
    skillsStatAllocMount.appendChild(note);
  }
}

function allocateStat(stat: 'strength' | 'intelligence' | 'dexterity' | 'vitality'): void {
  if (statPointsToAllocate <= 0) return;
  statPointsToAllocate--;
  if (stat === 'strength') strength++;
  else if (stat === 'intelligence') intelligence++;
  else if (stat === 'dexterity') dexterity++;
  else {
    const oldMax = getMaxHealth();
    vitality++;
    health = Math.min(health + (getMaxHealth() - oldMax), getMaxHealth());
    setHealth(health);
  }
  updateStatsDisplay();
  renderSkillsStatAlloc();
}

const INV_SLOT_SIZE = 40;
const invSlotStyle = `width:${INV_SLOT_SIZE}px;height:${INV_SLOT_SIZE}px;background:rgba(0,0,0,0.5);border:2px solid rgba(255,255,255,0.2);border-radius:6px;display:flex;align-items:center;justify-content:center;font:10px sans-serif;color:rgba(255,255,255,0.9);cursor:pointer;transition:border-color 0.15s,background 0.15s;box-sizing:border-box;`;

function renderInventoryGrid(): void {
  inventoryGridEl.innerHTML = '';
  inventoryGridEl.style.gridTemplateColumns = `repeat(${inventory.getColumns()}, ${INV_SLOT_SIZE}px)`;
  for (let i = 0; i < INVENTORY_SLOTS; i++) {
    const cell = document.createElement('div');
    cell.style.cssText = invSlotStyle;
    const stack = inventory.getSlot(i);
    if (stack) {
      const def = getItemDef(stack.itemId);
      cell.textContent = stack.count > 1 ? `${def.label} ×${stack.count}` : def.label;
      cell.style.background = 'rgba(40,60,90,0.6)';
      cell.style.borderColor = 'rgba(255,255,255,0.3)';
      cell.addEventListener('click', () => {
        if (def.slot === 'weapon') {
          const current = equipment.getEquipped('weapon');
          equipment.setEquipped('weapon', stack.itemId);
          inventory.setSlot(i, current ? { itemId: current, count: 1 } : null);
        }
      });
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openInventorySlotContextMenu(e.clientX, e.clientY, i);
      });
    } else {
      cell.style.color = 'rgba(255,255,255,0.3)';
      cell.textContent = '';
    }
    inventoryGridEl.appendChild(cell);
  }
}

function renderSkillsPanel(): void {
  skillsListMount.replaceChildren();
  for (const section of PLAYER_SKILL_SECTIONS) {
    const sec = document.createElement('div');
    const st = document.createElement('div');
    st.textContent = section.title;
    st.style.cssText =
      'font:11px sans-serif;font-weight:bold;color:rgba(180,195,220,0.95);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:2px;';
    sec.appendChild(st);
    for (const sid of section.skills) {
      const prog = playerSkills.getXpProgress(sid);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:2px;';
      const head = document.createElement('div');
      head.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:12px;';
      const name = document.createElement('span');
      name.textContent = PLAYER_SKILL_LABEL[sid];
      name.style.cssText = 'font:13px sans-serif;color:#ece8e0;';
      const lvl = document.createElement('span');
      lvl.textContent = `Level ${prog.level}`;
      lvl.style.cssText = 'font:12px sans-serif;color:#9ec8b0;font-weight:bold;';
      head.appendChild(name);
      head.appendChild(lvl);
      row.appendChild(head);
      const barWrap = document.createElement('div');
      barWrap.style.cssText =
        'height:6px;border-radius:3px;background:rgba(0,0,0,0.45);overflow:hidden;border:1px solid rgba(255,255,255,0.08);';
      const fill = document.createElement('div');
      const pct = prog.atMax ? 100 : (100 * prog.intoLevel) / prog.requiredForNext;
      fill.style.cssText = `height:100%;width:${pct}%;background:linear-gradient(90deg,#4a7a9c,#6ab090);border-radius:2px;transition:width 0.2s;`;
      barWrap.appendChild(fill);
      row.appendChild(barWrap);
      const hint = document.createElement('div');
      hint.style.cssText = 'font:10px sans-serif;color:rgba(255,255,255,0.42);';
      const total = playerSkills.getTotalXp(sid);
      hint.textContent = prog.atMax
        ? `Max level · ${total} XP`
        : `${prog.intoLevel} / ${prog.requiredForNext} XP this level · ${total} total`;
      row.appendChild(hint);
      sec.appendChild(row);
    }
    skillsListMount.appendChild(sec);
  }
}

function refreshGameMenuLists(): void {
  renderEquipmentPanel();
  renderInventoryGrid();
  renderSkillsStatAlloc();
  renderSkillsPanel();
}

equipment.subscribe(refreshGameMenuLists);
inventory.subscribe(renderInventoryGrid);
playerSkills.subscribe(renderSkillsPanel);

updateGameMenuTabStyle();
refreshGameMenuLists();

let gameMenuOpen = false;
function setGameMenuOpen(open: boolean): void {
  gameMenuOpen = open;
  gameMenuEl.style.display = open ? 'flex' : 'none';
  if (open) refreshGameMenuLists();
}

levelUpNotifier.callback = () => {
  if (statPointsToAllocate > 0) {
    setGameMenuOpen(true);
    setGameMenuTab('skills');
  }
};

function setPaused(paused: boolean): void {
  if (isDead) return;
  isPaused = paused;
  pauseEl.style.display = isPaused ? 'flex' : 'none';
}

// Enemy health bars moved to HUD (createHUD below)

const hitMarkers = createHitMarkerOverlay(container, { getMultiplayerClient: () => multiplayerClient });

function setHealth(value: number): void {
  if (levelEditorInvincible && value < health) {
    return;
  }
  const max = getMaxHealth();
  const oldHealth = health;
  health = Math.max(0, Math.min(max, value));
  
  // Show hit marker if player took damage
  if (health < oldHealth && oldHealth > 0) {
    const damage = oldHealth - health;
    hitMarkers.createHitMarker(character.position, damage);
  }
  
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
    statPointsToAllocate += 3;
    setHealth(getMaxHealth()); // heal to new max on level up
    updateStatsDisplay();
    levelUpNotifier.callback?.();
  }
  updateXpDisplay();
}

function setMana(value: number): void {
  mana = Math.max(0, Math.min(MAX_MANA, value));
}
const terrainGridTiles = TERRAIN_GRID_WIDTH;
const terrainWorldSize = terrainGridTiles * TILE_SIZE;

const followCamera = new FollowCamera(width, height);
followCamera.setDistance(16);
followCamera.setTarget(SPAWN_POSITION.x, SPAWN_POSITION.y, SPAWN_POSITION.z);

/** WASD camera (held keys); A/D orbit, W/S pitch — Runescape-style. */
const cameraKeysHeld = new Set<string>();
let middleMouseCameraDrag = false;
let middleCameraLastX = 0;
let middleCameraLastY = 0;
/** Radians per pixel — tuned to feel close to holding A/D or W/S. */
const CAM_MIDDLE_DRAG_ORBIT = 0.0055;
const CAM_MIDDLE_DRAG_PITCH = 0.0045;

function registerCameraKeyListeners(): void {
  const norm = (k: string): string => (k.length === 1 ? k.toLowerCase() : k);
  window.addEventListener('keydown', (e) => {
    const k = norm(e.key);
    if (k !== 'w' && k !== 'a' && k !== 's' && k !== 'd') return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    cameraKeysHeld.add(k);
  });
  window.addEventListener('keyup', (e) => {
    cameraKeysHeld.delete(norm(e.key));
  });
  window.addEventListener('blur', () => {
    cameraKeysHeld.clear();
    middleMouseCameraDrag = false;
  });
}
registerCameraKeyListeners();

function registerMiddleMouseCameraDrag(): void {
  container.addEventListener('mousedown', (e) => {
    if (e.button !== 1) return;
    if (isPaused || isDead) return;
    if (gameMenuOpen) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-web-iso="minimap"]')) return;
    if (t.closest('[data-web-iso="terrain-edit"]')) return;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    middleMouseCameraDrag = true;
    middleCameraLastX = e.clientX;
    middleCameraLastY = e.clientY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!middleMouseCameraDrag) return;
    if (isPaused || gameMenuOpen) {
      middleMouseCameraDrag = false;
      return;
    }
    const dx = e.clientX - middleCameraLastX;
    const dy = e.clientY - middleCameraLastY;
    middleCameraLastX = e.clientX;
    middleCameraLastY = e.clientY;
    followCamera.addOrbitYaw(-dx * CAM_MIDDLE_DRAG_ORBIT);
    followCamera.addPitch(dy * CAM_MIDDLE_DRAG_PITCH);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 1) middleMouseCameraDrag = false;
  });
}
registerMiddleMouseCameraDrag();

/** World zoom — must live on `clickOverlay`: it sits above the canvas and receives wheel here. */
clickOverlay.addEventListener(
  'wheel',
  (e) => {
    if (isPaused || isDead) return;
    if (gameMenuOpen) return;
    if ((e.target as HTMLElement).closest('[data-web-iso="terrain-edit"]')) return;
    e.preventDefault();
    const modeScale = e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? 100 : 1;
    const dy = e.deltaY * modeScale;
    const step = Math.sign(dy) * Math.min(Math.max(Math.abs(dy) * 0.012, 0.35), 3.2);
    followCamera.addDistanceDelta(step);
  },
  { passive: false }
);

let devTerrainGrid: THREE.LineSegments | null = null;
let devTerrainGridRaf = 0;
/** Terrain editor: rebuilt when chunks change; assigned after {@link terrainEditPanel} exists. */
let refreshWaterTileIndicators: () => void = () => {};
let waterTileIndicatorMesh: THREE.Mesh | null = null;
let waterTileIndicatorsRaf = 0;
const WATER_TILE_INDICATOR_Y_BIAS = 0.055;
const DEV_TERRAIN_GRID_Y_BIAS = 0.045;
function refreshDevTerrainGrid(): void {
  if (!import.meta.env.DEV) return;
  if (devTerrainGridRaf !== 0) cancelAnimationFrame(devTerrainGridRaf);
  devTerrainGridRaf = requestAnimationFrame(() => {
    devTerrainGridRaf = 0;
    const geom = buildTerrainFollowingGridGeometry(
      chunkTerrainLoader,
      terrainGridTiles,
      TILE_SIZE,
      DEV_TERRAIN_GRID_Y_BIAS
    );
    if (devTerrainGrid) {
      scene.remove(devTerrainGrid);
      devTerrainGrid.geometry.dispose();
      (devTerrainGrid.material as THREE.LineBasicMaterial).dispose();
    }
    const mat = new THREE.LineBasicMaterial({
      color: 0x8a8598,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    devTerrainGrid = new THREE.LineSegments(geom, mat);
    devTerrainGrid.renderOrder = 1;
    scene.add(devTerrainGrid);
  });
}

/** Filled in once {@link syncPathfindingDemoTileNav} exists; keeps pathfinding in sync with streamed terrain. */
let onChunkTerrainMeshesRebuilt: () => void = () => {};

const chunkTerrainLoader = new ChunkTerrainLoader(scene, {
  levelBaseUrl: `${import.meta.env.BASE_URL}levels/`,
  onChunkMeshRebuilt: () => onChunkTerrainMeshesRebuilt(),
});
await chunkTerrainLoader.syncToWorldTile(5, 5);
const terrainRoot = chunkTerrainLoader.terrainRoot;
const serverWildlifeRuntime = createServerWildlifeRuntime();
serverWildlifeRuntime.setGroundSampler((x, z) => chunkTerrainLoader.sampleSurfaceHeightAtWorldXZ(x, z));
scene.add(serverWildlifeRuntime.liveRoot);
scene.add(serverWildlifeRuntime.spawnerGhostRoot);
let lastTerrainChunkSync = { cx: Math.floor(5 / CHUNK_SIZE), cz: Math.floor(5 / CHUNK_SIZE) };

/** South-middle tile of the pen threshold (doorway). Edge to (18,8) toggles with the gate. */
const PATHFINDING_DEMO_GATE_TILE: GridTile = { x: 18, z: 7 };

/**
 * Pen walls use edge blocking; inner floor stays occupiable when the gate is closed.
 * Grid convention matches pathfinding: +z is north, so the doorway is (18,7)↔(18,8) on the north edge of (18,7).
 */
function pathfindingDemoPenNavExceptions(
  gateOpen: boolean
): ReadonlyArray<{ tile: GridTile; profile: TileNavProfile }> {
  const e: Array<{ tile: GridTile; profile: TileNavProfile }> = [
    { tile: { x: 17, z: 5 }, profile: { north: true, east: true, south: false, west: false } },
    { tile: { x: 18, z: 5 }, profile: { north: true, east: true, south: false, west: true } },
    { tile: { x: 19, z: 5 }, profile: { north: true, east: false, south: false, west: true } },
    { tile: { x: 17, z: 6 }, profile: { north: true, east: true, south: true, west: false } },
    { tile: { x: 19, z: 6 }, profile: { north: true, east: false, south: true, west: true } },
    { tile: { x: 17, z: 7 }, profile: { north: false, east: true, south: true, west: false } },
    { tile: { x: 19, z: 7 }, profile: { north: false, east: false, south: true, west: true } },
    { tile: { x: 17, z: 4 }, profile: { north: false, east: true, south: true, west: true } },
    { tile: { x: 18, z: 4 }, profile: { north: false, east: true, south: true, west: true } },
    { tile: { x: 19, z: 4 }, profile: { north: false, east: true, south: true, west: true } },
    { tile: { x: 16, z: 5 }, profile: { north: true, east: false, south: true, west: true } },
    { tile: { x: 16, z: 6 }, profile: { north: true, east: false, south: true, west: true } },
    { tile: { x: 16, z: 7 }, profile: { north: true, east: false, south: true, west: true } },
    { tile: { x: 20, z: 5 }, profile: { north: true, east: true, south: true, west: false } },
    { tile: { x: 20, z: 6 }, profile: { north: true, east: true, south: true, west: false } },
    { tile: { x: 20, z: 7 }, profile: { north: true, east: true, south: true, west: false } },
    { tile: { x: 17, z: 8 }, profile: { north: true, east: true, south: false, west: true } },
    { tile: { x: 19, z: 8 }, profile: { north: true, east: true, south: false, west: true } },
  ];
  if (!gateOpen) {
    e.push(
      {
        tile: { x: 18, z: 7 },
        profile: { north: false, east: true, south: true, west: true },
      },
      {
        tile: { x: 18, z: 8 },
        profile: { north: true, east: true, south: false, west: true },
      }
    );
  }
  return e;
}

let pathfindingDemoGateOpen = false;
/** After left-click pathing to the pen, open or close when the player reaches a tile ortho-adjacent to the gate. */
let pendingPathfindingGateAction: null | 'open' | 'close' = null;
/** Hinge + door mesh for raycast / animation. */
const pathfindingDemoGatePivot = new THREE.Group();
/** Fence + gate (one object tree for “first hit” ray picks vs terrain behind). */
const pathfindingDemoPenRoot = new THREE.Group();

function syncPathfindingDemoTileNav(): void {
  replaceTileNavExceptions([
    ...gatheringTileNavExceptions(),
    ...pathfindingDemoPenNavExceptions(pathfindingDemoGateOpen),
    ...chunkTerrainLoader.getWaterTileNavExceptions(),
  ]);
}

onChunkTerrainMeshesRebuilt = () => {
  refreshDevTerrainGrid();
  syncPathfindingDemoTileNav();
  refreshWaterTileIndicators();
};

function setPathfindingDemoGateOpen(open: boolean): void {
  pathfindingDemoGateOpen = open;
  pendingPathfindingGateAction = null;
  syncPathfindingDemoTileNav();
  pathfindingDemoGatePivot.rotation.y = open ? -Math.PI * 0.42 : 0;
}

{
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.9, metalness: 0.05 });
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x7a5030, roughness: 0.85, metalness: 0.12 });
  const H = 0.72;
  const T = 0.14;
  const span = 3 * TILE_SIZE + 0.35;
  const y = H / 2;
  const minX = 17 * TILE_SIZE;
  const maxX = 20 * TILE_SIZE;
  const minZ = 5 * TILE_SIZE;
  const maxZ = 8 * TILE_SIZE;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const GATE_CLEAR = TILE_SIZE * 0.92;
  const southZ = maxZ + T / 2;
  const leftSouthLen = cx - GATE_CLEAR / 2 - minX;
  const rightSouthLen = maxX - (cx + GATE_CLEAR / 2);

  const west = new THREE.Mesh(new THREE.BoxGeometry(T, H, span), fenceMat);
  west.position.set(minX - T / 2, y, cz);
  const east = new THREE.Mesh(new THREE.BoxGeometry(T, H, span), fenceMat);
  east.position.set(maxX + T / 2, y, cz);
  const north = new THREE.Mesh(new THREE.BoxGeometry(span, H, T), fenceMat);
  north.position.set(cx, y, minZ - T / 2);

  const southLeft = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, leftSouthLen), H, T), fenceMat);
  southLeft.position.set(minX + leftSouthLen / 2, y, southZ);
  const southRight = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, rightSouthLen), H, T), fenceMat);
  southRight.position.set(maxX - rightSouthLen / 2, y, southZ);

  pathfindingDemoGatePivot.position.set(cx - GATE_CLEAR / 2, 0, southZ);
  const gateDoor = new THREE.Mesh(new THREE.BoxGeometry(GATE_CLEAR, H * 0.92, T * 1.2), gateMat);
  gateDoor.position.set(GATE_CLEAR / 2, y, 0);
  gateDoor.castShadow = true;
  gateDoor.receiveShadow = true;
  pathfindingDemoGatePivot.add(gateDoor);

  for (const m of [west, east, north, southLeft, southRight]) {
    m.castShadow = true;
    m.receiveShadow = true;
    pathfindingDemoPenRoot.add(m);
  }
  pathfindingDemoPenRoot.add(pathfindingDemoGatePivot);
  scene.add(pathfindingDemoPenRoot);
}

const PEN_RAT_COLLISION_RADIUS = PEN_RAT_SIZE * 0.45;
const {
  penRatNpcs,
  penRatGroup,
  wildlifeNpcs,
  startingWildlifeGroup,
  enemies,
} = createNpcSceneContent({ includeLegacyStartingWildlife: !useSpacetimeMp });
scene.add(penRatGroup);
const PEN_RAT_LURCH_DURATION = 0.26;
const PEN_RAT_LURCH_DISTANCE = 0.4;
const PEN_RAT_LURCH_HOP_Y = 0.07;

/** Spiders and bears near spawn; chase + ortho bite only if player within this many tiles (Chebyshev grid distance). */
const STARTING_WILDLIFE_AGGRO_TILES = 4;
scene.add(startingWildlifeGroup);

syncPathfindingDemoTileNav();

function createGroundTileHighlight(color: number, opacity: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(TILE_SIZE * 0.96, TILE_SIZE * 0.96);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return mesh;
}

/** Visual: logical tile under player (world position → grid). */
const playerTrueTileMarker = createGroundTileHighlight(0x00b8d9, 0.38);
playerTrueTileMarker.position.y = 0.035;
scene.add(playerTrueTileMarker);

/** Visual: destination tile for current click-to-move path. */
const moveTargetTileMarker = createGroundTileHighlight(0xffaa33, 0.42);
moveTargetTileMarker.position.y = 0.038;
moveTargetTileMarker.visible = false;
scene.add(moveTargetTileMarker);

/** Dev-only terrain-hugging tile grid — built in {@link refreshDevTerrainGrid} (after chunk sync / edits). */

scene.add(enemies);

createIsoLights(scene);

const character = createPlaceholderCharacter([SPAWN_POSITION.x, SPAWN_POSITION.y, SPAWN_POSITION.z]);
scene.add(character);

function samplePlayerGroundY(wx: number, wz: number): number {
  return chunkTerrainLoader.sampleSurfaceHeightAtWorldXZ(wx, wz);
}

function snapCharacterYToTerrain(): void {
  character.position.y = samplePlayerGroundY(character.position.x, character.position.z);
}

/** If the character is on a blocked tile (e.g. water), move to the nearest walkable tile center. */
function snapCharacterXZToNearestWalkable(): void {
  const t = worldXZToTile(character.position.x, character.position.z);
  const safe = findNearestOccupiableTile(t);
  if (safe === null) return;
  const c = tileCenterXZ(safe);
  character.position.x = c.x;
  character.position.z = c.z;
}

function snapCharacterToWalkableGround(): void {
  snapCharacterXZToNearestWalkable();
  snapCharacterYToTerrain();
}

snapCharacterToWalkableGround();

/** Static practice target (white cube); tile is authoritative for melee adjacency. */
const TRAINING_DUMMY_TILE: GridTile = { x: 14, z: 14 };
const TRAINING_DUMMY_SIZE = 0.72;
const MAX_TRAINING_DUMMY_HP = 10_000;
let trainingDummyAlive = true;
let trainingDummyHealth = MAX_TRAINING_DUMMY_HP;
const trainingDummyWorldPos = new THREE.Vector3();
const trainingDummyGroup = new THREE.Group();
{
  const h = TRAINING_DUMMY_SIZE * 1.1;
  const geom = new THREE.BoxGeometry(TRAINING_DUMMY_SIZE, h, TRAINING_DUMMY_SIZE);
  const mat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.55, metalness: 0.08 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const tc = tileCenterXZ(TRAINING_DUMMY_TILE);
  trainingDummyGroup.position.set(tc.x, h / 2, tc.z);
  trainingDummyWorldPos.set(tc.x, h / 2, tc.z);
  trainingDummyGroup.add(mesh);
}
scene.add(trainingDummyGroup);

const gatheringNodesRoot = createGatheringNodesRoot();
scene.add(gatheringNodesRoot);

const lastEnemyDamageTime: number[] = Array(ENEMY_COUNT).fill(-999);

// Caster enemies: purple capsules that throw fireballs at the player
const CASTER_COUNT = 5;
const CASTER_SIZE = 0.6;
const CASTER_PREFERRED_RANGE = 10;  // distance from player casters try to maintain (kite range)
const CASTER_FIREBALL_COOLDOWN = 2.2;
const ENEMY_FIREBALL_SPEED = 12;
const ENEMY_FIREBALL_RADIUS = 0.3;
const ENEMY_FIREBALL_DAMAGE = 10;
const ENEMY_FIREBALL_TTL = 3;

const casterGroup = new THREE.Group();
const casterMeshes: THREE.Object3D[] = [];
const casterAlive: boolean[] = [];
const lastCasterThrowTime: number[] = [];

// Load caster sprite texture
const casterTextureLoader = new THREE.TextureLoader();
const casterSpriteTexture = casterTextureLoader.load('/sprites/caster.png');
casterSpriteTexture.colorSpace = THREE.SRGBColorSpace;

for (let i = 0; i < CASTER_COUNT; i++) {
  const spriteMaterial = new THREE.SpriteMaterial({ 
    map: casterSpriteTexture,
    transparent: true,
    alphaTest: 0.01,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.set(8 + Math.random() * 16, CASTER_SIZE / 2, 8 + Math.random() * 16);
  // Scale sprite - sprites scale in world units, make it visible
  // Using a larger scale since sprites are 2D and need to be prominent
  sprite.scale.set(CASTER_SIZE * 3, CASTER_SIZE * 3, 1);
  casterGroup.add(sprite);
  casterMeshes.push(sprite);
  casterAlive.push(true);
  lastCasterThrowTime.push(-999);
}
const MAX_CASTER_HEALTH = 90;
const casterHealth = Array(CASTER_COUNT).fill(MAX_CASTER_HEALTH);
const lastCasterResurrectTime: number[] = Array(CASTER_COUNT).fill(-999);
const casterLogicalTile: GridTile[] = Array.from({ length: CASTER_COUNT }, () => ({ x: 0, z: 0 }));
/** xz + height for combat / clicks (authoritative each tick). */
const casterLogicalPos = Array.from({ length: CASTER_COUNT }, () => new THREE.Vector3());
const casterVisFrom: { x: number; z: number }[] = Array.from({ length: CASTER_COUNT }, () => ({ x: 0, z: 0 }));
const casterVisTo: { x: number; z: number }[] = Array.from({ length: CASTER_COUNT }, () => ({ x: 0, z: 0 }));

/** Returns true if the caster died. Does not dispose mesh so casters can be reused for next level. */
function damageCaster(c: number, amount: number): boolean {
  hitMarkers.createPlayerHitMarker(casterLogicalPos[c], amount);
  casterHealth[c] = Math.max(0, casterHealth[c] - amount);
  if (casterHealth[c] <= 0) {
    addXp(XP_CASTER);
    trySpawnDrop(casterLogicalPos[c].clone(), 'caster');
    casterGroup.remove(casterMeshes[c]);
    casterAlive[c] = false;
    return true;
  }
  return false;
}

scene.add(casterGroup);

// Resurrector enemies: resurrect fallen grunts (spawn from wave 5, after double casters)
const RESURRECTOR_COUNT = 3;
const RESURRECTOR_SIZE = 0.55;
const RESURRECTOR_PREFERRED_RANGE = 8;

const resurrectorGroup = new THREE.Group();
const resurrectorMeshes: THREE.Object3D[] = [];
const resurrectorAlive: boolean[] = [];
const lastResurrectorResurrectTime: number[] = [];

const resurrectorTextureLoader = new THREE.TextureLoader();
const resurrectorSpriteTexture = resurrectorTextureLoader.load('/sprites/resurrector.png');
resurrectorSpriteTexture.colorSpace = THREE.SRGBColorSpace;

for (let i = 0; i < RESURRECTOR_COUNT; i++) {
  const spriteMaterial = new THREE.SpriteMaterial({
    map: resurrectorSpriteTexture,
    transparent: true,
    alphaTest: 0.01,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.set(8 + Math.random() * 16, RESURRECTOR_SIZE / 2, 8 + Math.random() * 16);
  sprite.scale.set(RESURRECTOR_SIZE * 3, RESURRECTOR_SIZE * 3, 1);
  resurrectorGroup.add(sprite);
  resurrectorMeshes.push(sprite);
  resurrectorAlive.push(false);
  lastResurrectorResurrectTime.push(-999);
}
const MAX_RESURRECTOR_HEALTH = 70;
const resurrectorHealth = Array(RESURRECTOR_COUNT).fill(MAX_RESURRECTOR_HEALTH);
const resurrectorLogicalTile: GridTile[] = Array.from({ length: RESURRECTOR_COUNT }, () => ({ x: 0, z: 0 }));
const resurrectorLogicalPos = Array.from({ length: RESURRECTOR_COUNT }, () => new THREE.Vector3());
const resurrectorVisFrom: { x: number; z: number }[] = Array.from({ length: RESURRECTOR_COUNT }, () => ({
  x: 0,
  z: 0,
}));
const resurrectorVisTo: { x: number; z: number }[] = Array.from({ length: RESURRECTOR_COUNT }, () => ({
  x: 0,
  z: 0,
}));

/** Returns true if the resurrector died. */
function damageResurrector(r: number, amount: number): boolean {
  hitMarkers.createPlayerHitMarker(resurrectorLogicalPos[r], amount);
  resurrectorHealth[r] = Math.max(0, resurrectorHealth[r] - amount);
  if (resurrectorHealth[r] <= 0) {
    addXp(XP_RESURRECTOR);
    trySpawnDrop(resurrectorLogicalPos[r].clone(), 'resurrector');
    resurrectorGroup.remove(resurrectorMeshes[r]);
    resurrectorAlive[r] = false;
    return true;
  }
  return false;
}

scene.add(resurrectorGroup);

// Teleporters created after trySpawnDrop (need callbacks); poison pools first so teleporters can register pools
let teleportersApi: TeleporterAPI;

const poisonPoolsApi = createPoisonPools(scene, {
  radius: POISON_POOL_RADIUS,
  duration: POISON_POOL_DURATION,
  indicatorDuration: POISON_INDICATOR_DURATION,
});

/** Run = 2 tiles per game tick, walk = 1 (see {@link processPlayerPathTick}). */
let playerRunEnabled = true;

const RUN_ENERGY_MAX = 100;
/** 0–{@link RUN_ENERGY_MAX}; drained only when a tick advances 2 path tiles; regen when idle on a tick. */
let playerRunEnergy = RUN_ENERGY_MAX;
const RUN_ENERGY_DRAIN_PER_RUN_TICK = 6;
const RUN_ENERGY_REGEN_PER_IDLE_TICK = 5;

function tickRunEnergyRegen(): void {
  playerRunEnergy = Math.min(RUN_ENERGY_MAX, playerRunEnergy + RUN_ENERGY_REGEN_PER_IDLE_TICK);
}

/** Called only after a tick that advanced the path by 2 tiles (true run stride). */
function drainRunEnergyAfterRunStep(): void {
  playerRunEnergy = Math.max(0, playerRunEnergy - RUN_ENERGY_DRAIN_PER_RUN_TICK);
  if (playerRunEnergy <= 0) {
    playerRunEnergy = 0;
    playerRunEnabled = false;
  }
}

const hud = createHUD(container, {
  enemyCount: ENEMY_COUNT,
  casterCount: CASTER_COUNT,
  resurrectorCount: RESURRECTOR_COUNT,
  teleporterCount: TELEPORTER_COUNT,
  onRunToggle: () => {
    if (playerRunEnabled) {
      playerRunEnabled = false;
    } else if (playerRunEnergy > 0) {
      playerRunEnabled = true;
    }
  },
});
applyGameOptions(renderer, gameOptions);

// Boss is created later (after trySpawnDrop); API used for combat and HUD
let bossApi: BossApi;

// Player burning status
let playerBurning = false;
let playerBurnStartTime = -999;
let lastBurnTickTime = -999;

const playerBurnVisuals = createPlayerBurnVisuals(scene, () => ({
  playerBurning,
  playerBurnStartTime,
  burnDuration: BOSS_FIREBALL_BURN_DURATION,
  character,
}));

let playerPoisoned = false;
let playerPoisonStartTime = -999;
let lastPoisonTickTime = -999;
const playerPoisonVisuals = createPlayerPoisonVisuals(scene, () => ({
  playerPoisoned,
  playerPoisonStartTime,
  poisonDuration: POISON_DURATION,
  character,
}));

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

const groundItemsApi = createGroundItems({
  scene,
  getCamera: () => followCamera.three,
  container,
  canvas,
  tryAddToInventory: (itemId) => inventory.addItem(itemId),
  canInteract: () => !isDead && !isPaused,
  isPlayerOnItemTile: (itemTile) => {
    const pt = getPlayerPathTile();
    return pt.x === itemTile.x && pt.z === itemTile.z;
  },
  onPickupOutOfRange: () =>
    addChatMessage('You need to stand on the same tile as the item to pick it up.'),
  requestWalkOrPickup: requestWalkOrPickupGroundItem,
});

function tryConsumePendingGroundPickup(): void {
  const pid = pendingGroundPickupId;
  pendingGroundPickupId = null;
  if (pid === null) return;
  if (!groundItemsApi.tryPickupById(pid)) {
    addChatMessage('The item is no longer there, or your inventory is full.');
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/** OSRS-style path: tile indices from BFS; each tick advances 1 tile (walk) or 2 (run); mesh lerps like NPCs. */
let tilePath: { x: number; z: number }[] | null = null;
let pathProgressIndex = 0;
/** Goal tile for active movement (highlights target on ground). */
let moveGoalTile: GridTile | null = null;
/** Terrain goal (world XZ) applied on the next `processPlayerPathTick` while already walking. */
let pendingWorldGoal: { x: number; z: number } | null = null;
/** When set, finishing the current path (or snapping onto the goal tile) runs a pickup attempt by id. */
let pendingGroundPickupId: number | null = null;
const playerMoveVisFrom = { x: 0, z: 0 };
const playerMoveVisTo = { x: 0, z: 0 };

function clearTileMovementOnly(): void {
  tilePath = null;
  pathProgressIndex = 0;
  moveGoalTile = null;
  pendingWorldGoal = null;
  pendingPathfindingGateAction = null;
  moveTargetTileMarker.visible = false;
}

function clearTileMovement(): void {
  clearTileMovementOnly();
  pendingGroundPickupId = null;
}

/** Tile the player officially occupies: path step until a leg finishes, not world position mid-lerp. */
function getPlayerPathTile(): GridTile {
  if (tilePath !== null) {
    const t = tilePath[pathProgressIndex];
    return { x: t.x, z: t.z };
  }
  return worldXZToTile(character.position.x, character.position.z);
}

const terrainEditPanel = createTerrainEditPanel(container, {
  getPaletteSource: () => chunkTerrainLoader.getAnyLoadedChunk(),
  onVisibilityChange: (open) => {
    levelEditorInvincible = open;
    enemies.visible = !open;
    refreshWaterTileIndicators();
    serverWildlifeRuntime.updateVisuals(tickClock.getTickAlpha(), open, performance.now() / 1000);
  },
});

refreshWaterTileIndicators = (): void => {
  if (waterTileIndicatorsRaf !== 0) cancelAnimationFrame(waterTileIndicatorsRaf);
  waterTileIndicatorsRaf = requestAnimationFrame(() => {
    waterTileIndicatorsRaf = 0;
    if (!terrainEditPanel.isOpen()) {
      if (waterTileIndicatorMesh) {
        scene.remove(waterTileIndicatorMesh);
        waterTileIndicatorMesh.geometry.dispose();
        (waterTileIndicatorMesh.material as THREE.MeshBasicMaterial).dispose();
        waterTileIndicatorMesh = null;
      }
      return;
    }
    const geom = buildWaterTileIndicatorGeometry(
      chunkTerrainLoader,
      TERRAIN_GRID_WIDTH,
      TERRAIN_GRID_DEPTH,
      TILE_SIZE,
      WATER_TILE_INDICATOR_Y_BIAS
    );
    if (waterTileIndicatorMesh) {
      scene.remove(waterTileIndicatorMesh);
      waterTileIndicatorMesh.geometry.dispose();
      (waterTileIndicatorMesh.material as THREE.MeshBasicMaterial).dispose();
      waterTileIndicatorMesh = null;
    }
    if (!geom) return;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x22c8e6,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;
    waterTileIndicatorMesh = new THREE.Mesh(geom, mat);
    waterTileIndicatorMesh.renderOrder = 3;
    scene.add(waterTileIndicatorMesh);
  });
};

const terrainEditStrokeSeen = new Set<string>();
terrainEditPanel.setExportHandlers({
  exportThis: () => {
    const t = getPlayerPathTile();
    const cx = Math.floor(t.x / CHUNK_SIZE);
    const cz = Math.floor(t.z / CHUNK_SIZE);
    chunkTerrainLoader.triggerDownloadChunk(cx, cz);
  },
  exportAll: () => chunkTerrainLoader.triggerDownloadAllChunkData(),
});

function maybeSyncTerrainChunks(): void {
  const t = getPlayerPathTile();
  const cx = Math.floor(t.x / CHUNK_SIZE);
  const cz = Math.floor(t.z / CHUNK_SIZE);
  if (cx === lastTerrainChunkSync.cx && cz === lastTerrainChunkSync.cz) return;
  lastTerrainChunkSync = { cx, cz };
  void chunkTerrainLoader.syncToWorldTile(t.x, t.z);
}

function getPlayerLogicalWorldTileCenter(): { x: number; z: number } {
  return tileCenterXZ(getPlayerPathTile());
}

const playerLogicalHitOrigin = new THREE.Vector3();

function updatePlayerTileMarkers(): void {
  const pt = getPlayerPathTile();
  const pc = tileCenterXZ(pt);
  playerTrueTileMarker.position.set(pc.x, samplePlayerGroundY(pc.x, pc.z) + 0.035, pc.z);

  if (moveGoalTile !== null) {
    const tc = tileCenterXZ(moveGoalTile);
    moveTargetTileMarker.position.set(tc.x, samplePlayerGroundY(tc.x, tc.z) + 0.038, tc.z);
    moveTargetTileMarker.visible = true;
  }
}

function isTileMovementActive(): boolean {
  return tilePath !== null;
}

/**
 * Path from current tile to goal tile (OSRS BFS order), then move in segments of up to 2 tiles.
 * Clicks on blocked cells (e.g. water) snap to the nearest occupiable tile before pathing.
 */
function beginTilePathToWorldGoal(goalWx: number, goalWz: number): void {
  const start = getPlayerPathTile();
  const clicked = worldXZToTile(goalWx, goalWz);
  const goal = findNearestOccupiableTile(clicked);
  if (goal === null) {
    clearTileMovement();
    return;
  }
  const path = findTilePath(start, goal);

  if (path === null) {
    clearTileMovement();
    return;
  }

  if (path.length === 1) {
    const { x, z } = tileCenterXZ(path[0]);
    character.position.set(x, samplePlayerGroundY(x, z), z);
    syncMultiplayerPathTile();
    maybeCompletePendingPathfindingGateAction();
    clearTileMovementOnly();
    tryConsumePendingGroundPickup();
    return;
  }

  moveGoalTile = { x: goal.x, z: goal.z };
  tilePath = path;
  pathProgressIndex = 0;
  const c0 = tileCenterXZ(tilePath[0]);
  playerMoveVisFrom.x = c0.x;
  playerMoveVisFrom.z = c0.z;
  playerMoveVisTo.x = c0.x;
  playerMoveVisTo.z = c0.z;
  syncMultiplayerPathTile();
}

// Auto-attack target tracking
type AttackTargetType =
  | 'enemy'
  | 'caster'
  | 'resurrector'
  | 'teleporter'
  | 'boss'
  | 'training_dummy'
  | 'pen_rat'
  | 'starting_wildlife'
  | 'server_wildlife';
interface AttackTarget {
  type: AttackTargetType;
  index: number;
  /** When {@link type} is `server_wildlife`, matches replicated `server_npc.id`. */
  serverEntityId?: bigint;
}
let attackTarget: AttackTarget | null = null;
let gatheringTargetNodeIndex: number | null = null;
let gatherHarvestTickCounter = 0;

function clearGatheringTarget(): void {
  gatheringTargetNodeIndex = null;
  gatherHarvestTickCounter = 0;
}

/**
 * Training dummy melee: first strike on the first tick orthogonally adjacent; then every 3 ticks (attack speed).
 * -1 = not in melee range / need first hit when we become adjacent; else ticks since last swing (0..2).
 */
let trainingDummyMeleeTickCounter = -1;
let pendingTrainingDummyMeleeSwings = 0;

function isObjectUnderAncestor(obj: THREE.Object3D | null, ancestor: THREE.Object3D): boolean {
  let o = obj;
  while (o) {
    if (o === ancestor) return true;
    o = o.parent;
  }
  return false;
}

/** Nearest hit among terrain, pathfinding pen, pen rats, gathering spots, and ground items (sorted by distance). */
function mergePickIntersections(ray: THREE.Raycaster): THREE.Intersection[] {
  const objs: THREE.Object3D[] = [
    terrainRoot,
    pathfindingDemoPenRoot,
    penRatGroup,
    startingWildlifeGroup,
    gatheringNodesRoot,
    groundItemsApi.getGroup(),
  ];
  if (useSpacetimeMp) {
    objs.push(serverWildlifeRuntime.liveRoot, serverWildlifeRuntime.spawnerGhostRoot);
  }
  return ray.intersectObjects(objs, true);
}

function maybeCompletePendingPathfindingGateAction(): void {
  const pending = pendingPathfindingGateAction;
  if (pending === null) return;
  if (!areOrthogonallyAdjacent(getPlayerPathTile(), PATHFINDING_DEMO_GATE_TILE)) return;
  if (pending === 'open') setPathfindingDemoGateOpen(true);
  else setPathfindingDemoGateOpen(false);
}

function handlePathfindingPenBarrierClick(): void {
  attackTarget = null;
  pendingGroundPickupId = null;
  const pt = getPlayerPathTile();
  if (pathfindingDemoGateOpen) {
    if (areOrthogonallyAdjacent(pt, PATHFINDING_DEMO_GATE_TILE)) {
      setPathfindingDemoGateOpen(false);
      return;
    }
    const approachClose = findClosestReachableOrthAdjacentTile(pt, PATHFINDING_DEMO_GATE_TILE);
    if (approachClose === null) {
      addChatMessage("You can't reach the gate from here.");
      return;
    }
    pendingPathfindingGateAction = 'close';
    const cc = tileCenterXZ(approachClose);
    beginTilePathToWorldGoal(cc.x, cc.z);
    return;
  }
  if (areOrthogonallyAdjacent(pt, PATHFINDING_DEMO_GATE_TILE)) {
    setPathfindingDemoGateOpen(true);
    return;
  }
  const approachOpen = findClosestReachableOrthAdjacentTile(pt, PATHFINDING_DEMO_GATE_TILE);
  if (approachOpen === null) {
    addChatMessage("You can't reach the gate from here.");
    return;
  }
  pendingPathfindingGateAction = 'open';
  const c = tileCenterXZ(approachOpen);
  beginTilePathToWorldGoal(c.x, c.z);
}

function pathToClosestOrthTileTowardDummy(): void {
  pendingGroundPickupId = null;
  const adj = findClosestReachableOrthAdjacentTile(getPlayerPathTile(), TRAINING_DUMMY_TILE);
  if (adj === null) return;
  const c = tileCenterXZ(adj);
  if (tilePath !== null) {
    pendingWorldGoal = { x: c.x, z: c.z };
    moveGoalTile = { x: adj.x, z: adj.z };
    const tc = tileCenterXZ(moveGoalTile);
    moveTargetTileMarker.position.set(tc.x, moveTargetTileMarker.position.y, tc.z);
    moveTargetTileMarker.visible = true;
  } else {
    beginTilePathToWorldGoal(c.x, c.z);
  }
}

function pathToClosestOrthTileTowardGatheringNode(nodeIndex: number): void {
  pendingGroundPickupId = null;
  const def = GATHERING_NODE_DEFINITIONS[nodeIndex];
  if (!def) return;
  const adj = findClosestReachableOrthAdjacentTile(getPlayerPathTile(), def.tile);
  if (adj === null) {
    addChatMessage("You can't reach that from here.");
    return;
  }
  const c = tileCenterXZ(adj);
  if (tilePath !== null) {
    pendingWorldGoal = { x: c.x, z: c.z };
    moveGoalTile = { x: adj.x, z: adj.z };
    const tc = tileCenterXZ(moveGoalTile);
    moveTargetTileMarker.position.set(tc.x, moveTargetTileMarker.position.y, tc.z);
    moveTargetTileMarker.visible = true;
  } else {
    beginTilePathToWorldGoal(c.x, c.z);
  }
}

/** True when our true tile is orthogonally adjacent to the dummy (combat range), including mid-path lerp. */
function isAtTrainingDummyMeleeStand(): boolean {
  const pt = getPlayerPathTile();
  return areOrthogonallyAdjacent(pt, TRAINING_DUMMY_TILE);
}

function setMoveTargetFromMouse(clientX: number, clientY: number): SceneClickRippleKind | null {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, followCamera.three);

  const picks = mergePickIntersections(raycaster);
  if (picks.length === 0) return null;
  const top = picks[0];

  const groundPickHit = groundItemsApi.resolveGroundItemFromIntersection(top);
  if (groundPickHit) {
    requestWalkOrPickupGroundItem(groundPickHit.id);
    return 'interact';
  }

  const ratPickIdx = penRatIndexFromIntersection(top);
  if (ratPickIdx !== null && penRatNpcs[ratPickIdx].alive && penRatNpcs[ratPickIdx].attackable) {
    clearGatheringTarget();
    attackTarget = { type: 'pen_rat', index: ratPickIdx };
    clearTileMovement();
    return 'interact';
  }

  const wildlifePickIdx = startingWildlifeIndexFromIntersection(top);
  if (
    wildlifePickIdx !== null &&
    wildlifeNpcs[wildlifePickIdx] &&
    wildlifeNpcs[wildlifePickIdx].alive &&
    wildlifeNpcs[wildlifePickIdx].attackable
  ) {
    clearGatheringTarget();
    attackTarget = { type: 'starting_wildlife', index: wildlifePickIdx };
    clearTileMovement();
    return 'interact';
  }

  if (useSpacetimeMp && spacetimeSessionReady) {
    const srvEid = serverWildlifeEntityFromIntersection(top);
    if (srvEid !== null && !terrainEditPanel.isOpen()) {
      const rows = serverWildlifeRuntime.getCombatRows(gameTime);
      const sidx = rows.findIndex((r) => r.entityId === srvEid);
      if (sidx >= 0) {
        clearGatheringTarget();
        attackTarget = { type: 'server_wildlife', index: sidx, serverEntityId: srvEid };
        clearTileMovement();
        return 'interact';
      }
    }
  }

  if (isObjectUnderAncestor(top.object, pathfindingDemoPenRoot)) {
    handlePathfindingPenBarrierClick();
    return 'interact';
  }

  const gClickIdx = gatheringNodeIndexFromIntersection(top);
  if (gClickIdx !== null) {
    attackTarget = null;
    if (gatheringTargetNodeIndex !== gClickIdx) gatherHarvestTickCounter = 0;
    gatheringTargetNodeIndex = gClickIdx;
    pathToClosestOrthTileTowardGatheringNode(gClickIdx);
    return 'interact';
  }

  const groundPoint = top.point;
  const clickRadius = 1.5; // How close to a monster's position counts as clicking it

  if (trainingDummyAlive) {
    const dx = groundPoint.x - trainingDummyWorldPos.x;
    const dz = groundPoint.z - trainingDummyWorldPos.z;
    if (Math.sqrt(dx * dx + dz * dz) <= clickRadius + TRAINING_DUMMY_SIZE * 0.35) {
      clearGatheringTarget();
      attackTarget = { type: 'training_dummy', index: 0 };
      pathToClosestOrthTileTowardDummy();
      return 'interact';
    }
  }

  for (let ri = 0; ri < PEN_RAT_COUNT; ri++) {
    const pr = penRatNpcs[ri];
    if (!pr.alive || !pr.attackable) continue;
    if (groundPoint.distanceTo(pr.position) <= clickRadius + PEN_RAT_COLLISION_RADIUS) {
      clearGatheringTarget();
      attackTarget = { type: 'pen_rat', index: ri };
      clearTileMovement();
      return 'interact';
    }
  }

  for (let wi = 0; wi < wildlifeNpcs.length; wi++) {
    const wn = wildlifeNpcs[wi];
    if (!wn.alive || !wn.attackable) continue;
    if (groundPoint.distanceTo(wn.position) <= clickRadius + wn.collisionRadius) {
      clearGatheringTarget();
      attackTarget = { type: 'starting_wildlife', index: wi };
      clearTileMovement();
      return 'interact';
    }
  }

  if (useSpacetimeMp && spacetimeSessionReady && !terrainEditPanel.isOpen()) {
    const rows = serverWildlifeRuntime.getCombatRows(gameTime);
    for (let si = 0; si < rows.length; si++) {
      const sr = rows[si]!;
      if (!sr.attackable) continue;
      if (groundPoint.distanceTo(sr.position) <= clickRadius + sr.hitRadius) {
        clearGatheringTarget();
        attackTarget = { type: 'server_wildlife', index: si, serverEntityId: sr.entityId };
        clearTileMovement();
        return 'interact';
      }
    }
  }

  // First check if clicking on a monster by checking distance from ground intersection
  // Check enemies (grunts)
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    const dist = groundPoint.distanceTo(enemyPositions[j]);
    if (dist <= clickRadius) {
      clearGatheringTarget();
      attackTarget = { type: 'enemy', index: j };
      clearTileMovement(); // Clear move target when attacking
      return 'interact';
    }
  }
  
  // Check casters
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (!casterAlive[c]) continue;
    const dist = groundPoint.distanceTo(casterLogicalPos[c]);
    if (dist <= clickRadius) {
      clearGatheringTarget();
      attackTarget = { type: 'caster', index: c };
      clearTileMovement();
      return 'interact';
    }
  }
  
  // Check resurrectors
  for (let r = 0; r < RESURRECTOR_COUNT; r++) {
    if (!resurrectorAlive[r]) continue;
    const dist = groundPoint.distanceTo(resurrectorLogicalPos[r]);
    if (dist <= clickRadius) {
      clearGatheringTarget();
      attackTarget = { type: 'resurrector', index: r };
      clearTileMovement();
      return 'interact';
    }
  }

  // Check teleporters
  for (let t = 0; t < teleportersApi.getCount(); t++) {
    if (!teleportersApi.isAlive(t)) continue;
    const dist = groundPoint.distanceTo(teleportersApi.getPosition(t));
    if (dist <= clickRadius) {
      clearGatheringTarget();
      attackTarget = { type: 'teleporter', index: t };
      clearTileMovement();
      return 'interact';
    }
  }
  
  // Check boss (use circular hitbox radius for click detection)
  if (bossApi.isAlive()) {
    const dist = groundPoint.distanceTo(bossApi.getPosition());
    if (dist <= bossApi.getHitboxRadius()) {
      clearGatheringTarget();
      attackTarget = { type: 'boss', index: 0 };
      clearTileMovement();
      return 'interact';
    }
  }
  
  // If no monster clicked, path to clicked tile (center), OSRS-style BFS + 2-tile legs
  attackTarget = null; // Clear attack target when clicking terrain
  walkToGroundPoint(groundPoint);
  return 'walk';
}

function walkToGroundPoint(p: THREE.Vector3): void {
  pendingPathfindingGateAction = null;
  clearGatheringTarget();
  pendingGroundPickupId = null;
  const x = Math.max(TERRAIN_XZ_MIN, Math.min(TERRAIN_XZ_MAX, p.x));
  const z = Math.max(TERRAIN_XZ_MIN, Math.min(TERRAIN_XZ_MAX, p.z));
  if (tilePath !== null) {
    pendingWorldGoal = { x, z };
    const goalTile = findNearestOccupiableTile(worldXZToTile(x, z));
    if (goalTile === null) return;
    moveGoalTile = goalTile;
    const tc = tileCenterXZ(goalTile);
    moveTargetTileMarker.position.set(tc.x, moveTargetTileMarker.position.y, tc.z);
    moveTargetTileMarker.visible = true;
    return;
  }
  beginTilePathToWorldGoal(x, z);
}

function requestWalkOrPickupGroundItem(itemId: number): void {
  if (isDead || isPaused) return;
  const goal = groundItemsApi.getPickupGoalXZ(itemId);
  if (goal === null) {
    addChatMessage('The item is no longer there.');
    return;
  }
  pendingPathfindingGateAction = null;
  clearGatheringTarget();
  attackTarget = null;
  const itemTile = worldXZToTile(goal.x, goal.z);
  const pt = getPlayerPathTile();
  if (pt.x === itemTile.x && pt.z === itemTile.z) {
    pendingGroundPickupId = null;
    if (!groundItemsApi.tryPickupById(itemId)) {
      addChatMessage('The item is no longer there, or your inventory is full.');
    }
    return;
  }
  pendingGroundPickupId = itemId;
  const x = Math.max(TERRAIN_XZ_MIN, Math.min(TERRAIN_XZ_MAX, goal.x));
  const z = Math.max(TERRAIN_XZ_MIN, Math.min(TERRAIN_XZ_MAX, goal.z));
  if (tilePath !== null) {
    pendingWorldGoal = { x, z };
    const goalTile = findNearestOccupiableTile(worldXZToTile(x, z));
    if (goalTile === null) return;
    moveGoalTile = goalTile;
    const tc = tileCenterXZ(goalTile);
    moveTargetTileMarker.position.set(tc.x, moveTargetTileMarker.position.y, tc.z);
    moveTargetTileMarker.visible = true;
  } else {
    beginTilePathToWorldGoal(x, z);
  }
}

function startAttackTarget(target: AttackTarget): void {
  clearGatheringTarget();
  attackTarget = target;
  if (target.type === 'training_dummy') {
    pathToClosestOrthTileTowardDummy();
    return;
  }
  clearTileMovement();
}

type ContextMenuTarget =
  | { kind: 'tile'; groundPoint: THREE.Vector3 }
  | { kind: 'gate' }
  | { kind: 'ground_item'; id: number; itemId: ItemId }
  | { kind: 'gathering'; nodeIndex: number }
  | { kind: 'attackable'; target: AttackTarget };

function setRayFromCanvasClient(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, followCamera.three);
}

/** World hit on terrain chunks — same idea as move picking when the ray hits something closer than terrain first. */
function pickPointOnTerrainMeshes(clientX: number, clientY: number): THREE.Vector3 | null {
  setRayFromCanvasClient(clientX, clientY);
  let hits = raycaster.intersectObject(terrainRoot, true);
  if (hits.length > 0) return hits[0]!.point;
  const picks = mergePickIntersections(raycaster);
  for (const h of picks) {
    if (isObjectUnderAncestor(h.object, terrainRoot)) return h.point;
  }
  return null;
}

function tryTerrainEditPaint(clientX: number, clientY: number): void {
  if (!terrainEditPanel.isOpen() || isDead || isPaused) return;
  if (terrainEditPanel.getPrimaryTool() === 'npc_spawner') {
    const c = multiplayerClient;
    if (!(c instanceof SpacetimeMultiplayerClient)) {
      addChatMessage('NPC spawners need SpacetimeDB (configure VITE_SPACETIMEDB_URI and sign in).');
      return;
    }
    const p0 = pickPointOnTerrainMeshes(clientX, clientY);
    if (!p0) {
      addChatMessage('Click loaded terrain to place an NPC spawner.');
      return;
    }
    const t0 = worldXZToTile(p0.x, p0.z);
    const k0 = `npc:${t0.x},${t0.z}`;
    if (terrainEditStrokeSeen.has(k0)) return;
    terrainEditStrokeSeen.add(k0);
    const par = terrainEditPanel.getNpcSpawnerPlaceParams();
    c.npcSpawnerPlace(
      t0.x,
      t0.z,
      par.templateKey,
      par.respawnTicks,
      par.wanderTiles,
      par.hpOverride,
      par.dmgOverride
    );
    return;
  }
  setRayFromCanvasClient(clientX, clientY);
  const hits = raycaster.intersectObject(terrainRoot, true);
  if (hits.length === 0) return;
  const p = hits[0]!.point;
  const tile = worldXZToTile(p.x, p.z);
  const key = `${tile.x},${tile.z}`;
  if (terrainEditStrokeSeen.has(key)) return;
  terrainEditStrokeSeen.add(key);
  applyTerrainPaintAtTile(
    chunkTerrainLoader,
    tile.x,
    tile.z,
    terrainEditPanel.getMode(),
    terrainEditPanel.getTextureBrushIndex(),
    terrainEditPanel.getHeightStep(),
    terrainEditPanel.getBrushRadius()
  );
  multiplayerClient?.sendTerrainEdit(
    tile.x,
    tile.z,
    terrainEditPanel.getMode(),
    terrainEditPanel.getTextureBrushIndex(),
    terrainEditPanel.getHeightStep(),
    terrainEditPanel.getBrushRadius()
  );
}

function resolveContextMenuTarget(clientX: number, clientY: number): ContextMenuTarget | null {
  if (isDead || isPaused) return null;
  setRayFromCanvasClient(clientX, clientY);

  const picks = mergePickIntersections(raycaster);
  if (picks.length === 0) return null;
  const top = picks[0];

  const itemHit = groundItemsApi.resolveGroundItemFromIntersection(top);
  if (itemHit) return { kind: 'ground_item', id: itemHit.id, itemId: itemHit.itemId };

  const ratCtxIdx = penRatIndexFromIntersection(top);
  if (ratCtxIdx !== null && penRatNpcs[ratCtxIdx].alive) {
    return { kind: 'attackable', target: { type: 'pen_rat', index: ratCtxIdx } };
  }

  const wildlifeCtxIdx = startingWildlifeIndexFromIntersection(top);
  if (
    wildlifeCtxIdx !== null &&
    wildlifeNpcs[wildlifeCtxIdx] &&
    wildlifeNpcs[wildlifeCtxIdx].alive
  ) {
    return { kind: 'attackable', target: { type: 'starting_wildlife', index: wildlifeCtxIdx } };
  }

  if (useSpacetimeMp && spacetimeSessionReady) {
    const se = serverWildlifeEntityFromIntersection(top);
    if (se !== null) {
      const rows = serverWildlifeRuntime.getCombatRows(gameTime);
      const ix = rows.findIndex((r) => r.entityId === se);
      if (ix >= 0) {
        return { kind: 'attackable', target: { type: 'server_wildlife', index: ix, serverEntityId: se } };
      }
    }
  }

  if (isObjectUnderAncestor(top.object, pathfindingDemoPenRoot)) return { kind: 'gate'};

  const gCtxIdx = gatheringNodeIndexFromIntersection(top);
  if (gCtxIdx !== null) return { kind: 'gathering', nodeIndex: gCtxIdx };

  const groundPoint = top.point;
  const clickRadius = 1.5;

  if (trainingDummyAlive) {
    const dx = groundPoint.x - trainingDummyWorldPos.x;
    const dz = groundPoint.z - trainingDummyWorldPos.z;
    if (Math.sqrt(dx * dx + dz * dz) <= clickRadius + TRAINING_DUMMY_SIZE * 0.35) {
      return { kind: 'attackable', target: { type: 'training_dummy', index: 0 } };
    }
  }

  for (let ri = 0; ri < PEN_RAT_COUNT; ri++) {
    if (!penRatNpcs[ri].alive) continue;
    if (groundPoint.distanceTo(penRatNpcs[ri].position) <= clickRadius + PEN_RAT_COLLISION_RADIUS) {
      return { kind: 'attackable', target: { type: 'pen_rat', index: ri } };
    }
  }

  for (let wi = 0; wi < wildlifeNpcs.length; wi++) {
    if (!wildlifeNpcs[wi].alive) continue;
    if (groundPoint.distanceTo(wildlifeNpcs[wi].position) <= clickRadius + wildlifeNpcs[wi].collisionRadius) {
      return { kind: 'attackable', target: { type: 'starting_wildlife', index: wi } };
    }
  }

  if (useSpacetimeMp && spacetimeSessionReady) {
    const ctxRows = serverWildlifeRuntime.getCombatRows(gameTime);
    for (let ci = 0; ci < ctxRows.length; ci++) {
      const cr = ctxRows[ci]!;
      if (groundPoint.distanceTo(cr.position) <= clickRadius + cr.hitRadius) {
        return {
          kind: 'attackable',
          target: { type: 'server_wildlife', index: ci, serverEntityId: cr.entityId },
        };
      }
    }
  }

  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    if (groundPoint.distanceTo(enemyPositions[j]) <= clickRadius) {
      return { kind: 'attackable', target: { type: 'enemy', index: j } };
    }
  }
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (!casterAlive[c]) continue;
    if (groundPoint.distanceTo(casterLogicalPos[c]) <= clickRadius) {
      return { kind: 'attackable', target: { type: 'caster', index: c } };
    }
  }
  for (let r = 0; r < RESURRECTOR_COUNT; r++) {
    if (!resurrectorAlive[r]) continue;
    if (groundPoint.distanceTo(resurrectorLogicalPos[r]) <= clickRadius) {
      return { kind: 'attackable', target: { type: 'resurrector', index: r } };
    }
  }
  for (let t = 0; t < teleportersApi.getCount(); t++) {
    if (!teleportersApi.isAlive(t)) continue;
    if (groundPoint.distanceTo(teleportersApi.getPosition(t)) <= clickRadius) {
      return { kind: 'attackable', target: { type: 'teleporter', index: t } };
    }
  }
  if (bossApi.isAlive() && groundPoint.distanceTo(bossApi.getPosition()) <= bossApi.getHitboxRadius()) {
    return { kind: 'attackable', target: { type: 'boss', index: 0 } };
  }

  return { kind: 'tile', groundPoint };
}

const contextMenuEl = document.createElement('div');
contextMenuEl.id = 'game-context-menu';
contextMenuEl.style.cssText =
  'display:none;position:absolute;z-index:50;min-width:148px;background:rgba(22,20,30,0.97);' +
  'border:1px solid rgba(180,160,120,0.5);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,0.55);padding:5px 0;';
contextMenuEl.addEventListener('contextmenu', (e) => e.preventDefault());
container.appendChild(contextMenuEl);

function hideGameContextMenu(): void {
  contextMenuEl.style.display = 'none';
  contextMenuEl.replaceChildren();
}

function showContextMenuEntriesAt(
  clientX: number,
  clientY: number,
  entries: { label: string; action: () => void }[]
): void {
  if (entries.length === 0) return;
  hideGameContextMenu();
  const cr = container.getBoundingClientRect();
  let left = clientX - cr.left;
  let top = clientY - cr.top;

  for (const ent of entries) {
    const row = document.createElement('button');
    row.type = 'button';
    row.textContent = ent.label;
    row.style.cssText =
      'display:block;width:100%;text-align:left;padding:9px 16px;border:none;background:transparent;' +
      'color:#ece8e0;cursor:pointer;font:13px sans-serif;border-radius:4px;';
    row.addEventListener('mouseenter', () => {
      row.style.background = 'rgba(255,255,255,0.07)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent';
    });
    row.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    });
    row.addEventListener('click', () => {
      ent.action();
      hideGameContextMenu();
    });
    contextMenuEl.appendChild(row);
  }

  contextMenuEl.style.display = 'block';
  contextMenuEl.style.left = `${left}px`;
  contextMenuEl.style.top = `${top}px`;

  requestAnimationFrame(() => {
    const w = contextMenuEl.offsetWidth;
    const h = contextMenuEl.offsetHeight;
    if (left + w > cr.width - 4) left = Math.max(4, cr.width - w - 4);
    if (top + h > cr.height - 4) top = Math.max(4, cr.height - h - 4);
    contextMenuEl.style.left = `${left}px`;
    contextMenuEl.style.top = `${top}px`;
  });
}

function openInventorySlotContextMenu(clientX: number, clientY: number, slotIndex: number): void {
  const stack = inventory.getSlot(slotIndex);
  if (!stack) return;

  const def = getItemDef(stack.itemId);

  const equipFromThisSlot = (): void => {
    const s = inventory.getSlot(slotIndex);
    if (!s) return;
    const current = equipment.getEquipped('weapon');
    equipment.setEquipped('weapon', s.itemId);
    inventory.setSlot(slotIndex, current ? { itemId: current, count: 1 } : null);
  };

  const entries: { label: string; action: () => void }[] = [
    {
      label: 'Examine',
      action: () => addChatMessage(getExamineMessage(stack.itemId)),
    },
  ];

  if (def.slot === 'weapon') {
    entries.push({ label: 'Equip', action: equipFromThisSlot });
  } else {
    entries.push({
      label: 'Use',
      action: () => addChatMessage('Nothing interesting happens.'),
    });
  }

  entries.push({
    label: 'Drop',
    action: () => {
      const s = inventory.getSlot(slotIndex);
      if (!s) return;
      const dropPos = character.position.clone();
      dropPos.y = 0.2;
      dropPos.x += (Math.random() - 0.5) * 0.65;
      dropPos.z += (Math.random() - 0.5) * 0.65;
      groundItemsApi.spawn(dropPos, s.itemId);
      if (s.count > 1) {
        inventory.setSlot(slotIndex, { itemId: s.itemId, count: s.count - 1 });
      } else {
        inventory.setSlot(slotIndex, null);
      }
    },
  });

  showContextMenuEntriesAt(clientX, clientY, entries);
}

function examineAttackable(target: AttackTarget): void {
  if (target.type === 'training_dummy') {
    addChatMessage('Training dummy — harmless; useful for melee timing and hit splats.');
    return;
  }
  if (target.type === 'enemy') {
    addChatMessage(`Red cube (grunt) #${target.index + 1}.`);
    return;
  }
  if (target.type === 'caster') {
    addChatMessage(`Caster #${target.index + 1} — keeps range and throws fireballs.`);
    return;
  }
  if (target.type === 'resurrector') {
    addChatMessage(`Resurrector #${target.index + 1} — revives fallen grunts.`);
    return;
  }
  if (target.type === 'teleporter') {
    addChatMessage(`Teleporter #${target.index + 1} — defeats spawn portals elsewhere.`);
    return;
  }
  if (target.type === 'boss') {
    addChatMessage('Boss — high health; watch for special attacks.');
    return;
  }
  if (target.type === 'pen_rat') {
    addChatMessage('A nasty rat — sharp teeth and beady eyes.');
    return;
  }
  if (target.type === 'starting_wildlife') {
    const k = wildlifeKindAt(target.index);
    addChatMessage(
      k === 'spider'
        ? 'A hairy spider — skittering legs and a venomous bite.'
        : 'A burly bear — best not to let it get too close.'
    );
    return;
  }
  if (target.type === 'server_wildlife') {
    const rows = serverWildlifeRuntime.getCombatRows(gameTime);
    const row = rows[target.index];
    const k = row?.templateKey === 'bear' ? 'bear' : 'spider';
    addChatMessage(
      k === 'spider'
        ? 'A hairy spider — skittering legs and a venomous bite.'
        : 'A burly bear — best not to let it get too close.'
    );
  }
}

let npcSpawnerConfigOverlayEl: HTMLDivElement | null = null;

function closeNpcSpawnerConfigOverlay(): void {
  npcSpawnerConfigOverlayEl?.remove();
  npcSpawnerConfigOverlayEl = null;
}

function openNpcSpawnerConfigOverlay(spawnerId: bigint): void {
  closeNpcSpawnerConfigOverlay();
  const c = multiplayerClient;
  if (!(c instanceof SpacetimeMultiplayerClient)) return;
  const row = serverWildlifeRuntime.getSpawnerRows().find((r) => BigInt(String(r.id)) === spawnerId);
  if (!row) return;

  const overlay = document.createElement('div');
  npcSpawnerConfigOverlayEl = overlay;
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:220;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText =
    'background:#1e1c24;border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:16px;min-width:300px;font:13px system-ui,sans-serif;color:#e8e4dc;';
  box.addEventListener('click', (ev) => ev.stopPropagation());

  const title = document.createElement('div');
  title.textContent = 'NPC spawner';
  title.style.cssText = 'font-weight:600;margin-bottom:12px;';

  const mkRow = (label: string, el: HTMLElement): HTMLDivElement => {
    const r = document.createElement('div');
    r.style.cssText = ' display:flex;align-items:center;gap:10px;margin-bottom:8px;';
    const l = document.createElement('span');
    l.textContent = label;
    l.style.cssText = 'flex:0 0 120px;font-size:12px;color:rgba(255,255,255,0.65);';
    r.append(l, el);
    return r;
  };

  const tpl = document.createElement('select');
  tpl.style.cssText =
    'flex:1;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:#0e0c12;color:#eee;';
  for (const k of SERVER_NPC_TEMPLATE_KEYS) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = k;
    tpl.appendChild(o);
  }
  tpl.value = String(row.templateKey);

  const numStyle =
    'width:72px;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:#0e0c12;color:#eee;font:12px monospace;';
  const respawnInp = document.createElement('input');
  respawnInp.type = 'number';
  respawnInp.value = String(row.respawnTicks);
  respawnInp.style.cssText = numStyle;
  const wanderInp = document.createElement('input');
  wanderInp.type = 'number';
  wanderInp.value = String(row.wanderTiles);
  wanderInp.style.cssText = numStyle;
  const hpInp = document.createElement('input');
  hpInp.type = 'number';
  hpInp.value = String(row.hpOverride);
  hpInp.style.cssText = numStyle;
  const dmgInp = document.createElement('input');
  dmgInp.type = 'number';
  dmgInp.value = String(row.dmgOverride);
  dmgInp.style.cssText = numStyle;

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;';
  const btnSt =
    'padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);cursor:pointer;font:12px sans-serif;';
  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Save';
  save.style.cssText = btnSt + 'background:#2a5080;color:#e8f0ff;';
  save.addEventListener('click', () => {
    c.npcSpawnerUpdate(
      spawnerId,
      tpl.value,
      Math.floor(Number(respawnInp.value) || 25),
      Math.floor(Number(wanderInp.value) || 8),
      Math.floor(Number(hpInp.value) || 0),
      Math.floor(Number(dmgInp.value) || 0)
    );
    closeNpcSpawnerConfigOverlay();
  });
  const del = document.createElement('button');
  del.type = 'button';
  del.textContent = 'Delete';
  del.style.cssText = btnSt + 'background:#5a2820;color:#f0ddd8;';
  del.addEventListener('click', () => {
    c.npcSpawnerDelete(spawnerId);
    closeNpcSpawnerConfigOverlay();
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.style.cssText = btnSt + 'background:#2a2a32;color:#ddd;';
  cancel.addEventListener('click', closeNpcSpawnerConfigOverlay);
  btnRow.append(save, del, cancel);

  box.append(
    title,
    mkRow('Template', tpl),
    mkRow('Respawn ticks', respawnInp),
    mkRow('Wander tiles', wanderInp),
    mkRow('HP (0=def)', hpInp),
    mkRow('Dmg (0=def)', dmgInp),
    btnRow
  );
  overlay.addEventListener('click', closeNpcSpawnerConfigOverlay);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function openGameContextMenu(clientX: number, clientY: number): void {
  const target = resolveContextMenuTarget(clientX, clientY);
  if (!target) return;

  const entries: { label: string; action: () => void }[] = [];

  if (target.kind === 'tile') {
    entries.push({
      label: 'Walk here',
      action: () => {
        attackTarget = null;
        walkToGroundPoint(target.groundPoint);
      },
    });
  } else if (target.kind === 'gathering') {
    entries.push({
      label: 'Harvest',
      action: () => {
        attackTarget = null;
        const idx = target.nodeIndex;
        if (gatheringTargetNodeIndex !== idx) gatherHarvestTickCounter = 0;
        gatheringTargetNodeIndex = idx;
        pathToClosestOrthTileTowardGatheringNode(idx);
      },
    });
    entries.push({
      label: 'Examine',
      action: () => addChatMessage(gatheringExamineLine(target.nodeIndex)),
    });
  } else if (target.kind === 'gate') {
    if (!pathfindingDemoGateOpen) {
      entries.push({
        label: 'Open',
        action: () => setPathfindingDemoGateOpen(true),
      });
    } else {
      entries.push({
        label: 'Close',
        action: () => setPathfindingDemoGateOpen(false),
      });
    }
    entries.push({
      label: 'Examine',
      action: () =>
        addChatMessage(
          pathfindingDemoGateOpen
            ? 'Pathfinding pen gate — open; you can pass the south doorway.'
            : 'Pathfinding pen gate — closed; the doorway edge is blocked but the pen floor stays walkable inside.'
        ),
    });
  } else if (target.kind === 'ground_item') {
    const def = getItemDef(target.itemId);
    entries.push({
      label: 'Examine',
      action: () => addChatMessage(`${def.name} — ${def.label} on the ground.`),
    });
    entries.push({
      label: 'Pick-up',
      action: () => requestWalkOrPickupGroundItem(target.id),
    });
  } else if (target.kind === 'attackable') {
    const canAttackTarget =
      (target.target.type !== 'pen_rat' &&
        target.target.type !== 'starting_wildlife' &&
        target.target.type !== 'server_wildlife') ||
      (target.target.type === 'pen_rat' && penRatNpcs[target.target.index].attackable) ||
      (target.target.type === 'starting_wildlife' &&
        wildlifeNpcs[target.target.index] &&
        wildlifeNpcs[target.target.index].attackable) ||
      (target.target.type === 'server_wildlife' &&
        serverWildlifeRuntime
          .getCombatRows(gameTime)
          .some(
            (r, i) =>
              i === target.target.index &&
              r.entityId === target.target.serverEntityId &&
              r.attackable
          ));
    if (canAttackTarget) {
      entries.push({
        label: 'Attack',
        action: () => startAttackTarget(target.target),
      });
    }
    entries.push({
      label: 'Examine',
      action: () => examineAttackable(target.target),
    });
  }

  showContextMenuEntriesAt(clientX, clientY, entries);
}

document.addEventListener(
  'mousedown',
  (ev) => {
    if (contextMenuEl.style.display === 'none') return;
    if (contextMenuEl.contains(ev.target as Node)) return;
    hideGameContextMenu();
  },
  true
);

clickOverlay.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // left button only
  if (isDead || isPaused) return;
  if (terrainEditPanel.isOpen()) {
    terrainEditStrokeSeen.clear();
    tryTerrainEditPaint(e.clientX, e.clientY);
    return;
  }
  const ripple = setMoveTargetFromMouse(e.clientX, e.clientY);
  if (ripple) spawnSceneClickRipple(e.clientX, e.clientY, ripple);
});

clickOverlay.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  if (!isDead && !isPaused && terrainEditPanel.isOpen() && (e.buttons & 1) !== 0) {
    if (terrainEditPanel.getPrimaryTool() !== 'npc_spawner') {
      tryTerrainEditPaint(e.clientX, e.clientY);
    }
    return;
  }
  if (!isDead && !isPaused && (e.buttons & 1) !== 0) setMoveTargetFromMouse(e.clientX, e.clientY);
});

function updateCharacterMove(_dt: number): void {
  if (tilePath === null) return;
  const a = tickClock.getTickAlpha();
  const x = THREE.MathUtils.lerp(playerMoveVisFrom.x, playerMoveVisTo.x, a);
  const z = THREE.MathUtils.lerp(playerMoveVisFrom.z, playerMoveVisTo.z, a);
  const y0 = samplePlayerGroundY(playerMoveVisFrom.x, playerMoveVisFrom.z);
  const y1 = samplePlayerGroundY(playerMoveVisTo.x, playerMoveVisTo.z);
  character.position.set(x, THREE.MathUtils.lerp(y0, y1, a), z);
  const dx = playerMoveVisTo.x - playerMoveVisFrom.x;
  const dz = playerMoveVisTo.z - playerMoveVisFrom.z;
  if (Math.abs(dx) + Math.abs(dz) > 1e-4) {
    character.rotation.y = Math.atan2(dx, dz);
  }
}

/** Advances path leg on each server tick (same cadence as `processGameTick`). */
function processPlayerPathTick(): void {
  if (pendingWorldGoal !== null) {
    const g = pendingWorldGoal;
    pendingWorldGoal = null;
    beginTilePathToWorldGoal(g.x, g.z);
  }
  if (tilePath === null) {
    tickRunEnergyRegen();
    return;
  }
  const len = tilePath.length;
  const oldIdx = pathProgressIndex;
  if (oldIdx >= len - 1) {
    tickRunEnergyRegen();
    const c = tileCenterXZ(tilePath[oldIdx]);
    character.position.set(c.x, samplePlayerGroundY(c.x, c.z), c.z);
    syncMultiplayerPathTile();
    maybeCompletePendingPathfindingGateAction();
    clearTileMovementOnly();
    tryConsumePendingGroundPickup();
    return;
  }

  let step = 1;
  if (playerRunEnabled) {
    if (playerRunEnergy >= RUN_ENERGY_DRAIN_PER_RUN_TICK) {
      step = 2;
    } else {
      playerRunEnabled = false;
    }
  }

  const newIdx = Math.min(oldIdx + step, len - 1);
  const o = tileCenterXZ(tilePath[oldIdx]);
  const n = tileCenterXZ(tilePath[newIdx]);
  playerMoveVisFrom.x = o.x;
  playerMoveVisFrom.z = o.z;
  playerMoveVisTo.x = n.x;
  playerMoveVisTo.z = n.z;
  pathProgressIndex = newIdx;

  /** Drain only if this tick actually moved two tiles (not a single-tile “run to goal” finish). */
  if (newIdx - oldIdx >= 2) {
    drainRunEnergyAfterRunStep();
  }
  syncMultiplayerPathTile();
  maybeCompletePendingPathfindingGateAction();
}

function updatePlayerCollisions(dt: number): void {
  const charPos = character.position;
  collisionPushVec.set(0, 0, 0);
  
  // Collision with enemies (grunts)
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    const toEnemy = new THREE.Vector3().subVectors(charPos, enemyPositions[j]);
    const dist = toEnemy.length();
    const minDist = PLAYER_COLLISION_RADIUS + ENEMY_COLLISION_RADIUS;
    if (dist < minDist && dist > 0.001) {
      const overlap = minDist - dist;
      toEnemy.normalize();
      collisionPushVec.addScaledVector(toEnemy, overlap);
    }
  }

  for (let ri = 0; ri < PEN_RAT_COUNT; ri++) {
    if (!penRatNpcs[ri].alive) continue;
    const toRat = new THREE.Vector3().subVectors(charPos, penRatNpcs[ri].position);
    const dist = toRat.length();
    const minDist = PLAYER_COLLISION_RADIUS + PEN_RAT_COLLISION_RADIUS;
    if (dist < minDist && dist > 0.001) {
      const overlap = minDist - dist;
      toRat.normalize();
      collisionPushVec.addScaledVector(toRat, overlap);
    }
  }

  for (let wi = 0; wi < wildlifeNpcs.length; wi++) {
    if (!wildlifeNpcs[wi].alive) continue;
    const toW = new THREE.Vector3().subVectors(charPos, wildlifeNpcs[wi].position);
    const dist = toW.length();
    const minDist = PLAYER_COLLISION_RADIUS + wildlifeNpcs[wi].collisionRadius;
    if (dist < minDist && dist > 0.001) {
      const overlap = minDist - dist;
      toW.normalize();
      collisionPushVec.addScaledVector(toW, overlap);
    }
  }

  if (useSpacetimeMp && spacetimeSessionReady) {
    for (const row of serverWildlifeRuntime.getCombatRows(gameTime)) {
      const toW = new THREE.Vector3().subVectors(charPos, row.position);
      const dist = toW.length();
      const minDist = PLAYER_COLLISION_RADIUS + row.hitRadius;
      if (dist < minDist && dist > 0.001) {
        const overlap = minDist - dist;
        toW.normalize();
        collisionPushVec.addScaledVector(toW, overlap);
      }
    }
  }

  // Collision with casters
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (!casterAlive[c]) continue;
    const casterPos = casterLogicalPos[c];
    const toCaster = new THREE.Vector3().subVectors(charPos, casterPos);
    const dist = toCaster.length();
    const minDist = PLAYER_COLLISION_RADIUS + CASTER_COLLISION_RADIUS;
    if (dist < minDist && dist > 0.001) {
      const overlap = minDist - dist;
      toCaster.normalize();
      collisionPushVec.addScaledVector(toCaster, overlap);
    }
  }
  
  // Collision with resurrectors
  for (let r = 0; r < RESURRECTOR_COUNT; r++) {
    if (!resurrectorAlive[r]) continue;
    const resPos = resurrectorLogicalPos[r];
    const toRes = new THREE.Vector3().subVectors(charPos, resPos);
    const dist = toRes.length();
    const minDist = PLAYER_COLLISION_RADIUS + RESURRECTOR_COLLISION_RADIUS;
    if (dist < minDist && dist > 0.001) {
      const overlap = minDist - dist;
      toRes.normalize();
      collisionPushVec.addScaledVector(toRes, overlap);
    }
  }
  
  // Collision with teleporters
  for (let t = 0; t < teleportersApi.getCount(); t++) {
    if (!teleportersApi.isAlive(t)) continue;
    const telePos = teleportersApi.getPosition(t);
    const toTele = new THREE.Vector3().subVectors(charPos, telePos);
    const dist = toTele.length();
    const minDist = PLAYER_COLLISION_RADIUS + TELEPORTER_SIZE / 2;
    if (dist < minDist && dist > 0.001) {
      const overlap = minDist - dist;
      toTele.normalize();
      collisionPushVec.addScaledVector(toTele, overlap);
    }
  }

  // Collision with boss (circular hitbox)
  if (bossApi.isAlive()) {
    const toBoss = new THREE.Vector3().subVectors(charPos, bossApi.getPosition());
    const dist = toBoss.length();
    const minDist = PLAYER_COLLISION_RADIUS + bossApi.getHitboxRadius();
    if (dist < minDist && dist > 0.001) {
      const overlap = minDist - dist;
      toBoss.normalize();
      collisionPushVec.addScaledVector(toBoss, overlap);
    }
  }

  if (trainingDummyAlive) {
    const toDummy = new THREE.Vector3().subVectors(charPos, trainingDummyWorldPos);
    toDummy.y = 0;
    const dist = toDummy.length();
    const minDist = PLAYER_COLLISION_RADIUS + TRAINING_DUMMY_SIZE * 0.55;
    if (dist < minDist && dist > 0.001) {
      const overlap = minDist - dist;
      toDummy.normalize();
      collisionPushVec.addScaledVector(toDummy, overlap);
    }
  }

  // Apply push to player
  if (collisionPushVec.lengthSq() > 0.0001) {
    character.position.addScaledVector(collisionPushVec, COLLISION_PUSH_STRENGTH * dt);
  }
}

function updateAutoAttack(dt: number, gameTime: number): void {
  if (attackTarget === null) return;

  if (attackTarget.type === 'training_dummy') {
    if (!trainingDummyAlive) {
      attackTarget = null;
      return;
    }
    if (isAtTrainingDummyMeleeStand()) {
      return;
    }
    if (!isTileMovementActive()) {
      pathToClosestOrthTileTowardDummy();
    }
    return;
  }

  // Get target position based on type
  let targetPos: THREE.Vector3 | null = null;
  let isAlive = false;
  
  if (attackTarget.type === 'enemy') {
    if (attackTarget.index >= ENEMY_COUNT || !enemyAlive[attackTarget.index]) {
      attackTarget = null;
      return;
    }
    targetPos = enemyPositions[attackTarget.index];
    isAlive = enemyAlive[attackTarget.index];
  } else if (attackTarget.type === 'caster') {
    if (attackTarget.index >= CASTER_COUNT || !casterAlive[attackTarget.index]) {
      attackTarget = null;
      return;
    }
    targetPos = casterLogicalPos[attackTarget.index];
    isAlive = casterAlive[attackTarget.index];
  } else if (attackTarget.type === 'resurrector') {
    if (attackTarget.index >= RESURRECTOR_COUNT || !resurrectorAlive[attackTarget.index]) {
      attackTarget = null;
      return;
    }
    targetPos = resurrectorLogicalPos[attackTarget.index];
    isAlive = resurrectorAlive[attackTarget.index];
  } else if (attackTarget.type === 'teleporter') {
    if (attackTarget.index >= teleportersApi.getCount() || !teleportersApi.isAlive(attackTarget.index)) {
      attackTarget = null;
      return;
    }
    targetPos = teleportersApi.getPosition(attackTarget.index);
    isAlive = teleportersApi.isAlive(attackTarget.index);
  } else if (attackTarget.type === 'boss') {
    if (!bossApi.isAlive()) {
      attackTarget = null;
      return;
    }
    targetPos = bossApi.getPosition();
    isAlive = bossApi.isAlive();
  } else if (attackTarget.type === 'pen_rat') {
    if (attackTarget.index >= PEN_RAT_COUNT) {
      attackTarget = null;
      return;
    }
    const pr = penRatNpcs[attackTarget.index];
    if (!pr.alive || !pr.attackable) {
      attackTarget = null;
      return;
    }
    targetPos = pr.position;
    isAlive = pr.alive;
  } else if (attackTarget.type === 'server_wildlife') {
    const rows = serverWildlifeRuntime.getCombatRows(gameTime);
    const row = rows[attackTarget.index];
    if (!row || row.entityId !== attackTarget.serverEntityId) {
      attackTarget = null;
      return;
    }
    targetPos = row.position;
    isAlive = row.alive;
  } else if (attackTarget.type === 'starting_wildlife') {
    if (attackTarget.index >= wildlifeNpcs.length) {
      attackTarget = null;
      return;
    }
    const wn = wildlifeNpcs[attackTarget.index];
    if (!wn.alive || !wn.attackable) {
      attackTarget = null;
      return;
    }
    targetPos = wn.position;
    isAlive = wn.alive;
  }

  if (!isAlive || !targetPos) {
    attackTarget = null;
    return;
  }

  const pCenter = getPlayerLogicalWorldTileCenter();
  const dx = targetPos.x - pCenter.x;
  const dz = targetPos.z - pCenter.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  
  // Calculate effective melee range (accounting for target size)
  let effectiveMeleeRange = MELEE_RANGE;
  if (attackTarget.type === 'boss') {
    // For boss, melee range is measured from the boss's circular hitbox edge
    effectiveMeleeRange = bossApi.getHitboxRadius() + MELEE_RANGE;
  } else if (attackTarget.type === 'enemy') {
    effectiveMeleeRange = ENEMY_COLLISION_RADIUS + MELEE_RANGE;
  } else if (attackTarget.type === 'caster') {
    effectiveMeleeRange = CASTER_COLLISION_RADIUS + MELEE_RANGE;
  } else if (attackTarget.type === 'resurrector') {
    effectiveMeleeRange = RESURRECTOR_COLLISION_RADIUS + MELEE_RANGE;
  } else if (attackTarget.type === 'teleporter') {
    effectiveMeleeRange = TELEPORTER_SIZE / 2 + MELEE_RANGE;
  } else if (attackTarget.type === 'pen_rat') {
    effectiveMeleeRange = PEN_RAT_COLLISION_RADIUS + MELEE_RANGE;
  } else if (attackTarget.type === 'starting_wildlife') {
    effectiveMeleeRange = wildlifeNpcs[attackTarget.index]!.collisionRadius + MELEE_RANGE;
  } else if (attackTarget.type === 'server_wildlife') {
    const rows = serverWildlifeRuntime.getCombatRows(gameTime);
    const row = rows[attackTarget.index];
    effectiveMeleeRange = (row?.hitRadius ?? MELEE_RANGE) + MELEE_RANGE;
  }

  // If in melee range, attack
  if (dist <= effectiveMeleeRange) {
    const targetDir = new THREE.Vector3(dx, 0, dz).normalize();
    playerLogicalHitOrigin.set(pCenter.x, 0, pCenter.z);
    performMeleeAttack(gameTime, targetDir, playerLogicalHitOrigin);
    // Melee may kill the target synchronously (combat callbacks clear `attackTarget`).
    if (attackTarget === null) return;
    // Keep tile movement so the avatar keeps lerping while the swing plays on the mesh.
    // Check if target died from the attack
    if (attackTarget.type === 'enemy' && !enemyAlive[attackTarget.index]) {
      attackTarget = null;
    } else if (attackTarget.type === 'caster' && !casterAlive[attackTarget.index]) {
      attackTarget = null;
    } else if (attackTarget.type === 'resurrector' && !resurrectorAlive[attackTarget.index]) {
      attackTarget = null;
    } else if (attackTarget.type === 'teleporter' && !teleportersApi.isAlive(attackTarget.index)) {
      attackTarget = null;
    } else if (attackTarget.type === 'boss' && !bossApi.isAlive()) {
      attackTarget = null;
    } else if (attackTarget.type === 'pen_rat' && !penRatNpcs[attackTarget.index].alive) {
      attackTarget = null;
    } else if (
      attackTarget.type === 'starting_wildlife' &&
      !wildlifeNpcs[attackTarget.index]!.alive
    ) {
      attackTarget = null;
    } else if (attackTarget.type === 'server_wildlife') {
      const rows = serverWildlifeRuntime.getCombatRows(gameTime);
      const row = rows[attackTarget.index];
      if (!row || row.entityId !== attackTarget.serverEntityId) {
        attackTarget = null;
      }
    }
  } else {
    // Bow: if in bow range, request arrow shot and stop moving
    const hasBow = equipment.getWeapon() === 'bow';
    if (hasBow && dist <= BOW_RANGE && gameTime - lastBowAttackTime >= BOW_COOLDOWN) {
      pendingBowShotTarget = targetPos.clone();
      lastBowAttackTime = gameTime;
      clearTileMovement();
      return;
    }
    // Only run toward the enemy when outside range. If we're already too close (dist <= stopDistance),
    // the computed position would be behind us and the character would run away — so don't path.
    const stopDistance = hasBow
      ? BOW_RANGE - 0.1
      : effectiveMeleeRange - 0.1;
    if (dist > stopDistance && !isTileMovementActive()) {
      const dirToTarget = new THREE.Vector3(dx, 0, dz).normalize();
      beginTilePathToWorldGoal(
        targetPos.x - dirToTarget.x * stopDistance,
        targetPos.z - dirToTarget.z * stopDistance
      );
    }
  }
}

/** Returns current world position of attack target, or null if none/invalid. */
function getTargetPosition(): THREE.Vector3 | null {
  if (attackTarget === null) return null;
  if (attackTarget.type === 'training_dummy') {
    if (!trainingDummyAlive) return null;
    return trainingDummyWorldPos.clone();
  }
  if (attackTarget.type === 'enemy') {
    if (attackTarget.index >= ENEMY_COUNT || !enemyAlive[attackTarget.index]) return null;
    return enemyPositions[attackTarget.index];
  }
  if (attackTarget.type === 'caster') {
    if (attackTarget.index >= CASTER_COUNT || !casterAlive[attackTarget.index]) return null;
    return casterLogicalPos[attackTarget.index].clone();
  }
  if (attackTarget.type === 'resurrector') {
    if (attackTarget.index >= RESURRECTOR_COUNT || !resurrectorAlive[attackTarget.index]) return null;
    return resurrectorLogicalPos[attackTarget.index].clone();
  }
  if (attackTarget.type === 'teleporter') {
    if (attackTarget.index >= teleportersApi.getCount() || !teleportersApi.isAlive(attackTarget.index)) return null;
    return teleportersApi.getPosition(attackTarget.index).clone();
  }
  if (attackTarget.type === 'boss') {
    if (!bossApi.isAlive()) return null;
    return bossApi.getPosition().clone();
  }
  if (attackTarget.type === 'pen_rat') {
    if (attackTarget.index >= PEN_RAT_COUNT) return null;
    const pr = penRatNpcs[attackTarget.index];
    if (!pr.alive || !pr.attackable) return null;
    return pr.position.clone();
  }
  if (attackTarget.type === 'starting_wildlife') {
    if (attackTarget.index >= wildlifeNpcs.length) return null;
    const wn = wildlifeNpcs[attackTarget.index];
    if (!wn.alive || !wn.attackable) return null;
    return wn.position.clone();
  }
  if (attackTarget.type === 'server_wildlife') {
    const rows = serverWildlifeRuntime.getCombatRows(gameTime);
    const row = rows[attackTarget.index];
    if (!row || row.entityId !== attackTarget.serverEntityId) return null;
    return row.position.clone();
  }
  return null;
}

const enemyAlive = Array.from({ length: ENEMY_COUNT }, () => false);

// Enemy health (grunts) and damage (base values; scaled by stats)
const MAX_ENEMY_HEALTH = 30;
const enemyHealth = Array(ENEMY_COUNT).fill(MAX_ENEMY_HEALTH);
const BASE_RANGED_DAMAGE = 18;
const BASE_SWORD_DAMAGE = 12;

function getMeleeDamage(): number {
  return Math.round(BASE_SWORD_DAMAGE * (strength / 10));
}

// Player melee attack (Space): directional slash in front, cooldown
const MELEE_RANGE = 2.0;
const MELEE_ARC = Math.PI / 3; // 60 degree arc in front
const MELEE_COOLDOWN = 0.55;
let lastMeleeTime = -999;

function performMeleeAttack(gameTime: number, targetDirection?: THREE.Vector3, hitOrigin?: THREE.Vector3): void {
  if (gameTime - lastMeleeTime < MELEE_COOLDOWN) return;
  lastMeleeTime = gameTime;
  const state = buildCombatState();
  let origin: THREE.Vector3 | null = hitOrigin ?? null;
  if (origin === null && isTileMovementActive()) {
    const pc = getPlayerLogicalWorldTileCenter();
    playerLogicalHitOrigin.set(pc.x, 0, pc.z);
    origin = playerLogicalHitOrigin;
  }
  swordApi.performMeleeAttack(gameTime, targetDirection ?? null, state, origin);
}

/** Bow arrows: damage scaled by dexterity. */
function getRangedDamage(): number {
  return Math.round(BASE_RANGED_DAMAGE * (dexterity / 10));
}

// Bow: shoots at attack target when in range (equipped weapon)
const BOW_RANGE = 18;
const BOW_COOLDOWN = 0.85;
let lastBowAttackTime = -999;
let pendingBowShotTarget: THREE.Vector3 | null = null;

/** Returns true if the enemy died. */
function damageRedCube(j: number, amount: number): boolean {
  hitMarkers.createPlayerHitMarker(enemyPositions[j], amount);
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

function spawnPenRatLoot(pos: THREE.Vector3): void {
  const b = pos.clone();
  b.y = 0.2;
  b.x += (Math.random() - 0.5) * 0.4;
  b.z += (Math.random() - 0.5) * 0.4;
  groundItemsApi.spawn(b, 'bones');
  const m = pos.clone();
  m.y = 0.2;
  m.x += (Math.random() - 0.5) * 0.4;
  m.z += (Math.random() - 0.5) * 0.4;
  groundItemsApi.spawn(m, 'raw_meat');
}

/** Returns true if the rat died. */
function damagePenRat(index: number, amount: number): boolean {
  if (index < 0 || index >= PEN_RAT_COUNT) return false;
  const npc = penRatNpcs[index];
  if (!npc.alive || !npc.attackable) return false;
  hitMarkers.createPlayerHitMarker(npc.position.clone(), amount);
  npc.health = Math.max(0, npc.health - amount);
  if (npc.health <= 0) {
    addXp(XP_PEN_RAT);
    spawnPenRatLoot(npc.position.clone());
    npc.alive = false;
    npc.lurchStartGameTime = -1;
    const rat = penRatGroup.children[index] as THREE.Group;
    if (rat) rat.position.y = -1000;
    if (attackTarget !== null && attackTarget.type === 'pen_rat' && attackTarget.index === index) {
      attackTarget = null;
    }
    return true;
  }
  return false;
}

function spawnStartingWildlifeLoot(index: number, pos: THREE.Vector3): void {
  const scatter = (spread: number) => {
    const p = pos.clone();
    p.y = 0.2;
    p.x += (Math.random() - 0.5) * spread;
    p.z += (Math.random() - 0.5) * spread;
    return p;
  };
  groundItemsApi.spawn(scatter(0.45), 'bones');
  if (wildlifeKindAt(index) === 'bear') {
    groundItemsApi.spawn(scatter(0.45), 'raw_meat');
  }
  trySpawnDrop(pos.clone(), wildlifeKindAt(index) === 'spider' ? 'spider' : 'bear');
}

function serverWildlifeTemplateDropType(templateKey: string): MonsterType {
  if (templateKey === 'bear') return 'bear';
  if (templateKey === 'rat') return 'rat';
  return 'spider';
}

function spawnServerWildlifeLootAt(templateKey: string, pos: THREE.Vector3): void {
  const scatter = (spread: number) => {
    const p = pos.clone();
    p.y = 0.2;
    p.x += (Math.random() - 0.5) * spread;
    p.z += (Math.random() - 0.5) * spread;
    return p;
  };
  groundItemsApi.spawn(scatter(0.45), 'bones');
  if (templateKey === 'bear') {
    groundItemsApi.spawn(scatter(0.45), 'raw_meat');
  }
  trySpawnDrop(pos.clone(), serverWildlifeTemplateDropType(templateKey));
}

/** Returns true if the mob died. */
function damageStartingWildlife(index: number, amount: number): boolean {
  if (index < 0 || index >= wildlifeNpcs.length) return false;
  const npc = wildlifeNpcs[index];
  if (!npc.alive || !npc.attackable) return false;
  hitMarkers.createPlayerHitMarker(npc.position.clone(), amount);
  npc.health = Math.max(0, npc.health - amount);
  if (npc.health <= 0) {
    addXp(wildlifeKindAt(index) === 'spider' ? XP_SPIDER : XP_BEAR);
    spawnStartingWildlifeLoot(index, npc.position.clone());
    npc.alive = false;
    npc.lurchStartGameTime = -1;
    const mob = startingWildlifeGroup.children[index] as THREE.Group;
    if (mob) mob.position.y = -1000;
    if (
      attackTarget !== null &&
      attackTarget.type === 'starting_wildlife' &&
      attackTarget.index === index
    ) {
      attackTarget = null;
    }
    return true;
  }
  return false;
}

// Grunts path on the game tick toward the player; mesh lerps within each tick (see TickClock).
const ENEMY_EXPLOSION_RADIUS = 2.2;      // explosion damages player within this radius
const ENEMY_EXPLOSION_RANGE = ENEMY_EXPLOSION_RADIUS * 0.8; // stop moving when within 80% of attack radius
const ENEMY_EXPLOSION_DELAY = 0.9;       // seconds standing still before exploding
const ENEMY_EXPLOSION_COOLDOWN = 1.4;    // seconds after exploding before can charge again
const ENEMY_DAMAGE = 8;                  // damage when player is in explosion radius

type EnemyExplosionState = 'moving' | 'charging' | 'cooldown';
const enemyExplosionState: EnemyExplosionState[] = Array(ENEMY_COUNT).fill('moving');
const enemyExplosionChargeStart: number[] = Array(ENEMY_COUNT).fill(-999);
const enemyExplosionLastTime: number[] = Array(ENEMY_COUNT).fill(-999);

// Visual effect when a block enemy explodes (expanding ring at explosion center)
const ENEMY_ATTACK_EFFECT_DURATION = 0.5;
interface EnemyAttackHitEffect {
  mesh: THREE.Mesh;
  spawnTime: number;
}
const enemyAttackHitEffects: EnemyAttackHitEffect[] = [];
const enemyAttackHitGroup = new THREE.Group();
scene.add(enemyAttackHitGroup);

function createEnemyAttackHitEffect(position: THREE.Vector3): EnemyAttackHitEffect {
  // Ring size matches ENEMY_EXPLOSION_RADIUS so visual = hit radius
  const inner = ENEMY_EXPLOSION_RADIUS * 0.25;
  const outer = ENEMY_EXPLOSION_RADIUS;
  const geometry = new THREE.RingGeometry(inner, outer, 24);
  const material = new THREE.MeshBasicMaterial({
    color: 0xc03030,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.position.y = 0.5;
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(0.2); // starts small, expands to 1 = full hit radius
  enemyAttackHitGroup.add(mesh);
  return { mesh, spawnTime: gameTime };
}

function createPlayerMeleeSlashEffect(position: THREE.Vector3, direction: THREE.Vector3): EnemyAttackHitEffect {
  // Create a slash effect - an arc/arc shape in front of the character
  const slashLength = MELEE_RANGE;
  const slashWidth = 0.4;
  const geometry = new THREE.PlaneGeometry(slashLength, slashWidth);
  const material = new THREE.MeshBasicMaterial({
    color: 0xe8c050,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.position.y = 0.5;
  
  // Rotate to face the attack direction
  const angle = Math.atan2(direction.x, direction.z);
  mesh.rotation.y = angle;
  mesh.rotation.x = -Math.PI / 2;
  
  // Position at the front of the character
  mesh.position.x += direction.x * (slashLength / 2);
  mesh.position.z += direction.z * (slashLength / 2);
  
  enemyAttackHitGroup.add(mesh);
  return { mesh, spawnTime: gameTime };
}

function updateEnemyAttackHitEffects(now: number): void {
  for (let i = enemyAttackHitEffects.length - 1; i >= 0; i--) {
    const eff = enemyAttackHitEffects[i];
    const age = now - eff.spawnTime;
    if (age >= ENEMY_ATTACK_EFFECT_DURATION) {
      enemyAttackHitGroup.remove(eff.mesh);
      (eff.mesh.geometry as THREE.BufferGeometry).dispose();
      (eff.mesh.material as THREE.Material).dispose();
      enemyAttackHitEffects.splice(i, 1);
      continue;
    }
    const t = age / ENEMY_ATTACK_EFFECT_DURATION;
    const mat = eff.mesh.material as THREE.MeshBasicMaterial;
    
    // Check if it's a slash (PlaneGeometry) or ring (RingGeometry)
    if (eff.mesh.geometry instanceof THREE.PlaneGeometry) {
      // Slash effect: fade out and move forward slightly
      mat.opacity = 0.9 * (1 - t);
      // Slight forward movement for slash effect
      const forward = new THREE.Vector3(
        Math.sin(eff.mesh.rotation.y),
        0,
        Math.cos(eff.mesh.rotation.y)
      );
      eff.mesh.position.addScaledVector(forward, 0.3 * t);
    } else {
      // Ring effect (enemy explosions): expand
      const scale = 0.2 + 0.8 * t;
      eff.mesh.scale.setScalar(scale);
      mat.opacity = 0.9 * (1 - t);
    }
  }
}

// Collision/decluttering constants
const PLAYER_COLLISION_RADIUS = 0.5;
const ENEMY_COLLISION_RADIUS = ENEMY_SIZE / 2;
const CASTER_COLLISION_RADIUS = CASTER_SIZE / 2;
const RESURRECTOR_COLLISION_RADIUS = RESURRECTOR_SIZE / 2;
const COLLISION_PUSH_STRENGTH = 8.0; // How strongly entities push each other apart

const enemyPositions = Array.from({ length: ENEMY_COUNT }, () => new THREE.Vector3());
/** Grunts: authoritative tile for gameplay; mesh lerps between visFrom → visTo each tick. */
const enemyLogicalTile: GridTile[] = Array.from({ length: ENEMY_COUNT }, () => ({ x: 0, z: 0 }));
const enemyVisFrom: { x: number; z: number }[] = Array.from({ length: ENEMY_COUNT }, () => ({ x: 0, z: 0 }));
const enemyVisTo: { x: number; z: number }[] = Array.from({ length: ENEMY_COUNT }, () => ({ x: 0, z: 0 }));
const collisionPushVec = new THREE.Vector3();

// Wave system: composition and spawn positions in Waves.ts; clear/spawn via callback
const tempSpawnPos = new THREE.Vector3();
const waveSpawnOut = { x: 0, y: 0, z: 0 };

const waves = createWaves({
  onStartWave(wave, composition, getSpawnPosition) {
    const { grunts, casters, resurrectors, teleporters } = composition;
    attackTarget = null;
    clearTileMovement();

    for (let j = 0; j < ENEMY_COUNT; j++) killEnemyInstance(enemies, j);
    for (let c = 0; c < CASTER_COUNT; c++) {
      casterGroup.remove(casterMeshes[c]);
      casterAlive[c] = false;
    }
    for (let r = 0; r < RESURRECTOR_COUNT; r++) {
      resurrectorGroup.remove(resurrectorMeshes[r]);
      resurrectorAlive[r] = false;
    }
    teleportersApi.clear();

    const anyNpcs = grunts + casters + resurrectors + teleporters > 0;
    if (wave >= 1 && anyNpcs) {
      bossApi.spawn();
      addChatMessage('Boss has appeared!');
    }

    for (let j = 0; j < grunts; j++) {
      getSpawnPosition(j, waveSpawnOut);
      const gt = worldXZToTile(waveSpawnOut.x, waveSpawnOut.z);
      enemyLogicalTile[j].x = gt.x;
      enemyLogicalTile[j].z = gt.z;
      const gcz = tileCenterXZ(gt);
      enemyVisFrom[j].x = gcz.x;
      enemyVisFrom[j].z = gcz.z;
      enemyVisTo[j].x = gcz.x;
      enemyVisTo[j].z = gcz.z;
      tempSpawnPos.set(gcz.x, ENEMY_SIZE / 2, gcz.z);
      resurrectEnemyInstance(enemies, j, tempSpawnPos);
      enemyAlive[j] = true;
      enemyHealth[j] = MAX_ENEMY_HEALTH;
      enemyPositions[j].copy(tempSpawnPos);
      lastEnemyDamageTime[j] = -999;
      enemyExplosionState[j] = 'moving';
      enemyExplosionChargeStart[j] = -999;
      enemyExplosionLastTime[j] = -999;
    }

    for (let c = 0; c < casters; c++) {
      getSpawnPosition(100 + c, waveSpawnOut);
      const ct = worldXZToTile(waveSpawnOut.x, waveSpawnOut.z);
      casterLogicalTile[c].x = ct.x;
      casterLogicalTile[c].z = ct.z;
      const ccz = tileCenterXZ(ct);
      casterVisFrom[c].x = ccz.x;
      casterVisFrom[c].z = ccz.z;
      casterVisTo[c].x = ccz.x;
      casterVisTo[c].z = ccz.z;
      casterLogicalPos[c].set(ccz.x, CASTER_SIZE / 2, ccz.z);
      casterMeshes[c].position.copy(casterLogicalPos[c]);
      casterGroup.add(casterMeshes[c]);
      casterAlive[c] = true;
      casterHealth[c] = MAX_CASTER_HEALTH;
      lastCasterThrowTime[c] = -999;
      lastCasterResurrectTime[c] = -999;
    }

    for (let r = 0; r < resurrectors; r++) {
      getSpawnPosition(200 + r, waveSpawnOut);
      const rt = worldXZToTile(waveSpawnOut.x, waveSpawnOut.z);
      resurrectorLogicalTile[r].x = rt.x;
      resurrectorLogicalTile[r].z = rt.z;
      const rcz = tileCenterXZ(rt);
      resurrectorVisFrom[r].x = rcz.x;
      resurrectorVisFrom[r].z = rcz.z;
      resurrectorVisTo[r].x = rcz.x;
      resurrectorVisTo[r].z = rcz.z;
      resurrectorLogicalPos[r].set(rcz.x, RESURRECTOR_SIZE / 2, rcz.z);
      resurrectorMeshes[r].position.copy(resurrectorLogicalPos[r]);
      resurrectorGroup.add(resurrectorMeshes[r]);
      resurrectorAlive[r] = true;
      resurrectorHealth[r] = MAX_RESURRECTOR_HEALTH;
      lastResurrectorResurrectTime[r] = -999;
    }

    teleportersApi.spawn(teleporters, (t) => {
      getSpawnPosition(300 + t, waveSpawnOut);
      return new THREE.Vector3(waveSpawnOut.x, TELEPORTER_SIZE / 2, waveSpawnOut.z);
    });

    for (let j = 0; j < ENEMY_COUNT; j++) {
      const enemy = enemies.children[j] as THREE.Object3D;
      if (enemy) {
        enemy.position.set(enemyPositions[j].x, ENEMY_SIZE / 2, enemyPositions[j].z);
      }
    }
    // Wave display updated by HUD each frame
  },
});

// Combat state snapshot for Sword and Projectiles (built each frame)
function buildCombatState(): CombatState {
  const serverRows =
    useSpacetimeMp && spacetimeSessionReady ? serverWildlifeRuntime.getCombatRows(gameTime) : null;
  return {
    enemyPositions,
    enemyAlive,
    casterPositions: casterLogicalPos,
    casterAlive,
    resurrectorPositions: resurrectorLogicalPos,
    resurrectorAlive,
    teleporterPositions: teleportersApi.getPositions(),
    teleporterAlive: teleportersApi.getAlive(),
    bossPosition: bossApi.getPosition(),
    bossAlive: bossApi.isAlive(),
    penRatPositions: penRatNpcs.map((n) => n.position),
    penRatAlive: penRatNpcs.map((n) => n.alive),
    penRatAttackable: penRatNpcs.map((n) => n.attackable),
    wildlifePositions: serverRows
      ? serverRows.map((r) => r.position)
      : wildlifeNpcs.map((n) => n.position),
    wildlifeAlive: serverRows ? serverRows.map(() => true) : wildlifeNpcs.map((n) => n.alive),
    wildlifeAttackable: serverRows
      ? serverRows.map((r) => r.attackable)
      : wildlifeNpcs.map((n) => n.attackable),
    wildlifeHitRadius: serverRows
      ? serverRows.map((r) => r.hitRadius)
      : wildlifeNpcs.map((n) => n.collisionRadius),
    enemySize: ENEMY_SIZE,
    casterSize: CASTER_SIZE,
    resurrectorSize: RESURRECTOR_SIZE,
    teleporterSize: TELEPORTER_SIZE,
    penRatSize: PEN_RAT_SIZE,
    bossHitboxRadius: bossApi.getHitboxRadius(),
  };
}

function damageWildlifeUnified(index: number, amount: number): boolean {
  if (useSpacetimeMp && spacetimeSessionReady) {
    const rows = serverWildlifeRuntime.getCombatRows(gameTime);
    const row = rows[index];
    if (!row) return false;
    hitMarkers.createPlayerHitMarker(row.position.clone(), amount);
    const c = multiplayerClient;
    if (c instanceof SpacetimeMultiplayerClient) {
      c.attackServerNpc(row.entityId, amount);
    }
    return false;
  }
  return damageStartingWildlife(index, amount);
}

const combatCallbacks = {
  damageEnemy: damageRedCube,
  damageCaster,
  damageResurrector,
  damageTeleporter: (t: number, amount: number) => teleportersApi.damage(t, amount),
  damageBoss: (amount: number) => bossApi.damage(amount),
  damagePenRat: damagePenRat,
  damageWildlife: damageWildlifeUnified,
};

const swordApi = createSword(scene, character, {
  getEquippedWeapon: () => equipment.getWeapon(),
  getMeleeDamage,
}, combatCallbacks);

function rollTrainingDummyMeleeDamage(): number {
  const maxHit = Math.max(1, getMeleeDamage());
  return 1 + Math.floor(Math.random() * maxHit);
}

function damageTrainingDummy(amount: number): void {
  if (!trainingDummyAlive) return;
  hitMarkers.createPlayerHitMarker(trainingDummyWorldPos.clone(), amount);
  trainingDummyHealth = Math.max(0, trainingDummyHealth - amount);
  if (trainingDummyHealth <= 0) {
    trainingDummyAlive = false;
    trainingDummyGroup.visible = false;
    if (attackTarget !== null && attackTarget.type === 'training_dummy') attackTarget = null;
  }
}

function performTrainingDummyMelee(gameTime: number, targetDir: THREE.Vector3): void {
  swordApi.startMeleeSwing(gameTime);
  character.rotation.y = Math.atan2(targetDir.x, targetDir.z);
  damageTrainingDummy(rollTrainingDummyMeleeDamage());
}

const arrowsApi = createArrows(scene, { getRangedDamage }, combatCallbacks);

function isAnyEnemyAlive(): boolean {
  const grunts = waves.getLevelGruntsCount();
  const casters = waves.getLevelCastersCount();
  const resurrectors = waves.getLevelResurrectorsCount();
  const teleporters = waves.getLevelTeleportersCount();
  for (let j = 0; j < grunts; j++) if (enemyAlive[j]) return true;
  for (let c = 0; c < casters; c++) if (casterAlive[c]) return true;
  for (let r = 0; r < resurrectors; r++) if (resurrectorAlive[r]) return true;
  for (let t = 0; t < teleporters; t++) if (teleportersApi.isAlive(t)) return true;
  if (bossApi.isAlive()) return true;
  return false;
}

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

// Drop tables & pickups (mana orbs from dead monsters; coins use ground items)
const PICKUP_RADIUS = 0.9;
const MANA_ORB_VALUE = 12;

interface Pickup {
  mesh: THREE.Mesh;
}

const pickupsGroup = new THREE.Group();
scene.add(pickupsGroup);
const pickups: Pickup[] = [];

function trySpawnDrop(position: THREE.Vector3, monsterType: MonsterType): void {
  const drop = rollDrop(monsterType);
  if (!drop) return;
  if (drop === 'coin') {
    groundItemsApi.spawn(position.clone(), 'coin');
    return;
  }
  createManaPickup(position);
}

function createManaPickup(position: THREE.Vector3): void {
  const geometry = new THREE.SphereGeometry(0.25, 10, 8);
  const material = new THREE.MeshStandardMaterial({
    color: 0x5080c0,
    emissive: 0x204060,
    emissiveIntensity: 0.4,
    roughness: 0.4,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.position.y = 0.35;
  mesh.castShadow = true;
  pickupsGroup.add(mesh);
  pickups.push({ mesh });
}

function updatePickups(dt: number): void {
  const charPos = character.position;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const dist = p.mesh.position.distanceTo(charPos);
    if (dist < PICKUP_RADIUS) {
      setMana(mana + MANA_ORB_VALUE);
      pickupsGroup.remove(p.mesh);
      (p.mesh.geometry as THREE.BufferGeometry).dispose();
      (p.mesh.material as THREE.Material).dispose();
      pickups.splice(i, 1);
    }
  }
}

bossApi = createBoss(scene, {
  getPlayerPosition: () => character.position,
  applyDamageToPlayer: (amount, damageType) => {
    if (!isDamageBlocked(damageType)) setHealth(health - amount);
  },
  setPlayerBurning: () => {
    playerBurning = true;
    playerBurnStartTime = gameTime;
    lastBurnTickTime = gameTime;
  },
  onCreateHitMarker: hitMarkers.createPlayerHitMarker,
  onDeath: (position) => {
    addXp(XP_BOSS);
    trySpawnDrop(position, 'resurrector');
  },
  addExplosionEffect: (position) => {
    enemyAttackHitEffects.push(createEnemyAttackHitEffect(position));
  },
});

teleportersApi = createTeleporters(scene, {
  onCreateHitMarker: hitMarkers.createPlayerHitMarker,
  onDeath: (_index, position) => {
    addXp(XP_TELEPORTER);
    trySpawnDrop(position, 'teleporter');
  },
  addIncomingPoisonPool: (position, gameTime) => {
    poisonPoolsApi.addIncomingPool(position, gameTime);
  },
});

const minimap = createMinimap(container);

function collectMinimapNpcYellow(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const pr of penRatNpcs) {
    if (pr.alive) out.push({ x: pr.position.x, z: pr.position.z });
  }
  for (const w of wildlifeNpcs) {
    if (w.alive) out.push({ x: w.position.x, z: w.position.z });
  }
  if (trainingDummyAlive) {
    out.push({ x: trainingDummyWorldPos.x, z: trainingDummyWorldPos.z });
  }
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (enemyAlive[j]) out.push({ x: enemyPositions[j].x, z: enemyPositions[j].z });
  }
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (casterAlive[c]) out.push({ x: casterLogicalPos[c].x, z: casterLogicalPos[c].z });
  }
  for (let r = 0; r < RESURRECTOR_COUNT; r++) {
    if (resurrectorAlive[r]) out.push({ x: resurrectorLogicalPos[r].x, z: resurrectorLogicalPos[r].z });
  }
  const tp = teleportersApi.getPositions();
  const ta = teleportersApi.getAlive();
  for (let t = 0; t < TELEPORTER_COUNT; t++) {
    if (ta[t]) out.push({ x: tp[t]!.x, z: tp[t]!.z });
  }
  if (bossApi.isAlive()) {
    const bp = bossApi.getPosition();
    out.push({ x: bp.x, z: bp.z });
  }
  return out;
}

clickOverlay.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (
    terrainEditPanel.isOpen() &&
    terrainEditPanel.getPrimaryTool() === 'npc_spawner' &&
    useSpacetimeMp &&
    spacetimeSessionReady
  ) {
    setRayFromCanvasClient(e.clientX, e.clientY);
    const picks = mergePickIntersections(raycaster);
    if (picks.length > 0) {
      const sid = npcSpawnerIdFromIntersection(picks[0]!);
      if (sid !== null) {
        openNpcSpawnerConfigOverlay(sid);
        return;
      }
    }
  }
  openGameContextMenu(e.clientX, e.clientY);
});

document.addEventListener('keydown', (e) => {
  if (document.activeElement === chatInputEl) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setChatOpen(false);
    }
    return;
  }
  if (e.key === 'Enter') {
    if (isTypingInOtherFormField(e.target)) return;
    if (terrainEditPanel.isOpen()) return;
    if (spacetimeLoginOverlayBlocksChat()) return;
    e.preventDefault();
    setChatOpen(true);
    return;
  }
  if (e.key === 'F4') {
    e.preventDefault();
    terrainEditPanel.toggle();
    if (terrainEditPanel.isOpen()) terrainEditPanel.refreshPalette();
    return;
  }
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    e.preventDefault();
    if (e.key === 'Escape' && terrainEditPanel.isOpen()) {
      terrainEditPanel.setOpen(false);
      return;
    }
    if (!isDead) setPaused(!isPaused);
    if (gameMenuOpen) setGameMenuOpen(false);
    return;
  }
  if (e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    if (isDead || isPaused) return;
    if (gameMenuOpen && gameMenuActiveTab === 'skills') {
      setGameMenuOpen(false);
    } else {
      setGameMenuOpen(true);
      setGameMenuTab('skills');
    }
    return;
  }
  if (e.key === 'i' || e.key === 'I') {
    e.preventDefault();
    if (gameMenuOpen) {
      setGameMenuOpen(false);
    } else if (!isDead && !isPaused) {
      setGameMenuOpen(true);
    }
    return;
  }
  if (e.key === 'q' || e.key === 'Q') {
    e.preventDefault();
    if (isDead || isPaused) return;
    const hasBow = equipment.getWeapon() === 'bow';
    if (hasBow) {
      const targetPos = getTargetPosition();
      if (targetPos) {
        const dist = character.position.distanceTo(targetPos);
        if (dist <= BOW_RANGE && gameTime - lastBowAttackTime >= BOW_COOLDOWN) {
          arrowsApi.shoot(character.position.clone(), targetPos);
          lastBowAttackTime = gameTime;
        }
      }
    }
  }
  if (e.key === ' ') {
    e.preventDefault();
    if (!isDead && !isPaused) performMeleeAttack(gameTime);
  }
});

function reviveGruntFromCorpse(enemyIndex: number, corpseWorld: THREE.Vector3): void {
  const gt = worldXZToTile(corpseWorld.x, corpseWorld.z);
  enemyLogicalTile[enemyIndex].x = gt.x;
  enemyLogicalTile[enemyIndex].z = gt.z;
  const gcz = tileCenterXZ(gt);
  enemyVisFrom[enemyIndex].x = gcz.x;
  enemyVisFrom[enemyIndex].z = gcz.z;
  enemyVisTo[enemyIndex].x = gcz.x;
  enemyVisTo[enemyIndex].z = gcz.z;
  enemyPositions[enemyIndex].set(gcz.x, ENEMY_SIZE / 2, gcz.z);
  resurrectEnemyInstance(enemies, enemyIndex, enemyPositions[enemyIndex]);
}

function updateCasters(_dt: number, gameTime: number): void {
  const charPos = character.position;
  const tickAlpha = tickClock.getTickAlpha();
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (!casterAlive[c]) continue;
    const pos = casterLogicalPos[c];

    if (gameTime - lastCasterResurrectTime[c] >= RESURRECT_COOLDOWN && bodies.length > 0) {
      let nearestIdx = -1;
      let nearestDist = RESURRECT_RANGE;
      for (let b = 0; b < bodies.length; b++) {
        const body = bodies[b];
        if (body.enemyIndex >= waves.getLevelGruntsCount()) continue;
        const d = pos.distanceTo(body.position);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = b;
        }
      }
      if (nearestIdx >= 0) {
        const body = bodies[nearestIdx];
        reviveGruntFromCorpse(body.enemyIndex, body.position);
        enemyHealth[body.enemyIndex] = MAX_ENEMY_HEALTH;
        enemyAlive[body.enemyIndex] = true;
        enemyExplosionState[body.enemyIndex] = 'moving';
        enemyExplosionChargeStart[body.enemyIndex] = -999;
        enemyExplosionLastTime[body.enemyIndex] = -999;
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

    const vx = THREE.MathUtils.lerp(casterVisFrom[c].x, casterVisTo[c].x, tickAlpha);
    const vz = THREE.MathUtils.lerp(casterVisFrom[c].z, casterVisTo[c].z, tickAlpha);
    casterMeshes[c].position.set(vx, CASTER_SIZE / 2, vz);
  }
}

function updateResurrectors(_dt: number, gameTime: number): void {
  const tickAlpha = tickClock.getTickAlpha();
  for (let r = 0; r < RESURRECTOR_COUNT; r++) {
    if (!resurrectorAlive[r]) continue;
    const pos = resurrectorLogicalPos[r];

    if (gameTime - lastResurrectorResurrectTime[r] >= RESURRECT_COOLDOWN && bodies.length > 0) {
      let nearestIdx = -1;
      let nearestDist = RESURRECT_RANGE;
      for (let b = 0; b < bodies.length; b++) {
        const body = bodies[b];
        if (body.enemyIndex >= waves.getLevelGruntsCount()) continue;
        const d = pos.distanceTo(body.position);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = b;
        }
      }
      if (nearestIdx >= 0) {
        const body = bodies[nearestIdx];
        reviveGruntFromCorpse(body.enemyIndex, body.position);
        enemyHealth[body.enemyIndex] = MAX_ENEMY_HEALTH;
        enemyAlive[body.enemyIndex] = true;
        enemyExplosionState[body.enemyIndex] = 'moving';
        enemyExplosionChargeStart[body.enemyIndex] = -999;
        enemyExplosionLastTime[body.enemyIndex] = -999;
        bodiesGroup.remove(body.mesh);
        (body.mesh.geometry as THREE.BufferGeometry).dispose();
        (body.mesh.material as THREE.Material).dispose();
        bodies.splice(nearestIdx, 1);
        lastResurrectorResurrectTime[r] = gameTime;
      }
    }

    const vx = THREE.MathUtils.lerp(resurrectorVisFrom[r].x, resurrectorVisTo[r].x, tickAlpha);
    const vz = THREE.MathUtils.lerp(resurrectorVisFrom[r].z, resurrectorVisTo[r].z, tickAlpha);
    resurrectorMeshes[r].position.set(vx, RESURRECTOR_SIZE / 2, vz);
  }
}

function collectAllNpcTileKeys(): Set<number> {
  const s = new Set<number>();
  for (let ri = 0; ri < PEN_RAT_COUNT; ri++) {
    if (!penRatNpcs[ri].alive) continue;
    s.add(tileKey(penRatNpcs[ri].logicalTile));
  }
  for (let wi = 0; wi < wildlifeNpcs.length; wi++) {
    if (!wildlifeNpcs[wi].alive) continue;
    s.add(tileKey(wildlifeNpcs[wi].logicalTile));
  }
  if (useSpacetimeMp && spacetimeSessionReady) {
    for (const eid of serverWildlifeRuntime.getSortedEntityIds()) {
      const t = serverWildlifeRuntime.getLogicalTile(eid);
      if (t) s.add(tileKey(t));
    }
  }
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    s.add(tileKey(enemyLogicalTile[j]));
  }
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (!casterAlive[c]) continue;
    s.add(tileKey(casterLogicalTile[c]));
  }
  for (let r = 0; r < RESURRECTOR_COUNT; r++) {
    if (!resurrectorAlive[r]) continue;
    s.add(tileKey(resurrectorLogicalTile[r]));
  }
  return s;
}

/** One OSRS-style server tick: NPC logical tiles update; visuals catch up via lerp until the next tick. */
function processGameTick(): void {
  const charPos = character.position;
  const playerTile = getPlayerPathTile();

  let occupied = collectAllNpcTileKeys();
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    const oldTile: GridTile = { x: enemyLogicalTile[j].x, z: enemyLogicalTile[j].z };
    const pos = enemyPositions[j];
    const dx = charPos.x - pos.x;
    const dz = charPos.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const inRange = dist <= ENEMY_EXPLOSION_RANGE;

    let newTile = oldTile;
    const ok = tileKey(oldTile);
    occupied.delete(ok);
    if (!inRange && enemyExplosionState[j] === 'moving') {
      const cand = nextTileTowardGoal(oldTile, playerTile);
      if (cand && !occupied.has(tileKey(cand))) {
        newTile = cand;
        occupied.add(tileKey(cand));
      } else {
        occupied.add(ok);
      }
    } else {
      occupied.add(ok);
    }
    enemyLogicalTile[j].x = newTile.x;
    enemyLogicalTile[j].z = newTile.z;
    const o = tileCenterXZ(oldTile);
    const n = tileCenterXZ(newTile);
    enemyVisFrom[j].x = o.x;
    enemyVisFrom[j].z = o.z;
    enemyVisTo[j].x = n.x;
    enemyVisTo[j].z = n.z;
    pos.set(n.x, ENEMY_SIZE / 2, n.z);
  }

  occupied = collectAllNpcTileKeys();
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (!casterAlive[c]) continue;
    const oldTile: GridTile = { x: casterLogicalTile[c].x, z: casterLogicalTile[c].z };
    const ok = tileKey(oldTile);
    occupied.delete(ok);
    const lpos = casterLogicalPos[c];
    const dx = charPos.x - lpos.x;
    const dz = charPos.z - lpos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const ring = CASTER_PREFERRED_RANGE;
    let cand: GridTile | null = null;
    if (dist > ring + 0.45) cand = nextTileTowardGoal(oldTile, playerTile);
    else if (dist < ring - 0.45) cand = pickGreedyStepAway(oldTile, playerTile);

    let newTile = oldTile;
    if (cand && !occupied.has(tileKey(cand))) {
      newTile = cand;
      occupied.add(tileKey(cand));
    } else {
      occupied.add(tileKey(oldTile));
    }
    casterLogicalTile[c].x = newTile.x;
    casterLogicalTile[c].z = newTile.z;
    const nc = tileCenterXZ(newTile);
    lpos.set(nc.x, CASTER_SIZE / 2, nc.z);
    const o = tileCenterXZ(oldTile);
    casterVisFrom[c].x = o.x;
    casterVisFrom[c].z = o.z;
    casterVisTo[c].x = nc.x;
    casterVisTo[c].z = nc.z;
  }

  occupied = collectAllNpcTileKeys();
  for (let r = 0; r < RESURRECTOR_COUNT; r++) {
    if (!resurrectorAlive[r]) continue;
    const oldTile: GridTile = { x: resurrectorLogicalTile[r].x, z: resurrectorLogicalTile[r].z };
    const ok = tileKey(oldTile);
    occupied.delete(ok);
    const lpos = resurrectorLogicalPos[r];
    const dx = charPos.x - lpos.x;
    const dz = charPos.z - lpos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const ring = RESURRECTOR_PREFERRED_RANGE;
    let cand: GridTile | null = null;
    if (dist > ring + 0.45) cand = nextTileTowardGoal(oldTile, playerTile);
    else if (dist < ring - 0.45) cand = pickGreedyStepAway(oldTile, playerTile);

    let newTile = oldTile;
    if (cand && !occupied.has(tileKey(cand))) {
      newTile = cand;
      occupied.add(tileKey(cand));
    } else {
      occupied.add(tileKey(oldTile));
    }
    resurrectorLogicalTile[r].x = newTile.x;
    resurrectorLogicalTile[r].z = newTile.z;
    const nc = tileCenterXZ(newTile);
    lpos.set(nc.x, RESURRECTOR_SIZE / 2, nc.z);
    const o = tileCenterXZ(oldTile);
    resurrectorVisFrom[r].x = o.x;
    resurrectorVisFrom[r].z = o.z;
    resurrectorVisTo[r].x = nc.x;
    resurrectorVisTo[r].z = nc.z;
  }

  occupied = collectAllNpcTileKeys();
  const PEN_RAT_CHASE_RANGE = TILE_SIZE * 12;
  const NPC_IDLE_WANDER_CHANCE = 0.32;
  for (let ri = 0; ri < PEN_RAT_COUNT; ri++) {
    const ratNpc = penRatNpcs[ri];
    if (!ratNpc.alive) continue;
    const oldTile: GridTile = { x: ratNpc.logicalTile.x, z: ratNpc.logicalTile.z };
    const ok = tileKey(oldTile);
    occupied.delete(ok);
    const pos = ratNpc.position;
    const rdx = charPos.x - pos.x;
    const rdz = charPos.z - pos.z;
    const rdist = Math.sqrt(rdx * rdx + rdz * rdz);
    let newRTile = oldTile;
    const chasing = ratNpc.aggressive && rdist < PEN_RAT_CHASE_RANGE;
    if (chasing) {
      // OSRS-style: path onto a tile orthogonally adjacent to the player, never onto the player's tile.
      if (areOrthogonallyAdjacent(oldTile, playerTile)) {
        occupied.add(ok);
      } else {
        const approachTile = findClosestReachableOrthAdjacentTile(oldTile, playerTile);
        if (approachTile !== null) {
          const rcand = nextTileTowardGoal(oldTile, approachTile);
          if (rcand && !occupied.has(tileKey(rcand))) {
            newRTile = rcand;
            occupied.add(tileKey(rcand));
          } else {
            occupied.add(ok);
          }
        } else {
          occupied.add(ok);
        }
      }
    } else {
      const w = ratNpc.tryIdleWanderStep(oldTile, occupied, Math.random, NPC_IDLE_WANDER_CHANCE);
      if (w) {
        newRTile = w;
        occupied.add(tileKey(w));
      } else {
        occupied.add(ok);
      }
    }
    ratNpc.commitTileStep(newRTile, oldTile);
  }

  if (!useSpacetimeMp) {
    occupied = collectAllNpcTileKeys();
    for (let wi = 0; wi < wildlifeNpcs.length; wi++) {
      const wildNpc = wildlifeNpcs[wi];
      if (!wildNpc.alive) continue;
      const oldTile: GridTile = { x: wildNpc.logicalTile.x, z: wildNpc.logicalTile.z };
      const ok = tileKey(oldTile);
      occupied.delete(ok);
      let newRTile = oldTile;
      const wildlifeAggroDist = Math.max(
        Math.abs(oldTile.x - playerTile.x),
        Math.abs(oldTile.z - playerTile.z)
      );
      const wildlifeChasing =
        wildNpc.aggressive && wildlifeAggroDist <= STARTING_WILDLIFE_AGGRO_TILES;
      if (wildlifeChasing) {
        if (areOrthogonallyAdjacent(oldTile, playerTile)) {
          occupied.add(ok);
        } else {
          const approachTile = findClosestReachableOrthAdjacentTile(oldTile, playerTile);
          if (approachTile !== null) {
            const rcand = nextTileTowardGoal(oldTile, approachTile);
            if (rcand && !occupied.has(tileKey(rcand))) {
              newRTile = rcand;
              occupied.add(tileKey(rcand));
            } else {
              occupied.add(ok);
            }
          } else {
            occupied.add(ok);
          }
        }
      } else {
        const w = wildNpc.tryIdleWanderStep(oldTile, occupied, Math.random, NPC_IDLE_WANDER_CHANCE);
        if (w) {
          newRTile = w;
          occupied.add(tileKey(w));
        } else {
          occupied.add(ok);
        }
      }
      wildNpc.commitTileStep(newRTile, oldTile);
    }
  }

  processPlayerPathTick();

  if (
    attackTarget !== null &&
    attackTarget.type === 'training_dummy' &&
    trainingDummyAlive &&
    isAtTrainingDummyMeleeStand()
  ) {
    if (trainingDummyMeleeTickCounter < 0) {
      pendingTrainingDummyMeleeSwings++;
      trainingDummyMeleeTickCounter = 0;
    } else {
      trainingDummyMeleeTickCounter++;
      if (trainingDummyMeleeTickCounter >= 3) {
        trainingDummyMeleeTickCounter = 0;
        pendingTrainingDummyMeleeSwings++;
      }
    }
  } else {
    trainingDummyMeleeTickCounter = -1;
  }

  if (gatheringTargetNodeIndex !== null && !isDead && !isPaused) {
    const def = GATHERING_NODE_DEFINITIONS[gatheringTargetNodeIndex];
    if (def && areOrthogonallyAdjacent(getPlayerPathTile(), def.tile)) {
      gatherHarvestTickCounter++;
      if (gatherHarvestTickCounter >= GATHERING_HARVEST_TICK_INTERVAL) {
        gatherHarvestTickCounter = 0;
        if (Math.random() < GATHERING_SUCCESS_CHANCE) {
          const item = pickGatheringReward(def.kind);
          if (inventory.addItem(item)) {
            playerSkills.addXp(def.kind, GATHERING_SUCCESS_SKILL_XP);
            addChatMessage(`You manage to gather some ${getItemDef(item).name}.`);
          } else {
            addChatMessage('Your inventory is too full to hold anything else.');
          }
        } else {
          addChatMessage('You fail to gather anything useful.');
        }
      }
    } else {
      gatherHarvestTickCounter = 0;
    }
  } else {
    gatherHarvestTickCounter = 0;
  }

  if (!isDead && !isPaused) {
    const ptBite = getPlayerPathTile();
    for (let ri = 0; ri < PEN_RAT_COUNT; ri++) {
      const ratNpc = penRatNpcs[ri];
      if (!ratNpc.alive || !ratNpc.aggressive) continue;
      if (areOrthogonallyAdjacent(ptBite, ratNpc.logicalTile)) {
        ratNpc.biteTick++;
        if (ratNpc.biteTick >= ratNpc.biteIntervalTicks) {
          ratNpc.resetBiteAccumulator();
          if (!isDamageBlocked('melee')) {
            setHealth(health - ratNpc.biteDamage);
          }
          ratNpc.lurchStartGameTime = gameTime;
        }
      } else {
        ratNpc.resetBiteAccumulator();
      }
    }

    if (!useSpacetimeMp) {
      for (let wi = 0; wi < wildlifeNpcs.length; wi++) {
        const wildNpc = wildlifeNpcs[wi];
        if (!wildNpc.alive || !wildNpc.aggressive) continue;
        const wildTile = wildNpc.logicalTile;
        const biteDist = Math.max(Math.abs(ptBite.x - wildTile.x), Math.abs(ptBite.z - wildTile.z));
        if (
          biteDist <= STARTING_WILDLIFE_AGGRO_TILES &&
          areOrthogonallyAdjacent(ptBite, wildTile)
        ) {
          wildNpc.biteTick++;
          if (wildNpc.biteTick >= wildNpc.biteIntervalTicks) {
            wildNpc.resetBiteAccumulator();
            if (!isDamageBlocked('melee')) {
              setHealth(health - wildNpc.biteDamage);
            }
            wildNpc.lurchStartGameTime = gameTime;
          }
        } else {
          wildNpc.resetBiteAccumulator();
        }
      }
    }

    if (useSpacetimeMp && spacetimeSessionReady) {
      const rows = serverWildlifeRuntime.getCombatRows(gameTime);
      for (const row of rows) {
        const tile = serverWildlifeRuntime.getLogicalTile(row.entityId);
        if (!tile) continue;
        const biteDist = Math.max(Math.abs(ptBite.x - tile.x), Math.abs(ptBite.z - tile.z));
        const key = row.entityId.toString();
        if (
          biteDist <= row.aggroTiles &&
          areOrthogonallyAdjacent(ptBite, tile)
        ) {
          const next = (serverWildlifeBiteAcc.get(key) ?? 0) + 1;
          serverWildlifeBiteAcc.set(key, next);
          if (next >= row.biteIntervalTicks) {
            serverWildlifeBiteAcc.set(key, 0);
            if (!isDamageBlocked('melee')) {
              setHealth(health - row.biteDamage);
            }
            serverWildlifeRuntime.noteBiteLurch(row.entityId, gameTime);
          }
        } else {
          serverWildlifeBiteAcc.delete(key);
        }
      }
    }
  }
}

const serverWildlifeBiteAcc = new Map<string, number>();

const tickClock = new TickClock();

const multiplayerUrlRaw =
  typeof import.meta.env.VITE_MULTIPLAYER_URL === 'string' ? import.meta.env.VITE_MULTIPLAYER_URL.trim() : '';
/** In dev, default to local server so a second tab works without a .env file. */
const multiplayerUrl =
  multiplayerUrlRaw ||
  (import.meta.env.DEV ? `ws://${typeof location !== 'undefined' ? location.hostname : 'localhost'}:3850` : '');

const SPACETIME_TOKEN_KEY = 'web-iso:spacetimedb:token';
/** Matches SpacetimeDB `normalizeUsername` (trim + lowercase); used for HUD and session display. */
const SPACETIME_USERNAME_KEY = 'web-iso:spacetimedb:username';
const spacetimeHadStoredTokenAtBoot =
  spacetimeUriRaw.length > 0 && !!localStorage.getItem(SPACETIME_TOKEN_KEY);
/** Until user confirms “Continue” on the resume card (saved token), or completes a fresh login. */
let spacetimeRequireResumeConfirm = spacetimeHadStoredTokenAtBoot;
/** Until SpacetimeDB `onWelcome`, ignore world snapshots so the character is not placed before login. */
let spacetimeSessionReady = !useSpacetimeMp;
let remountSpacetimeLoginForm: (() => void) | null = null;
let beginSpacetimeAccountSwitch: (() => void) | null = null;

function trySubmitChat(): void {
  const raw = chatInputEl.value;
  chatInputEl.value = '';
  const text = raw.trim();
  if (!text) {
    setChatOpen(false);
    return;
  }
  const c = multiplayerClient;
  if (!(c instanceof SpacetimeMultiplayerClient)) {
    addChatMessage('Chat requires SpacetimeDB multiplayer.');
    return;
  }
  if (!useSpacetimeMp || !spacetimeSessionReady) {
    addChatMessage('Sign in to multiplayer to use chat.');
    return;
  }
  c.sendChat(text);
}

chatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    trySubmitChat();
  }
});

let remotePlayersApi: ReturnType<typeof createRemotePlayers> | null = null;
let multiplayerFirstSnap = true;
let lastMultiplayerSentTile: GridTile | null = null;
let lastMultiplayerSentGoal: GridTile | null = null;
let multiplayerSelfPublicId: number | null = null;

const multiplayerHandlers: MultiplayerHandlers = {
  onWelcome(playerId) {
    multiplayerSelfPublicId = playerId;
    if (useSpacetimeMp) {
      if (spacetimeRequireResumeConfirm) {
        return;
      }
      spacetimeSessionReady = true;
      document.getElementById('spacetime-login-overlay')?.style.setProperty('display', 'none');
    }
  },
  onSpacetimeReducerFailed(reducerName, message) {
    addChatMessage(`[spacetimedb] ${reducerName}: ${message}`);
    if (
      message.includes('Unknown NPC template') &&
      (reducerName === 'npc_spawner_place' || reducerName === 'npc_spawner_update')
    ) {
      addChatMessage(
        '[spacetimedb] Publish a module built from this repo (`cd spacetimedb && spacetime publish …`) so the server knows templates like `rat`.'
      );
    }
  },
  onSpacetimeConnectError(msg) {
    console.warn('[spacetimedb] connect error:', msg);
    multiplayerSelfPublicId = null;
    spacetimeRequireResumeConfirm = false;
    spacetimeSessionReady = false;
    const c = multiplayerClient;
    if (c instanceof SpacetimeMultiplayerClient) {
      c.logout();
      c.connect({ token: null });
    }
    remountSpacetimeLoginForm?.();
    document.getElementById('spacetime-login-overlay')?.style.setProperty('display', 'flex');
  },
  onSnap(msg) {
    const mpAwaitingSessionUi = useSpacetimeMp && !spacetimeSessionReady;
    if (!mpAwaitingSessionUi) {
      if (multiplayerFirstSnap) {
        multiplayerFirstSnap = false;
        lastMultiplayerSentTile = null;
        lastMultiplayerSentGoal = null;
        character.position.set(msg.self.x, samplePlayerGroundY(msg.self.x, msg.self.z), msg.self.z);
        snapCharacterXZToNearestWalkable();
        snapCharacterYToTerrain();
        clearTileMovement();
      }
    }
    remotePlayersApi!.ingestSnap(msg.peers);
  },
  onPeerHitSplat(msg) {
    const v = new THREE.Vector3(msg.x, msg.y, msg.z);
    hitMarkers.createHitMarker(v, msg.amount, { remotePeer: true });
  },
  onTerrainEditFromPeer(msg) {
    applyTerrainPaintAtTile(
      chunkTerrainLoader,
      msg.tx,
      msg.tz,
      msg.mode,
      msg.textureIndex,
      msg.heightStep,
      msg.brushRadius
    );
  },
  onTerrainChunkFromServer(chunkKeyStr, json) {
    chunkTerrainLoader.ingestMultiplayerTerrainChunk(chunkKeyStr, json);
  },
  onServerWildlifeDirty(conn: DbConnection) {
    serverWildlifeRuntime.refreshFromConnection(conn, gameTime);
  },
  onServerNpcDeleted({ entityId, templateKey, tx, tz }) {
    addXp(
      templateKey === 'bear' ? XP_BEAR : templateKey === 'rat' ? XP_PEN_RAT : XP_SPIDER
    );
    const p = tileCenterXZ({ x: tx, z: tz });
    spawnServerWildlifeLootAt(templateKey, new THREE.Vector3(p.x, 0.2, p.z));
    if (
      attackTarget !== null &&
      attackTarget.type === 'server_wildlife' &&
      attackTarget.serverEntityId === entityId
    ) {
      attackTarget = null;
    }
  },
  onSpacetimeSubscriptionApplied() {
    const t = getPlayerPathTile();
    void chunkTerrainLoader.syncToWorldTile(t.x, t.z);
  },
  onSpacetimeChat(fromPublicId, text) {
    const selfLabel =
      multiplayerSelfPublicId !== null && fromPublicId === multiplayerSelfPublicId
        ? localStorage.getItem(SPACETIME_USERNAME_KEY) ?? 'You'
        : `#${fromPublicId}`;
    addChatMessage(`${selfLabel}: ${text}`);
  },
};

function setupSpacetimeLoginGate(spacetimeClient: SpacetimeMultiplayerClient): void {
  const overlay = document.createElement('div');
  overlay.id = 'spacetime-login-overlay';
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:300',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:rgba(6,6,10,0.88)',
    'backdrop-filter:blur(6px)',
  ].join(';');
  const shell = document.createElement('div');
  shell.style.cssText =
    'background:#14141c;border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:26px 28px;min-width:300px;max-width:400px;font:14px/1.4 system-ui,sans-serif;color:#e8e8ee';
  const box = document.createElement('div');
  box.id = 'spacetime-login-box';
  shell.appendChild(box);
  overlay.appendChild(shell);
  document.body.appendChild(overlay);

  function finishResumeAndEnter(): void {
    spacetimeSessionReady = true;
    spacetimeRequireResumeConfirm = false;
    overlay.style.setProperty('display', 'none');
    spacetimeClient.refreshSnapFromCache();
  }

  function beginAccountSwitch(): void {
    spacetimeRequireResumeConfirm = false;
    spacetimeSessionReady = false;
    multiplayerSelfPublicId = null;
    multiplayerFirstSnap = true;
    spacetimeClient.logout();
    mountLoginForm();
    overlay.style.setProperty('display', 'flex');
    spacetimeClient.connect({ token: null });
  }

  function mountResumeCard(): void {
    box.replaceChildren();
    const h2 = document.createElement('h2');
    h2.textContent = 'Welcome back';
    h2.style.cssText = 'margin:0 0 6px;font-size:18px;font-weight:600';
    const p = document.createElement('p');
    p.style.cssText = 'margin:0 0 18px;font-size:13px;color:#9a9aaa;line-height:1.45';
    p.append('You have a saved session in this browser, signed in as ');
    const strong = document.createElement('strong');
    strong.style.color = '#e8e4f0';
    strong.textContent = localStorage.getItem(SPACETIME_USERNAME_KEY) ?? 'your account';
    p.appendChild(strong);
    p.append('. Continue to play, or sign in with a different account.');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';
    const cont = document.createElement('button');
    cont.type = 'button';
    cont.textContent = 'Continue';
    cont.style.cssText =
      'flex:1;min-width:120px;padding:10px 14px;border-radius:8px;border:none;background:#3d6df0;color:#fff;font-weight:600;cursor:pointer';
    cont.addEventListener('click', finishResumeAndEnter);
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.textContent = 'Use a different account';
    sw.style.cssText =
      'flex:1;min-width:120px;padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#ddd;font-weight:600;cursor:pointer';
    sw.addEventListener('click', beginAccountSwitch);
    row.append(cont, sw);
    const foot = document.createElement('p');
    foot.style.cssText = 'margin:16px 0 0;font-size:11px;color:#6d6d7a;line-height:1.35';
    foot.textContent =
      'This uses a stored token (like “remember me”), not your password. Clear it anytime from Options → Sign out of multiplayer.';
    box.append(h2, p, row, foot);
  }

  function mountLoginForm(): void {
    box.innerHTML = `
      <h2 style="margin:0 0 6px;font-size:18px;font-weight:600">Multiplayer</h2>
      <p style="margin:0 0 18px;font-size:13px;color:#9a9aaa">Sign in with a username and password before joining the world.</p>
      <label style="display:block;font-size:12px;color:#b4b4c4;margin-bottom:4px">Username</label>
      <input id="spacetime-login-user" type="text" autocomplete="username" spellcheck="false" style="width:100%;box-sizing:border-box;margin-bottom:12px;padding:9px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:#0c0c12;color:#eee" />
      <label style="display:block;font-size:12px;color:#b4b4c4;margin-bottom:4px">Password</label>
      <input id="spacetime-login-pass" type="password" autocomplete="current-password" style="width:100%;box-sizing:border-box;margin-bottom:14px;padding:9px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:#0c0c12;color:#eee" />
      <div id="spacetime-login-status" style="min-height:20px;font-size:13px;color:#ff6b6b;margin-bottom:8px"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button id="spacetime-login-btn" type="button" style="flex:1;min-width:120px;padding:10px 14px;border-radius:8px;border:none;background:#3d6df0;color:#fff;font-weight:600;cursor:pointer">Log in</button>
        <button id="spacetime-register-btn" type="button" style="flex:1;min-width:120px;padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#ddd;font-weight:600;cursor:pointer">Create account</button>
      </div>
      <p style="margin:16px 0 0;font-size:11px;color:#6d6d7a;line-height:1.35">Passwords are hashed on the module (SHA-256 + pepper). Change the pepper before any public deployment.</p>`;

    const userEl = () => document.getElementById('spacetime-login-user') as HTMLInputElement;
    const passEl = () => document.getElementById('spacetime-login-pass') as HTMLInputElement;
    const statusEl = () => document.getElementById('spacetime-login-status') as HTMLDivElement;
    const loginBtn = () => document.getElementById('spacetime-login-btn') as HTMLButtonElement;
    const regBtn = () => document.getElementById('spacetime-register-btn') as HTMLButtonElement;

    const setBusy = (busy: boolean) => {
      loginBtn().disabled = busy;
      regBtn().disabled = busy;
    };

    const run = async (mode: 'login' | 'register') => {
      statusEl().textContent = '';
      const username = userEl().value;
      const password = passEl().value;
      setBusy(true);
      try {
        if (mode === 'register') {
          await spacetimeClient.registerAccount(username, password);
        } else {
          await spacetimeClient.loginWithPassword(username, password);
        }
        localStorage.setItem(SPACETIME_USERNAME_KEY, username.trim().toLowerCase());
        spacetimeClient.refreshSnapFromCache();
      } catch (e) {
        statusEl().textContent = e instanceof Error ? e.message : String(e);
      } finally {
        setBusy(false);
      }
    };

    loginBtn().addEventListener('click', () => void run('login'));
    regBtn().addEventListener('click', () => void run('register'));
  }

  remountSpacetimeLoginForm = mountLoginForm;
  beginSpacetimeAccountSwitch = () => {
    setGameMenuOpen(false);
    beginAccountSwitch();
  };

  if (spacetimeRequireResumeConfirm) {
    mountResumeCard();
  } else {
    mountLoginForm();
  }
}

if (spacetimeUriRaw.length > 0) {
  remotePlayersApi = createRemotePlayers({
    getGroundY: (x, z) => chunkTerrainLoader.sampleSurfaceHeightAtWorldXZ(x, z),
  });
  scene.add(remotePlayersApi.group);
  const spacetimeClient = new SpacetimeMultiplayerClient(
    {
      uri: spacetimeUriRaw,
      moduleName: spacetimeModuleRaw,
      authTokenStorageKey: SPACETIME_TOKEN_KEY,
      usernameStorageKey: SPACETIME_USERNAME_KEY,
    },
    multiplayerHandlers
  );
  multiplayerClient = spacetimeClient;
  setupSpacetimeLoginGate(spacetimeClient);

  const mpAccountHint = document.createElement('div');
  mpAccountHint.style.cssText =
    'font:11px sans-serif;color:rgba(255,255,255,0.5);line-height:1.35;margin:0 0 4px';
  mpAccountHint.textContent =
    'Multiplayer keeps this browser signed in with a saved token. Sign out here to use another account.';
  const mpSignOutBtn = document.createElement('button');
  mpSignOutBtn.type = 'button';
  mpSignOutBtn.textContent = 'Sign out of multiplayer';
  mpSignOutBtn.style.cssText =
    'align-self:flex-start;padding:8px 12px;font:12px sans-serif;border-radius:8px;cursor:pointer;margin-bottom:12px;' +
    'border:1px solid rgba(255,160,120,0.35);background:rgba(55,28,22,0.85);color:#f0ddd0;';
  mpSignOutBtn.addEventListener('click', () => beginSpacetimeAccountSwitch?.());
  optionsTabPane.insertBefore(mpAccountHint, displayTitle);
  optionsTabPane.insertBefore(mpSignOutBtn, displayTitle);

  spacetimeClient.connect();
} else if (multiplayerUrl.length > 0) {
  remotePlayersApi = createRemotePlayers({
    getGroundY: (x, z) => chunkTerrainLoader.sampleSurfaceHeightAtWorldXZ(x, z),
  });
  scene.add(remotePlayersApi.group);
  multiplayerClient = new MultiplayerClient(multiplayerUrl, multiplayerHandlers);
  multiplayerClient.connect();
}

/** Push path tile + move goal when either changes; pairs with immediate server broadcast for low latency. */
function syncMultiplayerPathTile(): void {
  if (multiplayerClient === null) return;
  if (useSpacetimeMp && !spacetimeSessionReady) return;
  const t = getPlayerPathTile();
  const goal: GridTile = moveGoalTile !== null ? moveGoalTile : t;
  if (
    lastMultiplayerSentTile !== null &&
    lastMultiplayerSentGoal !== null &&
    lastMultiplayerSentTile.x === t.x &&
    lastMultiplayerSentTile.z === t.z &&
    lastMultiplayerSentGoal.x === goal.x &&
    lastMultiplayerSentGoal.z === goal.z
  ) {
    return;
  }
  lastMultiplayerSentTile = { x: t.x, z: t.z };
  lastMultiplayerSentGoal = { x: goal.x, z: goal.z };
  multiplayerClient.sendMove(t.x, t.z, goal.x, goal.z);
}

function updateEnemyFireballs(dt: number): void {
  const charPos = character.position;
  const hitRadius = 0.5 + ENEMY_FIREBALL_RADIUS;
  for (let i = enemyFireballs.length - 1; i >= 0; i--) {
    const ef = enemyFireballs[i];
    ef.mesh.position.addScaledVector(ef.velocity, dt);
    ef.ttl -= dt;
    if (ef.mesh.position.distanceTo(charPos) < hitRadius) {
      if (!isDamageBlocked('mage')) {
        setHealth(health - ENEMY_FIREBALL_DAMAGE);
      }
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

function updateEnemies(_dt: number, gameTime: number): void {
  const charPos = character.position;
  const tickAlpha = tickClock.getTickAlpha();

  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    const pos = enemyPositions[j];
    const dx = charPos.x - pos.x;
    const dz = charPos.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const inRange = dist <= ENEMY_EXPLOSION_RANGE;

    if (inRange) {
      if (enemyExplosionState[j] === 'moving') {
        enemyExplosionState[j] = 'charging';
        enemyExplosionChargeStart[j] = gameTime;
      } else if (enemyExplosionState[j] === 'charging') {
        if (gameTime - enemyExplosionChargeStart[j] >= ENEMY_EXPLOSION_DELAY) {
          enemyExplosionLastTime[j] = gameTime;
          enemyExplosionState[j] = 'cooldown';
          enemyAttackHitEffects.push(createEnemyAttackHitEffect(pos.clone()));
          if (pos.distanceTo(charPos) <= ENEMY_EXPLOSION_RADIUS) {
            if (!isDamageBlocked('melee')) {
              setHealth(health - ENEMY_DAMAGE);
            }
          }
        }
      } else if (
        enemyExplosionState[j] === 'cooldown' &&
        gameTime - enemyExplosionLastTime[j] >= ENEMY_EXPLOSION_COOLDOWN
      ) {
        enemyExplosionState[j] = 'charging';
        enemyExplosionChargeStart[j] = gameTime;
      }
    } else {
      enemyExplosionState[j] = 'moving';
    }
  }

  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    const enemy = enemies.children[j] as THREE.Object3D;
    if (enemy) {
      const vx = THREE.MathUtils.lerp(enemyVisFrom[j].x, enemyVisTo[j].x, tickAlpha);
      const vz = THREE.MathUtils.lerp(enemyVisFrom[j].z, enemyVisTo[j].z, tickAlpha);
      enemy.position.set(vx, ENEMY_SIZE / 2, vz);
    }
  }
}

function updatePenRatVisuals(currentGameTime: number): void {
  const tickAlpha = tickClock.getTickAlpha();
  const charX = character.position.x;
  const charZ = character.position.z;
  for (let ri = 0; ri < PEN_RAT_COUNT; ri++) {
    const ratNpc = penRatNpcs[ri];
    if (!ratNpc.alive) continue;
    const rat = penRatGroup.children[ri] as THREE.Group;
    if (!rat) continue;
    const vx = THREE.MathUtils.lerp(ratNpc.visFrom.x, ratNpc.visTo.x, tickAlpha);
    const vz = THREE.MathUtils.lerp(ratNpc.visFrom.z, ratNpc.visTo.z, tickAlpha);
    let px = vx;
    let py = 0;
    let pz = vz;
    const lurchStart = ratNpc.lurchStartGameTime;
    if (lurchStart >= 0) {
      const elapsed = currentGameTime - lurchStart;
      if (elapsed >= PEN_RAT_LURCH_DURATION) {
        ratNpc.lurchStartGameTime = -1;
      } else {
        const t = elapsed / PEN_RAT_LURCH_DURATION;
        const envelope = Math.sin(Math.PI * t);
        let dx = charX - vx;
        let dz = charZ - vz;
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-4) {
          dx /= dist;
          dz /= dist;
        } else {
          dx = 0;
          dz = 1;
        }
        px = vx + dx * PEN_RAT_LURCH_DISTANCE * envelope;
        pz = vz + dz * PEN_RAT_LURCH_DISTANCE * envelope;
        py = PEN_RAT_LURCH_HOP_Y * envelope;
      }
    }
    rat.position.set(px, py, pz);
  }
}

function updateStartingWildlifeVisuals(currentGameTime: number): void {
  if (useSpacetimeMp && spacetimeSessionReady) {
    serverWildlifeRuntime.updateVisuals(
      tickClock.getTickAlpha(),
      terrainEditPanel.isOpen(),
      currentGameTime
    );
    return;
  }
  const tickAlpha = tickClock.getTickAlpha();
  const charX = character.position.x;
  const charZ = character.position.z;
  for (let wi = 0; wi < wildlifeNpcs.length; wi++) {
    const wildNpc = wildlifeNpcs[wi];
    if (!wildNpc.alive) continue;
    const mob = startingWildlifeGroup.children[wi] as THREE.Group;
    if (!mob) continue;
    const vx = THREE.MathUtils.lerp(wildNpc.visFrom.x, wildNpc.visTo.x, tickAlpha);
    const vz = THREE.MathUtils.lerp(wildNpc.visFrom.z, wildNpc.visTo.z, tickAlpha);
    let px = vx;
    let py = 0;
    let pz = vz;
    const lurchStart = wildNpc.lurchStartGameTime;
    if (lurchStart >= 0) {
      const elapsed = currentGameTime - lurchStart;
      if (elapsed >= PEN_RAT_LURCH_DURATION) {
        wildNpc.lurchStartGameTime = -1;
      } else {
        const t = elapsed / PEN_RAT_LURCH_DURATION;
        const envelope = Math.sin(Math.PI * t);
        let dx = charX - vx;
        let dz = charZ - vz;
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-4) {
          dx /= dist;
          dz /= dist;
        } else {
          dx = 0;
          dz = 1;
        }
        const lurchDist =
          wildlifeKindAt(wildNpc.slotIndex) === 'bear'
            ? PEN_RAT_LURCH_DISTANCE * 1.35
            : PEN_RAT_LURCH_DISTANCE * 0.85;
        px = vx + dx * lurchDist * envelope;
        pz = vz + dz * lurchDist * envelope;
        py = PEN_RAT_LURCH_HOP_Y * (wildlifeKindAt(wildNpc.slotIndex) === 'bear' ? 1.15 : 1) * envelope;
      }
    }
    mob.position.set(px, py, pz);
  }
}

let lastFrameTime = performance.now();
let smoothedFps = 60;
let gameTime = 0;

waves.startWave(1);

const sizeWarningEl = document.createElement('div');
sizeWarningEl.style.cssText = 'position:absolute;bottom:10px;left:50%;transform:translateX(-50%);padding:6px 12px;background:rgba(0,0,0,0.8);color:#f88;font:12px sans-serif;border-radius:4px;display:none;z-index:5;pointer-events:none;';
sizeWarningEl.textContent = 'Canvas collapsed (0 size) — release drag or resize window';
container.appendChild(sizeWarningEl);

const MANA_REGEN_PER_SECOND = 5;

const CAM_ORBIT_SPEED = 2.15;
const CAM_PITCH_SPEED = 1.05;

const gameLoop = new GameLoop(
  (dt) => {
    followCamera.setTarget(character.position.x, character.position.y, character.position.z);
    if (!isPaused && !gameMenuOpen && document.activeElement !== chatInputEl) {
      if (cameraKeysHeld.has('a')) followCamera.addOrbitYaw(-CAM_ORBIT_SPEED * dt);
      if (cameraKeysHeld.has('d')) followCamera.addOrbitYaw(CAM_ORBIT_SPEED * dt);
      if (cameraKeysHeld.has('w')) followCamera.addPitch(CAM_PITCH_SPEED * dt);
      if (cameraKeysHeld.has('s')) followCamera.addPitch(-CAM_PITCH_SPEED * dt);
    }

    if (isPaused) return;
    gameTime += dt;
    chunkTerrainLoader.updateWaterEffect(gameTime);
    if (!isDead) runTime += dt;
    if (isDead) return;
    setMana(mana + MANA_REGEN_PER_SECOND * dt);

    let tickSteps = tickClock.advance(dt);
    while (tickSteps-- > 0) processGameTick();

    while (
      pendingTrainingDummyMeleeSwings > 0 &&
      attackTarget !== null &&
      attackTarget.type === 'training_dummy' &&
      trainingDummyAlive &&
      isAtTrainingDummyMeleeStand()
    ) {
      pendingTrainingDummyMeleeSwings--;
      const pc = getPlayerLogicalWorldTileCenter();
      const dx = trainingDummyWorldPos.x - pc.x;
      const dz = trainingDummyWorldPos.z - pc.z;
      const targetDir = new THREE.Vector3(dx, 0, dz).normalize();
      performTrainingDummyMelee(gameTime, targetDir);
    }
    if (pendingTrainingDummyMeleeSwings > 0) pendingTrainingDummyMeleeSwings = 0;

    // Update player burning status
    if (playerBurning) {
      const burnAge = gameTime - playerBurnStartTime;
      if (burnAge >= BOSS_FIREBALL_BURN_DURATION) {
        playerBurning = false;
        // Clear emissive glow
        character.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            const mat = child.material;
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
          }
        });
      } else {
        // Apply damage ticks (burning is magic damage)
        if (gameTime - lastBurnTickTime >= BOSS_FIREBALL_BURN_TICK_INTERVAL) {
          if (!isDamageBlocked('mage')) {
            const damage = BOSS_FIREBALL_BURN_DAMAGE_PER_SECOND * BOSS_FIREBALL_BURN_TICK_INTERVAL;
            setHealth(health - damage);
          }
          lastBurnTickTime = gameTime;
        }
      }
    }
    
    // Inferno-style: when all enemies dead, advance to next wave (no portal)
    if (!FRESH_GRID_MODE && waves.isWaveComplete(() => isAnyEnemyAlive())) {
      addChatMessage(`Wave ${waves.getCurrentWave()} completed!`);
      while (enemyFireballs.length > 0) {
        const ef = enemyFireballs.pop()!;
        scene.remove(ef.mesh);
        (ef.mesh.geometry as THREE.BufferGeometry).dispose();
        (ef.mesh.material as THREE.Material).dispose();
      }
      bossApi.clearFireballs();
      waves.startWave(waves.getCurrentWave() + 1);
    }
    updateAutoAttack(dt, gameTime);
    updateCharacterMove(dt);
    updatePlayerTileMarkers();
    maybeSyncTerrainChunks();
    syncMultiplayerPathTile();
    remotePlayersApi?.updateInterpolation(dt);
    updatePlayerCollisions(dt);
    if (!isDead) {
      snapCharacterYToTerrain();
      followCamera.setTarget(character.position.x, character.position.y, character.position.z);
    }
    const combatState = buildCombatState();
    swordApi.update(dt, gameTime, combatState);
    updateEnemies(dt, gameTime);
    updatePenRatVisuals(gameTime);
    updateStartingWildlifeVisuals(gameTime);
    updateEnemyAttackHitEffects(gameTime);
    updateCasters(dt, gameTime);
    updateResurrectors(dt, gameTime);
    teleportersApi.update(dt, gameTime, character.position);
    bossApi.update(dt, gameTime);
    const inPoisonPool = poisonPoolsApi.update(gameTime, character.position);
    if (inPoisonPool && !playerPoisoned) {
      playerPoisoned = true;
      playerPoisonStartTime = gameTime;
    }
    if (playerPoisoned) {
      const poisonAge = gameTime - playerPoisonStartTime;
      if (poisonAge >= POISON_DURATION) {
        playerPoisoned = false;
      } else if (gameTime - lastPoisonTickTime >= POISON_TICK_INTERVAL) {
        setHealth(health - POISON_DAMAGE_PER_TICK);
        lastPoisonTickTime = gameTime;
      }
    }
    playerBurnVisuals.update(gameTime);
    playerPoisonVisuals.update(gameTime);
    if (pendingBowShotTarget) {
      arrowsApi.shoot(character.position.clone(), pendingBowShotTarget);
      pendingBowShotTarget = null;
    }
    arrowsApi.update(dt, combatState);
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
    }
    const camera = followCamera.three;
    const hudState: HUDState = {
      canvasWidth: cw,
      canvasHeight: ch,
      camera,
      runTime,
      smoothedFps,
      latencyMs: multiplayerClient !== null ? multiplayerClient.getLatencyMs() : null,
      tickAlpha: tickClock.getTickAlpha(),
      health,
      maxHealth: getMaxHealth(),
      mana,
      maxMana: MAX_MANA,
      level,
      xp,
      xpForNextLevel: getXpForNextLevel(),
      strength,
      intelligence,
      dexterity,
      vitality,
      currentWave: waves.getCurrentWave(),
      enemyPositions,
      enemyAlive,
      enemyHealth,
      enemyMaxHealth: MAX_ENEMY_HEALTH,
      casterPositions: casterLogicalPos,
      casterAlive,
      casterHealth,
      casterMaxHealth: MAX_CASTER_HEALTH,
      resurrectorPositions: resurrectorLogicalPos,
      resurrectorAlive,
      resurrectorHealth,
      resurrectorMaxHealth: MAX_RESURRECTOR_HEALTH,
      teleporterPositions: teleportersApi.getPositions(),
      teleporterAlive: teleportersApi.getAlive(),
      teleporterHealth: teleportersApi.getHealthArray(),
      teleporterMaxHealth: teleportersApi.getMaxHealth(),
      bossPosition: bossApi.getPosition(),
      bossAlive: bossApi.isAlive(),
      bossHealth: bossApi.getHealth(),
      bossMaxHealth: bossApi.getMaxHealth(),
      runEnabled: playerRunEnabled,
      runEnergy: playerRunEnergy,
      runEnergyMax: RUN_ENERGY_MAX,
      accountUsername: useSpacetimeMp ? localStorage.getItem(SPACETIME_USERNAME_KEY) : null,
    };
    hud.update(hudState);
    minimap.update({
      playerX: character.position.x,
      playerZ: character.position.z,
      npcYellow: collectMinimapNpcYellow(),
      playersWhite: remotePlayersApi?.getMinimapPositions() ?? [],
      itemsRed: groundItemsApi.getMinimapPoints(),
    });
    bossApi.getHitboxIndicator().visible = bossApi.isAlive();
    // Update floating hit markers
    hitMarkers.updateHitMarkers(now / 1000, camera, cw, ch);
    groundItemsApi.updateLabels();
    renderer.render(scene, followCamera.three);
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
  renderer.setPixelRatio(getRendererPixelRatio(gameOptions));
  followCamera.resize(width, height);
}

window.addEventListener('resize', onResize);

function forceRepaint(): void {
  if (!glContextLost && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
    renderer.render(scene, followCamera.three);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') forceRepaint();
});

document.getElementById('options-debug-snapshot')?.addEventListener('click', () => {
  const ri = renderer.info;
  console.log('[web-iso debug snapshot]', {
    runTime,
    paused: isPaused,
    dead: isDead,
    wave: waves.getCurrentWave(),
    position: character.position.toArray(),
    health,
    mana,
    level,
    xp,
    prayer: activePrayer,
    freshGridBuild: FRESH_GRID_MODE,
    weapon: equipment.getWeapon(),
    skills: playerSkills.snapshot(),
    multiplayer: multiplayerClient !== null,
    webgl: {
      calls: ri.render.calls,
      triangles: ri.render.triangles,
      points: ri.render.points,
      lines: ri.render.lines,
      geometries: ri.memory.geometries,
      textures: ri.memory.textures,
    },
  });
});

document.getElementById('options-debug-fill-vitals')?.addEventListener('click', () => {
  if (isDead) return;
  setHealth(getMaxHealth());
  setMana(MAX_MANA);
  playerRunEnergy = RUN_ENERGY_MAX;
});

gameLoop.start();
