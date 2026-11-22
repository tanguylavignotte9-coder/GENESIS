import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { State } from '../../../src/sim/systems/fauna/animal-store';
import { act, think } from '../../../src/sim/systems/fauna/behavior';
import { Carrion } from '../../../src/sim/systems/fauna/carrion';
import { dataWithSize } from '../world/helpers';

const SIZE = 256;
const data = dataWithSize(SIZE);
const code = (id: string): number => data.fauna.species.findIndex((s) => s.id === id);

/** Clears every animal within `radius` of (x, y) but `keep`. */
function clearAround(sim: Simulation, x: number, y: number, radius: number, keep: number[]): void {
  const { store } = sim.fauna;
  for (let slot = 0; slot < store.slots; slot++) {
    if (store.alive[slot] !== 1 || keep.includes(slot)) continue;
    if (Math.hypot(store.px[slot]! - x, store.py[slot]! - y) <= radius) sim.fauna.kill(slot, 0);
  }
}

/** A walkable spot far from the edges. */
function openSpot(sim: Simulation): { x: number; y: number } {
  for (let y = 100; y < SIZE - 60; y += 3) for (let x = 60; x < SIZE - 60; x += 3) {
    let ok = true;
    for (let d = -45; d <= 45 && ok; d += 3) ok = sim.fauna.isWalkable(x + d, y);
    if (ok) return { x: x + 0.5, y: y + 0.5 };
  }
  throw new Error('no open spot');
}

describe('predators and prey (v1.2)', () => {
  it('a hungry wolf with no prey in reach follows the trail of game further away instead of roaming at random', () => {
    const sim = new Simulation(3, data);
    const { fauna } = sim;
    const spot = openSpot(sim);
    const wolf = fauna.spawn(code('wolf'), spot.x, spot.y, fauna.groups.add(code('wolf'), -1), 4 * fauna.daysPerYear);
    fauna.groups.leader[fauna.store.group[wolf]!] = wolf;
    clearAround(sim, spot.x, spot.y, data.fauna.behavior.trackTiles + 2, [wolf]);
    const deer = fauna.spawn(code('deer'), spot.x + 40, spot.y, fauna.groups.add(code('deer'), -1), 3 * fauna.daysPerYear);
    fauna.store.hunger[wolf] = 80;
    fauna.store.thirst[wolf] = 0;
    think(fauna, wolf);
    expect(fauna.store.state[wolf]).toBe(State.Wander);
    // It heads for the deer, 40 tiles east (well beyond its hunting reach).
    expect(fauna.store.targetX[wolf]! - spot.x).toBeGreaterThan(20);
    expect(Math.abs(fauna.store.targetY[wolf]! - spot.y)).toBeLessThan(5);
    void deer;
  });

  it('a hunter singles out the weak: it goes for a fawn rather than a nearer deer in its prime', () => {
    const sim = new Simulation(3, data);
    const { fauna } = sim;
    const spot = openSpot(sim);
    const wolf = fauna.spawn(code('wolf'), spot.x, spot.y, fauna.groups.add(code('wolf'), -1), 4 * fauna.daysPerYear);
    fauna.groups.leader[fauna.store.group[wolf]!] = wolf;
    clearAround(sim, spot.x, spot.y, data.fauna.species[code('wolf')]!.huntRadius + 2, [wolf]);
    const adult = fauna.spawn(code('deer'), spot.x + 5, spot.y, fauna.groups.add(code('deer'), -1), 4 * fauna.daysPerYear);
    const fawn = fauna.spawn(code('deer'), spot.x - 8, spot.y, fauna.groups.add(code('deer'), -1), 0.3 * fauna.daysPerYear);
    fauna.store.hunger[wolf] = 80;
    fauna.store.thirst[wolf] = 0;
    fauna.carrion.tiles.length = 0;
    fauna.carrion.meat.length = 0;
    think(fauna, wolf);
    expect(fauna.store.state[wolf]).toBe(State.Hunt);
    expect(fauna.store.targetAnimal[wolf]).toBe(fawn);
    void adult;
  });

  it('an animal on the tile of its food eats, even if its pack mates keep it from the very middle', () => {
    const sim = new Simulation(3, data);
    const { fauna } = sim;
    const spot = openSpot(sim);
    const wolf = fauna.spawn(code('wolf'), spot.x - 0.4, spot.y + 0.3, fauna.groups.add(code('wolf'), -1), 4 * fauna.daysPerYear);
    fauna.carrion.add(Math.floor(spot.y) * SIZE + Math.floor(spot.x), 20);
    fauna.store.state[wolf] = State.Forage;
    fauna.store.targetX[wolf] = spot.x;
    fauna.store.targetY[wolf] = spot.y;
    act(fauna, wolf);
    expect(fauna.store.state[wolf]).toBe(State.Eat);
  });

  it('a carcass across a river or a lake is out of reach: the hungry wolf does not get stuck on the shore', () => {
    const sim = new Simulation(3, data);
    const { fauna } = sim;
    let spot: { x: number; y: number } | null = null;
    for (let y = 20; y < SIZE - 20 && !spot; y++) {
      for (let x = 20; x < SIZE - 20 && !spot; x++) {
        if (fauna.isWalkable(x, y) && !fauna.isWalkable(x, y - 1) && !fauna.isWalkable(x, y - 2) && fauna.isWalkable(x, y - 3)) spot = { x, y };
      }
    }
    expect(spot).not.toBeNull();
    const { x, y } = spot!;
    clearAround(sim, x + 0.5, y + 0.5, data.fauna.behavior.trackTiles + 2, []);
    fauna.carrion.tiles.length = 0;
    fauna.carrion.meat.length = 0;
    const wolf = fauna.spawn(code('wolf'), x + 0.5, y + 0.5, fauna.groups.add(code('wolf'), -1), 4 * fauna.daysPerYear);
    fauna.groups.leader[fauna.store.group[wolf]!] = wolf;
    fauna.carrion.add((y - 3) * SIZE + x, 30);
    fauna.store.hunger[wolf] = 80;
    fauna.store.thirst[wolf] = 0;
    think(fauna, wolf);
    const aimsAtIt = fauna.store.state[wolf] === State.Forage && Math.floor(fauna.store.targetY[wolf]!) === y - 3 && Math.floor(fauna.store.targetX[wolf]!) === x;
    expect(aimsAtIt).toBe(false);
  });

  it('a carcass rots fast in the heat and hardly in the frost', () => {
    const rot = data.fauna.carrion;
    const left = (celsius: number): number => {
      const carrion = new Carrion();
      carrion.add(0, 100);
      const factor = Math.min(rot.maxFactor, Math.max(rot.minFactor, Math.pow(2, (celsius - rot.referenceCelsius) / rot.doublingCelsius)));
      for (let d = 0; d < 5; d++) carrion.rot(() => Math.pow(0.5, factor / rot.halfLifeDays), rot.minimumMeat);
      return carrion.at(0);
    };
    expect(left(-20)).toBeGreaterThan(80);
    expect(left(15)).toBeGreaterThan(30);
    expect(left(15)).toBeLessThan(60);
    expect(left(35)).toBeLessThan(15);
  });

  it('meat spoilt in a camp is thrown away: the scavengers get it', () => {
    const sim = new Simulation(42, data);
    const { production, fauna } = sim;
    const meat = production.catalog.itemIndex.get('meat')!;
    // A camp nobody lives in any more (nobody eats the meat before it goes bad).
    const camp = production.camps.length;
    production.openCamp(camp, production.camps[0]!.center + 30, -1);
    production.storeInCamp(camp, meat, 40, 0.5);
    const tile = production.stockTile(camp);
    production.dailyUpdate();
    const left = production.stockOf(camp).count(meat);
    expect(left).toBeLessThan(40);
    expect(fauna.carrion.at(tile)).toBeCloseTo(40 - left, 5);
  });
});
