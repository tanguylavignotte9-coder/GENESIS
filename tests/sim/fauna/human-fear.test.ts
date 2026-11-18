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

  it('a passer-by is noticed only much closer than a hunter', () => {
    const simulation = new Simulation(4, data);
    const { fauna } = simulation;
    const deer = firstOf(simulation, 'deer');
    const species = fauna.speciesOf(deer);
    fauna.store.wariness[deer] = 1;
    fauna.store.state[deer] = State.Rest;
    const x = fauna.store.x[deer]!;
    const y = fauna.store.y[deer]!;
    // Farther than the calm reach: a person who is not hunting never frightens it.
    const distance = Math.ceil(species.humanFleeTiles * data.fauna.humanFear.calmShare) + 1;
    simulation.interactions.register('human', onePerson(x + distance, y, false), {});
    for (let k = 0; k < 50; k++) scareGame(fauna);
    expect(fauna.store.fleesHuman[deer]).toBe(0);
    // The same person hunting: noticed sooner or later.
    simulation.interactions.register('human', onePerson(x + distance, y, true), {});
    for (let k = 0; k < 50 && fauna.store.fleesHuman[deer] === 0; k++) scareGame(fauna);
    expect(fauna.store.fleesHuman[deer]).toBe(1);
  });

  it('predators do not fear humans (their answer comes with combat)', () => {
    const simulation = new Simulation(4, data);
    const { fauna } = simulation;
    const wolf = firstOf(simulation, 'wolf');
    simulation.interactions.register('human', onePerson(fauna.store.x[wolf]! + 1, fauna.store.y[wolf]!, true), {});
    scareGame(fauna);
    expect(fauna.store.fleesHuman[wolf]).toBe(0);
  });
});
