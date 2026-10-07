/**
 * Simulation-side types for real-time scenes (stops, Stations, checkpoint busts, the Port).
 * Headless: rendering reads these, never writes them.
 */
import type { AndroidId, MemberId, MemberState, Observer, Resources, Slot } from '../core/types';
import type { BreathScan } from './breathing';
import type { Point } from './grid';
import type { ContainerKind, NpcRole } from './layout';

/** What an actor is visibly doing (the renderer maps these to poses). */
export type Activity =
  | 'idle'
  | 'still'
  | 'paradeRest'
  | 'walk'
  | 'brisk'
  | 'sprint'
  | 'dash'
  | 'carry'
  | 'sit'
  | 'stand'
  | 'stretch'
  | 'scratch'
  | 'shift'
  | 'watch'
  | 'phone'
  | 'coffee'
  | 'search'
  | 'talk'
  | 'browse'
  | 'pump'
  | 'order'
  | 'tv'
  | 'shelter'
  | 'light'
  | 'heavy'
  | 'charge'
  | 'flinch'
  | 'down'
  | 'getup'
  | 'takedown'
  | 'shutdown'
  | 'carried'
  | 'kneel'
  | 'wave'
  | 'point'
  | 'scan'
  | 'aim'
  | 'smoke'
  | 'lean'
  | 'hack'
  | 'plugged'
  | 'heave'
  | 'patch'
  | 'cower'
  | 'sweep';

/** Blend actions (spec §8.3). */
export type BlendKind =
  | 'phone'
  | 'stretch'
  | 'fidget'
  | 'browse'
  | 'queue'
  | 'order'
  | 'coffee'
  | 'sit'
  | 'menu'
  | 'tv'
  | 'pump'
  | 'shelter';

export type MemberMode =
  | 'free'
  | 'blend'
  | 'chat'
  | 'search'
  | 'plugged'
  | 'hack'
  | 'attack'
  | 'dash'
  | 'carry'
  | 'carried'
  | 'shutdown'
  | 'down'
  | 'glitch'
  | 'scanned'
  | 'factory'
  | 'channel'
  | 'inCar'
  | 'gone';

/** A held interaction in progress (revive, pull back, pry, plug in, raise gate, leave, help up). */
export interface Channel {
  kind: 'revive' | 'pull' | 'helpUp' | 'pickUp' | 'gate' | 'exit' | 'pry' | 'patch' | 'plug' | 'carCharge';
  target: number;
  t: number;
  need: number;
}

export interface MemberActor {
  kind: 'member';
  id: MemberId;
  /** Index into sim.members. */
  idx: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  /** Continuous facing (radians; 0 = east, π/2 = south). */
  facing: number;
  /** Facing snapped to 8 directions (rendering). */
  dir: number;
  radius: number;
  /** Which player controls this member (null = party AI). */
  controller: Slot | null;
  /** Stats (the sim's working copy). */
  state: MemberState;
  mode: MemberMode;
  modeT: number;
  activity: Activity;
  activityT: number;
  gait: number;
  speed01: number;
  /** Current blend (when mode is 'blend'). */
  blend: BlendKind | null;
  blendDur: number;
  /** Active held interaction. */
  channel: Channel | null;
  // Suspicion bookkeeping (spec §8.2)
  suspicion: number;
  stillT: number;
  roboticT: number;
  needsT: number;
  rainT: number;
  /** Ring buffers of recent heading/speed samples for the robotic-movement check. */
  headHist: Float32Array;
  speedHist: Float32Array;
  histN: number;
  histI: number;
  histT: number;
  /** Rates and instant spikes observers will apply this perception tick. */
  rate: number;
  spike: number;
  /** Fighting this tick: every observer who sees it goes to Alarmed. */
  fighting: boolean;
  /** Seen by any non-sympathizer observer this perception tick. */
  seen: boolean;
  // Diner etiquette
  dinerT: number;
  ordered: boolean;
  hasCoffee: boolean;
  seatedAt: Point | null;
  // Abilities and combat
  abilityCd: number;
  dashCd: number;
  invuln: number;
  attackT: number;
  attackKind: 'light' | 'heavy' | null;
  attackHit: boolean;
  combo: number;
  chargeT: number;
  hitFlash: number;
  /** Glitch effect (rendering + freeze). */
  glitchT: number;
  /** Seconds since shutdown (revive window). */
  downT: number;
  /** Carried member index or carrier index. */
  carrying: number;
  carriedBy: number;
  /** Seconds of factory-reset walk remaining. */
  factoryT: number;
  /** Plugged-in charging target ('member' charges battery then cells; 'car' charges the car). */
  plug: 'member' | 'car' | null;
  plugBay: number;
  /** Hack minigame state. */
  hack: { seq: number[]; pos: number; t: number; kiosk: number } | null;
  /** Breathing scan in progress (routine sweep or Port gate), and who's scanning. */
  scan: BreathScan | null;
  scanner: number;
  /** Party AI breathing plan during a scan. */
  aiBreathAt: number;
  aiBreathBeat: number;
  /** Radial menu open (hold X) and the highlighted option. */
  radial: boolean;
  radialSel: number;
  /** Pinged container (RB) for the AI to search, or -1. */
  pingTarget: number;
  /** AI: current path and target. */
  path: Point[];
  pathI: number;
  aiT: number;
  aiTarget: Point | null;
  aiWander: number;
  /** Below 15 Battery: half speed, no sprint, dash, or ability (spec §9.1). */
  lowPower: boolean;
  /** Sprinting this tick. */
  sprinting: boolean;
  /** Vesper's head-snap memory (npc indices within 5 m). */
  nearHumans: Set<number>;
  headSnapT: number;
  /** Brick: last noise emitted (for footstep cadence). */
  stepT: number;
  /** Over-the-head bark (glitch speech, etc.). */
  speech: string | null;
  speechT: number;
}

export type NpcMode =
  | 'routine'
  | 'watch'
  | 'approach'
  | 'report'
  | 'flee'
  | 'hide'
  | 'hunt'
  | 'search'
  | 'attack'
  | 'ko'
  | 'help'
  | 'scan'
  | 'leave'
  | 'gone'
  | 'sweep';

export interface NpcActor {
  kind: 'npc';
  idx: number;
  role: NpcRole;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  facing: number;
  dir: number;
  radius: number;
  obs: Observer;
  hostile: boolean;
  hp: number;
  maxHp: number;
  mode: NpcMode;
  modeT: number;
  activity: Activity;
  activityT: number;
  gait: number;
  speed01: number;
  /** Rendering variety seed. */
  lookSeed: number;
  /** Routine state machine. */
  routine: string;
  step: number;
  stepT: number;
  path: Point[];
  pathI: number;
  target: Point | null;
  /** Point to face while idle at a spot. */
  faceTo: Point | null;
  /** Routine-specific memory (seat, shelf, bay). */
  slot: number;
  /** Seconds the observer can't see (phone check, look away, smoke break facing away). */
  blindT: number;
  /** Ignores the party (Soothe). */
  ignoreT: number;
  /** Sympathizer has already helped this stop. */
  helped: boolean;
  /** Short glance target when Curious or after a noise. */
  lookAt: Point | null;
  lookT: number;
  barkCd: number;
  speech: string | null;
  speechT: number;
  /** Last known party position (hostiles). */
  lastKnown: Point | null;
  /** Combat */
  attackT: number;
  attackCd: number;
  aimTarget: number;
  hitFlash: number;
  stunT: number;
  /** Knocked-out body has been found (alarm raised). */
  found: boolean;
  /** Arrived with the Recycler van (vs. local). */
  fromVan: boolean;
  /** Routine scanner (sweep) target member index, or -1. */
  scanTarget: number;
}

export interface CameraObserver {
  idx: number;
  x: number;
  y: number;
  base: number;
  sweep: number;
  phase: number;
  facing: number;
  obs: Observer;
  /** Rotating gas-station cameras sweep faster. */
  period: number;
}

export interface DroneActor {
  idx: number;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Hover height (rendering). */
  z: number;
  heading: number;
  /** The searchlight cone direction sweeps around the heading. */
  beam: number;
  route: Point[];
  routeI: number;
  obs: Observer;
  /** Homing on a point during ALERT. */
  home: Point | null;
  arriving: number;
}

export interface ContainerState {
  id: number;
  kind: ContainerKind;
  x: number;
  y: number;
  cx: number;
  cy: number;
  access: Point;
  tiles: Point[];
  private: boolean;
  locked: boolean;
  searched: boolean;
  /** Search progress in seconds. */
  progress: number;
  loot: Partial<Resources>;
  /** Pinged for AI search. */
  pinged: boolean;
  /** Sympathizer drop: an amber glint (rendering). */
  glint: boolean;
}

/** A place customers go: a shelf, a charging bay, a seat, a pump. */
export interface CustomerSpot {
  p: Point;
  face: Point;
  kind: 'shelf' | 'bay' | 'seat' | 'pump' | 'counter';
  /** NPC index using it, or -1. */
  taken: number;
}

export interface BayState {
  idx: number;
  x: number;
  y: number;
  /** Charges the car (gas station EV charger) rather than a unit. */
  forCar: boolean;
  /** Member index plugged in, or -1. */
  user: number;
}

export interface KioskState {
  idx: number;
  x: number;
  y: number;
  /** Session credits from hacks (or June's legal use) waiting to be used at a bay. */
}

/** Heavy movable objects for Brick's Heave (vending machines, dumpsters, shelves). */
export interface HeavyObject {
  idx: number;
  tx: number;
  ty: number;
  homeX: number;
  homeY: number;
  blockedT: number;
  glyph: string;
}

export type SimEvent =
  | { t: 'sfx'; cue: string; x: number; y: number; gain?: number }
  | { t: 'bark'; actor: number; npc: boolean; text: string }
  | { t: 'pickup'; text: string; x: number; y: number }
  | { t: 'alert' }
  | { t: 'searching' }
  | { t: 'van'; x: number; y: number }
  | { t: 'hit'; x: number; y: number; heavy: boolean; spark: boolean }
  | { t: 'emp'; x: number; y: number; tx: number; ty: number }
  | { t: 'shake'; amount: number }
  | { t: 'hitpause'; frames: number }
  | { t: 'rumble'; slot: Slot; kind: 'hit' | 'scan' | 'exposure' | 'crash' | 'tick' }
  | { t: 'lantern'; id: string }
  | { t: 'tip'; id: string }
  | { t: 'glitch'; member: number }
  | { t: 'state'; npc: number; state: Observer['state'] }
  | { t: 'shutdown'; member: number }
  | { t: 'lost'; member: MemberId; how: string }
  | { t: 'drone'; idx: number }
  | { t: 'patrol'; which: 'drone1' | 'sweep' | 'drone2' }
  | { t: 'flash' }
  | { t: 'horn' }
  | { t: 'gate' }
  /** A party member talks to a Station keeper. */
  | { t: 'talk'; npc: number; member: number }
  | { t: 'exit' };

export interface StopOutcome {
  /** How the stop ended. */
  end: 'left' | 'allLost' | 'sailed' | 'missedShip' | 'rested';
  seconds: number;
  alert: boolean;
  /** Resources at the end (the sim works on a copy). */
  resources: Resources;
  party: MemberState[];
  /** Shut-down androids that made it into the car (revivable at camp for 2 Parts). */
  carried: AndroidId[];
  lost: { member: MemberId; how: string }[];
  juneArrested: boolean;
  knockouts: number;
  juneKioskUses: number;
  cellsGathered: number;
  rumorsSeen: number;
  /** Androids aboard the ship (Port). */
  aboard: MemberId[];
  /** Factory resets resolved this stop (pulled back or lost). */
  resetsResolved: AndroidId[];
  flagsSet: string[];
}
