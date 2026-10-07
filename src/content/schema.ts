/**
 * Typed schemas for written content (spec §12.7, §12.10). Content files import these types;
 * the run layer interprets them. Headless.
 */
import type { AndroidId, MemberId, Region, ResourceKey, RumorKind, StopModifier } from '../core/types';

// ---------------------------------------------------------------------------------------------
// Road events (§12.7)
// ---------------------------------------------------------------------------------------------

export type StatKey = 'hull' | 'skin' | 'battery' | 'integrity';

/**
 * Who a stat effect lands on.
 * - an android id: that android, if active
 * - 'all': every active android
 * - 'featured': the event's featured android (picked at random among active androids when the event starts;
 *   `{featured}` in any text is replaced with that android's name)
 * - { except }: every active android except that one
 */
export type EffectTarget = AndroidId | 'all' | 'featured' | { except: AndroidId };

export type EventEffect =
  | { kind: 'resource'; key: ResourceKey; delta: number }
  | { kind: 'stat'; target: EffectTarget; stat: StatKey; delta: number }
  | { kind: 'heat'; delta: number }
  /** June's Trust, ignored if June isn't in the party. */
  | { kind: 'trust'; delta: number }
  /** June's Health or Hunger, ignored if June isn't in the party. */
  | { kind: 'juneStat'; stat: 'health' | 'hunger'; delta: number }
  /** June joins the party with this starting Trust. */
  | { kind: 'recruit'; trust: number }
  /** June leaves the party. */
  | { kind: 'juneLeaves'; fate: 'went-home' | 'left' }
  | { kind: 'flag'; flag: string }
  /** Advance the sailing clock by whole days. */
  | { kind: 'day'; delta: number }
  /** Modify the next stop (e.g. a drone already present). */
  | { kind: 'nextStop'; mod: StopModifier }
  /** Reveal a hidden Station within the next `columns` columns; if none remains, add `fallbackRumor` instead. */
  | { kind: 'revealStation'; columns: number; fallbackRumor?: RumorKind }
  /** Reveal patrol presence on every node in the next `columns` columns. */
  | { kind: 'revealPatrols'; columns: number }
  /** Add a rumor to a random node in the next `columns` columns. */
  | { kind: 'rumor'; rumor: RumorKind; columns: number }
  /** Queue a Lantern message by id (shown on the phone overlay). */
  | { kind: 'lantern'; id: string };

export interface EventConditions {
  /** Every listed member must be in the party and active. */
  members?: MemberId[];
  /** None of these may be in the party (active). */
  notMembers?: MemberId[];
  minHeat?: number;
  maxHeat?: number;
  minDay?: number;
  maxDay?: number;
  /** Each resource must be at least this much. */
  resources?: Partial<Record<ResourceKey, number>>;
  flags?: string[];
  notFlags?: string[];
}

export interface ChoiceRequirement {
  member?: MemberId;
  resource?: { key: ResourceKey; min: number };
  flag?: string;
}

export interface EventOutcome {
  /** Relative weight among this choice's outcomes. */
  weight: number;
  /** Result text. May be empty when the effects speak for themselves. */
  text: string;
  effects: EventEffect[];
  /** Optional follow-up step (a chained choice). */
  next?: EventStep;
}

export interface EventChoice {
  label: string;
  /** Visible hint in brackets, e.g. "Wren" or "1 Papers" (rendered as "[Wren]"). */
  hint?: string;
  requires?: ChoiceRequirement;
  outcomes: EventOutcome[];
}

export interface EventStep {
  body?: string;
  choices: EventChoice[];
}

export interface RoadEvent {
  id: string;
  title: string;
  /** Allowed regions; omit for anywhere. */
  regions?: Region[];
  /** Inclusive map column range where the event can fire; omit for any column 1–9. */
  columns?: [number, number];
  weight: number;
  /** Weight override when Heat is at least `minHeat` (e.g. roadblocks at Heat 2+). */
  heatWeight?: { minHeat: number; weight: number };
  oncePerRun: boolean;
  conditions?: EventConditions;
  /** 2–5 sentences. `{featured}` is replaced with the featured android's name. */
  body: string;
  /** 2–4 choices. */
  choices: EventChoice[];
}

// ---------------------------------------------------------------------------------------------
// Checkpoint questions (§11.2)
// ---------------------------------------------------------------------------------------------

export interface Question {
  id: string;
  prompt: string;
  /** Precise and correct, but inhuman. */
  robotic: string;
  /** Imperfect, casual. */
  human: string;
  /** Suspicious content. */
  wrong: string;
  /** When true, the wrong answer is shown as a long, uncomfortable pause ("..."). */
  wrongIsSilence?: boolean;
  /** Wren's fourth, soothing answer, on some questions only. */
  soothing?: string;
}

// ---------------------------------------------------------------------------------------------
// Conversations (§12.5, §12.10, §16)
// ---------------------------------------------------------------------------------------------

/** 'direction' renders as an italic stage direction, e.g. "(a long pause)". */
export type Speaker = MemberId | 'keeper' | 'mensah' | 'lantern' | 'direction';

export interface Line {
  speaker: Speaker;
  text: string;
}

export interface CampConversationGate {
  /** At least one active android has Integrity below this. */
  someIntegrityBelow?: number;
  /** Every active android has Integrity at or above this. */
  allIntegrityAtLeast?: number;
  flags?: string[];
  notFlags?: string[];
  minDay?: number;
  maxDay?: number;
  minHeat?: number;
  /** A party member has been lost or has left this run. */
  afterLoss?: boolean;
}

export interface CampConversation {
  id: string;
  /** Every listed member must be active. */
  requires: MemberId[];
  when?: CampConversationGate;
  /** 2–4 lines (stage directions may be added). */
  lines: Line[];
  effects: EventEffect[];
  weight?: number;
}

export type StationInterior = 'kitchen' | 'feedstore' | 'church';

export interface StationKeeper {
  id: string;
  name: string;
  /** e.g. "retired bus driver" */
  role: string;
  /** e.g. "Delaware" */
  place: string;
  region: Region;
  /** The map column whose Station this keeper runs (2, 3, 5, 6, 7, or 9). */
  column: number;
  interior: StationInterior;
  /** 2–4 lines, spoken by 'keeper' (party members may answer). */
  lines: Line[];
  /** One small personal detail in the room, described in a sentence. */
  detail: string;
}

export interface EpilogueEntry {
  member: AndroidId;
  madeIt: string;
  lost: string;
}

export interface JuneEpilogue {
  sailed: string;
  arrested: string;
  left: string;
  wentHome: string;
  /** She reached the Port with the party but didn't make it aboard. */
  quay: string;
}

export interface VoyageConversation {
  id: string;
  /** Exactly who made it aboard (androids), sorted wren, brick, vesper. */
  survivors: AndroidId[];
  withJune: boolean;
  lines: Line[];
}

// ---------------------------------------------------------------------------------------------
// Barks (§12.10) and Lantern (§12.8)
// ---------------------------------------------------------------------------------------------

export type BarkContext =
  | 'curious'
  | 'suspicious'
  | 'alarmed'
  | 'helping'
  | 'recycler'
  | 'searching'
  | 'flee'
  | 'customer'
  | 'staff'
  | 'guard'
  | 'waitress'
  | 'dockworker'
  | 'glitch';

export interface Bark {
  id: string;
  context: BarkContext;
  text: string;
}

export type LanternTrigger =
  | 'departure'
  | 'leg-start'
  | 'before-checkpoint-1'
  | 'before-checkpoint-2'
  | 'station-revealed'
  | 'high-heat'
  | 'day-12'
  | 'slack-zero'
  | 'alert'
  | 'member-lost'
  | 'june-joined'
  | 'compromised'
  | 'lantern-silent'
  | 'low-battery'
  | 'walking'
  | 'region-corridor'
  | 'region-piedmont'
  | 'region-lowcountry'
  | 'port-approach'
  | 'port-arrival'
  | 'mensah-part';

export interface LanternMessage {
  id: string;
  trigger: LanternTrigger;
  text: string;
  conditions?: EventConditions;
}

export type TipId =
  | 'first-checkpoint'
  | 'first-scan'
  | 'first-station'
  | 'first-alert'
  | 'first-glitch'
  | 'first-sympathizer'
  | 'first-integrity';

export interface Tip {
  id: TipId;
  text: string;
}

export type TutorialStepId = 'walk' | 'robotic' | 'blend' | 'search' | 'charge' | 'chat' | 'leave' | 'retry';

export interface TutorialLine {
  step: TutorialStepId;
  /** Lantern text shown when the step starts. */
  text: string;
  /** Short plain-verb prompt shown at bottom center. */
  prompt: string;
}
