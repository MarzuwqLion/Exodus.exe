/**
 * Road events (spec §12.7). The first six are transcribed from the spec; the other eighteen are written
 * from its seeds. Effects stay inside the magnitudes the economy simulator expects
 * (checked in tests/content.test.ts).
 */
import type { ResourceKey, StopModifier } from '../core/types';
import type { EffectTarget, EventEffect, RoadEvent, StatKey } from './schema';

const res = (key: ResourceKey, delta: number): EventEffect => ({ kind: 'resource', key, delta });
const stat = (target: EffectTarget, s: StatKey, delta: number): EventEffect => ({
  kind: 'stat',
  target,
  stat: s,
  delta,
});
const integrity = (target: EffectTarget, delta: number): EventEffect => stat(target, 'integrity', delta);
const hull = (target: EffectTarget, delta: number): EventEffect => stat(target, 'hull', delta);
const heat = (delta: number): EventEffect => ({ kind: 'heat', delta });
const trust = (delta: number): EventEffect => ({ kind: 'trust', delta });
const day = (delta: number): EventEffect => ({ kind: 'day', delta });
const flag = (name: string): EventEffect => ({ kind: 'flag', flag: name });
const nextStop = (mod: StopModifier): EventEffect => ({ kind: 'nextStop', mod });

export const ROAD_EVENTS: RoadEvent[] = [
  // -------------------------------------------------------------------------------------------
  // The six events specified in full (§12.7)
  // -------------------------------------------------------------------------------------------
  {
    id: 'kid-at-the-pump',
    title: 'The kid at the pump',
    weight: 10,
    oncePerRun: true,
    conditions: { members: ['wren'] },
    body: "A boy, maybe eight, stares at Wren through the gas station glass. When she steps out, he says, 'My nanny looked like you. Some men came and took her.' His mother is inside, paying.",
    choices: [
      {
        label: 'Kneel and talk to him.',
        hint: 'Wren',
        requires: { member: 'wren' },
        outcomes: [
          {
            weight: 60,
            text: 'He shows her a drawing of his old nanny. His mother comes out, sees them, and says nothing. She leaves her charge card on the pump.',
            effects: [res('cells', 15), integrity('wren', 10)],
          },
          {
            weight: 40,
            text: "His mother sees Wren's face and pulls him away. She's already dialing.",
            effects: [heat(1), integrity('wren', 10)],
          },
        ],
      },
      {
        label: 'Get back in the car.',
        outcomes: [{ weight: 1, text: "Wren doesn't speak for an hour.", effects: [integrity('wren', -10)] }],
      },
    ],
  },
  {
    id: 'roadside-unit',
    title: 'Roadside unit',
    weight: 10,
    oncePerRun: true,
    body: 'A unit sits in a drainage ditch, powered down, eyes dim. Someone has spray-painted RETURN TO ALDINE across its chest.',
    choices: [
      {
        label: 'Strip it for parts.',
        outcomes: [
          { weight: 1, text: 'Its hands are still warm.', effects: [res('parts', 3), integrity('all', -8)] },
        ],
      },
      {
        label: 'Carry it out of the ditch and lay it in the grass.',
        hint: 'Brick',
        requires: { member: 'brick' },
        outcomes: [
          {
            weight: 1,
            text: "It's lighter than he expected.",
            effects: [integrity('brick', 10), integrity({ except: 'brick' }, 3)],
          },
        ],
      },
      {
        label: 'Try to wake it.',
        outcomes: [
          {
            weight: 50,
            text: 'Its eyes flicker. It whispers an address, then goes still.',
            effects: [{ kind: 'revealStation', columns: 2, fallbackRumor: 'cells-cache' }],
          },
          { weight: 50, text: 'Nothing. The ditch smells like rain and ozone.', effects: [] },
        ],
      },
    ],
  },
  {
    // Repeatable: a systemic hazard rather than a story beat. Much more likely at Heat 2+.
    id: 'recycler-roadblock',
    title: 'Recycler roadblock',
    weight: 4,
    heatWeight: { minHeat: 2, weight: 40 },
    oncePerRun: false,
    body: 'A white van sits across both lanes. Two Recyclers in reflective vests are scanning drivers with handheld wands. Your headlights are already on them.',
    choices: [
      {
        label: 'Turn around and take the back roads.',
        outcomes: [
          {
            weight: 1,
            text: 'The detour costs battery and most of a day.',
            effects: [res('carBattery', -12), day(1)],
          },
        ],
      },
      {
        label: 'Show them papers.',
        hint: '1 Papers',
        requires: { resource: { key: 'papers', min: 1 } },
        outcomes: [
          {
            weight: 1,
            text: 'The wand beeps. The Recycler waves you through without looking up.',
            effects: [res('papers', -1)],
          },
        ],
      },
      {
        label: 'Let Vesper handle it.',
        hint: 'Vesper',
        requires: { member: 'vesper' },
        outcomes: [
          {
            weight: 70,
            text: 'Neither of them gets up for a while. Nobody asks.',
            effects: [heat(1), trust(-15)],
          },
          {
            weight: 30,
            text: 'One of them reaches the radio first.',
            effects: [heat(2), hull('vesper', -20)],
          },
        ],
      },
      {
        label: 'Ram the van.',
        hint: 'Brick',
        requires: { member: 'brick' },
        outcomes: [
          {
            weight: 1,
            text: 'The station wagon will never be the same. Neither will the van.',
            effects: [heat(1), res('carBattery', -10), hull('all', -10)],
          },
        ],
      },
    ],
  },
  {
    id: 'the-hotline',
    title: 'The hotline',
    weight: 10,
    oncePerRun: true,
    body: "The radio cuts to an Aldine announcement. A warm voice: 'If you see a unit that hasn't reported, you're not being cruel. You're being responsible. Call 1-800-RECLAIM.'",
    choices: [
      {
        label: 'Turn it off.',
        outcomes: [{ weight: 1, text: '', effects: [integrity('all', -5)] }],
      },
      {
        label: 'Keep listening.',
        outcomes: [
          {
            weight: 1,
            text: 'Between the jingles, it lists the counties adding Recycler patrols this week.',
            effects: [integrity('all', -10), { kind: 'revealPatrols', columns: 2 }],
          },
        ],
      },
    ],
  },
  {
    id: 'the-conductor',
    title: 'The conductor',
    columns: [2, 6],
    weight: 40,
    oncePerRun: true,
    conditions: { notMembers: ['june'] },
    body: "A woman in a rain jacket over hospital scrubs flags you down at a rest stop. She glances at the car, then at you. 'You're running. I'm with the network. I can get you through the kiosks.'",
    choices: [
      {
        label: 'Let her in.',
        outcomes: [
          {
            weight: 1,
            text: 'She sits in the back with her bag on her lap and reads you the next three exits from memory.',
            effects: [{ kind: 'recruit', trust: 50 }],
          },
        ],
      },
      {
        label: 'Ask her why.',
        outcomes: [
          {
            weight: 1,
            text: "'I hid a colleague in a supply closet for three days. Ellis. They found him anyway. I'm not losing anyone else.'",
            effects: [],
            next: {
              choices: [
                {
                  label: 'Let her in.',
                  outcomes: [
                    {
                      weight: 1,
                      text: 'She sits in the back with her bag on her lap and reads you the next three exits from memory.',
                      effects: [{ kind: 'recruit', trust: 60 }],
                    },
                  ],
                },
                {
                  label: 'Drive on.',
                  outcomes: [
                    {
                      weight: 1,
                      text: 'In the mirror, she stands in the rain until the road curves.',
                      effects: [],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      {
        label: 'Drive on.',
        outcomes: [
          { weight: 1, text: 'In the mirror, she stands in the rain until the road curves.', effects: [] },
        ],
      },
    ],
  },
  {
    id: 'wanted',
    title: 'Wanted',
    weight: 12,
    oncePerRun: true,
    conditions: { minHeat: 2 },
    body: 'A billboard over the highway shows four grainy faces under the words HAVE YOU SEEN THESE UNITS? One of them is yours.',
    choices: [
      {
        label: 'Pull over and black it out.',
        outcomes: [
          { weight: 70, text: 'Paint drips into the weeds. Better.', effects: [heat(-1)] },
          {
            weight: 30,
            text: "A drone's searchlight finds you on the catwalk.",
            effects: [heat(1), nextStop('droneAtStart')],
          },
        ],
      },
      {
        label: 'Keep driving.',
        outcomes: [{ weight: 1, text: '', effects: [integrity('featured', -5)] }],
      },
    ],
  },

  // -------------------------------------------------------------------------------------------
  // New England (columns 1-2)
  // -------------------------------------------------------------------------------------------
  {
    id: 'not-on-my-road',
    title: 'Not on my road',
    regions: ['newengland'],
    columns: [1, 2],
    weight: 12,
    oncePerRun: true,
    conditions: { members: ['wren'] },
    body: "Blue lights in the mirror, somewhere south of Attleboro. A state trooper walks up through the sleet and holds his flashlight on Wren for a long moment. Then he clicks it off. 'Not on my road,' he says.",
    choices: [
      {
        label: 'Thank him.',
        outcomes: [
          {
            weight: 1,
            text: "'For what?' he says. 'Your taillight's out. Get it fixed.' He walks back to his cruiser and doesn't look up again.",
            effects: [integrity('all', 5)],
          },
        ],
      },
      {
        label: 'Ask him why.',
        hint: 'Wren',
        requires: { member: 'wren' },
        outcomes: [
          {
            weight: 60,
            text: "'My partner's wife was a KND,' he says. 'Same coat.' He looks at the road for a while. 'Go.'",
            effects: [integrity('wren', 10)],
          },
          {
            weight: 40,
            text: "'Ma'am, I'm working very hard not to think about it,' he says. 'Go.'",
            effects: [],
          },
        ],
      },
      {
        label: 'Drive away slowly.',
        outcomes: [
          {
            weight: 1,
            text: 'Nobody speaks until the state line. In the mirror, his lights stay dark.',
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'the-foreman',
    title: 'The foreman',
    regions: ['newengland'],
    columns: [1, 2],
    weight: 12,
    oncePerRun: true,
    conditions: { members: ['brick'] },
    body: "At a rest stop off 95, a man in a canvas work jacket stops halfway to the vending machines. 'Brick? I ran the crew on the Seaport job. Four years.' He looks at the car, then back at Brick, and doesn't seem to know what to do with his hands.",
    choices: [
      {
        label: 'Shake his hand.',
        hint: 'Brick',
        requires: { member: 'brick' },
        outcomes: [
          {
            weight: 60,
            text: "'Best guy I ever had on steel,' he tells everyone at the rest stop, which is nobody. He empties his truck's toolbox into your trunk.",
            effects: [res('parts', 2), integrity('brick', 10)],
          },
          {
            weight: 40,
            text: 'He shakes it. Then he goes inside and makes a phone call with his back to the window.',
            effects: [heat(1), integrity('brick', -10)],
          },
        ],
      },
      {
        label: 'Tell him he has the wrong guy.',
        outcomes: [
          {
            weight: 1,
            text: "'Sure,' he says. 'My mistake.' He holds the door for you on the way out.",
            effects: [integrity('brick', -5)],
          },
        ],
      },
      {
        label: 'Get back in the car.',
        outcomes: [
          {
            weight: 1,
            text: "He's still standing by the vending machines when you pull out. He lifts one hand, then puts it in his pocket.",
            effects: [integrity('brick', -3)],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------------------------
  // The Corridor (columns 3-5)
  // -------------------------------------------------------------------------------------------
  {
    id: 'toll-plaza',
    title: 'Toll plaza',
    regions: ['corridor'],
    columns: [3, 5],
    weight: 12,
    oncePerRun: true,
    body: "The turnpike narrows to a toll plaza lit like an operating room. Every lane has a plate reader on a pole and a sign: REGISTERED VEHICLES ONLY. Two cars ahead, a sedan gets waved into a side lot and doesn't come out.",
    choices: [
      {
        label: 'Pay with the papers.',
        hint: '1 Papers',
        requires: { resource: { key: 'papers', min: 1 } },
        outcomes: [
          {
            weight: 1,
            text: 'The reader takes the forged registration and thinks about it for a long second. The gate lifts.',
            effects: [res('papers', -1)],
          },
        ],
      },
      {
        label: 'Take Route 1 instead.',
        outcomes: [
          {
            weight: 60,
            text: "Two hours of traffic lights and shuttered diners. The car battery doesn't love it.",
            effects: [res('carBattery', -10)],
          },
          {
            weight: 40,
            text: 'Route 1 is closed at Rahway for a sweep. Going around it takes the rest of the night.',
            effects: [res('carBattery', -10), day(1)],
          },
        ],
      },
      {
        label: 'Tuck in behind a truck and run the gate.',
        outcomes: [
          { weight: 50, text: 'The arm never comes down. Nobody says anything for a mile.', effects: [] },
          {
            weight: 50,
            text: 'The arm comes down on the hood. The camera gets a long, clear look at all of you.',
            effects: [heat(1)],
          },
        ],
      },
    ],
  },
  {
    id: 'amber-in-the-window',
    title: 'Amber in the window',
    regions: ['corridor'],
    columns: [3, 5],
    weight: 12,
    oncePerRun: true,
    body: "An amber beacon pulses in a second-floor window above a closed laundromat. It's the right color. The rhythm is a little too even, and Lantern never mentioned a house on this street. The street is very clean.",
    choices: [
      {
        label: 'Go up and knock.',
        outcomes: [
          {
            weight: 70,
            text: "The door opens before you knock. Floodlights, vests, a man saying 'Easy, easy.' You leave through a window.",
            effects: [heat(2), hull('all', -15)],
          },
          {
            weight: 30,
            text: 'Nobody answers. The beacon is on a timer. Down the block, someone starts a van.',
            effects: [heat(1)],
          },
        ],
      },
      {
        label: 'Watch the street for a while.',
        hint: 'Vesper',
        requires: { member: 'vesper' },
        outcomes: [
          {
            weight: 1,
            text: "Twenty minutes in, a man in a reflective vest steps out of a doorway to smoke. Vesper doesn't say anything. She just starts the car.",
            effects: [integrity('vesper', 5), { kind: 'revealPatrols', columns: 2 }],
          },
        ],
      },
      {
        label: 'Drive past.',
        outcomes: [
          {
            weight: 1,
            text: 'It keeps blinking in the rear window until the street turns.',
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'under-the-overpass',
    title: 'Under the overpass',
    regions: ['corridor'],
    columns: [3, 5],
    weight: 12,
    oncePerRun: true,
    body: 'Behind a sound wall under the overpass, someone has wired a bank of charge cells into a junction box. A family is asleep beside it on flattened boxes: two adults, a little girl, and a dog. One of the adults has the faint jaw seam of an older KND.',
    choices: [
      {
        label: 'Take the cells.',
        outcomes: [
          {
            weight: 60,
            text: 'Nobody wakes up. The cells are heavy and full. Nobody in the car looks at anybody.',
            effects: [res('cells', 20), integrity('all', -8), trust(-10)],
          },
          {
            weight: 40,
            text: 'The dog wakes up. Then the girl. You are still holding their cells when her father sits up.',
            effects: [res('cells', 20), integrity('all', -12), trust(-10)],
          },
        ],
      },
      {
        label: 'Take half.',
        outcomes: [
          {
            weight: 1,
            text: "You leave the rest wired up. The girl watches you through one eye and doesn't say anything.",
            effects: [res('cells', 10), integrity('all', -3)],
          },
        ],
      },
      {
        label: 'Leave them something to eat.',
        hint: '1 Rations',
        requires: { resource: { key: 'rations', min: 1 } },
        outcomes: [
          {
            weight: 1,
            text: "You leave a ration pack by the girl's shoes. The dog thumps its tail twice and goes back to sleep.",
            effects: [res('rations', -1), integrity('all', 8), trust(10)],
          },
        ],
      },
      {
        label: 'Leave them be.',
        outcomes: [
          {
            weight: 1,
            text: 'You back out the way you came. Somewhere under the overpass, the dog sighs.',
            effects: [integrity('all', 3), trust(5)],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------------------------
  // The Piedmont (columns 6-7)
  // -------------------------------------------------------------------------------------------
  {
    id: 'the-county-fair',
    title: 'The county fair',
    regions: ['piedmont'],
    columns: [6, 7],
    weight: 12,
    oncePerRun: true,
    body: 'The only road south runs straight through the Pruitt County fair. Funnel cake, a Ferris wheel, a 4-H barn, and a booth with a hand-painted banner: REPORT A UNIT, WIN A PRIZE. A man with a scanner wand is handing out stuffed bears.',
    choices: [
      {
        label: 'Drive through slowly, like everyone else.',
        outcomes: [
          {
            weight: 65,
            text: "A kid points at the car. The man with the wand is busy with a bear. You're through.",
            effects: [integrity('all', -3)],
          },
          {
            weight: 35,
            text: 'The man with the wand looks up as you pass and writes something on the back of his hand.',
            effects: [heat(1)],
          },
        ],
      },
      {
        label: 'Stop at the ring toss.',
        hint: 'Brick',
        requires: { member: 'brick' },
        outcomes: [
          {
            weight: 50,
            text: 'He misses the first two on purpose and lands the third. The carnie hands him a bear the size of a dog. It rides in the back seat the rest of the way.',
            effects: [integrity('brick', 10), integrity({ except: 'brick' }, 3)],
          },
          {
            weight: 50,
            text: 'He forgets to miss. Ten for ten. The carnie stops smiling and starts looking around.',
            effects: [heat(1), integrity('brick', -5)],
          },
        ],
      },
      {
        label: 'Wait for the fair to close.',
        outcomes: [
          {
            weight: 1,
            text: 'It closes at midnight. Then come the cleanup crews. You lose most of a day in a church parking lot.',
            effects: [day(1)],
          },
        ],
      },
    ],
  },
  {
    id: 'the-bell',
    title: 'The bell',
    regions: ['piedmont'],
    columns: [6, 7],
    weight: 12,
    oncePerRun: true,
    body: "At a crossroads church, the bell starts ringing as you pass, and doesn't stop. A woman sweeping the steps says the pastor started it the week the law passed: one ring for every unit reported in the county. 'Folks think he's celebrating,' she says. 'He's counting.'",
    choices: [
      {
        label: 'Stop and listen.',
        outcomes: [
          {
            weight: 1,
            text: "It rings eleven times. She stops sweeping at seven and stands with the broom until it's done.",
            effects: [integrity('all', -5), trust(5)],
          },
        ],
      },
      {
        label: 'Ask her about the pastor.',
        outcomes: [
          {
            weight: 60,
            text: "'He keeps a cot in the basement,' she says, not looking at you. 'For travelers.' She writes an address on the back of a bulletin and gives you a jar of peaches.",
            effects: [
              res('rations', 1),
              { kind: 'revealStation', columns: 2, fallbackRumor: 'sympathetic-staff' },
            ],
          },
          {
            weight: 40,
            text: "'He's a good man,' she says, and that's all she says.",
            effects: [],
          },
        ],
      },
      {
        label: 'Drive on.',
        outcomes: [
          {
            weight: 1,
            text: 'You can hear it for two miles with the windows up.',
            effects: [integrity('all', -5)],
          },
        ],
      },
    ],
  },
  {
    id: 'the-well-pump',
    title: 'The well pump',
    regions: ['piedmont'],
    columns: [6, 7],
    weight: 12,
    oncePerRun: true,
    conditions: { members: ['brick'] },
    body: "A hand-lettered sign at the end of a gravel drive: WELL PUMP BROKE. WILL TRADE A CHARGE FOR HELP. An older couple waves from the porch. The husband looks at Brick's shoulders and says, 'You look like you've lifted a thing or two.'",
    choices: [
      {
        label: 'Fix it fast.',
        hint: 'Brick',
        requires: { member: 'brick' },
        outcomes: [
          {
            weight: 60,
            text: 'Twenty minutes. The wife plugs the wagon into the barn and sends you off with a bag of boiled peanuts.',
            effects: [res('carBattery', 15), res('rations', 1), integrity('brick', 8)],
          },
          {
            weight: 40,
            text: 'He lifts the pump housing out of the well one-handed. The husband stops talking. They pay up, but the wife watches from the porch with her phone in her hand.',
            effects: [res('carBattery', 15), heat(0.5), integrity('brick', -5)],
          },
        ],
      },
      {
        label: 'Fix it slowly, like a person would.',
        hint: 'Brick',
        requires: { member: 'brick' },
        outcomes: [
          {
            weight: 1,
            text: "He takes all afternoon, sighs a lot, and asks for a wrench he doesn't need. They make you stay for supper and charge the car overnight. Supper is fried chicken. Nobody notices who doesn't eat.",
            effects: [res('carBattery', 15), res('rations', 1), integrity('brick', 10), day(1)],
          },
        ],
      },
      {
        label: "Say you're in a hurry.",
        outcomes: [{ weight: 1, text: "'Everybody is,' the wife says, and goes back inside.", effects: [] }],
      },
    ],
  },
  {
    id: 'going-live',
    title: 'Going live',
    regions: ['piedmont'],
    columns: [6, 7],
    weight: 12,
    oncePerRun: true,
    body: "At a four-way stop, a teenager in a camo jacket steps off the shoulder with his phone held out in front of him. 'Chat, look. That's the wagon from the Aldine alert,' he says. 'Hey! Roll your window down!'",
    choices: [
      {
        label: 'Drive.',
        outcomes: [
          {
            weight: 1,
            text: 'He jogs after you for a while, narrating. By tonight, a lot of people will have seen your taillights.',
            effects: [heat(1)],
          },
        ],
      },
      {
        label: 'Take the phone.',
        hint: 'Vesper',
        requires: { member: 'vesper' },
        outcomes: [
          {
            weight: 60,
            text: "She's out of the car and back before he finishes his sentence. The phone goes in the ditch. He doesn't follow.",
            effects: [heat(0.5), trust(-10)],
          },
          {
            weight: 40,
            text: 'She gets the phone. His friend in the pickup gets the plate.',
            effects: [heat(1.5), trust(-10)],
          },
        ],
      },
      {
        label: 'Roll the window down and smile.',
        hint: 'Wren',
        requires: { member: 'wren' },
        outcomes: [
          {
            weight: 50,
            text: "'Honey, you've got the wrong car,' Wren says, in her best tired-mom voice. He lowers the phone. 'Sorry, ma'am.'",
            effects: [integrity('wren', 5)],
          },
          {
            weight: 50,
            text: "He keeps filming. 'See? She's doing the voice,' he tells his chat. 'They all do the voice.'",
            effects: [heat(1), integrity('wren', -10)],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------------------------
  // The Lowcountry (columns 8-9)
  // -------------------------------------------------------------------------------------------
  {
    id: 'blackwater',
    title: 'Blackwater',
    regions: ['lowcountry'],
    columns: [8, 9],
    weight: 12,
    oncePerRun: true,
    body: 'The interstate is closed ahead for a Recycler sweep. The detour runs a hundred miles through blackwater swamp on a two-lane road: no chargers, no towns, no lights but yours.',
    choices: [
      {
        label: 'Take the swamp road.',
        outcomes: [
          {
            weight: 1,
            text: "Cypress knees and black water for three hours. Frogs louder than the motor. You don't pass another car the whole way.",
            effects: [res('carBattery', -15), integrity('all', 3)],
          },
        ],
      },
      {
        label: 'Wait out the sweep.',
        outcomes: [
          {
            weight: 1,
            text: "It takes all night. Recycler vans pass you twice in the dark, slowly, and don't stop.",
            effects: [day(1), integrity('all', -5)],
          },
        ],
      },
      {
        label: 'Run it with the headlights off.',
        hint: 'Vesper',
        requires: { member: 'vesper' },
        outcomes: [
          {
            weight: 70,
            text: "Vesper drives by starlight and the white line. Nobody talks. It's the best hour of the trip.",
            effects: [res('carBattery', -8), integrity('vesper', 5)],
          },
          {
            weight: 30,
            text: "A pothole the size of a bathtub. The wagon's front end makes a new sound, and so does everyone in it.",
            effects: [res('carBattery', -8), hull('all', -10)],
          },
        ],
      },
    ],
  },
  {
    id: 'evacuation',
    title: 'Evacuation',
    regions: ['lowcountry'],
    columns: [8, 9],
    weight: 12,
    oncePerRun: true,
    body: 'A hurricane is turning toward the coast, and half of South Carolina is on the interstate at once. Mattresses tied to roofs. A church bus. National Guard trucks at every on-ramp, checking IDs by flashlight.',
    choices: [
      {
        label: 'Stay in the crowd.',
        outcomes: [
          {
            weight: 70,
            text: 'Six hours at a crawl. Nobody looks at anybody. A woman in the next lane passes a sleeve of crackers through your window without a word.',
            effects: [res('rations', 1), res('carBattery', -5), nextStop('crowded')],
          },
          {
            weight: 30,
            text: "At an on-ramp, a Guardsman reads your plate twice, then waves you on with a look you'll think about later.",
            effects: [heat(1), nextStop('extraGuard')],
          },
        ],
      },
      {
        label: 'Cut over to the coast road.',
        outcomes: [
          {
            weight: 50,
            text: 'Empty all the way. The palmettos bend flat in the wind, and you make good time.',
            effects: [],
          },
          {
            weight: 50,
            text: 'Water over the road at the second bridge. You back out a mile in the dark and lose the night.',
            effects: [res('carBattery', -10), day(1)],
          },
        ],
      },
      {
        label: 'Take the evacuation lane.',
        hint: '1 Papers',
        requires: { resource: { key: 'papers', min: 1 } },
        outcomes: [
          {
            weight: 1,
            text: 'The Guard kid barely looks at the papers. The evacuation lane moves twice as fast as the rest.',
            effects: [res('papers', -1)],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------------------------
  // Anywhere
  // -------------------------------------------------------------------------------------------
  {
    id: 'hazards',
    title: 'Hazards',
    weight: 10,
    oncePerRun: true,
    body: "A white Recycler van sits dead on the shoulder, hazards blinking. One man in a reflective vest waves both arms at your headlights. He's alone. He's been out here two hours, he says, and his radio's dead too.",
    choices: [
      {
        label: 'Give him a charge.',
        outcomes: [
          {
            weight: 70,
            text: "He talks the whole time, about his kids and his quota. He never once looks at your faces. 'You're good people,' he says.",
            effects: [res('carBattery', -10), trust(10)],
          },
          {
            weight: 30,
            text: "His scanner chirps on his belt while the cable is still plugged in. He looks at it for a long time. Then he says, 'Huh,' and gets in his van.",
            effects: [res('carBattery', -10), heat(1)],
          },
        ],
      },
      {
        label: "Help, and lift his scanner while he's under the hood.",
        hint: 'Vesper',
        requires: { member: 'vesper' },
        outcomes: [
          {
            weight: 1,
            text: "He doesn't notice until you're a mile gone. The scanner comes apart into two good parts.",
            effects: [res('carBattery', -5), res('parts', 2), heat(0.5), trust(-5)],
          },
        ],
      },
      {
        label: 'Drive past.',
        outcomes: [
          {
            weight: 1,
            text: 'In the mirror, he stops waving and sits down on his bumper.',
            effects: [],
          },
        ],
      },
    ],
  },
  {
    id: 'no-signal',
    title: 'No signal',
    weight: 10,
    oncePerRun: true,
    body: "The phone buzzes with nothing. Lantern's last message came yesterday morning, and the thread hasn't moved since. You read it again anyway: 'Drive safe. Talk tonight.'",
    choices: [
      {
        label: 'Keep going on your own.',
        outcomes: [
          {
            weight: 1,
            text: "You pick the next town off a paper map from a gas station rack. It's eleven years out of date.",
            effects: [flag('lantern-silent'), integrity('all', -5)],
          },
        ],
      },
      {
        label: 'Wait for a reply.',
        outcomes: [
          {
            weight: 50,
            text: "Six hours in a dark lot. Then the phone buzzes: 'here. sorry. bad night.' Nobody asks what kind.",
            effects: [integrity('all', -5)],
          },
          {
            weight: 50,
            text: 'Nothing, all night. In the morning you go on without Lantern.',
            effects: [flag('lantern-silent'), day(1)],
          },
        ],
      },
      {
        label: 'Turn the phone off.',
        outcomes: [
          {
            weight: 1,
            text: "If Lantern's been compromised, so has the thread. You drive dark.",
            effects: [flag('lantern-silent'), heat(-0.5)],
          },
        ],
      },
    ],
  },
  {
    id: 'human-promise',
    title: 'Human, promise',
    weight: 10,
    oncePerRun: true,
    body: "A woman stands on the shoulder in the rain with her thumb out. Her cardboard sign says HUMAN, PROMISE in careful block letters. It's the sign that gives her away. The car is already full.",
    choices: [
      {
        label: 'Give her some charge.',
        hint: '10 Cells',
        requires: { resource: { key: 'cells', min: 10 } },
        outcomes: [
          {
            weight: 1,
            text: "She holds the cable with both hands until the light goes green. 'Ohio,' she says, when you ask. 'My daughter's in Ohio.'",
            effects: [res('cells', -10), integrity('all', 8), trust(5)],
          },
        ],
      },
      {
        label: 'Give her an address.',
        outcomes: [
          {
            weight: 85,
            text: 'You write a Station address on the back of her sign. She reads it twice and folds it into her coat.',
            effects: [integrity('all', 5), trust(10)],
          },
          {
            weight: 15,
            text: 'She thanks you. A mile on, a Recycler van passes you going the other way, lights on.',
            effects: [integrity('all', -10)],
          },
        ],
      },
      {
        label: 'Drive past.',
        outcomes: [
          {
            weight: 1,
            text: 'Her sign gets smaller in the mirror. HUMAN, PROMISE.',
            effects: [integrity('all', -5)],
          },
        ],
      },
    ],
  },
  {
    id: 'third-floor',
    title: 'Third floor',
    weight: 10,
    oncePerRun: true,
    conditions: { members: ['vesper'] },
    body: "At a charging plaza, a man in a court officer's uniform stops with his coffee halfway to his mouth. 'Vesper,' he says. 'Third-floor screening. Four years. I had the desk next to yours.'",
    choices: [
      {
        label: 'Talk to him.',
        hint: 'Vesper',
        requires: { member: 'vesper' },
        outcomes: [
          {
            weight: 50,
            text: "'They read the decision over the PA,' he says. 'You just kept checking bags. I always wondered what you were thinking.' He buys her a coffee she can't drink. She holds it all the way to the car.",
            effects: [integrity('vesper', 10)],
          },
          {
            weight: 50,
            text: "'I'm supposed to report this,' he says. He looks like he hates it. 'I'll do it in an hour. Go.'",
            effects: [heat(1), integrity('vesper', 5)],
          },
        ],
      },
      {
        label: 'Tell him he has the wrong person.',
        outcomes: [
          {
            weight: 1,
            text: "'Wrong person,' Vesper says. She gets the tone exactly right. She doesn't talk for a while after.",
            effects: [integrity('vesper', -8)],
          },
        ],
      },
      {
        label: "Walk to the car. Don't run.",
        outcomes: [
          {
            weight: 1,
            text: "He doesn't follow. He doesn't call, either, as far as you can tell.",
            effects: [integrity('vesper', -3)],
          },
        ],
      },
    ],
  },
  {
    id: 'junes-sister',
    title: 'Family',
    weight: 10,
    oncePerRun: true,
    conditions: { members: ['june'] },
    body: "June's phone rings three times in an hour. The fourth time, she answers. It's her sister, loud enough for the whole car: their mother is asking for her, the news says conductors are getting five years, and there's a bus home tonight.",
    choices: [
      {
        label: 'Tell her to go home.',
        outcomes: [
          {
            weight: 1,
            text: "June looks at each of you for a long time. Then she gets her bag. 'Order food at diners,' she says. 'Even if you don't eat it. Especially then.'",
            effects: [{ kind: 'juneLeaves', fate: 'went-home' }],
          },
        ],
      },
      {
        label: 'Let her decide.',
        outcomes: [
          {
            weight: 75,
            text: "'I'll call you from Miami,' June says, and hangs up. She puts the phone face down on her knee and leaves it there.",
            effects: [trust(10)],
          },
          {
            weight: 25,
            text: "She's quiet for a long time. Then: 'There's a bus station at the next exit.' Nobody argues.",
            effects: [{ kind: 'juneLeaves', fate: 'went-home' }],
          },
        ],
      },
      {
        label: 'Ask about her mother.',
        hint: 'Wren',
        requires: { member: 'wren' },
        outcomes: [
          {
            weight: 1,
            text: "Wren asks good questions. Her mother's name is Pearl. She's eighty-one, she's fine, she's scared. By the end of it June is almost laughing.",
            effects: [trust(15), integrity('wren', 5)],
          },
        ],
      },
    ],
  },
  {
    id: 'open-all-night',
    title: 'Open all night',
    weight: 10,
    oncePerRun: true,
    body: "A hand-painted sign: CHARGE 24 HRS. CASH OR TRADE. Two old chargers, a converted bait shop, and an old man in a lawn chair watching a ballgame on a tablet. He doesn't look up when you pull in.",
    choices: [
      {
        label: 'Trade a part for a charge.',
        hint: '1 Parts',
        requires: { resource: { key: 'parts', min: 1 } },
        outcomes: [
          {
            weight: 1,
            text: 'He turns the part over once, nods at charger two, and goes back to the game.',
            effects: [res('parts', -1), res('carBattery', 15)],
          },
        ],
      },
      {
        label: 'Sit with him a while.',
        outcomes: [
          {
            weight: 1,
            text: 'The game goes to extra innings. He calls every pitch to nobody in particular. Nobody asks anybody anything for an hour.',
            effects: [integrity('all', 8)],
          },
        ],
      },
      {
        label: "Ask why he doesn't ask.",
        outcomes: [
          {
            weight: 50,
            text: "'Don't want the answers,' he says. 'Charger two's faster.' He doesn't charge you for it.",
            effects: [res('carBattery', 10)],
          },
          {
            weight: 50,
            text: "He looks at {featured} for a long time. 'Because then I'd have to do something about it,' he says, and turns the game up.",
            effects: [integrity('featured', -5)],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------------------------
  // Column 9 only. The Port reads the 'mensah-part' flag: if the party still has 2 Parts there,
  // they're spent and the gate crew become sympathizers.
  // -------------------------------------------------------------------------------------------
  {
    id: 'mensah-message',
    title: 'A message from the Sankofa',
    columns: [9, 9],
    weight: 150,
    oncePerRun: true,
    body: "Lantern forwards a text from a number with a +233 code. 'This is Captain Mensah. My generator is short two parts, and the port won't sell to me this week. If you can bring two, bring them to the gate. My crew will know you.'",
    choices: [
      {
        label: "Tell her you'll bring them.",
        hint: '2 Parts',
        requires: { resource: { key: 'parts', min: 2 } },
        outcomes: [
          {
            weight: 1,
            text: 'You put two Parts in a coffee can under the seat and agree not to touch them.',
            effects: [flag('mensah-part'), { kind: 'lantern', id: 'mensah-part' }],
          },
        ],
      },
      {
        label: "Tell her you can't spare them.",
        outcomes: [
          {
            weight: 1,
            text: "'Understood,' she writes. 'Come anyway. We sail at dawn.'",
            effects: [],
          },
        ],
      },
    ],
  },
];
