import type { BrainFacts, BrainLink, BrainNode, BrainOption } from '../../core/brain-facts';
import { distance } from '../../core/motion';
import { State, STATE_NAMES } from './animal-store';
import type { FaunaSystem } from './fauna-system';
import { nearestLoneHuman } from './human-prey';
import { condition } from './energy';
import { vigilanceRadius } from './behavior';

/**
 * Visual brain of an animal (step 10.5). An animal decides by priorities (danger, then thirst,
 * hunger, its group, its territory, then rest): the trace shows each rule, whether it applies and
 * what pushes or holds it back. Built only for the animal the spectator watches, from what the
 * animal perceives, without drawing anything (watching never changes the story).
 */

const PERCENT = 100;
const HISTORY = 20;

export interface AnimalTrace {
  tick: number;
  nodes: BrainNode[];
  options: BrainOption[];
  links: BrainLink[];
}

/** Who is watched (by uid: a slot is reused when an animal dies), its last decision and its last changes. */
export class AnimalWatch {
  uid = -1;
  lastState = -1;
  trace: AnimalTrace | null = null;
  readonly history: { tick: number; from: number; to: number; why: string }[] = [];

  watch(uid: number): void {
    if (uid === this.uid) return;
    this.uid = uid;
    this.lastState = -1;
    this.trace = null;
    this.history.length = 0;
  }
}

const pct = (value: number): string => `${Math.round(value * PERCENT)} %`;

/** After the animal thought: the detail of its decision. */
export function traceAnimal(fauna: FaunaSystem, slot: number): void {
  const { store, params } = fauna;
  const species = fauna.speciesOf(slot);
  const needs = params.needs;
  const x = store.px[slot]!;
  const y = store.py[slot]!;
  const hunger = store.hunger[slot]! / PERCENT;
  const thirst = store.thirst[slot]! / PERCENT;
  const threat = nearestThreat(fauna, slot, species.fleeRadius > 0 ? vigilanceRadius(fauna, slot, species) : 0);
  const group = store.group[slot]!;
  const leader = fauna.groups.leader[group]!;
  const isLeader = leader === slot;
  const migrating = fauna.groups.migrating[group] === 1;
  const lone = species.huntRadius > 0 ? nearestLoneHuman(fauna, slot, species.huntRadius) : { id: -1, distance: Infinity };
  const season = fauna.climate.seasonIndexAt(store.y[slot]! * fauna.size + store.x[slot]!, 4);
  const nodes: BrainNode[] = [
    { id: 'hunger', label: 'Faim', group: 'Besoins', value: hunger },
    { id: 'thirst', label: 'Soif', group: 'Besoins', value: thirst },
    { id: 'health', label: 'Santé', group: 'Besoins', value: store.health[slot]! / PERCENT },
    { id: 'reserves', label: 'Réserves (graisse)', group: 'Corps', value: Math.min(1, condition(fauna, slot)) },
    { id: 'stomach', label: 'Estomac', group: 'Corps', value: store.mealSize[slot]! > 0 ? Math.min(1, store.gut[slot]! / store.mealSize[slot]!) : 0 },
    { id: 'age', label: 'Âge', group: 'Corps', value: Math.min(1, store.ageDays[slot]! / (species.maxAgeYears * fauna.daysPerYear)) },
    { id: 'danger', label: threat ? `Danger : ${threat.name} à ${Math.round(threat.distance)} tuiles` : 'Aucun danger en vue', group: 'Émotions', value: threat ? 1 : 0 },
    { id: 'group', label: isLeader ? 'Mène son groupe' : leader >= 0 && store.alive[leader] === 1 ? 'Suit son groupe' : 'Seul', group: 'Groupe', value: -1 },
    { id: 'season', label: `Saison : ${['printemps', 'été', 'automne', 'hiver'][season] ?? '?'}`, group: 'Situation', value: -1 },
  ];
  if (species.huntRadius > 0) nodes.push({ id: 'human', label: lone.id >= 0 ? `Humain isolé à ${Math.round(lone.distance)} tuiles` : 'Aucun humain isolé', group: 'Situation', value: lone.id >= 0 ? 1 : 0 });
  const state = store.state[slot]!;
  const chosenOf = (codes: number[]): boolean => codes.includes(state);
  const options: BrainOption[] = [];
  const links: BrainLink[] = [];
  const add = (id: string, label: string, applies: boolean, urgency: number, codes: number[], why: string[], pushes: [string, number][], holds: [string, number][]): void => {
    const chosen = chosenOf(codes);
    options.push({ id, label, score: applies ? urgency : 0, state: chosen ? 'chosen' : applies ? 'possible' : 'blocked', why });
    for (const [from, strength] of pushes) links.push({ from, to: id, strength, push: true });
    for (const [from, strength] of holds) links.push({ from, to: id, strength, push: false });
  };
  const seekWater = needs.seekWaterAbove / PERCENT;
  const seekFood = needs.seekFoodAbove / PERCENT;
  add('flee', 'Fuir', threat !== null, 1, [State.Flee], [threat ? `un ${threat.name} chasse ou s’approche (${Math.round(threat.distance)} tuiles) : priorité absolue` : species.fleeRadius > 0 ? 'aucun chasseur en vue' : 'ne fuit aucun prédateur'], threat ? [['danger', 1]] : [], threat ? [] : [['danger', 0.5]]);
  if (species.huntRadius > 0) {
    const huntAt = needs.huntAbove / PERCENT;
    add('hunt', 'Chasser', hunger > huntAt, hunger, [State.Hunt], [`faim ${pct(hunger)} (chasse au-dessus de ${pct(huntAt)} : une poursuite coûte cher)`, lone.id >= 0 ? 'un humain seul est une proie possible' : 'choisit la proie qui rapporte le plus pour l’effort : une bête faible, à sa taille, proche', 'la plupart des attaques échouent'], hunger > huntAt ? [['hunger', hunger], ...(lone.id >= 0 ? ([['human', 0.6]] as [string, number][]) : [])] : [], hunger > huntAt ? [] : [['hunger', 1 - hunger], ['stomach', 0.5]]);
  }
  add('drink', 'Boire', thirst > seekWater, thirst + 0.01, [State.Drink, State.SeekWater], [`soif ${pct(thirst)} (va boire au-dessus de ${pct(seekWater)})`, 'passe avant la faim'], thirst > seekWater ? [['thirst', thirst]] : [], thirst > seekWater ? [] : [['thirst', 1 - thirst]]);
  add('eat', species.huntRadius > 0 ? 'Manger (charogne, poisson, plantes)' : 'Brouter', hunger > seekFood, hunger, [State.Eat, State.Forage], [`faim ${pct(hunger)} (cherche à manger au-dessus de ${pct(seekFood)})`], hunger > seekFood ? [['hunger', hunger]] : [], hunger > seekFood ? [] : [['hunger', 1 - hunger]]);
  add('migrate', 'Migrer', migrating, 0.5, [State.Migrate], [migrating ? 'son groupe migre vers de meilleures terres' : 'son groupe ne migre pas'], migrating ? [['group', 0.8], ['season', 0.4]] : [], []);
  add('follow', 'Suivre son groupe', !isLeader && leader >= 0, 0.4, [State.Follow], [isLeader ? 'c’est le meneur' : 'garde sa place près du meneur'], !isLeader && leader >= 0 ? [['group', 0.6]] : [], []);
  add('wander', 'Se promener', true, params.behavior.wanderChance, [State.Wander], [`quand rien ne presse, part se promener (${pct(params.behavior.wanderChance)} de chances), ou rentre vers sa tanière`], [], [['hunger', hunger], ['thirst', thirst]]);
  add('rest', 'Se reposer', true, 0.05, [State.Rest], ['rien ne presse'], [], [['hunger', hunger], ['thirst', thirst], ['danger', threat ? 1 : 0]]);
  fauna.watch.trace = { tick: fauna.tick, nodes, options, links: links.filter((link) => link.strength >= 0.05) };
  void x;
  void y;
}

/** The nearest hunter of this species in sight (what the animal fears), or null. */
function nearestThreat(fauna: FaunaSystem, slot: number, radius: number): { name: string; distance: number } | null {
  if (radius <= 0) return null;
  const { store, params } = fauna;
  const n = params.species.length;
  const code = store.species[slot]!;
  let best: { name: string; distance: number } | null = null;
  fauna.hunterGrid.forEachNear(store.px[slot]!, store.py[slot]!, radius, (other) => {
    if (other === slot || fauna.hunts[store.species[other]! * n + code] !== 1) return;
    const d = distance(store.px[slot]!, store.py[slot]!, store.px[other]!, store.py[other]!);
    if (d <= radius && (!best || d < best.distance)) best = { name: fauna.speciesOf(other).name.toLowerCase(), distance: d };
  });
  return best;
}

/** After each step of the watched animal: a change of state goes to its history. */
export function noteAnimalState(fauna: FaunaSystem, slot: number): void {
  const watch = fauna.watch;
  const state = fauna.store.state[slot]!;
  const shown = state === State.Flee && fauna.store.fleesHuman[slot] === 1 ? STATE_NAMES.length - 1 : state;
  if (shown === watch.lastState) return;
  const store = fauna.store;
  const why =
    shown === STATE_NAMES.length - 1
      ? 'un humain trop proche'
      : state === State.Flee
        ? 'un prédateur en vue'
        : state === State.Drink || state === State.SeekWater
          ? `soif ${pct(store.thirst[slot]! / PERCENT)}`
          : state === State.Eat || state === State.Forage || state === State.Hunt
            ? `faim ${pct(store.hunger[slot]! / PERCENT)}`
            : state === State.Rest
              ? 'plus rien ne presse'
              : state === State.Follow || state === State.Migrate
                ? 'son groupe bouge'
                : 'envie de bouger';
  if (watch.lastState >= 0) {
    watch.history.unshift({ tick: fauna.tick, from: watch.lastState, to: shown, why });
    if (watch.history.length > HISTORY) watch.history.length = HISTORY;
  }
  watch.lastState = shown;
}

/** The visual brain of the watched animal, in words (null fields when it is not watched). */
export function describeAnimalBrain(fauna: FaunaSystem, uid: number, when: (tick: number) => string): BrainFacts {
  const { store } = fauna;
  let slot = -1;
  for (let s = 0; s < store.slots; s++) {
    if (store.alive[s] === 1 && store.uid[s] === uid) {
      slot = s;
      break;
    }
  }
  const watch = fauna.watch;
  const history = watch.uid === uid ? watch.history.map((line) => ({ when: when(line.tick), text: `${capitalize(STATE_NAMES[line.to] ?? '?')} — ${line.why} (avant : ${STATE_NAMES[line.from] ?? '?'})` })) : [];
  if (slot < 0) return { kind: 'animal', id: uid, name: 'Animal', when: '', doing: '', nodes: [], options: [], links: [], history, note: 'Cet animal est mort : son cerveau ne décide plus rien.' };
  const species = fauna.speciesOf(slot);
  const years = store.ageDays[slot]! / fauna.daysPerYear;
  const name = `${species.name} (${years < 1 ? 'jeune' : `${Math.floor(years)} an${years >= 2 ? 's' : ''}`})`;
  const state = store.state[slot] === State.Flee && store.fleesHuman[slot] === 1 ? STATE_NAMES.length - 1 : store.state[slot]!;
  const trace = watch.uid === uid ? watch.trace : null;
  return {
    kind: 'animal',
    id: uid,
    name,
    when: trace ? when(trace.tick) : '',
    doing: capitalize(STATE_NAMES[state] ?? ''),
    nodes: trace?.nodes ?? [],
    options: trace?.options ?? [],
    links: trace?.links ?? [],
    history,
    note: trace ? '' : 'En attente de sa prochaine décision (lancez le temps un instant si le jeu est en pause).',
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
