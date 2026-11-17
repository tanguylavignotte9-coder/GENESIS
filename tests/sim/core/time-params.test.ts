import { describe, expect, it } from 'vitest';
import { dateAtTick, formatDate } from '../../../src/sim/core/calendar';
import { DataFileError } from '../../../src/sim/core/data-validation';
import { loadGameData } from '../../../src/sim/core/game-data';
import { daysPerYear, parseTimeParams, ticksPerYear } from '../../../src/sim/core/time-params';

const VALID = {
  ticksPerRealSecond: 10,
  ticksPerDay: 100,
  daysPerSeason: 10,
  seasons: ['Printemps', 'Été', 'Automne', 'Hiver'],
  speeds: [1, 5, 25, 100, 500],
};

describe('time parameters (data/time.json)', () => {
  it('the bundled data/time.json is valid and matches the design (4 seasons of 10 days, 8 min per day at x1)', () => {
    const { time } = loadGameData();
    expect(daysPerYear(time)).toBe(40);
    expect(time.seasons).toHaveLength(4);
    expect(time.ticksPerDay / time.ticksPerRealSecond).toBe(8 * 60);
    expect(time.speeds).toEqual([1, 5, 25, 100, 500]);
  });

  it('computes ticks per year from the data', () => {
    expect(ticksPerYear(parseTimeParams(VALID))).toBe(4000);
  });

  it('rejects a non-object file', () => {
    expect(() => parseTimeParams([1, 2])).toThrow(DataFileError);
  });

  it('lists every problem in French: missing, wrong type, unknown key', () => {
    const { ticksPerDay: _missing, ...rest } = VALID;
    const raw = { ...rest, ticksPerRealSecond: 'dix', daysPerSeason: 0, ticksPerDai: 5 };
    let message = '';
    try {
      parseTimeParams(raw);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('data/time.json');
    expect(message).toContain('« ticksPerRealSecond » doit être un nombre entier');
    expect(message).toContain('« daysPerSeason » doit être un nombre entier supérieur ou égal à 1');
    expect(message).toContain('la clé « ticksPerDay » est manquante');
    expect(message).toContain('la clé « ticksPerDai » est inconnue');
  });
});

describe('calendar', () => {
  const params = parseTimeParams(VALID);

  it('starts on day 1 of spring, year 1', () => {
    expect(formatDate(dateAtTick(0, params), params)).toBe('Jour 1 · Printemps · An 1');
  });

  it('moves through days, seasons and years', () => {
    expect(formatDate(dateAtTick(2 * 100 + 99, params), params)).toBe('Jour 3 · Printemps · An 1');
    expect(formatDate(dateAtTick(10 * 100, params), params)).toBe('Jour 1 · Été · An 1');
    expect(formatDate(dateAtTick(39 * 100, params), params)).toBe('Jour 10 · Hiver · An 1');
    const date = dateAtTick((40 * 11 + 22) * 100, params);
    expect(formatDate(date, params)).toBe('Jour 3 · Automne · An 12');
    expect(date.dayOfYear).toBe(22);
    expect(date.absoluteDay).toBe(462);
  });
});
