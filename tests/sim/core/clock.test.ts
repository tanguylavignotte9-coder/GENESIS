import { describe, expect, it } from 'vitest';
import { SimClock } from '../../../src/sim/core/clock';

describe('SimClock', () => {
  it('starts at tick 0 and advances one tick at a time', () => {
    const clock = new SimClock();
    expect(clock.tick).toBe(0);
    clock.advance();
    clock.advance();
    expect(clock.tick).toBe(2);
  });
});
