/**
 * Raw keyboard and mouse state with edge tracking. Edges accumulate until `consumeEdges()` so a press
 * between two simulation ticks is never lost (spec §7.3 keyboard fallback).
 */
export class KeyboardMouse {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  /** Mouse position in canvas CSS pixels, plus whether it's over the canvas. */
  mouse = { x: 0, y: 0, inside: false };
  /** performance.now() of the last mouse movement (cursor auto-hide). */
  lastMouseMove = 0;
  mouseDown = false;
  private mousePressed = false;
  private mouseReleased = false;
  /** Codes pressed since the last `takeAnyPress()` (for "press any button"). */
  private anyPress: string | null = null;
  private detach: (() => void) | null = null;

  attach(target: Window, canvas: HTMLCanvasElement): void {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (shouldPrevent(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.anyPress = e.code;
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (shouldPrevent(e.code)) e.preventDefault();
      this.down.delete(e.code);
      this.released.add(e.code);
    };
    const onBlur = (): void => {
      for (const c of this.down) this.released.add(c);
      this.down.clear();
      this.mouseDown = false;
    };
    const onMouseMove = (e: MouseEvent): void => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.inside = true;
      this.lastMouseMove = performance.now();
    };
    const onMouseDown = (e: MouseEvent): void => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.mousePressed = true;
      this.anyPress = 'Mouse0';
    };
    const onMouseUp = (e: MouseEvent): void => {
      if (e.button !== 0) return;
      this.mouseDown = false;
      this.mouseReleased = true;
    };
    const onMouseLeave = (): void => {
      this.mouse.inside = false;
    };
    const onContext = (e: Event): void => e.preventDefault();
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);
    target.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    target.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('contextmenu', onContext);
    this.detach = () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      target.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      target.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('contextmenu', onContext);
    };
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  wasReleased(code: string): boolean {
    return this.released.has(code);
  }

  get mousePressedEdge(): boolean {
    return this.mousePressed;
  }

  get mouseReleasedEdge(): boolean {
    return this.mouseReleased;
  }

  /** Returns the last key code pressed since the previous call, then forgets it. */
  takeAnyPress(): string | null {
    const c = this.anyPress;
    this.anyPress = null;
    return c;
  }

  /** Called once per rendered frame after intents have been sampled. */
  consumeEdges(): void {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed = false;
    this.mouseReleased = false;
  }

  /** Test helper: simulate key state without DOM events. */
  simulate(code: string, isDown: boolean): void {
    if (isDown) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
      this.anyPress = code;
    } else {
      this.down.delete(code);
      this.released.add(code);
    }
  }
}

const PREVENT = new Set([
  'Tab',
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Slash',
  'Quote',
  'Backspace',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
]);

function shouldPrevent(code: string): boolean {
  return PREVENT.has(code);
}
