/** Template keys for server-authoritative wildlife / NPC spawners. Keep in sync with DB `templateKey`. */

export const SERVER_NPC_TEMPLATE_KEYS = ['spider', 'bear'] as const;
export type ServerNpcTemplateKey = (typeof SERVER_NPC_TEMPLATE_KEYS)[number];

export function isServerNpcTemplateKey(s: string): s is ServerNpcTemplateKey {
  return (SERVER_NPC_TEMPLATE_KEYS as readonly string[]).includes(s);
}

export interface ServerNpcTemplate {
  maxHp: number;
  biteDamage: number;
  biteIntervalTicks: number;
  aggroTiles: number;
  /** Visual / hit sizing — matches {@link StartingAreaWildlife} conventions. */
  collisionRadius: number;
}

const SPIDER: ServerNpcTemplate = {
  maxHp: 11,
  biteDamage: 3,
  biteIntervalTicks: 3,
  aggroTiles: 8,
  collisionRadius: 0.34 * 0.45,
};

const BEAR: ServerNpcTemplate = {
  maxHp: 36,
  biteDamage: 7,
  biteIntervalTicks: 2,
  aggroTiles: 8,
  collisionRadius: 0.78 * 0.45,
};

export function getServerNpcTemplate(key: string): ServerNpcTemplate {
  if (key === 'bear') return BEAR;
  return SPIDER;
}

export function resolveServerNpcMaxHp(templateKey: string, hpOverride: number): number {
  if (hpOverride > 0) return hpOverride;
  return getServerNpcTemplate(templateKey).maxHp;
}

export function resolveServerNpcBiteDamage(templateKey: string, dmgOverride: number): number {
  if (dmgOverride > 0) return dmgOverride;
  return getServerNpcTemplate(templateKey).biteDamage;
}
