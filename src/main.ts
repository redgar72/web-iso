import * as THREE from 'three';
import { IsoCamera } from './core/IsoCamera';
import { GameLoop } from './core/GameLoop';
import { createIsoTerrain } from './scene/IsoTerrain';
import { createIsoLights } from './scene/IsoLights';
import { createEnemies, ENEMY_COUNT, ENEMY_SIZE, killEnemyInstance, resurrectEnemyInstance } from './scene/Enemies';
import { rollDrop, type MonsterType, type DropType } from './drops/DropTables';
import { createPlaceholderCharacter } from './character/loadFbxCharacter';
import {
  isSkillUnlocked,
  isAugmentUnlocked,
  addSkillPoint,
  getSkillPoints,
  canUnlockSkill,
  unlockSkill,
  canUnlockAugment,
  unlockAugment,
  getAugmentsForSkill,
  SKILL_TREE,
  type SkillId,
  type AugmentId,
} from './skills/SkillTree';
import { createWaves } from './game/Waves';
import { createEquipment } from './state/Equipment';
import { createInventory, INVENTORY_SLOTS } from './state/Inventory';
import { EQUIPMENT_SLOT_ORDER, getItemDef, type ItemId, type EquipmentSlotId } from './items/ItemTypes';
import { createSword } from './combat/Sword';
import { createFireballs, createRocks, createArrows } from './combat/Projectiles';
import type { CombatState } from './combat/types';
import {
  SWORD_ORBIT_RADIUS,
  SWORD_HIT_RADIUS,
  SWORD_HIT_COOLDOWN,
  FIREBALL_RADIUS as CONST_FIREBALL_RADIUS,
  EXPLOSION_MAX_SCALE as CONST_EXPLOSION_MAX_SCALE,
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
} from './config/Constants';
import { createBoss, type BossApi } from './scene/Boss';
import { createTeleporters, type TeleporterAPI } from './scene/Teleporters';
import { createHUD, type HUDState } from './ui/HUD';
import { createPlayerBurnVisuals } from './effects/BurnVisuals';
import { createPlayerPoisonVisuals } from './effects/PoisonVisuals';
import { createPoisonPools } from './effects/PoisonPools';
import { createGroundItems } from './world/GroundItems';

const container = document.getElementById('app')!;

// Equipment & inventory (sword equipped by default; bow in inventory for testing)
const equipment = createEquipment('sword');
const inventory = createInventory(['bow']);
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
const BEST_TIME_KEY = 'web-iso-best-time';
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function getBestTime(): number {
  const raw = localStorage.getItem(BEST_TIME_KEY);
  if (raw == null) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}
function setBestTime(seconds: number): void {
  localStorage.setItem(BEST_TIME_KEY, String(seconds));
}
let runTime = 0;

// Health & Mana bars (DOM moved to HUD; state stays here)
const BASE_MAX_HEALTH = 100;
const MAX_MANA = 100;
let mana = MAX_MANA;
const FIREBALL_MANA_COST = 18;

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
const XP_CASTER = 35;
const XP_RESURRECTOR = 40;

function getXpForNextLevel(): number {
  return 80 * level; // e.g. 80 to reach 2, 160 to reach 3
}

let health = getMaxHealth();

// Equipment panel (equipped items - always visible). Inserted into HUD bars root after HUD creation.
const equipmentPanelEl = document.createElement('div');
equipmentPanelEl.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:12px;';
const equipmentLabelEl = document.createElement('div');
equipmentLabelEl.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.85);';
equipmentLabelEl.textContent = 'Equipment';
equipmentPanelEl.appendChild(equipmentLabelEl);
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
equipment.subscribe(renderEquipmentPanel);
renderEquipmentPanel();
equipmentPanelEl.appendChild(equipmentSlotsEl);
// Wave display and bars root come from HUD; equipment panel is inserted there after createHUD()

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
const SPAWN_POSITION = new THREE.Vector3(10, 0, 10);
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
  const best = getBestTime();
  const isNewBest = runTime > best;
  if (isNewBest) setBestTime(runTime);
  gameOverTimeEl.textContent = `Time: ${formatTime(runTime)}`;
  gameOverBestEl.textContent = isNewBest ? `New best! ${formatTime(runTime)}` : `Best: ${formatTime(best)}`;
  gameOverEl.style.display = 'flex';
}

function respawn(): void {
  isDead = false;
  runTime = 0;
  gameOverEl.style.display = 'none';
  setHealth(getMaxHealth());
  setMana(MAX_MANA);
  character.position.copy(SPAWN_POSITION);
  moveTarget = null;
  playerBurning = false; // Clear burning on respawn
  playerPoisoned = false; // Clear poison on respawn
  activePrayer = null; // Clear prayer on respawn
  updatePrayerButtons();
  waves.startWave(1);
}

respawnBtn.addEventListener('click', respawn);

/** Called when player levels up (e.g. to open skill tree or show notification). */
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

// Skill tree panel (K to open/close)
const skillTreeEl = document.createElement('div');
skillTreeEl.id = 'skill-tree';
skillTreeEl.style.cssText =
  'position:absolute;inset:0;z-index:18;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);';
const skillTreePanel = document.createElement('div');
skillTreePanel.style.cssText =
  'background:linear-gradient(180deg,#2a2630 0%,#1e1a24 100%);border:2px solid rgba(255,255,255,0.2);border-radius:12px;padding:24px;min-width:320px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
const skillTreeTitle = document.createElement('div');
skillTreeTitle.textContent = 'Skill Tree';
skillTreeTitle.style.cssText = 'font:20px sans-serif;color:#e8e0e0;font-weight:bold;margin-bottom:8px;';
const skillTreeTabs = document.createElement('div');
skillTreeTabs.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;';
const skillTreeStatAllocEl = document.createElement('div');
skillTreeStatAllocEl.style.cssText = 'margin-bottom:16px;';
const skillTreePoints = document.createElement('div');
skillTreePoints.style.cssText = 'font:12px sans-serif;color:#a0c0a0;margin-bottom:16px;';
const skillTreeList = document.createElement('div');
skillTreeList.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
const skillTreeHint = document.createElement('div');
skillTreeHint.textContent = 'Press K to close';
skillTreeHint.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.5);margin-top:12px;';
skillTreePanel.appendChild(skillTreeTitle);
skillTreePanel.appendChild(skillTreeTabs);
skillTreePanel.appendChild(skillTreeStatAllocEl);
skillTreePanel.appendChild(skillTreePoints);
skillTreePanel.appendChild(skillTreeList);
skillTreePanel.appendChild(skillTreeHint);
skillTreeEl.appendChild(skillTreePanel);

let skillTreePage: SkillId = 'sword';
function setSkillTreePage(page: SkillId): void {
  skillTreePage = page;
  renderSkillTree();
}
skillTreeEl.style.display = 'none';
skillTreeEl.style.alignItems = 'center';
skillTreeEl.style.justifyContent = 'center';
container.appendChild(skillTreeEl);

let skillTreeOpen = false;
function setSkillTreeOpen(open: boolean): void {
  skillTreeOpen = open;
  skillTreeEl.style.display = open ? 'flex' : 'none';
  if (open) {
    setPaused(true);
    renderSkillTree();
  } else {
    setPaused(false);
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
    setHealth(health); // refresh health bar
  }
  updateStatsDisplay();
  renderSkillTree();
}

function renderSkillTree(): void {
  skillTreeTitle.textContent = `Skill Tree — Level ${level}`;
  // Tabs: one per skill page
  skillTreeTabs.innerHTML = '';
  const tabNames: { id: SkillId; label: string }[] = [
    { id: 'sword', label: 'Sword' },
    { id: 'rock', label: 'Rock' },
    { id: 'fireball', label: 'Fireball' },
  ];
  for (const { id, label } of tabNames) {
    const tab = document.createElement('button');
    tab.textContent = label;
    tab.style.cssText =
      'padding:8px 16px;font:12px sans-serif;border-radius:8px;border:1px solid rgba(255,255,255,0.2);cursor:pointer;background:' +
      (skillTreePage === id ? 'rgba(100,80,140,0.5);color:#e8e0e0;' : 'rgba(0,0,0,0.3);color:rgba(255,255,255,0.8);');
    tab.addEventListener('click', () => setSkillTreePage(id));
    skillTreeTabs.appendChild(tab);
  }
  // Stat allocation section
  skillTreeStatAllocEl.innerHTML = '';
  if (statPointsToAllocate > 0) {
    const label = document.createElement('div');
    label.style.cssText = 'font:12px sans-serif;color:#c0a060;margin-bottom:8px;';
    label.textContent = `Stat points to allocate: ${statPointsToAllocate}`;
    skillTreeStatAllocEl.appendChild(label);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
    const statColors: Record<'strength' | 'intelligence' | 'dexterity' | 'vitality', { top: string; bottom: string; text: string }> = {
      strength: { top: '#d4af37', bottom: '#b8860b', text: '#2a2200' },
      intelligence: { top: '#7dd3fc', bottom: '#38bdf8', text: '#0c1929' },
      dexterity: { top: '#4ade80', bottom: '#22c55e', text: '#052e16' },
      vitality: { top: '#f87171', bottom: '#dc2626', text: '#450a0a' },
    };
    const btn = (name: string, stat: 'strength' | 'intelligence' | 'dexterity' | 'vitality') => {
      const c = statColors[stat];
      const b = document.createElement('button');
      b.textContent = `${name} +1`;
      b.style.cssText = `padding:6px 12px;font:12px sans-serif;background:linear-gradient(180deg,${c.top},${c.bottom});color:${c.text};border:none;border-radius:6px;cursor:pointer;`;
      b.addEventListener('click', () => allocateStat(stat));
      return b;
    };
    row.appendChild(btn('Str', 'strength'));
    row.appendChild(btn('Int', 'intelligence'));
    row.appendChild(btn('Dex', 'dexterity'));
    row.appendChild(btn('Vit', 'vitality'));
    skillTreeStatAllocEl.appendChild(row);
  }
  skillTreePoints.textContent = `Skill points: ${getSkillPoints()}`;
  skillTreeList.innerHTML = '';

  const def = SKILL_TREE.find((s) => s.id === skillTreePage)!;
  const baseUnlocked = isSkillUnlocked(def.id as SkillId);
  const canUnlockBase = canUnlockSkill(def.id as SkillId, level);

  // Base skill card for this page
  const baseRow = document.createElement('div');
  baseRow.style.cssText =
    'display:flex;flex-direction:column;gap:4px;padding:10px;background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid ' +
    (baseUnlocked ? 'rgba(80,180,80,0.5)' : canUnlockBase ? 'rgba(200,180,80,0.5)' : 'rgba(255,255,255,0.1)') +
    ';';
  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font:14px sans-serif;color:#e0e0e0;font-weight:bold;';
  nameEl.textContent = def.name + (baseUnlocked ? ' ✓' : '');
  const descEl = document.createElement('div');
  descEl.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.75);';
  descEl.textContent = def.description;
  const reqEl = document.createElement('div');
  reqEl.style.cssText = 'font:10px sans-serif;color:rgba(255,255,255,0.5);';
  reqEl.textContent = `Level ${def.requiredLevel}` + (def.prerequisite ? ` (requires ${SKILL_TREE.find((s) => s.id === def.prerequisite)?.name})` : '');
  baseRow.appendChild(nameEl);
  baseRow.appendChild(descEl);
  baseRow.appendChild(reqEl);
  if (!baseUnlocked && canUnlockBase) {
    const btn = document.createElement('button');
    btn.textContent = 'Unlock (1 point)';
    btn.style.cssText =
      'align-self:flex-start;margin-top:4px;padding:6px 12px;font:12px sans-serif;background:linear-gradient(180deg,#60a060,#408040);color:#fff;border:none;border-radius:6px;cursor:pointer;';
    btn.addEventListener('click', () => {
      if (unlockSkill(def.id as SkillId, level)) renderSkillTree();
    });
    baseRow.appendChild(btn);
  }
  skillTreeList.appendChild(baseRow);

  // Augments for this skill (only show when base is unlocked)
  if (baseUnlocked) {
    const augments = getAugmentsForSkill(skillTreePage);
    for (const aug of augments) {
      const unlocked = isAugmentUnlocked(aug.id);
      const canUnlock = canUnlockAugment(aug.id, level);
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;flex-direction:column;gap:4px;padding:10px;background:rgba(0,0,0,0.25);border-radius:8px;border:1px solid ' +
        (unlocked ? 'rgba(80,180,80,0.4)' : canUnlock ? 'rgba(200,180,80,0.4)' : 'rgba(255,255,255,0.08)') +
        ';margin-left:16px;';
      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'font:13px sans-serif;color:#e0e0e0;font-weight:bold;';
      nameEl.textContent = aug.name + (unlocked ? ' ✓' : '');
      const descEl = document.createElement('div');
      descEl.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.7);';
      descEl.textContent = aug.description;
      const reqEl = document.createElement('div');
      reqEl.style.cssText = 'font:10px sans-serif;color:rgba(255,255,255,0.5);';
      const prereqText = aug.prerequisite ? ` (requires ${augments.find((a) => a.id === aug.prerequisite)?.name})` : '';
      reqEl.textContent = `Level ${aug.requiredLevel}${prereqText}`;
      row.appendChild(nameEl);
      row.appendChild(descEl);
      row.appendChild(reqEl);
      if (!unlocked && canUnlock) {
        const btn = document.createElement('button');
        btn.textContent = 'Unlock (1 point)';
        btn.style.cssText =
          'align-self:flex-start;margin-top:4px;padding:6px 12px;font:12px sans-serif;background:linear-gradient(180deg,#5080a0,#306080);color:#fff;border:none;border-radius:6px;cursor:pointer;';
        btn.addEventListener('click', () => {
          if (unlockAugment(aug.id, level)) renderSkillTree();
        });
        row.appendChild(btn);
      }
      skillTreeList.appendChild(row);
    }
  }
}
skillTreeEl.addEventListener('click', (e) => {
  if (e.target === skillTreeEl) setSkillTreeOpen(false);
});

// Inventory popup (I to open/close) — floating window, game keeps running
const inventoryEl = document.createElement('div');
inventoryEl.id = 'inventory';
inventoryEl.style.cssText =
  'position:absolute;top:12px;right:12px;z-index:18;display:none;flex-direction:column;';
const inventoryPanel = document.createElement('div');
inventoryPanel.style.cssText =
  'background:linear-gradient(180deg,#2a2630 0%,#1e1a24 100%);border:2px solid rgba(255,255,255,0.2);border-radius:12px;padding:24px;min-width:200px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
const inventoryTitle = document.createElement('div');
inventoryTitle.textContent = 'Inventory';
inventoryTitle.style.cssText = 'font:20px sans-serif;color:#e8e0e0;font-weight:bold;margin-bottom:12px;';
const inventoryEquipmentRow = document.createElement('div');
inventoryEquipmentRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:16px;';
const inventoryEquipmentLabel = document.createElement('div');
inventoryEquipmentLabel.style.cssText = 'font:12px sans-serif;color:rgba(255,255,255,0.8);min-width:56px;';
inventoryEquipmentLabel.textContent = 'Equipped';
inventoryEquipmentRow.appendChild(inventoryEquipmentLabel);
const inventoryEquipmentSlots = document.createElement('div');
inventoryEquipmentSlots.style.cssText = 'display:flex;gap:8px;';
const inventoryGridEl = document.createElement('div');
inventoryGridEl.style.cssText = 'display:grid;gap:6px;';
const INV_SLOT_SIZE = 40;
const invSlotStyle = `width:${INV_SLOT_SIZE}px;height:${INV_SLOT_SIZE}px;background:rgba(0,0,0,0.5);border:2px solid rgba(255,255,255,0.2);border-radius:6px;display:flex;align-items:center;justify-content:center;font:10px sans-serif;color:rgba(255,255,255,0.9);cursor:pointer;transition:border-color 0.15s,background 0.15s;box-sizing:border-box;`;
const inventoryHint = document.createElement('div');
inventoryHint.textContent = 'Press I to close';
inventoryHint.style.cssText = 'font:11px sans-serif;color:rgba(255,255,255,0.5);margin-top:12px;';

function renderInventoryModal(): void {
  inventoryEquipmentSlots.innerHTML = '';
  for (const slotId of EQUIPMENT_SLOT_ORDER) {
    const slotDiv = document.createElement('div');
    slotDiv.title = slotId === 'weapon' ? 'Weapon' : slotId;
    slotDiv.style.cssText = invSlotStyle;
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
      slotDiv.textContent = slotId === 'weapon' ? '—' : '—';
      slotDiv.style.color = 'rgba(255,255,255,0.4)';
    }
    inventoryEquipmentSlots.appendChild(slotDiv);
  }
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
    } else {
      cell.style.color = 'rgba(255,255,255,0.3)';
      cell.textContent = '';
    }
    inventoryGridEl.appendChild(cell);
  }
}
equipment.subscribe(renderInventoryModal);
inventory.subscribe(renderInventoryModal);

inventoryPanel.appendChild(inventoryTitle);
inventoryEquipmentRow.appendChild(inventoryEquipmentSlots);
inventoryPanel.appendChild(inventoryEquipmentRow);
inventoryPanel.appendChild(inventoryGridEl);
inventoryPanel.appendChild(inventoryHint);
inventoryEl.appendChild(inventoryPanel);
container.appendChild(inventoryEl);

let inventoryOpen = false;
function setInventoryOpen(open: boolean): void {
  inventoryOpen = open;
  inventoryEl.style.display = open ? 'flex' : 'none';
  if (open) renderInventoryModal();
}

levelUpNotifier.callback = () => {
  if (getSkillPoints() > 0 || statPointsToAllocate > 0) setSkillTreeOpen(true);
};

function setPaused(paused: boolean): void {
  if (isDead) return;
  isPaused = paused;
  pauseEl.style.display = isPaused ? 'flex' : 'none';
}

// Enemy health bars moved to HUD (createHUD below)

// Floating combat hit markers
const hitMarkersContainer = document.createElement('div');
hitMarkersContainer.style.cssText = 'position:absolute;inset:0;z-index:5;pointer-events:none;';
container.appendChild(hitMarkersContainer);

interface HitMarker {
  element: HTMLDivElement;
  worldPosition: THREE.Vector3;
  spawnTime: number; // actual time in seconds
  amount: number;
  offsetY: number; // Current vertical offset for floating animation
}

const hitMarkers: HitMarker[] = [];
const HIT_MARKER_DURATION = 1.0; // seconds
const HIT_MARKER_FLOAT_DISTANCE = 1.5; // world units
const HIT_MARKER_Y_OFFSET = 1.5; // base offset above entity
const hitMarkerProjectionVec = new THREE.Vector3();

function createHitMarker(position: THREE.Vector3, amount: number): void {
  const element = document.createElement('div');
  element.textContent = Math.round(amount).toString();
  element.style.cssText = `
    position: absolute;
    font: bold 20px/1 sans-serif;
    color: #ff4444;
    text-shadow: 0 0 8px rgba(255, 68, 68, 0.8), 0 2px 4px rgba(0, 0, 0, 0.8);
    white-space: nowrap;
    pointer-events: none;
    transform: translate(-50%, -50%);
    will-change: transform, opacity;
  `;
  hitMarkersContainer.appendChild(element);

  hitMarkers.push({
    element,
    worldPosition: position.clone(),
    spawnTime: performance.now() / 1000, // Use actual time for smooth animation
    amount,
    offsetY: 0,
  });
}

function updateHitMarkers(currentTime: number, camera: THREE.Camera, cw: number, ch: number): void {
  for (let i = hitMarkers.length - 1; i >= 0; i--) {
    const marker = hitMarkers[i];
    const age = currentTime - marker.spawnTime;
    
    if (age >= HIT_MARKER_DURATION) {
      // Remove expired marker
      hitMarkersContainer.removeChild(marker.element);
      hitMarkers.splice(i, 1);
      continue;
    }

    // Update floating animation
    const progress = age / HIT_MARKER_DURATION;
    marker.offsetY = HIT_MARKER_FLOAT_DISTANCE * progress;
    
    // Fade out
    const opacity = 1.0 - progress;
    marker.element.style.opacity = opacity.toString();

    // Project 3D position to screen space
    hitMarkerProjectionVec.set(
      marker.worldPosition.x,
      marker.worldPosition.y + HIT_MARKER_Y_OFFSET + marker.offsetY,
      marker.worldPosition.z
    );
    hitMarkerProjectionVec.project(camera);
    
    const px = (hitMarkerProjectionVec.x * 0.5 + 0.5) * cw;
    const py = (1 - (hitMarkerProjectionVec.y * 0.5 + 0.5)) * ch;
    
    // Only show if in front of camera
    if (hitMarkerProjectionVec.z < 1) {
      marker.element.style.left = `${px}px`;
      marker.element.style.top = `${py}px`;
      marker.element.style.visibility = 'visible';
    } else {
      marker.element.style.visibility = 'hidden';
    }
  }
}

function setHealth(value: number): void {
  const max = getMaxHealth();
  const oldHealth = health;
  health = Math.max(0, Math.min(max, value));
  
  // Show hit marker if player took damage
  if (health < oldHealth && oldHealth > 0) {
    const damage = oldHealth - health;
    createHitMarker(character.position, damage);
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
    addSkillPoint();
    setHealth(getMaxHealth()); // heal to new max on level up
    updateStatsDisplay();
    levelUpNotifier.callback?.();
  }
  updateXpDisplay();
}

function setMana(value: number): void {
  mana = Math.max(0, Math.min(MAX_MANA, value));
}
const isoCamera = new IsoCamera(width, height);
isoCamera.setWorldFocus(10, 0, 10);
isoCamera.setZoom(1.2);
isoCamera.setDistance(28);

const terrain = createIsoTerrain(24, 24, { color: 0x5a5668 });
scene.add(terrain);

const enemies = createEnemies();
scene.add(enemies);

createIsoLights(scene);

const character = createPlaceholderCharacter([10, 0, 10]);
scene.add(character);

// Sword orbit radius/hit/cooldown (augment modifiers) — passed to combat/Sword
function getSwordOrbitRadius(): number {
  return isAugmentUnlocked('sword_whirl' as AugmentId) ? SWORD_ORBIT_RADIUS * 1.25 : SWORD_ORBIT_RADIUS;
}
function getSwordHitRadius(): number {
  return isAugmentUnlocked('sword_whirl' as AugmentId) ? SWORD_HIT_RADIUS * 1.2 : SWORD_HIT_RADIUS;
}
function getSwordHitCooldown(): number {
  return isAugmentUnlocked('sword_quickslash' as AugmentId) ? SWORD_HIT_COOLDOWN * 0.6 : SWORD_HIT_COOLDOWN;
}

const lastEnemyDamageTime: number[] = Array(ENEMY_COUNT).fill(-999);

// Caster enemies: purple capsules that throw fireballs at the player
const CASTER_COUNT = 5;
const CASTER_SPEED = 2.2;
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

/** Returns true if the caster died. Does not dispose mesh so casters can be reused for next level. */
function damageCaster(c: number, amount: number): boolean {
  createHitMarker(casterMeshes[c].position, amount);
  casterHealth[c] = Math.max(0, casterHealth[c] - amount);
  if (casterHealth[c] <= 0) {
    addXp(XP_CASTER);
    trySpawnDrop(casterMeshes[c].position.clone(), 'caster');
    casterGroup.remove(casterMeshes[c]);
    casterAlive[c] = false;
    return true;
  }
  return false;
}

scene.add(casterGroup);

// Resurrector enemies: resurrect fallen grunts (spawn from wave 5, after double casters)
const RESURRECTOR_COUNT = 3;
const RESURRECTOR_SPEED = 1.8;
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

/** Returns true if the resurrector died. */
function damageResurrector(r: number, amount: number): boolean {
  createHitMarker(resurrectorMeshes[r].position, amount);
  resurrectorHealth[r] = Math.max(0, resurrectorHealth[r] - amount);
  if (resurrectorHealth[r] <= 0) {
    addXp(XP_RESURRECTOR);
    trySpawnDrop(resurrectorMeshes[r].position.clone(), 'resurrector');
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

const hud = createHUD(container, {
  enemyCount: ENEMY_COUNT,
  casterCount: CASTER_COUNT,
  resurrectorCount: RESURRECTOR_COUNT,
  teleporterCount: TELEPORTER_COUNT,
});
hud.getBarsRoot().insertBefore(equipmentPanelEl, hud.getBarsRoot().firstChild);

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
  getCamera: () => isoCamera.three,
  container,
  canvas,
  tryAddToInventory: (itemId) => inventory.addItem(itemId),
  canInteract: () => !isDead && !isPaused,
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const TERRAIN_XZ_MIN = 0;
const TERRAIN_XZ_MAX = 48;
const CHARACTER_MOVE_SPEED = 12;
const MOVE_ARRIVAL_DIST = 0.05;

let moveTarget: THREE.Vector3 | null = null;

// Auto-attack target tracking
type AttackTargetType = 'enemy' | 'caster' | 'resurrector' | 'teleporter' | 'boss';
interface AttackTarget {
  type: AttackTargetType;
  index: number;
}
let attackTarget: AttackTarget | null = null;

function setMoveTargetFromMouse(clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, isoCamera.three);

  if (groundItemsApi.tryPickupFromRaycast(raycaster)) return;

  // Get the ground intersection point
  const hits = raycaster.intersectObject(terrain);
  if (hits.length === 0) return;
  const groundPoint = hits[0].point;
  const clickRadius = 1.5; // How close to a monster's position counts as clicking it
  
  // First check if clicking on a monster by checking distance from ground intersection
  // Check enemies (grunts)
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    const dist = groundPoint.distanceTo(enemyPositions[j]);
    if (dist <= clickRadius) {
      attackTarget = { type: 'enemy', index: j };
      moveTarget = null; // Clear move target when attacking
      return;
    }
  }
  
  // Check casters
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (!casterAlive[c]) continue;
    const dist = groundPoint.distanceTo(casterMeshes[c].position);
    if (dist <= clickRadius) {
      attackTarget = { type: 'caster', index: c };
      moveTarget = null;
      return;
    }
  }
  
  // Check resurrectors
  for (let r = 0; r < RESURRECTOR_COUNT; r++) {
    if (!resurrectorAlive[r]) continue;
    const dist = groundPoint.distanceTo(resurrectorMeshes[r].position);
    if (dist <= clickRadius) {
      attackTarget = { type: 'resurrector', index: r };
      moveTarget = null;
      return;
    }
  }

  // Check teleporters
  for (let t = 0; t < teleportersApi.getCount(); t++) {
    if (!teleportersApi.isAlive(t)) continue;
    const dist = groundPoint.distanceTo(teleportersApi.getPosition(t));
    if (dist <= clickRadius) {
      attackTarget = { type: 'teleporter', index: t };
      moveTarget = null;
      return;
    }
  }
  
  // Check boss (use circular hitbox radius for click detection)
  if (bossApi.isAlive()) {
    const dist = groundPoint.distanceTo(bossApi.getPosition());
    if (dist <= bossApi.getHitboxRadius()) {
      attackTarget = { type: 'boss', index: 0 };
      moveTarget = null;
      return;
    }
  }
  
  // If no monster clicked, set move target on terrain
  attackTarget = null; // Clear attack target when clicking terrain
  const p = groundPoint;
  const x = Math.max(TERRAIN_XZ_MIN, Math.min(TERRAIN_XZ_MAX, p.x));
  const z = Math.max(TERRAIN_XZ_MIN, Math.min(TERRAIN_XZ_MAX, p.z));
  if (moveTarget === null) moveTarget = new THREE.Vector3();
  moveTarget.set(x, 0, z);
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
  // Rotate character to face movement direction
  if (dist > 0.01) {
    character.rotation.y = Math.atan2(dx, dz);
  }
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
  
  // Collision with casters
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (!casterAlive[c]) continue;
    const casterPos = casterMeshes[c].position;
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
    const resPos = resurrectorMeshes[r].position;
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
  
  // Apply push to player
  if (collisionPushVec.lengthSq() > 0.0001) {
    character.position.addScaledVector(collisionPushVec, COLLISION_PUSH_STRENGTH * dt);
    character.position.y = 0;
  }
}

function updateAutoAttack(dt: number, gameTime: number): void {
  if (attackTarget === null) return;
  
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
    targetPos = casterMeshes[attackTarget.index].position;
    isAlive = casterAlive[attackTarget.index];
  } else if (attackTarget.type === 'resurrector') {
    if (attackTarget.index >= RESURRECTOR_COUNT || !resurrectorAlive[attackTarget.index]) {
      attackTarget = null;
      return;
    }
    targetPos = resurrectorMeshes[attackTarget.index].position;
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
  }
  
  if (!isAlive || !targetPos) {
    attackTarget = null;
    return;
  }
  
  const charPos = character.position;
  const dx = targetPos.x - charPos.x;
  const dz = targetPos.z - charPos.z;
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
  }
  
  // If in melee range, attack
  if (dist <= effectiveMeleeRange) {
    // Calculate direction to target
    const targetDir = new THREE.Vector3(dx, 0, dz).normalize();
    performMeleeAttack(gameTime, targetDir);
    // Clear move target when in range to attack
    moveTarget = null;
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
    }
  } else {
    // Bow: if in bow range, request arrow shot and stop moving
    const hasBow = equipment.getWeapon() === 'bow';
    if (hasBow && dist <= BOW_RANGE && gameTime - lastBowAttackTime >= BOW_COOLDOWN) {
      pendingBowShotTarget = targetPos.clone();
      lastBowAttackTime = gameTime;
      moveTarget = null;
      return;
    }
    // Only run toward the enemy when outside range. If we're already too close (dist <= stopDistance),
    // the computed position would be behind us and the character would run away — so don't set moveTarget.
    const stopDistance = hasBow
      ? BOW_RANGE - 0.1
      : effectiveMeleeRange - 0.1;
    if (dist > stopDistance && moveTarget === null) {
      moveTarget = new THREE.Vector3();
      const dirToTarget = new THREE.Vector3(dx, 0, dz).normalize();
      moveTarget.set(
        targetPos.x - dirToTarget.x * stopDistance,
        0,
        targetPos.z - dirToTarget.z * stopDistance
      );
    }
  }
}

/** Returns current world position of attack target, or null if none/invalid. */
function getTargetPosition(): THREE.Vector3 | null {
  if (attackTarget === null) return null;
  if (attackTarget.type === 'enemy') {
    if (attackTarget.index >= ENEMY_COUNT || !enemyAlive[attackTarget.index]) return null;
    return enemyPositions[attackTarget.index];
  }
  if (attackTarget.type === 'caster') {
    if (attackTarget.index >= CASTER_COUNT || !casterAlive[attackTarget.index]) return null;
    return casterMeshes[attackTarget.index].position.clone();
  }
  if (attackTarget.type === 'resurrector') {
    if (attackTarget.index >= RESURRECTOR_COUNT || !resurrectorAlive[attackTarget.index]) return null;
    return resurrectorMeshes[attackTarget.index].position.clone();
  }
  if (attackTarget.type === 'teleporter') {
    if (attackTarget.index >= teleportersApi.getCount() || !teleportersApi.isAlive(attackTarget.index)) return null;
    return teleportersApi.getPosition(attackTarget.index).clone();
  }
  if (attackTarget.type === 'boss') {
    if (!bossApi.isAlive()) return null;
    return bossApi.getPosition().clone();
  }
  return null;
}

// Projectile ballistics (parabolic arc, land at cursor)
const LAUNCH_HEIGHT = 0.5;
const MAX_PROJECTILE_RANGE = 28;

// Fireballs: right-click shoots toward cursor (see combat/Projectiles)
const FIREBALL_SPEED = 18;
const FIREBALL_RADIUS = 0.35;
const FIREBALL_TTL = 2;
const enemyAlive = Array.from({ length: ENEMY_COUNT }, () => false);
const enemyPosition = new THREE.Vector3();

// Enemy health (grunts) and skill damage (base values; scaled by stats)
const MAX_ENEMY_HEALTH = 30;
const enemyHealth = Array(ENEMY_COUNT).fill(MAX_ENEMY_HEALTH);
const BASE_FIREBALL_DAMAGE = 25;
const BASE_ROCK_DAMAGE = 18;
const BASE_SWORD_DAMAGE = 12;

function getMeleeDamage(): number {
  return Math.round(BASE_SWORD_DAMAGE * (strength / 10));
}

// Player melee attack (Space): directional slash in front, cooldown
const MELEE_RANGE = 2.0;
const MELEE_ARC = Math.PI / 3; // 60 degree arc in front
const MELEE_COOLDOWN = 0.55;
let lastMeleeTime = -999;

function performMeleeAttack(gameTime: number, targetDirection?: THREE.Vector3): void {
  if (gameTime - lastMeleeTime < MELEE_COOLDOWN) return;
  lastMeleeTime = gameTime;
  const state = buildCombatState();
  swordApi.performMeleeAttack(gameTime, targetDirection ?? null, state);
}
function getMagicDamage(): number {
  return Math.round(BASE_FIREBALL_DAMAGE * (intelligence / 10));
}

// Ranged weapons: cost ammo (except rock has infinite), damage scaled by dexterity
function getRangedDamage(): number {
  let dmg = Math.round(BASE_ROCK_DAMAGE * (dexterity / 10));
  if (isAugmentUnlocked('rock_heavy' as AugmentId)) dmg = Math.round(dmg * 1.25);
  return dmg;
}

/** Ranged weapon type: thrown = rock (infinite ammo, slow rate); bow = targeted shot. */
type RangedWeaponId = 'rock';
const RANGED_ROCK_COOLDOWN = 1.2; // slow attack rate for thrown rock
let lastRangedAttackTime = -999;
function getRockCooldown(): number {
  return isAugmentUnlocked('rock_quickdraw' as AugmentId) ? RANGED_ROCK_COOLDOWN * 0.7 : RANGED_ROCK_COOLDOWN;
}

// Bow: shoots at attack target when in range (equipped weapon)
const BOW_RANGE = 18;
const BOW_COOLDOWN = 0.85;
let lastBowAttackTime = -999;
let pendingBowShotTarget: THREE.Vector3 | null = null;

/** Returns true if the enemy died. */
function damageRedCube(j: number, amount: number): boolean {
  createHitMarker(enemyPositions[j], amount);
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

// Enemies move toward the player, stop in range, then explode after a delay (radius damage)
const ENEMY_SPEED = 3.5;
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

// Separation so enemies don't stack
const ENEMY_SEPARATION_RADIUS = 1.4;
const ENEMY_SEPARATION_STRENGTH = 2.5;
const enemyPositions = Array.from({ length: ENEMY_COUNT }, () => new THREE.Vector3());
const separationVec = new THREE.Vector3();
const collisionPushVec = new THREE.Vector3();

// Wave system: composition and spawn positions in Waves.ts; clear/spawn via callback
const tempSpawnPos = new THREE.Vector3();
const waveSpawnOut = { x: 0, y: 0, z: 0 };

const waves = createWaves({
  onStartWave(wave, composition, getSpawnPosition) {
    const { grunts, casters, resurrectors, teleporters } = composition;
    attackTarget = null;
    moveTarget = null;

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

    if (wave >= 1) {
      bossApi.spawn();
      addChatMessage('Boss has appeared!');
    }

    for (let j = 0; j < grunts; j++) {
      getSpawnPosition(j, waveSpawnOut);
      tempSpawnPos.set(waveSpawnOut.x, ENEMY_SIZE / 2, waveSpawnOut.z);
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
      tempSpawnPos.set(waveSpawnOut.x, CASTER_SIZE / 2, waveSpawnOut.z);
      casterMeshes[c].position.copy(tempSpawnPos);
      casterGroup.add(casterMeshes[c]);
      casterAlive[c] = true;
      casterHealth[c] = MAX_CASTER_HEALTH;
      lastCasterThrowTime[c] = -999;
      lastCasterResurrectTime[c] = -999;
    }

    for (let r = 0; r < resurrectors; r++) {
      getSpawnPosition(200 + r, waveSpawnOut);
      tempSpawnPos.set(waveSpawnOut.x, RESURRECTOR_SIZE / 2, waveSpawnOut.z);
      resurrectorMeshes[r].position.copy(tempSpawnPos);
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
  return {
    enemyPositions,
    enemyAlive,
    casterPositions: casterMeshes.map((m) => m.position),
    casterAlive,
    resurrectorPositions: resurrectorMeshes.map((m) => m.position),
    resurrectorAlive,
    teleporterPositions: teleportersApi.getPositions(),
    teleporterAlive: teleportersApi.getAlive(),
    bossPosition: bossApi.getPosition(),
    bossAlive: bossApi.isAlive(),
    enemySize: ENEMY_SIZE,
    casterSize: CASTER_SIZE,
    resurrectorSize: RESURRECTOR_SIZE,
    teleporterSize: TELEPORTER_SIZE,
    bossHitboxRadius: bossApi.getHitboxRadius(),
  };
}

const combatCallbacks = {
  damageEnemy: damageRedCube,
  damageCaster,
  damageResurrector,
  damageTeleporter: (t: number, amount: number) => teleportersApi.damage(t, amount),
  damageBoss: (amount: number) => bossApi.damage(amount),
};

const swordApi = createSword(scene, character, {
  getEquippedWeapon: () => equipment.getWeapon(),
  getMeleeDamage,
  getOrbitRadius: getSwordOrbitRadius,
  getHitRadius: getSwordHitRadius,
  getHitCooldown: getSwordHitCooldown,
  hasOrbitSword: () => isSkillUnlocked('sword'),
  hasTwinBlades: () => isAugmentUnlocked('sword_twin' as AugmentId),
  enemyCount: ENEMY_COUNT,
  casterCount: CASTER_COUNT,
  resurrectorCount: RESURRECTOR_COUNT,
}, combatCallbacks);

const EXPLOSION_HIT_RADIUS_BASE = CONST_FIREBALL_RADIUS * CONST_EXPLOSION_MAX_SCALE;
const EXPLOSION_HIT_RADIUS_INFERNO = EXPLOSION_HIT_RADIUS_BASE * 1.5;
function getExplosionHitRadius(): number {
  return isAugmentUnlocked('fireball_radius' as AugmentId) ? EXPLOSION_HIT_RADIUS_INFERNO : EXPLOSION_HIT_RADIUS_BASE;
}

const fireballsApi = createFireballs(scene, {
  getMagicDamage,
  hasExplosionAugment: () => isAugmentUnlocked('fireball_explosion' as AugmentId),
  getExplosionHitRadius,
}, combatCallbacks);

const rocksApi = createRocks(scene, { getRangedDamage }, combatCallbacks);
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
  if (!drop) return;
  if (drop === 'coin') {
    groundItemsApi.spawn(position.clone(), 'coin');
    return;
  }
  createPickup(position, drop);
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
  onCreateHitMarker: createHitMarker,
  onDeath: (position) => {
    addXp(XP_BOSS);
    trySpawnDrop(position, 'resurrector');
  },
  addExplosionEffect: (position) => {
    enemyAttackHitEffects.push(createEnemyAttackHitEffect(position));
  },
});

teleportersApi = createTeleporters(scene, {
  onCreateHitMarker: createHitMarker,
  onDeath: (_index, position) => {
    addXp(XP_TELEPORTER);
    trySpawnDrop(position, 'teleporter');
  },
  addIncomingPoisonPool: (position, gameTime) => {
    poisonPoolsApi.addIncomingPool(position, gameTime);
  },
});

// Fireball: right-click spawns via combat/Projectiles
clickOverlay.addEventListener('contextmenu', (e) => {
  if (isDead || isPaused || !isSkillUnlocked('fireball') || mana < FIREBALL_MANA_COST) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, isoCamera.three);
  const hits = raycaster.intersectObject(terrain);
  if (hits.length > 0) {
    setMana(mana - FIREBALL_MANA_COST);
    const target = hits[0].point.clone();
    target.y = 0;
    fireballsApi.spawn(character.position, target);
  }
});

// Throw skill: rock projectiles (Q key, toward cursor)
function throwRock(gameTime: number): void {
  if (!isSkillUnlocked('rock')) return;
  if (gameTime - lastRangedAttackTime < getRockCooldown()) return;
  lastRangedAttackTime = gameTime;
  raycaster.setFromCamera(pointer, isoCamera.three);
  const hits = raycaster.intersectObject(terrain);
  if (hits.length === 0) return;
  const target = hits[0].point.clone();
  target.y = 0;
  const origin = character.position.clone();
  const triple = isAugmentUnlocked('rock_triple' as AugmentId);
  const spread = triple ? 0.15 : 0;
  rocksApi.throw(origin, target, 0);
  if (triple) {
    rocksApi.throw(origin, target, spread);
    rocksApi.throw(origin, target, -spread);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    e.preventDefault();
    if (!isDead) setPaused(!isPaused);
    if (skillTreeOpen) setSkillTreeOpen(false);
    if (inventoryOpen) setInventoryOpen(false);
    return;
  }
  if (e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    if (skillTreeOpen) {
      setSkillTreeOpen(false);
    } else if (!isDead && !isPaused) {
      setSkillTreeOpen(true);
    }
    return;
  }
  if (e.key === 'i' || e.key === 'I') {
    e.preventDefault();
    if (inventoryOpen) {
      setInventoryOpen(false);
    } else if (!isDead && !isPaused) {
      setInventoryOpen(true);
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
    } else if (isSkillUnlocked('rock')) {
      throwRock(gameTime);
    }
  }
  if (e.key === ' ') {
    e.preventDefault();
    if (!isDead && !isPaused) performMeleeAttack(gameTime);
  }
});

function updateCasters(dt: number, gameTime: number): void {
  const charPos = character.position;
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (!casterAlive[c]) continue;
    const pos = casterMeshes[c].position;
    const dx = charPos.x - pos.x;
    const dz = charPos.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.02) {
      const targetDist = CASTER_PREFERRED_RANGE;
      const moveAmount = CASTER_SPEED * dt;
      // Only move toward player when beyond preferred range; stand still when within range
      if (dist > targetDist) {
        const move = Math.min(moveAmount, dist - targetDist);
        pos.x += (dx / dist) * move;
        pos.z += (dz / dist) * move;
      }
      // When within range: do not back away
    }
    
    // Collision with player
    collisionPushVec.set(0, 0, 0);
    const toPlayer = new THREE.Vector3().subVectors(pos, charPos);
    const distToPlayer = toPlayer.length();
    const minDistToPlayer = PLAYER_COLLISION_RADIUS + CASTER_COLLISION_RADIUS;
    if (distToPlayer < minDistToPlayer && distToPlayer > 0.001) {
      const overlap = minDistToPlayer - distToPlayer;
      toPlayer.normalize();
      collisionPushVec.addScaledVector(toPlayer, overlap * COLLISION_PUSH_STRENGTH);
    }
    
    // Collision with enemies
    for (let j = 0; j < ENEMY_COUNT; j++) {
      if (!enemyAlive[j]) continue;
      const toEnemy = new THREE.Vector3().subVectors(pos, enemyPositions[j]);
      const d = toEnemy.length();
      const minDist = CASTER_COLLISION_RADIUS + ENEMY_COLLISION_RADIUS;
      if (d < minDist && d > 0.001) {
        const overlap = minDist - d;
        toEnemy.normalize();
        collisionPushVec.addScaledVector(toEnemy, overlap * COLLISION_PUSH_STRENGTH);
      }
    }
    
    // Collision with other casters
    for (let c2 = 0; c2 < CASTER_COUNT; c2++) {
      if (c2 === c || !casterAlive[c2]) continue;
      const casterPos = casterMeshes[c2].position;
      const toCaster = new THREE.Vector3().subVectors(pos, casterPos);
      const d = toCaster.length();
      const minDist = CASTER_COLLISION_RADIUS * 2;
      if (d < minDist && d > 0.001) {
        const overlap = minDist - d;
        toCaster.normalize();
        collisionPushVec.addScaledVector(toCaster, overlap * COLLISION_PUSH_STRENGTH);
      }
    }
    
    // Collision with resurrectors
    for (let r = 0; r < RESURRECTOR_COUNT; r++) {
      if (!resurrectorAlive[r]) continue;
      const resPos = resurrectorMeshes[r].position;
      const toRes = new THREE.Vector3().subVectors(pos, resPos);
      const d = toRes.length();
      const minDist = CASTER_COLLISION_RADIUS + RESURRECTOR_COLLISION_RADIUS;
      if (d < minDist && d > 0.001) {
        const overlap = minDist - d;
        toRes.normalize();
        collisionPushVec.addScaledVector(toRes, overlap * COLLISION_PUSH_STRENGTH);
      }
    }
    
    // Collision with boss
    if (bossApi.isAlive()) {
      const toBoss = new THREE.Vector3().subVectors(pos, bossApi.getPosition());
      const dist = toBoss.length();
      const minDist = CASTER_COLLISION_RADIUS + bossApi.getHitboxRadius();
      if (dist < minDist && dist > 0.001) {
        const overlap = minDist - dist;
        toBoss.normalize();
        collisionPushVec.addScaledVector(toBoss, overlap * COLLISION_PUSH_STRENGTH);
      }
    }
    
    // Apply collision push
    if (collisionPushVec.lengthSq() > 0.0001) {
      pos.addScaledVector(collisionPushVec, dt);
    }
    
    pos.y = CASTER_SIZE / 2;

    if (gameTime - lastCasterResurrectTime[c] >= RESURRECT_COOLDOWN && bodies.length > 0) {
      let nearestIdx = -1;
      let nearestDist = RESURRECT_RANGE;
      for (let b = 0; b < bodies.length; b++) {
        const body = bodies[b];
        if (body.enemyIndex >= waves.getLevelGruntsCount()) continue; // only resurrect grunts that are in play this level
        const d = pos.distanceTo(body.position);
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
  }
}

function updateResurrectors(dt: number, gameTime: number): void {
  const charPos = character.position;
  for (let r = 0; r < RESURRECTOR_COUNT; r++) {
    if (!resurrectorAlive[r]) continue;
    const pos = resurrectorMeshes[r].position;
    const dx = charPos.x - pos.x;
    const dz = charPos.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.02) {
      const targetDist = RESURRECTOR_PREFERRED_RANGE;
      const moveAmount = RESURRECTOR_SPEED * dt;
      if (dist > targetDist) {
        const move = Math.min(moveAmount, dist - targetDist);
        pos.x += (dx / dist) * move;
        pos.z += (dz / dist) * move;
      } else if (dist < targetDist) {
        const move = Math.min(moveAmount, targetDist - dist);
        pos.x -= (dx / dist) * move;
        pos.z -= (dz / dist) * move;
      }
    }
    
    // Collision with player
    collisionPushVec.set(0, 0, 0);
    const toPlayer = new THREE.Vector3().subVectors(pos, charPos);
    const distToPlayer = toPlayer.length();
    const minDistToPlayer = PLAYER_COLLISION_RADIUS + RESURRECTOR_COLLISION_RADIUS;
    if (distToPlayer < minDistToPlayer && distToPlayer > 0.001) {
      const overlap = minDistToPlayer - distToPlayer;
      toPlayer.normalize();
      collisionPushVec.addScaledVector(toPlayer, overlap * COLLISION_PUSH_STRENGTH);
    }
    
    // Collision with enemies
    for (let j = 0; j < ENEMY_COUNT; j++) {
      if (!enemyAlive[j]) continue;
      const toEnemy = new THREE.Vector3().subVectors(pos, enemyPositions[j]);
      const d = toEnemy.length();
      const minDist = RESURRECTOR_COLLISION_RADIUS + ENEMY_COLLISION_RADIUS;
      if (d < minDist && d > 0.001) {
        const overlap = minDist - d;
        toEnemy.normalize();
        collisionPushVec.addScaledVector(toEnemy, overlap * COLLISION_PUSH_STRENGTH);
      }
    }
    
    // Collision with casters
    for (let c = 0; c < CASTER_COUNT; c++) {
      if (!casterAlive[c]) continue;
      const casterPos = casterMeshes[c].position;
      const toCaster = new THREE.Vector3().subVectors(pos, casterPos);
      const d = toCaster.length();
      const minDist = RESURRECTOR_COLLISION_RADIUS + CASTER_COLLISION_RADIUS;
      if (d < minDist && d > 0.001) {
        const overlap = minDist - d;
        toCaster.normalize();
        collisionPushVec.addScaledVector(toCaster, overlap * COLLISION_PUSH_STRENGTH);
      }
    }
    
    // Collision with other resurrectors
    for (let r2 = 0; r2 < RESURRECTOR_COUNT; r2++) {
      if (r2 === r || !resurrectorAlive[r2]) continue;
      const resPos = resurrectorMeshes[r2].position;
      const toRes = new THREE.Vector3().subVectors(pos, resPos);
      const d = toRes.length();
      const minDist = RESURRECTOR_COLLISION_RADIUS * 2;
      if (d < minDist && d > 0.001) {
        const overlap = minDist - d;
        toRes.normalize();
        collisionPushVec.addScaledVector(toRes, overlap * COLLISION_PUSH_STRENGTH);
      }
    }
    
    // Collision with boss
    if (bossApi.isAlive()) {
      const toBoss = new THREE.Vector3().subVectors(pos, bossApi.getPosition());
      const dist = toBoss.length();
      const minDist = RESURRECTOR_COLLISION_RADIUS + bossApi.getHitboxRadius();
      if (dist < minDist && dist > 0.001) {
        const overlap = minDist - dist;
        toBoss.normalize();
        collisionPushVec.addScaledVector(toBoss, overlap * COLLISION_PUSH_STRENGTH);
      }
    }
    
    // Apply collision push
    if (collisionPushVec.lengthSq() > 0.0001) {
      pos.addScaledVector(collisionPushVec, dt);
    }
    
    pos.y = RESURRECTOR_SIZE / 2;

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
        resurrectEnemyInstance(enemies, body.enemyIndex, body.position);
        enemyPositions[body.enemyIndex].copy(body.position);
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

function updateEnemies(dt: number, gameTime: number): void {
  const charPos = character.position;

  // Pass 1: move toward character only when outside explosion range and in 'moving' state
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
      } else if (enemyExplosionState[j] === 'cooldown' && gameTime - enemyExplosionLastTime[j] >= ENEMY_EXPLOSION_COOLDOWN) {
        enemyExplosionState[j] = 'charging';
        enemyExplosionChargeStart[j] = gameTime;
      }
    } else {
      enemyExplosionState[j] = 'moving';
      if (dist > 0.01) {
        const move = Math.min(ENEMY_SPEED * dt, dist);
        pos.x += (dx / dist) * move;
        pos.z += (dz / dist) * move;
      }
    }

    pos.y = ENEMY_SIZE / 2;
  }

  // Pass 2: separation and collision - push apart from nearby entities
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    separationVec.set(0, 0, 0);
    const pos = enemyPositions[j];
    
    // Collision with player
    const toPlayer = new THREE.Vector3().subVectors(pos, charPos);
    const distToPlayer = toPlayer.length();
    const minDistToPlayer = PLAYER_COLLISION_RADIUS + ENEMY_COLLISION_RADIUS;
    if (distToPlayer < minDistToPlayer && distToPlayer > 0.001) {
      const overlap = minDistToPlayer - distToPlayer;
      toPlayer.normalize();
      separationVec.addScaledVector(toPlayer, overlap * COLLISION_PUSH_STRENGTH);
    }
    
    // Collision with other enemies
    for (let k = 0; k < ENEMY_COUNT; k++) {
      if (k === j || !enemyAlive[k]) continue;
      const d = pos.distanceTo(enemyPositions[k]);
      const minDist = ENEMY_COLLISION_RADIUS * 2;
      if (d < minDist && d > 0.001) {
        const overlap = minDist - d;
        enemyPosition.copy(pos).sub(enemyPositions[k]).normalize();
        separationVec.addScaledVector(enemyPosition, overlap * COLLISION_PUSH_STRENGTH);
      } else if (d < ENEMY_SEPARATION_RADIUS && d > 0.001) {
        // Soft separation for enemies that are close but not overlapping
        enemyPosition.copy(pos).sub(enemyPositions[k]).normalize().multiplyScalar(1 - d / ENEMY_SEPARATION_RADIUS);
        separationVec.add(enemyPosition);
      }
    }
    
    // Collision with casters
    for (let c = 0; c < CASTER_COUNT; c++) {
      if (!casterAlive[c]) continue;
      const casterPos = casterMeshes[c].position;
      const toCaster = new THREE.Vector3().subVectors(pos, casterPos);
      const dist = toCaster.length();
      const minDist = ENEMY_COLLISION_RADIUS + CASTER_COLLISION_RADIUS;
      if (dist < minDist && dist > 0.001) {
        const overlap = minDist - dist;
        toCaster.normalize();
        separationVec.addScaledVector(toCaster, overlap * COLLISION_PUSH_STRENGTH);
      }
    }
    
    // Collision with resurrectors
    for (let r = 0; r < RESURRECTOR_COUNT; r++) {
      if (!resurrectorAlive[r]) continue;
      const resPos = resurrectorMeshes[r].position;
      const toRes = new THREE.Vector3().subVectors(pos, resPos);
      const dist = toRes.length();
      const minDist = ENEMY_COLLISION_RADIUS + RESURRECTOR_COLLISION_RADIUS;
      if (dist < minDist && dist > 0.001) {
        const overlap = minDist - dist;
        toRes.normalize();
        separationVec.addScaledVector(toRes, overlap * COLLISION_PUSH_STRENGTH);
      }
    }
    
    // Collision with boss
    if (bossApi.isAlive()) {
      const toBoss = new THREE.Vector3().subVectors(pos, bossApi.getPosition());
      const dist = toBoss.length();
      const minDist = ENEMY_COLLISION_RADIUS + bossApi.getHitboxRadius();
      if (dist < minDist && dist > 0.001) {
        const overlap = minDist - dist;
        toBoss.normalize();
        separationVec.addScaledVector(toBoss, overlap * COLLISION_PUSH_STRENGTH);
      }
    }
    
    enemyPositions[j].addScaledVector(separationVec, dt);
    enemyPositions[j].y = ENEMY_SIZE / 2;
  }

  // Pass 3: update enemy positions
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    const enemy = enemies.children[j] as THREE.Object3D;
    if (enemy) {
      // Position sprite at ENEMY_SIZE/2 (sprites are positioned at their center)
      enemy.position.set(enemyPositions[j].x, ENEMY_SIZE / 2, enemyPositions[j].z);
    }
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

const gameLoop = new GameLoop(
  (dt) => {
    if (isPaused) return;
    gameTime += dt;
    if (!isDead) runTime += dt;
    isoCamera.setWorldFocus(character.position.x, character.position.y, character.position.z);
    if (isDead) return;
    setMana(mana + MANA_REGEN_PER_SECOND * dt);
    
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
    if (waves.isWaveComplete(() => isAnyEnemyAlive())) {
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
    updateCharacterMove(dt);
    updatePlayerCollisions(dt);
    const combatState = buildCombatState();
    swordApi.update(dt, gameTime, combatState);
    updateAutoAttack(dt, gameTime);
    updateEnemies(dt, gameTime);
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
    fireballsApi.update(dt, combatState);
    rocksApi.update(dt, combatState);
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
    const camera = isoCamera.three;
    const hudState: HUDState = {
      canvasWidth: cw,
      canvasHeight: ch,
      camera,
      runTime,
      smoothedFps,
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
      casterPositions: casterMeshes.map((m) => m.position),
      casterAlive,
      casterHealth,
      casterMaxHealth: MAX_CASTER_HEALTH,
      resurrectorPositions: resurrectorMeshes.map((m) => m.position),
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
    };
    hud.update(hudState);
    bossApi.getHitboxIndicator().visible = bossApi.isAlive();
    // Update floating hit markers
    updateHitMarkers(now / 1000, camera, cw, ch);
    groundItemsApi.updateLabels();
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
