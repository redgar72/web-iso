import type { NpcId } from './NpcIds';
import type { NpcStateStore, NpcStateKey } from './NpcStateStore';
import { NPC_STATE_DEFAULT } from './NpcStateStore';
import type { DialogNodeDef, DialogNodeId, NpcDialogScript } from './DialogScript';
import { NPC_DIALOG_SCRIPTS } from './dialogTrees';

export interface DialogLineView {
  text: string;
  options: { label: string; index: number }[];
}

export interface DialogSession {
  npcId: NpcId;
  getLine(): DialogLineView | null;
  /** @returns true if dialog should stay open */
  chooseOption(optionIndex: number): boolean;
}

function resolveRootId(script: NpcDialogScript, state: NpcStateKey): DialogNodeId | null {
  const direct = script.roots[state];
  if (direct && script.nodes[direct]) return direct;
  const def = script.roots[NPC_STATE_DEFAULT];
  if (def && script.nodes[def]) return def;
  const first = Object.values(script.roots)[0];
  if (first && script.nodes[first]) return first;
  const anyId = Object.keys(script.nodes)[0];
  return anyId ?? null;
}

function getScript(npcId: NpcId): NpcDialogScript | null {
  return NPC_DIALOG_SCRIPTS[npcId] ?? null;
}

export function createDialogSession(npcId: NpcId, npcState: NpcStateStore): DialogSession | null {
  const scriptOrNull = getScript(npcId);
  if (!scriptOrNull) return null;
  const script = scriptOrNull;

  const resolvedRoot = resolveRootId(script, npcState.getState(npcId));
  if (resolvedRoot === null) return null;
  const cursor = { nodeId: resolvedRoot };

  function currentNode(): DialogNodeDef | null {
    const n = script.nodes[cursor.nodeId];
    return n ?? null;
  }

  return {
    npcId,
    getLine(): DialogLineView | null {
      const node = currentNode();
      if (!node) return null;
      return {
        text: node.text,
        options: node.options.map((o, index) => ({ label: o.label, index })),
      };
    },
    chooseOption(optionIndex: number): boolean {
      const node = currentNode();
      if (!node) return false;
      const opt = node.options[optionIndex];
      if (!opt) return false;
      if (opt.setState !== undefined) {
        npcState.setState(npcId, opt.setState);
      }
      if (opt.next !== undefined && script.nodes[opt.next]) {
        cursor.nodeId = opt.next;
        return true;
      }
      return false;
    },
  };
}
