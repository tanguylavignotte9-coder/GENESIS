import { describeLocation } from '../world/places';
import type { Camp } from './camp';
import type { IndividualsSystem } from './individuals-system';

export const CAMP_MOVED = 'humans.campMoved';

const DIRECTIONS = ['l’est', 'le sud-est', 'le sud', 'le sud-ouest', 'l’ouest', 'le nord-ouest', 'le nord', 'le nord-est'];
const EIGHTH = Math.PI / 4;

/** "le nord-est" for a move of (dx, dy) tiles (y grows toward the south). */
export function direction(dx: number, dy: number): string {
  const angle = Math.atan2(dy, dx);
  return DIRECTIONS[(Math.round(angle / EIGHTH) + DIRECTIONS.length) % DIRECTIONS.length]!;
}

/** A dry tile at most `max` steps from fresh water, found by walking toward the water (-1 if none). */
export function nearWater(sys: IndividualsSystem, start: number, max: number): number {
  const path = sys.fauna.waterPath;
  let at = start;
  for (let step = 0; step <= max * 4; step++) {
    let distance = 0;
    let probe = at;
    while (distance <= max && probe >= 0 && sys.world.water[probe] === 0) {
      const next = path[probe]!;
      if (next < 0 || next === probe) break;
      probe = next;
      distance++;
    }
    if (sys.world.water[at] === 0 && sys.terrain.walkable(at) && probe >= 0 && sys.world.water[probe] !== 0 && distance <= max) return at;
    const next = path[at]!;
    if (next < 0 || next === at) return -1;
    at = next;
  }
  return -1;
}

/**
 * Moves the camp to `destination`, as the tribe's leaders decided (groups system, step 9): the
 * journal tells it with `text` and its causes, the buildings left behind are abandoned, the people
 * and what they can carry of the stock go. Returns the journal event.
 */
export function moveCamp(sys: IndividualsSystem, camp: Camp, destination: number, day: number, tick: number, text: string, causes: readonly number[], actors: readonly number[]): number {
  const before = camp.center;
  const x = destination % sys.size;
  const y = Math.floor(destination / sys.size);
  const label = describeLocation(sys.world.landmasses, sys.world.landmassNames, x, y, sys.size);
  camp.movedEvent = sys.journal.publish({
    tick,
    type: CAMP_MOVED,
    text,
    place: { x, y, label },
    actors: actors.map((id) => ({ kind: 'human', id })),
    causes: [...new Set(causes)].filter((id) => id >= 0 && sys.journal.get(id) !== undefined),
    details: { camp: camp.id, from: before, to: destination },
  });
  camp.hungerDeaths.length = 0;
  camp.relocate(destination, sys.terrain);
  camp.settledDay = day;
  const { people } = sys;
  let movers = 0;
  for (const p of sys.campMembers(camp.id)) {
    movers++;
    people.forageDistance[p] = 0;
    people.farFood[p] = -1;
    people.target[p] = -1;
    people.paths[p] = null;
    people.nextThink[p] = sys.step;
    sys.production.endJob(p);
  }
  sys.production.relocateCamp(camp.id, destination, movers, camp.movedEvent);
  return camp.movedEvent;
}
