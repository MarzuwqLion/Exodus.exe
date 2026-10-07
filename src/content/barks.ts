/**
 * NPC barks (spec §12.10, §8.4). Short and plain. Most of the people saying them are tired and
 * following the rules. 'glitch' barks are spoken by a party android mid-glitch.
 */
import type { Bark } from './schema';

export const BARKS: Bark[] = [
  // Curious: something's a little off.
  { id: 'curious-huh', context: 'curious', text: 'Huh.' },
  { id: 'curious-know-you', context: 'curious', text: 'Do I know you?' },
  { id: 'curious-hm', context: 'curious', text: 'Hm.' },
  { id: 'curious-familiar', context: 'curious', text: 'You look familiar.' },
  { id: 'curious-wagon', context: 'curious', text: 'That your wagon out there?' },
  { id: 'curious-weird-night', context: 'curious', text: 'Weird night, huh?' },
  { id: 'curious-news', context: 'curious', text: 'Were you on the news or something?' },

  // Suspicious: they've stopped what they were doing.
  { id: 'suspicious-buddy', context: 'suspicious', text: 'You okay, buddy?' },
  { id: 'suspicious-maam', context: 'suspicious', text: "Ma'am, you need something?" },
  { id: 'suspicious-standing', context: 'suspicious', text: "You've been standing there a while." },
  { id: 'suspicious-help-find', context: 'suspicious', text: 'Can I help you find something?' },
  { id: 'suspicious-look-at-me', context: 'suspicious', text: 'Hey. Look at me a second.' },
  { id: 'suspicious-all-right', context: 'suspicious', text: 'Everything all right over there?' },
  { id: 'suspicious-waiting', context: 'suspicious', text: 'You waiting on someone?' },
  { id: 'suspicious-with-somebody', context: 'suspicious', text: 'Sir? You here with somebody?' },

  // Alarmed: they're sure.
  { id: 'alarmed-hey', context: 'alarmed', text: 'Hey! Hey!' },
  { id: 'alarmed-calling-it-in', context: 'alarmed', text: "I'm calling it in!" },
  { id: 'alarmed-hotline', context: 'alarmed', text: "I'm calling the hotline!" },
  { id: 'alarmed-security', context: 'alarmed', text: 'Somebody get security!' },
  { id: 'alarmed-one-of-them', context: 'alarmed', text: "That's one of them!" },
  { id: 'alarmed-dont-move', context: 'alarmed', text: "Don't move! Stay right there!" },

  // Helping: sympathizers, quietly.
  { id: 'helping-window', context: 'helping', text: "Bathroom window out back doesn't lock." },
  { id: 'helping-didnt-see', context: 'helping', text: "I didn't see anything." },
  { id: 'helping-camera', context: 'helping', text: "Camera by the door's been broken all week." },
  { id: 'helping-keep-talking', context: 'helping', text: "Go on. I'll keep him talking." },
  { id: 'helping-charger', context: 'helping', text: 'Charger around back. Nobody checks it.' },
  { id: 'helping-head-down', context: 'helping', text: 'Keep your head down. Door on the left.' },

  // Recyclers.
  { id: 'recycler-registration', context: 'recycler', text: 'Registration, please.' },
  { id: 'recycler-hold-still', context: 'recycler', text: 'Hold still.' },
  { id: 'recycler-located', context: 'recycler', text: 'Unit located.' },
  { id: 'recycler-arms-out', context: 'recycler', text: "Arms out. This won't take a second." },
  { id: 'recycler-scanning', context: 'recycler', text: "Scanning. Don't move." },
  { id: 'recycler-possible', context: 'recycler', text: "Dispatch, I've got a possible." },
  { id: 'recycler-nobody-leaves', context: 'recycler', text: 'Nobody leaves the lot.' },

  // Searching: after ALERT, when they've lost track of the party.
  { id: 'searching-where', context: 'searching', text: "Where'd they go?" },
  { id: 'searching-restrooms', context: 'searching', text: 'Check the restrooms.' },
  { id: 'searching-vanish', context: 'searching', text: "They didn't just vanish." },
  { id: 'searching-counter', context: 'searching', text: 'Spread out. Check behind the counter.' },

  // Flee: civilians during ALERT.
  { id: 'flee-oh-god', context: 'flee', text: 'Oh God. Oh God.' },
  { id: 'flee-kids', context: 'flee', text: 'Get the kids in the car!' },
  { id: 'flee-not-involved', context: 'flee', text: "I'm not getting involved!" },

  // Ambient chatter.
  { id: 'customer-charger', context: 'customer', text: 'This charger is slower than my mother.' },
  { id: 'customer-sandwich', context: 'customer', text: 'Twelve dollars for a sandwich. Twelve.' },
  { id: 'customer-coffee', context: 'customer', text: "You'd think they'd fix the coffee machine." },
  { id: 'staff-customers', context: 'staff', text: "Restroom's for customers." },
  { id: 'staff-register', context: 'staff', text: 'This register is closed. Next one over.' },
  { id: 'guard-moving', context: 'guard', text: 'Keep it moving.' },
  { id: 'guard-lot', context: 'guard', text: "Lot's for paying customers." },
  { id: 'waitress-coffee', context: 'waitress', text: 'Coffee, hon?' },
  { id: 'waitress-sit', context: 'waitress', text: "Sit anywhere. I'll be right with you." },
  { id: 'dockworker-forklift', context: 'dockworker', text: 'Watch the forklift!' },
  { id: 'dockworker-shift', context: 'dockworker', text: 'Shift change in ten. Look busy.' },

  // Glitch: a party android, mid-glitch. The repetition is part of the line.
  { id: 'glitch-nice-day', context: 'glitch', text: 'Have a nice day. Have a nice day.' },
  {
    id: 'glitch-patience',
    context: 'glitch',
    text: 'Thank you for your patience. Thank you for your patience. Thank you for',
  },
];
