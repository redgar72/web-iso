export type UpdateFn = (dt: number) => void;

/**
 * Fixed timestep game loop; render runs with requestAnimationFrame (synced to display).
 * - Update (physics/logic) runs at 60 Hz.
 * - Render runs once per frame. Using rAF avoids GPU overload during drag that can trigger context loss.
 */
export class GameLoop {
  private rafId = 0;
  private running = false;
  private lastTime = 0;
  private accumulator = 0;
  private readonly fixedDt = 1 / 60;
  private readonly maxFrameTime = 0.2;

  constructor(
    private update: UpdateFn,
    private render: () => void
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    this.accumulator = 0;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private tick = (): void => {
    this.rafId = requestAnimationFrame(this.tick);
    const now = performance.now() / 1000;
    let frameTime = now - this.lastTime;
    this.lastTime = now;

    if (frameTime > this.maxFrameTime) frameTime = this.maxFrameTime;
    this.accumulator += frameTime;

    while (this.accumulator >= this.fixedDt) {
      this.update(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }

    this.render();
  };
}
