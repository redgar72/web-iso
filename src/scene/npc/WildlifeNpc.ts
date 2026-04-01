import {
  STARTING_WILDLIFE_COUNT,
  wildlifeMaxHealthAt,
  wildlifeCollisionRadiusAt,
  wildlifeSizeAt,
  wildlifeAttackTickIntervalAt,
  wildlifeBiteDamageAt,
} from '../StartingAreaWildlife';
import { BaseNpc } from './BaseNpc';

/** Starting-area spiders / bears; slot index matches `createStartingWildlifeGroup` in `meshes/StartingWildlifeMeshes`. */
export class WildlifeNpc extends BaseNpc {
  readonly slotIndex: number;

  constructor(slotIndex: number) {
    super(wildlifeMaxHealthAt(slotIndex));
    this.slotIndex = slotIndex;
    this.biteIntervalTicks = wildlifeAttackTickIntervalAt(slotIndex);
  }

  get collisionRadius(): number {
    return wildlifeCollisionRadiusAt(this.slotIndex);
  }

  get visualGroundY(): number {
    return wildlifeSizeAt(this.slotIndex) / 2;
  }

  get biteDamage(): number {
    return wildlifeBiteDamageAt(this.slotIndex);
  }
}

export function createWildlifeNpcs(): WildlifeNpc[] {
  return Array.from({ length: STARTING_WILDLIFE_COUNT }, (_, i) => new WildlifeNpc(i));
}
