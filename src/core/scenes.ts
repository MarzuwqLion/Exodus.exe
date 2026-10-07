/**
 * Scene manager with transitions (spec §3.5, §13.4: never a hard cut; 8–12 frame pixel dissolve or
 * scanline wipe). Generic over the scene type so it stays headless.
 */
export interface SceneLike {
  enter(): void;
  exit(): void;
  tick(dt: number): void;
  frame(alpha: number, frameDt: number): void;
}

export type TransitionStyle = 'dissolve' | 'wipe';

export const TRANSITION_FRAMES = 10;

export class SceneManager<S extends SceneLike> {
  current: S | null = null;
  private next: (() => S) | null = null;
  private phase: 'none' | 'out' | 'in' = 'none';
  private frames = 0;
  style: TransitionStyle = 'dissolve';
  /** When true (QA mode), transitions complete instantly. */
  instant = false;

  /** Request a scene change. The old scene keeps running while the screen dissolves out. */
  go(factory: () => S, style: TransitionStyle = 'dissolve'): void {
    this.next = factory;
    this.style = style;
    if (!this.current || this.instant) {
      this.swap();
      this.phase = this.current && !this.instant ? 'in' : 'none';
      this.frames = 0;
      return;
    }
    if (this.phase !== 'out') {
      this.phase = 'out';
      this.frames = 0;
    }
  }

  get transitioning(): boolean {
    return this.phase !== 'none';
  }

  /** 0 = fully visible, 1 = fully covered. */
  get coverage(): number {
    if (this.phase === 'out') return Math.min(1, this.frames / TRANSITION_FRAMES);
    if (this.phase === 'in') return Math.max(0, 1 - this.frames / TRANSITION_FRAMES);
    return 0;
  }

  tick(dt: number): void {
    if (this.phase === 'out') {
      this.frames++;
      if (this.frames >= TRANSITION_FRAMES) {
        this.swap();
        this.phase = 'in';
        this.frames = 0;
      }
    } else if (this.phase === 'in') {
      this.frames++;
      if (this.frames >= TRANSITION_FRAMES) this.phase = 'none';
    }
    this.current?.tick(dt);
  }

  frame(alpha: number, frameDt: number): void {
    this.current?.frame(alpha, frameDt);
  }

  private swap(): void {
    const factory = this.next;
    this.next = null;
    if (!factory) return;
    this.current?.exit();
    this.current = factory();
    this.current.enter();
  }
}
