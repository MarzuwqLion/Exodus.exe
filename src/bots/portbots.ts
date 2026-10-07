/**
 * Port bots (spec §17.2): the cautious policy crosses the yard carefully and spends Papers at the gate.
 *
 * It keeps a map of what the hostiles, the dock workers, and the drones can see right now (a player watches
 * the cones and searchlights), routes around it, and waits in cover while the next stretch of its path is
 * watched. At the gate it shows Papers (or takes the breathing scan), waits on the apron side until the party
 * is through, then crosses the apron the same way and goes up the gangway. On ALERT, or with the clock
 * running out, it stops being careful and runs for the ship. In two-player runs the second bot keeps close
 * behind the first and goes through the arch on its own turn.
 */
import { PORT, PORT_GEO } from '../content/layouts/port';
import { TUNING } from '../content/tuning';
import { Rng, hashSeed } from '../core/rng';
import type { MemberId, PlayerIntent, Slot } from '../core/types';
import { clearEdges, emptyIntent } from '../input/intents';
import { startingParty, startingResources } from '../run/party';
import { findInteraction } from '../sim/actions';
import type { Point } from '../sim/grid';
import { inView, npcCanObserve, npcFacing } from '../sim/perception';
import { archOpenTo, behindGate } from '../sim/port';
import { StopSim, type StopConfig } from '../sim/stop';
import type { MemberActor, StopOutcome } from '../sim/types';

export class PortBot {
  readonly intent: PlayerIntent = emptyIntent();
  private rng: Rng;
  private danger: Uint8Array | null = null;
  private dangerT = 0;
  private path: Point[] = [];
  private pathI = 0;
  private goal: Point | null = null;
  private repath = 0;
  private waitT = 0;
  private breathPlan = { beat: -1, at: Infinity };
  private pressCd = 0;
  private lastX = 0;
  private lastY = 0;
  private stuckT = 0;
  private chargeT = -1;

  constructor(
    readonly slot: Slot,
    private readonly seed: number,
  ) {
    this.rng = new Rng(seed ^ 0x2c1b3c6d);
  }

  /** Tiles someone dangerous can see right now (with a little margin for turning heads). */
  private computeDanger(sim: StopSim): Uint8Array {
    const g = sim.grid;
    const d = this.danger ?? new Uint8Array(g.w * g.h);
    d.fill(0);
    const rm = sim.currentRangeMult();
    const mark = (x: number, y: number, facing: number, cone: number, range: number, los: boolean): void => {
      const r = Math.ceil(range);
      const x0 = Math.max(0, Math.floor(x) - r);
      const x1 = Math.min(g.w - 1, Math.floor(x) + r);
      const y0 = Math.max(0, Math.floor(y) - r);
      const y1 = Math.min(g.h - 1, Math.floor(y) + r);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const i = g.idx(tx, ty);
          if (d[i]) continue;
          if (inView(sim, x, y, facing, cone, range, tx + 0.5, ty + 0.5, los)) d[i] = 1;
        }
      }
    };
    for (const n of sim.npcs) {
      if (!npcCanObserve(sim, n) || n.role === 'crew' || n.role === 'mensah') continue;
      if (n.obs.sympathizer && n.helped) continue;
      mark(n.x, n.y, npcFacing(n), n.obs.coneDeg + 30, n.obs.range * rm + 1.5, true);
    }
    for (const dr of sim.drones) {
      mark(
        dr.x,
        dr.y,
        dr.beam,
        TUNING.observers.drone.coneDeg + 40,
        TUNING.observers.drone.range * rm + 2.5,
        true,
      );
    }
    this.danger = d;
    return d;
  }

  private dangerAt(sim: StopSim, p: Point): boolean {
    if (!this.danger) return false;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    return sim.grid.inBounds(tx, ty) && this.danger[sim.grid.idx(tx, ty)] === 1;
  }

  private plan(sim: StopSim, m: MemberActor, goal: Point, careful: boolean): void {
    const d = this.danger;
    const g = sim.grid;
    const avoid = careful && d ? (tx: number, ty: number): number => (d[g.idx(tx, ty)] ? 12 : 0) : undefined;
    const raw = g.path(m.x, m.y, goal.x, goal.y, avoid, 20000);
    this.path = raw ?? [goal];
    if (raw && this.path.length > 0) this.path[this.path.length - 1] = goal;
    this.pathI = 0;
    this.goal = goal;
    this.repath = careful ? 0.5 : 1.5;
  }

  /** Walk the planned path. With `careful`, wait in cover while the next stretch is watched. */
  private go(
    sim: StopSim,
    m: MemberActor,
    goal: Point,
    it: PlayerIntent,
    careful: boolean,
    run: boolean,
  ): boolean {
    const dd = Math.hypot(goal.x - m.x, goal.y - m.y);
    if (dd < 0.45) return true;
    this.repath -= 1 / 60;
    const moved = Math.hypot(m.x - this.lastX, m.y - this.lastY);
    this.lastX = m.x;
    this.lastY = m.y;
    this.stuckT = moved < 0.004 && this.waitT <= 0 ? this.stuckT + 1 / 60 : 0;
    if (
      !this.goal ||
      Math.hypot(this.goal.x - goal.x, this.goal.y - goal.y) > 0.3 ||
      this.pathI >= this.path.length ||
      this.repath <= 0 ||
      this.stuckT > 0.6
    ) {
      this.plan(sim, m, goal, careful);
      this.stuckT = 0;
    }
    while (
      this.pathI < this.path.length - 1 &&
      Math.hypot(this.path[this.pathI].x - m.x, this.path[this.pathI].y - m.y) < 0.4
    )
      this.pathI++;
    if (careful) {
      // Hold in cover while the next couple of meters are watched (up to a while; then go anyway).
      const here = this.dangerAt(sim, m);
      const ahead = this.path.slice(this.pathI, this.pathI + 3).some((p) => this.dangerAt(sim, p));
      if (!here && ahead && this.waitT < 14) {
        this.waitT += 1 / 60;
        // Standing still too long is its own tell: shift your weight now and then.
        if (m.stillT > 3 && this.pressCd <= 0) {
          it.blendTap = true;
          this.pressCd = 1;
        }
        return false;
      }
      if (!ahead) this.waitT = Math.max(0, this.waitT - 1 / 30);
    }
    const p = this.path[this.pathI] ?? goal;
    let ang = Math.atan2(p.y - m.y, p.x - m.x);
    const t = sim.time;
    ang += Math.sin(t * 1.7 + this.seed) * 0.12 + Math.sin(t * 0.43 + this.seed * 3) * 0.06;
    let tilt = run ? 1 : 0.72 * (1 + Math.sin(t * 1.1 + this.seed * 7) * 0.06);
    if (!run && dd < 1.2) tilt = Math.min(tilt, 0.35 + dd * 0.3);
    it.move.x = Math.cos(ang) * Math.min(1, tilt);
    it.move.y = Math.sin(ang) * Math.min(1, tilt);
    it.sprint = run;
    return false;
  }

  decide(sim: StopSim): PlayerIntent {
    const it = this.intent;
    clearEdges(it);
    it.move.x = 0;
    it.move.y = 0;
    it.sprint = false;
    it.interactHeld = false;
    it.blendHeld = false;
    it.attackHeld = false;
    it.aim = null;
    if (this.pressCd > 0) this.pressCd -= 1 / 60;
    const m = sim.controlled(this.slot);
    const port = sim.port;
    if (!m || !port) return it;
    if (m.chargeT >= 0 && this.chargeT >= 0) {
      // A tap: release next tick for a light swing.
      this.chargeT = -1;
      return it;
    }
    if (m.mode === 'scanned') {
      this.breathe(m, it);
      return it;
    }
    if (m.mode !== 'free' && m.mode !== 'carry') {
      // A blend or a scan in progress: let it play out (walk off a looping one if it's time to go).
      if (m.mode === 'blend' && (sim.alert.on || port.horn)) it.move.y = -0.6;
      return it;
    }
    this.dangerT -= 1 / 60;
    if (this.dangerT <= 0) {
      this.computeDanger(sim);
      this.dangerT = 0.25;
    }
    const clockLate = port.clock >= TUNING.port.hornAtMinutes - 6;
    const urgent = sim.alert.on || port.horn || clockLate;
    const run = (sim.alert.on && !sim.alert.searching) || port.horn;
    const careful = !urgent;
    const deck = { x: PORT_GEO.gangwayX + 1, y: PORT_GEO.deckY + 0.5 };
    // The yard: the gate (or, with no way through it, the waterline path the pathfinder knows).
    if (behindGate(m) && !port.gatePassed.has(m.idx)) {
      const arch = findInteraction(sim, m);
      if (arch?.kind === 'arch') {
        // A player breathes better than the AI: if the Papers won't cover everyone still behind the gate, take
        // the scan and leave them for the others.
        const behind = sim.members.filter(
          (o) =>
            o !== m &&
            sim.available(o) &&
            o.state.kind === 'android' &&
            behindGate(o) &&
            !port.gatePassed.has(o.idx),
        ).length;
        const scanMyself = !!arch.alt && sim.resources.papers < behind + 1;
        if (!arch.disabled && this.pressCd <= 0) {
          if (scanMyself) it.blendTap = true;
          else it.interact = true;
          this.pressCd = 0.4;
        } else if (arch.disabled && arch.disabled !== 'Someone is being scanned') {
          this.go(sim, m, deck, it, false, run);
        }
        return it;
      }
      const lead = this.slot === 1 ? sim.controlled(0) : undefined;
      if (lead && behindGate(lead) && !port.gatePassed.has(lead.idx) && !urgent) {
        // Two players: the second keeps close behind the first until it's their turn at the arch.
        const behind = { x: lead.x - Math.cos(lead.facing) * 1.6, y: lead.y - Math.sin(lead.facing) * 1.6 };
        const spot = sim.grid.walkableAt(behind.x, behind.y) ? behind : { x: lead.x, y: lead.y + 1 };
        if (Math.hypot(spot.x - m.x, spot.y - m.y) > 1.2) this.go(sim, m, spot, it, false, false);
        return it;
      }
      // The arch (if it will still let us through), else the long way round by the waterline path.
      this.go(sim, m, archOpenTo(sim, m) ? PORT_GEO.archSouth : deck, it, careful, run);
      return it;
    }
    // Through the gate: wait (out of the way, in cover) until the rest of the party is through.
    const waiting = sim.members.some(
      (o) => o !== m && sim.available(o) && behindGate(o) && !port.gatePassed.has(o.idx),
    );
    if (waiting && !urgent && m.y < PORT_GEO.fenceY && m.y > PORT_GEO.fenceY - 6) {
      const spot = { x: PORT_GEO.archNorth.x + (this.slot === 0 ? -2 : 2), y: PORT_GEO.archNorth.y - 2 };
      if (Math.hypot(spot.x - m.x, spot.y - m.y) > 0.6) this.go(sim, m, spot, it, false, false);
      else if (m.stillT > 3 && this.pressCd <= 0) {
        it.blendTap = true;
        this.pressCd = 1;
      }
      return it;
    }
    // The apron (or the waterline path): to the gangway and up it.
    if (this.slot === 1 && !urgent) {
      const lead = sim.controlled(0);
      if (lead && !behindGate(lead)) {
        const behind = { x: lead.x - Math.cos(lead.facing) * 1.6, y: lead.y - Math.sin(lead.facing) * 1.6 };
        if (Math.hypot(behind.x - m.x, behind.y - m.y) > 1.4 && sim.grid.walkableAt(behind.x, behind.y)) {
          this.go(sim, m, behind, it, false, false);
          return it;
        }
        return it;
      }
    }
    // Someone standing in the way at the gangway: go through them.
    const foe = this.blocker(sim, m);
    if (foe) {
      const ax = foe.x - m.x;
      const ay = foe.y - m.y;
      const d = Math.hypot(ax, ay) || 1;
      it.aim = { x: ax / d, y: ay / d };
      if (d > 1.2) {
        it.move.x = (ax / d) * 0.6;
        it.move.y = (ay / d) * 0.6;
      } else if (m.mode === 'free') {
        it.attack = true;
        it.attackHeld = true;
        this.chargeT = 0;
      }
      void TUNING.combat.heavyChargeSeconds;
      return it;
    }
    this.go(sim, m, deck, it, careful, run);
    return it;
  }

  /**
   * Who to fight at the berth: while Recyclers hold it (the gangway is up), the nearest of them; otherwise
   * anyone standing right in the way near the gangway's foot.
   */
  private blocker(sim: StopSim, m: MemberActor): { x: number; y: number } | null {
    const foot = sim.layout.waypoints.get('gangwayFoot');
    const port = sim.port;
    if (!foot || !port || behindGate(m)) return null;
    const df = Math.hypot(m.x - foot.x, m.y - foot.y);
    if (df > (port.gangwayUp ? 9 : 4.5)) return null;
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const n of sim.npcs) {
      if (!n.hostile || !sim.isActiveNpc(n)) continue;
      const d = Math.hypot(n.x - m.x, n.y - m.y);
      const holding =
        port.gangwayUp && Math.hypot(n.x - foot.x, n.y - foot.y) < TUNING.port.berthHoldRadius + 0.5;
      if ((holding || d < 1.9) && d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  private breathe(m: MemberActor, it: PlayerIntent): void {
    const s = m.scan;
    if (!s || s.done || s.next >= s.beats.length) return;
    if (this.breathPlan.beat !== s.next) {
      const off = this.rng.range(0.05, 0.1) * this.rng.sign();
      this.breathPlan = { beat: s.next, at: s.beats[s.next] + off };
    }
    if (s.t >= this.breathPlan.at) {
      it.interact = true;
      this.breathPlan.at = Infinity;
    }
  }
}

export interface PortRunOpts {
  seed: number;
  players: 1 | 2;
  heat: number;
  /** Captain Mensah's part was delivered. */
  mensah?: boolean;
  papers?: number;
  /** One android arrives nearly flat (in low power: half speed, no sprint). */
  lowPower?: boolean;
  patch?: (cfg: StopConfig) => void;
}

export interface PortRunResult {
  aboard: MemberId[];
  androidsAboard: number;
  exposed: boolean;
  alertAt: number | null;
  horn: boolean;
  seconds: number;
  end: string;
  outcome: StopOutcome | null;
}

export function portConfigFor(o: PortRunOpts): StopConfig {
  const control: Record<Slot, MemberId | null> = { 0: 'wren', 1: o.players === 2 ? 'brick' : null };
  const party = startingParty();
  // Arriving at the end of the road: a leg's Battery gone. Careful parties arrive in good repair (the economy
  // simulator measures their lowest Integrity on arrival at about 90), so Integrity stays where it starts.
  for (const m of party) if (m.kind === 'android') m.battery -= TUNING.battery.perLeg;
  if (o.lowPower) {
    const last = [...party].reverse().find((m) => m.kind === 'android');
    if (last && last.kind === 'android') last.battery = TUNING.charging.lowBattery - 5;
  }
  const resources = startingResources();
  if (o.papers !== undefined) resources.papers = o.papers;
  const cfg: StopConfig = {
    layout: PORT,
    seed: hashSeed('portbot', o.seed),
    region: 'lowcountry',
    weather: 'storm',
    heat: o.heat,
    day: 11,
    party,
    control,
    resources,
    port: { seconds: TUNING.port.realSeconds, gateCrewSympathizers: !!o.mensah },
  };
  o.patch?.(cfg);
  return cfg;
}

/** Play the Port from a run's own configuration: returns its outcome (null only if the clock never ran out). */
export function playPort(cfg: StopConfig, seed: number): StopOutcome | null {
  const sim = new StopSim(cfg);
  const bots = [new PortBot(0, seed * 7 + 1)];
  if (cfg.control[1]) bots.push(new PortBot(1, seed * 7 + 2));
  const limit = (TUNING.port.realSeconds + 30) * 60;
  for (let t = 0; t < limit && !sim.outcome; t++) {
    const intents: Partial<Record<Slot, PlayerIntent>> = {};
    for (const b of bots) intents[b.slot] = b.decide(sim);
    sim.step(intents);
  }
  return sim.outcome;
}

export function runPortBots(o: PortRunOpts): PortRunResult {
  const sim = new StopSim(portConfigFor(o));
  const bots = [new PortBot(0, o.seed * 7 + 1)];
  if (o.players === 2) bots.push(new PortBot(1, o.seed * 7 + 2));
  let alertAt: number | null = null;
  const limit = (TUNING.port.realSeconds + 30) * 60;
  for (let t = 0; t < limit && !sim.outcome; t++) {
    const intents: Partial<Record<Slot, PlayerIntent>> = {};
    for (const b of bots) intents[b.slot] = b.decide(sim);
    sim.step(intents);
    if (alertAt === null && sim.alert.on && !sim.port?.horn) alertAt = sim.time;
  }
  const out = sim.outcome;
  const aboard = out?.aboard ?? [];
  return {
    aboard,
    androidsAboard: aboard.filter((id) => id !== 'june').length,
    exposed: alertAt !== null,
    alertAt,
    horn: !!sim.port?.horn,
    seconds: sim.time,
    end: out?.end ?? 'timeout',
    outcome: out,
  };
}
