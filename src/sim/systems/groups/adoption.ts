import { Family } from '../ideas/idea';
import { religionLabel } from '../ideas/religion';
import type { GroupsSystem } from './groups-system';
import { capitalize } from './membership';
import { GROUP_EVENTS, publishGroupEvent } from './texts';

/** Days between two looks at the ideas of the members (technical rhythm, like the politics). */
const EVERY_DAYS = 10;
/** Share of the adults a religion or a good of exchange needs to be the group's. */
const MAJORITY = 0.5;

/**
 * Tribes and clans adopt the culture and the language most of their members carry; a religion or a
 * good of exchange only once at least half of their adults hold it. A tribe that adopts a religion
 * says so in the journal.
 */
export function adoptIdeas(sys: GroupsSystem): void {
  const ideas = sys.ideas;
  if (!ideas || sys.day % EVERY_DAYS !== 0) return;
  const adultAge = sys.params.adultAge;
  for (const group of sys.groups) {
    if (!group.alive || group.level > 1 || group.members.length === 0) continue;
    group.culture = ideas.dominant(group, Family.Culture, adultAge).idea;
    group.language = ideas.dominant(group, Family.Language, adultAge).idea;
    const currency = ideas.dominant(group, Family.Currency, adultAge);
    group.currency = currency.share >= MAJORITY ? currency.idea : -1;
    const faith = ideas.dominant(group, Family.Religion, adultAge);
    const religion = faith.share >= MAJORITY ? faith.idea : -1;
    if (religion === group.religion) continue;
    group.religion = religion;
    if (religion < 0 || group.level !== 0) continue;
    const idea = ideas.ideas[religion]!;
    const adults = sys.adults(group).length;
    publishGroupEvent(
      sys,
      GROUP_EVENTS.religion,
      sys.params.texts.religionAdopted,
      { groupe: capitalize(group.name), religion: religionLabel(idea), fideles: String(Math.round(faith.share * adults)), total: String(adults) },
      group,
      [],
      [idea.event],
      { religion },
    );
  }
}
