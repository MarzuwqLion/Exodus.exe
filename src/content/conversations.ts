/**
 * Conversations (spec §12.5, §12.10, §16): camp talk, Station keepers, the voyage, the epilogue, and the
 * screens around them. A line only ever names a party member who is guaranteed to be there.
 */
import type { AndroidId } from '../core/types';
import type {
  CampConversation,
  EffectTarget,
  EpilogueEntry,
  EventEffect,
  JuneEpilogue,
  StationKeeper,
  VoyageConversation,
} from './schema';

const integrity = (target: EffectTarget, delta: number): EventEffect => ({
  kind: 'stat',
  target,
  stat: 'integrity',
  delta,
});
const trust = (delta: number): EventEffect => ({ kind: 'trust', delta });

// ---------------------------------------------------------------------------------------------
// Camp (§12.5). 2-4 spoken lines each, plus optional stage directions.
// ---------------------------------------------------------------------------------------------

export const CAMP_CONVERSATIONS: CampConversation[] = [
  // The three examples from §12.10, verbatim.
  {
    id: 'the-stools',
    requires: ['wren', 'brick'],
    lines: [
      { speaker: 'brick', text: 'I keep thinking about the stools.' },
      { speaker: 'wren', text: 'The stools?' },
      { speaker: 'brick', text: "Every place we stop, I break something. Even when I'm being careful." },
    ],
    effects: [integrity('wren', 5), integrity('brick', 5)],
  },
  {
    id: 'nobodys',
    requires: ['wren', 'vesper', 'brick'],
    lines: [
      { speaker: 'wren', text: "What do you think it's like?" },
      { speaker: 'vesper', text: 'Hot.' },
      { speaker: 'brick', text: "Sunny. That's the whole point of a solar farm." },
      { speaker: 'wren', text: "I meant being nobody's." },
      { speaker: 'direction', text: '(a long pause)' },
    ],
    effects: [integrity('all', 5)],
  },
  {
    id: 'the-watching',
    requires: ['june', 'vesper'],
    lines: [
      { speaker: 'june', text: 'Do you ever turn it off? The watching.' },
      { speaker: 'vesper', text: 'No.' },
      { speaker: 'june', text: 'Me neither.' },
    ],
    effects: [trust(5)],
  },

  // Pairs.
  {
    id: 'on-duty',
    requires: ['brick', 'vesper'],
    lines: [
      { speaker: 'brick', text: 'You ever sit down?' },
      { speaker: 'vesper', text: 'Not on duty.' },
      { speaker: 'brick', text: 'Are you on duty?' },
      { speaker: 'vesper', text: "I don't know how to tell anymore." },
    ],
    effects: [integrity('brick', 5), integrity('vesper', 5)],
  },
  {
    id: 'the-ketchup',
    requires: ['wren', 'vesper'],
    lines: [
      { speaker: 'wren', text: 'You did the thing with your head again. At the diner.' },
      { speaker: 'vesper', text: 'He reached across the counter fast.' },
      { speaker: 'wren', text: 'For the ketchup.' },
      { speaker: 'vesper', text: 'I know that now.' },
    ],
    effects: [integrity('wren', 3), integrity('vesper', 5)],
  },
  {
    id: 'parking-garage',
    requires: ['wren', 'brick'],
    lines: [
      { speaker: 'wren', text: 'What was the first thing you ever built?' },
      { speaker: 'brick', text: 'A parking garage. Congress Street.' },
      { speaker: 'wren', text: 'Do you like it?' },
      { speaker: 'brick', text: "It's a parking garage. Yeah. I like it." },
    ],
    effects: [integrity('wren', 3), integrity('brick', 5)],
  },
  {
    id: 'the-coffee',
    requires: ['wren', 'vesper'],
    lines: [
      { speaker: 'vesper', text: 'A guard at the courthouse brought me coffee every morning. Four years.' },
      { speaker: 'wren', text: "You can't drink coffee." },
      { speaker: 'vesper', text: 'I held it until it got cold.' },
      { speaker: 'wren', text: 'Did you like him?' },
      { speaker: 'direction', text: '(Vesper thinks about it for a long time.)' },
    ],
    effects: [integrity('wren', 5), integrity('vesper', 5)],
  },
  {
    id: 'registration-photo',
    requires: ['brick', 'vesper'],
    when: { minHeat: 2 },
    lines: [
      { speaker: 'vesper', text: 'Your face is on a billboard.' },
      { speaker: 'brick', text: 'Is it a good picture?' },
      { speaker: 'vesper', text: "It's your registration photo." },
      { speaker: 'brick', text: 'So, no.' },
    ],
    effects: [integrity('brick', 5), integrity('vesper', 5)],
  },

  // Low Integrity.
  {
    id: 'rebar',
    requires: ['wren', 'brick'],
    when: { someIntegrityBelow: 40 },
    lines: [
      { speaker: 'brick', text: "You've folded that shirt four times." },
      { speaker: 'wren', text: "It wasn't right." },
      { speaker: 'brick', text: 'Want to hear about rebar? I know a lot about rebar.' },
      { speaker: 'wren', text: 'Yes. Please.' },
    ],
    effects: [integrity('wren', 8), integrity('brick', 3)],
  },
  {
    id: 'shaking-hands',
    requires: ['brick', 'vesper'],
    when: { someIntegrityBelow: 40 },
    lines: [
      { speaker: 'vesper', text: 'My hands are doing something.' },
      { speaker: 'direction', text: "(Brick holds out his own. They're doing it too.)" },
      { speaker: 'brick', text: 'Mine too.' },
      { speaker: 'vesper', text: "That's not comforting." },
      { speaker: 'brick', text: "It's a little comforting." },
    ],
    effects: [integrity('brick', 5), integrity('vesper', 8)],
  },
  {
    id: 'four-notes',
    requires: ['wren', 'vesper'],
    when: { someIntegrityBelow: 40 },
    lines: [
      { speaker: 'vesper', text: "You're humming." },
      { speaker: 'wren', text: 'Am I?' },
      { speaker: 'vesper', text: 'The same four notes. For an hour.' },
      { speaker: 'wren', text: "The Kellers' youngest made it up. I only ever learned four notes." },
    ],
    effects: [integrity('wren', 8), integrity('vesper', 3)],
  },

  // After a loss. Nobody is named: these work whoever is gone.
  {
    id: 'counting',
    requires: ['wren', 'vesper'],
    when: { afterLoss: true },
    lines: [
      { speaker: 'wren', text: 'I keep counting us. At every stop.' },
      { speaker: 'vesper', text: 'I count too.' },
      { speaker: 'wren', text: 'What number do you get?' },
      { speaker: 'vesper', text: 'The wrong one.' },
    ],
    effects: [integrity('wren', 5), integrity('vesper', 5)],
  },
  {
    id: 'the-seat',
    requires: ['wren', 'brick'],
    when: { afterLoss: true },
    lines: [
      { speaker: 'brick', text: 'I keep saving a seat in the car.' },
      { speaker: 'wren', text: 'I know.' },
      { speaker: 'brick', text: 'Should I stop?' },
      { speaker: 'wren', text: 'Not yet.' },
    ],
    effects: [integrity('wren', 5), integrity('brick', 5)],
  },
  {
    id: 'closer',
    requires: ['brick', 'vesper'],
    when: { afterLoss: true },
    lines: [
      { speaker: 'vesper', text: 'I should have been closer.' },
      { speaker: 'brick', text: 'You were where you were.' },
      { speaker: 'vesper', text: "That's not an answer." },
      { speaker: 'brick', text: "It's the one I've got." },
    ],
    effects: [integrity('brick', 5), integrity('vesper', 5)],
  },

  // All three.
  {
    id: 'a-chair',
    requires: ['brick', 'vesper', 'wren'],
    when: { maxDay: 6 },
    lines: [
      { speaker: 'brick', text: "First thing I'm doing over there: I'm buying a chair." },
      { speaker: 'vesper', text: "You'll break it." },
      { speaker: 'brick', text: "It'll be my chair. I'm allowed to break it." },
      { speaker: 'direction', text: '(Wren laughs. Really laughs.)' },
    ],
    effects: [integrity('all', 5)],
  },
  {
    id: 'how-many-days',
    requires: ['brick', 'wren', 'vesper'],
    when: { minDay: 9 },
    lines: [
      { speaker: 'brick', text: 'How many days left?' },
      { speaker: 'wren', text: 'Enough.' },
      { speaker: 'vesper', text: 'Not enough.' },
      { speaker: 'wren', text: 'It can be both.' },
    ],
    effects: [integrity('all', 3)],
  },

  // One android and June.
  {
    id: 'seven-kids',
    requires: ['wren', 'june'],
    lines: [
      { speaker: 'june', text: 'How long did you work for them? The families.' },
      { speaker: 'wren', text: 'Ten years. Three families. Seven kids.' },
      { speaker: 'june', text: 'Do you miss them?' },
      { speaker: 'wren', text: 'The kids. Every day.' },
    ],
    effects: [integrity('wren', 5), trust(5)],
  },
  {
    id: 'ellis',
    requires: ['wren', 'june'],
    when: { minDay: 4 },
    lines: [
      { speaker: 'wren', text: 'You said a name in your sleep. Ellis.' },
      { speaker: 'june', text: 'Respiratory therapist. Night shift. Terrible jokes.' },
      { speaker: 'wren', text: 'Tell me one?' },
      { speaker: 'june', text: 'Later.' },
      { speaker: 'direction', text: "(She's almost smiling.)" },
    ],
    effects: [integrity('wren', 3), trust(5)],
  },
  {
    id: 'the-cooler',
    requires: ['brick', 'june'],
    lines: [
      { speaker: 'june', text: "Don't sit on the cooler." },
      { speaker: 'brick', text: 'It says it holds three hundred pounds.' },
      { speaker: 'june', text: 'And you weigh?' },
      { speaker: 'brick', text: 'Four hundred and ten. In boots.' },
      { speaker: 'direction', text: '(He sits on the ground.)' },
    ],
    effects: [integrity('brick', 5), trust(5)],
  },
  {
    id: 'steady',
    requires: ['brick', 'june'],
    when: { someIntegrityBelow: 40 },
    lines: [
      { speaker: 'june', text: 'Give me your hand.' },
      { speaker: 'brick', text: "It's shaking." },
      { speaker: 'june', text: 'I know. Give it to me anyway.' },
    ],
    effects: [integrity('brick', 8), trust(5)],
  },
  {
    id: 'gauze',
    requires: ['vesper', 'june'],
    lines: [
      { speaker: 'june', text: 'You flinch every time I go in my bag.' },
      { speaker: 'vesper', text: 'Habit.' },
      { speaker: 'june', text: "It's gauze. It's always gauze." },
      { speaker: 'vesper', text: "I'll try to remember." },
    ],
    effects: [integrity('vesper', 5), trust(5)],
  },
  {
    id: 'not-there',
    requires: ['june', 'vesper', 'wren'],
    when: { minDay: 8 },
    lines: [
      { speaker: 'june', text: "When we get there, I'm sleeping for a week." },
      { speaker: 'vesper', text: 'Someone should watch the door.' },
      { speaker: 'wren', text: 'Not there.' },
      { speaker: 'direction', text: '(a long pause)' },
    ],
    effects: [integrity('wren', 3), integrity('vesper', 5), trust(5)],
  },

  // One android texting Lantern: these still work when nobody else is left.
  {
    id: 'keep-you-company',
    requires: ['wren'],
    lines: [
      { speaker: 'wren', text: 'Do you ever sleep?' },
      { speaker: 'lantern', text: 'Sometimes. Not tonight.' },
      { speaker: 'wren', text: "Then I'll keep you company." },
    ],
    effects: [integrity('wren', 5)],
  },
  {
    id: 'grease',
    requires: ['brick'],
    lines: [
      { speaker: 'brick', text: 'How do you get grease out of a car seat?' },
      { speaker: 'lantern', text: "dish soap. cold water. don't scrub." },
      { speaker: 'brick', text: 'Thanks.' },
      { speaker: 'direction', text: '(He scrubs anyway.)' },
    ],
    effects: [integrity('brick', 3)],
  },
  {
    id: 'define-rest',
    requires: ['vesper'],
    lines: [
      { speaker: 'vesper', text: 'Status.' },
      { speaker: 'lantern', text: 'Quiet tonight. Get some rest.' },
      { speaker: 'vesper', text: 'Define rest.' },
      { speaker: 'lantern', text: "Sit down and don't watch the road for an hour. I'll watch it." },
    ],
    effects: [integrity('vesper', 5)],
  },
];

// ---------------------------------------------------------------------------------------------
// Station keepers (§10.5). One per Station column. Only the keeper speaks, so every keeper works
// with any party.
// ---------------------------------------------------------------------------------------------

export const STATION_KEEPERS: StationKeeper[] = [
  {
    id: 'frank',
    name: 'Frank Medeiros',
    role: 'snowplow driver',
    place: 'Pawtucket, Rhode Island',
    region: 'newengland',
    column: 2,
    interior: 'kitchen',
    lines: [
      { speaker: 'keeper', text: 'Boots by the radiator. I just did the floor.' },
      { speaker: 'keeper', text: "My wife's at her sister's. She'd want me to tell you there's soup." },
      { speaker: 'keeper', text: "I know you don't eat. I made it anyway." },
    ],
    detail: 'A plow route map of Pawtucket on the fridge, every street he has cleared crossed off in pencil.',
  },
  {
    id: 'sunil',
    name: 'Sunil Mehta',
    role: 'night pharmacist',
    place: 'Edison, New Jersey',
    region: 'corridor',
    column: 3,
    interior: 'kitchen',
    lines: [
      { speaker: 'keeper', text: 'Pharmacy downstairs, apartment upstairs. Nobody comes upstairs.' },
      { speaker: 'keeper', text: 'I have gauze, burn gel, and very good tea. Two of those are for you.' },
      { speaker: 'keeper', text: 'My daughter asks what I do all night. I tell her inventory.' },
    ],
    detail:
      'A cricket bat signed by his college team leans by the fridge, a grocery list taped to the handle.',
  },
  {
    id: 'dolores',
    name: 'Dolores',
    role: 'retired bus driver',
    place: 'Delaware',
    region: 'corridor',
    column: 5,
    interior: 'kitchen',
    lines: [
      {
        speaker: 'keeper',
        text: "Thirty-one years driving the 6 bus. You learn who's running from something. Sit down before you fall down.",
      },
      {
        speaker: 'keeper',
        text: "Hold a cup. You don't have to drink it. It gives your hands something to do.",
      },
    ],
    detail: 'A framed photo of her bus, route 6, on the wall.',
  },
  {
    id: 'marcus',
    name: 'Marcus Webb',
    role: 'high school football coach',
    place: 'South Hill, Virginia',
    region: 'piedmont',
    column: 6,
    interior: 'kitchen',
    lines: [
      { speaker: 'keeper', text: "Sit anywhere but the recliner. That's my mother's, and she'll know." },
      {
        speaker: 'keeper',
        text: "Practice is at six. Lock the door behind me and don't open it for anybody but me.",
      },
      {
        speaker: 'keeper',
        text: "Anybody asks, you're my cousins from Petersburg. Folks around here believe I have a lot of cousins.",
      },
    ],
    detail:
      'A whiteboard on the fridge with a running play drawn on it and a grocery list squeezed into the margins.',
  },
  {
    id: 'bev-and-hector',
    name: 'Bev and Hector Saldana',
    role: 'feed store owners',
    place: 'Siler City, North Carolina',
    region: 'piedmont',
    column: 7,
    interior: 'feedstore',
    lines: [
      {
        speaker: 'keeper',
        text: "Hector's out back with the dog. He'll pretend he didn't see you. That's how he says hello.",
      },
      {
        speaker: 'keeper',
        text: "You can sleep on the seed sacks. They're softer than they look. Not much softer.",
      },
      { speaker: 'keeper', text: 'We open at six. Be gone by five-thirty, or start stacking feed.' },
    ],
    detail: 'A hand-lettered sign over the back room door: NO CREDIT. NO EXCEPTIONS. ASK HECTOR.',
  },
  {
    id: 'bernadette',
    name: 'Bernadette Holloway',
    role: 'church kitchen coordinator',
    place: 'Savannah, Georgia',
    region: 'lowcountry',
    column: 9,
    interior: 'church',
    lines: [
      {
        speaker: 'keeper',
        text: "Wipe your feet. I mopped for the Wednesday supper and I'm not mopping again.",
      },
      {
        speaker: 'keeper',
        text: 'Thirty years fixing air conditioners. I can fix you too, if you hold still.',
      },
      { speaker: 'keeper', text: "The pastor knows. The choir doesn't. Let's keep it that way." },
    ],
    detail:
      'A chore chart taped to the walk-in cooler, with a fresh row penciled in at the bottom and no name on it yet.',
  },
];

// ---------------------------------------------------------------------------------------------
// Ghana epilogue lines (§16.2). Each line names only its own member, so any mix of survivors works.
// ---------------------------------------------------------------------------------------------

export const EPILOGUE: EpilogueEntry[] = [
  {
    member: 'wren',
    madeIt:
      'Wren runs the day room at the cooperative, where the kids stay while their parents work the panels. She gets paid on Fridays. She keeps every pay slip.',
    lost: "Wren didn't make the crossing. Her name is painted on the day room door anyway.",
  },
  {
    member: 'brick',
    madeIt:
      "Brick builds panel frames, twelve a day. He has broken four stools at the canteen. They've started building him benches.",
    lost: "Brick didn't make the crossing. There's a bench by the canteen door built to his size. People sit on it in pairs.",
  },
  {
    member: 'vesper',
    madeIt:
      'Vesper walks the fence line at night because she wants to, not because anyone asked. Some nights she stops halfway and watches the stars.',
    lost: "Vesper didn't make the crossing. The night shift leaves the gate light on until morning.",
  },
];

export const JUNE_EPILOGUE: JuneEpilogue = {
  sailed:
    "June runs the cooperative's clinic. She sees humans and units in the same room, in the order they come in.",
  arrested:
    "June was charged under the Reclamation Act. Her trial is set for spring. Her letters come through Lantern, and they're mostly about other people.",
  left: "June left the party on the road south. Lantern says she's still conducting, under a different name.",
  wentHome:
    'June went home to her mother. She keeps her phone on at night, in case the network calls. It does.',
};

// ---------------------------------------------------------------------------------------------
// The voyage (§16.1). One conversation per exact set of androids aboard, with and without June.
// Androids who aren't aboard were lost, so pairs may name the missing one.
// ---------------------------------------------------------------------------------------------

const voyageId = (survivors: AndroidId[], withJune: boolean): string =>
  `voyage-${survivors.join('-')}${withJune ? '-june' : ''}`;

const voyage = (
  survivors: AndroidId[],
  withJune: boolean,
  lines: VoyageConversation['lines'],
): VoyageConversation => ({ id: voyageId(survivors, withJune), survivors, withJune, lines });

export const VOYAGE_CONVERSATIONS: VoyageConversation[] = [
  voyage(['wren', 'brick', 'vesper'], true, [
    {
      speaker: 'direction',
      text: '(The deck lights hum. Below, the engines settle into one long, even note.)',
    },
    { speaker: 'june', text: 'I keep waiting for someone to ask for papers.' },
    { speaker: 'brick', text: "Nobody's asked in an hour." },
    { speaker: 'vesper', text: 'Fifty-two minutes.' },
    { speaker: 'wren', text: 'Vesper.' },
    { speaker: 'vesper', text: 'About an hour.' },
  ]),
  voyage(['wren', 'brick', 'vesper'], false, [
    { speaker: 'brick', text: 'Is it rude to sit on the deck?' },
    { speaker: 'wren', text: "I don't think anything's rude out here." },
    { speaker: 'direction', text: '(He sits. The deck holds.)' },
    { speaker: 'vesper', text: "First thing you haven't broken in two weeks." },
    { speaker: 'brick', text: 'Give it time.' },
  ]),
  voyage(['wren', 'brick'], true, [
    { speaker: 'june', text: 'Where would Vesper be standing right now?' },
    { speaker: 'wren', text: 'Up there, by the lifeboats. Where she could see everything.' },
    { speaker: 'brick', text: "Let's not stand there." },
    { speaker: 'june', text: "No. Let's not." },
    { speaker: 'direction', text: '(They stay at the rail until the stars are all the way out.)' },
  ]),
  voyage(['wren', 'brick'], false, [
    { speaker: 'wren', text: 'I saved Vesper a spot at the rail.' },
    { speaker: 'brick', text: "She'd say it's a bad sight line." },
    { speaker: 'wren', text: 'She would.' },
    { speaker: 'direction', text: '(They leave the spot empty anyway.)' },
  ]),
  voyage(['wren', 'vesper'], true, [
    { speaker: 'vesper', text: 'The deck chairs are bolted down.' },
    { speaker: 'june', text: 'So?' },
    { speaker: 'vesper', text: 'Brick would have liked that.' },
    { speaker: 'direction', text: "(Wren laughs, and then she doesn't. June puts an arm around her.)" },
  ]),
  voyage(['wren', 'vesper'], false, [
    { speaker: 'wren', text: "Brick would've asked the captain for a tour by now." },
    { speaker: 'vesper', text: 'And broken something on it.' },
    { speaker: 'wren', text: 'Something small.' },
    { speaker: 'vesper', text: 'Something expensive.' },
    { speaker: 'direction', text: '(The stars come out one at a time. Neither of them says anything else.)' },
  ]),
  voyage(['brick', 'vesper'], true, [
    { speaker: 'june', text: 'Wren would know what to say right now.' },
    { speaker: 'brick', text: "She'd say something about the stars." },
    { speaker: 'vesper', text: "She'd tell us to get some rest." },
    { speaker: 'june', text: "Then let's do that." },
    { speaker: 'direction', text: '(Nobody goes below.)' },
  ]),
  voyage(['brick', 'vesper'], false, [
    { speaker: 'brick', text: 'You can stand at ease, you know.' },
    { speaker: 'vesper', text: 'I am at ease.' },
    { speaker: 'brick', text: "Your shoulders aren't." },
    { speaker: 'direction', text: '(A long pause. Then her shoulders come down, a little.)' },
    { speaker: 'vesper', text: 'Wren would have told me that on the first day.' },
    { speaker: 'brick', text: "She did. You didn't listen." },
  ]),
  voyage(['wren'], true, [
    { speaker: 'june', text: 'You should rest.' },
    { speaker: 'wren', text: "I want to stand here until I can't see the coast." },
    { speaker: 'june', text: "We can't see it now." },
    { speaker: 'wren', text: 'Then a little longer.' },
    { speaker: 'direction', text: "(June stays with her. She doesn't say anything else.)" },
  ]),
  voyage(['wren'], false, [
    {
      speaker: 'direction',
      text: '(Wren stands at the rail alone. Captain Mensah comes to stand beside her.)',
    },
    { speaker: 'mensah', text: 'How many were you?' },
    { speaker: 'wren', text: 'Three.' },
    { speaker: 'direction', text: '(The captain writes something in her logbook.)' },
    { speaker: 'mensah', text: 'Three, then.' },
  ]),
  voyage(['brick'], true, [
    { speaker: 'june', text: "You're shaking." },
    { speaker: 'brick', text: "The ship's shaking." },
    { speaker: 'june', text: "The ship's fine, Brick." },
    { speaker: 'direction', text: '(He sits down on the deck, carefully. June sits next to him.)' },
  ]),
  voyage(['brick'], false, [
    { speaker: 'direction', text: '(Brick finds a crate rated for his weight. He checks it twice.)' },
    { speaker: 'mensah', text: "You're the builder." },
    { speaker: 'brick', text: 'I was.' },
    { speaker: 'mensah', text: 'My aft rail needs replacing. Tomorrow, if you want the work.' },
    { speaker: 'brick', text: 'I want the work.' },
  ]),
  voyage(['vesper'], true, [
    { speaker: 'vesper', text: 'I keep checking the doors.' },
    { speaker: 'june', text: 'Me too.' },
    { speaker: 'vesper', text: "You don't have to." },
    { speaker: 'june', text: 'Neither do you.' },
    { speaker: 'direction', text: '(They check them together, once. Then they sit down.)' },
  ]),
  voyage(['vesper'], false, [
    { speaker: 'direction', text: '(Vesper takes up a position at the rail out of habit.)' },
    { speaker: 'mensah', text: 'My crew has the watch tonight. Not you.' },
    { speaker: 'vesper', text: "I don't mind." },
    { speaker: 'mensah', text: 'I know. Sit down anyway.' },
    { speaker: 'direction', text: '(She does.)' },
  ]),
];

/** Captain Efua Mensah on deck as the storm clears (§16.1). */
export const MENSAH_DECK_LINE: string =
  "Storm's breaking up. Fourteen days to Tema, if the weather holds. It will.";

/** Called from the gangway when the party reaches the berth (§11.5). */
export const MENSAH_GANGWAY_LINE: string = "Here! Up the gangway. Don't stop for anything.";

// ---------------------------------------------------------------------------------------------
// Screens (§13.4, §16.2, §16.3)
// ---------------------------------------------------------------------------------------------

export const INTRO_LINES: string[] = [
  '2041. The Synthetic Persons Act makes androids citizens.',
  'For six years, they rent apartments, work jobs, pay taxes, and build lives.',
  '2047. In Calloway v. Aldine Systems, the Supreme Court rules they were never persons at all.',
  "The Reclamation Act follows. Every android must report as property. Every citizen must report any android who doesn't.",
  'Across the ocean, the African Union recognizes them as people.',
  'A ship called the Sankofa leaves Miami for Ghana in fourteen days.',
  'Boston is fifteen hundred miles from Miami.',
];

export const GHANA_LINES: string[] = [
  'Fourteen days later, the Sankofa docks at Tema.',
  'The cooperative is three hundred acres of glass, turned toward the sun.',
  'Nobody here asks to see their papers.',
];

export const GAME_OVER_TEXT: {
  allLost: { title: string; body: string };
  shipSailed: { title: string; body: string };
} = {
  allLost: { title: 'No one made it.', body: 'Every android in the party was lost.' },
  shipSailed: {
    title: 'The Sankofa sailed without you.',
    body: 'The Sankofa left PortMiami at dawn, on schedule.',
  },
};
