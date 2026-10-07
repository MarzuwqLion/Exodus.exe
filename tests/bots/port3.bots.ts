/** Port bot bands at Heat 3 (spec §17.2): at most 40% get an android aboard. See port.bots.ts. */
import { describe } from 'vitest';
import { portBand } from './portband';

describe('Port bot bands, Heat 3', () => {
  portBand(3, 1);
  portBand(3, 2);
});
