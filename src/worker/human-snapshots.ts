import type { Simulation } from '../sim/core/simulation';
import { feltTemperature } from '../sim/systems/individuals/body';
import { INPUTS } from '../sim/systems/individuals/params';
import { describeSocial } from '../sim/systems/individuals/social/describe';
import { HumanFlag, type HumansSnapshot, type ItemLine, type PersonDetails, type Roster } from '../shared/messages';
import type { Inventory } from '../sim/systems/production/inventory';

const TOP = 3;

export function snapshotRoster(simulation: Simulation): Roster {
  const { people, actions, params } = simulation.humans;
  return {
    names: people.names.slice(),
    female: people.female.slice(),
    ageYears: people.ageYears.slice(),
    mother: people.mother.slice(),
    father: people.father.slice(),
    spouse: people.spouse.slice(),
    camp: people.camp.slice(),
    actionLabels: actions.map((action) => action.def.label),
    actionNames: actions.map((action) => action.def.name),
    traitNames: params.traits.map((trait) => trait.name),
    knowledgeNames: simulation.data.knowledge.knowledge.map((item) => item.name),
    skillNames: params.skills.map((skill) => skill.name),
    professions: params.skills.map((skill) => skill.profession),
    professionsFemale: params.skills.map((skill) => skill.professionFemale),
    weatherNames: simulation.data.weather.types.map((type) => type.name),
  };
}

export function snapshotHumans(simulation: Simulation): { snapshot: HumansSnapshot; transfer: ArrayBuffer[] } {
  const { people } = simulation.humans;
  const flags = new Uint8Array(people.count);
  for (let p = 0; p < people.count; p++) flags[p] = (people.alive[p] ? HumanFlag.Alive : 0) | (people.working[p] ? HumanFlag.Working : 0);
  const snapshot: HumansSnapshot = {
    x: people.x.slice(),
    y: people.y.slice(),
    action: people.action.slice(),
    flags,
  };
  return { snapshot, transfer: [snapshot.x, snapshot.y, snapshot.action, snapshot.flags].map((array) => array.buffer as ArrayBuffer) };
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
  const knowledge = simulation.data.knowledge.knowledge.flatMap((_, k) => ((people.knowledge[person]! & (1 << k)) !== 0 ? [k] : []));
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
