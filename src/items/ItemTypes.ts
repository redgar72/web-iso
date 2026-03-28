/**
 * Item and equipment slot definitions.
 * Sword and bow are weapons that can be equipped in the weapon slot.
 */

export type ItemId = 'sword' | 'bow' | 'coin';

export type EquipmentSlotId = 'weapon';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** null = not equippable (e.g. currency) */
  slot: EquipmentSlotId | null;
  /** Short label for UI (e.g. "Sword", "Bow") */
  label: string;
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
  sword: { id: 'sword', name: 'Sword', slot: 'weapon', label: 'Sword' },
  bow: { id: 'bow', name: 'Bow', slot: 'weapon', label: 'Bow' },
  coin: { id: 'coin', name: 'Coin', slot: null, label: 'Coin' },
};

export const EQUIPMENT_SLOT_ORDER: EquipmentSlotId[] = ['weapon'];

export function getItemDef(id: ItemId): ItemDef {
  return ITEM_DEFS[id];
}

export function isWeapon(id: ItemId): boolean {
  return ITEM_DEFS[id].slot === 'weapon';
}

/** Items that merge into one inventory slot by count (e.g. currency). */
export function isStackable(id: ItemId): boolean {
  return id === 'coin';
}
