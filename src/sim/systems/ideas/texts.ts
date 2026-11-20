import { fillTemplate } from '../../core/text';
import type { EventPlace } from '../../core/journal';
import { describeLocation } from '../world/places';
import type { IdeasSystem } from './ideas-system';

/** Journal event types of the ideas system. */
export const IDEA_EVENTS = {
  discovery: 'ideas.discovery',
  learnedAbroad: 'ideas.learnedAbroad',
  lost: 'ideas.lost',
  culture: 'ideas.culture',
  language: 'ideas.language',
  religion: 'ideas.religion',
  religionAdopted: 'ideas.religionAdopted',
  schism: 'ideas.schism',
  clergy: 'ideas.clergy',
  currency: 'ideas.currency',
  trade: 'ideas.trade',
  misunderstanding: 'ideas.misunderstanding',
  interpreter: 'ideas.interpreter',
} as const;

/** Where a person is (their camp). */
export function placeOfPerson(sys: IdeasSystem, person: number): EventPlace | null {
  const humans = sys.humans;
  const camp = humans.camps[humans.people.camp[person]!];
  if (!camp) return null;
  return { x: camp.centerX, y: camp.centerY, label: describeLocation(humans.world, camp.centerX, camp.centerY) };
}

/** Publishes an event of the ideas system; `person` (if any) is its first actor and gives its place. */
export function publishIdeaEvent(
  sys: IdeasSystem,
  type: string,
  template: string,
  vars: Record<string, string>,
  person: number,
  causes: readonly number[],
  details: Record<string, string | number> = {},
  others: readonly number[] = [],
): number {
  const actors = [...(person >= 0 ? [person] : []), ...others].map((id) => ({ kind: 'human', id }));
  return sys.journal.publish({
    tick: sys.tick,
    type,
    text: capitalize(fillTemplate(template, vars)),
    place: person >= 0 ? placeOfPerson(sys, person) : null,
    actors,
    causes: [...new Set(causes)].filter((id) => id >= 0 && sys.journal.get(id) !== undefined),
    details,
  });
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Ka", "Ka et Lo", "Ka, Lo et Mi". */
export function listWords(words: readonly string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} et ${words.at(-1)!}`;
}
