import { describe, expect, it } from 'vitest';
import { Journal, type NewEvent } from '../../../src/sim/core/journal';

const event = (causes: number[] = []): NewEvent => ({
  tick: 10,
  type: 'test.event',
  text: 'Un événement',
  place: { x: 1, y: 2, label: 'quelque part' },
  actors: [],
  causes,
  details: {},
});

describe('Journal', () => {
  it('gives sequential ids and keeps events in order', () => {
    const journal = new Journal();
    expect(journal.publish(event())).toBe(0);
    expect(journal.publish(event([0]))).toBe(1);
    expect(journal.size).toBe(2);
    expect(journal.since(1).map((e) => e.id)).toEqual([1]);
    expect(journal.get(1)?.causes).toEqual([0]);
  });

  it('refuses a cause that does not exist (every "why" must be traceable)', () => {
    const journal = new Journal();
    expect(() => journal.publish(event([3]))).toThrow(/cause inconnue/);
  });
});
