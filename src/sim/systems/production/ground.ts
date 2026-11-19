import { distance } from '../../core/motion';
import { Inventory } from './inventory';

/**
 * Belongings left on the ground: what a person carried when she died far from her camp. They stay
 * where she fell (food rots there like any open heap) until someone passing by finds them and takes
 * what she can carry.
 */
export interface GroundPile {
  /** Where the belongings lie (decimal tiles) and the tile. */
  x: number;
  y: number;
  tile: number;
  items: Inventory;
  /** Whose they were, and the journal event of that death (cause of the finding). */
  dead: number;
  deathEvent: number;
}

/** Index of the nearest pile within `radius` tiles of (x, y), or -1. */
export function nearestGroundPile(ground: readonly GroundPile[], x: number, y: number, radius: number): number {
  let best = -1;
  let bestDistance = radius;
  for (let k = 0; k < ground.length; k++) {
    const pile = ground[k]!;
    const d = distance(pile.x, pile.y, x, y);
    if (d <= bestDistance) {
      best = k;
      bestDistance = d;
    }
  }
  return best;
}
