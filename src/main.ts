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

const fpsEl = document.createElement('div');
fpsEl.id = 'fps';
fpsEl.textContent = '— FPS';
container.appendChild(fpsEl);

// Run timer (resets on respawn; best time persisted for competition)
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
const timerEl = document.createElement('div');
timerEl.id = 'timer';
timerEl.textContent = 'Time: 0:00';
container.appendChild(timerEl);

// Health & Mana bars
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
const skillTreeHintBar = document.createElement('div');
skillTreeHintBar.textContent = 'Space — Melee  |  K — Skill tree';
skillTreeHintBar.style.cssText = 'font:10px sans-serif;color:rgba(255,255,255,0.5);margin-top:4px;';
barsEl.appendChild(skillTreeHintBar);
const waveLabelEl = document.createElement('div');
waveLabelEl.style.cssText = 'font:10px sans-serif;color:rgba(255,255,255,0.6);margin-top:6px;margin-bottom:2px;';
waveLabelEl.textContent = 'Current wave';
const waveEl = document.createElement('div');
waveEl.style.cssText = 'font:14px sans-serif;color:#e8c050;font-weight:bold;';
waveEl.textContent = '1';
barsEl.appendChild(waveLabelEl);
barsEl.appendChild(waveEl);

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
  activePrayer = null; // Clear prayer on respawn
  updatePrayerButtons();
  startWave(1);
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
levelUpNotifier.callback = () => {
  if (getSkillPoints() > 0 || statPointsToAllocate > 0) setSkillTreeOpen(true);
};

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
const resurrectorHealthBarEls: { wrap: HTMLDivElement; fill: HTMLDivElement }[] = [];
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

createIsoLights(scene);

const character = createPlaceholderCharacter([10, 0, 10]);
scene.add(character);

// Burning effect particles
const burningParticlesGroup = new THREE.Group();
scene.add(burningParticlesGroup);
const burningParticles: THREE.Mesh[] = [];

function createBurningParticle(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.05, 6, 6);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.8,
  });
  return new THREE.Mesh(geometry, material);
}

function updateBurningEffect(gameTime: number): void {
  // Remove old particles
  for (const particle of burningParticles) {
    burningParticlesGroup.remove(particle);
    (particle.geometry as THREE.BufferGeometry).dispose();
    (particle.material as THREE.Material).dispose();
  }
  burningParticles.length = 0;
  
  if (!playerBurning) return;
  
  // Create particles around character
  const particleCount = 8;
  const charPos = character.position;
  const burnAge = gameTime - playerBurnStartTime;
  const burnProgress = burnAge / BOSS_FIREBALL_BURN_DURATION;
  
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2;
    const radius = 0.4 + Math.sin(burnProgress * Math.PI * 4 + angle) * 0.1;
    const height = 0.3 + Math.sin(burnProgress * Math.PI * 6 + angle * 2) * 0.2;
    
    const particle = createBurningParticle();
    particle.position.set(
      charPos.x + Math.cos(angle) * radius,
      charPos.y + height,
      charPos.z + Math.sin(angle) * radius
    );
    
    // Fade out as burn ends
    const mat = particle.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.8 * (1 - burnProgress);
    
    burningParticlesGroup.add(particle);
    burningParticles.push(particle);
  }
  
  // Add emissive glow to character when burning
  character.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
      const mat = child.material;
      if (playerBurning) {
        mat.emissive.setHex(0xff2200);
        mat.emissiveIntensity = 0.3 + Math.sin(burnProgress * Math.PI * 8) * 0.2;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }
  });
}

// Equipped sword (held by character, swings during melee attacks)
const equippedSword = createSwordMesh();
equippedSword.position.set(0.3, 0.4, -0.2); // Position at character's side/hip
equippedSword.rotation.set(0, Math.PI / 4, -Math.PI / 6); // Angle it naturally
character.add(equippedSword);

// Sword swing animation state
let swordSwingStartTime = -999;
const SWORD_SWING_DURATION = 0.3; // Duration of swing animation
const SWORD_IDLE_ROTATION = { x: 0, y: Math.PI / 4, z: -Math.PI / 6 };
const SWORD_IDLE_POSITION = { x: 0.3, y: 0.4, z: -0.2 };

// Orbiting sword (orbits character, damages enemies on contact)
const SWORD_ORBIT_RADIUS = 1.4;
const SWORD_ANGULAR_SPEED = Math.PI * 2; // one full rotation per second
const SWORD_HIT_RADIUS = 0.6;
const SWORD_HIT_COOLDOWN = 0.4; // seconds before same enemy can be hit again

function getSwordOrbitRadius(): number {
  return isAugmentUnlocked('sword_whirl' as AugmentId) ? SWORD_ORBIT_RADIUS * 1.25 : SWORD_ORBIT_RADIUS;
}
function getSwordHitRadius(): number {
  return isAugmentUnlocked('sword_whirl' as AugmentId) ? SWORD_HIT_RADIUS * 1.2 : SWORD_HIT_RADIUS;
}
function getSwordHitCooldown(): number {
  return isAugmentUnlocked('sword_quickslash' as AugmentId) ? SWORD_HIT_COOLDOWN * 0.6 : SWORD_HIT_COOLDOWN;
}

function createSwordMesh(): THREE.Group {
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
}

const swordOrbit = new THREE.Group();
const swordMesh = createSwordMesh();
swordMesh.position.set(SWORD_ORBIT_RADIUS, 0.6, 0);
swordMesh.rotation.y = Math.PI / 2;
swordOrbit.add(swordMesh);
swordOrbit.visible = false;
scene.add(swordOrbit);

const swordOrbit2 = new THREE.Group();
const swordMesh2 = createSwordMesh();
swordMesh2.position.set(SWORD_ORBIT_RADIUS, 0.6, 0);
swordMesh2.rotation.y = Math.PI / 2;
swordOrbit2.add(swordMesh2);
swordOrbit2.visible = false;
scene.add(swordOrbit2);

const swordWorldPos = new THREE.Vector3();
const swordWorldPos2 = new THREE.Vector3();
const lastSwordHitByEnemy: number[] = Array(ENEMY_COUNT).fill(-999);
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

for (let c = 0; c < CASTER_COUNT; c++) {
  const bar = createEnemyHealthBar();
  bar.fill.style.background = 'linear-gradient(90deg,#8040a0,#b060c0)';
  enemyHealthBarsContainer.appendChild(bar.wrap);
  casterHealthBarEls.push(bar);
}
scene.add(casterGroup);

// Resurrector enemies: dark teal capsules that resurrect fallen grunts (spawn from wave 5, after double casters)
const RESURRECTOR_COUNT = 3;
const RESURRECTOR_SPEED = 1.8;
const RESURRECTOR_SIZE = 0.55;
const RESURRECTOR_PREFERRED_RANGE = 8;

const resurrectorGroup = new THREE.Group();
const resurrectorMeshes: THREE.Mesh[] = [];
const resurrectorAlive: boolean[] = [];
const lastResurrectorResurrectTime: number[] = [];

for (let i = 0; i < RESURRECTOR_COUNT; i++) {
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(RESURRECTOR_SIZE * 0.55, RESURRECTOR_SIZE * 1.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x2d5a4a, roughness: 0.7, metalness: 0.05, emissive: 0x0a2018 })
  );
  mesh.position.set(8 + Math.random() * 16, RESURRECTOR_SIZE / 2, 8 + Math.random() * 16);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  resurrectorGroup.add(mesh);
  resurrectorMeshes.push(mesh);
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

for (let r = 0; r < RESURRECTOR_COUNT; r++) {
  const bar = createEnemyHealthBar();
  bar.fill.style.background = 'linear-gradient(90deg,#2d5a4a,#4a7a6a)';
  enemyHealthBarsContainer.appendChild(bar.wrap);
  resurrectorHealthBarEls.push(bar);
}
scene.add(resurrectorGroup);

// Boss: stationary in the middle of the map, throws exploding fireballs
const BOSS_SIZE = 1.2;
const BOSS_POSITION = new THREE.Vector3(24, 0, 24); // Center of 48x48 map
const BOSS_HITBOX_RADIUS = 6.0; // Circular hitbox radius
const MAX_BOSS_HEALTH = 500;
let bossHealth = MAX_BOSS_HEALTH;
let bossAlive = false;
const BOSS_FIREBALL_COOLDOWN = 3.5;
const BOSS_FIREBALL_RADIUS = 0.4;
const BOSS_FIREBALL_DAMAGE = 15;
const BOSS_FIREBALL_EXPLOSION_RADIUS = 3.5;
const BOSS_FIREBALL_WARNING_DURATION = 2.0; // Time from indicator to explosion (also travel time)
const BOSS_FIREBALL_BURN_DURATION = 4.0; // How long player burns for
const BOSS_FIREBALL_BURN_DAMAGE_PER_SECOND = 3.0; // Damage per second while burning
const BOSS_FIREBALL_BURN_TICK_INTERVAL = 0.5; // Damage tick interval
let lastBossFireballTime = -999;

// Player burning status
let playerBurning = false;
let playerBurnStartTime = -999;
let lastBurnTickTime = -999;

const bossGroup = new THREE.Group();
let bossMesh: THREE.Mesh | null = null;

// Create boss mesh (larger, more menacing)
function createBossMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(BOSS_SIZE * 0.6, BOSS_SIZE * 1.5, 8),
    new THREE.MeshStandardMaterial({ 
      color: 0x8b0000, 
      roughness: 0.6, 
      metalness: 0.2, 
      emissive: 0x4a0000,
      emissiveIntensity: 0.3
    })
  );
  mesh.position.copy(BOSS_POSITION);
  mesh.position.y = (BOSS_SIZE / 2) * 10; // Adjust Y for 10x scale to keep bottom on ground
  mesh.scale.set(10, 10, 10); // Make boss 10x bigger
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

if (bossMesh === null) {
  bossMesh = createBossMesh();
  bossGroup.add(bossMesh);
}
scene.add(bossGroup);

// Boss hitbox indicator (circle on ground)
const bossHitboxIndicator = new THREE.Mesh(
  new THREE.RingGeometry(BOSS_HITBOX_RADIUS * 0.95, BOSS_HITBOX_RADIUS, 32),
  new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
);
bossHitboxIndicator.position.copy(BOSS_POSITION);
bossHitboxIndicator.position.y = 0.05;
bossHitboxIndicator.rotation.x = -Math.PI / 2;
scene.add(bossHitboxIndicator);

// Boss health bar
const bossHealthBarEl = createEnemyHealthBar();
bossHealthBarEl.fill.style.background = 'linear-gradient(90deg,#8b0000,#c03030)';
enemyHealthBarsContainer.appendChild(bossHealthBarEl.wrap);

/** Returns true if the boss died. */
function damageBoss(amount: number): boolean {
  createHitMarker(BOSS_POSITION, amount);
  bossHealth = Math.max(0, bossHealth - amount);
  if (bossHealth <= 0) {
    addXp(200); // Boss gives lots of XP
    trySpawnDrop(BOSS_POSITION.clone(), 'resurrector'); // Use resurrector drop table for now
    bossGroup.remove(bossMesh!);
    bossAlive = false;
    return true;
  }
  return false;
}

// Boss fireball with ground indicators
interface BossFireball {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  ttl: number;
  targetPosition: THREE.Vector3;
  warningTime: number; // Time when indicator appeared
  indicatorOuter: THREE.Mesh; // Outer ring (static size)
  indicatorInner: THREE.Mesh; // Inner ring (expands)
}

const bossFireballs: BossFireball[] = [];
const bossFireballIndicatorGroup = new THREE.Group();
scene.add(bossFireballIndicatorGroup);

function createBossFireballMesh(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(BOSS_FIREBALL_RADIUS, 12, 10);
  const material = new THREE.MeshStandardMaterial({
    color: 0xff4400,
    emissive: 0xff2200,
    emissiveIntensity: 0.7,
    roughness: 0.3,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

function createBossFireballIndicator(targetPos: THREE.Vector3): { outer: THREE.Mesh; inner: THREE.Mesh } {
  // Outer ring: static size showing explosion radius
  const outerGeometry = new THREE.RingGeometry(
    BOSS_FIREBALL_EXPLOSION_RADIUS * 0.9,
    BOSS_FIREBALL_EXPLOSION_RADIUS,
    32
  );
  const outerMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const outerMesh = new THREE.Mesh(outerGeometry, outerMaterial);
  outerMesh.position.copy(targetPos);
  outerMesh.position.y = 0.1;
  outerMesh.rotation.x = -Math.PI / 2;
  
  // Inner ring: starts small, expands to outer ring
  const innerGeometry = new THREE.RingGeometry(0.1, 0.3, 24);
  const innerMaterial = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
  innerMesh.position.copy(targetPos);
  innerMesh.position.y = 0.11; // Slightly above outer ring
  innerMesh.rotation.x = -Math.PI / 2;
  
  bossFireballIndicatorGroup.add(outerMesh);
  bossFireballIndicatorGroup.add(innerMesh);
  
  return { outer: outerMesh, inner: innerMesh };
}

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

// Auto-attack target tracking
type AttackTargetType = 'enemy' | 'caster' | 'resurrector' | 'boss';
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
  
  // Check boss (use circular hitbox radius for click detection)
  if (bossAlive) {
    const dist = groundPoint.distanceTo(BOSS_POSITION);
    if (dist <= BOSS_HITBOX_RADIUS) {
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
  
  // Collision with boss (circular hitbox)
  if (bossAlive) {
    const toBoss = new THREE.Vector3().subVectors(charPos, BOSS_POSITION);
    const dist = toBoss.length();
    const minDist = PLAYER_COLLISION_RADIUS + BOSS_HITBOX_RADIUS;
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

function updateEquippedSword(gameTime: number): void {
  const swingAge = gameTime - swordSwingStartTime;
  const isSwinging = swingAge >= 0 && swingAge < SWORD_SWING_DURATION;
  
  if (isSwinging) {
    // Animate swing: arc motion from side to front
    const t = swingAge / SWORD_SWING_DURATION;
    // Ease out for snappy swing
    const easeT = 1 - Math.pow(1 - t, 3);
    
    // Arc motion: swing from right side forward and up, then down
    const arcAngle = easeT * Math.PI; // 180 degree arc
    const arcRadius = 0.6;
    const forwardDist = Math.sin(arcAngle) * arcRadius;
    const upDist = Math.sin(arcAngle * 0.5) * 0.2; // Peak at middle of swing
    const sideDist = (1 - Math.cos(arcAngle)) * arcRadius * 0.3;
    
    equippedSword.position.x = SWORD_IDLE_POSITION.x - sideDist;
    equippedSword.position.y = SWORD_IDLE_POSITION.y + upDist;
    equippedSword.position.z = SWORD_IDLE_POSITION.z + forwardDist;
    
    // Rotate sword to follow the arc (point forward during swing)
    equippedSword.rotation.x = SWORD_IDLE_ROTATION.x + arcAngle * 0.4;
    equippedSword.rotation.y = SWORD_IDLE_ROTATION.y - arcAngle * 0.6;
    equippedSword.rotation.z = SWORD_IDLE_ROTATION.z + arcAngle * 0.3;
  } else {
    // Return to idle position smoothly
    const returnT = Math.min(1, (swingAge - SWORD_SWING_DURATION) / 0.15);
    const easeReturn = 1 - Math.pow(1 - returnT, 2); // Ease out
    
    // Interpolate from swing end position to idle
    const swingEndX = SWORD_IDLE_POSITION.x - 0.18;
    const swingEndY = SWORD_IDLE_POSITION.y + 0.1;
    const swingEndZ = SWORD_IDLE_POSITION.z + 0.6;
    const swingEndRotX = SWORD_IDLE_ROTATION.x + Math.PI * 0.4;
    const swingEndRotY = SWORD_IDLE_ROTATION.y - Math.PI * 0.6;
    const swingEndRotZ = SWORD_IDLE_ROTATION.z + Math.PI * 0.3;
    
    equippedSword.position.x = swingEndX + (SWORD_IDLE_POSITION.x - swingEndX) * easeReturn;
    equippedSword.position.y = swingEndY + (SWORD_IDLE_POSITION.y - swingEndY) * easeReturn;
    equippedSword.position.z = swingEndZ + (SWORD_IDLE_POSITION.z - swingEndZ) * easeReturn;
    
    equippedSword.rotation.x = swingEndRotX + (SWORD_IDLE_ROTATION.x - swingEndRotX) * easeReturn;
    equippedSword.rotation.y = swingEndRotY + (SWORD_IDLE_ROTATION.y - swingEndRotY) * easeReturn;
    equippedSword.rotation.z = swingEndRotZ + (SWORD_IDLE_ROTATION.z - swingEndRotZ) * easeReturn;
    
    // Snap to idle if close enough
    if (returnT >= 1) {
      equippedSword.position.set(SWORD_IDLE_POSITION.x, SWORD_IDLE_POSITION.y, SWORD_IDLE_POSITION.z);
      equippedSword.rotation.set(SWORD_IDLE_ROTATION.x, SWORD_IDLE_ROTATION.y, SWORD_IDLE_ROTATION.z);
    }
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
  } else if (attackTarget.type === 'boss') {
    if (!bossAlive) {
      attackTarget = null;
      return;
    }
    targetPos = BOSS_POSITION;
    isAlive = bossAlive;
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
    effectiveMeleeRange = BOSS_HITBOX_RADIUS + MELEE_RANGE;
  } else if (attackTarget.type === 'enemy') {
    effectiveMeleeRange = ENEMY_COLLISION_RADIUS + MELEE_RANGE;
  } else if (attackTarget.type === 'caster') {
    effectiveMeleeRange = CASTER_COLLISION_RADIUS + MELEE_RANGE;
  } else if (attackTarget.type === 'resurrector') {
    effectiveMeleeRange = RESURRECTOR_COLLISION_RADIUS + MELEE_RANGE;
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
    } else if (attackTarget.type === 'boss' && !bossAlive) {
      attackTarget = null;
    }
  } else {
    // Path to target, but stop at melee range from target's edge
    if (moveTarget === null) moveTarget = new THREE.Vector3();
    // Calculate position at melee range from target
    const dirToTarget = new THREE.Vector3(dx, 0, dz).normalize();
    const stopDistance = effectiveMeleeRange - 0.1; // Stop slightly before to avoid overshooting
    moveTarget.set(
      targetPos.x - dirToTarget.x * stopDistance,
      0,
      targetPos.z - dirToTarget.z * stopDistance
    );
  }
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
  
  const charPos = character.position;
  
  // Determine attack direction
  let attackDir: THREE.Vector3;
  if (targetDirection) {
    attackDir = targetDirection.clone().normalize();
    // Rotate character to face the target
    character.rotation.y = Math.atan2(attackDir.x, attackDir.z);
  } else {
    // If no target direction provided (e.g., spacebar), use character's current facing
    attackDir = new THREE.Vector3(
      Math.sin(character.rotation.y),
      0,
      Math.cos(character.rotation.y)
    );
  }
  
  // Start sword swing animation
  swordSwingStartTime = gameTime;
  
  // Check enemies - only hit those in front
  for (let j = 0; j < ENEMY_COUNT; j++) {
    if (!enemyAlive[j]) continue;
    const toEnemy = new THREE.Vector3().subVectors(enemyPositions[j], charPos);
    const dist = toEnemy.length();
    if (dist <= MELEE_RANGE && dist > 0.01) {
      toEnemy.normalize();
      const dot = attackDir.dot(toEnemy);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle <= MELEE_ARC / 2) {
        damageRedCube(j, getMeleeDamage());
      }
    }
  }
  
  // Check casters - only hit those in front
  for (let c = 0; c < CASTER_COUNT; c++) {
    if (!casterAlive[c]) continue;
    const toCaster = new THREE.Vector3().subVectors(casterMeshes[c].position, charPos);
    const dist = toCaster.length();
    if (dist <= MELEE_RANGE && dist > 0.01) {
      toCaster.normalize();
      const dot = attackDir.dot(toCaster);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle <= MELEE_ARC / 2) {
        damageCaster(c, getMeleeDamage());
      }
    }
  }
  
  // Check resurrectors - only hit those in front
  for (let r = 0; r < RESURRECTOR_COUNT; r++) {
    if (!resurrectorAlive[r]) continue;
    const toResurrector = new THREE.Vector3().subVectors(resurrectorMeshes[r].position, charPos);
    const dist = toResurrector.length();
    if (dist <= MELEE_RANGE && dist > 0.01) {
      toResurrector.normalize();
      const dot = attackDir.dot(toResurrector);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle <= MELEE_ARC / 2) {
        damageResurrector(r, getMeleeDamage());
      }
    }
  }
  
  // Check boss - only hit if in front and within melee range of hitbox
  if (bossAlive) {
    const toBoss = new THREE.Vector3().subVectors(BOSS_POSITION, charPos);
    const dist = toBoss.length();
    if (dist <= BOSS_HITBOX_RADIUS + MELEE_RANGE && dist > 0.01) {
      toBoss.normalize();
      const dot = attackDir.dot(toBoss);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle <= MELEE_ARC / 2) {
        damageBoss(getMeleeDamage());
      }
    }
  }
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

/** Ranged weapon type: thrown = rock (infinite ammo, slow rate); future: bow, gun, etc. */
type RangedWeaponId = 'rock';
const RANGED_ROCK_COOLDOWN = 1.2; // slow attack rate for thrown rock
let lastRangedAttackTime = -999;
function getRockCooldown(): number {
  return isAugmentUnlocked('rock_quickdraw' as AugmentId) ? RANGED_ROCK_COOLDOWN * 0.7 : RANGED_ROCK_COOLDOWN;
}

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

// Wave structure (Inferno-style): fixed waves, spawn randomly in battlespace, consistent seed
const WAVE_SEED = 12345;
const BATTLE_MIN = 6;
const BATTLE_MAX = 42;

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getWaveSpawnPosition(wave: number, index: number, out: THREE.Vector3): void {
  const rng = seededRandom(WAVE_SEED + wave * 1000 + index);
  out.x = BATTLE_MIN + rng() * (BATTLE_MAX - BATTLE_MIN);
  out.z = BATTLE_MIN + rng() * (BATTLE_MAX - BATTLE_MIN);
  out.y = 0;
}

/** Wave 1: 1 cube. Wave 2: 2 cubes. Wave 3: 1 caster. Wave 4: 2 casters. Wave 5+: grunts + 2 casters + resurrector(s) so resurrector has bodies to raise. */
function getWaveComposition(wave: number): { grunts: number; casters: number; resurrectors: number } {
  if (wave >= 5) {
    const resurrectorCount = Math.min(1 + Math.floor((wave - 5) / 2), RESURRECTOR_COUNT);
    const grunts = Math.min(1 + (wave - 5), 4); // 1 grunt wave 5, 2 wave 6, etc., cap 4
    return { grunts, casters: 2, resurrectors: resurrectorCount };
  }
  if (wave === 1) return { grunts: 1, casters: 0, resurrectors: 0 };
  if (wave === 2) return { grunts: 2, casters: 0, resurrectors: 0 };
  if (wave === 3) return { grunts: 0, casters: 1, resurrectors: 0 };
  return { grunts: 0, casters: 2, resurrectors: 0 }; // wave 4
}

let currentWave = 1;
/** Grunt slots in play this wave (indices 0..levelGruntsCount-1). */
let levelGruntsCount = 1;
/** Caster slots in play this wave (indices 0..levelCastersCount-1). */
let levelCastersCount = 0;
/** Resurrector slots in play this wave (indices 0..levelResurrectorsCount-1). */
let levelResurrectorsCount = 0;
const tempSpawnPos = new THREE.Vector3();

function isAnyEnemyAlive(): boolean {
  for (let j = 0; j < levelGruntsCount; j++) if (enemyAlive[j]) return true;
  for (let c = 0; c < levelCastersCount; c++) if (casterAlive[c]) return true;
  for (let r = 0; r < levelResurrectorsCount; r++) if (resurrectorAlive[r]) return true;
  if (bossAlive) return true;
  return false;
}

function startWave(wave: number): void {
  currentWave = wave;
  const { grunts, casters, resurrectors } = getWaveComposition(wave);
  levelGruntsCount = grunts;
  levelCastersCount = casters;
  levelResurrectorsCount = resurrectors;

  // Clear attack target when starting new wave
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
  
  // Spawn boss from wave 1 for testing
  if (wave >= 1) {
    if (bossMesh === null) {
      bossMesh = createBossMesh();
    }
    if (!bossGroup.children.includes(bossMesh)) {
      bossGroup.add(bossMesh);
    }
    if (!bossAlive) {
      bossAlive = true;
      bossHealth = MAX_BOSS_HEALTH;
      lastBossFireballTime = -999;
      addChatMessage('Boss has appeared!');
    }
  }

  for (let j = 0; j < levelGruntsCount; j++) {
    getWaveSpawnPosition(wave, j, tempSpawnPos);
    tempSpawnPos.y = ENEMY_SIZE / 2;
    resurrectEnemyInstance(enemies, j, tempSpawnPos);
    enemyAlive[j] = true;
    enemyHealth[j] = MAX_ENEMY_HEALTH;
    enemyPositions[j].copy(tempSpawnPos);
    lastEnemyDamageTime[j] = -999;
    lastSwordHitByEnemy[j] = -999;
    enemyExplosionState[j] = 'moving';
    enemyExplosionChargeStart[j] = -999;
    enemyExplosionLastTime[j] = -999;
  }

  for (let c = 0; c < levelCastersCount; c++) {
    getWaveSpawnPosition(wave, 100 + c, tempSpawnPos);
    tempSpawnPos.y = CASTER_SIZE / 2;
    casterMeshes[c].position.copy(tempSpawnPos);
    casterGroup.add(casterMeshes[c]);
    casterAlive[c] = true;
    casterHealth[c] = MAX_CASTER_HEALTH;
    lastCasterThrowTime[c] = -999;
    lastCasterResurrectTime[c] = -999;
  }

  for (let r = 0; r < levelResurrectorsCount; r++) {
    getWaveSpawnPosition(wave, 200 + r, tempSpawnPos);
    tempSpawnPos.y = RESURRECTOR_SIZE / 2;
    resurrectorMeshes[r].position.copy(tempSpawnPos);
    resurrectorGroup.add(resurrectorMeshes[r]);
    resurrectorAlive[r] = true;
    resurrectorHealth[r] = MAX_RESURRECTOR_HEALTH;
    lastResurrectorResurrectTime[r] = -999;
  }

  // Update enemy positions from enemyPositions
  for (let j = 0; j < ENEMY_COUNT; j++) {
    const enemy = enemies.children[j] as THREE.Object3D;
    if (enemy) {
      // Position sprite at ENEMY_SIZE/2 (sprites are positioned at their center)
      enemy.position.set(enemyPositions[j].x, ENEMY_SIZE / 2, enemyPositions[j].z);
    }
  }
  waveEl.textContent = String(currentWave);
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
const EXPLOSION_MAX_SCALE = 7;
const EXPLOSION_HIT_RADIUS_BASE = FIREBALL_RADIUS * EXPLOSION_MAX_SCALE;
const EXPLOSION_HIT_RADIUS_INFERNO = EXPLOSION_HIT_RADIUS_BASE * 1.5; // with Inferno augment
function getExplosionHitRadius(): number {
  return isAugmentUnlocked('fireball_radius' as AugmentId) ? EXPLOSION_HIT_RADIUS_INFERNO : EXPLOSION_HIT_RADIUS_BASE;
}

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
      if (isAugmentUnlocked('fireball_explosion')) {
        fb.state = 'exploding';
        fb.velocity.set(0, 0, 0);
        fb.explosionElapsed = 0;
        const r = getExplosionHitRadius();
        for (let k = 0; k < ENEMY_COUNT; k++) {
          if (!enemyAlive[k]) continue;
          if (fb.mesh.position.distanceTo(enemyPositions[k]) <= r) damageRedCube(k, getMagicDamage());
        }
        for (let c = 0; c < CASTER_COUNT; c++) {
          if (!casterAlive[c]) continue;
          if (fb.mesh.position.distanceTo(casterMeshes[c].position) <= r) damageCaster(c, getMagicDamage());
        }
        for (let r = 0; r < RESURRECTOR_COUNT; r++) {
          if (!resurrectorAlive[r]) continue;
          if (fb.mesh.position.distanceTo(resurrectorMeshes[r].position) <= r) damageResurrector(r, getMagicDamage());
        }
        if (bossAlive && fb.mesh.position.distanceTo(BOSS_POSITION) <= r) damageBoss(getMagicDamage());
      } else {
        scene.remove(fb.mesh);
        (fb.mesh.geometry as THREE.BufferGeometry).dispose();
        (fb.mesh.material as THREE.Material).dispose();
        fireballs.splice(i, 1);
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
      if (fb.mesh.position.distanceTo(enemyPositions[j]) < hitRadius) {
        if (isAugmentUnlocked('fireball_explosion')) {
          fb.state = 'exploding';
          fb.velocity.set(0, 0, 0);
          fb.explosionElapsed = 0;
          fb.mesh.position.copy(enemyPositions[j]);
          const r = getExplosionHitRadius();
          for (let k = 0; k < ENEMY_COUNT; k++) {
            if (!enemyAlive[k]) continue;
            if (fb.mesh.position.distanceTo(enemyPositions[k]) <= r) damageRedCube(k, getMagicDamage());
          }
          for (let c = 0; c < CASTER_COUNT; c++) {
            if (!casterAlive[c]) continue;
            if (fb.mesh.position.distanceTo(casterMeshes[c].position) <= r) damageCaster(c, getMagicDamage());
          }
          if (bossAlive && fb.mesh.position.distanceTo(BOSS_POSITION) <= r) damageBoss(getMagicDamage());
        } else {
          damageRedCube(j, getMagicDamage());
          scene.remove(fb.mesh);
          (fb.mesh.geometry as THREE.BufferGeometry).dispose();
          (fb.mesh.material as THREE.Material).dispose();
          fireballs.splice(i, 1);
        }
        break;
      }
    }
    for (let c = 0; c < CASTER_COUNT; c++) {
      if (!casterAlive[c]) continue;
      if (fb.mesh.position.distanceTo(casterMeshes[c].position) < CASTER_SIZE / 2 + FIREBALL_RADIUS) {
        if (isAugmentUnlocked('fireball_explosion')) {
          fb.state = 'exploding';
          fb.velocity.set(0, 0, 0);
          fb.explosionElapsed = 0;
          fb.mesh.position.copy(casterMeshes[c].position);
          const r = getExplosionHitRadius();
          for (let k = 0; k < ENEMY_COUNT; k++) {
            if (!enemyAlive[k]) continue;
            if (fb.mesh.position.distanceTo(enemyPositions[k]) <= r) damageRedCube(k, getMagicDamage());
          }
          for (let c2 = 0; c2 < CASTER_COUNT; c2++) {
            if (!casterAlive[c2]) continue;
            if (fb.mesh.position.distanceTo(casterMeshes[c2].position) <= r) damageCaster(c2, getMagicDamage());
          }
          for (let r2 = 0; r2 < RESURRECTOR_COUNT; r2++) {
            if (!resurrectorAlive[r2]) continue;
            if (fb.mesh.position.distanceTo(resurrectorMeshes[r2].position) <= r) damageResurrector(r2, getMagicDamage());
          }
          if (bossAlive && fb.mesh.position.distanceTo(BOSS_POSITION) <= r) damageBoss(getMagicDamage());
        } else {
          damageCaster(c, getMagicDamage());
          scene.remove(fb.mesh);
          (fb.mesh.geometry as THREE.BufferGeometry).dispose();
          (fb.mesh.material as THREE.Material).dispose();
          fireballs.splice(i, 1);
        }
        break;
      }
    }
    for (let r = 0; r < RESURRECTOR_COUNT; r++) {
      if (!resurrectorAlive[r]) continue;
      if (fb.mesh.position.distanceTo(resurrectorMeshes[r].position) < RESURRECTOR_SIZE / 2 + FIREBALL_RADIUS) {
        if (isAugmentUnlocked('fireball_explosion')) {
          fb.state = 'exploding';
          fb.velocity.set(0, 0, 0);
          fb.explosionElapsed = 0;
          fb.mesh.position.copy(resurrectorMeshes[r].position);
          const rHit = getExplosionHitRadius();
          for (let k = 0; k < ENEMY_COUNT; k++) {
            if (!enemyAlive[k]) continue;
            if (fb.mesh.position.distanceTo(enemyPositions[k]) <= rHit) damageRedCube(k, getMagicDamage());
          }
          for (let c2 = 0; c2 < CASTER_COUNT; c2++) {
            if (!casterAlive[c2]) continue;
            if (fb.mesh.position.distanceTo(casterMeshes[c2].position) <= rHit) damageCaster(c2, getMagicDamage());
          }
          for (let r2 = 0; r2 < RESURRECTOR_COUNT; r2++) {
            if (!resurrectorAlive[r2]) continue;
            if (fb.mesh.position.distanceTo(resurrectorMeshes[r2].position) <= rHit) damageResurrector(r2, getMagicDamage());
          }
          if (bossAlive && fb.mesh.position.distanceTo(BOSS_POSITION) <= rHit) damageBoss(getMagicDamage());
        } else {
          damageResurrector(r, getMagicDamage());
          scene.remove(fb.mesh);
          (fb.mesh.geometry as THREE.BufferGeometry).dispose();
          (fb.mesh.material as THREE.Material).dispose();
          fireballs.splice(i, 1);
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

function spawnOneRock(origin: THREE.Vector3, target: THREE.Vector3, spreadAngleRad: number): void {
  let aim = target.clone();
  if (spreadAngleRad !== 0) {
    const dir = new THREE.Vector3().subVectors(target, origin).setY(0);
    if (dir.lengthSq() > 0.01) {
      dir.normalize();
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spreadAngleRad);
      aim = origin.clone().add(dir.multiplyScalar(origin.distanceTo(target)));
      aim.y = 0;
    }
  }
  const mesh = createRockMesh();
  mesh.position.copy(origin);
  mesh.position.y = LAUNCH_HEIGHT;
  scene.add(mesh);
  const vel = new THREE.Vector3();
  getLandingVelocity(origin, aim, ROCK_SPEED, PROJECTILE_GRAVITY, MAX_PROJECTILE_RANGE, vel);
  rocks.push({ mesh, velocity: vel, ttl: ROCK_TTL });
}

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
  spawnOneRock(origin, target, 0);
  if (triple) {
    spawnOneRock(origin, target, spread);
    spawnOneRock(origin, target, -spread);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    e.preventDefault();
    if (!isDead) setPaused(!isPaused);
    if (skillTreeOpen) setSkillTreeOpen(false);
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
  if (e.key === 'q' || e.key === 'Q') {
    e.preventDefault();
    if (!isDead && !isPaused && isSkillUnlocked('rock')) throwRock(gameTime);
  }
  if (e.key === ' ') {
    e.preventDefault();
    if (!isDead && !isPaused) performMeleeAttack(gameTime);
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
      if (rock.mesh.position.distanceTo(enemyPositions[j]) < hitRadius) {
        damageRedCube(j, getRangedDamage());
        scene.remove(rock.mesh);
        (rock.mesh.geometry as THREE.BufferGeometry).dispose();
        (rock.mesh.material as THREE.Material).dispose();
        rocks.splice(i, 1);
        break;
      }
    }
    const rockCasterRadius = CASTER_SIZE / 2 + ROCK_RADIUS;
    const rockResurrectorRadius = RESURRECTOR_SIZE / 2 + ROCK_RADIUS;
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
    for (let r = 0; r < RESURRECTOR_COUNT; r++) {
      if (!resurrectorAlive[r]) continue;
      if (rock.mesh.position.distanceTo(resurrectorMeshes[r].position) < rockResurrectorRadius) {
        damageResurrector(r, getRangedDamage());
        scene.remove(rock.mesh);
        (rock.mesh.geometry as THREE.BufferGeometry).dispose();
        (rock.mesh.material as THREE.Material).dispose();
        rocks.splice(i, 1);
        break;
      }
    }
    // Check boss
    if (bossAlive && rock.mesh.position.distanceTo(BOSS_POSITION) < BOSS_HITBOX_RADIUS + ROCK_RADIUS) {
      damageBoss(getRangedDamage());
      scene.remove(rock.mesh);
      (rock.mesh.geometry as THREE.BufferGeometry).dispose();
      (rock.mesh.material as THREE.Material).dispose();
      rocks.splice(i, 1);
      continue;
    }
  }
}

function updateSword(dt: number, gameTime: number): void {
  const hasSword = isSkillUnlocked('sword');
  const hasTwin = isAugmentUnlocked('sword_twin' as AugmentId);
  swordOrbit.visible = hasSword;
  swordOrbit2.visible = hasSword && hasTwin;
  if (!hasSword) return;
  const orbitR = getSwordOrbitRadius();
  const hitR = getSwordHitRadius();
  const hitCooldown = getSwordHitCooldown();
  swordMesh.position.x = orbitR;
  swordOrbit.position.copy(character.position);
  swordOrbit.rotation.y += SWORD_ANGULAR_SPEED * dt;
  swordMesh.getWorldPosition(swordWorldPos);
  if (hasTwin) {
    swordMesh2.position.x = orbitR;
    swordOrbit2.position.copy(character.position);
    swordOrbit2.rotation.y -= SWORD_ANGULAR_SPEED * dt;
    swordMesh2.getWorldPosition(swordWorldPos2);
  }
  const hitDist = ENEMY_SIZE / 2 + hitR;
  const checkHit = (worldPos: THREE.Vector3) => {
    for (let j = 0; j < ENEMY_COUNT; j++) {
      if (!enemyAlive[j]) continue;
      if (gameTime - lastSwordHitByEnemy[j] < hitCooldown) continue;
      if (worldPos.distanceTo(enemyPositions[j]) < hitDist) {
        damageRedCube(j, getMeleeDamage());
        lastSwordHitByEnemy[j] = gameTime;
      }
    }
    for (let c = 0; c < CASTER_COUNT; c++) {
      if (!casterAlive[c]) continue;
      if (worldPos.distanceTo(casterMeshes[c].position) < CASTER_SIZE / 2 + hitR) {
        damageCaster(c, getMeleeDamage());
      }
    }
    for (let r = 0; r < RESURRECTOR_COUNT; r++) {
      if (!resurrectorAlive[r]) continue;
      if (worldPos.distanceTo(resurrectorMeshes[r].position) < RESURRECTOR_SIZE / 2 + hitR) {
        damageResurrector(r, getMeleeDamage());
      }
    }
    // Check boss
    if (bossAlive && worldPos.distanceTo(BOSS_POSITION) < BOSS_HITBOX_RADIUS + hitR) {
      damageBoss(getMeleeDamage());
    }
  };
  checkHit(swordWorldPos);
  if (hasTwin) checkHit(swordWorldPos2);
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
      const targetDist = CASTER_PREFERRED_RANGE;
      const moveAmount = CASTER_SPEED * dt;
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
    if (bossAlive) {
      const toBoss = new THREE.Vector3().subVectors(pos, BOSS_POSITION);
      const dist = toBoss.length();
      const minDist = CASTER_COLLISION_RADIUS + BOSS_HITBOX_RADIUS;
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
        if (body.enemyIndex >= levelGruntsCount) continue; // only resurrect grunts that are in play this level
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
        if (body.enemyIndex >= levelGruntsCount) continue;
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

function updateBoss(dt: number, gameTime: number): void {
  if (!bossAlive) return;
  
  // Boss throws fireballs at player
  if (gameTime - lastBossFireballTime >= BOSS_FIREBALL_COOLDOWN) {
    lastBossFireballTime = gameTime;
    const charPos = character.position;
    const targetPos = charPos.clone();
    targetPos.y = 0;
    
    // Create fireball
    const mesh = createBossFireballMesh();
    mesh.position.copy(BOSS_POSITION);
    mesh.position.y = BOSS_SIZE * 0.8 * 10; // Adjust for 10x scale
    scene.add(mesh);
    
    // Calculate velocity for fixed travel time
    const vel = new THREE.Vector3();
    const travelTime = BOSS_FIREBALL_WARNING_DURATION;
    const startPos = BOSS_POSITION.clone();
    startPos.y = BOSS_SIZE * 0.8 * 10; // Adjust for 10x scale
    
    // Calculate horizontal distance
    const dx = targetPos.x - startPos.x;
    const dz = targetPos.z - startPos.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    
    // Horizontal velocity to cover distance in fixed time
    if (horizontalDist > 0.01) {
      vel.x = (dx / horizontalDist) * (horizontalDist / travelTime);
      vel.z = (dz / horizontalDist) * (horizontalDist / travelTime);
    } else {
      vel.x = 0;
      vel.z = 0;
    }
    
    // Vertical velocity: need to land at y=0 after travelTime
    // y(t) = y0 + vy*t - 0.5*g*t^2
    // 0 = y0 + vy*t - 0.5*g*t^2
    // vy = (0.5*g*t^2 - y0) / t
    const y0 = startPos.y;
    vel.y = (0.5 * PROJECTILE_GRAVITY * travelTime * travelTime - y0) / travelTime;
    
    // Create ground indicators
    const indicators = createBossFireballIndicator(targetPos);
    
    bossFireballs.push({
      mesh,
      velocity: vel,
      ttl: 5,
      targetPosition: targetPos,
      warningTime: gameTime,
      indicatorOuter: indicators.outer,
      indicatorInner: indicators.inner,
    });
  }
}

function updateBossFireballs(dt: number, gameTime: number): void {
  const charPos = character.position;
  for (let i = bossFireballs.length - 1; i >= 0; i--) {
    const bf = bossFireballs[i];
    const timeSinceWarning = gameTime - bf.warningTime;
    
    // Update ground indicators
    if (timeSinceWarning < BOSS_FIREBALL_WARNING_DURATION) {
      // Inner ring expands from center to outer ring
      const t = timeSinceWarning / BOSS_FIREBALL_WARNING_DURATION;
      const innerRadius = 0.1 + (BOSS_FIREBALL_EXPLOSION_RADIUS * 0.9 - 0.1) * t;
      const innerThickness = 0.2 + (0.1 - 0.2) * t; // Gets thinner as it expands
      
      // Update inner ring geometry
      bf.indicatorInner.geometry.dispose();
      bf.indicatorInner.geometry = new THREE.RingGeometry(
        Math.max(0.05, innerRadius - innerThickness),
        innerRadius,
        24
      );
      
      // Fade outer ring slightly
      const outerMat = bf.indicatorOuter.material as THREE.MeshBasicMaterial;
      outerMat.opacity = 0.6 * (1 - t * 0.3);
      
      // Brighten inner ring as it expands
      const innerMat = bf.indicatorInner.material as THREE.MeshBasicMaterial;
      innerMat.opacity = 0.8 + 0.2 * t;
      innerMat.color.setHex(0xffaa00 + Math.floor(t * 0x550000)); // Gets redder
    }
    
    // Move fireball
    bf.velocity.y -= PROJECTILE_GRAVITY * dt;
    bf.mesh.position.addScaledVector(bf.velocity, dt);
    bf.ttl -= dt;
    
    // Check if fireball hit ground or reached target
    if (bf.mesh.position.y <= 0 || timeSinceWarning >= BOSS_FIREBALL_WARNING_DURATION) {
      bf.mesh.position.y = 0;
      
      // Explosion!
      const explosionPos = bf.targetPosition;
      if (charPos.distanceTo(explosionPos) <= BOSS_FIREBALL_EXPLOSION_RADIUS) {
        if (!isDamageBlocked('mage')) {
          setHealth(health - BOSS_FIREBALL_DAMAGE);
          // Set player on fire
          playerBurning = true;
          playerBurnStartTime = gameTime;
          lastBurnTickTime = gameTime;
        }
      }
      
      // Create explosion effect
      enemyAttackHitEffects.push(createEnemyAttackHitEffect(explosionPos));
      
      // Clean up
      scene.remove(bf.mesh);
      (bf.mesh.geometry as THREE.BufferGeometry).dispose();
      (bf.mesh.material as THREE.Material).dispose();
      bossFireballIndicatorGroup.remove(bf.indicatorOuter);
      bossFireballIndicatorGroup.remove(bf.indicatorInner);
      (bf.indicatorOuter.geometry as THREE.BufferGeometry).dispose();
      (bf.indicatorOuter.material as THREE.Material).dispose();
      (bf.indicatorInner.geometry as THREE.BufferGeometry).dispose();
      (bf.indicatorInner.material as THREE.Material).dispose();
      bossFireballs.splice(i, 1);
      continue;
    }
    
    if (bf.ttl <= 0) {
      // Clean up if TTL expired
      scene.remove(bf.mesh);
      (bf.mesh.geometry as THREE.BufferGeometry).dispose();
      (bf.mesh.material as THREE.Material).dispose();
      bossFireballIndicatorGroup.remove(bf.indicatorOuter);
      bossFireballIndicatorGroup.remove(bf.indicatorInner);
      (bf.indicatorOuter.geometry as THREE.BufferGeometry).dispose();
      (bf.indicatorOuter.material as THREE.Material).dispose();
      (bf.indicatorInner.geometry as THREE.BufferGeometry).dispose();
      (bf.indicatorInner.material as THREE.Material).dispose();
      bossFireballs.splice(i, 1);
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
    if (bossAlive) {
      const toBoss = new THREE.Vector3().subVectors(pos, BOSS_POSITION);
      const dist = toBoss.length();
      const minDist = ENEMY_COLLISION_RADIUS + BOSS_HITBOX_RADIUS;
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

startWave(1);

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
    if (!isAnyEnemyAlive()) {
      addChatMessage(`Wave ${currentWave} completed!`);
      while (enemyFireballs.length > 0) {
        const ef = enemyFireballs.pop()!;
        scene.remove(ef.mesh);
        (ef.mesh.geometry as THREE.BufferGeometry).dispose();
        (ef.mesh.material as THREE.Material).dispose();
      }
      // Clean up boss fireballs
      while (bossFireballs.length > 0) {
        const bf = bossFireballs.pop()!;
        scene.remove(bf.mesh);
        (bf.mesh.geometry as THREE.BufferGeometry).dispose();
        (bf.mesh.material as THREE.Material).dispose();
        bossFireballIndicatorGroup.remove(bf.indicatorOuter);
        bossFireballIndicatorGroup.remove(bf.indicatorInner);
        (bf.indicatorOuter.geometry as THREE.BufferGeometry).dispose();
        (bf.indicatorOuter.material as THREE.Material).dispose();
        (bf.indicatorInner.geometry as THREE.BufferGeometry).dispose();
        (bf.indicatorInner.material as THREE.Material).dispose();
      }
      startWave(currentWave + 1);
    }
    updateCharacterMove(dt);
    updatePlayerCollisions(dt);
    updateEquippedSword(gameTime);
    updateAutoAttack(dt, gameTime);
    updateEnemies(dt, gameTime);
    updateEnemyAttackHitEffects(gameTime);
    updateCasters(dt, gameTime);
    updateResurrectors(dt, gameTime);
    updateBoss(dt, gameTime);
    updateBossFireballs(dt, gameTime);
    updateBurningEffect(gameTime);
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
    timerEl.textContent = `Time: ${formatTime(runTime)}`;
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
    for (let r = 0; r < RESURRECTOR_COUNT; r++) {
      const bar = resurrectorHealthBarEls[r];
      if (!resurrectorAlive[r]) {
        bar.wrap.style.visibility = 'hidden';
        continue;
      }
      const pos = resurrectorMeshes[r].position;
      healthBarProjectionVec.set(pos.x, pos.y + HEALTH_BAR_Y_OFFSET, pos.z);
      healthBarProjectionVec.project(camera);
      const px = (healthBarProjectionVec.x * 0.5 + 0.5) * cw;
      const py = (1 - (healthBarProjectionVec.y * 0.5 + 0.5)) * ch;
      bar.wrap.style.left = `${px - ENEMY_HEALTH_BAR_WIDTH / 2}px`;
      bar.wrap.style.top = `${py - ENEMY_HEALTH_BAR_HEIGHT - 4}px`;
      bar.wrap.style.visibility = 'visible';
      bar.fill.style.width = `${(resurrectorHealth[r] / MAX_RESURRECTOR_HEALTH) * 100}%`;
    }
    // Boss health bar and hitbox indicator
    if (!bossAlive) {
      bossHealthBarEl.wrap.style.visibility = 'hidden';
      bossHitboxIndicator.visible = false;
    } else {
      bossHitboxIndicator.visible = true;
      healthBarProjectionVec.set(BOSS_POSITION.x, BOSS_POSITION.y + HEALTH_BAR_Y_OFFSET, BOSS_POSITION.z);
      healthBarProjectionVec.project(camera);
      const px = (healthBarProjectionVec.x * 0.5 + 0.5) * cw;
      const py = (1 - (healthBarProjectionVec.y * 0.5 + 0.5)) * ch;
      bossHealthBarEl.wrap.style.left = `${px - ENEMY_HEALTH_BAR_WIDTH / 2}px`;
      bossHealthBarEl.wrap.style.top = `${py - ENEMY_HEALTH_BAR_HEIGHT - 4}px`;
      bossHealthBarEl.wrap.style.visibility = 'visible';
      bossHealthBarEl.fill.style.width = `${(bossHealth / MAX_BOSS_HEALTH) * 100}%`;
    }
    // Update floating hit markers
    updateHitMarkers(now / 1000, camera, cw, ch);
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
