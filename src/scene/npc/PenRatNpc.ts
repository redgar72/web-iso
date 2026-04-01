import {
  PEN_RAT_COUNT,
  MAX_PEN_RAT_HEALTH,
  PEN_RAT_SIZE,
  PEN_RAT_BITE_DAMAGE,
  PEN_RAT_ATTACK_TICK_INTERVAL,
} from '../PenRats';
import { BaseNpc } from './BaseNpc';

export class PenRatNpc extends BaseNpc {
  constructor() {
    super(MAX_PEN_RAT_HEALTH);
    this.biteIntervalTicks = PEN_RAT_ATTACK_TICK_INTERVAL;
  }

  get collisionRadius(): number {
    return PEN_RAT_SIZE * 0.45;
  }

  get visualGroundY(): number {
    return PEN_RAT_SIZE / 2;
  }

  get biteDamage(): number {
    return PEN_RAT_BITE_DAMAGE;
  }
}

export function createPenRatNpcs(): PenRatNpc[] {
  return Array.from({ length: PEN_RAT_COUNT }, () => new PenRatNpc());
}
