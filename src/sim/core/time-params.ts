import { int, num, text, validateData, type Schema } from './data-validation';

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

export const TIME_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    ticksPerRealSecond: int(1, 1000, 'Tics par seconde réelle', 'Pas de simulation calculés par seconde réelle en vitesse x1 (la vitesse x500 en calcule 500 fois plus).', 'tics/s'),
    ticksPerDay: int(24, 100000, 'Tics par jour', 'Nombre de pas de simulation dans une journée de jeu (4 800 tics à 10 par seconde = 8 minutes réelles en x1).', 'tics', 'newWorld'),
    daysPerSeason: int(1, 100, 'Jours par saison', 'Durée d’une saison ; une année compte toutes les saisons.', 'jours', 'newWorld'),
    seasons: {
      kind: 'array',
      minLength: 1,
      items: text('Nom de saison', 'Noms des saisons, dans l’ordre du calendrier (affichés dans la date).', 'newWorld'),
    },
    speeds: {
      kind: 'array',
      minLength: 1,
      maxLength: 9,
      items: num(0.01, 5000, 'Vitesse proposée', 'Multiplicateurs de vitesse des boutons (touches 1 à 9) ; la pause est à part.', 'facteur'),
    },
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
