import { fillTemplate } from '../../core/text';
import { describeLocation } from '../world/places';
import type { Camp } from './camp';
import type { IndividualsSystem } from './individuals-system';

export const CAMP_MOVED = 'humans.campMoved';

const DIRECTIONS = ['l’est', 'le sud-est', 'le sud', 'le sud-ouest', 'l’ouest', 'le nord-ouest', 'le nord', 'le nord-est'];
const EIGHTH = Math.PI / 4;
/** At most this many deaths are linked as causes of a move (the journal stays readable). */
const MAX_CAUSES = 3;

/** "le nord-est" for a move of (dx, dy) tiles (y grows toward the south). */
function direction(dx: number, dy: number): string {
  const angle = Math.atan2(dy, dx);
  return DIRECTIONS[(Math.round(angle / EIGHTH) + DIRECTIONS.length) % DIRECTIONS.length]!;
}

/**
 * Moving the camp, a simple consensus (to be taken over by the groups system, step 9): each adult
 * who must go further and further to find food wants to leave toward a place where food was found;
 * when enough adults want it, the tribe goes to the proposal closest to the others', near water.
 */
export function considerMoving(sys: IndividualsSystem, camp: Camp, day: number, tick: number): void {
  const { people, params } = sys;
  const rules = params.campMove;
  while (camp.hungerDeaths.length > 0 && day - camp.hungerDeaths[0]!.day > rules.minDaysBetweenMoves) camp.hungerDeaths.shift();
  if (day - camp.settledDay < rules.minDaysBetweenMoves) return;
  const { first, last } = sys.campMembers(camp.id);
  const curiosity = params.traits.findIndex((trait) => trait.id === 'curiosity');
  const adults: number[] = [];
  const proposals: number[] = [];
  for (let p = first; p < last; p++) {
    if (people.alive[p] === 0 || people.ageYears[p]! < params.tribe.adultAge[0]) continue;
    adults.push(p);
    const eager = curiosity >= 0 ? 2 * people.trait(p, curiosity) - 1 : 0;
    const threshold = rules.forageFarTiles * (1 - rules.curiosityEffect * eager);
    if (people.forageDistance[p]! > threshold && people.farFood[p]! >= 0) proposals.push(people.farFood[p]!);
  }
  if (adults.length < rules.minAdults || proposals.length < rules.consensusShare * adults.length) return;
  const size = sys.size;
  const meanX = proposals.reduce((sum, tile) => sum + (tile % size), 0) / proposals.length;
  const meanY = proposals.reduce((sum, tile) => sum + Math.floor(tile / size), 0) / proposals.length;
  let chosen = proposals[0]!;
  let best = Infinity;
  for (const tile of proposals) {
    const d = Math.hypot((tile % size) - meanX, Math.floor(tile / size) - meanY);
    if (d < best) {
      best = d;
      chosen = tile;
    }
  }
  const destination = nearWater(sys, chosen, rules.waterMaxTiles);
  if (destination < 0) return;
  const dx = (destination % size) - camp.centerX;
  const dy = Math.floor(destination / size) - camp.centerY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < rules.minMoveTiles) return;
  moveCamp(sys, camp, destination, day, tick, adults.length, { dx, dy });
}

/** A dry tile at most `max` steps from fresh water, found by walking toward the water (-1 if none). */
function nearWater(sys: IndividualsSystem, start: number, max: number): number {
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

function moveCamp(sys: IndividualsSystem, camp: Camp, destination: number, day: number, tick: number, adults: number, move: { dx: number; dy: number }): void {
  const { people } = sys;
  const before = camp.center;
  const x = destination % sys.size;
  const y = Math.floor(destination / sys.size);
  const label = describeLocation(sys.world.landmasses, sys.world.landmassNames, x, y, sys.size);
  // Why: the hardship of the place (an abnormal year), and the members starved lately.
  const anomaly = sys.climate.anomalies[sys.climate.anomalyIndex[before]! - 1];
  const recent = camp.hungerDeaths.filter((death) => day - death.day <= sys.params.campMove.minDaysBetweenMoves).slice(-MAX_CAUSES);
  camp.movedEvent = sys.journal.publish({
    tick,
    type: CAMP_MOVED,
    text: fillTemplate(sys.params.campMoveText, {
      distance: String(Math.round(Math.hypot(move.dx, move.dy))),
      direction: direction(move.dx, move.dy),
      lieu: label,
    }),
    place: { x, y, label },
    actors: [],
    causes: [...(anomaly ? [anomaly.startEventId] : []), ...recent.map((death) => death.event)],
    details: { camp: camp.id, adults, from: before, to: destination },
  });
  camp.hungerDeaths.length = 0;
  camp.relocate(destination, sys.terrain);
  camp.settledDay = day;
  const { first, last } = sys.campMembers(camp.id);
  let movers = 0;
  for (let p = first; p < last; p++) {
    if (people.alive[p] === 0) continue;
    movers++;
    people.forageDistance[p] = 0;
    people.farFood[p] = -1;
    people.target[p] = -1;
    people.paths[p] = null;
    people.nextThink[p] = sys.step;
    sys.production.endJob(p);
  }
  sys.production.relocateCamp(camp.id, destination, movers, camp.movedEvent);
}
