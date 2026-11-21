import { State } from './animal-store';
import { fleeFrom } from './behavior';
import type { FaunaSystem } from './fauna-system';
import { humans } from './human-prey';

import { distance as realDistance } from '../../core/motion';

/**
 * Game and humans. At every step, each animal near a person may notice her: a hunter within the
 * species' wariness distance (scaled by the animal's own wariness), a passer-by only much closer.
 * The nearer the person, the likelier the animal notices; once it has, it sprints away.
 * Predators do not fear humans yet. The loop goes over the people (few) rather than the animals.
 */
export function scareGame(fauna: FaunaSystem): void {
  const view = humans(fauna);
  if (!view || fauna.maxHumanFleeTiles <= 0) return;
  const { store, params } = fauna;
  const fleeTiles = fauna.humanFleeTiles;
  const reachMax = fauna.maxHumanFleeTiles * (1 + params.humanFear.warinessSpread);
  // A passer-by is only noticed close by: only the animals near her are looked at.
  const hunterReach = Math.ceil(reachMax);
  const passerReach = Math.ceil(reachMax * params.humanFear.calmShare);
  view.forEachAlive((person) => {
    const px = view.x(person);
    const py = view.y(person);
    const hunting = view.hunting(person);
    const look = hunting ? hunterReach : passerReach;
    fauna.grid.forEachNear(px, py, look, (slot) => {
      const distance = realDistance(store.px[slot]!, store.py[slot]!, px, py);
      // Domestic animals are used to people: they do not run from them.
      if (distance >= look || store.state[slot] === State.Flee || store.ownerCamp[slot]! >= 0) return;
      const tiles = fleeTiles[store.species[slot]!]!;
      if (tiles <= 0) return;
      const radius = tiles * store.wariness[slot]!;
      const reach = hunting ? radius : radius * params.humanFear.calmShare;
      if (distance >= reach || fauna.rng.nextFloat() >= 1 - distance / reach) return;
      fleeFrom(fauna, slot, px, py);
      store.fleesHuman[slot] = 1;
    });
  });
}
