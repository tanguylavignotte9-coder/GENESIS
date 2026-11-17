import { validateData, type Schema } from './data-validation';

/** Time settings, read from data/time.json. */
export interface TimeParams {
  /** Simulation ticks computed per real second at normal speed (x1). */
  ticksPerRealSecond: number;
  /** Ticks in one game day. */
  ticksPerDay: number;
  daysPerSeason: number;
  /** Season names (shown to the player), in calendar order. A year = all seasons. */
  seasons: string[];
  /** Speed multipliers offered to the player (pause is separate). */
  speeds: number[];
}

const TIME_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    ticksPerRealSecond: { kind: 'integer', min: 1 },
    ticksPerDay: { kind: 'integer', min: 1 },
    daysPerSeason: { kind: 'integer', min: 1 },
    seasons: { kind: 'array', minLength: 1, items: { kind: 'string' } },
    speeds: { kind: 'array', minLength: 1, items: { kind: 'number', min: 0.01 } },
  },
};

export function parseTimeParams(raw: unknown): TimeParams {
  return validateData<TimeParams>('data/time.json', raw, TIME_SCHEMA);
}

export function daysPerYear(params: TimeParams): number {
  return params.daysPerSeason * params.seasons.length;
}

export function ticksPerYear(params: TimeParams): number {
  return params.ticksPerDay * daysPerYear(params);
}
