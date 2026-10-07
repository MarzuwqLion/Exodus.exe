/**
 * Button glyphs (spec §7.1). Actions keep one name everywhere; the glyph depends on the device of the
 * player who sees the prompt.
 */
import type { GlyphStyle } from '../core/types';

export type GlyphDevice = 'xbox' | 'playstation' | 'kb1' | 'kb2';

/** Logical buttons, named after the Xbox layout. */
export type Glyph =
  | 'A'
  | 'B'
  | 'X'
  | 'Y'
  | 'LB'
  | 'RB'
  | 'LT'
  | 'RT'
  | 'Start'
  | 'Back'
  | 'DUp'
  | 'DDown'
  | 'DLeft'
  | 'DRight'
  | 'LS'
  | 'RS';

const KB1: Record<Glyph, string> = {
  A: 'E',
  B: 'SPC',
  X: 'Q',
  Y: 'F',
  LB: 'SHF',
  RB: 'R',
  LT: '-',
  RT: 'LMB',
  Start: 'ESC',
  Back: 'TAB',
  DUp: 'W',
  DDown: 'S',
  DLeft: 'Z',
  DRight: 'C',
  LS: 'WASD',
  RS: 'MOUSE',
};

const KB2: Record<Glyph, string> = {
  A: 'ENT',
  B: 'CTL',
  X: '/',
  Y: '.',
  LB: 'SHF',
  RB: ';',
  LT: '-',
  RT: ',',
  Start: 'BKSP',
  Back: "'",
  DUp: 'UP',
  DDown: 'DN',
  DLeft: '[',
  DRight: ']',
  LS: 'ARROWS',
  RS: '-',
};

const XBOX: Record<Glyph, string> = {
  A: 'A',
  B: 'B',
  X: 'X',
  Y: 'Y',
  LB: 'LB',
  RB: 'RB',
  LT: 'LT',
  RT: 'RT',
  Start: 'START',
  Back: 'BACK',
  DUp: 'UP',
  DDown: 'DOWN',
  DLeft: 'LEFT',
  DRight: 'RIGHT',
  LS: 'L',
  RS: 'R',
};

/** PlayStation face buttons are drawn as shapes by the UI; these are the fallback labels. */
const PS: Record<Glyph, string> = {
  A: 'CROSS',
  B: 'CIRCLE',
  X: 'SQUARE',
  Y: 'TRIANGLE',
  LB: 'L1',
  RB: 'R1',
  LT: 'L2',
  RT: 'R2',
  Start: 'OPTIONS',
  Back: 'SHARE',
  DUp: 'UP',
  DDown: 'DOWN',
  DLeft: 'LEFT',
  DRight: 'RIGHT',
  LS: 'L',
  RS: 'R',
};

export function glyphLabel(g: Glyph, device: GlyphDevice): string {
  switch (device) {
    case 'kb1':
      return KB1[g];
    case 'kb2':
      return KB2[g];
    case 'playstation':
      return PS[g];
    default:
      return XBOX[g];
  }
}

/** Resolve which glyph set a player sees, honoring the settings override for pads. */
export function resolveGlyphDevice(
  device: 'kb1' | 'kb2' | 'pad' | null,
  padStyle: 'xbox' | 'playstation',
  setting: GlyphStyle,
): GlyphDevice {
  if (device === 'kb1' || device === 'kb2') return device;
  if (setting === 'xbox' || setting === 'playstation') return setting;
  return padStyle;
}
