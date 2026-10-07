/**
 * Stop bots (spec §17.2): policies that play a stop through PlayerIntent, reading simulation state directly.
 * They exist for balance, not as good AI.
 *
 * - cautious: walks naturally, Blends when observed, uses distraction windows, leaves at the first drone
 * - greedy: like cautious, but stays through the second drone and searches everything
 * - reckless: sprints everywhere and ignores observers
 *
 * In two-player runs one bot charges while the other searches.
 */
import { TUNING } from '../content/tuning';
import type { PlayerIntent, Slot } from '../core/types';
import { Rng } from '../core/rng';
import { clearEdges, emptyIntent } from '../input/intents';
import { LOOPING } from '../sim/blend';
import { partnerOf } from '../sim/members';
import { F, type Point } from '../sim/grid';
import { inView, npcCanObserve, npcFacing } from '../sim/perception';
import type { StopSim } from '../sim/stop';
import type { ContainerState, MemberActor } from '../sim/types';
import { Navigator } from './nav';

export type StopBotKind = 'cautious' | 'greedy' | 'reckless';
export type StopBotRole = 'solo' | 'charger' | 'searcher';

type Task =
  | { kind: 'charge'; bay: number }
  | { kind: 'hack'; kiosk: number }
  | { kind: 'search'; container: number }
  | { kind: 'wait'; spot: Point }
  | { kind: 'chargeCar'; bay: number }
  | { kind: 'order' }
  | { kind: 'sit'; spot: Point }
  | { kind: 'loiter'; spot: Point; until: number }
  | { kind: 'leave' };

export class StopBot {
  readonly intent: PlayerIntent = emptyIntent();
  private nav: Navigator;
  private rng: Rng;
  private task: Task | null = null;
  private pressDelay = 0;
  private breathPlan = { beat: -1, at: Infinity };
  /** Containers given up on, and when they may be tried again (greedy retries; cautious never does). */
  private aborted = new Map<number, number>();
  private cellsTarget: number;
  private chargedOnce = false;
  private reactAt = Infinity;
  /** When the player notices the eye glyph (Suspicion over 30) above their character. */
  private eyeAt = Infinity;
  private publicDone = 0;
  private chargeCells = 0;
  private toppedUp = false;
  /** When this bot reached the car to leave. */
  private atCarSince = Infinity;
  private privateDone = 0;
  private stillLimit = 3.5;
  private sitUntil = 0;
  private satDown = false;
  private carStart = -1;
  private carDone = false;

  constructor(
    readonly kind: StopBotKind,
    readonly slot: Slot,
    readonly role: StopBotRole,
    seed: number,
  ) {
    this.nav = new Navigator(seed % 97);
    this.rng = new Rng(seed ^ 0x5bd1e995);
    this.cellsTarget = kind === 'greedy' ? 22 : kind === 'cautious' ? 13 : 8;
  }

  private member(sim: StopSim): MemberActor | undefined {
    return sim.controlled(this.slot);
  }

  /** Should we head for the car now? */
  private timeToLeave(sim: StopSim): boolean {
    if (sim.alert.on || sim.exit.departing) return true;
    // A compromised Station: take the keeper's bag and go quietly.
    if (sim.kind === 'compromised')
      return !sim.containers.some((c) => c.kind === 'supplyBag' && !c.searched) || sim.patrol.fired.drone1;
    if (this.kind === 'cautious') return sim.patrol.fired.drone1;
    // Greedy stays through the second drone: out about 40 s after it arrives.
    if (this.kind === 'greedy') return sim.time > sim.patrol.drone2 + 40 || sim.time > 320;
    return this.nothingLeft(sim) && this.chargedOnce;
  }

  private gaveUp(sim: StopSim, id: number): boolean {
    return sim.time < (this.aborted.get(id) ?? -Infinity);
  }

  private nothingLeft(sim: StopSim): boolean {
    return !sim.containers.some((c) => !c.searched && !c.locked && !this.gaveUp(sim, c.id));
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
    const m = this.member(sim);
    if (!m) return it;
    // All a player sees of their Suspicion is the eye glyph over 30, noticed after a human reaction time.
    if (m.suspicion <= TUNING.awareness.curious) this.eyeAt = Infinity;
    else if (this.eyeAt === Infinity) this.eyeAt = sim.time + this.rng.range(0.5, 1.2);
    if (m.mode === 'scanned') {
      this.breathe(sim, m, it);
      return it;
    }
    if (m.mode === 'hack') {
      this.hackInput(m, it);
      return it;
    }
    if (m.mode === 'blend' && m.blend && LOOPING.has(m.blend)) {
      // Sitting with coffee or pumping gas: get up when the job is done or it's time to go.
      if (this.loopDone(sim, m)) {
        if (m.blend === 'pump') this.carDone = true;
        if (m.blend === 'sit') this.satDown = true;
        it.move.y = 0.6;
      }
      return it;
    }
    if (
      m.mode === 'blend' ||
      m.mode === 'chat' ||
      m.mode === 'glitch' ||
      m.mode === 'attack' ||
      m.mode === 'dash'
    ) {
      return it;
    }
    if (this.timeToLeave(sim)) {
      if (m.plug) {
        it.move.x = 0.5;
        return it;
      }
      this.task = { kind: 'leave' };
    }
    const reckless = this.kind === 'reckless';
    // Blend like a person would: react to the eye glyph (Suspicion over 30) after a human reaction time, and
    // let stillness slip a little before covering it (not when fleeing).
    if (!reckless && !sim.alert.on && m.mode === 'free') {
      const eye = m.suspicion > TUNING.awareness.curious;
      if (eye && this.reactAt === Infinity) {
        const [a, b] = [0.5, 1.2];
        this.reactAt = sim.time + this.rng.range(a, b);
      }
      const reacting = sim.time >= this.reactAt;
      const still = m.stillT > this.stillLimit;
      if ((reacting || still) && this.pressDelay <= 0) {
        this.reactAt = Infinity;
        this.stillLimit = this.rng.range(2.5, 5);
        if (m.suspicion > 22 || still) {
          // Side by side with the other player: Chat (the co-op Blend) beats a Blend alone.
          const p = partnerOf(sim, m);
          const chat =
            p &&
            (p.mode === 'free' || (p.mode === 'blend' && !(p.blend && LOOPING.has(p.blend)))) &&
            Math.hypot(p.x - m.x, p.y - m.y) <= TUNING.blend.chatDistance;
          if (chat) it.ping = true;
          else it.blendTap = true;
          this.pressDelay = 0.2;
          return it;
        }
      }
    }
    this.pressDelay -= 1 / 60;
    if (m.mode === 'search' || m.mode === 'channel') {
      // Keep holding unless caught going through something private: a cautious bot backs off once it notices
      // the eye, a greedy one only when the eye is nearly full.
      const c = m.channel && m.mode === 'search' ? sim.containers[m.channel.target] : null;
      const caught = this.kind === 'cautious' ? sim.time >= this.eyeAt : m.suspicion > 75;
      if (c && c.private && !reckless && caught) {
        this.aborted.set(c.id, this.kind === 'greedy' ? sim.time + 25 : Infinity);
        this.task = null;
        return it;
      }
      it.interactHeld = true;
      return it;
    }
    // A distraction window opens: drop what we're doing and go for the back office (cautious and greedy).
    const windowNow = sim.kind === 'diner' ? this.openPrivate(sim, m) !== null : this.smokeBreak(sim);
    if (
      this.kind !== 'reckless' &&
      this.role !== 'charger' &&
      windowNow &&
      this.privateDone < this.privateQuota() &&
      this.task?.kind !== 'leave'
    ) {
      const charged = m.state.kind !== 'android' || m.state.battery >= 85;
      const busyPrivate = this.task?.kind === 'search' && sim.containers[this.task.container]?.private;
      if (!busyPrivate && (!m.plug || charged)) {
        const c = sim.kind === 'diner' ? this.openPrivate(sim, m) : this.nearestPrivate(sim, m);
        if (c) {
          if (m.plug) {
            this.chargedOnce = true;
            it.move.x = 0.6;
            this.task = { kind: 'search', container: c.id };
            return it;
          }
          this.task = { kind: 'search', container: c.id };
        }
      }
    }
    if (!this.task) this.task = this.pickTask(sim, m);
    if (!this.task) return it;
    this.run(sim, m, it, this.task);
    return it;
  }

  private pickTask(sim: StopSim, m: MemberActor): Task | null {
    // The stop's main activity: order coffee and sit (diner), charge the car (gas), charge yourself (depot).
    if (sim.kind === 'diner' && this.kind !== 'reckless') {
      if (!m.ordered) return { kind: 'order' };
      if (m.hasCoffee && !this.satDown) {
        const spot = this.seatSpot(sim, m);
        if (spot) return { kind: 'sit', spot };
        this.satDown = true;
      }
    }
    if (sim.kind === 'gas' && this.role !== 'searcher' && !this.carDone && this.kind !== 'reckless') {
      const bay = sim.bays.find((b) => b.forCar && (b.user < 0 || b.user === m.idx));
      if (bay) {
        if (sim.credits <= 0 && sim.resources.papers <= 0 && sim.kiosks.length > 0)
          return { kind: 'hack', kiosk: 0 };
        if (sim.credits > 0 || sim.resources.papers > 0) return { kind: 'chargeCar', bay: bay.idx };
      }
      this.carDone = true;
    }
    const wantCharge =
      sim.kind === 'depot' && this.role !== 'searcher' && m.state.kind === 'android' && !this.chargedOnce;
    if (wantCharge) {
      const bay = this.freeBay(sim, m);
      if (bay >= 0) {
        if (sim.credits <= 0 && sim.resources.papers <= 0 && sim.kiosks.length > 0)
          return { kind: 'hack', kiosk: 0 };
        return { kind: 'charge', bay };
      }
    }
    const c = this.pickContainer(sim, m);
    if (c) return { kind: 'search', container: c.id };
    if (
      sim.kind === 'depot' &&
      this.kind === 'greedy' &&
      m.state.kind === 'android' &&
      this.role !== 'searcher' &&
      !this.toppedUp
    ) {
      // Nothing left to search: top up more Cells until the second drone.
      const bay = this.freeBay(sim, m);
      if (bay >= 0 && (sim.credits > 0 || sim.resources.papers > 0 || sim.kiosks.length > 0)) {
        this.toppedUp = true;
        this.cellsTarget += 10;
        this.chargedOnce = false;
        if (sim.credits <= 0 && sim.resources.papers <= 0) return { kind: 'hack', kiosk: 0 };
        return { kind: 'charge', bay };
      }
    }
    if (this.kind === 'cautious' && this.role !== 'charger' && this.privateDone < this.privateQuota()) {
      // Wait near the store, browsing, for the clerk's smoke break (a distraction window).
      const spot = this.waitSpot(sim);
      if (spot) return { kind: 'wait', spot };
    }
    if (this.kind === 'reckless') return { kind: 'leave' };
    return this.loiter(sim, m);
  }

  /** Nothing to do yet: loiter like a customer (browse near the store, or take a booth with coffee). */
  private loiter(sim: StopSim, m: MemberActor): Task | null {
    if (sim.kind === 'diner' && m.hasCoffee) {
      const seat = this.seatSpot(sim, m);
      if (seat) return { kind: 'sit', spot: seat };
    }
    const spot = this.waitSpot(sim);
    return spot ? { kind: 'loiter', spot, until: sim.time + this.rng.range(5, 10) } : null;
  }

  private freeBay(sim: StopSim, m: MemberActor): number {
    let best = -1;
    let bd = Infinity;
    for (const b of sim.bays) {
      if (b.forCar || b.user >= 0) continue;
      const d = Math.hypot(b.x - m.x, b.y - m.y);
      if (d < bd) {
        bd = d;
        best = b.idx;
      }
    }
    return best;
  }

  /** Clerk on a smoke break: the register and back office are unwatched. */
  private smokeBreak(sim: StopSim): boolean {
    return sim.npcs.some((n) => n.role === 'clerk' && n.mode === 'routine' && n.step === 2);
  }

  private nearestPrivate(sim: StopSim, m: MemberActor): ContainerState | null {
    let best: ContainerState | null = null;
    let bd = Infinity;
    // Lockers first (Parts and Skin patches), then the register and the office desk.
    const pri: Record<string, number> = {
      locker: 0,
      register: 4,
      office: 6,
      bench: 8,
      kitchen: 10,
      garage: 8,
      supplyBag: 0,
    };
    for (const c of sim.containers) {
      if (!c.private || c.searched || c.locked || this.gaveUp(sim, c.id)) continue;
      const d = Math.hypot(c.access.x - m.x, c.access.y - m.y) + (pri[c.kind] ?? 10);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  private loopDone(sim: StopSim, m: MemberActor): boolean {
    if (this.timeToLeave(sim) || sim.alert.on) return true;
    if (m.blend === 'pump') {
      if (this.carStart < 0) this.carStart = sim.resources.carBattery;
      const target = this.kind === 'greedy' ? 40 : 25;
      return sim.resources.carBattery >= Math.min(100, this.carStart + target);
    }
    if (m.blend === 'sit') {
      // A seat taken on a whim (a Blend tap) is kept a while too.
      if (this.sitUntil < sim.time - m.modeT) this.sitUntil = sim.time - m.modeT + this.rng.range(18, 34);
      return sim.time >= this.sitUntil;
    }
    return m.modeT > 8;
  }

  /** A private container's window is open: the clerk is smoking (depot, gas) or nobody can see it (diner). */
  private windowOpen(sim: StopSim, c: ContainerState): boolean {
    if (sim.kind === 'depot' || sim.kind === 'gas') return this.smokeBreak(sim);
    return !this.watched(sim, c.access);
  }

  /**
   * Is someone a person would keep an eye on (staff, guards, Recyclers, cameras) looking at this spot? A
   * player can't track every customer's gaze, so customers are the risk they don't see coming.
   */
  private watched(sim: StopSim, p: Point): boolean {
    for (const n of sim.npcs) {
      if (n.role === 'customer' || !npcCanObserve(sim, n) || n.blindT > 0) continue;
      if (inView(sim, n.x, n.y, npcFacing(n), n.obs.coneDeg, n.obs.range * sim.currentRangeMult(), p.x, p.y))
        return true;
    }
    for (const c of sim.cameras) {
      if (inView(sim, c.x, c.y, c.facing, c.obs.coneDeg, c.obs.range * sim.currentRangeMult(), p.x, p.y))
        return true;
    }
    return false;
  }

  private privateQuota(): number {
    if (this.kind === 'greedy') return 99;
    return 2;
  }

  /** A public shelf near the staff door to loiter at while waiting for a window. */
  private waitSpot(sim: StopSim): Point | null {
    const office = sim.layout.waypoints.get('office') ?? sim.layout.waypoints.get('register');
    let best: Point | null = null;
    let bd = Infinity;
    for (const c of sim.containers) {
      if (c.private) continue;
      const d = office ? Math.hypot(c.access.x - office.x, c.access.y - office.y) : 0;
      if (d < bd) {
        bd = d;
        best = c.access;
      }
    }
    return best;
  }

  private pickContainer(sim: StopSim, m: MemberActor): ContainerState | null {
    // Greedy searches everything: unwatched things first, then (with nothing else left) the risky ones.
    return this.pickFrom(sim, m, true) ?? (this.kind === 'greedy' ? this.pickFrom(sim, m, false) : null);
  }

  private pickFrom(sim: StopSim, m: MemberActor, careful: boolean): ContainerState | null {
    let best: ContainerState | null = null;
    let bd = Infinity;
    for (const c of sim.containers) {
      if (c.searched || c.locked || this.gaveUp(sim, c.id)) continue;
      if (this.kind === 'cautious') {
        // Public shelves first; private ones only during a distraction window.
        if (c.private && (!this.windowOpen(sim, c) || this.privateDone >= this.privateQuota())) continue;
        if (!c.private && this.publicDone >= (this.role === 'searcher' ? 3 : 2)) continue;
      }
      // In a pair, the charger keeps up appearances: only public things within reach.
      if (this.role === 'charger' && (c.private || Math.hypot(c.access.x - m.x, c.access.y - m.y) > 3))
        continue;
      // Greedy: not while someone is looking straight at it, unless nothing else is left.
      if (careful && this.kind === 'greedy' && c.private && this.watched(sim, c.access)) continue;
      if (
        this.kind === 'greedy' &&
        c.private &&
        c.kind === 'register' &&
        !this.smokeBreak(sim) &&
        sim.time < 60
      )
        continue;
      const d =
        Math.hypot(c.access.x - m.x, c.access.y - m.y) + (c.private && this.kind === 'cautious' ? 6 : 0);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  private run(sim: StopSim, m: MemberActor, it: PlayerIntent, task: Task): void {
    const reckless = this.kind === 'reckless';
    const nav = {
      tilt: reckless ? 1 : 0.7,
      tol: 0.3,
      sprint: reckless || sim.alert.on,
      avoidStaff: !reckless,
    };
    switch (task.kind) {
      case 'leave': {
        // A checkpoint bust: someone has to raise the barrier from the control booth first.
        const booth = sim.cfg.bust && !sim.gateOpen ? sim.layout.waypoints.get('booth') : undefined;
        if (booth) {
          const other = sim.members.find((o) => o !== m && o.controller !== null && sim.available(o));
          const mine =
            !other ||
            Math.hypot(m.x - booth.x, m.y - booth.y) <= Math.hypot(other.x - booth.x, other.y - booth.y);
          if (mine) {
            if (!this.nav.go(sim, m, booth, it, { ...nav, tol: 0.5 })) return;
            it.interact = m.mode === 'free';
            it.interactHeld = true;
            return;
          }
        }
        const exit = this.exitTile(sim, m);
        if (sim.inExit(m.x, m.y)) {
          // Hold Leave once the other player is at the car and the party AI is close behind (they walk over
          // when the car is ready), or after waiting a while.
          this.atCarSince = Math.min(this.atCarSince, sim.time);
          const together = sim.members.every(
            (o) =>
              o === m ||
              !sim.available(o) ||
              sim.inExit(o.x, o.y) ||
              Math.hypot(o.x - m.x, o.y - m.y) < (o.controller === null ? 6 : 3),
          );
          if (together || sim.time - this.atCarSince > 45 || sim.alert.on) {
            it.interactHeld = true;
            if (!sim.exit.departing) it.interact = true;
          }
          return;
        }
        this.nav.go(sim, m, exit, it, { ...nav, tol: 0.2 });
        return;
      }
      case 'hack': {
        const k = sim.kiosks[task.kiosk];
        const front = sim.grid.nearestWalkable(k.x, k.y + 1) ?? k;
        if (!this.nav.go(sim, m, front, it, nav)) return;
        if (sim.credits > 0) {
          this.task = null;
          return;
        }
        it.interact = true;
        return;
      }
      case 'charge': {
        const b = sim.bays[task.bay];
        if (!b || (b.user >= 0 && b.user !== m.idx)) {
          this.task = null;
          return;
        }
        if (m.plug) {
          // Stay plugged until topped up and the Cells target is met.
          const full = m.state.kind === 'android' && m.state.battery >= 99.5;
          // Count this bot's own charging (a partner's finds don't make it unplug sooner).
          if (full) this.chargeCells += TUNING.charging.rate / 60;
          if (full && this.chargeCells >= this.cellsTarget) {
            this.chargedOnce = true;
            this.task = null;
            it.move.x = 0.6;
          }
          return;
        }
        const front = sim.grid.nearestWalkable(b.x, b.y + 1) ?? { x: b.x, y: b.y + 1 };
        if (!this.nav.go(sim, m, front, it, nav)) return;
        if (sim.credits <= 0 && sim.resources.papers <= 0) {
          this.task = sim.kiosks.length > 0 ? { kind: 'hack', kiosk: 0 } : null;
          if (!this.task) this.chargedOnce = true;
          return;
        }
        it.interact = true;
        it.interactHeld = true;
        return;
      }
      case 'wait': {
        const open = sim.kind === 'diner' ? this.openPrivate(sim, m) !== null : this.smokeBreak(sim);
        if (open || sim.patrol.fired.drone1) {
          this.task = null;
          return;
        }
        this.nav.go(sim, m, task.spot, it, { ...nav, tol: 0.4 });
        return;
      }
      case 'loiter': {
        if (sim.time >= task.until) {
          this.task = null;
          return;
        }
        this.nav.go(sim, m, task.spot, it, { ...nav, tol: 0.5 });
        return;
      }
      case 'order': {
        if (m.ordered) {
          this.task = null;
          return;
        }
        const q = sim.layout.waypoints.get('queue');
        if (!q) {
          this.task = null;
          return;
        }
        if (!this.nav.go(sim, m, q, it, { ...nav, tol: 0.35 })) return;
        it.blendTap = true;
        return;
      }
      case 'sit': {
        if (!this.nav.go(sim, m, task.spot, it, { ...nav, tol: 0.3 })) return;
        this.sitUntil = sim.time + this.rng.range(18, 34);
        it.blendTap = true;
        this.task = null;
        return;
      }
      case 'chargeCar': {
        const b = sim.bays[task.bay];
        if (!b || this.carDone) {
          this.task = null;
          return;
        }
        // Stand beside the charger on the lot side: in the exit zone, A means Leave.
        const side = [-1, 1, 0, 0].map((dx, i) => ({ x: b.x + dx, y: b.y + [0, 0, -1, 1][i] }));
        const front = side.find(
          (p) => sim.grid.walkable(Math.floor(p.x), Math.floor(p.y)) && !sim.inExit(p.x, p.y),
        ) ?? { x: b.x, y: b.y + 1 };
        if (!this.nav.go(sim, m, front, it, nav)) return;
        it.interact = true;
        it.interactHeld = true;
        return;
      }
      case 'search': {
        const c = sim.containers[task.container];
        if (!c || c.searched || this.gaveUp(sim, c.id)) {
          if (c?.searched) {
            if (c.private) this.privateDone++;
            else this.publicDone++;
          }
          this.task = null;
          return;
        }
        // Cautious bots don't go into staff areas once the window has closed (unless already there).
        if (
          !reckless &&
          c.private &&
          this.kind === 'cautious' &&
          !this.windowOpen(sim, c) &&
          Math.hypot(c.access.x - m.x, c.access.y - m.y) > 1.5
        ) {
          this.task = null;
          return;
        }
        if (!this.nav.go(sim, m, c.access, it, { ...nav, tol: 0.25 })) return;
        it.interact = true;
        it.interactHeld = true;
        return;
      }
    }
  }

  /** The nearest private container whose window is open right now. */
  private openPrivate(sim: StopSim, m: MemberActor): ContainerState | null {
    let best: ContainerState | null = null;
    let bd = Infinity;
    for (const c of sim.containers) {
      if (!c.private || c.searched || c.locked || this.gaveUp(sim, c.id)) continue;
      if (!this.windowOpen(sim, c)) continue;
      const d = Math.hypot(c.access.x - m.x, c.access.y - m.y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  /** A free seat beside a booth with an unsearched wallet (or any free seat). */
  private seatSpot(sim: StopSim, m: MemberActor): Point | null {
    let best: Point | null = null;
    let bd = Infinity;
    for (const s of sim.spots) {
      if (s.kind !== 'seat' || s.taken >= 0) continue;
      // Brick breaks stools and chairs: booths and benches only.
      if (m.id === 'brick' && sim.grid.charAt(Math.floor(s.face.x), Math.floor(s.face.y)) === 'c') continue;
      if (sim.members.some((o) => o !== m && Math.hypot(o.x - s.p.x, o.y - s.p.y) < 0.6)) continue;
      const wallet = sim.containers.some(
        (c) => c.kind === 'wallet' && !c.searched && Math.hypot(c.cx - s.p.x, c.cy - s.p.y) < 1.8,
      );
      const d = Math.hypot(s.p.x - m.x, s.p.y - m.y) - (wallet ? 6 : 0);
      if (d < bd) {
        bd = d;
        best = s.p;
      }
    }
    return best;
  }

  private exitTile(sim: StopSim, m: MemberActor): Point {
    let best = sim.exitTiles[0];
    let bd = Infinity;
    for (const t of sim.exitTiles) {
      if (!sim.grid.walkable(Math.floor(t.x), Math.floor(t.y))) continue;
      const taken = sim.members.some((o) => o !== m && Math.hypot(o.x - t.x, o.y - t.y) < 0.6);
      const d = Math.hypot(t.x - m.x, t.y - m.y) + (taken ? 3 : 0);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  private hackInput(m: MemberActor, it: PlayerIntent): void {
    const h = m.hack;
    if (!h) return;
    this.pressDelay -= 1 / 60;
    if (this.pressDelay > 0) return;
    this.pressDelay = this.rng.range(0.25, 0.5);
    const b = h.seq[h.pos];
    if (b === 0) it.interact = true;
    else if (b === 1) it.dash = true;
    else if (b === 2) it.blendTap = true;
    else it.ability = true;
  }

  /** Human answerer timing: breathe within ±100 ms of the beat, but never on the center notch. */
  private breathe(sim: StopSim, m: MemberActor, it: PlayerIntent): void {
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
    void sim;
  }
}

/** Is a tile staff-only (bots use it to avoid wandering into back rooms). */
export function isStaffTile(sim: StopSim, p: Point): boolean {
  return sim.grid.flagAt(p.x, p.y, F.STAFF);
}

export const BOT_LIMIT_SECONDS = 420;
export { TUNING };
