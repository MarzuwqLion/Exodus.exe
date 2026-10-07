/**
 * Collision and sight grid (spec §8.1, §10.8). One tile = 1 m. North is the top of the grid (y grows south).
 * Tiles carry flags for walking, sight blocking, staff-only areas, interiors, and the exit zone.
 * Includes line-of-sight (DDA), A* pathfinding (8-directional, no corner cutting), and BFS distance fields.
 */

export const F = {
  WALK: 1,
  /** Blocks line of sight (walls, tall shelves, lockers, vending machines). */
  OPAQUE: 2,
  STAFF: 4,
  EXIT: 8,
  INTERIOR: 16,
  DOOR: 32,
  OUTDOOR: 64,
  /** Something sittable (chairs, stools, booths, benches). */
  SEAT: 128,
  /** Covered outdoors (awnings, canopies): shelter from rain. */
  COVER: 256,
  /** Water: never walkable, never opaque. */
  WATER: 512,
} as const;

export interface Point {
  x: number;
  y: number;
}

const NB4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly flags: Uint16Array;
  readonly chars: string[];
  /** Dynamic blockers (Brick's heaved objects) layered over the static flags. */
  readonly dynBlock: Uint8Array;
  private readonly withoutCache = new Map<number, Point | null>();

  constructor(rows: readonly string[], flagsOf: (ch: string, x: number, y: number) => number) {
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.flags = new Uint16Array(this.w * this.h);
    this.dynBlock = new Uint8Array(this.w * this.h);
    this.chars = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = rows[y][x] ?? ' ';
        this.chars.push(ch);
        this.flags[y * this.w + x] = flagsOf(ch, x, y);
      }
    }
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  charAt(tx: number, ty: number): string {
    return this.inBounds(tx, ty) ? this.chars[this.idx(tx, ty)] : ' ';
  }

  has(tx: number, ty: number, flag: number): boolean {
    return this.inBounds(tx, ty) && (this.flags[this.idx(tx, ty)] & flag) !== 0;
  }

  walkable(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    const i = this.idx(tx, ty);
    return (this.flags[i] & F.WALK) !== 0 && this.dynBlock[i] === 0;
  }

  /** Walkable at a world position. */
  walkableAt(x: number, y: number): boolean {
    return this.walkable(Math.floor(x), Math.floor(y));
  }

  opaque(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    const i = this.idx(tx, ty);
    return (this.flags[i] & F.OPAQUE) !== 0 || this.dynBlock[i] === 2;
  }

  flagAt(x: number, y: number, flag: number): boolean {
    return this.has(Math.floor(x), Math.floor(y), flag);
  }

  /**
   * Line of sight between two world points through tile centers (Amanatides–Woo traversal).
   * The start and end tiles never block (an observer behind a counter still sees out).
   */
  los(x0: number, y0: number, x1: number, y1: number): boolean {
    let tx = Math.floor(x0);
    let ty = Math.floor(y0);
    const ex = Math.floor(x1);
    const ey = Math.floor(y1);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
    let tMaxX = stepX > 0 ? (tx + 1 - x0) / dx : stepX < 0 ? (tx - x0) / dx : Infinity;
    let tMaxY = stepY > 0 ? (ty + 1 - y0) / dy : stepY < 0 ? (ty - y0) / dy : Infinity;
    let guard = 0;
    while ((tx !== ex || ty !== ey) && guard++ < 512) {
      if (tMaxX < tMaxY) {
        tMaxX += tDeltaX;
        tx += stepX;
      } else {
        tMaxY += tDeltaY;
        ty += stepY;
      }
      if (tx === ex && ty === ey) break;
      if (this.opaque(tx, ty)) return false;
    }
    return true;
  }

  /** True if a circle of radius r at (x, y) overlaps no blocked tile. */
  circleFree(x: number, y: number, r: number): boolean {
    const x0 = Math.floor(x - r);
    const x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r);
    const y1 = Math.floor(y + r);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.walkable(tx, ty)) continue;
        // Closest point on the tile to the circle center.
        const cx = Math.max(tx, Math.min(x, tx + 1));
        const cy = Math.max(ty, Math.min(y, ty + 1));
        const ddx = x - cx;
        const ddy = y - cy;
        if (ddx * ddx + ddy * ddy < r * r) return false;
      }
    }
    return true;
  }

  /**
   * The closest walkable tile by walking distance that lacks `flag` (the way out of a staff area, say), or
   * null within `maxSteps`. Cached per start tile: flags never change after parsing.
   */
  nearestWithout(x: number, y: number, flag: number, maxSteps = 40): Point | null {
    const sx = Math.floor(x);
    const sy = Math.floor(y);
    if (!this.inBounds(sx, sy)) return null;
    const key = this.idx(sx, sy) * 1024 + flag;
    const hit = this.withoutCache.get(key);
    if (hit !== undefined) return hit;
    let found: Point | null = null;
    if (!this.has(sx, sy, flag)) found = { x: sx + 0.5, y: sy + 0.5 };
    const seen = new Uint8Array(this.w * this.h);
    let frontier = [this.idx(sx, sy)];
    seen[frontier[0]] = 1;
    for (let step = 0; !found && step < maxSteps && frontier.length > 0; step++) {
      const next: number[] = [];
      for (const cur of frontier) {
        const cx = cur % this.w;
        const cy = Math.floor(cur / this.w);
        for (const [dx, dy] of NB4) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!this.inBounds(nx, ny) || !(this.flags[this.idx(nx, ny)] & F.WALK)) continue;
          const ni = this.idx(nx, ny);
          if (seen[ni]) continue;
          seen[ni] = 1;
          if (!found && !this.has(nx, ny, flag)) found = { x: nx + 0.5, y: ny + 0.5 };
          next.push(ni);
        }
      }
      frontier = next;
    }
    this.withoutCache.set(key, found);
    return found;
  }

  /** Nearest walkable tile center to a point (spiral search). */
  nearestWalkable(x: number, y: number, maxR = 8): Point | null {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (this.walkable(cx, cy)) return { x: cx + 0.5, y: cy + 0.5 };
    for (let r = 1; r <= maxR; r++) {
      let best: Point | null = null;
      let bestD = Infinity;
      for (let ty = cy - r; ty <= cy + r; ty++) {
        for (let tx = cx - r; tx <= cx + r; tx++) {
          if (Math.max(Math.abs(tx - cx), Math.abs(ty - cy)) !== r) continue;
          if (!this.walkable(tx, ty)) continue;
          const d = (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = { x: tx + 0.5, y: ty + 0.5 };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * A* from tile to tile, 8-directional without cutting corners. Returns tile-center waypoints (excluding the
   * start), or null if unreachable. `avoid` adds cost to tiles (e.g. staff areas for customers).
   */
  path(
    sx: number,
    sy: number,
    gx: number,
    gy: number,
    avoid?: (tx: number, ty: number) => number,
    maxNodes = 6000,
  ): Point[] | null {
    const W = this.w;
    const start = this.idx(Math.floor(sx), Math.floor(sy));
    const goal = this.idx(Math.floor(gx), Math.floor(gy));
    if (!this.walkable(goal % W, Math.floor(goal / W))) return null;
    if (start === goal) return [{ x: (goal % W) + 0.5, y: Math.floor(goal / W) + 0.5 }];
    const g = new Float32Array(this.w * this.h).fill(Infinity);
    const came = new Int32Array(this.w * this.h).fill(-1);
    const closed = new Uint8Array(this.w * this.h);
    const heap = new MinHeap();
    const gxT = goal % W;
    const gyT = Math.floor(goal / W);
    const hfn = (i: number): number => {
      const dx = Math.abs((i % W) - gxT);
      const dy = Math.abs(Math.floor(i / W) - gyT);
      return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
    };
    g[start] = 0;
    heap.push(start, hfn(start));
    let expanded = 0;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (++expanded > maxNodes) return null;
      const cx = cur % W;
      const cy = Math.floor(cur / W);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!this.walkable(nx, ny)) continue;
          if (dx !== 0 && dy !== 0 && (!this.walkable(cx + dx, cy) || !this.walkable(cx, cy + dy))) continue;
          const ni = this.idx(nx, ny);
          if (closed[ni]) continue;
          const step = dx !== 0 && dy !== 0 ? 1.4142 : 1;
          const cost = g[cur] + step + (avoid ? avoid(nx, ny) : 0);
          if (cost < g[ni]) {
            g[ni] = cost;
            came[ni] = cur;
            heap.push(ni, cost + hfn(ni));
          }
        }
      }
    }
    if (came[goal] < 0) return null;
    const out: Point[] = [];
    for (let i = goal; i !== start; i = came[i]) out.push({ x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 });
    out.reverse();
    return out;
  }

  /** Breadth-first distance field (in steps) from a set of seed tiles; -1 where unreachable. */
  distanceField(seeds: readonly Point[]): Int32Array {
    const d = new Int32Array(this.w * this.h).fill(-1);
    const q: number[] = [];
    for (const s of seeds) {
      const i = this.idx(Math.floor(s.x), Math.floor(s.y));
      if (d[i] === 0) continue;
      d[i] = 0;
      q.push(i);
    }
    for (let head = 0; head < q.length; head++) {
      const cur = q[head];
      const cx = cur % this.w;
      const cy = Math.floor(cur / this.w);
      const nb = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [dx, dy] of nb) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.walkable(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (d[ni] >= 0) continue;
        d[ni] = d[cur] + 1;
        q.push(ni);
      }
    }
    return d;
  }

  /** Smooth a tile path by skipping waypoints that have a clear straight walk (for natural movement). */
  smooth(from: Point, path: Point[], radius: number): Point[] {
    if (path.length <= 1) return path;
    const out: Point[] = [];
    let anchor = from;
    let i = 0;
    while (i < path.length) {
      let j = path.length - 1;
      while (j > i && !this.clearWalk(anchor, path[j], radius)) j--;
      out.push(path[j]);
      anchor = path[j];
      i = j + 1;
    }
    return out;
  }

  /** True if a circle can move in a straight line between two points. */
  clearWalk(a: Point, b: Point, radius: number): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(d / 0.25));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (!this.circleFree(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, radius)) return false;
    }
    return true;
  }
}

/** Binary min-heap of (index, priority). */
class MinHeap {
  private ids: number[] = [];
  private pri: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, p: number): void {
    this.ids.push(id);
    this.pri.push(p);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.pri[parent] <= this.pri[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastP = this.pri.pop()!;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.pri[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.pri[l] < this.pri[m]) m = l;
        if (r < this.ids.length && this.pri[r] < this.pri[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const ti = this.ids[a];
    this.ids[a] = this.ids[b];
    this.ids[b] = ti;
    const tp = this.pri[a];
    this.pri[a] = this.pri[b];
    this.pri[b] = tp;
  }
}
