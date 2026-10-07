/** Depot bot bands (spec §17.2): both depot layouts, all four regions. */
import { describe } from 'vitest';
import { STOP_LAYOUTS } from '../../src/content/layouts';
import { stopBands } from './bands';

describe('depot bot bands', () => stopBands('depot', STOP_LAYOUTS.depot, true));
