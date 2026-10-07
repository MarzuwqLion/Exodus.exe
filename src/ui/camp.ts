/**
 * The camp panel (spec §12.5): Cells to the car or each android in steps of 5 (left/right), Parts for Hull,
 * Skin patches for Skin, reviving a carried unit, feeding June, who plays whom, and the rest that ends camp
 * (short, or long: +15 Integrity and +10 Hull, a day unless at a Station). Both players can move the cursor;
 * player 1 confirms.
 */
import { MEMBERS } from '../content/characters';
import { TUNING } from '../content/tuning';
import type { AndroidState, MemberId, PlayerIntent, RunState, Slot } from '../core/types';
import { C } from '../render/palettes';
import { feedJune, longRest, moveCells, patchSkin, repairHull, reviveCarried } from '../run/camp';
import { activeJune } from '../run/june';
import { activeAndroids } from '../run/party';
import { sailing } from '../run/run';
import { VerticalMenu, type MenuItem } from './menus';
import type { UiSurface } from './surface';

export class CampPanel {
  private menu: VerticalMenu;
  done = false;

  constructor(
    private readonly run: RunState,
    private readonly atStation: boolean,
    private readonly onDone: () => void,
  ) {
    this.menu = new VerticalMenu([]);
    this.rebuild();
  }

  private rebuild(): void {
    const sel = this.menu.sel;
    this.menu.items = this.items();
    this.menu.sel = Math.min(sel, this.menu.items.length - 1);
  }

  private items(): MenuItem[] {
    const run = this.run;
    const r = run.resources;
    const items: MenuItem[] = [];
    const bar = (v: number): string => `◀ ${Math.round(v)} ▶`;
    items.push({
      label: 'Car battery',
      value: () => bar(r.carBattery),
      adjust: (d) => {
        moveCells(run, 'car', d * TUNING.run.cellsStep);
      },
    });
    for (const a of activeAndroids(run.party)) {
      items.push({
        label: `${MEMBERS[a.id].name} battery`,
        value: () => bar(a.battery),
        adjust: (d) => {
          moveCells(run, a.id, d * TUNING.run.cellsStep);
        },
      });
    }
    for (const a of activeAndroids(run.party)) {
      if (a.hull < 100)
        items.push({
          label: `Repair ${MEMBERS[a.id].name} (1 Part)`,
          value: () => `Hull ${Math.round(a.hull)}`,
          disabled: r.parts < 1,
          act: () => {
            repairHull(run, a.id);
            this.rebuild();
          },
        });
      if (a.skin < 100)
        items.push({
          label: `Patch ${MEMBERS[a.id].name} (1 Skin patch)`,
          value: () => `Skin ${Math.round(a.skin)}`,
          disabled: r.skinPatches < 1,
          act: () => {
            patchSkin(run, a.id);
            this.rebuild();
          },
        });
    }
    for (const id of run.carried) {
      const a = run.party.find((m) => m.id === id) as AndroidState | undefined;
      if (!a) continue;
      items.push({
        label: `Revive ${MEMBERS[id].name} (${TUNING.shutdown.campReviveParts} Parts)`,
        disabled: r.parts < TUNING.shutdown.campReviveParts,
        act: () => {
          reviveCarried(run, id);
          this.rebuild();
        },
      });
    }
    const june = activeJune(run.party);
    if (june)
      items.push({
        label: this.atStation ? 'Feed June (the keeper cooks)' : 'Feed June (1 Ration)',
        value: () => `Hunger ${Math.round(june.hunger)}`,
        disabled: !this.atStation && r.rations < 1,
        act: () => {
          feedJune(run, this.atStation);
          this.rebuild();
        },
      });
    for (const slot of [0, 1] as Slot[]) {
      if (run.control[slot] === null) continue;
      items.push({
        label: `Player ${slot + 1} plays`,
        value: () => MEMBERS[run.control[slot]!].name,
        adjust: (d) => this.swap(slot, d),
      });
    }
    items.push({
      label: 'Short rest',
      act: () => this.finish(false),
    });
    const s = sailing(run);
    items.push({
      label: this.atStation ? 'Long rest (free here)' : 'Long rest (costs a day)',
      value: () => (this.atStation ? '' : `${s.slack} spare days`),
      act: () => this.finish(true),
    });
    return items;
  }

  /** Change who a player controls (among the active party, not the other player's member). */
  private swap(slot: Slot, d: number): void {
    const run = this.run;
    const other: Slot = slot === 0 ? 1 : 0;
    const choices = run.party
      .filter((m) => m.status === 'active' && m.id !== run.control[other])
      .map((m) => m.id as MemberId);
    if (choices.length === 0) return;
    const i = choices.indexOf(run.control[slot]!);
    run.control[slot] = choices[(i + d + choices.length) % choices.length];
  }

  private finish(long: boolean): void {
    if (long) longRest(this.run, this.atStation);
    this.done = true;
    this.onDone();
  }

  update(dt: number, intents: readonly (PlayerIntent | null)[]): boolean {
    for (const [i, it] of intents.entries()) {
      if (!it) continue;
      // Both players can move; player 1 confirms (spec §12.5).
      const view = i === 0 ? it : { ...it, confirm: false };
      if (this.menu.update(view, dt)) break;
    }
    return this.done;
  }

  draw(ui: UiSurface): void {
    const run = this.run;
    const w = 330;
    const h = 30 + this.menu.items.length * 12 + 40;
    const x = ui.width - w - 12;
    const y = Math.max(8, Math.floor((ui.height - h) / 2));
    ui.panel(x, y, w, h, C.night0, C.slate0);
    ui.text(this.atStation ? 'Camp · the Station' : 'Camp', x + 10, y + 7, C.amber2, { shadow: null });
    const r = run.resources;
    ui.text(
      `Cells ${Math.floor(r.cells)}  Parts ${r.parts}  Patches ${r.skinPatches}  Papers ${r.papers}  Rations ${r.rations}`,
      x + 10,
      y + 20,
      C.fog0,
      { shadow: null },
    );
    this.menu.draw(ui, x + 14, y + 36, w - 28);
    for (const [i, a] of activeAndroids(run.party).entries()) {
      const low = a.integrity < TUNING.integrity.glitchBelow;
      ui.text(
        `${MEMBERS[a.id].name} Integrity ${Math.round(a.integrity)}`,
        x + 10 + i * 104,
        y + h - 14,
        low ? C.amber2 : C.slate1,
        { shadow: null },
      );
    }
  }
}
