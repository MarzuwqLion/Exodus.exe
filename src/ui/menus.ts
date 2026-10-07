/**
 * Menus shared by every scene: a vertical list helper, the settings page (spec §13.5), the controls page
 * (spec §7.3, §7.4), and the pause menu (spec §13.4: resume, party status, controls, settings, quit).
 * Fully gamepad-navigable; sentence case.
 */
import type { GlyphStyle, PlayerIntent, Settings } from '../core/types';
import { MenuNav } from '../input/intents';
import { C } from '../render/palettes';
import type { UiSurface } from './surface';

export interface MenuItem {
  label: string;
  /** Right-aligned value (settings). */
  value?: () => string;
  /** Left/right adjusts (settings). */
  adjust?: (dir: number) => void;
  act?: () => void;
  disabled?: boolean;
}

export class VerticalMenu {
  sel = 0;
  private nav = new MenuNav();

  constructor(public items: MenuItem[]) {}

  /** Returns 'act' when an item was activated, 'back' on cancel, 'move' on navigation. */
  update(it: PlayerIntent | null, dt: number): 'act' | 'back' | 'move' | null {
    if (!it) return null;
    const { dx, dy } = this.nav.step(it, dt);
    if (dy !== 0) {
      const n = this.items.length;
      let s = this.sel;
      for (let i = 0; i < n; i++) {
        s = (s + dy + n) % n;
        if (!this.items[s].disabled) break;
      }
      this.sel = s;
      return 'move';
    }
    const cur = this.items[this.sel];
    if (dx !== 0 && cur?.adjust) {
      cur.adjust(dx);
      return 'move';
    }
    if (it.confirm && cur && !cur.disabled) {
      if (cur.act) cur.act();
      else if (cur.adjust) cur.adjust(1);
      return 'act';
    }
    if (it.cancel) return 'back';
    return null;
  }

  draw(ui: UiSurface, x: number, y: number, w: number, lineH = 12): void {
    this.items.forEach((item, i) => {
      const yy = y + i * lineH;
      const sel = i === this.sel;
      const col = item.disabled ? C.slate1 : sel ? C.amber2 : C.fog1;
      if (sel) ui.rect(x - 4, yy - 1, w + 8, lineH - 1, C.night2);
      if (sel) ui.icon('arrowR', x - 3, yy + 1, C.amber2);
      ui.text(item.label, x + 4, yy, col, { shadow: null });
      if (item.value) ui.text(item.value(), x + w, yy, col, { align: 'right', shadow: null });
    });
  }
}

const GLYPH_STYLES: GlyphStyle[] = ['auto', 'xbox', 'playstation'];

function onOff(b: boolean): string {
  return b ? 'On' : 'Off';
}

function vol(v: number): string {
  return `${Math.round(v * 10)}`;
}

/** The settings page. `apply` is called after every change. */
export function settingsItems(s: Settings, apply: () => void, toggleFullscreen: () => void): MenuItem[] {
  const volItem = (label: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume'): MenuItem => ({
    label,
    value: () => vol(s[key]),
    adjust: (d) => {
      s[key] = Math.max(0, Math.min(1, Math.round((s[key] + d * 0.1) * 10) / 10));
      apply();
    },
  });
  const toggle = (
    label: string,
    key: 'screenShake' | 'rumble' | 'reduceFlashing' | 'largeText' | 'tips' | 'dither',
  ): MenuItem => ({
    label,
    value: () => onOff(s[key]),
    adjust: () => {
      s[key] = !s[key];
      apply();
    },
  });
  return [
    volItem('Master volume', 'masterVolume'),
    volItem('Music volume', 'musicVolume'),
    volItem('Sound volume', 'sfxVolume'),
    {
      label: 'Fullscreen',
      value: () => onOff(s.fullscreen),
      adjust: () => {
        toggleFullscreen();
      },
    },
    toggle('Screen shake', 'screenShake'),
    toggle('Rumble', 'rumble'),
    toggle('Reduce flashing', 'reduceFlashing'),
    toggle('Large text', 'largeText'),
    toggle('Tips', 'tips'),
    toggle('Dither', 'dither'),
    {
      label: 'Button glyphs',
      value: () => (s.glyphStyle === 'auto' ? 'Auto' : s.glyphStyle === 'xbox' ? 'Xbox' : 'PlayStation'),
      adjust: (d) => {
        const i = GLYPH_STYLES.indexOf(s.glyphStyle);
        s.glyphStyle = GLYPH_STYLES[(i + d + GLYPH_STYLES.length) % GLYPH_STYLES.length];
        apply();
      },
    },
  ];
}

export const CONTROLS_PAD: [string, string][] = [
  ['Left stick', 'Move (tilt partway to walk)'],
  ['LB (hold)', 'Sprint'],
  ['A', 'Interact (hold to search, plug in, revive)'],
  ['X', 'Blend (hold for every option)'],
  ['Y', 'Ability'],
  ['RT', 'Attack (hold for heavy)'],
  ['B', 'Dash · Back in menus'],
  ['RB', 'Ping · Chat near your partner'],
  ['Start', 'Pause · Join as player 2'],
  ['Back (hold)', 'Party · Hold 2 s to drop out'],
  ['D-pad', 'Swap character (solo)'],
];

export const CONTROLS_KB1: [string, string][] = [
  ['WASD', 'Move'],
  ['Mouse', 'Aim'],
  ['E', 'Interact'],
  ['Q', 'Blend'],
  ['F', 'Ability'],
  ['Shift', 'Sprint'],
  ['Space', 'Dash'],
  ['Left click', 'Attack'],
  ['R', 'Ping · Chat'],
  ['Tab', 'Party'],
  ['Esc', 'Pause'],
  ['Z / C', 'Swap character'],
];

export const CONTROLS_KB2: [string, string][] = [
  ['Arrows', 'Move'],
  ['Enter', 'Interact'],
  ['/', 'Blend'],
  ['.', 'Ability'],
  ['Right Shift', 'Sprint'],
  ['Right Ctrl', 'Dash'],
  [',', 'Attack'],
  [';', 'Ping · Chat'],
  ["'", 'Party'],
  ['Backspace', 'Pause · Join'],
];

/** The controls page: the controller column and both keyboard layouts. */
export function drawControls(ui: UiSurface, x: number, y: number): void {
  const col = (title: string, rows: [string, string][], cx: number, cy: number, w: number): void => {
    ui.text(title, cx, cy, C.amber2, { shadow: null });
    rows.forEach(([k, v], i) => {
      ui.text(k, cx, cy + 12 + i * 10, C.fog2, { shadow: null });
      ui.text(v, cx + w, cy + 12 + i * 10, C.fog0, { shadow: null });
    });
  };
  if (ui.width < 500) {
    col('Controller', CONTROLS_PAD, x, y, 62);
    return;
  }
  col('Controller', CONTROLS_PAD, x, y, 64);
  col('Keyboard, player 1', CONTROLS_KB1, x + 238, y, 52);
  col('Keyboard, player 2', CONTROLS_KB2, x + 238, y + 136, 64);
}
