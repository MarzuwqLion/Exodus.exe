/**
 * Bot navigation: plans a path on the stop grid and turns it into stick input, walking at a natural pace
 * with a little heading and speed variation (spec §17.2 bots drive the simulation through PlayerIntent).
 */
import type { PlayerIntent } from '../core/types';
import { F, type Point } from '../sim/grid';
import type { StopSim } from '../sim/stop';
import type { MemberActor } from '../sim/types';

export interface NavOpts {
  /** Stick tilt 0..1 (0.7 is a natural walking pace). */
  tilt: number;
  /** Arrival tolerance in meters. */
  tol: number;
  sprint?: boolean;
  /** Avoid staff-only floor unless the target is in it. */
  avoidStaff?: boolean;
}

export class Navigator {
  private path: Point[] = [];
  private i = 0;
  private goal: Point | null = null;
  private repath = 0;
  private stuckT = 0;
  private lastX = 0;
  private lastY = 0;

  constructor(private readonly seed: number) {}

  reset(): void {
    this.path = [];
    this.goal = null;
  }

  /** Steer toward `goal`; writes intent.move (and sprint). Returns true when arrived. */
  go(sim: StopSim, m: MemberActor, goal: Point, it: PlayerIntent, o: NavOpts): boolean {
    const d = Math.hypot(goal.x - m.x, goal.y - m.y);
    if (d <= o.tol) {
      it.move.x = 0;
      it.move.y = 0;
      it.sprint = false;
      return true;
    }
    this.repath -= 1 / 60;
    const moved = Math.hypot(m.x - this.lastX, m.y - this.lastY);
    this.lastX = m.x;
    this.lastY = m.y;
    this.stuckT = moved < 0.004 ? this.stuckT + 1 / 60 : 0;
    if (
      !this.goal ||
      Math.hypot(this.goal.x - goal.x, this.goal.y - goal.y) > 0.3 ||
      this.i >= this.path.length ||
      this.repath <= 0 ||
      this.stuckT > 0.5
    ) {
      const staffGoal = sim.grid.flagAt(goal.x, goal.y, F.STAFF);
      const avoid =
        o.avoidStaff && !staffGoal
          ? (tx: number, ty: number) => (sim.grid.has(tx, ty, F.STAFF) ? 25 : 0)
          : undefined;
      const raw = sim.grid.path(m.x, m.y, goal.x, goal.y, avoid);
      this.path = raw ? sim.grid.smooth({ x: m.x, y: m.y }, raw, m.radius + 0.02) : [goal];
      if (raw && this.path.length > 0) this.path[this.path.length - 1] = goal;
      this.i = 0;
      this.goal = goal;
      this.repath = 2.5;
      if (this.stuckT > 0.5) {
        // Nudge sideways when stuck on a corner or another person.
        this.stuckT = 0;
      }
    }
    while (
      this.i < this.path.length - 1 &&
      Math.hypot(this.path[this.i].x - m.x, this.path[this.i].y - m.y) < 0.35
    )
      this.i++;
    const p = this.path[this.i] ?? goal;
    let ang = Math.atan2(p.y - m.y, p.x - m.x);
    const t = sim.time;
    // A human walks slightly unevenly.
    ang += Math.sin(t * 1.7 + this.seed) * 0.12 + Math.sin(t * 0.43 + this.seed * 3) * 0.06;
    let tilt = o.tilt * (1 + Math.sin(t * 1.1 + this.seed * 7) * 0.06);
    const last = this.i >= this.path.length - 1;
    if (last && d < 1.2) tilt = Math.min(tilt, 0.35 + d * 0.3);
    it.move.x = Math.cos(ang) * Math.min(1, tilt);
    it.move.y = Math.sin(ang) * Math.min(1, tilt);
    it.sprint = !!o.sprint;
    return false;
  }
}
