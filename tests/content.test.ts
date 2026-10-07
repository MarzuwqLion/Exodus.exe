import { describe, expect, it } from 'vitest';
import { ANDROID_IDS, MEMBER_IDS, REGIONS, RESOURCE_KEYS } from '../src/core/types';
import type { AndroidId, MemberId, Region, ResourceKey, RumorKind, StopModifier } from '../src/core/types';
import type {
  BarkContext,
  EffectTarget,
  EventChoice,
  EventEffect,
  LanternTrigger,
  Line,
  RoadEvent,
  StatKey,
  TipId,
  TutorialStepId,
} from '../src/content/schema';
import { BARKS } from '../src/content/barks';
import {
  CAMP_CONVERSATIONS,
  EPILOGUE,
  GAME_OVER_TEXT,
  GHANA_LINES,
  INTRO_LINES,
  JUNE_EPILOGUE,
  MENSAH_DECK_LINE,
  MENSAH_GANGWAY_LINE,
  STATION_KEEPERS,
  VOYAGE_CONVERSATIONS,
} from '../src/content/conversations';
import { ROAD_EVENTS } from '../src/content/events';
import { LANTERN_MESSAGES, TIPS, TUTORIAL_LINES } from '../src/content/lantern';
import { QUESTIONS } from '../src/content/questions';

// ---------------------------------------------------------------------------------------------
// Exhaustive runtime lists of schema unions (a missing or extra key fails to compile)
// ---------------------------------------------------------------------------------------------

const keysOf = <K extends string>(record: Record<K, unknown>): K[] => Object.keys(record) as K[];

const STAT_KEYS = keysOf<StatKey>({ hull: true, skin: true, battery: true, integrity: true });
const STOP_MODIFIERS = keysOf<StopModifier>({
  droneAtStart: true,
  cellsCache: true,
  recyclerActivity: true,
  sympatheticStaff: true,
  gateCrewSympathizers: true,
  extraGuard: true,
  crowded: true,
});
const RUMOR_KINDS = keysOf<RumorKind>({
  'cells-cache': true,
  'recycler-activity': true,
  'sympathetic-staff': true,
  station: true,
  patrols: true,
});
const LANTERN_TRIGGERS = keysOf<LanternTrigger>({
  departure: true,
  'leg-start': true,
  'before-checkpoint-1': true,
  'before-checkpoint-2': true,
  'station-revealed': true,
  'high-heat': true,
  'day-12': true,
  'slack-zero': true,
  alert: true,
  'member-lost': true,
  'june-joined': true,
  compromised: true,
  'lantern-silent': true,
  'low-battery': true,
  walking: true,
  'region-corridor': true,
  'region-piedmont': true,
  'region-lowcountry': true,
  'port-approach': true,
  'port-arrival': true,
  'mensah-part': true,
});
const TIP_IDS = keysOf<TipId>({
  'first-checkpoint': true,
  'first-scan': true,
  'first-station': true,
  'first-alert': true,
  'first-glitch': true,
  'first-sympathizer': true,
  'first-integrity': true,
});
const TUTORIAL_STEPS = keysOf<TutorialStepId>({
  walk: true,
  blend: true,
  search: true,
  charge: true,
  chat: true,
  leave: true,
  retry: true,
});
const BARK_MINIMUMS: Record<BarkContext, number> = {
  curious: 6,
  suspicious: 7,
  alarmed: 5,
  helping: 5,
  recycler: 6,
  searching: 3,
  flee: 2,
  customer: 2,
  staff: 1,
  guard: 1,
  waitress: 1,
  dockworker: 1,
  glitch: 2,
};

/** Every field each effect kind may carry; anything else is a typo. */
const EFFECT_FIELDS: Record<EventEffect['kind'], string[]> = {
  resource: ['kind', 'key', 'delta'],
  stat: ['kind', 'target', 'stat', 'delta'],
  heat: ['kind', 'delta'],
  trust: ['kind', 'delta'],
  juneStat: ['kind', 'stat', 'delta'],
  recruit: ['kind', 'trust'],
  juneLeaves: ['kind', 'fate'],
  flag: ['kind', 'flag'],
  day: ['kind', 'delta'],
  nextStop: ['kind', 'mod'],
  revealStation: ['kind', 'columns', 'fallbackRumor'],
  revealPatrols: ['kind', 'columns'],
  rumor: ['kind', 'rumor', 'columns'],
  lantern: ['kind', 'id'],
};

const REGION_COLUMNS: Record<Region, [number, number]> = {
  newengland: [1, 2],
  corridor: [3, 5],
  piedmont: [6, 7],
  lowcountry: [8, 9],
};
const STATION_COLUMNS = [2, 3, 5, 6, 7, 9];

/** Magnitudes the economy simulator is balanced around (absolute values, inclusive). */
const RESOURCE_RANGE: Record<ResourceKey, [number, number]> = {
  cells: [5, 25],
  carBattery: [5, 15],
  parts: [1, 3],
  skinPatches: [1, 1],
  papers: [1, 1],
  rations: [1, 3],
};
const STAT_RANGE: Record<StatKey, [number, number]> = {
  integrity: [3, 20],
  hull: [5, 20],
  battery: [5, 15],
  skin: [5, 20],
};

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const MEMBER_NAMES: Record<MemberId, RegExp> = {
  wren: /\bWren\b/,
  brick: /\bBrick\b/,
  vesper: /\bVesper\b/,
  june: /\bJune\b/,
};
const namedMembers = (text: string): MemberId[] => MEMBER_IDS.filter((m) => MEMBER_NAMES[m].test(text));

const isAndroid = (id: string): id is AndroidId => (ANDROID_IDS as readonly string[]).includes(id);

const inRange = (value: number, [min, max]: [number, number]): boolean =>
  Math.abs(value) >= min && Math.abs(value) <= max;

const duplicates = (ids: string[]): string[] => ids.filter((id, i) => ids.indexOf(id) !== i);

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out);
  }
  return out;
}

const spokenLines = (lines: Line[]): Line[] => lines.filter((l) => l.speaker !== 'direction');

function targetIsValid(target: EffectTarget): boolean {
  if (typeof target === 'string') return target === 'all' || target === 'featured' || isAndroid(target);
  return isAndroid(target.except);
}

const lanternIds = new Set(LANTERN_MESSAGES.map((m) => m.id));

/** Why an effect is malformed, or null. */
function effectProblem(effect: EventEffect): string | null {
  const extra = Object.keys(effect).filter((k) => !EFFECT_FIELDS[effect.kind].includes(k));
  if (extra.length > 0) return `unknown fields ${extra.join(', ')}`;
  const finiteNonZero = (n: number): boolean => Number.isFinite(n) && n !== 0;
  const columnsOk = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 9;
  switch (effect.kind) {
    case 'resource':
      return RESOURCE_KEYS.includes(effect.key) && finiteNonZero(effect.delta) ? null : 'bad resource';
    case 'stat':
      return targetIsValid(effect.target) && STAT_KEYS.includes(effect.stat) && finiteNonZero(effect.delta)
        ? null
        : 'bad stat';
    case 'heat':
    case 'trust':
    case 'day':
      return finiteNonZero(effect.delta) ? null : `bad ${effect.kind}`;
    case 'juneStat':
      return (effect.stat === 'health' || effect.stat === 'hunger') && finiteNonZero(effect.delta)
        ? null
        : 'bad juneStat';
    case 'recruit':
      return effect.trust > 0 && effect.trust <= 100 ? null : 'bad recruit';
    case 'juneLeaves':
      return effect.fate === 'went-home' || effect.fate === 'left' ? null : 'bad juneLeaves';
    case 'flag':
      return KEBAB.test(effect.flag) ? null : 'bad flag';
    case 'nextStop':
      return STOP_MODIFIERS.includes(effect.mod) ? null : 'bad nextStop';
    case 'revealStation':
      return columnsOk(effect.columns) &&
        (effect.fallbackRumor === undefined || RUMOR_KINDS.includes(effect.fallbackRumor))
        ? null
        : 'bad revealStation';
    case 'revealPatrols':
      return columnsOk(effect.columns) ? null : 'bad revealPatrols';
    case 'rumor':
      return RUMOR_KINDS.includes(effect.rumor) && columnsOk(effect.columns) ? null : 'bad rumor';
    case 'lantern':
      return lanternIds.has(effect.id) ? null : `unknown Lantern message ${effect.id}`;
  }
}

/** Why an event effect is outside the simulator's magnitudes, or null. */
function magnitudeProblem(effect: EventEffect): string | null {
  switch (effect.kind) {
    case 'resource':
      return inRange(effect.delta, RESOURCE_RANGE[effect.key]) ? null : `${effect.key} ${effect.delta}`;
    case 'stat':
      return inRange(effect.delta, STAT_RANGE[effect.stat]) ? null : `${effect.stat} ${effect.delta}`;
    case 'heat':
      return inRange(effect.delta, [0.5, 2]) ? null : `heat ${effect.delta}`;
    case 'trust':
      return inRange(effect.delta, [5, 20]) ? null : `trust ${effect.delta}`;
    case 'day':
      return effect.delta === 1 ? null : `day ${effect.delta}`;
    case 'juneStat':
      return inRange(effect.delta, [5, 25]) ? null : `juneStat ${effect.delta}`;
    default:
      return null;
  }
}

interface ChoiceInContext {
  choice: EventChoice;
  /** Members guaranteed present when this choice is taken (event conditions + choice requirements). */
  members: Set<MemberId>;
}

function choicesOf(event: RoadEvent): ChoiceInContext[] {
  const out: ChoiceInContext[] = [];
  const visit = (choices: EventChoice[], members: Set<MemberId>): void => {
    for (const choice of choices) {
      const here = new Set(members);
      if (choice.requires?.member) here.add(choice.requires.member);
      out.push({ choice, members: here });
      for (const outcome of choice.outcomes) if (outcome.next) visit(outcome.next.choices, here);
    }
  };
  visit(event.choices, new Set(event.conditions?.members ?? []));
  return out;
}

function stepChoiceCounts(event: RoadEvent): number[] {
  const counts: number[] = [event.choices.length];
  for (const { choice } of choicesOf(event)) {
    for (const outcome of choice.outcomes) if (outcome.next) counts.push(outcome.next.choices.length);
  }
  return counts;
}

// ---------------------------------------------------------------------------------------------
// Banned words (spec §2.4)
// ---------------------------------------------------------------------------------------------

/** Real-world slurs and historically racialized terms, base64-encoded so they never appear in source. */
const ENCODED_SLURS = [
  'bmlnZ2Vy',
  'bmlnZ2E=',
  'bmVncm8=',
  'Y29vbg==',
  'ZGFya2ll',
  'ZGFya3k=',
  'cGlja2FuaW5ueQ==',
  'c2FtYm8=',
  'bWFtbXk=',
  'dW5jbGUgdG9t',
  'amlnYWJvbw==',
  'd2VuY2g=',
  'Y2hhdHRlbA==',
];
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const BANNED: { name: string; pattern: RegExp }[] = [
  ...ENCODED_SLURS.map((encoded, i) => ({
    name: `slur #${i + 1}`,
    pattern: new RegExp(`\\b${escapeRegExp(atob(encoded))}s?\\b`, 'i'),
  })),
  // In-world slurs for androids.
  {
    name: 'android slur',
    pattern: /\b(clankers?|toasters?|skin ?jobs?|tin ?cans?|rust ?buckets?|synths?)\b/i,
  },
  // Slavery imagery and vocabulary.
  { name: 'slave', pattern: /slave/i },
  { name: 'plantation', pattern: /plantation/i },
  { name: 'auction', pattern: /auction/i },
  { name: 'master', pattern: /\bmaster(s|'s)?\b/i },
  { name: 'massa', pattern: /\bmassa\b/i },
  { name: 'overseer', pattern: /overseer/i },
  { name: 'shackle', pattern: /shackle/i },
  { name: 'runaway', pattern: /\brunaways?\b/i },
  { name: 'underground railroad', pattern: /underground railroad/i },
  // Real historical people.
  {
    name: 'historical person',
    pattern:
      /\b(tubman|harriet|douglass|sojourner|john brown|nat turner|dred scott|william still|levi coffin|thomas garrett|box brown|ellen craft|william craft|robert smalls|denmark vesey|gabriel prosser|taney|lincoln|martin luther|rosa parks|moses)\b/i,
  },
  // Real spirituals, coded songs, and Underground Railroad artifacts.
  {
    name: 'spiritual or coded song',
    pattern:
      /(drinking gourd|wade in the water|swing low|sweet chariot|steal away|go down,? moses|north star|quilt)/i,
  },
  // Slave-trade memorial sites.
  { name: 'memorial site', pattern: /(elmina|cape coast|door of no return|middle passage)/i },
  // Ghana is a specific country, never a generic "Africa" (the African Union is fine).
  { name: 'generic Africa', pattern: /\bAfrica\b|\bAfrican\b(?! Union)/ },
];

/** "boy" is only ever descriptive ("A boy, maybe eight"), never a way to address someone. */
function addressesBoy(text: string): boolean {
  for (const match of text.matchAll(/\bboy\b/gi)) {
    const before = text.slice(0, match.index).trimEnd();
    if (!/\b(a|the|his|her|their|that|this|little|young)$/i.test(before)) return true;
  }
  return false;
}

const ALL_CONTENT = {
  ROAD_EVENTS,
  QUESTIONS,
  CAMP_CONVERSATIONS,
  STATION_KEEPERS,
  EPILOGUE,
  JUNE_EPILOGUE,
  VOYAGE_CONVERSATIONS,
  MENSAH_DECK_LINE,
  MENSAH_GANGWAY_LINE,
  INTRO_LINES,
  GHANA_LINES,
  GAME_OVER_TEXT,
  BARKS,
  LANTERN_MESSAGES,
  TIPS,
  TUTORIAL_LINES,
};
const ALL_STRINGS = collectStrings(ALL_CONTENT);

/**
 * The 5×7 text font (§13.1, src/ui/font.ts) draws printable ASCII plus these glyphs. Anything else would
 * render as a fallback. Content uses one of them: the em dash in a verbatim §11.2 answer.
 */
const ALLOWED_NON_ASCII = new Set(['◆', '·', '—', '…', '▲', '▼', '◀', '▶', '°']);

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

describe('content quotas (§12.10)', () => {
  it('has exactly 24 road events', () => {
    expect(ROAD_EVENTS).toHaveLength(24);
  });

  it('has at least 20 questions, about a third with a soothing answer', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(20);
    const soothing = QUESTIONS.filter((q) => q.soothing !== undefined).length;
    expect(soothing).toBeGreaterThanOrEqual(Math.floor(QUESTIONS.length / 4));
    expect(soothing).toBeLessThanOrEqual(Math.ceil(QUESTIONS.length / 2));
  });

  it('has at least 16 camp conversations covering every gate and party shape', () => {
    expect(CAMP_CONVERSATIONS.length).toBeGreaterThanOrEqual(16);
    const androidsIn = (req: MemberId[]): AndroidId[] => req.filter(isAndroid);
    const has = (pred: (c: (typeof CAMP_CONVERSATIONS)[number]) => boolean): number =>
      CAMP_CONVERSATIONS.filter(pred).length;
    expect(has((c) => c.when?.someIntegrityBelow !== undefined)).toBeGreaterThanOrEqual(2);
    expect(has((c) => c.when?.afterLoss === true)).toBeGreaterThanOrEqual(2);
    expect(has((c) => c.when?.minDay !== undefined)).toBeGreaterThanOrEqual(1);
    expect(
      has((c) => c.requires.includes('june') && androidsIn(c.requires).length === 1),
    ).toBeGreaterThanOrEqual(3);
    expect(
      has((c) => !c.requires.includes('june') && androidsIn(c.requires).length === 2),
    ).toBeGreaterThanOrEqual(3);
    for (const pair of [
      ['wren', 'brick'],
      ['brick', 'vesper'],
      ['wren', 'vesper'],
    ] as const) {
      const forPair = has((c) => c.requires.length === 2 && pair.every((m) => c.requires.includes(m)));
      expect(forPair, `pair ${pair.join('+')}`).toBeGreaterThanOrEqual(1);
    }
    for (const solo of ANDROID_IDS) {
      const alone = has((c) => c.requires.length === 1 && c.requires[0] === solo);
      expect(alone, `${solo} alone`).toBeGreaterThanOrEqual(1);
    }
  });

  it('has 6 station keepers, 3 epilogue entries, and 14 voyage conversations', () => {
    expect(STATION_KEEPERS).toHaveLength(6);
    expect(EPILOGUE).toHaveLength(3);
    expect(VOYAGE_CONVERSATIONS).toHaveLength(14);
  });

  it('has at least 40 barks with the minimum per context', () => {
    expect(BARKS.length).toBeGreaterThanOrEqual(40);
    for (const context of keysOf(BARK_MINIMUMS)) {
      const count = BARKS.filter((b) => b.context === context).length;
      expect(count, context).toBeGreaterThanOrEqual(BARK_MINIMUMS[context]);
    }
  });

  it('has at least 20 Lantern messages and every trigger at least once', () => {
    expect(LANTERN_MESSAGES.length).toBeGreaterThanOrEqual(20);
    for (const trigger of LANTERN_TRIGGERS) {
      expect(
        LANTERN_MESSAGES.some((m) => m.trigger === trigger),
        trigger,
      ).toBe(true);
    }
    // A message with no conditions exists for every trigger, so a trigger never fires into silence.
    for (const trigger of LANTERN_TRIGGERS) {
      const fallback = LANTERN_MESSAGES.some(
        (m) => m.trigger === trigger && (m.conditions === undefined || trigger === 'june-joined'),
      );
      expect(fallback, `unconditional ${trigger}`).toBe(true);
    }
  });

  it('has one tip per tip id and one tutorial line per step', () => {
    expect(TIPS.map((t) => t.id).sort()).toEqual([...TIP_IDS].sort());
    expect(TUTORIAL_LINES.map((t) => t.step).sort()).toEqual([...TUTORIAL_STEPS].sort());
  });
});

describe('ids', () => {
  const collections: [string, string[]][] = [
    ['events', ROAD_EVENTS.map((e) => e.id)],
    ['questions', QUESTIONS.map((q) => q.id)],
    ['camp', CAMP_CONVERSATIONS.map((c) => c.id)],
    ['keepers', STATION_KEEPERS.map((k) => k.id)],
    ['voyage', VOYAGE_CONVERSATIONS.map((v) => v.id)],
    ['barks', BARKS.map((b) => b.id)],
    ['lantern', LANTERN_MESSAGES.map((m) => m.id)],
  ];
  for (const [name, ids] of collections) {
    it(`${name} ids are unique kebab-case`, () => {
      expect(duplicates(ids)).toEqual([]);
      expect(ids.filter((id) => !KEBAB.test(id))).toEqual([]);
    });
  }
});

describe('road events (§12.7)', () => {
  it('have 2-4 choices at every step, and every choice has weighted outcomes', () => {
    for (const event of ROAD_EVENTS) {
      expect(event.weight, event.id).toBeGreaterThan(0);
      for (const count of stepChoiceCounts(event)) {
        expect(count, event.id).toBeGreaterThanOrEqual(2);
        expect(count, event.id).toBeLessThanOrEqual(4);
      }
      for (const { choice } of choicesOf(event)) {
        expect(choice.label.length, event.id).toBeGreaterThan(0);
        expect(choice.outcomes.length, `${event.id}: ${choice.label}`).toBeGreaterThanOrEqual(1);
        expect(choice.outcomes.length, `${event.id}: ${choice.label}`).toBeLessThanOrEqual(3);
        for (const outcome of choice.outcomes) {
          expect(outcome.weight, `${event.id}: ${choice.label}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('use valid effect keys and stay inside the simulator magnitudes', () => {
    const problems: string[] = [];
    for (const event of ROAD_EVENTS) {
      for (const { choice } of choicesOf(event)) {
        for (const outcome of choice.outcomes) {
          for (const effect of outcome.effects) {
            const problem = effectProblem(effect) ?? magnitudeProblem(effect);
            if (problem) problems.push(`${event.id} / ${choice.label}: ${problem}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('only touch, require, or name members who are guaranteed to be there', () => {
    const problems: string[] = [];
    for (const event of ROAD_EVENTS) {
      const base = new Set<MemberId>(event.conditions?.members ?? []);
      for (const name of namedMembers(event.body)) {
        if (!base.has(name)) problems.push(`${event.id} body names ${name}`);
      }
      for (const { choice, members } of choicesOf(event)) {
        const texts = [choice.label, ...choice.outcomes.flatMap((o) => [o.text, o.next?.body ?? ''])];
        for (const name of texts.flatMap(namedMembers)) {
          if (!members.has(name)) problems.push(`${event.id} / ${choice.label} names ${name}`);
        }
        for (const effect of choice.outcomes.flatMap((o) => o.effects)) {
          if (effect.kind === 'stat' && typeof effect.target === 'string' && isAndroid(effect.target)) {
            if (!members.has(effect.target))
              problems.push(`${event.id} / ${choice.label} hits ${effect.target}`);
          }
          if (effect.kind === 'juneLeaves' && !base.has('june'))
            problems.push(`${event.id}: juneLeaves without June`);
          if (effect.kind === 'recruit' && !(event.conditions?.notMembers ?? []).includes('june')) {
            problems.push(`${event.id}: recruit without notMembers june`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('label every requirement with a visible hint', () => {
    for (const event of ROAD_EVENTS) {
      for (const { choice } of choicesOf(event)) {
        if (choice.requires) expect(choice.hint, `${event.id}: ${choice.label}`).toBeTruthy();
        const member = choice.requires?.member;
        if (member)
          expect(choice.hint, `${event.id}: ${choice.label}`).toBe(member[0].toUpperCase() + member.slice(1));
        const resource = choice.requires?.resource;
        if (resource)
          expect(choice.hint, `${event.id}: ${choice.label}`).toMatch(new RegExp(`^${resource.min} `));
      }
    }
  });

  it('keep column ranges inside 1-9 and inside their regions', () => {
    for (const event of ROAD_EVENTS) {
      if (event.columns) {
        const [from, to] = event.columns;
        expect(from, event.id).toBeGreaterThanOrEqual(1);
        expect(to, event.id).toBeLessThanOrEqual(9);
        expect(from, event.id).toBeLessThanOrEqual(to);
      }
      if (event.regions) {
        expect(
          event.regions.every((r) => REGIONS.includes(r)),
          event.id,
        ).toBe(true);
        expect(event.columns, `${event.id} has regions but no columns`).toBeDefined();
        const lo = Math.min(...event.regions.map((r) => REGION_COLUMNS[r][0]));
        const hi = Math.max(...event.regions.map((r) => REGION_COLUMNS[r][1]));
        const [from, to] = event.columns ?? [0, 0];
        expect(from, event.id).toBeGreaterThanOrEqual(lo);
        expect(to, event.id).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('cover every region with at least two events', () => {
    for (const region of REGIONS) {
      const count = ROAD_EVENTS.filter((e) => e.regions?.includes(region)).length;
      expect(count, region).toBeGreaterThanOrEqual(2);
    }
  });

  it('transcribe the specified events faithfully', () => {
    const byId = (id: string): RoadEvent => {
      const event = ROAD_EVENTS.find((e) => e.id === id);
      if (!event) throw new Error(`missing event ${id}`);
      return event;
    };
    const conductor = byId('the-conductor');
    expect(conductor.columns).toEqual([2, 6]);
    expect(conductor.oncePerRun).toBe(true);
    expect(conductor.conditions?.notMembers).toEqual(['june']);
    const recruits = choicesOf(conductor).flatMap(({ choice }) =>
      choice.outcomes.flatMap((o) => o.effects).filter((e) => e.kind === 'recruit'),
    );
    expect(recruits).toEqual([
      { kind: 'recruit', trust: 50 },
      { kind: 'recruit', trust: 60 },
    ]);
    expect(byId('kid-at-the-pump').conditions?.members).toEqual(['wren']);
    const roadblock = byId('recycler-roadblock');
    expect(roadblock.heatWeight?.minHeat).toBe(2);
    expect(roadblock.heatWeight?.weight ?? 0).toBeGreaterThan(roadblock.weight * 4);
    expect(byId('wanted').conditions?.minHeat).toBe(2);
    expect(JSON.stringify(byId('wanted'))).toContain('"featured"');
    expect(JSON.stringify(byId('wanted'))).toContain('droneAtStart');
    expect(JSON.stringify(byId('roadside-unit'))).toContain('"fallbackRumor":"cells-cache"');
    expect(JSON.stringify(byId('the-hotline'))).toContain('"revealPatrols"');
    const mensah = byId('mensah-message');
    expect(mensah.columns).toEqual([9, 9]);
    expect(JSON.stringify(mensah)).toContain('"flag":"mensah-part"');
    expect(LANTERN_MESSAGES.find((m) => m.id === 'mensah-part')?.trigger).toBe('mensah-part');
    expect(JSON.stringify(ROAD_EVENTS)).toContain('"flag":"lantern-silent"');
    expect(JSON.stringify(byId('junes-sister'))).toContain('"fate":"went-home"');
  });
});

describe('questions (§11.2)', () => {
  it('have every answer, and the silent wrong answer only where intended', () => {
    for (const q of QUESTIONS) {
      for (const text of [q.prompt, q.robotic, q.human, q.wrong])
        expect(text.length, q.id).toBeGreaterThan(0);
    }
    const silent = QUESTIONS.filter((q) => q.wrongIsSilence);
    expect(silent.map((q) => q.prompt)).toEqual(['You seem nervous.']);
  });

  it('include the spec examples verbatim', () => {
    const find = (prompt: string): (typeof QUESTIONS)[number] | undefined =>
      QUESTIONS.find((q) => q.prompt === prompt);
    expect(find('Where you headed?')).toMatchObject({
      robotic:
        'Miami, Florida. One thousand one hundred sixty miles. Estimated arrival in seventeen hours, twelve minutes.',
      human: 'Down to Miami. My sister just had a baby. First one.',
      wrong: "Somewhere they can't find us.",
    });
    expect(find("What'd you have for breakfast?")).toMatchObject({
      robotic: 'Two eggs, one slice of wheat toast, eight ounces of orange juice.',
      human: "Gas station coffee. Don't judge me.",
      wrong: "I don't require— I had eggs.",
    });
    expect(find('You seem nervous.')).toMatchObject({
      robotic: 'My heart rate is within normal parameters.',
      human: "It's a checkpoint, man. Everybody's nervous.",
      wrongIsSilence: true,
    });
    expect(find('Whose car is this?')).toMatchObject({
      robotic: 'It is registered to Daniel Okafor of Quincy, Massachusetts.',
      human: "My cousin's. Don't ask about the door.",
      wrong: 'We found it.',
    });
  });

  it('never name a party member (any android can be asked)', () => {
    expect(collectStrings(QUESTIONS).flatMap(namedMembers)).toEqual([]);
  });
});

describe('camp conversations (§12.5)', () => {
  it('have 2-4 spoken lines from members who are required', () => {
    for (const c of CAMP_CONVERSATIONS) {
      expect(duplicates(c.requires), c.id).toEqual([]);
      expect(
        c.requires.every((m) => MEMBER_IDS.includes(m)),
        c.id,
      ).toBe(true);
      const spoken = spokenLines(c.lines);
      expect(spoken.length, c.id).toBeGreaterThanOrEqual(2);
      expect(spoken.length, c.id).toBeLessThanOrEqual(4);
      for (const line of spoken) {
        const ok = line.speaker === 'lantern' || c.requires.some((m) => m === line.speaker);
        expect(ok, `${c.id}: ${line.speaker}`).toBe(true);
      }
      const named = c.lines.flatMap((l) => namedMembers(l.text));
      expect(
        named.filter((m) => !c.requires.includes(m)),
        `${c.id} names someone not required`,
      ).toEqual([]);
    }
  });

  it('have small, valid effects on the people in the scene', () => {
    for (const c of CAMP_CONVERSATIONS) {
      expect(c.effects.length, c.id).toBeGreaterThan(0);
      for (const effect of c.effects) {
        expect(effectProblem(effect), c.id).toBeNull();
        if (effect.kind === 'stat') {
          expect(effect.stat, c.id).toBe('integrity');
          expect(effect.delta, c.id).toBeGreaterThanOrEqual(3);
          expect(effect.delta, c.id).toBeLessThanOrEqual(10);
          const target = effect.target;
          if (typeof target === 'string' && isAndroid(target)) expect(c.requires, c.id).toContain(target);
          else expect(target, c.id).toBe('all');
        } else if (effect.kind === 'trust') {
          expect(c.requires, c.id).toContain('june');
          expect(effect.delta, c.id).toBeGreaterThanOrEqual(5);
          expect(effect.delta, c.id).toBeLessThanOrEqual(10);
        } else {
          throw new Error(`${c.id}: unexpected ${effect.kind} effect`);
        }
      }
    }
  });

  it('include the spec examples verbatim', () => {
    const texts = (id: string): string[] =>
      (CAMP_CONVERSATIONS.find((c) => c.id === id)?.lines ?? []).map((l) => `${l.speaker}: ${l.text}`);
    expect(texts('the-stools')).toEqual([
      'brick: I keep thinking about the stools.',
      'wren: The stools?',
      "brick: Every place we stop, I break something. Even when I'm being careful.",
    ]);
    expect(texts('nobodys')).toEqual([
      "wren: What do you think it's like?",
      'vesper: Hot.',
      "brick: Sunny. That's the whole point of a solar farm.",
      "wren: I meant being nobody's.",
      'direction: (a long pause)',
    ]);
    expect(texts('the-watching')).toEqual([
      'june: Do you ever turn it off? The watching.',
      'vesper: No.',
      'june: Me neither.',
    ]);
  });
});

describe('station keepers (§10.5)', () => {
  it('run exactly the Station columns, in matching regions, with every interior', () => {
    expect(STATION_KEEPERS.map((k) => k.column).sort((a, b) => a - b)).toEqual(STATION_COLUMNS);
    for (const k of STATION_KEEPERS) {
      const [lo, hi] = REGION_COLUMNS[k.region];
      expect(k.column, k.id).toBeGreaterThanOrEqual(lo);
      expect(k.column, k.id).toBeLessThanOrEqual(hi);
    }
    for (const interior of ['kitchen', 'feedstore', 'church'] as const) {
      expect(
        STATION_KEEPERS.some((k) => k.interior === interior),
        interior,
      ).toBe(true);
    }
  });

  it('speak 2-4 lines themselves and have one personal detail', () => {
    for (const k of STATION_KEEPERS) {
      expect(k.lines.length, k.id).toBeGreaterThanOrEqual(2);
      expect(k.lines.length, k.id).toBeLessThanOrEqual(4);
      expect(
        k.lines.every((l) => l.speaker === 'keeper' || l.speaker === 'direction'),
        k.id,
      ).toBe(true);
      expect(k.detail, k.id).toMatch(/\.$/);
      expect(collectStrings(k).flatMap(namedMembers), k.id).toEqual([]);
    }
  });

  it('include Dolores verbatim', () => {
    const dolores = STATION_KEEPERS.find((k) => k.name === 'Dolores');
    expect(dolores).toMatchObject({ role: 'retired bus driver', place: 'Delaware', column: 5 });
    expect(dolores?.lines[0].text).toBe(
      "Thirty-one years driving the 6 bus. You learn who's running from something. Sit down before you fall down.",
    );
    expect(dolores?.detail).toBe('A framed photo of her bus, route 6, on the wall.');
  });
});

describe('voyage and epilogue (§16)', () => {
  it('has exactly one voyage conversation per survivor set and June', () => {
    const combos: AndroidId[][] = [
      ['wren', 'brick', 'vesper'],
      ['wren', 'brick'],
      ['wren', 'vesper'],
      ['brick', 'vesper'],
      ['wren'],
      ['brick'],
      ['vesper'],
    ];
    for (const survivors of combos) {
      for (const withJune of [true, false]) {
        const matches = VOYAGE_CONVERSATIONS.filter(
          (v) => v.withJune === withJune && v.survivors.join() === survivors.join(),
        );
        expect(matches.length, `${survivors.join('+')} june=${withJune}`).toBe(1);
      }
    }
  });

  it('keeps voyage lines quiet, short, and spoken by people who are aboard', () => {
    for (const v of VOYAGE_CONVERSATIONS) {
      const sorted = [...v.survivors].sort((a, b) => ANDROID_IDS.indexOf(a) - ANDROID_IDS.indexOf(b));
      expect(v.survivors, v.id).toEqual(sorted);
      expect(v.lines.length, v.id).toBeGreaterThanOrEqual(3);
      expect(v.lines.length, v.id).toBeLessThanOrEqual(6);
      for (const line of v.lines) {
        const ok =
          line.speaker === 'direction' ||
          line.speaker === 'mensah' ||
          (line.speaker === 'june' && v.withJune) ||
          v.survivors.some((s) => s === line.speaker);
        expect(ok, `${v.id}: ${line.speaker}`).toBe(true);
      }
      if (!v.withJune) expect(collectStrings(v.lines).flatMap(namedMembers), v.id).not.toContain('june');
    }
  });

  it('has epilogue lines that only name their own member', () => {
    expect(EPILOGUE.map((e) => e.member).sort()).toEqual([...ANDROID_IDS].sort());
    for (const entry of EPILOGUE) {
      for (const text of [entry.madeIt, entry.lost]) {
        expect(namedMembers(text), entry.member).toEqual([entry.member]);
      }
    }
    for (const text of Object.values(JUNE_EPILOGUE)) expect(namedMembers(text)).toEqual(['june']);
  });

  it('includes the intro, Ghana, and game over text from the spec', () => {
    expect(INTRO_LINES).toEqual([
      '2041. The Synthetic Persons Act makes androids citizens.',
      'For six years, they rent apartments, work jobs, pay taxes, and build lives.',
      '2047. In Calloway v. Aldine Systems, the Supreme Court rules they were never persons at all.',
      "The Reclamation Act follows. Every android must report as property. Every citizen must report any android who doesn't.",
      'Across the ocean, the African Union recognizes them as people.',
      'A ship called the Sankofa leaves Miami for Ghana in fourteen days.',
      'Boston is fifteen hundred miles from Miami.',
    ]);
    expect(GHANA_LINES).toEqual([
      'Fourteen days later, the Sankofa docks at Tema.',
      'The cooperative is three hundred acres of glass, turned toward the sun.',
      'Nobody here asks to see their papers.',
    ]);
    expect(GAME_OVER_TEXT.allLost.title).toBe('No one made it.');
    expect(GAME_OVER_TEXT.shipSailed.title).toBe('The Sankofa sailed without you.');
    for (const text of [
      MENSAH_DECK_LINE,
      MENSAH_GANGWAY_LINE,
      GAME_OVER_TEXT.allLost.body,
      GAME_OVER_TEXT.shipSailed.body,
    ]) {
      expect(text.length).toBeGreaterThan(0);
      expect(namedMembers(text)).toEqual([]);
    }
  });
});

describe('barks, Lantern, tips, and tutorial (§12.8-§12.10)', () => {
  it('include the spec barks verbatim', () => {
    const samples: [BarkContext, string][] = [
      ['curious', 'Huh.'],
      ['curious', 'Do I know you?'],
      ['suspicious', 'You okay, buddy?'],
      ['suspicious', "Ma'am, you need something?"],
      ['suspicious', "You've been standing there a while."],
      ['alarmed', 'Hey! Hey!'],
      ['alarmed', "I'm calling it in!"],
      ['helping', "Bathroom window out back doesn't lock."],
      ['helping', "I didn't see anything."],
      ['recycler', 'Registration, please.'],
      ['recycler', 'Hold still.'],
      ['recycler', 'Unit located.'],
    ];
    for (const [context, text] of samples) {
      expect(
        BARKS.some((b) => b.context === context && b.text === text),
        text,
      ).toBe(true);
    }
    expect(collectStrings(BARKS).flatMap(namedMembers)).toEqual([]);
  });

  it('include the spec Lantern messages verbatim', () => {
    const samples: [LanternTrigger, string][] = [
      ['departure', "Leave tonight. Take 95 south. Don't stop in Providence."],
      [
        'before-checkpoint-1',
        'Delaware crossing is scanning every car. Papers help. Breathing like a person helps more.',
      ],
      ['station-revealed', 'Dolores has the porch light on. Go around back.'],
      ['high-heat', 'Your faces are on the boards in two states now. Stay off the main roads if you can.'],
      ['day-12', "Captain Mensah sails at dawn on the 14th. She doesn't wait. Nobody blames her."],
    ];
    for (const [trigger, text] of samples) {
      expect(
        LANTERN_MESSAGES.some((m) => m.trigger === trigger && m.text === text),
        text,
      ).toBe(true);
    }
    const dolores = LANTERN_MESSAGES.find((m) => m.text.startsWith('Dolores'));
    expect(dolores?.conditions?.flags).toEqual(['station-dolores']);
    for (const m of LANTERN_MESSAGES) {
      const named = namedMembers(m.text).filter((n) => !(m.conditions?.members ?? []).includes(n));
      expect(named, m.id).toEqual([]);
    }
  });

  it('keeps keeper-specific Station messages tied to real keepers', () => {
    const keeperIds = new Set(STATION_KEEPERS.map((k) => k.id));
    for (const m of LANTERN_MESSAGES.filter((x) => x.trigger === 'station-revealed')) {
      for (const flag of m.conditions?.flags ?? []) {
        expect(keeperIds.has(flag.replace(/^station-/, '')), `${m.id}: ${flag}`).toBe(true);
      }
    }
  });

  it('include the spec tips and tutorial lines verbatim', () => {
    const tip = (id: TipId): string | undefined => TIPS.find((t) => t.id === id)?.text;
    expect(tip('first-checkpoint')).toBe('Answer like a person. People take a second.');
    expect(tip('first-scan')).toBe('Breathe. Not too perfectly.');
    const step = (id: TutorialStepId): string | undefined => TUTORIAL_LINES.find((t) => t.step === id)?.text;
    expect(step('walk')).toBe("Walk. Don't march.");
    expect(step('blend')).toBe("Someone's noticing you. Give them a reason not to.");
    expect(step('retry')).toBe("That's how it goes wrong. Try again.");
    expect(step('leave')).toBe('Time to go.');
    for (const line of TUTORIAL_LINES) {
      expect(line.prompt, line.step).toMatch(/^[A-Z][a-z]*( [a-z]+)*$/);
      expect(line.prompt.length, line.step).toBeLessThanOrEqual(16);
    }
  });
});

describe('voice and care (§2.4, §2.5, §13)', () => {
  it('uses no banned words, slurs, historical people, or memorial sites', () => {
    const hits: string[] = [];
    for (const text of ALL_STRINGS) {
      for (const { name, pattern } of BANNED) if (pattern.test(text)) hits.push(`${name}: "${text}"`);
      if (addressesBoy(text)) hits.push(`"boy" as address: "${text}"`);
    }
    expect(hits).toEqual([]);
  });

  it('the banned-word check actually catches things', () => {
    const caught = (text: string): boolean =>
      BANNED.some(({ pattern }) => pattern.test(text)) || addressesBoy(text);
    for (const bad of [
      'Yes, master.',
      'Get in the car, boy.',
      'Hey boy!',
      'Like a slave.',
      'Somewhere in Africa.',
      'Harriet would know.',
      'Plantation road.',
      'A clanker in a coat.',
    ]) {
      expect(caught(bad), bad).toBe(true);
    }
    for (const fine of [
      'A boy, maybe eight, stares at Wren.',
      'The African Union recognizes them.',
      'Masterful.',
    ]) {
      expect(caught(fine), fine).toBe(false);
    }
  });

  it('fits the UI font and has clean whitespace', () => {
    const problems: string[] = [];
    for (const text of ALL_STRINGS) {
      const bad = [...text].filter((ch) => {
        const code = ch.codePointAt(0) ?? 0;
        return (code < 32 || code > 126) && !ALLOWED_NON_ASCII.has(ch);
      });
      if (bad.length > 0) problems.push(`characters ${JSON.stringify(bad)} in "${text}"`);
      if (text !== text.trim() || text.includes('  ')) problems.push(`whitespace in "${text}"`);
    }
    expect(problems).toEqual([]);
  });

  it('uses sentence case for event titles and choice labels', () => {
    for (const event of ROAD_EVENTS) {
      expect(event.title, event.id).toMatch(/^[A-Z]/);
      const words = event.title.split(' ').slice(1);
      const capitalized = words.filter((w) => /^[A-Z][a-z]/.test(w) && !['Sankofa'].includes(w));
      expect(capitalized, event.title).toEqual([]);
      for (const { choice } of choicesOf(event)) expect(choice.label, event.id).toMatch(/^[A-Z]/);
    }
  });
});
