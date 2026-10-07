/** Gas Station bot bands (spec §17.2, M4 exit): both gas station layouts, all four regions. */
import { describe } from 'vitest';
import { STOP_LAYOUTS } from '../../src/content/layouts';
import { stopBands } from './bands';

describe('gas station bot bands', () => stopBands('gas', STOP_LAYOUTS.gas, false));
