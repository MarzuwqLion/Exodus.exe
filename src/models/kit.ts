/**
 * Procedural geometry kit (spec §5.1). Everything visible is built from these primitives in code:
 * box, beveled box, wedge, cylinder, cone, slab, stairs, frame, pipe, plus generic prisms.
 *
 * A `Kit` is a builder with a transform stack. Primitives write flat-shaded triangles with palette vertex
 * colors straight into one of two sinks: `solid` (toon-shaded) or `glow` (emissive). `build()` turns each
 * sink into a single merged BufferGeometry, so a whole prop (or a whole street) is one draw call per material.
 *
 * Conventions: meters; y up; a prop's origin is its bottom center; it faces south (+z, toward the camera).
 * Rule: no detail thinner than ~0.08 m at gameplay zoom (it would flicker).
 */
import * as THREE from 'three';

export interface Xf {
  x?: number;
  y?: number;
  z?: number;
  /** Rotation in radians about each axis (applied Y, then X, then Z). */
  rx?: number;
  ry?: number;
  rz?: number;
  /** Uniform or per-axis scale. */
  s?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

export interface LightSpec {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  /** Distance at which the light fades to zero. */
  range: number;
  /** 0 = steady; > 0 = flicker amount (fluorescents, damaged lamps). */
  flicker?: number;
  /** Optional tag for scene logic (e.g. 'beacon', 'alarm'). */
  tag?: string;
}

class Sink {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  get triangles(): number {
    return this.pos.length / 9;
  }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();

export function xfMatrix(xf: Xf, out = new THREE.Matrix4()): THREE.Matrix4 {
  _eul.set(xf.rx ?? 0, xf.ry ?? 0, xf.rz ?? 0, 'YXZ');
  _q.setFromEuler(_eul);
  const s = xf.s ?? 1;
  _s.set(xf.sx ?? s, xf.sy ?? s, xf.sz ?? s);
  _t.set(xf.x ?? 0, xf.y ?? 0, xf.z ?? 0);
  return out.compose(_t, _q, _s);
}

export class Kit {
  readonly solid = new Sink();
  readonly glowSink = new Sink();
  readonly lights: LightSpec[] = [];
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  /** When true, primitives go to the glow sink. */
  private emissive = false;

  private get m(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1];
  }

  /** Push a transform relative to the current one. */
  push(xf: Xf): this {
    const next = this.m.clone().multiply(xfMatrix(xf, _m));
    this.stack.push(next);
    return this;
  }

  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  /** Run `fn` inside a pushed transform. */
  at(xf: Xf, fn: () => void): this {
    this.push(xf);
    try {
      fn();
    } finally {
      this.pop();
    }
    return this;
  }

  /** Run `fn` with primitives routed to the emissive (glow) sink. */
  glow(fn: () => void): this {
    const prev = this.emissive;
    this.emissive = true;
    try {
      fn();
    } finally {
      this.emissive = prev;
    }
    return this;
  }

  /** Register a light emitter at a local point (transformed to world). */
  light(spec: LightSpec): this {
    _a.set(spec.x, spec.y, spec.z).applyMatrix4(this.m);
    this.lights.push({ ...spec, x: _a.x, y: _a.y, z: _a.z });
    return this;
  }

  /** Current transform origin in world space. */
  origin(): THREE.Vector3 {
    return new THREE.Vector3().applyMatrix4(this.m);
  }

  get triangles(): number {
    return this.solid.triangles + this.glowSink.triangles;
  }

  // ------------------------------------------------------------------------------------------
  // Low-level
  // ------------------------------------------------------------------------------------------

  /** One triangle in local coordinates (counter-clockwise when seen from the front). */
  tri(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    color: number,
  ): void {
    const m = this.m;
    _a.set(ax, ay, az).applyMatrix4(m);
    _b.set(bx, by, bz).applyMatrix4(m);
    _c.set(cx, cy, cz).applyMatrix4(m);
    _e1.subVectors(_b, _a);
    _e2.subVectors(_c, _a);
    _n.crossVectors(_e1, _e2);
    const len = _n.length();
    if (len < 1e-12) return;
    _n.multiplyScalar(1 / len);
    const sink = this.emissive ? this.glowSink : this.solid;
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;
    sink.pos.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
    sink.nrm.push(_n.x, _n.y, _n.z, _n.x, _n.y, _n.z, _n.x, _n.y, _n.z);
    sink.col.push(r, g, b, r, g, b, r, g, b);
  }

  /** A quad a-b-c-d (counter-clockwise from the front). */
  quad(
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
    d: readonly [number, number, number],
    color: number,
  ): void {
    this.tri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], color);
    this.tri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], color);
  }

  // ------------------------------------------------------------------------------------------
  // Primitives (origin at the bottom center unless noted)
  // ------------------------------------------------------------------------------------------

  /**
   * Axis-aligned box. Bottom faces are skipped (the camera never sees them).
   * `top`/`sides` let callers color the top differently (e.g. roofs, counters).
   */
  box(
    w: number,
    h: number,
    d: number,
    color: number,
    xf?: Xf,
    opts: { top?: number; bottom?: boolean } = {},
  ): this {
    if (xf) this.push(xf);
    const x0 = -w / 2;
    const x1 = w / 2;
    const z0 = -d / 2;
    const z1 = d / 2;
    const y0 = 0;
    const y1 = h;
    const top = opts.top ?? color;
    // top
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top);
    // south (+z)
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color);
    // north (-z)
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color);
    // east (+x)
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color);
    // west (-x)
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color);
    if (opts.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
    if (xf) this.pop();
    return this;
  }

  /** A thin box: floors, plates, shelves, signs. */
  slab(w: number, d: number, thickness: number, color: number, xf?: Xf): this {
    return this.box(w, thickness, d, color, xf);
  }

  /**
   * Extrude a convex polygon (points in XZ, counter-clockwise seen from above) from y0 to y1.
   */
  prism(
    input: readonly (readonly [number, number])[],
    y0: number,
    y1: number,
    color: number,
    xf?: Xf,
    top = color,
  ): this {
    if (xf) this.push(xf);
    // Normalize winding so faces point outward whatever order the caller used.
    let area = 0;
    for (let i = 0; i < input.length; i++) {
      const a = input[i];
      const b = input[(i + 1) % input.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    const points = area < 0 ? [...input].reverse() : input;
    const n = points.length;
    // top fan
    for (let i = 1; i < n - 1; i++) {
      const a = points[0];
      const b = points[i];
      const c = points[i + 1];
      this.tri(a[0], y1, a[1], c[0], y1, c[1], b[0], y1, b[1], top);
    }
    // sides
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      this.quad([b[0], y0, b[1]], [a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], color);
    }
    if (xf) this.pop();
    return this;
  }

  /** Box with chamfered vertical edges (an octagonal prism). */
  bevelBox(w: number, h: number, d: number, bevel: number, color: number, xf?: Xf, top = color): this {
    const bx = Math.min(bevel, w / 2 - 0.001);
    const bz = Math.min(bevel, d / 2 - 0.001);
    const x0 = -w / 2;
    const x1 = w / 2;
    const z0 = -d / 2;
    const z1 = d / 2;
    const pts: [number, number][] = [
      [x0 + bx, z1],
      [x1 - bx, z1],
      [x1, z1 - bz],
      [x1, z0 + bz],
      [x1 - bx, z0],
      [x0 + bx, z0],
      [x0, z0 + bz],
      [x0, z1 - bz],
    ];
    return this.prism(pts, 0, h, color, xf, top);
  }

  /** Regular n-gon prism (6–8 sides keeps the chunky look). */
  cylinder(r: number, h: number, sides: number, color: number, xf?: Xf, top = color): this {
    const pts: [number, number][] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return this.prism(pts, 0, h, color, xf, top);
  }

  /** Cone (or pyramid with few sides) from base radius r to an apex at height h. */
  cone(r: number, h: number, sides: number, color: number, xf?: Xf): this {
    if (xf) this.push(xf);
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      this.tri(Math.cos(a1) * r, 0, Math.sin(a1) * r, Math.cos(a0) * r, 0, Math.sin(a0) * r, 0, h, 0, color);
    }
    if (xf) this.pop();
    return this;
  }

  /** Wedge/ramp: width w along x, rising from the south edge (y = 0) to height h at the north edge. */
  wedge(w: number, h: number, d: number, color: number, xf?: Xf): this {
    if (xf) this.push(xf);
    const x0 = -w / 2;
    const x1 = w / 2;
    const z0 = -d / 2;
    const z1 = d / 2;
    // slope
    this.quad([x0, 0, z1], [x1, 0, z1], [x1, h, z0], [x0, h, z0], color);
    // back
    this.quad([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], color);
    // sides
    this.tri(x1, 0, z1, x1, 0, z0, x1, h, z0, color);
    this.tri(x0, 0, z0, x0, 0, z1, x0, h, z0, color);
    if (xf) this.pop();
    return this;
  }

  /** Gable roof: a triangular prism along x, ridge height h above the base, depth d. */
  gable(w: number, h: number, d: number, color: number, xf?: Xf, ends = color): this {
    if (xf) this.push(xf);
    const x0 = -w / 2;
    const x1 = w / 2;
    const z0 = -d / 2;
    const z1 = d / 2;
    this.quad([x0, 0, z1], [x1, 0, z1], [x1, h, 0], [x0, h, 0], color);
    this.quad([x1, 0, z0], [x0, 0, z0], [x0, h, 0], [x1, h, 0], color);
    this.tri(x1, 0, z1, x1, 0, z0, x1, h, 0, ends);
    this.tri(x0, 0, z0, x0, 0, z1, x0, h, 0, ends);
    if (xf) this.pop();
    return this;
  }

  /** Straight stairs rising toward the north: `steps` boxes. */
  stairs(w: number, h: number, d: number, steps: number, color: number, xf?: Xf): this {
    if (xf) this.push(xf);
    const sh = h / steps;
    const sd = d / steps;
    for (let i = 0; i < steps; i++) {
      this.box(w, sh * (i + 1), sd, color, { z: d / 2 - sd * (i + 0.5) });
    }
    if (xf) this.pop();
    return this;
  }

  /** Rectangular frame in the XY plane (door or window frame), facing +z. */
  frame(w: number, h: number, thickness: number, depth: number, color: number, xf?: Xf): this {
    if (xf) this.push(xf);
    const t = thickness;
    this.box(t, h, depth, color, { x: -w / 2 + t / 2 });
    this.box(t, h, depth, color, { x: w / 2 - t / 2 });
    this.box(w, t, depth, color, { y: h - t });
    this.box(w, t, depth, color, { y: 0 });
    if (xf) this.pop();
    return this;
  }

  /** Square-section pipe between two local points. */
  pipe(
    from: readonly [number, number, number],
    to: readonly [number, number, number],
    thickness: number,
    color: number,
  ): this {
    const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const len = dir.length();
    if (len < 1e-6) return this;
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const mat = new THREE.Matrix4().compose(
      new THREE.Vector3(from[0], from[1], from[2]),
      q,
      new THREE.Vector3(1, 1, 1),
    );
    this.stack.push(this.m.clone().multiply(mat));
    this.box(thickness, len, thickness, color);
    this.stack.pop();
    return this;
  }

  /** A flat ground patch (top face only) at height y. */
  ground(x0: number, z0: number, x1: number, z1: number, y: number, color: number): this {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color);
    return this;
  }

  // ------------------------------------------------------------------------------------------
  // Output
  // ------------------------------------------------------------------------------------------

  static toGeometry(sink: Sink): THREE.BufferGeometry | null {
    if (sink.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(sink.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(sink.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(sink.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  build(): { solid: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null; lights: LightSpec[] } {
    return { solid: Kit.toGeometry(this.solid), glow: Kit.toGeometry(this.glowSink), lights: this.lights };
  }
}

/** A geometry without vertex colors, for instanced meshes colored per instance (characters, particles). */
export function unitBoxGeometry(): THREE.BufferGeometry {
  const k = new Kit();
  k.box(1, 1, 1, 0xffffff, { y: -0.5 }, { bottom: true });
  const g = Kit.toGeometry(k.solid)!;
  g.deleteAttribute('color');
  return g;
}
