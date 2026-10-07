/**
 * Gamepad manager (spec §7.1): polls navigator.getGamepads() every frame, tracks connect/disconnect,
 * button edges (accumulated until consumed), hold times, glyph style detection, and rumble.
 */
import { TUNING } from '../content/tuning';

export const BTN = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  Back: 8,
  Start: 9,
  L3: 10,
  R3: 11,
  Up: 12,
  Down: 13,
  Left: 14,
  Right: 15,
} as const;
export type ButtonName = keyof typeof BTN;
const BUTTON_COUNT = 16;

export interface PadState {
  index: number;
  id: string;
  connected: boolean;
  style: 'xbox' | 'playstation';
  down: boolean[];
  pressed: boolean[];
  released: boolean[];
  /** Seconds each button has been held. */
  held: number[];
  axes: [number, number, number, number];
}

function newPad(index: number, id: string): PadState {
  return {
    index,
    id,
    connected: true,
    style: detectStyle(id),
    down: new Array<boolean>(BUTTON_COUNT).fill(false),
    pressed: new Array<boolean>(BUTTON_COUNT).fill(false),
    released: new Array<boolean>(BUTTON_COUNT).fill(false),
    held: new Array<number>(BUTTON_COUNT).fill(0),
    axes: [0, 0, 0, 0],
  };
}

/** PlayStation pads by vendor id or name; everything else shows Xbox glyphs. */
export function detectStyle(id: string): 'xbox' | 'playstation' {
  const s = id.toLowerCase();
  if (
    s.includes('054c') ||
    s.includes('dualsense') ||
    s.includes('dualshock') ||
    s.includes('wireless controller')
  ) {
    return 'playstation';
  }
  return 'xbox';
}

export type RumbleKind = 'hit' | 'scan' | 'exposure' | 'crash' | 'tick';

const RUMBLE: Record<RumbleKind, { ms: number; strong: number; weak: number }> = {
  hit: { ms: 140, strong: 0.7, weak: 0.4 },
  scan: { ms: 90, strong: 0.0, weak: 0.35 },
  exposure: { ms: 380, strong: 0.9, weak: 0.6 },
  crash: { ms: 520, strong: 1.0, weak: 0.8 },
  tick: { ms: 45, strong: 0.0, weak: 0.25 },
};

export class GamepadManager {
  readonly pads = new Map<number, PadState>();
  /** Indices that disconnected since the last `takeDisconnects()`. */
  private disconnects: number[] = [];
  rumbleEnabled = true;

  attach(target: Window): void {
    target.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      this.pads.set(e.gamepad.index, newPad(e.gamepad.index, e.gamepad.id));
    });
    target.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      const p = this.pads.get(e.gamepad.index);
      if (p) p.connected = false;
      this.disconnects.push(e.gamepad.index);
    });
  }

  /** Poll hardware state; call once per rendered frame. */
  poll(frameDt: number): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let list: (Gamepad | null)[];
    try {
      list = navigator.getGamepads();
    } catch {
      return;
    }
    const seen = new Set<number>();
    for (const gp of list) {
      if (!gp) continue;
      seen.add(gp.index);
      let st = this.pads.get(gp.index);
      if (!st || st.id !== gp.id) {
        st = newPad(gp.index, gp.id);
        this.pads.set(gp.index, st);
      }
      st.connected = gp.connected;
      for (let b = 0; b < BUTTON_COUNT; b++) {
        const btn = gp.buttons[b];
        let isDown = false;
        if (btn)
          isDown = b === BTN.LT || b === BTN.RT ? btn.value > TUNING.input.triggerThreshold : btn.pressed;
        if (isDown && !st.down[b]) st.pressed[b] = true;
        if (!isDown && st.down[b]) st.released[b] = true;
        st.down[b] = isDown;
        st.held[b] = isDown ? st.held[b] + frameDt : 0;
      }
      for (let a = 0; a < 4; a++) st.axes[a] = gp.axes[a] ?? 0;
    }
    for (const [idx, st] of this.pads) {
      if (!seen.has(idx) && st.connected) {
        st.connected = false;
        this.disconnects.push(idx);
      }
    }
  }

  consumeEdges(): void {
    for (const st of this.pads.values()) {
      st.pressed.fill(false);
      st.released.fill(false);
    }
  }

  takeDisconnects(): number[] {
    const d = this.disconnects;
    this.disconnects = [];
    return d;
  }

  /** First connected pad with any button pressed this frame, if any. */
  anyPressed(): { index: number; button: number } | null {
    for (const st of this.pads.values()) {
      if (!st.connected) continue;
      for (let b = 0; b < BUTTON_COUNT; b++) if (st.pressed[b]) return { index: st.index, button: b };
    }
    return null;
  }

  rumble(index: number, kind: RumbleKind): void {
    if (!this.rumbleEnabled || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const gp = navigator.getGamepads()[index];
    const act = gp?.vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return;
    const r = RUMBLE[kind];
    try {
      act
        .playEffect('dual-rumble', {
          duration: r.ms,
          strongMagnitude: r.strong,
          weakMagnitude: r.weak,
          startDelay: 0,
        })
        .catch(() => undefined);
    } catch {
      // Unsupported (e.g. Firefox): degrade silently.
    }
  }
}
