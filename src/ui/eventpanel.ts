/**
 * The road event panel (spec §12.7): a pixel text box over the frozen drive, typed text, and 2–4 choices with
 * their hints in brackets ([Wren], [1 Papers]). Choices the party can't take are shown dimmed. After a
 * choice, the outcome text; a chained step shows its own text and choices. Either player can move the
 * cursor or confirm.
 */
import type { EventChoice, EventStep, RoadEvent } from '../content/schema';
import type { PlayerIntent } from '../core/types';
import type { GlyphDevice } from '../input/glyphs';
import { MenuNav } from '../input/intents';
import { C } from '../render/palettes';
import { TYPE_CPS } from './dialogue';
import type { UiSurface } from './surface';

export interface EventPanelHooks {
  /** `{featured}` already replaced. */
  text(s: string): string;
  available(c: EventChoice): boolean;
  /** Take a choice; returns the outcome text and the chained step, if any. */
  choose(c: EventChoice): { text: string; next?: EventStep };
}

export class EventPanel {
  private step: EventStep;
  private body: string;
  private shown = 0;
  private sel = 0;
  private nav = new MenuNav();
  private result: { text: string; next?: EventStep } | null = null;
  private t = 0;
  done = false;

  constructor(
    private readonly event: RoadEvent,
    private readonly hooks: EventPanelHooks,
  ) {
    this.step = event;
    this.body = hooks.text(event.body);
    this.sel = Math.max(
      0,
      this.step.choices.findIndex((c) => hooks.available(c)),
    );
  }

  private get typing(): boolean {
    const full = this.result ? this.result.text.length : this.body.length;
    return this.shown < full;
  }

  update(dt: number, intents: readonly (PlayerIntent | null)[]): boolean {
    if (this.done) return true;
    this.t += dt;
    this.shown += dt * TYPE_CPS;
    for (const it of intents) {
      if (!it) continue;
      if (it.confirm) {
        if (this.typing) {
          this.shown = Infinity;
          return false;
        }
        if (this.result) {
          const next = this.result.next;
          this.result = null;
          if (next) {
            this.step = next;
            this.body = this.hooks.text(next.body ?? '');
            this.shown = 0;
            this.sel = Math.max(
              0,
              next.choices.findIndex((c) => this.hooks.available(c)),
            );
          } else this.done = true;
          return this.done;
        }
        const c = this.step.choices[this.sel];
        if (c && this.hooks.available(c)) {
          this.result = this.hooks.choose(c);
          this.shown = 0;
          if (!this.result.text) {
            // Nothing to read: go straight on.
            this.shown = Infinity;
          }
        }
        return false;
      }
      if (this.result || this.typing) continue;
      const { dx, dy } = this.nav.step(it, dt);
      const d = dy !== 0 ? dy : dx;
      if (d !== 0) {
        const n = this.step.choices.length;
        let s = this.sel;
        for (let i = 0; i < n; i++) {
          s = (s + d + n) % n;
          if (this.hooks.available(this.step.choices[s])) break;
        }
        this.sel = s;
      }
    }
    return false;
  }

  draw(ui: UiSurface, device: GlyphDevice): void {
    const w = Math.min(440, ui.width - 32);
    const x = Math.floor((ui.width - w) / 2);
    const textW = w - 24;
    const bodyLines = ui.wrap(this.body, textW);
    const resultLines = this.result ? ui.wrap(this.result.text, textW) : [];
    const choiceLines = this.result ? 0 : this.step.choices.length;
    const h =
      30 +
      (bodyLines.length + resultLines.length + (resultLines.length ? 1 : 0)) * ui.lineHeight +
      choiceLines * 13 +
      14;
    const y = Math.max(8, Math.floor((ui.height - h) / 2) - 10);
    ui.panel(x, y, w, h, C.night0, C.slate0);
    ui.text(this.event.title, x + 12, y + 8, C.amber2, { shadow: null });
    let cy = y + 24;
    const bodyShown = this.result ? Infinity : this.shown;
    ui.paragraph(this.body, x + 12, cy, textW, C.fog2, bodyShown, { shadow: null });
    cy += bodyLines.length * ui.lineHeight;
    if (this.result) {
      cy += ui.lineHeight;
      ui.paragraph(this.result.text, x + 12, cy, textW, C.fog1, this.shown, { shadow: null });
      if (!this.typing && Math.floor(this.t * 2.5) % 2 === 0) ui.button('A', device, x + w - 18, y + h - 15);
      return;
    }
    if (this.typing) return;
    cy += 6;
    this.step.choices.forEach((c, i) => {
      const ok = this.hooks.available(c);
      const selected = i === this.sel;
      const color = !ok ? C.slate1 : selected ? C.amber2 : C.fog1;
      if (selected && ok) {
        ui.rect(x + 8, cy - 1, w - 16, 12, C.night2);
        ui.icon('arrowR', x + 10, cy + 1, C.amber2);
      }
      let tx = x + 20;
      if (c.hint) tx += ui.text(`[${c.hint}] `, tx, cy, ok ? C.amber1 : C.slate1, { shadow: null });
      ui.text(c.label, tx, cy, color, { shadow: null });
      cy += 13;
    });
  }
}
