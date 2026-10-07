/**
 * Fixed-timestep loop (spec §3.2): the simulation ticks at exactly 60 Hz; rendering happens once per
 * animation frame with an interpolation factor. Headless: you feed it timestamps.
 */
export interface LoopCallbacks {
  /** One fixed simulation step of `dt` seconds. */
  tick(dt: number): void;
  /** One rendered frame. `alpha` is the fraction of a tick elapsed since the last tick (for interpolation). */
  frame(alpha: number, frameDt: number): void;
}

export class FixedLoop {
  readonly dt: number;
  /** Ticks never exceed this many per frame (avoids the spiral of death after a stall). */
  maxTicksPerFrame = 8;
  paused = false;
  /** Global time scale (fast-forward in drives, slow-mo never). */
  timeScale = 1;
  /** Total ticks run since start. */
  ticks = 0;
  private acc = 0;
  private last = -1;

  constructor(
    private readonly cb: LoopCallbacks,
    hz = 60,
  ) {
    this.dt = 1 / hz;
  }

  /** Advance to wall-clock time `nowMs` (e.g. from requestAnimationFrame). Returns the ticks run. */
  advance(nowMs: number): number {
    if (this.last < 0) this.last = nowMs;
    let frameDt = (nowMs - this.last) / 1000;
    this.last = nowMs;
    if (frameDt < 0) frameDt = 0;
    if (frameDt > 0.25) frameDt = 0.25;
    let ran = 0;
    if (!this.paused) {
      this.acc += frameDt * this.timeScale;
      while (this.acc >= this.dt && ran < this.maxTicksPerFrame * Math.max(1, this.timeScale)) {
        this.cb.tick(this.dt);
        this.acc -= this.dt;
        this.ticks++;
        ran++;
      }
      if (this.acc > this.dt) this.acc = this.dt;
    }
    this.cb.frame(this.paused ? 1 : this.acc / this.dt, frameDt);
    return ran;
  }

  /** Run exactly `n` ticks without rendering (tests, QA fast-forward, bench setup). */
  runTicks(n: number): void {
    for (let i = 0; i < n; i++) {
      this.cb.tick(this.dt);
      this.ticks++;
    }
  }

  /** Forget the last timestamp (after a pause or a hidden tab) so no catch-up burst happens. */
  resetClock(): void {
    this.last = -1;
    this.acc = 0;
  }
}
