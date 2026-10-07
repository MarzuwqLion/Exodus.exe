/**
 * Core contracts (spec §3.4). Every layer depends on these; keep them current.
 * Headless: no Three.js, no DOM.
 */

export type Slot = 0 | 1;
export const SLOTS: readonly Slot[] = [0, 1];

export type MemberId = 'wren' | 'brick' | 'vesper' | 'june';
export type AndroidId = Exclude<MemberId, 'june'>;
export const ANDROID_IDS: readonly AndroidId[] = ['wren', 'brick', 'vesper'];
export const MEMBER_IDS: readonly MemberId[] = ['wren', 'brick', 'vesper', 'june'];

export type Region = 'newengland' | 'corridor' | 'piedmont' | 'lowcountry';
export const REGIONS: readonly Region[] = ['newengland', 'corridor', 'piedmont', 'lowcountry'];

export type Weather =
  | 'clear'
  | 'clearcold'
  | 'snow'
  | 'sleet'
  | 'rain'
  | 'drizzle'
  | 'smog'
  | 'fog'
  | 'heavyrain'
  | 'storm'
  | 'humid';
export const WEATHERS: readonly Weather[] = [
  'clear',
  'clearcold',
  'snow',
  'sleet',
  'rain',
  'drizzle',
  'smog',
  'fog',
  'heavyrain',
  'storm',
  'humid',
];

export interface Vec2 {
  x: number;
  y: number;
}

/** One player's input for one simulation tick. Gamepads, keyboard, bots, and tests all produce these. */
export interface PlayerIntent {
  /** -1..1 per axis, radial dead zone already applied. Magnitude ≤ 1. */
  move: { x: number; y: number };
  aim: { x: number; y: number } | null;
  sprint: boolean;
  dash: boolean;
  interact: boolean;
  interactHeld: boolean;
  blendTap: boolean;
  blendHeld: boolean;
  ability: boolean;
  attack: boolean;
  attackHeld: boolean;
  ping: boolean;
  pause: boolean;
  overlayHeld: boolean;
  dpad: { up: boolean; down: boolean; left: boolean; right: boolean };
  confirm: boolean;
  cancel: boolean;
}

export interface AndroidState {
  id: AndroidId;
  kind: 'android';
  hull: number;
  skin: number;
  battery: number;
  integrity: number;
  status: 'active' | 'shutdown' | 'lost';
}

export interface HumanState {
  id: 'june';
  kind: 'human';
  health: number;
  hunger: number;
  trust: number;
  status: 'active' | 'left';
}

export type MemberState = AndroidState | HumanState;

export interface Resources {
  cells: number;
  carBattery: number;
  parts: number;
  skinPatches: number;
  papers: number;
  rations: number;
}
export type ResourceKey = keyof Resources;
export const RESOURCE_KEYS: readonly ResourceKey[] = [
  'cells',
  'carBattery',
  'parts',
  'skinPatches',
  'papers',
  'rations',
];

/** Map node kinds. 'boston' is the origin (column 0); 'port' is column 10. */
export type NodeType = 'boston' | 'depot' | 'diner' | 'gas' | 'station' | 'checkpoint' | 'port';
export type StopKind = 'depot' | 'diner' | 'gas';

export type RumorKind = 'cells-cache' | 'recycler-activity' | 'sympathetic-staff' | 'station' | 'patrols';

export interface Rumor {
  nodeId: string;
  kind: RumorKind;
}

export interface MapNode {
  id: string;
  column: number;
  /** Position inside the column, 0-based. */
  index: number;
  type: NodeType;
  region: Region;
  /** Horizontal placement on the map diorama, 0 (west) .. 1 (east, toward the coast). */
  x: number;
  /** Town name shown on the map. */
  name: string;
  /** 1 quiet .. 3 crowded. */
  crowd: 1 | 2 | 3;
  /** 1 light .. 3 heavy. Only shown once known (rumor or adjacency). */
  patrol: 1 | 2 | 3;
  /** Car battery cost of the leg that ends here. */
  distance: number;
  weather: Weather;
  layoutVariant: number;
  /** Station identity is hidden until revealed. */
  revealed: boolean;
  /** What a hidden Station looks like on the map until its beacon shows. */
  decoy?: StopKind;
  /** Patrol presence known (from events or rumors). */
  patrolKnown: boolean;
  visited: boolean;
  next: string[];
  /** Index into the station keeper list, for Stations. */
  keeper?: number;
}

export interface RunMap {
  nodes: MapNode[];
  /** Node id where the party currently is. */
  current: string;
}

export type StopModifier =
  | 'droneAtStart'
  | 'cellsCache'
  | 'recyclerActivity'
  | 'sympatheticStaff'
  | 'gateCrewSympathizers'
  | 'extraGuard'
  | 'crowded';

export interface RunStats {
  stops: number;
  cellsGathered: number;
  timesExposed: number;
  unitsLost: number;
  knockouts: number;
  busts: number;
  checkpointsPassed: number;
  eventsSeen: string[];
  /** Accumulated real play time in milliseconds. */
  playTimeMs: number;
  juneFate: 'never-met' | 'with-party' | 'arrested' | 'left' | 'went-home' | 'sailed';
  lostLog: { member: MemberId; where: string; how: string }[];
}

export type RunPhase =
  'map' | 'drive' | 'event' | 'stop' | 'camp' | 'checkpoint' | 'port' | 'voyage' | 'ended';

export interface RunState {
  version: 1;
  seed: number;
  /** Seeded RNG state for run-level rolls (map, events, outcomes). */
  rngState: number;
  day: number;
  leg: number;
  column: number;
  heat: number;
  resources: Resources;
  party: MemberState[];
  control: Record<Slot, MemberId | null>;
  map: RunMap;
  rumors: Rumor[];
  flags: string[];
  stats: RunStats;
  /** Shut-down androids carried back to the car, waiting for a revive at camp. */
  carried: AndroidId[];
  /** Androids sitting at 0 Integrity: they factory-reset at the start of the next stop. */
  pendingResets: AndroidId[];
  nextStopMods: StopModifier[];
  juneKioskUses: number;
  /** Ids of Lantern messages already shown this run. */
  lanternSeen: string[];
  /** Whether the last leg ended with an ALERT (for Heat decay). */
  alertThisLeg: boolean;
  phase: RunPhase;
}

export type ObserverKind = 'civilian' | 'staff' | 'guard' | 'recycler' | 'camera' | 'drone';
export type ObserverState = 'unaware' | 'curious' | 'suspicious' | 'alarmed' | 'searching' | 'helping';

export interface Observer {
  id: string;
  kind: ObserverKind;
  sympathizer: boolean;
  coneDeg: number;
  range: number;
  hearing: number;
  awareness: Partial<Record<MemberId, number>>;
  state: ObserverState;
  /** Seconds this observer has spent watching each member (lingering, spec §1.2). */
  watched?: Partial<Record<MemberId, number>>;
}

export type PerkId = 'spare-cells' | 'forged-papers' | 'field-kit' | 'network-contacts' | 'old-route';

export interface MetaState {
  cores: number;
  /** Total cores ever earned (for the core screen). */
  coresEarned: number;
  unlocked: PerkId[];
  tutorialDone: boolean;
  runs: number;
  wins: number;
  /** First-time tips already shown (ids). */
  tipsShown: string[];
}

export type GlyphStyle = 'auto' | 'xbox' | 'playstation';

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  fullscreen: boolean;
  screenShake: boolean;
  rumble: boolean;
  reduceFlashing: boolean;
  largeText: boolean;
  tips: boolean;
  dither: boolean;
  glyphStyle: GlyphStyle;
}

export interface SaveData {
  version: 1;
  run: RunState | null;
  meta: MetaState;
  settings: Settings;
}

export function isAndroid(m: MemberState): m is AndroidState {
  return m.kind === 'android';
}

export function isHuman(m: MemberState): m is HumanState {
  return m.kind === 'human';
}
