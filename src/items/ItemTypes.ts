/**
 * Item and equipment slot definitions.
 * Sword and bow are weapons that can be equipped in the weapon slot.
 */

export type ItemId =
  | 'sword'
  | 'bow'
  | 'coin'
  | 'copper_ore'
  | 'tin_ore'
  | 'iron_ore'
  | 'oak_log'
  | 'willow_log'
  | 'maple_log'
  | 'raw_trout'
  | 'raw_salmon'
  | 'raw_lobster'
  | 'bones'
  | 'raw_meat';

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
  copper_ore: { id: 'copper_ore', name: 'Copper ore', slot: null, label: 'Copper ore' },
  tin_ore: { id: 'tin_ore', name: 'Tin ore', slot: null, label: 'Tin ore' },
  iron_ore: { id: 'iron_ore', name: 'Iron ore', slot: null, label: 'Iron ore' },
  oak_log: { id: 'oak_log', name: 'Oak logs', slot: null, label: 'Oak logs' },
  willow_log: { id: 'willow_log', name: 'Willow logs', slot: null, label: 'Willow logs' },
  maple_log: { id: 'maple_log', name: 'Maple logs', slot: null, label: 'Maple logs' },
  raw_trout: { id: 'raw_trout', name: 'Raw trout', slot: null, label: 'Raw trout' },
  raw_salmon: { id: 'raw_salmon', name: 'Raw salmon', slot: null, label: 'Raw salmon' },
  raw_lobster: { id: 'raw_lobster', name: 'Raw lobster', slot: null, label: 'Raw lobster' },
  bones: { id: 'bones', name: 'Bones', slot: null, label: 'Bones' },
  raw_meat: { id: 'raw_meat', name: 'Raw meat', slot: null, label: 'Raw meat' },
};

export const EQUIPMENT_SLOT_ORDER: EquipmentSlotId[] = ['weapon'];

export function getItemDef(id: ItemId): ItemDef {
  return ITEM_DEFS[id];
}

export function isWeapon(id: ItemId): boolean {
  return ITEM_DEFS[id].slot === 'weapon';
}

/** Items that merge into one inventory slot by count (e.g. currency). Ores, logs, and fish are not stackable. */
export function isStackable(id: ItemId): boolean {
  return id === 'coin';
}

/** Short examine text for inventory / UI (chat). */
const ITEM_EXAMINE: Record<ItemId, string> = {
  sword: 'A sharp blade for melee combat. Equip it in your weapon slot.',
  bow: 'A ranged weapon for arrows. Equip it in your weapon slot.',
  coin: 'Common currency.',
  copper_ore: 'Rock rich with copper — useful for smelting someday.',
  tin_ore: 'Rock rich with tin — useful for smelting someday.',
  iron_ore: 'Rock rich with iron — useful for smelting someday.',
  oak_log: 'Timber from an oak. Could be fashioned into planks.',
  willow_log: 'Timber from a willow. Light and flexible.',
  maple_log: 'Timber from a maple. Dense and workable.',
  raw_trout: 'A small river fish — still wriggling.',
  raw_salmon: 'A firm pink fish — fresh from the water.',
  raw_lobster: 'A hefty shellfish — claws folded meekly.',
  bones: 'Brittle bones from a small creature.',
  raw_meat: 'Fresh raw meat — still bloody.',
};

export function getExamineMessage(id: ItemId): string {
  return ITEM_EXAMINE[id];
}
