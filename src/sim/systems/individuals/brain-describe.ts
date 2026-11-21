import type { BrainFacts, BrainLink, BrainNode, BrainOption } from '../../core/brain-facts';
import { dateAtTick, formatDate } from '../../core/calendar';
import type { TimeParams } from '../../core/time-params';
import type { BrainTrace, FactorTrace } from './brain-trace';
import type { IndividualsSystem } from './individuals-system';
import { ChangeWhy, DECISION_HISTORY } from './people';
import { INPUTS, type Input } from './params';

/**
 * Visual brain of a person (step 10.5), in words: what they feel and know on the left, the actions
 * with their score on the right, what pushes and what holds back each of them, the detail of every
 * score and the last changes of activity with their reason. Read only.
 */

const PERCENT = 100;
/** Actions drawn in the network (the best ones, plus the chosen one). */
const SHOWN_ACTIONS = 9;
/** A link weaker than this is not drawn. */
const MIN_LINK = 0.08;

/** How the brain's inputs are named and grouped on the left of the network. */
const INPUT_LABELS: Partial<Record<Input, [string, string]>> = {
  hunger: ['Faim', 'Besoins'],
  thirst: ['Soif', 'Besoins'],
  fatigue: ['Fatigue', 'Besoins'],
  cold: ['Froid', 'Besoins'],
  sick: ['Malade', 'Besoins'],
  danger: ['Peur d’un danger', 'Émotions'],
  joy: ['Joie', 'Émotions'],
  sadness: ['Tristesse', 'Émotions'],
  anger: ['Colère', 'Émotions'],
  fear: ['Peur', 'Émotions'],
  jealousy: ['Jalousie', 'Émotions'],
  loneliness: ['Solitude', 'Émotions'],
  stockLow: ['Réserves de nourriture à faire', 'Obligations'],
  woodLow: ['Réserves de bois à faire', 'Obligations'],
  buildNeed: ['Chantier à mener', 'Obligations'],
  craftNeed: ['Objets à fabriquer', 'Obligations'],
  herdNeed: ['Bêtes à soigner', 'Obligations'],
  fireLow: ['Le feu baisse', 'Obligations'],
  depositUrge: ['Rapporter au camp', 'Obligations'],
  wantsFriends: ['Se faire des amis', 'Ambitions'],
  wantsPartner: ['Trouver un compagnon', 'Ambitions'],
  wantsEsteem: ['Regagner l’estime', 'Ambitions'],
  chatPartner: ['Quelqu’un à qui parler', 'Entourage'],
  confidant: ['Un confident', 'Entourage'],
  consolable: ['Un proche à consoler', 'Entourage'],
  suitor: ['Quelqu’un qui plaît', 'Entourage'],
  grievance: ['Une rancune', 'Entourage'],
  needyNear: ['Un affamé tout près', 'Entourage'],
  isolation: ['Loin des autres', 'Entourage'],
  playmates: ['D’autres enfants', 'Entourage'],
  guardianAway: ['Loin de son parent', 'Entourage'],
  night: ['Nuit', 'Situation'],
  day: ['Jour', 'Situation'],
  hasFood: ['De quoi manger', 'Situation'],
  load: ['Charge portée', 'Situation'],
  hasFuel: ['Du bois à portée', 'Situation'],
  fireLit: ['Feu allumé', 'Situation'],
  awayFromCamp: ['Loin du camp', 'Situation'],
  infant: ['Tout-petit', 'Situation'],
  child: ['Enfant', 'Situation'],
  young: ['Jeune', 'Situation'],
  always: ['Toujours possible', 'Situation'],
  warCall: ['Appel aux armes', 'Obligations'],
  envoyCall: ['Mission d’émissaire', 'Obligations'],
};

export function inputLabel(input: number): string {
  const id = INPUTS[input];
  return id ? (INPUT_LABELS[id]?.[0] ?? id) : '?';
}

function inputGroup(input: number): string {
  const id = INPUTS[input];
  return id ? (INPUT_LABELS[id]?.[1] ?? 'Situation') : 'Situation';
}

const pct = (value: number): string => `${Math.round(value * PERCENT)} %`;
const times = (factor: number): string => `×${factor.toFixed(2).replace('.', ',')}`;

function factorLabel(sys: IndividualsSystem, factor: FactorTrace): string {
  switch (factor.kind) {
    case 'weight':
      return 'importance de base';
    case 'input':
      return `${inputLabel(factor.index).toLowerCase()} ${pct(factor.value)}`;
    case 'trait':
      return `${(sys.params.traits[factor.index]?.name ?? '?').toLowerCase()} ${pct(factor.value)}`;
    case 'culture':
      return 'valeurs de sa culture';
    case 'ambition':
      return 'ambition : exceller dans ce métier';
    case 'random':
      return 'humeur du moment (hasard)';
    case 'keep':
      return 'habitude : on finit ce qu’on a commencé';
    case 'work':
      return 'travail en cours';
  }
}

/** Node id of a factor on the left (inputs and traits; the rest has no node). */
function nodeOf(factor: FactorTrace): string | null {
  if (factor.kind === 'input') return INPUTS[factor.index] === 'always' ? null : `i${factor.index}`;
  if (factor.kind === 'trait') return `t${factor.index}`;
  if (factor.kind === 'culture') return 'culture';
  if (factor.kind === 'ambition') return 'ambition';
  return null;
}

/** Green when it pushes, red when it holds back; strength 0..1. */
function linkOf(factor: FactorTrace): { push: boolean; strength: number } {
  if (factor.kind === 'input') return factor.factor >= 0.5 ? { push: true, strength: factor.factor } : { push: false, strength: 1 - factor.factor };
  return factor.factor >= 1 ? { push: true, strength: Math.min(1, factor.factor - 1) } : { push: false, strength: Math.min(1, 1 - factor.factor) };
}

function when(tick: number, time: TimeParams): string {
  const date = dateAtTick(tick, time);
  const hour = Math.floor(((tick % time.ticksPerDay) / time.ticksPerDay) * 24);
  return `${formatDate(date, time)} · ${hour} h`;
}

/** The visual brain of a person: last decision (if watched since) and history of changes. */
export function describeBrain(sys: IndividualsSystem, person: number, time: TimeParams, seasonName: string): BrainFacts {
  const { people } = sys;
  const action = sys.actions[people.action[person]!];
  const facts: BrainFacts = { kind: 'human', id: person, name: people.names[person] ?? '?', when: '', doing: action?.def.label ?? '', nodes: [], options: [], links: [], history: history(sys, person, time), note: '' };
  if (people.alive[person] !== 1) {
    facts.note = 'Cette personne est morte : son cerveau ne décide plus rien.';
    return facts;
  }
  const trace = sys.watch.person === person ? sys.watch.trace : null;
  if (!trace || trace.person !== person) {
    facts.note = 'En attente de sa prochaine décision (lancez le temps un instant si le jeu est en pause).';
    return facts;
  }
  facts.when = when(trace.tick, time);
  const shown = shownActions(trace);
  const used = new Map<string, BrainNode>();
  for (const k of shown) {
    const actionTrace = trace.actions[k]!;
    const id = `a${k}`;
    facts.options.push(option(sys, trace, k, id));
    for (const factor of actionTrace.factors) {
      const node = nodeOf(factor);
      if (!node) continue;
      const link = linkOf(factor);
      if (link.strength < MIN_LINK) continue;
      if (!used.has(node)) used.set(node, nodeFor(sys, factor, node));
      facts.links.push({ from: node, to: id, ...link } satisfies BrainLink);
    }
  }
  // What one feels and knows, even when it weighs on no action shown: needs and emotions.
  for (const input of ['hunger', 'thirst', 'fatigue', 'cold', 'anger', 'fear', 'sadness'] as const) {
    const index = INPUTS.indexOf(input);
    const node = `i${index}`;
    if (!used.has(node)) used.set(node, { id: node, label: inputLabel(index), group: inputGroup(index), value: trace.inputs[index]! });
  }
  facts.nodes = [...used.values(), { id: 'season', label: `Saison : ${seasonName}`, group: 'Situation', value: -1 }];
  return facts;
}

function nodeFor(sys: IndividualsSystem, factor: FactorTrace, id: string): BrainNode {
  if (factor.kind === 'input') return { id, label: inputLabel(factor.index), group: inputGroup(factor.index), value: factor.value };
  if (factor.kind === 'trait') return { id, label: sys.params.traits[factor.index]?.name ?? '?', group: 'Traits', value: factor.value };
  if (factor.kind === 'culture') return { id, label: 'Valeurs de sa culture', group: 'Culture', value: -1 };
  return { id, label: 'Exceller dans un métier', group: 'Ambitions', value: -1 };
}

/** The best actions and the chosen one (a decision weighs every action; the network shows the main ones). */
function shownActions(trace: BrainTrace): number[] {
  const ranked = trace.actions.filter((a) => !a.blocked && a.score > 0).sort((a, b) => b.score - a.score || a.action - b.action);
  const shown = ranked.slice(0, SHOWN_ACTIONS).map((a) => a.action);
  if (!shown.includes(trace.chosen)) shown.push(trace.chosen);
  return shown;
}

function option(sys: IndividualsSystem, trace: BrainTrace, k: number, id: string): BrainOption {
  const a = trace.actions[k]!;
  const def = sys.actions[k]!.def;
  const state: BrainOption['state'] = k === trace.chosen ? 'chosen' : a.failed ? 'failed' : a.blocked ? 'blocked' : 'possible';
  const why = a.factors.map((factor) => `${factorLabel(sys, factor)} → ${times(factor.factor)}`);
  if (a.failed) why.push('voulu, mais impossible maintenant (rien à faire ou pas de chemin)');
  return { id, label: def.name, score: a.score, state, why };
}

/** The last changes of activity, most recent first, with their reason. */
function history(sys: IndividualsSystem, person: number, time: TimeParams): BrainFacts['history'] {
  const { people } = sys;
  const out: BrainFacts['history'] = [];
  for (let n = 1; n <= DECISION_HISTORY; n++) {
    const at = person * DECISION_HISTORY + ((people.histHead[person]! - n + DECISION_HISTORY) % DECISION_HISTORY);
    const action = people.histAction[at]!;
    if (action < 0) break;
    const to = sys.actions[action];
    if (!to) continue;
    const from = sys.actions[people.histFrom[at]!];
    const reason = `${inputLabel(to.reasonInput).toLowerCase()} ${pct(people.histValue[at]!)}`;
    const why = people.histWhy[at]! === ChangeWhy.Ended ? `${from ? `« ${from.def.name} » terminé` : 'début'}, ${reason}` : people.histWhy[at]! === ChangeWhy.Danger ? `danger : ${reason}` : `l’emporte sur « ${from?.def.name ?? '?'} » (${reason})`;
    out.push({ when: when(people.histTick[at]!, time), text: `${to.def.name} — ${why}` });
  }
  return out;
}
