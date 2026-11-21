import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import type { BodyView } from '../../../src/sim/core/interactions';
import { State } from '../../../src/sim/systems/fauna/animal-store';
import { act } from '../../../src/sim/systems/fauna/behavior';
import { scareGame } from '../../../src/sim/systems/fauna/human-fear';
import { dataWithSize } from '../world/helpers';

const SIZE = 256;
const data = dataWithSize(SIZE);

/** One person standing at (x, y), hunting or not, as the animals see her. */
function onePerson(x: number, y: number, hunting: boolean): BodyView {
  return {
    forEachNear: (_x, _y, _r, visit) => visit(0),
    forEachAlive: (visit) => visit(0),
    x: () => x,
    y: () => y,
    alive: () => true,
    hunting: () => hunting,
  };
}

function firstOf(simulation: Simulation, id: string): number {
  const { store } = simulation.fauna;
  const code = data.fauna.species.findIndex((species) => species.id === id);
  for (let slot = 0; slot < store.slots; slot++) if (store.alive[slot] === 1 && store.species[slot] === code) return slot;
  throw new Error(`no ${id}`);
}

describe('game and humans', () => {
  it('a deer next to a hunter runs away, faster than it walks', () => {
    const simulation = new Simulation(4, data);
    const { fauna } = simulation;
    const deer = firstOf(simulation, 'deer');
    const x = fauna.store.x[deer]!;
    const y = fauna.store.y[deer]!;
    fauna.store.state[deer] = State.Rest;
    simulation.interactions.register('human', onePerson(x + 1, y, true), {});
    for (let k = 0; k < 10 && fauna.store.state[deer] !== State.Flee; k++) scareGame(fauna);
    expect(fauna.store.state[deer]).toBe(State.Flee);
    expect(fauna.store.fleesHuman[deer]).toBe(1);
    act(fauna, deer);
    const run = Math.max(Math.abs(fauna.store.x[deer]! - x), Math.abs(fauna.store.y[deer]! - y));
    expect(run).toBeGreaterThan(1);
  });

  it('a passer-by is noticed as far as a hunter: each species has its own flight distance', () => {
    const simulation = new Simulation(4, data);
    const { fauna } = simulation;
    for (const id of ['rabbit', 'deer', 'boar']) {
      const animal = firstOf(simulation, id);
      const species = fauna.speciesOf(animal);
      fauna.store.wariness[animal] = 1;
      fauna.store.state[animal] = State.Rest;
      const x = fauna.store.px[animal]!;
      const y = fauna.store.py[animal]!;
      // Just beyond its flight distance: never frightened.
      simulation.interactions.register('human', onePerson(x + species.humanFleeTiles + 0.5, y, false), {});
      for (let k = 0; k < 50; k++) scareGame(fauna);
      expect(fauna.store.fleesHuman[animal]).toBe(0);
      // Within it, a mere passer-by: noticed sooner or later.
      simulation.interactions.register('human', onePerson(x + species.humanFleeTiles * 0.6, y, false), {});
      for (let k = 0; k < 50 && fauna.store.fleesHuman[animal] === 0; k++) scareGame(fauna);
      expect(fauna.store.fleesHuman[animal]).toBe(1);
    }
    // A deer is warier than a rabbit (data).
    const flight = (id: string): number => data.fauna.species.find((species) => species.id === id)!.humanFleeTiles;
    expect(flight('deer')).toBeGreaterThan(flight('rabbit'));
  });

  it('a domestic animal does not flee', () => {
    const simulation = new Simulation(4, data);
    const { fauna } = simulation;
    const goat = firstOf(simulation, 'goat');
    fauna.store.ownerCamp[goat] = 0;
    fauna.store.state[goat] = State.Rest;
    simulation.interactions.register('human', onePerson(fauna.store.px[goat]! + 0.5, fauna.store.py[goat]!, true), {});
    for (let k = 0; k < 30; k++) scareGame(fauna);
    expect(fauna.store.fleesHuman[goat]).toBe(0);
  });

  it('a predator keeps away from people, farther from a group, but not when starving unless driven off', () => {
    const simulation = new Simulation(4, data);
    const { fauna } = simulation;
    const wolf = firstOf(simulation, 'wolf');
    const tiles = fauna.speciesOf(wolf).humanFleeTiles;
    fauna.store.wariness[wolf] = 1;
    const x = fauna.store.px[wolf]!;
    const y = fauna.store.py[wolf]!;
    const flees = (view: BodyView, hunger: number): boolean => {
      fauna.store.state[wolf] = State.Rest;
      fauna.store.fleesHuman[wolf] = 0;
      fauna.store.hunger[wolf] = hunger;
      simulation.interactions.register('human', view, {});
      for (let k = 0; k < 60 && fauna.store.fleesHuman[wolf] === 0; k++) scareGame(fauna);
      return fauna.store.fleesHuman[wolf] === 1;
    };
    const fed = 0;
    const starving = data.fauna.humanPrey.minHunger + 5;
    // One person within its distance: a fed wolf goes away.
    expect(flees(onePerson(x + tiles * 0.5, y, false), fed)).toBe(true);
    // A lone person beyond it does not bother it, but a group at the same distance does.
    const far = tiles * 1.3;
    expect(flees(onePerson(x + far, y, false), fed)).toBe(false);
    const group: BodyView = {
      forEachNear: (_x, _y, _r, visit) => [0, 1, 2, 3, 4, 5].forEach(visit),
      forEachAlive: (visit) => [0, 1, 2, 3, 4, 5].forEach(visit),
      x: (id) => x + far + (id % 3) * 0.5,
      y: (id) => y + Math.floor(id / 3) * 0.5,
      alive: () => true,
      hunting: () => false,
    };
    expect(flees(group, fed)).toBe(true);
    // Starving, it no longer keeps away... unless someone drives it off.
    expect(flees(onePerson(x + tiles * 0.5, y, false), starving)).toBe(false);
    expect(flees({ ...onePerson(x + tiles * 0.5, y, false), scaring: () => true }, starving)).toBe(true);
  });
});
