import type { NpcId } from './NpcIds';

/** Conversation / quest phase for an NPC. Extend with quest-specific keys as needed. */
export type NpcStateKey = string;

export const NPC_STATE_DEFAULT: NpcStateKey = 'default';
export const NPC_STATE_TALKED_ONCE: NpcStateKey = 'talked_once';

const STORAGE_KEY = 'webiso_npc_state_v1';

export interface NpcStateStore {
  getState(npcId: NpcId): NpcStateKey;
  setState(npcId: NpcId, state: NpcStateKey): void;
}

function loadRaw(): Record<string, NpcStateKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return {};
    return o as Record<string, NpcStateKey>;
  } catch {
    return {};
  }
}

function saveRaw(data: Record<string, NpcStateKey>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Per-NPC state for dialog roots and future quests. Persisted so choices survive refresh.
 */
export function createNpcStateStore(): NpcStateStore {
  const byId: Record<string, NpcStateKey> = loadRaw();

  return {
    getState(npcId: NpcId): NpcStateKey {
      return byId[npcId] ?? NPC_STATE_DEFAULT;
    },
    setState(npcId: NpcId, state: NpcStateKey): void {
      byId[npcId] = state;
      saveRaw(byId);
    },
  };
}

/** Shared store for dialog and future quest reducers. */
export const npcStateStore = createNpcStateStore();
