/**
 * Conversations (spec §10.5 keepers, §12.10 camp conversations): a box at the bottom of the screen, one line
 * at a time, typed out. A finishes the line, then moves on; B skips the rest.
 */
import type { PlayerIntent } from '../core/types';
import type { GlyphDevice } from '../input/glyphs';
import { C } from '../render/palettes';
import type { UiSurface } from './surface';

export interface DialogueLine {
  speaker: string;
  text: string;
  /** Name color (keepers amber, the party fog white). */
  color?: number;
}

/** Characters per second for typed text. */
export const TYPE_CPS = 48;

/** Typed text ticks every this many characters (spec §14.2: typewriter ticks). */
export const TICK_EVERY = 3;

export class Dialogue {
  private i = 0;
  private shown = 0;
  private t = 0;
  done = false;

  constructor(
    private readonly lines: readonly DialogueLine[],
    /** Called every few typed characters (the scene plays the typewriter tick). */
    private readonly onType: (() => void) | null = null,
  ) {
    if (lines.length === 0) this.done = true;
  }

  get line(): DialogueLine | undefined {
    return this.lines[this.i];
  }

  /** Returns true once the conversation is over. */
  update(dt: number, intents: readonly (PlayerIntent | null)[]): boolean {
    if (this.done) return true;
    const line = this.lines[this.i];
    this.t += dt;
    const before = Math.floor(this.shown / TICK_EVERY);
    this.shown = Math.min(line.text.length, this.shown + dt * TYPE_CPS);
    if (Math.floor(this.shown / TICK_EVERY) > before) this.onType?.();
    if (intents.some((it) => it?.cancel)) {
      this.done = true;
      return true;
    }
    if (intents.some((it) => it?.confirm)) {
      if (this.shown < line.text.length) this.shown = line.text.length;
      else {
        this.i++;
        this.shown = 0;
        this.t = 0;
        if (this.i >= this.lines.length) this.done = true;
      }
    }
    return this.done;
  }

  draw(ui: UiSurface, device: GlyphDevice): void {
    const line = this.lines[this.i];
    if (!line) return;
    const w = Math.min(420, ui.width - 40);
    const x = Math.floor((ui.width - w) / 2);
    const textW = w - 20;
    const lines = ui.wrap(line.text, textW);
    const h = 26 + lines.length * ui.lineHeight;
    const y = ui.height - h - 14;
    ui.panel(x, y, w, h, C.night0, C.slate0);
    ui.text(line.speaker, x + 10, y + 6, line.color ?? C.amber2, { shadow: null });
    ui.paragraph(line.text, x + 10, y + 19, textW, C.fog2, this.shown, { shadow: null });
    if (this.shown >= line.text.length && Math.floor(this.t * 2.5) % 2 === 0) {
      ui.button('A', device, x + w - 16, y + h - 13);
    }
  }
}
