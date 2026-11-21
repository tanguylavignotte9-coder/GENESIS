import { describePersonIdeas } from '../sim/systems/ideas/describe';
import { describePersonConflict } from '../sim/systems/conflict/describe';
import type { Simulation } from '../sim/core/simulation';
import { feltTemperature } from '../sim/systems/individuals/body';
import { INPUTS } from '../sim/systems/individuals/params';
import { describeSocial } from '../sim/systems/individuals/social/describe';
import { describeLife } from '../sim/systems/individuals/life/describe';
import { describeMembership } from '../sim/systems/groups/describe';
import { HumanFlag, type HumanStats, type HumansSnapshot, type ItemLine, type PersonDetails, type Roster } from '../shared/messages';
import type { Inventory } from '../sim/systems/production/inventory';

const TOP = 3;

export function snapshotRoster(simulation: Simulation): Roster {
  const { people, actions, params } = simulation.humans;
  const n = people.count;
  return {
    names: people.names.slice(0, n),
    alive: people.alive.slice(0, n),
    female: people.female.slice(0, n),
    ageYears: people.ageYears.slice(0, n),
    mother: people.mother.slice(0, n),
    father: people.father.slice(0, n),
    spouse: people.spouse.slice(0, n),
    camp: people.camp.slice(0, n),
    actionLabels: actions.map((action) => action.def.label),
    actionNames: actions.map((action) => action.def.name),
    traitNames: params.traits.map((trait) => trait.name),
    knowledgeNames: simulation.data.knowledge.knowledge.map((item) => item.name),
    skillNames: params.skills.map((skill) => skill.name),
    professions: params.skills.map((skill) => skill.profession),
    professionsFemale: params.skills.map((skill) => skill.professionFemale),
    weatherNames: simulation.data.weather.types.map((type) => type.name),
    weatherIds: simulation.data.weather.types.map((type) => type.id),
  };
}

export function snapshotHumans(simulation: Simulation): { snapshot: HumansSnapshot; transfer: ArrayBuffer[] } {
  const { people } = simulation.humans;
  const flags = new Uint8Array(people.count);
  const conflict = simulation.conflict;
  for (let p = 0; p < people.count; p++) flags[p] = (people.alive[p] ? HumanFlag.Alive : 0) | (people.working[p] ? HumanFlag.Working : 0) | (conflict.warCall(p) > 0 ? HumanFlag.Fighting : 0);
  const n = people.count;
  const snapshot: HumansSnapshot = {
    x: people.px.slice(0, n),
    y: people.py.slice(0, n),
    vx: people.vx.slice(0, n),
    vy: people.vy.slice(0, n),
    gait: people.gait.slice(0, n),
    action: people.action.slice(0, n),
    flags,
  };
  const { x, y, vx, vy, gait, action } = snapshot;
  return { snapshot, transfer: [x, y, vx, vy, gait, action, flags].map((array) => array.buffer as ArrayBuffer) };
}

export function describePerson(simulation: Simulation, requestId: number, person: number): PersonDetails | null {
  const humans = simulation.humans;
  const { people, params } = humans;
  if (person < 0 || person >= people.count) return null;
  const top: { action: number; score: number }[] = [];
  for (let t = 0; t < TOP; t++) {
    const action = people.topActions[person * TOP + t]!;
    if (action >= 0) top.push({ action, score: people.topScores[person * TOP + t]! });
  }
  const knowledge = simulation.data.knowledge.knowledge.flatMap((_, k) => ((simulation.ideas.knowledge(person) & (1 << k)) !== 0 ? [k] : []));
  const production = simulation.production;
  const job = production.jobs[person];
  const skills = params.skills.map((_, s) => people.skill(person, s));
  const practice = params.skills.map((_, s) => people.practice[person * people.skillCount + s]!);
  const count = (memory: Int32Array, slots: number): number => {
    let n = 0;
    for (let s = person * slots; s < (person + 1) * slots; s++) if (memory[s]! >= 0) n++;
    return n;
  };
  const action = humans.actions[people.action[person]!]!;
  return {
    requestId,
    person,
    alive: people.alive[person] === 1,
    deathCause: people.deathCause[person]!,
    traits: params.traits.map((_, t) => people.trait(person, t)),
    needs: {
      hunger: people.hunger[person]!,
      thirst: people.thirst[person]!,
      fatigue: people.fatigue[person]!,
      cold: people.cold[person]!,
      danger: people.danger[person]!,
    },
    health: Math.max(0, people.health[person]!),
    carried: itemLines(production.carried[person]!),
    load: production.load(person),
    carryCapacity: production.carryCapacity(person),
    skills,
    practice,
    trade: people.trade(person, params.skillLearning.professionMinHours),
    work: job?.recipe && job.kind !== 'deposit' ? job.recipe.def.label : '',
    action: people.action[person]!,
    reason: INPUTS[action.reasonInput] ?? 'always',
    reasonValue: people.reasonValue[person]!,
    top,
    knowledge,
    rememberedWater: count(people.waterMemory, people.waterSlots),
    rememberedFood: count(people.foodMemory, people.foodSlots),
    feltCelsius: feltTemperature(humans, person),
    weather: simulation.weather.at(humans.tileOf(person)),
    spouse: people.spouse[person]!,
    social: describeSocial(humans.social, person),
    life: describeLife(humans.life, person),
    groups: describeMembership(simulation.groups, person),
    ideas: describePersonIdeas(simulation.ideas, person),
    conflict: describePersonConflict(simulation.conflict, person),
  };
}

/** Width of an age band of the pyramid (display). */
const BAND_YEARS = 5;
const DEATH_CAUSES = ['', 'Faim', 'Soif', 'Froid', 'Prédateur', 'Vieillesse', 'Maladie', 'En couches', 'Violence'];

/** Population of the humans: census points since `fromSample`, age pyramid of the living, causes of death. */
export function snapshotHumanStats(simulation: Simulation, fromSample: number): HumanStats {
  const { people, life } = simulation.humans;
  const men: number[] = [];
  const women: number[] = [];
  const deaths = DEATH_CAUSES.map(() => 0);
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0) {
      deaths[people.deathCause[p]!]!++;
      continue;
    }
    const band = Math.floor(people.ageYears[p]! / BAND_YEARS);
    const side = people.female[p] === 1 ? women : men;
    while (men.length <= band) men.push(0);
    while (women.length <= band) women.push(0);
    side[band]!++;
  }
  return {
    samples: life.census.slice(fromSample),
    bandYears: BAND_YEARS,
    men,
    women,
    deaths: DEATH_CAUSES.flatMap((cause, k) => (k > 0 && deaths[k]! > 0 ? [{ cause, count: deaths[k]! }] : [])),
    births: life.births,
  };
}

/** Piles of an inventory, merged by item (whatever the owner), for the display. */
export function itemLines(inventory: Inventory): ItemLine[] {
  const lines: ItemLine[] = [];
  for (const pile of inventory.piles) {
    const line = lines.find((other) => other.item === pile.item);
    if (line) {
      line.quality = (line.quality * line.qty + pile.quality * pile.qty) / (line.qty + pile.qty);
      line.qty += pile.qty;
    } else lines.push({ item: pile.item, qty: pile.qty, quality: pile.quality });
  }
  return lines.sort((a, b) => a.item - b.item);
}
