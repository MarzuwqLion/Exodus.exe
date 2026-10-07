/**
 * Checkpoint interrogation bank (spec §11.2). Any android may be asked any question, so answers never
 * name a party member. Robotic: precise, correct, inhuman. Human: imperfect, casual, specific.
 * Wrong: says something suspicious. Soothing (Wren only, some questions): a warm deflection.
 */
import type { Question } from './schema';

export const QUESTIONS: Question[] = [
  // The four examples from §11.2, verbatim.
  {
    id: 'where-headed',
    prompt: 'Where you headed?',
    robotic:
      'Miami, Florida. One thousand one hundred sixty miles. Estimated arrival in seventeen hours, twelve minutes.',
    human: 'Down to Miami. My sister just had a baby. First one.',
    wrong: "Somewhere they can't find us.",
  },
  {
    id: 'breakfast',
    prompt: "What'd you have for breakfast?",
    robotic: 'Two eggs, one slice of wheat toast, eight ounces of orange juice.',
    human: "Gas station coffee. Don't judge me.",
    wrong: "I don't require— I had eggs.",
  },
  {
    id: 'nervous',
    prompt: 'You seem nervous.',
    robotic: 'My heart rate is within normal parameters.',
    human: "It's a checkpoint, man. Everybody's nervous.",
    wrong: '...',
    wrongIsSilence: true,
    soothing: "A little. You've got a kind face, though. That helps.",
  },
  {
    id: 'whose-car',
    prompt: 'Whose car is this?',
    robotic: 'It is registered to Daniel Okafor of Quincy, Massachusetts.',
    human: "My cousin's. Don't ask about the door.",
    wrong: 'We found it.',
  },

  // The rest of the bank.
  {
    id: 'coming-from',
    prompt: 'Where are you coming from?',
    robotic: 'Boston, Massachusetts. Via Interstate 95 southbound, without deviation.',
    human: "Boston. Don't remind me. The traffic.",
    wrong: "Nowhere. We weren't anywhere.",
  },
  {
    id: 'driving-long',
    prompt: 'How long you been driving?',
    robotic: 'Six hours and fourteen minutes, excluding stops.',
    human: 'Since lunch? Feels like since Tuesday.',
    wrong: "We don't need to stop.",
    soothing: "Too long. You've been standing out here longer, though. They give you a break tonight?",
  },
  {
    id: 'bags',
    prompt: "What's in the bags?",
    robotic: 'Clothing, toiletries, and one phone charger. Combined weight, forty-one pounds.',
    human: "Laundry. Clean-ish. I wouldn't open it.",
    wrong: 'Spare parts. For the car. Mostly for the car.',
  },
  {
    id: 'work',
    prompt: 'What do you do for work?',
    robotic: 'I am employed full-time. My performance reviews are excellent.',
    human: 'Warehouse, nights. Ask me how my back is.',
    wrong: 'I used to work. Before the ruling.',
    soothing: 'Whatever pays. Same as you, I bet. Long shift?',
  },
  {
    id: 'id-on-you',
    prompt: 'You got ID on you?',
    robotic: 'Yes. It is in my left inside pocket, eleven centimeters from my hand.',
    human: "Somewhere. Hang on, it's under the gum wrappers.",
    wrong: 'Do I need one?',
  },
  {
    id: 'anybody-else',
    prompt: 'Anybody else in the car I should know about?',
    robotic: 'There are no additional occupants. All passengers are visible to you.',
    human: "Just us. And whatever's growing under the back seat.",
    wrong: "Nobody's hiding, if that's what you mean.",
    soothing: 'Just family. You know how it is, all of us crammed in like that.',
  },
  {
    id: 'scratch',
    prompt: "How'd you get that scratch?",
    robotic: 'Contact with a door frame at approximately four kilometers per hour.',
    human: 'Cabinet door. It wins every time.',
    wrong: "That's not damage. It's nothing.",
  },
  {
    id: 'slept',
    prompt: "When's the last time you slept?",
    robotic: 'I have not required rest in the past twenty-four hours.',
    human: 'Define slept. I closed my eyes at a rest stop.',
    wrong: "I don't. I mean, last night. I slept last night.",
  },
  {
    id: 'from-around-here',
    prompt: 'You from around here?',
    robotic: 'No. My residence is in Massachusetts. I am in transit.',
    human: "No, but my cousin's ex lives around here somewhere. Everybody's does.",
    wrong: "We're just passing through. We'll be gone by morning. We won't stay.",
    soothing: "No, but I like it. Did you grow up here? You've got the accent.",
  },
  {
    id: 'todays-date',
    prompt: "What's today's date?",
    robotic: 'It is day two hundred eighty-seven of the calendar year.',
    human: "Tuesday? It's been a long week. Is it Tuesday?",
    wrong: 'Since the window closed? I stopped counting.',
  },
  {
    id: 'smell',
    prompt: "What's that smell?",
    robotic: 'Ozone, and french fries approximately four days old.',
    human: "That's the fries. I'm sorry. We keep meaning to.",
    wrong: "We don't smell like anything.",
  },
  {
    id: 'out-late',
    prompt: "Any reason you're out this late?",
    robotic: 'Traffic density is forty percent lower at night.',
    human: 'Motels are cheaper if you check in after midnight. Supposedly.',
    wrong: "It's safer in the dark.",
    soothing: "Same reason as you, probably. Somebody's got to be.",
  },
  {
    id: 'penalty',
    prompt: 'You know the penalty for harboring an unregistered unit?',
    robotic: 'Yes. Up to five years in federal prison and a fine of fifty thousand dollars.',
    human: "Not exactly. Bad, I'm guessing.",
    wrong: 'What if they were never property?',
  },
  {
    id: 'blink',
    prompt: 'Look at me. Blink for me.',
    robotic: 'Blinking now. Interval, four seconds.',
    human: "Uh, okay? Is this a new thing? Okay. I'm blinking.",
    wrong: 'Why would I need to blink?',
  },
  {
    id: 'mothers-name',
    prompt: "What's your mother's name?",
    robotic: 'Margaret Anne Sullivan. Born March third, nineteen ninety.',
    human: "Maggie. She'd be thrilled you asked. Nobody asks.",
    wrong: "I don't have one.",
    soothing: "Ruth. She'd like you. She likes anybody who works nights.",
  },
  {
    id: 'registered-units',
    prompt: 'Got any registered units with you?',
    robotic: 'No units are present in this vehicle.',
    human: 'God, no. You know what those cost?',
    wrong: 'Not registered, no.',
  },
  {
    id: 'radio',
    prompt: 'What were you listening to just now?',
    robotic: 'An Aldine public service announcement, followed by a weather report.',
    human: "Some call-in show. A guy's been yelling about his neighbor's fence for an hour.",
    wrong: 'Nothing. We turned it off when the hotline ad came on.',
  },
  {
    id: 'about-yourself',
    prompt: 'Tell me something about yourself.',
    robotic: 'I am thirty-four years old. I am five feet nine inches tall. I enjoy music.',
    human: "I'm terrible at parallel parking. That's pretty much it.",
    wrong: "There's nothing to tell. I'm normal. I'm a normal person.",
    soothing: "I'm tired, I'm hungry, and I miss my bed. How about you? Long night?",
  },
  {
    id: 'something-on-your-face',
    prompt: "You've got something on your face.",
    robotic: 'Thank you. I will remove it.',
    human: "Oh no. Is it ketchup? Please say it's ketchup.",
    wrong: 'Where? Is it showing?',
  },
];
