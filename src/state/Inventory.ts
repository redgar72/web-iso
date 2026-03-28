/**

 * Inventory state: 4 columns x 7 rows = 28 slots.

 * Each slot holds an item stack ({ itemId, count }) or null.

 */



import type { ItemId } from '../items/ItemTypes';

import { isStackable } from '../items/ItemTypes';



const COLS = 4;

const ROWS = 7;

export const INVENTORY_SLOTS = COLS * ROWS;



export interface ItemStack {

  itemId: ItemId;

  count: number;

}



export type InventorySlot = ItemStack | null;



export interface InventoryAPI {

  getSlot: (index: number) => InventorySlot;

  setSlot: (index: number, slot: InventorySlot) => void;

  addItem: (itemId: ItemId) => boolean;

  removeItem: (index: number) => ItemStack | null;

  findFirstEmpty: () => number;

  findFirstItem: (itemId?: ItemId) => number;

  getColumns: () => number;

  getRows: () => number;

  subscribe: (fn: () => void) => () => void;

}



export function createInventory(initialItems: ItemId[] = []): InventoryAPI {

  const slots: InventorySlot[] = Array(INVENTORY_SLOTS).fill(null);

  const listeners: Array<() => void> = [];



  for (let i = 0; i < initialItems.length && i < INVENTORY_SLOTS; i++) {

    slots[i] = { itemId: initialItems[i], count: 1 };

  }



  function getSlot(index: number): InventorySlot {

    if (index < 0 || index >= INVENTORY_SLOTS) return null;

    return slots[index];

  }



  function setSlot(index: number, slot: InventorySlot): void {

    if (index < 0 || index >= INVENTORY_SLOTS) return;

    if (slot != null && slot.count < 1) return;

    slots[index] = slot;

    listeners.forEach((fn) => fn());

  }



  function notify(): void {

    listeners.forEach((fn) => fn());

  }



  function findFirstEmpty(): number {

    for (let i = 0; i < INVENTORY_SLOTS; i++) {

      if (slots[i] == null) return i;

    }

    return -1;

  }



  function findFirstItem(itemId?: ItemId): number {

    for (let i = 0; i < INVENTORY_SLOTS; i++) {

      const s = slots[i];

      if (s != null && (itemId == null || s.itemId === itemId)) return i;

    }

    return -1;

  }



  function addItem(itemId: ItemId): boolean {

    if (isStackable(itemId)) {

      const existing = findFirstItem(itemId);

      if (existing >= 0) {

        const s = slots[existing]!;

        s.count += 1;

        notify();

        return true;

      }

    }

    const idx = findFirstEmpty();

    if (idx < 0) return false;

    slots[idx] = { itemId, count: 1 };

    notify();

    return true;

  }



  function removeItem(index: number): ItemStack | null {

    if (index < 0 || index >= INVENTORY_SLOTS) return null;

    const stack = slots[index];

    if (stack == null) return null;

    slots[index] = null;

    notify();

    return stack;

  }



  function getColumns(): number {

    return COLS;

  }



  function getRows(): number {

    return ROWS;

  }



  function subscribe(fn: () => void): () => void {

    listeners.push(fn);

    return () => {

      const i = listeners.indexOf(fn);

      if (i >= 0) listeners.splice(i, 1);

    };

  }



  return {

    getSlot,

    setSlot,

    addItem,

    removeItem,

    findFirstEmpty,

    findFirstItem,

    getColumns,

    getRows,

    subscribe,

  };

}

