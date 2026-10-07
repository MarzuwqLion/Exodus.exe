/** Diner bot bands (spec §17.2, M4 exit): both diner layouts, all four regions. */
import { describe } from 'vitest';
import { STOP_LAYOUTS } from '../../src/content/layouts';
import { stopBands } from './bands';

describe('diner bot bands', () => stopBands('diner', STOP_LAYOUTS.diner, false));
