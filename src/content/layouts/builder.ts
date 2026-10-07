/**
 * A tiny builder for authoring layout grids by coordinates instead of hand-counted strings: rooms, rectangles,
 * lines, and stamped text. `rows()` returns the ASCII grid for a LayoutDef.
 */
export class GridBuilder {
  private cells: string[][];

  constructor(
    readonly w: number,
    readonly h: number,
    fill = ',',
  ) {
    this.cells = Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
  }

  set(x: number, y: number, ch: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y][x] = ch;
    return this;
  }

  get(x: number, y: number): string {
    return this.cells[y]?.[x] ?? ' ';
  }

  /** Filled rectangle, inclusive. */
  rect(x0: number, y0: number, x1: number, y1: number, ch: string): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, ch);
    return this;
  }

  /** Walls around the edge of the rectangle, floor inside (inclusive bounds are the walls). */
  room(x0: number, y0: number, x1: number, y1: number, floor = '.', wall = '#'): this {
    this.rect(x0, y0, x1, y1, wall);
    this.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, floor);
    return this;
  }

  hline(y: number, x0: number, x1: number, ch: string): this {
    return this.rect(x0, y, x1, y, ch);
  }

  vline(x: number, y0: number, y1: number, ch: string): this {
    return this.rect(x, y0, x, y1, ch);
  }

  /** Stamp a string horizontally; spaces leave cells untouched. */
  text(x: number, y: number, s: string): this {
    for (let i = 0; i < s.length; i++) if (s[i] !== ' ') this.set(x + i, y, s[i]);
    return this;
  }

  /** Stamp several rows starting at (x, y). */
  block(x: number, y: number, rows: readonly string[]): this {
    rows.forEach((r, i) => this.text(x, y + i, r));
    return this;
  }

  rows(): string[] {
    return this.cells.map((r) => r.join(''));
  }
}
