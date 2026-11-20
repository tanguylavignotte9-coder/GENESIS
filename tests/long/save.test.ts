import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../src/sim/core/game-data';
import { Simulation } from '../../src/sim/core/simulation';
import { loadWorld, saveWorld } from '../../src/sim/core/save/save';
import { ticksPerYear } from '../../src/sim/core/time-params';

/**
 * The real map, a world grown for years (births, deaths, buildings, groups…): saved at year N, then
 * loaded, it goes on exactly like the same world never interrupted.
 */
describe('saving a grown world', () => {
  it('saved at year 12 then loaded, the world goes on exactly like the uninterrupted one', () => {
    const data = loadGameData();
    const original = new Simulation(3, data);
    original.step(12 * ticksPerYear(data.time) + 1234);
    const { body } = saveWorld(original);
    const { simulation: loaded } = loadWorld(body);
    const more = ticksPerYear(data.time);
    original.step(more);
    loaded.step(more);
    const a = saveWorld(original).body;
    const b = saveWorld(loaded).body;
    expect(b.length).toBe(a.length);
    let firstDifference = -1;
    for (let i = 0; i < a.length && firstDifference < 0; i++) if (a[i] !== b[i]) firstDifference = i;
    expect(firstDifference).toBe(-1);
    expect(loaded.journal.size).toBe(original.journal.size);
    expect(loaded.humans.people.living).toBe(original.humans.people.living);
  }, 600_000);
});
