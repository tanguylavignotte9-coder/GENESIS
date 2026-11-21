import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/sim/core/rng';
import { Simulation } from '../../../src/sim/core/simulation';
import { inheritedBuild, startingBuild } from '../../../src/sim/systems/individuals/life/strength';
import { dataWithSize } from '../world/helpers';

const SIZE = 256;

function world(seed = 42): Simulation {
  return new Simulation(seed, dataWithSize(SIZE));
}

/** An adult man and an adult woman of the tribe (first found). */
function adults(simulation: Simulation): number[] {
  const { people } = simulation.humans;
  const out: number[] = [];
  for (let p = 0; p < people.count; p++) if (people.ageYears[p]! >= 18 && people.ageYears[p]! < 40) out.push(p);
  return out;
}

describe('individual strength', () => {
  it('every person of the starting tribe has their own build, and they differ', () => {
    const sim = world();
    const { state } = sim.humans.life;
    const builds = new Set<number>();
    for (let p = 0; p < sim.humans.people.count; p++) builds.add(Math.round(state.build[p]! * 1000));
    expect(builds.size).toBeGreaterThan(sim.humans.people.count / 2);
  });

  it('a slight gap between the sexes with a wide overlap: a strong woman often beats an average man', () => {
    const sim = world();
    const { params } = sim.humans.life;
    const rng = new Rng(7);
    const women: number[] = [];
    const men: number[] = [];
    const s = params.strength;
    for (let i = 0; i < 4000; i++) {
      const build = startingBuild(params, rng);
      (i % 2 === 0 ? women : men).push(build * (i % 2 === 0 ? 1 - s.femaleGap : 1));
    }
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    const gap = 1 - mean(women) / mean(men);
    expect(gap).toBeGreaterThan(0.05);
    expect(gap).toBeLessThan(0.15);
    // A woman in the top quarter of women is stronger than the average man most of the time.
    const sorted = [...women].sort((a, b) => a - b);
    const strongWoman = sorted[Math.floor(sorted.length * 0.85)]!;
    expect(strongWoman).toBeGreaterThan(mean(men));
    // And many women are stronger than many men.
    const beaten = men.filter((m) => m < mean(women)).length / men.length;
    expect(beaten).toBeGreaterThan(0.2);
  });

  it('the gap between the sexes is adjustable (0 = no gap)', () => {
    const sim = world();
    const { life, people } = sim.humans;
    const woman = adults(sim).find((p) => people.female[p] === 1)!;
    const before = life.strength(woman);
    life.params.strength.femaleGap = 0;
    expect(life.strength(woman)).toBeGreaterThan(before);
  });

  it('a child takes after its parents (heritable build)', () => {
    const sim = world();
    const { params } = sim.humans.life;
    const rng = new Rng(3);
    const strongKids: number[] = [];
    const frailKids: number[] = [];
    for (let i = 0; i < 500; i++) {
      strongKids.push(inheritedBuild(params, rng, 1.3, 1.3));
      frailKids.push(inheritedBuild(params, rng, 0.75, 0.75));
    }
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(strongKids)).toBeGreaterThan(1.1);
    expect(mean(frailKids)).toBeLessThan(0.9);
  });

  it('strength follows age, health and training', () => {
    const sim = world();
    const { life, people } = sim.humans;
    const person = adults(sim)[0]!;
    people.health[person] = 100;
    life.state.training[person] = life.params.strength.restTraining;
    const rested = life.strength(person);
    // Training (physical work) makes one stronger, and it fades without effort.
    for (let h = 0; h < 200; h++) life.train(person, 1);
    const trained = life.strength(person);
    expect(trained).toBeGreaterThan(rested * 1.05);
    for (let d = 0; d < 400; d++) life.state.training[person] = Math.max(life.params.strength.restTraining, life.state.training[person]! - life.params.strength.fadePerDay);
    expect(life.strength(person)).toBeCloseTo(rested, 5);
    // Wounded, one hits less hard; old, too.
    people.health[person] = 40;
    expect(life.strength(person)).toBeLessThan(rested);
    people.health[person] = 100;
    const age = people.ageYears[person]!;
    people.ageYears[person] = 75;
    expect(life.strength(person)).toBeLessThan(rested);
    people.ageYears[person] = age;
  });

  it('physical work trains the body; it goes faster for the strong', () => {
    const sim = world();
    const humans = sim.humans;
    const person = adults(sim)[0]!;
    const hunting = humans.params.skills.findIndex((s) => s.id === 'hunting');
    const gathering = humans.params.skills.findIndex((s) => s.id === 'gathering');
    const before = humans.life.state.training[person]!;
    humans.practise(person, gathering, 10);
    expect(humans.life.state.training[person]).toBe(before);
    humans.practise(person, hunting, 10);
    expect(humans.life.state.training[person]).toBeGreaterThan(before);
    const view = humans.production.people;
    humans.life.state.build[person] = 1.4;
    const strong = view.vigor(person, hunting);
    humans.life.state.build[person] = 0.7;
    const weak = view.vigor(person, hunting);
    expect(strong).toBeGreaterThan(weak);
    // Gathering is not about strength.
    expect(view.vigor(person, gathering)).toBe(view.vigor(person));
  });

  it('same seed, same builds (deterministic)', () => {
    const a = world(9).humans.life.state;
    const b = world(9).humans.life.state;
    expect(Array.from(a.build)).toEqual(Array.from(b.build));
    expect(Array.from(a.training)).toEqual(Array.from(b.training));
  });
});
