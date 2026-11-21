import type { BodyView } from '../../core/interactions';
import { State } from './animal-store';
import { fleeFrom } from './behavior';
import type { FaunaSystem } from './fauna-system';
import { humans } from './human-prey';

import { distance as realDistance } from '../../core/motion';

/**
 * Wild animals and humans. At every step, each wild animal near a person may notice her and run
 * away: game at the flight distance of its species (scaled by its own wariness), whether the person
 * hunts or only walks by; the nearer she is, the likelier it notices. Predators (wolves, lions, bears)
 * keep away from people too, all the more from a group or a camp, unless they are starving: then only
 * someone who drives them off (shouts, fire, weapons) makes them run. Domestic animals never flee.
 * The loop goes over the people (few) rather than the animals.
 */
export function scareGame(fauna: FaunaSystem): void {
  const view = humans(fauna);
  if (!view || fauna.maxHumanFleeTiles <= 0) return;
  const { store, params } = fauna;
  const fear = params.humanFear;
  const fleeTiles = fauna.humanFleeTiles;
  const crowdBoost = 1 + fear.crowdShare * (fear.crowdMax - 1);
  const look = Math.ceil(fauna.maxHumanFleeTiles * (1 + fear.warinessSpread) * Math.max(crowdBoost, fear.driveOffFactor));
  view.forEachAlive((person) => {
    const px = view.x(person);
    const py = view.y(person);
    const scaring = view.scaring?.(person) === true;
    const taming = view.taming?.(person) === true;
    let crowd = -1;
    fauna.grid.forEachNear(px, py, look, (slot) => {
      const distance = realDistance(store.px[slot]!, store.py[slot]!, px, py);
      // Domestic animals are used to people: they do not run from them.
      if (distance >= look || store.state[slot] === State.Flee || store.ownerCamp[slot]! >= 0) return;
      const species = store.species[slot]!;
      const tiles = fleeTiles[species]!;
      if (tiles <= 0) return;
      let reach = tiles * store.wariness[slot]!;
      if (fauna.canHuntHumans[species] === 1) {
        // A starving predator no longer keeps away, unless someone drives it off.
        const starving = store.hunger[slot]! >= params.humanPrey.minHunger;
        if (starving && !scaring) return;
        if (!starving) {
          if (crowd < 0) crowd = crowdAround(view, person, fear.crowdTiles, fear.crowdMax);
          reach *= 1 + fear.crowdShare * (crowd - 1);
        }
      }
      if (scaring) reach *= fear.driveOffFactor;
      // A herder creeping up slowly, without a weapon, to capture it: noticed only much closer.
      else if (taming) reach *= fear.tamerShare;
      if (distance >= reach || fauna.rng.nextFloat() >= 1 - distance / reach) return;
      fleeFrom(fauna, slot, px, py);
      store.fleesHuman[slot] = 1;
    });
  });
}

/** Number of people (the person included) within `radius` of a person, at most `max`. */
function crowdAround(view: BodyView, person: number, radius: number, max: number): number {
  const x = view.x(person);
  const y = view.y(person);
  let count = 0;
  view.forEachNear(x, y, radius, (other) => {
    if (count < max && view.alive(other) && realDistance(x, y, view.x(other), view.y(other)) <= radius) count++;
  });
  return Math.max(1, count);
}
