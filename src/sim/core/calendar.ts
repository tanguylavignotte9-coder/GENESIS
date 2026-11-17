import { daysPerYear, type TimeParams } from './time-params';

/** A date of the game calendar. Year, season day and day of year start at 1 for display. */
export interface GameDate {
  /** Days elapsed since the start of the world (0-based). */
  absoluteDay: number;
  /** 1-based year. */
  year: number;
  /** 0-based index into TimeParams.seasons. */
  season: number;
  /** 1-based day within the season. */
  dayOfSeason: number;
  /** 0-based day within the year. */
  dayOfYear: number;
}

export function dateAtTick(tick: number, params: TimeParams): GameDate {
  const absoluteDay = Math.floor(tick / params.ticksPerDay);
  const perYear = daysPerYear(params);
  const dayOfYear = absoluteDay % perYear;
  return {
    absoluteDay,
    year: Math.floor(absoluteDay / perYear) + 1,
    season: Math.floor(dayOfYear / params.daysPerSeason),
    dayOfSeason: (dayOfYear % params.daysPerSeason) + 1,
    dayOfYear,
  };
}

/** "Jour 3 · Printemps · An 12" */
export function formatDate(date: GameDate, params: TimeParams): string {
  return `Jour ${date.dayOfSeason} · ${params.seasons[date.season] ?? '?'} · An ${date.year}`;
}
