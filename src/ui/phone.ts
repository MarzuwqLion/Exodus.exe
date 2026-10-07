/**
 * Lantern texts (spec §12.8): short messages on a phone overlay, typed in, held long enough to read, then
 * put away. Messages queue; tips and the tutorial use the same phone.
 */
import { C } from '../render/palettes';
import { TYPE_CPS } from './dialogue';
import type { UiSurface } from './surface';

interface Showing {
  text: string;
  t: number;
  hold: number;
}

export class LanternPhone {
  private queue: string[] = [];
  private cur: Showing | null = null;

  push(text: string): void {
    this.queue.push(text);
  }

  get busy(): boolean {
    return this.cur !== null || this.queue.length > 0;
  }

  /** The message on screen right now (tests and QA). */
  get current(): string | null {
    return this.cur?.text ?? null;
  }

  update(dt: number): void {
    if (!this.cur) {
      const next = this.queue.shift();
      if (next === undefined) return;
      // Typing time, then about a second per seven words, at least four seconds.
      const words = next.split(/\s+/).length;
      this.cur = { text: next, t: 0, hold: next.length / TYPE_CPS + Math.max(4, words / 7 + 2) };
    }
    this.cur.t += dt;
    if (this.cur.t >= this.cur.hold) this.cur = null;
  }

  draw(ui: UiSurface): void {
    const c = this.cur;
    if (!c) return;
    const w = 168;
    const textW = w - 14;
    const lines = ui.wrap(c.text, textW);
    const h = 24 + lines.length * ui.lineHeight;
    const x = 12;
    // Slides up from the bottom edge and back down.
    const inT = Math.min(1, c.t / 0.25);
    const outT = Math.min(1, Math.max(0, (c.hold - c.t) / 0.25));
    const y = Math.round(ui.height - 40 - (h + 40) * Math.min(inT, outT) + 40);
    ui.panel(x, y, w, h, C.night1, C.slate1);
    ui.rect(x + 1, y + 1, w - 2, 12, C.night2);
    ui.text('Lantern', x + 7, y + 2, C.amber2, { shadow: null });
    ui.rect(x + w - 14, y + 5, 6, 2, C.slate1);
    ui.paragraph(c.text, x + 7, y + 17, textW, C.fog2, c.t * TYPE_CPS, { shadow: null });
  }
}
