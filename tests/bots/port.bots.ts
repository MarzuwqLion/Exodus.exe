/**
 * Port bot bands (spec §17.2): a cautious party (crosses the yard carefully, spends Papers at the gate) gets
 * at least one android aboard in at least 70% of attempts at Heat 0 and at most 40% at Heat 3. 100 seeded
 * attempts each, solo and two-player. (Heat 3 is in port3.bots.ts so the two run side by side.)
 */
import { describe } from 'vitest';
import { portBand } from './portband';

describe('Port bot bands, Heat 0', () => {
  portBand(0, 1);
  portBand(0, 2);
});
