/**
 * Lantern, the network's coordinator (spec §12.8), plus first-time tips and tutorial lines (§12.9).
 * Short, like real texts. No signatures.
 *
 * Keeper-specific Station messages are gated on the flag 'station-<keeper id>' (keeper ids are in
 * conversations.ts); the generic message covers every other case.
 */
import type { LanternMessage, Tip, TutorialLine } from './schema';

export const LANTERN_MESSAGES: LanternMessage[] = [
  // Departure and the road.
  { id: 'departure', trigger: 'departure', text: "Leave tonight. Take 95 south. Don't stop in Providence." },
  {
    id: 'leg-start-easy',
    trigger: 'leg-start',
    text: "First few days are the easy ones. Don't get used to it.",
    conditions: { maxDay: 3 },
  },
  {
    id: 'leg-start-quiet',
    trigger: 'leg-start',
    text: "Next town's quiet tonight. Get what you need and get out.",
  },
  {
    id: 'leg-start-patrols',
    trigger: 'leg-start',
    text: 'They added patrols this week. Shorter stops. Take less, leave sooner.',
    conditions: { minDay: 7 },
  },
  {
    id: 'walking',
    trigger: 'walking',
    text: "On foot is fine. Keep to the tree line and walk like you're late for something.",
  },
  {
    id: 'low-battery',
    trigger: 'low-battery',
    text: "Someone's running low. Charge before you do anything brave.",
  },

  // Regions.
  {
    id: 'region-corridor',
    trigger: 'region-corridor',
    text: "Jersey to Baltimore is cameras the whole way. Assume you're being filmed. Be boring.",
  },
  {
    id: 'region-piedmont',
    trigger: 'region-piedmont',
    text: 'Small towns from here on. Everybody knows everybody. Wave back.',
  },
  {
    id: 'region-lowcountry',
    trigger: 'region-lowcountry',
    text: 'Heat and storms from here to Miami. Rain is on your side. Use it.',
  },

  // Checkpoints.
  {
    id: 'before-checkpoint-1',
    trigger: 'before-checkpoint-1',
    text: 'Delaware crossing is scanning every car. Papers help. Breathing like a person helps more.',
  },
  {
    id: 'before-checkpoint-2',
    trigger: 'before-checkpoint-2',
    text: "Savannah crossing next. More guards than Delaware, and they're bored. Bored is worse.",
  },

  // Stations.
  {
    id: 'station-dolores',
    trigger: 'station-revealed',
    text: 'Dolores has the porch light on. Go around back.',
    conditions: { flags: ['station-dolores'] },
  },
  {
    id: 'station-frank',
    trigger: 'station-revealed',
    text: "Frank's plow is in the driveway. That means come in.",
    conditions: { flags: ['station-frank'] },
  },
  {
    id: 'station-sunil',
    trigger: 'station-revealed',
    text: 'Pharmacy light is on in Edison. Back stairs, not the front door.',
    conditions: { flags: ['station-sunil'] },
  },
  {
    id: 'station-marcus',
    trigger: 'station-revealed',
    text: "Coach left the kitchen door unlocked. Wipe your feet. He'll know.",
    conditions: { flags: ['station-marcus'] },
  },
  {
    id: 'station-bev-and-hector',
    trigger: 'station-revealed',
    text: 'Feed store in Siler City. Pull around to the loading dock. Ignore the dog.',
    conditions: { flags: ['station-bev-and-hector'] },
  },
  {
    id: 'station-bernadette',
    trigger: 'station-revealed',
    text: 'Church kitchen in Savannah. Side door. Bernadette has supper on, whether or not you eat.',
    conditions: { flags: ['station-bernadette'] },
  },
  {
    id: 'station-generic',
    trigger: 'station-revealed',
    text: "There's a light on for you up ahead. Only you can see it.",
  },
  {
    id: 'compromised',
    trigger: 'compromised',
    text: "Don't stay. There's a van outside. Get the bag from the back room and go quietly.",
  },

  // Pressure.
  {
    id: 'high-heat',
    trigger: 'high-heat',
    text: 'Your faces are on the boards in two states now. Stay off the main roads if you can.',
  },
  { id: 'alert', trigger: 'alert', text: "They're onto you. Get to the car. Don't run until you have to." },
  { id: 'slack-zero', trigger: 'slack-zero', text: 'No spare days left. Every stop has to count from here.' },
  {
    id: 'day-12',
    trigger: 'day-12',
    text: "Captain Mensah sails at dawn on the 14th. She doesn't wait. Nobody blames her.",
  },

  // People.
  {
    id: 'june-joined',
    trigger: 'june-joined',
    text: "June's one of ours. Eleven years on a ward. Listen to her about kiosks.",
    conditions: { members: ['june'] },
  },
  {
    id: 'member-lost',
    trigger: 'member-lost',
    text: "I heard. Keep going. You can stop when you're on the water.",
  },
  {
    id: 'lantern-silent',
    trigger: 'lantern-silent',
    text: 'sorry. we lost a house. everyone got out. still here.',
  },

  // The Port.
  {
    id: 'mensah-part',
    trigger: 'mensah-part',
    text: 'Mensah says thank you. Bring both parts to the gate. Her crew will know the car.',
  },
  {
    id: 'port-approach',
    trigger: 'port-approach',
    text: 'Last leg. The yard opens at 4:50. Be inside before the sky gets light.',
  },
  {
    id: 'port-arrival',
    trigger: 'port-arrival',
    text: "Berth 7. Watch for the amber light on the gangway. She's holding it for you.",
  },
];

/** One Lantern line each, shown once, the first time it happens (§12.9). */
export const TIPS: Tip[] = [
  { id: 'first-checkpoint', text: 'Answer like a person. People take a second.' },
  { id: 'first-scan', text: 'Breathe. Not too perfectly.' },
  { id: 'first-station', text: "You're safe here. Rest. Let them fix you up." },
  {
    id: 'first-alert',
    text: 'They saw you. Break line of sight. Lose them long enough and they start guessing.',
  },
  { id: 'first-glitch', text: 'That was a glitch. It happens when Integrity runs low. Rest helps.' },
  { id: 'first-sympathizer', text: "The amber diamond is a friend. You won't know who until they show you." },
  {
    id: 'first-integrity',
    text: "Someone's Integrity is slipping. Stations and long rests help. So does talking.",
  },
];

/** Night one, a Boston charging depot in the snow (§12.9). */
export const TUTORIAL_LINES: TutorialLine[] = [
  { step: 'walk', text: "Walk. Don't march.", prompt: 'Walk' },
  { step: 'blend', text: "Someone's noticing you. Give them a reason not to.", prompt: 'Check phone' },
  {
    step: 'search',
    text: "Shelves are fair game. The locker in back isn't. Wait for the clerk's smoke break.",
    prompt: 'Search',
  },
  {
    step: 'charge',
    text: 'Plug in. Use the Papers. Then give your hands something to do while it charges.',
    prompt: 'Plug in',
  },
  { step: 'chat', text: 'Two people talking is the most normal thing in the world. Talk.', prompt: 'Chat' },
  { step: 'leave', text: 'Time to go.', prompt: 'Get in the car' },
  { step: 'retry', text: "That's how it goes wrong. Try again.", prompt: 'Try again' },
];
