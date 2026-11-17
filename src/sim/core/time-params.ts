import { validateData, type Schema } from './data-validation';

/** Time settings, read from data/time.json. */
export interface TimeParams {
  /** Simulation ticks computed per real second at normal speed (x1). */
  ticksPerRealSecond: number;
  /** Ticks in one game day. */
  ticksPerDay: number;
  /** Days in one game year (compressed calendar). */
  daysPerYear: number;
}

const TIME_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    ticksPerRealSecond: { kind: 'integer', min: 1 },
    ticksPerDay: { kind: 'integer', min: 1 },
    daysPerYear: { kind: 'integer', min: 1 },
  },
};

export function parseTimeParams(raw: unknown): TimeParams {
  return validateData<TimeParams>('data/time.json', raw, TIME_SCHEMA);
}

export function ticksPerYear(params: TimeParams): number {
  return params.ticksPerDay * params.daysPerYear;
}
