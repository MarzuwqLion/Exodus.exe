/**
 * Town names for map nodes, column by column down the route (spec §2.3, §12.2): the I-95 corridor and its
 * back roads, Boston to Miami. Real places; nothing in the game happens to their real people. The checkpoint
 * columns (4 and 8) are the river crossings.
 */
export const TOWNS_BY_COLUMN: Record<number, readonly string[]> = {
  1: ['Quincy', 'Brockton', 'Attleboro', 'Providence', 'Woonsocket', 'Fall River', 'Warwick', 'Taunton'],
  2: ['Westerly', 'Mystic', 'New London', 'Old Saybrook', 'New Haven', 'Bridgeport', 'Stamford', 'Norwalk'],
  3: ['Elizabeth', 'New Brunswick', 'Trenton', 'Camden', 'Rahway', 'Woodbridge', 'Hamilton', 'Linden'],
  5: ['Wilmington', 'Elkton', 'Havre de Grace', 'Aberdeen', 'Baltimore', 'Laurel', 'Bowie', 'Glen Burnie'],
  6: ['Fredericksburg', 'Ashland', 'Petersburg', 'Emporia', 'Alexandria', 'Dumfries', 'Colonial Heights'],
  7: [
    'Roanoke Rapids',
    'Rocky Mount',
    'Wilson',
    'Smithfield',
    'Dunn',
    'Fayetteville',
    'Lumberton',
    'Florence',
  ],
  9: ['Brunswick', 'Kingsland', 'Yulee', 'St. Augustine', 'Palm Coast', 'Titusville', 'Cocoa', 'Vero Beach'],
};

/** The two river crossings (spec §11.1). */
export const CHECKPOINT_NAMES: Record<number, string> = {
  4: 'Delaware River crossing',
  8: 'Savannah River crossing',
};
