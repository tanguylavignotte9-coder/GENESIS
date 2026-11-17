import { describe, expect, it } from 'vitest';
import { DataFileError } from '../../../src/sim/core/data-validation';
import { loadGameData } from '../../../src/sim/core/game-data';
import { parseTimeParams, ticksPerYear } from '../../../src/sim/core/time-params';

const VALID = { ticksPerRealSecond: 10, ticksPerDay: 100, daysPerYear: 40 };

describe('time parameters (data/time.json)', () => {
  it('the bundled data/time.json is valid', () => {
    expect(() => loadGameData()).not.toThrow();
  });

  it('computes ticks per year from the data', () => {
    expect(ticksPerYear(parseTimeParams(VALID))).toBe(4000);
  });

  it('rejects a non-object file', () => {
    expect(() => parseTimeParams([1, 2])).toThrow(DataFileError);
  });

  it('lists every problem in French: missing, wrong type, unknown key', () => {
    const raw = { ticksPerRealSecond: 'dix', daysPerYear: 0, ticksPerDai: 5 };
    let message = '';
    try {
      parseTimeParams(raw);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('data/time.json');
    expect(message).toContain('« ticksPerRealSecond » doit être un nombre entier');
    expect(message).toContain('« daysPerYear » doit être un nombre entier supérieur ou égal à 1');
    expect(message).toContain('la clé « ticksPerDay » est manquante');
    expect(message).toContain('la clé « ticksPerDai » est inconnue');
  });
});
