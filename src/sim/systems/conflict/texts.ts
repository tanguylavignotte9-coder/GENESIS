import type { EventPlace } from '../../core/journal';
import { fillTemplate } from '../../core/text';
import { describeLocation } from '../world/places';
import type { ConflictSystem } from './conflict-system';

/** Journal event types of the conflict system. */
export const CONFLICT_EVENTS = {
  brawl: 'conflict.brawl',
  exile: 'conflict.exile',
  spared: 'conflict.spared',
  feud: 'conflict.feud',
  revenge: 'conflict.revenge',
  feudEnds: 'conflict.feudEnds',
  raid: 'conflict.raid',
  war: 'conflict.war',
  battle: 'conflict.battle',
  deserted: 'conflict.deserted',
  captives: 'conflict.captives',
  conquest: 'conflict.conquest',
  tribute: 'conflict.tribute',
  tributePaid: 'conflict.tributePaid',
  peace: 'conflict.peace',
  truce: 'conflict.truce',
  envoy: 'conflict.envoy',
  envoyLost: 'conflict.envoyLost',
  tooLate: 'conflict.tooLate',
  betrayal: 'conflict.betrayal',
  civilWar: 'conflict.civilWar',
  collapse: 'conflict.collapse',
} as const;

/** A place at a tile (x, y), named. */
export function placeAt(sys: ConflictSystem, x: number, y: number): EventPlace {
  return { x, y, label: describeLocation(sys.humans.world, x, y) };
}

/** Where a person is (their camp), or null. */
export function placeOfPerson(sys: ConflictSystem, person: number): EventPlace | null {
  const camp = sys.humans.camps[sys.humans.people.camp[person]!];
  return camp ? placeAt(sys, camp.centerX, camp.centerY) : null;
}

/** Publishes an event of the conflict system: its text, place, people and groups involved, causes. */
export function publish(
  sys: ConflictSystem,
  type: string,
  template: string,
  vars: Record<string, string>,
  place: EventPlace | null,
  people: readonly number[],
  causes: readonly number[],
  details: Record<string, string | number> = {},
  groups: readonly number[] = [],
): number {
  const text = fillTemplate(template, vars);
  return sys.journal.publish({
    tick: sys.tick,
    type,
    text: text.charAt(0).toUpperCase() + text.slice(1),
    place,
    actors: [...groups.map((id) => ({ kind: 'group', id })), ...[...new Set(people)].filter((id) => id >= 0).map((id) => ({ kind: 'human', id }))],
    causes: [...new Set(causes)].filter((id) => id >= 0 && sys.journal.get(id) !== undefined),
    details,
  });
}

/** "e" for a woman. */
export function e(sys: ConflictSystem, person: number): string {
  return sys.humans.people.female[person] === 1 ? 'e' : '';
}

export function il(sys: ConflictSystem, person: number): string {
  return sys.humans.people.female[person] === 1 ? 'elle' : 'il';
}

/** "Ka", "Ka et Lo", "Ka, Lo et Mi". */
export function listNames(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} et ${names.at(-1)!}`;
}

/** Plural mark: "" or "s". */
export function plural(n: number, mark = 's'): string {
  return n > 1 ? mark : '';
}
