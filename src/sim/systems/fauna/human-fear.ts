import { State } from './animal-store';
import { fleeFrom } from './behavior';
import type { FaunaSystem } from './fauna-system';
import { humans } from './human-prey';

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

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
  const reachMax = Math.ceil(fauna.maxHumanFleeTiles * (1 + params.humanFear.warinessSpread));
  view.forEachAlive((person) => {
    const px = view.x(person);
    const py = view.y(person);
    const hunting = view.hunting(person);
    fauna.grid.forEachNear(px, py, reachMax, (slot) => {
      if (store.state[slot] === State.Flee) return;
      const tiles = fauna.speciesOf(slot).humanFleeTiles;
      if (tiles <= 0) return;
      const radius = tiles * store.wariness[slot]!;
      const reach = hunting ? radius : radius * params.humanFear.calmShare;
      const distance = chebyshev(store.x[slot]!, store.y[slot]!, px, py);
      if (distance >= reach || fauna.rng.nextFloat() >= 1 - distance / reach) return;
      fleeFrom(fauna, slot, px, py);
      store.fleesHuman[slot] = 1;
    });
  });
}
