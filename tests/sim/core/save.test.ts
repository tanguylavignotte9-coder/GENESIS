import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/sim/core/simulation';
import { loadWorld, saveWorld, SAVE_FORMAT_VERSION, SaveError } from '../../../src/sim/core/save/save';
import { readGraph, writeGraph } from '../../../src/sim/core/save/graph';
import { defaultRawData } from '../../../src/sim/core/game-data';
import { ticksPerYear } from '../../../src/sim/core/time-params';
import { dataWithSize } from '../world/helpers';

const SIZE = 192;

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('the object graph copy', () => {
  class Point {
    constructor(
      public x: number,
      public y: number,
    ) {}
    norm(): number {
      return Math.hypot(this.x, this.y);
    }
  }
  const classes = { Point };

  it('keeps shared references, classes, typed arrays sharing a buffer, maps, sets and odd numbers', () => {
    const shared = new Point(3, 4);
    const buffer = new Float32Array([1, 2, 3, 4]);
    const root = {
      a: shared,
      b: [shared, undefined, NaN, -0, Infinity, 'été'],
      whole: buffer,
      part: buffer.subarray(1, 3),
      map: new Map<string, Point>([['p', shared]]),
      set: new Set([1, 2]),
      sparse: [1, , 3],
    };
    const copy = readGraph(writeGraph(root, classes), classes) as typeof root;
    expect(copy.a).toBeInstanceOf(Point);
    expect(copy.a.norm()).toBe(5);
    expect(copy.b[0]).toBe(copy.a);
    expect(copy.map.get('p')).toBe(copy.a);
    expect(copy.b.slice(1, 6)).toEqual([undefined, NaN, -0, Infinity, 'été']);
    expect(Object.is(copy.b[3], -0)).toBe(true);
    copy.whole[1] = 9;
    expect(copy.part[0]).toBe(9);
    expect([...copy.set]).toEqual([1, 2]);
    expect(1 in copy.sparse).toBe(false);
  });

  it('refuses an undeclared class or a function, in French', () => {
    class Hidden {}
    expect(() => writeGraph({ h: new Hidden() }, classes)).toThrow(/classe « Hidden » non déclarée/);
    expect(() => writeGraph({ f: () => 1 }, classes)).toThrow(SaveError);
  });
});

describe('saving a world', () => {
  it('a world saved then loaded goes on exactly like the same world never stopped', () => {
    const data = dataWithSize(SIZE);
    const original = new Simulation(5, data);
    original.step(ticksPerYear(data.time) / 2 + 777);
    const { meta, body } = saveWorld(original);
    expect(meta.formatVersion).toBe(SAVE_FORMAT_VERSION);
    expect(meta.seed).toBe(5);
    expect(meta.population).toBe(original.humans.people.living);
    const { simulation: loaded } = loadWorld(body);
    const days = 12;
    original.step(days * data.time.ticksPerDay + 33);
    loaded.step(days * data.time.ticksPerDay + 33);
    expect(loaded.clock.tick).toBe(original.clock.tick);
    expect(loaded.journal.size).toBe(original.journal.size);
    expect(sameBytes(saveWorld(loaded).body, saveWorld(original).body)).toBe(true);
    expect(loaded.rng.nextUint32()).toBe(original.rng.nextUint32());
  });

  it('keeps the workshop state and refuses another format version with a clear message', () => {
    const data = dataWithSize(SIZE);
    const simulation = new Simulation(5, data);
    const raw = defaultRawData();
    const { body } = saveWorld(simulation, { raw, presetName: 'Loups affamés', modified: true });
    expect(loadWorld(body).workshop.presetName).toBe('Loups affamés');
    const older = body.slice();
    new DataView(older.buffer).setUint32(0, SAVE_FORMAT_VERSION - 1 + 1000, true);
    expect(() => loadWorld(older)).toThrow(/Sauvegarde incompatible : elle a été faite par une version plus récente/);
    new DataView(older.buffer).setUint32(0, 0, true);
    expect(() => loadWorld(older)).toThrow(/version plus ancienne/);
    expect(() => loadWorld(new Uint8Array(3))).toThrow(SaveError);
  });
});
