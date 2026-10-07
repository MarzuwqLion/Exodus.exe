/**
 * The checkpoint compound (spec §11.4): when a checkpoint goes bust, the party bails out of the car and the
 * compound becomes a real-time stop. Someone reaches the barrier control booth ('$', point 'booth') and holds A
 * for 3 s to raise the gate; then everyone gets back in the car and it crashes through.
 */
import type { LayoutDef } from '../../sim/layout';
import { GridBuilder } from './builder';

function compound(): string[] {
  const g = new GridBuilder(40, 22, '"');
  // The highway running south through the checkpoint.
  g.rect(14, 0, 25, 21, ',');
  g.vline(13, 0, 21, '_');
  g.vline(26, 0, 21, '_');
  // Barrier across the road, booths on both sides, scanner arches over the lanes.
  g.hline(12, 14, 25, '&');
  g.set(28, 12, '$');
  g.rect(27, 11, 29, 13, ',');
  g.set(28, 12, '$');
  g.set(11, 12, 'G');
  g.set(30, 14, 'G');
  g.text(16, 14, '!');
  g.text(23, 14, '!');
  // Inspection lot off to the east with the Recycler van and parked cars.
  g.rect(27, 15, 37, 20, ',');
  g.text(31, 16, 'yy');
  g.text(34, 18, 'yy');
  // Concrete barriers funnel traffic.
  g.vline(12, 5, 10, '%');
  g.vline(27, 4, 9, '%');
  // The party's car and the cars ahead in the queue (crates stand in for parked cars' collision).
  g.rect(17, 7, 22, 10, 'X');
  return g.rows();
}

export const CHECKPOINT: LayoutDef = {
  id: 'checkpoint',
  kind: 'checkpoint',
  variant: 0,
  name: 'Checkpoint',
  grid: compound(),
  points: {
    booth: [28, 11],
    enter: [19, 21],
    g1: [24, 14],
    g2: [15, 15],
    g3: [29, 17],
    g4: [20, 5],
  },
  routes: { patrol: ['g1', 'g2', 'g3', 'g4'] },
  // The checkpoint guards are on site; the Recyclers come by van like any ALERT (§8.6).
  npcs: [{ role: 'guard', count: [2, 2], at: 'g1', route: 'patrol' }],
  vanEntry: [36, 20],
  car: { x: 19, y: 8, facing: 'south' },
};
