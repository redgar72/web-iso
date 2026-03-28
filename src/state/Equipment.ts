/**
 * Equipment state: which item is in each equipment slot.
 * Only "weapon" slot for now (sword or bow).
 */

import type { ItemId, EquipmentSlotId } from '../items/ItemTypes';

export type EquipmentState = Partial<Record<EquipmentSlotId, ItemId>>;

export interface EquipmentAPI {
  getEquipped: (slot: EquipmentSlotId) => ItemId | null;
  setEquipped: (slot: EquipmentSlotId, itemId: ItemId | null) => void;
  getWeapon: () => ItemId | null;
  subscribe: (fn: () => void) => () => void;
}

export function createEquipment(initialWeapon: ItemId | null = 'sword'): EquipmentAPI {
  const state: EquipmentState = {};
  if (initialWeapon !== null) state.weapon = initialWeapon;
  const listeners: Array<() => void> = [];

  function getEquipped(slot: EquipmentSlotId): ItemId | null {
    return state[slot] ?? null;
  }

  function setEquipped(slot: EquipmentSlotId, itemId: ItemId | null): void {
    state[slot] = itemId === null ? undefined : itemId;
    listeners.forEach((fn) => fn());
  }

  function getWeapon(): ItemId | null {
    return getEquipped('weapon');
  }

  function subscribe(fn: () => void): () => void {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  return { getEquipped, setEquipped, getWeapon, subscribe };
}
