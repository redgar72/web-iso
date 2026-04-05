/** Stable ids for story / quest NPCs (not server combat mobs). */
export const NPC_IDS = {
  /** Guide near the training area */
  mentor_elara: 'mentor_elara',
  /** Fisher / gatherer flavor NPC */
  barnaby: 'barnaby',
} as const;

export type NpcId = (typeof NPC_IDS)[keyof typeof NPC_IDS];

export const NPC_DISPLAY_NAMES: Record<NpcId, string> = {
  [NPC_IDS.mentor_elara]: 'Elara',
  [NPC_IDS.barnaby]: 'Barnaby',
};

export function isNpcId(s: string): s is NpcId {
  return Object.values(NPC_IDS).includes(s as NpcId);
}
