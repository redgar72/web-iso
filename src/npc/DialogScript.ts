import type { NpcId } from './NpcIds';
import type { NpcStateKey } from './NpcStateStore';

export type DialogNodeId = string;

export interface DialogOptionDef {
  label: string;
  /** Next node in this NPC's script; omit to close the dialog after this line. */
  next?: DialogNodeId;
  /** Persisted NPC state when this option is chosen (quests can branch dialog via {@link NpcDialogScript.roots}). */
  setState?: NpcStateKey;
}

export interface DialogNodeDef {
  text: string;
  options: DialogOptionDef[];
}

export interface NpcDialogScript {
  /** Entry node for each conversation phase; falls back to {@link NpcStateKey} default. */
  roots: Partial<Record<NpcStateKey, DialogNodeId>>;
  nodes: Record<DialogNodeId, DialogNodeDef>;
}

export type NpcDialogScriptMap = Record<NpcId, NpcDialogScript>;
