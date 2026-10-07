/** Easing functions and a tiny tween runner (own implementation, spec §3.1). */

export type Ease = (t: number) => number;

export const Easing = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => {
    const u = t - 1;
    return u * u * u + 1;
  },
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
} satisfies Record<string, Ease>;

export interface Tween {
  elapsed: number;
  duration: number;
  ease: Ease;
  update: (v: number) => void;
  done?: () => void;
}

/** Runs tweens on a clock you advance yourself (the fixed step or the frame delta). */
export class Tweens {
  private items: Tween[] = [];

  add(
    duration: number,
    update: (v: number) => void,
    ease: Ease = Easing.inOutQuad,
    done?: () => void,
  ): Tween {
    const t: Tween = { elapsed: 0, duration: Math.max(1e-6, duration), ease, update, done };
    this.items.push(t);
    update(ease(0));
    return t;
  }

  cancel(t: Tween): void {
    const i = this.items.indexOf(t);
    if (i >= 0) this.items.splice(i, 1);
  }

  clear(): void {
    this.items.length = 0;
  }

  get active(): number {
    return this.items.length;
  }

  step(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const t = this.items[i];
      t.elapsed += dt;
      const k = Math.min(1, t.elapsed / t.duration);
      t.update(t.ease(k));
      if (k >= 1) {
        this.items.splice(i, 1);
        t.done?.();
      }
    }
  }
}
