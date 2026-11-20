import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { describeBrain } from '../../../src/sim/systems/individuals/brain-describe';
import { describeAnimalBrain } from '../../../src/sim/systems/fauna/brain-trace';
import { describeGovernance } from '../../../src/sim/systems/groups/governance';
import { dataWithSize } from '../world/helpers';

const SIZE = 320;
const DAYS = 6;

function world(seed = 7): Simulation {
  return new Simulation(seed, dataWithSize(SIZE));
}

function run(simulation: Simulation, days: number): void {
  simulation.step(days * simulation.data.time.ticksPerDay);
}

/** Everything that tells the story: the journal, every person's state, the next random draws. */
function fingerprint(simulation: Simulation): string {
  const people = simulation.humans.people;
  const store = simulation.fauna.store;
  return JSON.stringify({
    journal: simulation.journal.all().map((event) => event.text),
    x: Array.from(people.px.slice(0, people.count)),
    action: Array.from(people.action.slice(0, people.count)),
    hunger: Array.from(people.hunger.slice(0, people.count)),
    animals: Array.from(store.px.slice(0, store.slots)),
    states: Array.from(store.state.slice(0, store.slots)),
    draws: [simulation.rng.nextFloat(), simulation.rng.nextFloat()],
  });
}

describe('visual brain', () => {
  it('watching a person and an animal never changes the story (same seed, same world)', () => {
    const plain = world();
    const watched = world();
    const animal = watched.fauna.store.uid[0]!;
    watched.humans.watch.person = 3;
    watched.fauna.watch.watch(animal);
    run(plain, DAYS);
    run(watched, DAYS);
    expect(watched.humans.watch.trace).not.toBeNull();
    expect(watched.fauna.watch.trace).not.toBeNull();
    expect(fingerprint(watched)).toBe(fingerprint(plain));
  });

  it('the person’s brain shows what pushes and holds back each action, the chosen one and the last changes', () => {
    const simulation = world();
    simulation.humans.watch.person = 0;
    run(simulation, 2);
    const brain = describeBrain(simulation.humans, 0, simulation.data.time, 'printemps');
    expect(brain.options.filter((option) => option.state === 'chosen')).toHaveLength(1);
    expect(brain.nodes.some((node) => node.label === 'Soif')).toBe(true);
    expect(brain.links.some((link) => link.push)).toBe(true);
    expect(brain.links.some((link) => !link.push)).toBe(true);
    for (const option of brain.options) expect(option.why.length).toBeGreaterThan(0);
    expect(brain.history.length).toBeGreaterThan(0);
    expect(brain.history.length).toBeLessThanOrEqual(20);
    // Someone else, not watched: the history is there, the detail of the scores is not.
    const other = describeBrain(simulation.humans, 1, simulation.data.time, 'printemps');
    expect(other.options).toHaveLength(0);
    expect(other.history.length).toBeGreaterThan(0);
  });

  it('the animal’s brain lists its rules by priority and remembers its changes of activity', () => {
    const simulation = world();
    const uid = simulation.fauna.store.uid[5]!;
    simulation.fauna.watch.watch(uid);
    run(simulation, 3);
    const brain = describeAnimalBrain(simulation.fauna, uid, () => '');
    if (brain.note.includes('mort')) return;
    expect(brain.options.some((option) => option.state === 'chosen')).toBe(true);
    expect(brain.nodes.some((node) => node.id === 'hunger')).toBe(true);
    expect(brain.history.length).toBeGreaterThan(0);
  });

  it('the governance shows the decisions with their options and the support of every adult', () => {
    const simulation = world();
    run(simulation, 12);
    const tribe = simulation.groups.tribes()[0]!;
    const governance = describeGovernance(simulation.groups, tribe.id)!;
    expect(governance.members.length).toBe(simulation.groups.adults(tribe).length);
    expect(governance.decisions.length).toBeGreaterThan(0);
    const decision = governance.decisions[0]!;
    expect(decision.options.length).toBeGreaterThan(1);
    expect(decision.options[decision.chosen]).toBeDefined();
    for (const member of governance.members) expect(member.support).toBeGreaterThanOrEqual(0);
  });
});
