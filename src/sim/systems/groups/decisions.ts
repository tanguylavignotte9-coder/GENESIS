import type { Group } from './group';
import type { GroupsSystem } from './groups-system';
import type { Factor } from './params';

/**
 * Visual governance (step 10.5): each collective decision of a group's leaders is kept with the
 * options they weighed, what weighed on each and why the others were set aside. A few per group,
 * the latest first; a decision that only confirms the previous one of its kind updates it.
 */

/** Decisions kept per group. */
const KEPT = 12;
const PERCENT = 100;

export interface DecisionOption {
  name: string;
  score: number;
  /** What weighed, one line each ("les réserves abondent : +0,6"). */
  reasons: string[];
}

export interface DecisionRecord {
  day: number;
  /** "Stratégie", "Régime", "Déplacement du camp", "Guerre"… */
  title: string;
  /** Index of the chosen option. */
  chosen: number;
  options: DecisionOption[];
  /** Who decided and how ("le chef Ka", "le conseil", "toute la bande"). */
  decidedBy: string;
  /** Why the best-scored option was not taken, if so ("la coutume en place a son poids"). */
  note: string;
}

const signed = (value: number): string => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2).replace('.', ',')}`;

/** Keeps a decision (a repeat of the last one of the same title and outcome only updates its day). */
export function recordDecision(group: Group, record: DecisionRecord): void {
  const last = group.decisions.find((decision) => decision.title === record.title);
  if (last && last.chosen === record.chosen && last.options[last.chosen]?.name === record.options[record.chosen]?.name) {
    group.decisions.splice(group.decisions.indexOf(last), 1);
  }
  group.decisions.unshift(record);
  if (group.decisions.length > KEPT) group.decisions.length = KEPT;
}

/** Who decides in a group, in words. */
export function deciders(sys: GroupsSystem, group: Group): string {
  const regime = sys.params.regimes[group.regime]!;
  if (group.leaders.length === 0 || regime.decision === 'consensus') return 'tous les adultes, ensemble';
  const names = group.leaders.map((leader) => sys.people.names[leader] ?? '?');
  if (regime.decision === 'council') return `le conseil (${names.join(', ')})`;
  return `${regime.title} ${names[0]}`;
}

/** The score of a rule or strategy for a leader, with what weighed on it (traits of the leader, situation). */
export function explainOption(
  sys: GroupsSystem,
  option: { name: string; traits: Record<string, number>; favors?: Partial<Record<string, number>> },
  leader: number,
  factors: Record<string, number>,
): DecisionOption {
  let score = 0;
  const reasons: string[] = [];
  if (leader >= 0) {
    for (const [trait, weight] of Object.entries(option.traits)) {
      const value = sys.humans.social.trait(leader, trait);
      const part = weight * (2 * value - 1);
      score += part;
      const name = sys.humans.params.traits.find((t) => t.id === trait)?.name ?? trait;
      if (Math.abs(part) >= 0.01) reasons.push(`caractère de ${sys.people.names[leader] ?? '?'} : ${name.toLowerCase()} ${Math.round(value * PERCENT)} % → ${signed(part)}`);
    }
  }
  for (const [factor, weight] of Object.entries(option.favors ?? {})) {
    const part = (weight ?? 0) * (factors[factor] ?? 0);
    score += part;
    if (Math.abs(part) >= 0.01) reasons.push(`${sys.params.factorTexts[factor as Factor] ?? factor} (${Math.round((factors[factor] ?? 0) * PERCENT)} %) → ${signed(part)}`);
  }
  return { name: option.name, score, reasons };
}
