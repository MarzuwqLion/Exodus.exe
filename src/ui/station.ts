/**
 * The Station panel (spec §10.5): what the keeper fixed, what else the Station gives, the two trades (once
 * each), and resting. Opens over the Station scene after the keeper's conversation.
 */
import type { PlayerIntent, Resources } from '../core/types';
import { C } from '../render/palettes';
import { applyTrade, canTrade, STATION_TRADES, type StationTrade } from '../run/station';
import { VerticalMenu, type MenuItem } from './menus';
import type { UiSurface } from './surface';

export interface StationPanelOpts {
  title: string;
  care: readonly string[];
  perks: readonly string[];
  /** The party's resources, changed in place by trades. */
  resources: Resources;
  /** Trades already made this visit (kept across reopening the panel). */
  used: Set<StationTrade>;
  onRest: () => void;
  onLook: () => void;
}

export class StationPanel {
  private menu: VerticalMenu;
  private closed = false;

  constructor(private readonly o: StationPanelOpts) {
    this.menu = new VerticalMenu(this.items());
    this.menu.sel = this.menu.items.findIndex((i) => !i.disabled);
  }

  private items(): MenuItem[] {
    const o = this.o;
    const trade = (t: StationTrade): MenuItem => ({
      label: STATION_TRADES[t].label,
      disabled: !canTrade(o.resources, t, o.used),
      act: () => {
        applyTrade(o.resources, t);
        o.used.add(t);
        // Rebuild (the trade is spent) and keep the cursor on something usable.
        const items = this.items();
        this.menu.items = items;
        let sel = this.menu.sel;
        while (items[sel]?.disabled) sel = (sel + 1) % items.length;
        this.menu.sel = sel;
      },
    });
    return [
      trade('partsForPapers'),
      trade('papersForCells'),
      {
        label: 'Look around first',
        act: () => {
          this.closed = true;
          o.onLook();
        },
      },
      {
        label: 'Rest here',
        act: () => {
          this.closed = true;
          o.onRest();
        },
      },
    ];
  }

  update(dt: number, intents: readonly (PlayerIntent | null)[]): boolean {
    for (const it of intents) {
      if (!it) continue;
      const r = this.menu.update(it, dt);
      if (r === 'back') {
        this.closed = true;
        this.o.onLook();
      }
      if (r) break;
    }
    return this.closed;
  }

  draw(ui: UiSurface): void {
    const o = this.o;
    const w = 300;
    const lh = ui.lineHeight;
    const h = 46 + (o.care.length + o.perks.length) * lh + 14 + this.menu.items.length * 12 + 10;
    const x = Math.floor((ui.width - w) / 2);
    const y = Math.max(8, Math.floor((ui.height - h) / 2));
    ui.panel(x, y, w, h, C.night0, C.slate0);
    ui.text(o.title, x + w / 2, y + 7, C.amber2, { align: 'center', shadow: null });
    let cy = y + 24;
    for (const line of o.care) {
      ui.text(line, x + 12, cy, C.fog2, { shadow: null });
      cy += lh;
    }
    for (const line of o.perks) {
      ui.text(line, x + 12, cy, C.fog1, { shadow: null });
      cy += lh;
    }
    cy += 4;
    const r = o.resources;
    ui.text(`Parts ${r.parts}   Papers ${r.papers}   Cells ${Math.floor(r.cells)}`, x + 12, cy, C.slate1, {
      shadow: null,
    });
    cy += lh + 6;
    this.menu.draw(ui, x + 16, cy, w - 32);
  }
}
