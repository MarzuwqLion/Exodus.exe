/**
 * The real-time stop simulation (spec §8, §10): a headless, deterministic 60 Hz world of party members,
 * NPC observers, cameras, drones, containers, chargers, and the car. Scenes, bots, and tests drive it with
 * one PlayerIntent per slot per tick; rendering reads its state and drains its events.
 */
import { TUNING } from '../content/tuning';
import { Rng, hashSeed } from '../core/rng';
import type {
  AndroidId,
  MemberId,
  MemberState,
  PlayerIntent,
  Region,
  Resources,
  Slot,
  StopModifier,
  Weather,
} from '../core/types';
import { F, type Grid, type Point } from './grid';
import { parseLayout, type LayoutDef, type LayoutKind, type ParsedLayout } from './layout';
import { rollLoot } from './loot';
import type {
  BayState,
  CameraObserver,
  ContainerState,
  CustomerSpot,
  DroneActor,
  HeavyObject,
  MemberActor,
  NpcActor,
  SimEvent,
  StopOutcome,
} from './types';
import { controlMembers, updateMemberActivities } from './members';
import { updatePartyAi } from './partyai';
import { spawnNpcs, updateNpcs } from './npc';
import { setupCameras, updateHostiles } from './hostiles';
import { resolveCombat } from './combat';
import { updateBehaviors } from './behaviors';
import { perceive } from './perception';
import { integrate, separate, type Mover } from './movement';

export interface PortRules {
  /** Real seconds for the dawn clock (4:50 → 6:00). */
  seconds: number;
  /** Gate crew are sympathizers (Captain Mensah's part was delivered). */
  gateCrewSympathizers: boolean;
}

export interface StopConfig {
  layout: LayoutDef;
  seed: number;
  region: Region;
  weather: Weather;
  heat: number;
  day: number;
  party: MemberState[];
  control: Record<Slot, MemberId | null>;
  resources: Resources;
  mods?: StopModifier[];
  flags?: string[];
  pendingResets?: AndroidId[];
  juneKioskUses?: number;
  /** Tutorial scripting (Boston, night one). */
  tutorial?: boolean;
  /** Disable the patrol clock (tests). */
  noPatrol?: boolean;
  port?: PortRules;
  /** Checkpoint bust: someone must raise the barrier before the car can leave. */
  bust?: boolean;
  /** Compromised Station: grab the keeper's supply bag and leave. */
  compromised?: boolean;
  /** QA: start in ALERT. */
  startAlert?: boolean;
  /** Override patrol times in seconds (tutorial). */
  patrolTimes?: { drone1?: number; sweep?: number; drone2?: number };
}

export interface Noise {
  x: number;
  y: number;
  radius: number;
  level: number;
  member: number;
}

export interface AlertState {
  on: boolean;
  t: number;
  /** Seconds since any hostile observer last saw a party member. */
  unseen: number;
  searching: boolean;
  vanAt: number;
  vanArrived: boolean;
  lastKnown: Point | null;
  misdirected: boolean;
}

export interface PatrolState {
  drone1: number;
  sweep: number;
  drone2: number;
  fired: { drone1: boolean; sweep: boolean; drone2: boolean };
}

export interface SweepState {
  active: boolean;
  t: number;
  recyclers: number[];
  scanned: number;
  leaving: boolean;
}

export interface ExitState {
  holdT: number;
  holder: number;
  departing: boolean;
  waitT: number;
}

export interface PortState {
  /** Minutes since midnight on the dawn clock. */
  clock: number;
  horn: boolean;
  gangwayT: number;
  aboard: Set<number>;
  gatePassed: Set<number>;
}

const MEMBER_ORDER: readonly MemberId[] = ['wren', 'brick', 'vesper', 'june'];

export class StopSim {
  readonly cfg: StopConfig;
  readonly layout: ParsedLayout;
  readonly grid: Grid;
  readonly rng: Rng;
  readonly kind: LayoutKind;
  readonly members: MemberActor[] = [];
  readonly npcs: NpcActor[] = [];
  readonly cameras: CameraObserver[] = [];
  readonly drones: DroneActor[] = [];
  readonly containers: ContainerState[] = [];
  readonly bays: BayState[] = [];
  readonly kiosks: Point[] = [];
  readonly heavies: HeavyObject[] = [];
  /** Customer activity spots (shelves, bays, seats, pumps) and pending customer respawns. */
  readonly spots: CustomerSpot[] = [];
  readonly respawnAt: number[] = [];
  readonly events: SimEvent[] = [];
  readonly noises: Noise[] = [];
  readonly resources: Resources;
  readonly control: Record<Slot, MemberId | null>;
  readonly waiting: Record<Slot, boolean> = { 0: false, 1: false };
  readonly mods: Set<StopModifier>;
  readonly flags: Set<string>;
  time = 0;
  ticks = 0;
  /** Charging sessions paid for by a kiosk hack (or June's legal use). */
  credits = 0;
  juneKioskUses: number;
  // Weather
  rangeMult = 1;
  hearMult = 1;
  raining = false;
  storm = false;
  lightningT = 0;
  nextLightning = 0;
  // Patrol, alert, sweep, exit, port
  readonly patrol: PatrolState;
  readonly alert: AlertState = {
    on: false,
    t: 0,
    unseen: 0,
    searching: false,
    vanAt: -1,
    vanArrived: false,
    lastKnown: null,
    misdirected: false,
  };
  readonly sweep: SweepState = { active: false, t: 0, recyclers: [], scanned: 0, leaving: false };
  readonly exit: ExitState = { holdT: 0, holder: -1, departing: false, waitT: 0 };
  readonly port: PortState | null;
  /** Barrier raised (checkpoint bust). */
  gateOpen = false;
  gateHoldT = 0;
  outcome: StopOutcome | null = null;
  readonly stats = {
    cellsGathered: 0,
    knockouts: 0,
    rumorsSeen: 0,
    flagsSet: [] as string[],
    lost: [] as { member: MemberId; how: string }[],
    resetsResolved: [] as AndroidId[],
    juneArrested: false,
    /** Everything found or gifted this stop (positive gains only). */
    found: { cells: 0, carBattery: 0, parts: 0, skinPatches: 0, papers: 0, rations: 0 } as Resources,
  };
  /** Per-tick intents (read by subsystems). */
  readonly intents: Record<Slot, PlayerIntent | null> = { 0: null, 1: null };
  /** Tutorial hooks read by the tutorial controller. */
  readonly tutorialLog = {
    blended: 0,
    searchedPublic: 0,
    searchedPrivate: 0,
    plugged: 0,
    chatted: 0,
    roboticFired: 0,
  };
  /** Exit zone tiles (cached). */
  readonly exitTiles: Point[];
  /** Distance field to the exit (AI heading to the car). */
  readonly exitField: Int32Array;

  constructor(cfg: StopConfig) {
    this.cfg = cfg;
    this.rng = new Rng(hashSeed('stop', cfg.seed));
    this.layout = parseLayout(cfg.layout);
    this.grid = this.layout.grid;
    this.kind = cfg.layout.kind;
    this.resources = { ...cfg.resources };
    this.control = { ...cfg.control };
    this.mods = new Set(cfg.mods ?? []);
    this.flags = new Set(cfg.flags ?? []);
    this.juneKioskUses = cfg.juneKioskUses ?? 0;
    this.exitTiles = this.layout.exitTiles;
    this.exitField = this.grid.distanceField(this.exitTiles);
    this.blockCar();
    this.setupWeather();
    this.patrol = this.schedulePatrol();
    this.port = cfg.port
      ? {
          clock: TUNING.port.clockStartMinutes,
          horn: false,
          gangwayT: -1,
          aboard: new Set(),
          gatePassed: new Set(),
        }
      : null;
    this.setupMembers();
    this.setupContainers();
    this.setupFixtures();
    setupCameras(this);
    spawnNpcs(this);
    if (cfg.startAlert) this.raiseAlert({ x: this.members[0]?.x ?? 0, y: this.members[0]?.y ?? 0 });
  }

  // ---------------------------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------------------------

  /** The parked car blocks movement over its footprint (not sight: it's below eye level). */
  private blockCar(): void {
    const car = this.cfg.layout.car;
    const cx = car.x + 0.5;
    const cy = car.y + 0.5;
    const along = car.facing === 'east' || car.facing === 'west';
    const hx = (along ? 4.4 : 1.8) / 2;
    const hy = (along ? 1.8 : 4.4) / 2;
    for (let ty = Math.floor(cy - hy); ty <= Math.floor(cy + hy); ty++) {
      for (let tx = Math.floor(cx - hx); tx <= Math.floor(cx + hx); tx++) {
        if (!this.grid.inBounds(tx, ty)) continue;
        if (Math.abs(tx + 0.5 - cx) < hx && Math.abs(ty + 0.5 - cy) < hy)
          this.grid.dynBlock[this.grid.idx(tx, ty)] = 1;
      }
    }
  }

  private setupWeather(): void {
    const w = TUNING.weather;
    const wx = this.cfg.weather;
    const interior = this.kind === 'station';
    this.raining =
      !interior &&
      (wx === 'rain' || wx === 'drizzle' || wx === 'heavyrain' || wx === 'storm' || wx === 'sleet');
    this.storm = !interior && (wx === 'heavyrain' || wx === 'storm');
    if (!interior) {
      if (wx === 'rain' || wx === 'drizzle' || wx === 'sleet') this.rangeMult *= w.rainRangeMult;
      if (this.storm) {
        this.rangeMult *= w.heavyRangeMult;
        this.hearMult *= w.heavyHearingMult;
      }
      if (wx === 'fog') this.rangeMult *= w.fogRangeMult;
      if (wx === 'snow' || wx === 'sleet') this.hearMult *= w.snowHearingMult;
    }
    this.nextLightning = this.storm ? this.rng.range(w.lightningEvery[0], w.lightningEvery[1]) : Infinity;
  }

  /** Patrol speed factor from Heat, the day (enforcement escalation), region, and rumors (spec §8.7, §11.6, §11.7). */
  patrolFactor(): number {
    let f = 1 + TUNING.patrol.heatSpeedPerLevel * this.cfg.heat;
    if (this.cfg.day >= TUNING.escalation.day11) f *= TUNING.patrol.day11Mult;
    else if (this.cfg.day >= TUNING.escalation.day7) f *= TUNING.patrol.day7Mult;
    if (this.cfg.region === 'corridor') f *= TUNING.weather.corridorPatrolMult;
    if (this.mods.has('recyclerActivity')) f *= 1.15;
    return f;
  }

  private schedulePatrol(): PatrolState {
    const p = TUNING.patrol;
    const f = this.patrolFactor();
    const o = this.cfg.patrolTimes ?? {};
    const never = this.cfg.noPatrol || this.kind === 'station' || !!this.cfg.port || !!this.cfg.bust;
    // The clock is approximate ("~90 s"): each patrol comes a little early or late.
    const at = (base: number): number => base / f + this.rng.range(-p.jitter, p.jitter);
    return {
      drone1: never ? Infinity : (o.drone1 ?? at(p.drone1)),
      sweep: never ? Infinity : (o.sweep ?? at(p.sweep)),
      drone2: never ? Infinity : (o.drone2 ?? at(p.drone2)),
      fired: { drone1: false, sweep: false, drone2: false },
    };
  }

  private setupMembers(): void {
    const car = this.cfg.layout.car;
    const spawns = this.spawnTiles(car.x + 0.5, car.y + 0.5, this.cfg.party.length);
    let i = 0;
    for (const id of MEMBER_ORDER) {
      const st = this.cfg.party.find((m) => m.id === id);
      if (!st) continue;
      const out = st.kind === 'android' ? st.status === 'lost' : st.status === 'left';
      const state: MemberState = { ...st };
      const p = spawns[i % spawns.length];
      i++;
      const m = newMember(this.members.length, id, state, p.x, p.y);
      if (out) m.mode = 'gone';
      else if (st.kind === 'android' && st.status === 'shutdown') {
        // A carried shut-down unit stays in the car during the stop.
        m.mode = 'inCar';
      }
      this.members.push(m);
    }
    for (const s of [0, 1] as Slot[]) {
      const id = this.control[s];
      const m = id ? this.members.find((x) => x.id === id) : undefined;
      if (m && this.available(m)) m.controller = s;
      else if (id) {
        this.control[s] = null;
        this.assignSlot(s);
      }
    }
    // Factory resets (spec §12.6): an android at 0 Integrity walks toward the nearest human.
    for (const id of this.cfg.pendingResets ?? []) {
      const m = this.members.find((x) => x.id === id);
      if (m && this.available(m)) {
        if (m.controller !== null) {
          const slot = m.controller;
          m.controller = null;
          this.control[slot] = null;
          this.assignSlot(slot);
        }
        m.mode = 'factory';
        m.factoryT = TUNING.integrity.resetPullSeconds;
      }
    }
  }

  /** Walkable tiles around a point, nearest first, preferring the camera (south) side. */
  spawnTiles(x: number, y: number, n: number): Point[] {
    const out: Point[] = [];
    const south: Point[] = [];
    for (let r = 1; r <= 4 && out.length < n + 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = Math.floor(x) + dx;
          const ty = Math.floor(y) + dy;
          if (!this.grid.walkable(tx, ty)) continue;
          if (Math.abs(tx + 0.5 - x) < 1.2 && Math.abs(ty + 0.5 - y) < 0.9) continue;
          (ty + 0.5 >= y ? south : out).push({ x: tx + 0.5, y: ty + 0.5 });
        }
      }
    }
    const all = [...south, ...out];
    if (all.length === 0) all.push(this.grid.nearestWalkable(x, y) ?? { x, y });
    return all;
  }

  private setupContainers(): void {
    for (const c of this.layout.containers) {
      this.containers.push({
        id: c.id,
        kind: c.kind,
        x: c.x,
        y: c.y,
        cx: c.cx,
        cy: c.cy,
        access: c.access,
        tiles: c.tiles,
        private: c.private,
        locked: !!c.locked,
        searched: false,
        progress: 0,
        loot: rollLoot(c.kind, this.rng),
        pinged: false,
        glint: false,
      });
    }
    if (this.mods.has('cellsCache') && this.containers.length > 0) {
      const c = this.rng.pick(this.containers);
      const [a, b] = TUNING.loot.cellsCacheBonus;
      c.loot.cells = (c.loot.cells ?? 0) + this.rng.int(a, b);
    }
  }

  private setupFixtures(): void {
    const g = this.grid;
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const ch = g.charAt(x, y);
        if (ch === 'B' || ch === 'E')
          this.bays.push({ idx: this.bays.length, x: x + 0.5, y: y + 0.5, forCar: ch === 'E', user: -1 });
        else if (ch === 'K') this.kiosks.push({ x: x + 0.5, y: y + 0.5 });
        else if (ch === 'V')
          this.heavies.push({
            idx: this.heavies.length,
            tx: x,
            ty: y,
            homeX: x,
            homeY: y,
            blockedT: 0,
            glyph: ch,
          });
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------------------------

  member(id: MemberId): MemberActor | undefined {
    return this.members.find((m) => m.id === id);
  }

  controlled(slot: Slot): MemberActor | undefined {
    const id = this.control[slot];
    return id ? this.member(id) : undefined;
  }

  /** Can act: not shut down, down, carried, gone, in the car, or factory-reset. */
  available(m: MemberActor): boolean {
    if (
      m.mode === 'gone' ||
      m.mode === 'inCar' ||
      m.mode === 'shutdown' ||
      m.mode === 'down' ||
      m.mode === 'carried' ||
      m.mode === 'factory'
    ) {
      return false;
    }
    return m.state.kind === 'android' ? m.state.status === 'active' : m.state.status === 'active';
  }

  /** In the world and perceivable (includes shut-down and down members; not those in the car or gone). */
  present(m: MemberActor): boolean {
    return m.mode !== 'gone' && m.mode !== 'inCar';
  }

  isAndroid(m: MemberActor): boolean {
    return m.state.kind === 'android';
  }

  skin01(m: MemberActor): number {
    return m.state.kind === 'android' ? m.state.skin / 100 : 1;
  }

  /** Humans who can observe (not knocked out, not gone). */
  isActiveNpc(n: NpcActor): boolean {
    return n.mode !== 'ko' && n.mode !== 'gone';
  }

  inExit(x: number, y: number): boolean {
    return this.grid.flagAt(x, y, F.EXIT);
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  noise(x: number, y: number, radius: number, level: number, member: number): void {
    this.noises.push({ x, y, radius, level, member });
  }

  /** Slots joined (with or without a member). */
  playerSlots(): Slot[] {
    const out: Slot[] = [];
    for (const s of [0, 1] as Slot[]) if (this.control[s] !== null || this.waiting[s]) out.push(s);
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Control: join, drop, swap (spec §7.2)
  // ---------------------------------------------------------------------------------------------

  /** Give a slot a free party member (preferring `preferred`). Sets `waiting` if none is free. */
  assignSlot(slot: Slot, preferred?: MemberId): MemberActor | null {
    const other = slot === 0 ? 1 : 0;
    const otherId = this.control[other as Slot];
    const free = this.members.filter((m) => this.available(m) && m.controller === null && m.id !== otherId);
    let pick = preferred ? free.find((m) => m.id === preferred) : undefined;
    pick ??= free[0];
    if (!pick) {
      this.control[slot] = null;
      this.waiting[slot] = true;
      return null;
    }
    pick.controller = slot;
    this.control[slot] = pick.id;
    this.waiting[slot] = false;
    pick.path = [];
    return pick;
  }

  /** Player 2 joins mid-stop: they take a free member, who appears next to player 1. */
  join(slot: Slot, preferred?: MemberId): MemberActor | null {
    const m = this.assignSlot(slot, preferred);
    const other = this.controlled(slot === 0 ? 1 : 0);
    if (m && other && Math.hypot(m.x - other.x, m.y - other.y) > 3) {
      const spot = this.spawnTiles(other.x, other.y, 1)[0];
      if (spot) {
        m.x = m.px = spot.x;
        m.y = m.py = spot.y;
        m.vx = m.vy = 0;
      }
    }
    return m;
  }

  drop(slot: Slot): void {
    const m = this.controlled(slot);
    if (m) m.controller = null;
    this.control[slot] = null;
    this.waiting[slot] = false;
  }

  /** Solo D-pad swap: move control to the next available member. */
  swap(slot: Slot, dir: 1 | -1): void {
    const cur = this.controlled(slot);
    const other = slot === 0 ? 1 : 0;
    const otherId = this.control[other as Slot];
    const cands = this.members.filter(
      (m) => this.available(m) && (m.controller === null || m === cur) && m.id !== otherId,
    );
    if (cands.length <= 1 || !cur) return;
    const i = cands.indexOf(cur);
    const next = cands[(i + dir + cands.length) % cands.length];
    if (next === cur) return;
    if (cur.mode === 'blend' || cur.mode === 'chat') cur.modeT = 999;
    cur.controller = null;
    next.controller = slot;
    this.control[slot] = next.id;
  }

  /** Reassign slots whose member became unavailable (shutdown, lost, factory reset). */
  refreshControl(): void {
    for (const s of [0, 1] as Slot[]) {
      const id = this.control[s];
      if (id) {
        const m = this.member(id);
        if (!m || !this.available(m)) {
          if (m) m.controller = null;
          this.control[s] = null;
          this.assignSlot(s);
        }
      } else if (this.waiting[s]) {
        this.assignSlot(s);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Alert
  // ---------------------------------------------------------------------------------------------

  raiseAlert(at: Point | null): void {
    if (at) this.alert.lastKnown = { x: at.x, y: at.y };
    if (this.alert.on) {
      this.alert.unseen = 0;
      if (this.alert.searching) {
        this.alert.searching = false;
      }
      return;
    }
    this.alert.on = true;
    this.alert.t = 0;
    this.alert.unseen = 0;
    const [a, b] = TUNING.alert.recyclerDelay;
    this.alert.vanAt = this.cfg.port ? Infinity : this.rng.range(a, b);
    this.emit({ t: 'alert' });
    this.emit({ t: 'tip', id: 'first-alert' });
    for (const m of this.members)
      if (m.controller !== null) this.emit({ t: 'rumble', slot: m.controller, kind: 'exposure' });
  }

  // ---------------------------------------------------------------------------------------------
  // Tick
  // ---------------------------------------------------------------------------------------------

  step(intents: Partial<Record<Slot, PlayerIntent | null>>): void {
    if (this.outcome) return;
    const dt = 1 / TUNING.sim.hz;
    this.events.length = 0;
    this.noises.length = 0;
    this.time += dt;
    this.ticks++;
    this.intents[0] = intents[0] ?? null;
    this.intents[1] = intents[1] ?? null;
    this.updateWeather(dt);
    this.refreshControl();
    controlMembers(this, dt);
    updatePartyAi(this, dt);
    updateNpcs(this, dt);
    updateHostiles(this, dt);
    this.moveAll(dt);
    resolveCombat(this, dt);
    updateMemberActivities(this);
    updateBehaviors(this, dt);
    const every = TUNING.sim.perceptionEvery;
    if (this.ticks % every === 0) perceive(this, dt * every);
    this.updateAlert(dt);
    this.updateHeavies(dt);
    this.updateExit(dt);
  }

  private updateWeather(dt: number): void {
    if (this.lightningT > 0) this.lightningT -= dt;
    if (this.time >= this.nextLightning) {
      const w = TUNING.weather;
      this.lightningT = w.lightningFullRangeSeconds;
      this.nextLightning = this.time + this.rng.range(w.lightningEvery[0], w.lightningEvery[1]);
      this.emit({ t: 'flash' });
    }
  }

  /** Observer range multiplier right now (lightning briefly restores full range). */
  currentRangeMult(): number {
    return this.lightningT > 0 ? 1 : this.rangeMult;
  }

  private moveAll(dt: number): void {
    const movers: Mover[] = [];
    for (const m of this.members) {
      if (m.mode === 'gone' || m.mode === 'inCar') continue;
      if (m.mode === 'carried') {
        const c = this.members[m.carriedBy];
        if (c) {
          m.px = m.x;
          m.py = m.y;
          m.x = c.x;
          m.y = c.y;
          m.facing = c.facing;
          m.dir = c.dir;
        }
        continue;
      }
      integrate(m, this.grid, dt);
      movers.push(m);
    }
    for (const n of this.npcs) {
      if (n.mode === 'gone') continue;
      integrate(n, this.grid, dt);
      if (n.mode !== 'ko') movers.push(n);
    }
    separate(movers, this.grid);
  }

  private updateAlert(dt: number): void {
    const a = this.alert;
    if (!a.on) return;
    a.t += dt;
    // Perception resets `unseen` whenever a hostile observer sees a party member.
    a.unseen += dt;
    const searching = a.unseen >= TUNING.awareness.searchAfterSeconds;
    if (searching && !a.searching) {
      a.searching = true;
      this.emit({ t: 'searching' });
    } else if (!searching && a.searching) {
      a.searching = false;
    }
  }

  private updateHeavies(dt: number): void {
    for (const h of this.heavies) {
      if (h.blockedT <= 0) continue;
      h.blockedT -= dt;
      if (h.blockedT <= 0) {
        this.grid.dynBlock[this.grid.idx(h.tx, h.ty)] = 0;
        h.tx = h.homeX;
        h.ty = h.homeY;
      }
    }
  }

  private updateExit(dt: number): void {
    const e = this.exit;
    if (this.cfg.port) return;
    if (!e.departing) return;
    e.waitT -= dt;
    const living = this.members.filter((m) => m.mode !== 'gone' && m.mode !== 'inCar');
    // Everyone who can still move counts; shut-down units only count if someone is carrying them.
    const outside = living.filter((m) => {
      if (m.mode === 'carried') return !this.inExit(m.x, m.y);
      if (m.mode === 'shutdown' || m.mode === 'down') return true;
      return !this.inExit(m.x, m.y);
    });
    const blockingMovers = outside.filter((m) => m.mode !== 'shutdown' && m.mode !== 'down');
    if (blockingMovers.length === 0 || e.waitT <= 0) this.leave();
  }

  /** Start the departure: the car leaves now if everyone is in, or waits up to 10 s. */
  /** Whether the car can leave now: not from a Station (the party rests there), the Port, or a closed gate. */
  carCanLeave(): boolean {
    return !this.cfg.port && this.kind !== 'station' && !(this.cfg.bust && !this.gateOpen);
  }

  beginDeparture(holder: number): void {
    if (this.exit.departing || !this.carCanLeave()) return;
    this.exit.departing = true;
    this.exit.holder = holder;
    this.exit.waitT = TUNING.exit.waitSeconds;
    this.emit({ t: 'sfx', cue: 'car_door', x: this.cfg.layout.car.x, y: this.cfg.layout.car.y });
  }

  /** The car leaves: anyone outside the exit zone is left behind. */
  leave(): void {
    if (this.outcome) return;
    const carried: AndroidId[] = [];
    for (const m of this.members) {
      if (m.mode === 'gone') continue;
      if (m.mode === 'inCar') {
        if (m.state.kind === 'android' && m.state.status === 'shutdown') carried.push(m.state.id);
        continue;
      }
      const inZone = this.inExit(m.x, m.y);
      if (m.mode === 'carried') {
        const carrier = this.members[m.carriedBy];
        if (carrier && this.inExit(carrier.x, carrier.y) && m.state.kind === 'android') {
          carried.push(m.state.id);
          continue;
        }
      }
      if (m.mode === 'shutdown' && m.state.kind === 'android') {
        if (inZone) carried.push(m.state.id);
        else this.lose(m, 'left behind, shut down');
        continue;
      }
      if (!inZone) {
        if (m.state.kind === 'human') {
          this.stats.juneArrested = true;
          this.lose(m, 'arrested');
        } else this.lose(m, 'left behind');
      } else if (m.state.kind === 'human' && m.mode === 'down') {
        m.state.health = Math.max(m.state.health, 10);
      }
    }
    this.emit({ t: 'exit' });
    this.finish('left', carried);
  }

  /** A member is lost (reclaimed, left behind, turned in) or arrested. */
  lose(m: MemberActor, how: string): void {
    if (m.mode === 'gone') return;
    if (m.state.kind === 'android') m.state.status = 'lost';
    else m.state.status = 'left';
    if (m.carrying >= 0) {
      const c = this.members[m.carrying];
      if (c) {
        c.mode = 'shutdown';
        c.carriedBy = -1;
      }
      m.carrying = -1;
    }
    if (m.carriedBy >= 0) {
      const c = this.members[m.carriedBy];
      if (c) c.carrying = -1;
      m.carriedBy = -1;
    }
    m.mode = 'gone';
    if (m.controller !== null) {
      const s = m.controller;
      m.controller = null;
      this.control[s] = null;
      this.assignSlot(s);
    }
    this.stats.lost.push({ member: m.id, how });
    this.emit({ t: 'lost', member: m.id, how });
    // Losing someone is stress (spec §12.6): every android still with the party loses Integrity.
    for (const o of this.members) {
      if (o === m || o.state.kind !== 'android' || o.state.status === 'lost') continue;
      o.state.integrity = Math.max(0, o.state.integrity + TUNING.integrity.memberLost);
    }
    // Every android lost: the run ends at once.
    const androidsLeft = this.members.some((x) => x.state.kind === 'android' && x.state.status !== 'lost');
    if (!androidsLeft) this.finish('allLost', []);
  }

  finish(end: StopOutcome['end'], carried: AndroidId[]): void {
    if (this.outcome) return;
    const aboard: MemberId[] = this.port ? [...this.port.aboard].map((i) => this.members[i].id) : [];
    this.outcome = {
      end,
      seconds: this.time,
      alert: this.alert.on,
      resources: { ...this.resources },
      party: this.members.map((m) => ({ ...m.state }) as MemberState),
      carried,
      lost: [...this.stats.lost],
      juneArrested: this.stats.juneArrested,
      knockouts: this.stats.knockouts,
      juneKioskUses: this.juneKioskUses,
      cellsGathered: Math.round(this.stats.cellsGathered),
      rumorsSeen: this.stats.rumorsSeen,
      aboard,
      resetsResolved: [...this.stats.resetsResolved],
      flagsSet: [...this.stats.flagsSet],
    };
  }

  /** Add resources (loot, charging, gifts) and floating pickup text. */
  gain(res: Partial<Resources>, x: number, y: number, text?: string): void {
    for (const k of Object.keys(res) as (keyof Resources)[]) {
      const n = res[k] ?? 0;
      if (!n) continue;
      this.resources[k] += n;
      if (n > 0) this.stats.found[k] += n;
      if (k === 'cells') this.stats.cellsGathered += n;
    }
    if (text) this.emit({ t: 'pickup', text, x, y });
  }

  /** Highest suspicion among a slot's members, or overall. */
  maxSuspicion(): number {
    let s = 0;
    for (const m of this.members) if (this.present(m)) s = Math.max(s, m.suspicion);
    return s;
  }

  /** Patrol clock progress for the HUD pips. */
  patrolPips(): { at: number; label: 'drone1' | 'sweep' | 'drone2'; done: boolean }[] {
    return [
      { at: this.patrol.drone1, label: 'drone1', done: this.patrol.fired.drone1 },
      { at: this.patrol.sweep, label: 'sweep', done: this.patrol.fired.sweep },
      { at: this.patrol.drone2, label: 'drone2', done: this.patrol.fired.drone2 },
    ];
  }
}

export function newMember(idx: number, id: MemberId, state: MemberState, x: number, y: number): MemberActor {
  return {
    kind: 'member',
    id,
    idx,
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    facing: -Math.PI / 2,
    dir: 6,
    radius: TUNING.movement.actorRadius,
    controller: null,
    state,
    mode: 'free',
    modeT: 0,
    activity: 'idle',
    activityT: 0,
    gait: 0,
    speed01: 0,
    blend: null,
    blendDur: 0,
    channel: null,
    suspicion: 0,
    stillT: 0,
    roboticT: 0,
    needsT: 0,
    rainT: 0,
    headHist: new Float32Array(32),
    speedHist: new Float32Array(32),
    histN: 0,
    histI: 0,
    histT: 0,
    rate: 0,
    spike: 0,
    fighting: false,
    seen: false,
    dinerT: 0,
    ordered: false,
    hasCoffee: false,
    seatedAt: null,
    abilityCd: 0,
    dashCd: 0,
    invuln: 0,
    attackT: 0,
    attackKind: null,
    attackHit: false,
    combo: 0,
    chargeT: -1,
    hitFlash: 0,
    glitchT: 0,
    downT: 0,
    carrying: -1,
    carriedBy: -1,
    factoryT: 0,
    plug: null,
    plugBay: -1,
    hack: null,
    scan: null,
    scanner: -1,
    aiBreathAt: Infinity,
    aiBreathBeat: -1,
    radial: false,
    radialSel: 0,
    pingTarget: -1,
    path: [],
    pathI: 0,
    aiT: 0,
    aiTarget: null,
    aiWander: 0,
    lowPower: false,
    sprinting: false,
    nearHumans: new Set(),
    headSnapT: 0,
    stepT: 0,
    speech: null,
    speechT: 0,
  };
}
