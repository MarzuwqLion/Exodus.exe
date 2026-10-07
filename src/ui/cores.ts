/**
 * The memory core screen (spec §15): what the run earned, the cores in hand, and the five perks with their
 * costs. Either player moves the cursor; player 1 buys with A. "Continue" goes on to the title. Drawn in the
 * palette of the scene it sits on: the main palette after a game over, the epilogue palette after Ghana.
 */
import type { MetaState, PerkId, PlayerIntent } from '../core/types';
import type { GlyphDevice } from '../input/glyphs';
import { C, E } from '../render/palettes';
import { PERK_INFO, PERK_ORDER, buyPerk, canBuy, perkCost, type CoreAward } from '../run/meta';
import { VerticalMenu } from './menus';
import type { KeyColors, UiSurface } from './surface';

/** UI colors for a palette: every color the end screens draw with. */
export interface UiTheme {
  fill: number;
  border: number;
  text: number;
  dim: number;
  hi: number;
  hiBg: number;
  title: number;
  shadow: number | null;
  keys: KeyColors;
}

export const MAIN_THEME: UiTheme = {
  fill: C.night0,
  border: C.slate0,
  text: C.fog1,
  dim: C.slate1,
  hi: C.amber2,
  hiBg: C.night2,
  title: C.fog2,
  shadow: C.night0,
  keys: { key: C.slate1, edge: C.night3, label: C.fog2 },
};

export const EPILOGUE_THEME: UiTheme = {
  fill: E.sky0,
  border: E.sky2,
  text: E.sky5,
  dim: E.sky2,
  hi: E.sun1,
  hiBg: E.sky1,
  title: E.sun2,
  shadow: E.sky0,
  keys: { key: E.sky2, edge: E.sky1, label: E.sun2 },
};

export type UiCue = 'ui_move' | 'ui_confirm' | 'ui_error';

export interface CoreScreenHooks {
  sfx(cue: UiCue): void;
  /** A perk was bought (persist the save). */
  bought(): void;
  /** "Continue" was chosen. */
  done(): void;
}

/** Seconds before the screen takes input, so A presses carried over from the text don't skip it unseen. */
const GUARD = 0.8;

export class CoreScreen {
  private readonly menu: VerticalMenu;
  private t = 0;
  private note: { text: string; t: number } | null = null;
  done = false;

  constructor(
    private readonly meta: MetaState,
    private readonly award: CoreAward | null,
    private readonly theme: UiTheme,
    private readonly hooks: CoreScreenHooks,
  ) {
    this.menu = new VerticalMenu([
      ...PERK_ORDER.map((p) => ({ label: PERK_INFO[p].name, act: () => this.buy(p) })),
      { label: 'Continue', act: () => this.finish() },
    ]);
    // The cursor starts on Continue: pressing through the ending never spends cores (they keep).
    this.menu.sel = PERK_ORDER.length;
  }

  private buy(p: PerkId): void {
    if (this.meta.unlocked.includes(p)) {
      this.note = { text: 'Already unlocked.', t: 0 };
      this.hooks.sfx('ui_error');
      return;
    }
    if (!buyPerk(this.meta, p)) {
      this.note = { text: 'Not enough cores.', t: 0 };
      this.hooks.sfx('ui_error');
      return;
    }
    this.note = { text: `${PERK_INFO[p].name} unlocked.`, t: 0 };
    this.hooks.sfx('ui_confirm');
    this.hooks.bought();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.hooks.sfx('ui_confirm');
    this.hooks.done();
  }

  update(dt: number, intents: readonly (PlayerIntent | null)[]): void {
    this.t += dt;
    if (this.note) this.note.t += dt;
    if (this.done || this.t < GUARD) return;
    for (const [i, it] of intents.entries()) {
      if (!it) continue;
      // Both players can move the cursor; player 1 confirms (as at camp).
      const r = this.menu.update(i === 0 ? it : { ...it, confirm: false }, dt);
      if (r === 'move') {
        this.note = null;
        this.hooks.sfx('ui_move');
      }
      if (r) break;
    }
  }

  draw(ui: UiSurface, device: GlyphDevice): void {
    const th = this.theme;
    const sh = { shadow: null };
    const compact = ui.height < 260;
    const lh = 11;
    const w = Math.min(330, ui.width - 16);
    const rows = this.awardRows();
    const h = 22 + (compact ? lh : rows.length * lh) + 16 + (PERK_ORDER.length + 1) * 12 + 30;
    const x = Math.floor((ui.width - w) / 2);
    const y = Math.max(4, Math.floor((ui.height - h) / 2));
    ui.panel(x, y, w, h, th.fill, th.border);
    ui.text('Memory cores', x + 10, y + 7, th.title, sh);
    ui.text(`${this.meta.cores}`, x + w - 10, y + 7, th.hi, { ...sh, align: 'right' });
    let yy = y + 22;
    if (compact) {
      ui.text(rows.map(([l, v]) => `${l} ${v}`).join('  '), x + 10, yy, th.text, sh);
      yy += lh;
    } else {
      for (const [label, value] of rows) {
        ui.text(label, x + 10, yy, th.text, sh);
        ui.text(value, x + w - 10, yy, th.text, { ...sh, align: 'right' });
        yy += lh;
      }
    }
    ui.rect(x + 10, yy + 3, w - 20, 1, th.border);
    yy += 10;
    // The perks, then Continue.
    this.menu.items.forEach((item, i) => {
      const iy = yy + i * 12;
      const sel = i === this.menu.sel;
      const perk = PERK_ORDER[i] as PerkId | undefined;
      const owned = perk !== undefined && this.meta.unlocked.includes(perk);
      const afford = perk === undefined || canBuy(this.meta, perk);
      const col = sel ? th.hi : owned || !afford ? th.dim : th.text;
      if (sel) ui.rect(x + 6, iy - 1, w - 12, 11, th.hiBg);
      ui.text(item.label, x + 12, iy, col, sh);
      if (perk)
        ui.text(owned ? 'Unlocked' : `${perkCost(perk)} cores`, x + w - 12, iy, col, {
          ...sh,
          align: 'right',
        });
    });
    yy += (PERK_ORDER.length + 1) * 12 + 4;
    const sel = PERK_ORDER[this.menu.sel] as PerkId | undefined;
    const note = this.note && this.note.t < 2.2 ? this.note.text : null;
    const info = note ?? (sel ? PERK_INFO[sel].text : 'Back to the title.');
    ui.text(info, x + 10, yy, note ? th.hi : th.text, sh);
    if (this.t >= GUARD) {
      const verb = sel ? (this.meta.unlocked.includes(sel) ? 'Unlocked' : 'Unlock') : 'Continue';
      ui.prompt('A', device, verb, x + w - 10, y + h - 13, th.title, 'right', th);
    }
  }

  /** Award lines: label and value. */
  private awardRows(): [string, string][] {
    const a = this.award;
    if (!a) return [['This run', '+0']];
    const rows: [string, string][] = [[`Legs completed: ${a.legs}`, `+${a.fromLegs}`]];
    if (a.lost > 0) rows.push([`Androids lost: ${a.lost}`, `+${a.fromLost}`]);
    if (a.ghana > 0) rows.push(['Reached Ghana', `+${a.ghana}`]);
    rows.push(['This run', `+${a.total}`]);
    return rows;
  }
}
