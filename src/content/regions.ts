/** Regions along the route (spec §2.3, §4.7): which columns they cover and their weather. */
import type { Region, Weather } from '../core/types';

export const REGION_WEATHER: Record<Region, Weather[]> = {
  newengland: ['snow', 'sleet', 'clearcold'],
  corridor: ['rain', 'drizzle', 'smog'],
  piedmont: ['fog', 'drizzle', 'clear'],
  lowcountry: ['heavyrain', 'storm', 'humid'],
};

/** The region of a map column: New England 0–2, the Corridor 3–5, the Piedmont 6–7, the Lowcountry 8–10. */
export function regionOfColumn(column: number): Region {
  if (column <= 2) return 'newengland';
  if (column <= 5) return 'corridor';
  if (column <= 7) return 'piedmont';
  return 'lowcountry';
}

export const REGION_NAMES: Record<Region, string> = {
  newengland: 'New England',
  corridor: 'The Corridor',
  piedmont: 'The Piedmont',
  lowcountry: 'The Lowcountry',
};
