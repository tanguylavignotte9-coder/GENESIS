import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { distance, speedOf } from '../../../src/sim/core/motion';
import { chase } from '../../../src/sim/systems/fauna/behavior';
import { dataWithSize } from '../world/helpers';

const SIZE = 320;
const data = dataWithSize(SIZE);
const HOURS = 1 / data.humans.stepsPerHour;
const ticksPerStep = data.time.ticksPerDay / 24 / data.humans.stepsPerHour;

/** A walkable tile about `away` tiles east of the camp (or -1). */
function tileAway(simulation: Simulation, away: number): number {
  const { humans } = simulation;
  const camp = humans.camps[0]!;
  for (let d = away; d < away + 40; d++) {
    const tile = camp.centerY * SIZE + camp.centerX + d;
    if (humans.terrain.walkable(tile)) return tile;
  }
  return -1;
}

describe('people walk freely, off the grid', () => {
  it('a walker follows a path drawn in straight lines, at decimal positions, and stops on her own spot', () => {
    const simulation = new Simulation(42, data);
    const { humans } = simulation;
    const { people } = humans;
    const p = 3;
    const target = tileAway(simulation, 18);
    expect(target).toBeGreaterThanOrEqual(0);
    expect(humans.goTo(p, target)).toBe(true);
    const path = people.paths[p]!;
    // The straight stretches keep fewer points than the tiles walked over.
    expect(path.length).toBeLessThan(18);
    let off = 0;
    let result = 'moving';
    for (let k = 0; k < 200 && result === 'moving'; k++) {
      result = humans.walk(p, HOURS);
      if (Math.abs(people.px[p]! - Math.floor(people.px[p]!) - 0.5) > 0.05) off++;
    }
    expect(result).toBe('arrived');
    expect(off).toBeGreaterThan(5);
    expect(people.distanceTo(p, people.goalX[p]!, people.goalY[p]!)).toBeLessThan(0.01);
    expect(people.x[p]! + people.y[p]! * SIZE).toBe(target);
    expect(speedOf(people, p)).toBe(0);
  });

  it('people who gather at the fire sit in a circle around it, never on the same point', () => {
    const simulation = new Simulation(42, data);
    const { humans, production } = simulation;
    const { people } = humans;
    const fire = production.fireTile(0);
    for (let p = 0; p < 12; p++) humans.goHome(p, fire);
    const fx = (fire % SIZE) + 0.5;
    const fy = Math.floor(fire / SIZE) + 0.5;
    for (let a = 0; a < 12; a++) {
      expect(distance(people.goalX[a]!, people.goalY[a]!, fx, fy)).toBeGreaterThan(0.5);
      for (let b = a + 1; b < 12; b++) expect(distance(people.goalX[a]!, people.goalY[a]!, people.goalX[b]!, people.goalY[b]!)).toBeGreaterThan(0.3);
    }
  });

  it('several people working on one tile each take a place of their own', () => {
    const simulation = new Simulation(42, data);
    const { humans } = simulation;
    const { people } = humans;
    const tile = tileAway(simulation, 4);
    for (let p = 0; p < 8; p++) humans.goTo(p, tile);
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) expect(distance(people.goalX[a]!, people.goalY[a]!, people.goalX[b]!, people.goalY[b]!)).toBeGreaterThan(0.1);
  });

  it('a couple walking the same way ends up side by side', () => {
    const simulation = new Simulation(42, data);
    const { humans } = simulation;
    const { people } = humans;
    let a = -1;
    for (let p = 0; p < people.count && a < 0; p++) if (people.spouse[p]! >= 0) a = p;
    const b = people.spouse[a]!;
    const target = tileAway(simulation, 30);
    const tx = (target % SIZE) + 0.5;
    const ty = Math.floor(target / SIZE) + 0.5;
    people.placeAt(a, people.px[a]!, people.py[a]!);
    people.placeAt(b, people.px[a]! - 1.5, people.py[a]!);
    for (let k = 0; k < 16; k++) {
      humans.moveStep(a, tx, ty, false, HOURS);
      humans.moveStep(b, tx, ty, false, HOURS);
    }
    // They walk abreast: close, and the gap is across the way rather than along it.
    expect(people.distance(a, b)).toBeLessThan(data.humans.movement.besideTiles * 1.8);
    expect(Math.abs(people.py[a]! - people.py[b]!)).toBeGreaterThan(0.3);
  });

  it('a child follows its guardian a little behind, and stops by her side when she stops', () => {
    const simulation = new Simulation(42, data);
    const { humans } = simulation;
    const { people } = humans;
    const mother = 0;
    const child = 1;
    people.placeAt(child, people.px[mother]! - 1, people.py[mother]!);
    const target = tileAway(simulation, 20);
    humans.goTo(mother, target);
    let maxGap = 0;
    for (let k = 0; k < 60; k++) {
      humans.walk(mother, HOURS);
      humans.follow(child, mother, HOURS);
      maxGap = Math.max(maxGap, people.distance(mother, child));
    }
    expect(maxGap).toBeLessThan(data.humans.movement.followNearTiles);
    let done = false;
    for (let k = 0; k < 40 && !done; k++) done = humans.follow(child, mother, HOURS);
    expect(done).toBe(true);
    expect(people.distance(mother, child)).toBeLessThan(2);
    expect(people.distance(mother, child)).toBeGreaterThan(0.3);
  });

  it('is deterministic: same seed, same positions to the last decimal', () => {
    const run = (): string => {
      const simulation = new Simulation(7, data);
      simulation.step(ticksPerStep * 4 * 24 * 2);
      const { people } = simulation.humans;
      return Array.from(people.px.slice(0, people.count)).join(',') + '|' + Array.from(simulation.fauna.store.px.slice(0, 200)).join(',');
    };
    expect(run()).toBe(run());
  });
});

describe('animals move together', () => {
  it('a herd keeps together without stacking its animals', () => {
    const simulation = new Simulation(42, data);
    simulation.step(data.time.ticksPerDay * 3);
    const { fauna } = simulation;
    const { store, groups } = fauna;
    let herds = 0;
    let stacked = 0;
    let pairs = 0;
    let near = 0;
    let members = 0;
    for (let group = 0; group < groups.count && herds < 40; group++) {
      const leader = groups.leader[group]!;
      if (leader < 0 || store.alive[leader] !== 1 || groups.size[group]! < 4 || store.state[leader] === 6) continue;
      herds++;
      const slots: number[] = [];
      for (let s = 0; s < store.slots; s++) if (store.alive[s] === 1 && store.group[s] === group) slots.push(s);
      for (const s of slots) {
        members++;
        if (distance(store.px[s]!, store.py[s]!, store.px[leader]!, store.py[leader]!) < data.fauna.behavior.wanderRadius * 2) near++;
      }
      for (let a = 0; a < slots.length; a++)
        for (let b = a + 1; b < slots.length; b++) {
          pairs++;
          if (distance(store.px[slots[a]!]!, store.py[slots[a]!]!, store.px[slots[b]!]!, store.py[slots[b]!]!) < 0.05) stacked++;
        }
    }
    expect(herds).toBeGreaterThan(5);
    expect(near / members).toBeGreaterThan(0.8);
    expect(stacked / pairs).toBeLessThan(0.02);
  });

  it('a pack closes in on its prey from several sides', () => {
    const simulation = new Simulation(42, data);
    const { fauna } = simulation;
    const { store } = fauna;
    const wolf = fauna.params.species.findIndex((s) => s.id === 'wolf');
    const deer = fauna.params.species.findIndex((s) => s.id === 'deer');
    // Open ground far from the sea.
    let x = -1;
    let y = -1;
    for (let tile = 0; tile < SIZE * SIZE && x < 0; tile += 7) {
      const tx = tile % SIZE;
      const ty = Math.floor(tile / SIZE);
      let ok = tx > 30 && ty > 30 && tx < SIZE - 30 && ty < SIZE - 30;
      for (let dy = -12; ok && dy <= 12; dy++) for (let dx = -12; ok && dx <= 12; dx++) ok = fauna.isWalkable(tx + dx, ty + dy);
      if (ok) {
        x = tx;
        y = ty;
      }
    }
    expect(x).toBeGreaterThanOrEqual(0);
    const preyGroup = fauna.groups.add(deer, -1);
    const prey = fauna.spawn(deer, x + 0.5, y + 0.5, preyGroup, 1000);
    const pack = fauna.groups.add(wolf, -1);
    const wolves = [0, 1, 2].map((k) => fauna.spawn(wolf, x - 10 + k * 0.7, y + 0.5, pack, 1000));
    fauna.groups.leader[pack] = wolves[0]!;
    for (let step = 0; step < 4; step++) for (const w of wolves) chase(fauna, w, fauna.speciesOf(w), store.px[prey]!, store.py[prey]!);
    // Each wolf comes from its own direction around the prey.
    const angles = wolves.map((w) => Math.atan2(store.py[w]! - store.py[prey]!, store.px[w]! - store.px[prey]!));
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(spread).toBeGreaterThan(0.3);
  });
});
