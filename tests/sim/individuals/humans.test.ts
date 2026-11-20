import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { canDrink } from '../../../src/sim/systems/fauna/fresh-water';
import { curve } from '../../../src/sim/systems/individuals/brain';
import { HUMAN_DEATH, SETTLEMENT } from '../../../src/sim/systems/individuals/individuals-system';
import { DeathCause } from '../../../src/sim/systems/individuals/people';
import { dataWithSize } from '../world/helpers';

const SIZE = 320;
const data = dataWithSize(SIZE);
const hourTicks = data.time.ticksPerDay / 24;
const actionIndex = (simulation: Simulation, id: string): number => simulation.humans.actions.findIndex((a) => a.def.id === id);

describe('the starting tribe', () => {
  const simulation = new Simulation(42, data);
  const { humans } = simulation;
  const { people } = humans;

  it('has about 30 people around a camp with a fire and huts, settled near fresh water in a mild climate', () => {
    expect(people.count).toBe(data.humans.tribe.size);
    const { production } = simulation;
    expect(production.fireLit(0)).toBe(true);
    expect(production.campBuildings(0).filter((b) => production.typeOf(b).def.id === 'hut')).toHaveLength(6);
    const fire = production.fireTile(0);
    expect(simulation.world.temperature[fire]).toBeGreaterThanOrEqual(data.humans.site.minCelsius);
    expect(simulation.world.temperature[fire]).toBeLessThanOrEqual(data.humans.site.maxCelsius);
    expect(simulation.journal.all().some((event) => event.type === SETTLEMENT)).toBe(true);
  });

  it('is made of coherent families with unique names', () => {
    expect(new Set(people.names).size).toBe(people.count);
    let children = 0;
    for (let p = 0; p < people.count; p++) {
      const spouse = people.spouse[p]!;
      if (spouse >= 0) {
        expect(people.spouse[spouse]).toBe(p);
        expect(people.female[spouse]).not.toBe(people.female[p]);
      }
      for (const parent of [people.mother[p]!, people.father[p]!]) {
        if (parent < 0) continue;
        children++;
        expect(people.ageYears[parent]! - people.ageYears[p]!).toBeGreaterThanOrEqual(16);
      }
    }
    expect(children).toBeGreaterThan(0);
  });

  it('knows only gathering, fire and huts', () => {
    const known = data.knowledge.knowledge.filter((_, k) => (simulation.ideas.knowledge(0) & (1 << k)) !== 0).map((item) => item.id);
    expect(known.sort()).toEqual(['fire', 'gathering', 'huts']);
  });
});

describe('the brain', () => {
  it('uses response curves between 0 and 1', () => {
    expect(curve(2, 0.5, 10, 0.5)).toBeCloseTo(0.5);
    expect(curve(0, 2, 0, 0.9)).toBe(1);
    expect(curve(1, 2, 0, 0.5)).toBeCloseTo(0.25);
  });

  it('a very thirsty person goes to drink, a tired one sleeps at night', () => {
    const simulation = new Simulation(42, data);
    const { humans } = simulation;
    const p = 0;
    humans.people.thirst[p] = 95;
    humans.think(p);
    expect(humans.people.action[p]).toBe(actionIndex(simulation, 'drink'));
    expect(humans.people.topActions[p * 3]).toBe(actionIndex(simulation, 'drink'));
    simulation.step(hourTicks * 21); // evening of day 1
    humans.people.thirst[p] = 0;
    humans.people.hunger[p] = 0;
    humans.people.cold[p] = 0;
    humans.people.fatigue[p] = 80;
    humans.think(p);
    expect(humans.people.action[p]).toBe(actionIndex(simulation, 'sleep'));
  });

  it('decisions are deterministic: same seed => same positions and needs', () => {
    const run = () => {
      const simulation = new Simulation(5, data);
      simulation.step(2 * data.time.ticksPerDay);
      const { people } = simulation.humans;
      return Array.from({ length: people.count }, (_, p) => `${people.x[p]},${people.y[p]},${people.hunger[p]!.toFixed(3)},${people.action[p]}`).join('|');
    };
    expect(run()).toEqual(run());
  });
});

describe('daily life', () => {
  it('people gather from real plants, drink, sleep at night and keep the fire going', () => {
    const simulation = new Simulation(42, data);
    const seen = new Set<string>();
    let eatenBefore = 0;
    for (const value of simulation.flora.state.eaten) eatenBefore += value;
    for (let h = 0; h < 48; h++) {
      simulation.step(hourTicks);
      const { people } = simulation.humans;
      for (let p = 0; p < people.count; p++) seen.add(simulation.humans.actions[people.action[p]!]!.def.id);
    }
    let eatenAfter = 0;
    for (const value of simulation.flora.state.eaten) eatenAfter += value;
    expect(eatenAfter).toBeGreaterThan(eatenBefore);
    expect(seen).toContain('gather');
    expect(seen).toContain('drink');
    expect(seen).toContain('sleep');
    expect(simulation.production.fireLit(0)).toBe(true);
  });

  it('a person can die of thirst, and the journal says so', () => {
    const simulation = new Simulation(42, data);
    const { people } = simulation.humans;
    const p = 3;
    people.thirst[p] = 100;
    people.health[p] = 0.5;
    simulation.step(hourTicks);
    expect(people.alive[p]).toBe(0);
    expect(people.deathCause[p]).toBe(DeathCause.Thirst);
    const death = simulation.journal.all().find((event) => event.type === HUMAN_DEATH);
    expect(death?.text).toContain(people.names[p]);
    expect(death?.text).toContain('soif');
  });

  /** Takes person `p` far from the others and puts a hungry wolf at hand. */
  function loneWalkerAndWolf(): { simulation: Simulation; p: number; wolf: number } {
    const simulation = new Simulation(42, data);
    const { humans, fauna } = simulation;
    const p = 2;
    let spot = -1;
    const camp = humans.camps[0]!;
    for (let d = 15; d < 60 && spot < 0; d++) {
      const tile = camp.centerY * SIZE + camp.centerX + d;
      if (humans.terrain.walkable(tile) && humans.terrain.walkable(tile + 1)) spot = tile;
    }
    expect(spot).toBeGreaterThanOrEqual(0);
    humans.people.placeAt(p, spot % SIZE + 0.5, Math.floor(spot / SIZE) + 0.5);
    const species = fauna.params.species.findIndex((s) => s.id === 'wolf');
    const pack = fauna.groups.add(species, -1);
    const wolf = fauna.spawn(species, (spot % SIZE) + 1, Math.floor(spot / SIZE), pack, 1000);
    fauna.groups.leader[pack] = wolf;
    return { simulation, p, wolf };
  }

  it('a hungry predator attacks a person walking alone (the fauna decides, the humans apply the wound)', () => {
    const { simulation, p, wolf } = loneWalkerAndWolf();
    const { humans, fauna } = simulation;
    const before = humans.people.health[p]!;
    let hurt = false;
    for (let hour = 0; hour < 48 && !hurt; hour++) {
      fauna.store.hunger[wolf] = 100;
      fauna.store.thirst[wolf] = 0;
      // Keep the person alone where she is (her own decisions would take her home).
      humans.people.placeAt(p, (fauna.store.px[wolf]! + 1) % SIZE, fauna.store.py[wolf]!);
      simulation.step(hourTicks);
      hurt = humans.people.health[p]! < before || humans.people.alive[p] === 0;
    }
    expect(hurt).toBe(true);
  });

  it('a predator does not attack a person surrounded by others', () => {
    const { simulation, p, wolf } = loneWalkerAndWolf();
    const { humans, fauna } = simulation;
    const friend = 3;
    let attacks = 0;
    const attack = simulation.interactions.attack.bind(simulation.interactions);
    simulation.interactions.attack = (blow) => {
      attacks++;
      return attack(blow);
    };
    // The two stay side by side (re-placed at every step of the humans: their own decisions would take them away).
    const quarter = hourTicks / data.humans.stepsPerHour;
    for (let step = 0; step < 24 * data.humans.stepsPerHour; step++) {
      fauna.store.hunger[wolf] = 100;
      fauna.store.thirst[wolf] = 0;
      humans.people.placeAt(p, (fauna.store.px[wolf]! + 1) % SIZE, fauna.store.py[wolf]!);
      humans.people.placeAt(friend, humans.people.px[p]!, humans.people.py[p]! + 1);
      simulation.step(quarter);
    }
    expect(attacks).toBe(0);
  });

  it('a person killed by a predator is in the journal with the animal, and the predator eats the body', () => {
    const { simulation, p, wolf } = loneWalkerAndWolf();
    const { humans, fauna } = simulation;
    const outcome = simulation.interactions.attack({
      attacker: { kind: 'animal', id: wolf },
      target: { kind: 'human', id: p },
      damage: 1000,
      attackerName: 'loup',
      tick: simulation.clock.tick,
    });
    expect(outcome.killed).toBe(true);
    expect(humans.people.alive[p]).toBe(0);
    expect(humans.people.deathCause[p]).toBe(DeathCause.Predator);
    const death = simulation.journal.get(outcome.eventId)!;
    expect(death.text).toContain('loup');
    expect(death.actors).toContainEqual({ kind: 'animal', id: wolf });
    expect(fauna.carrion.at(outcome.y * SIZE + outcome.x)).toBeGreaterThan(0);
    expect(fauna.store.x[wolf]).toBe(outcome.x);
  });
});

describe('pathfinding', () => {
  it('finds a walkable path that never crosses the sea', () => {
    const simulation = new Simulation(42, data);
    const { humans } = simulation;
    const start = humans.tileOf(0);
    let goal = -1;
    for (let d = 25; d < 80 && goal < 0; d++) {
      for (const tile of [start + d, start - d, start + d * SIZE, start - d * SIZE]) {
        if (tile >= 0 && tile < SIZE * SIZE && humans.terrain.walkable(tile)) {
          goal = tile;
          break;
        }
      }
    }
    expect(goal).toBeGreaterThanOrEqual(0);
    expect(humans.goTo(0, goal)).toBe(true);
    const path = humans.people.paths[0]!;
    expect(path[path.length - 1]).toBe(goal);
    for (const tile of path) expect(humans.terrain.walkable(tile)).toBe(true);
  });
});

describe('day, night and weather', () => {
  it('days are longer in summer at high latitudes and about 12 hours at the equator', () => {
    const simulation = new Simulation(42, data);
    const { climate } = simulation;
    const north = 20 * SIZE + 10;
    const equator = (SIZE / 2) * SIZE + 10;
    climate.setDay(data.climate.seasonalTemperature.warmestDayOfYear);
    const summer = climate.dayLengthAt(north);
    expect(Math.abs(climate.dayLengthAt(equator) - 12)).toBeLessThan(0.5);
    climate.setDay((data.climate.seasonalTemperature.warmestDayOfYear + 20) % 40);
    expect(summer).toBeGreaterThan(climate.dayLengthAt(north) + 4);
    expect(climate.daylightAt(equator, 0)).toBe(0);
    expect(climate.daylightAt(equator, 12)).toBe(1);
  });

  it('weather is drawn per region, deterministic, and snow only falls in the cold', () => {
    const a = new Simulation(9, data);
    const b = new Simulation(9, data);
    a.step(5 * data.time.ticksPerDay);
    b.step(5 * data.time.ticksPerDay);
    expect(Array.from(a.weather.regions)).toEqual(Array.from(b.weather.regions));
    const { weather, climate } = a;
    for (let r = 0; r < weather.regions.length; r++) {
      if (weather.regions[r] !== 2) continue;
      const rx = r % weather.regionsPerSide;
      const ry = Math.floor(r / weather.regionsPerSide);
      const half = Math.floor(data.weather.regionTiles / 2);
      const tile = Math.min(SIZE - 1, ry * data.weather.regionTiles + half) * SIZE + Math.min(SIZE - 1, rx * data.weather.regionTiles + half);
      expect(climate.temperatureAt(tile)).toBeLessThan(data.weather.snowBelowCelsius);
    }
  });

  it('a person standing next to water can drink', () => {
    const simulation = new Simulation(42, data);
    const { humans } = simulation;
    const p = 1;
    humans.people.thirst[p] = 90;
    for (let h = 0; h < 12 && humans.people.thirst[p]! > 10; h++) simulation.step(hourTicks);
    expect(humans.people.thirst[p]).toBeLessThan(90);
    void canDrink;
  });
});
