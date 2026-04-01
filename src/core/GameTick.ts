/**
 * Old School RuneScape-style game tick (~0.6s). Server-side actions advance on tick boundaries;
 * the client may render motion interpolated within the current tick.
 * @see https://oldschool.runescape.wiki/w/Game_tick
 */
import { OSRS_TICK_SECONDS } from '../../shared/tick';
export { OSRS_TICK_SECONDS };

export class TickClock {
  private accumulator = 0;
  /** Monotonic; +1 per processed game tick. */
  tickCount = 0;

  /**
   * Advance by fixed or variable dt; process whole ticks.
   * @returns How many ticks to simulate this frame (0, 1, or more if catching up).
   */
  advance(dt: number): number {
    this.accumulator += dt;
    let n = 0;
    while (this.accumulator >= OSRS_TICK_SECONDS) {
      this.accumulator -= OSRS_TICK_SECONDS;
      this.tickCount++;
      n++;
    }
    return n;
  }

  /** 0 at tick start → 1 just before next tick. Safe when dt is small vs tick length. */
  getTickAlpha(): number {
    return this.accumulator / OSRS_TICK_SECONDS;
  }
}
