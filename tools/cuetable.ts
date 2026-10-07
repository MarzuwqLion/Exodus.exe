/** Prints the README's audio cue table from src/audio/cues.ts: `npx tsx tools/cuetable.ts`. */
import { ALL_CUES, CUE_DESCRIPTIONS, cueKind } from '../src/audio/cues';

const kind = { sfx: 'Sound', loop: 'Loop', music: 'Music' } as const;
console.log('| Cue | Kind | What it is |');
console.log('|---|---|---|');
for (const c of ALL_CUES) console.log(`| \`${c}\` | ${kind[cueKind(c)]} | ${CUE_DESCRIPTIONS[c]} |`);
