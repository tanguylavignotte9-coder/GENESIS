import type { JournalEvent } from '../../core/journal';
import { GROUP_EVENTS } from '../groups/texts';
import { battle, muster, toll } from './combat';
import type { ConflictSystem } from './conflict-system';
import { CONFLICT_EVENTS, placeAt, plural, publish } from './texts';

const NEUTRAL = 50;

/**
 * A contest that failed inside a tribe whose power lost its legitimacy may turn to civil war: the
 * claimant and those who back him take up arms against the leaders and their loyal. The winners
 * hold the power; a beaten claimant is driven out.
 */
export function civilWars(sys: ConflictSystem, events: readonly JournalEvent[]): void {
  const { params, groups, humans } = sys;
  for (const event of events) {
    if (event.type !== GROUP_EVENTS.contested) continue;
    const challenger = Number(event.details['challenger'] ?? -1);
    const supporters = Number(event.details['supporters'] ?? 0);
    const adults = Number(event.details['adults'] ?? 0);
    const tribe = sys.tribe(Number(event.details['group'] ?? -1));
    if (!tribe || challenger < 0 || humans.people.alive[challenger] !== 1 || adults <= 0 || tribe.leaders.length === 0 || tribe.camp < 0) continue;
    if (supporters / adults < params.civilWar.minShare || tribe.legitimacy >= params.civilWar.maxLegitimacy) continue;
    const social = humans.social;
    if (Math.max(social.trait(challenger, 'temper'), social.trait(challenger, 'ambition')) < params.civilWar.angerTrait || sys.rng.nextFloat() >= params.civilWar.chance) continue;
    const chief = tribe.leaders[0]!;
    // Those who think little of the leaders follow the claimant; the others stand by the leaders.
    const fighters = tribe.members.filter((p) => sys.isFighter(p) && p !== challenger && !tribe.leaders.includes(p));
    const rebels = [challenger, ...fighters.filter((p) => groups.approval[p * 3]! < NEUTRAL && social.affectionFor(p, challenger) >= 0)];
    const loyal = [...tribe.leaders.filter((p) => humans.people.alive[p] === 1), ...fighters.filter((p) => !rebels.includes(p))];
    if (rebels.length < 2 || loyal.length === 0) continue;
    sys.counts.civilWars++;
    sys.currentFight = 'civil';
    const sides = [muster(sys, rebels, tribe.camp, 1, false), muster(sys, loyal, tribe.camp, 1, false)] as [ReturnType<typeof muster>, ReturnType<typeof muster>];
    const result = battle(sys, sides, [`en se soulevant contre ${humans.people.names[chief]}`, `en défendant ${humans.people.names[chief]}`], [event.id], false);
    const camp = humans.camps[tribe.camp]!;
    sys.noteBattle(camp.centerX, camp.centerY, tribe.id, tribe.id);
    const names: [string, string] = ['les rebelles', 'les fidèles'];
    let issue: string;
    if (result.winner === 0 && humans.people.alive[challenger] === 1) issue = `${humans.people.names[challenger]} l’emporte et prend le pouvoir (${toll(result, names)}).`;
    else if (humans.people.alive[challenger] === 1) issue = `Les rebelles sont battus (${toll(result, names)}) ; ${humans.people.names[challenger]} est chassé de la tribu.`;
    else issue = `${humans.people.names[challenger]} meurt dans la bataille (${toll(result, names)}).`;
    const war = publish(sys, CONFLICT_EVENTS.civilWar, params.texts.civilWar, { tribu: tribe.name, nom: humans.people.names[challenger]!, soutiens: String(rebels.length - 1), s: plural(rebels.length - 1), chef: humans.people.names[chief]!, raison: `légitimité ${Math.round(tribe.legitimacy)}`, issue }, placeAt(sys, camp.centerX, camp.centerY), [challenger, chief], [event.id], { winner: result.winner }, [tribe.id]);
    if (humans.people.alive[challenger] !== 1) continue;
    if (result.winner === 0) groups.seizePower(tribe, challenger, war);
    else groups.exile(challenger, war);
  }
}
