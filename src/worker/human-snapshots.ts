import type { Simulation } from '../sim/core/simulation';
import { feltTemperature } from '../sim/systems/individuals/body';
import { INPUTS } from '../sim/systems/individuals/params';
import { HumanFlag, type HumansSnapshot, type PersonDetails, type Roster } from '../shared/messages';

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
    knowledgeNames: params.knowledge.map((item) => item.name),
    weatherNames: simulation.data.weather.types.map((type) => type.name),
  };
}

export function snapshotHumans(simulation: Simulation): { snapshot: HumansSnapshot; transfer: ArrayBuffer[] } {
  const { people, camps } = simulation.humans;
  const flags = new Uint8Array(people.count);
  for (let p = 0; p < people.count; p++) flags[p] = (people.alive[p] ? HumanFlag.Alive : 0) | (people.working[p] ? HumanFlag.Working : 0);
  const snapshot: HumansSnapshot = {
    x: people.x.slice(),
    y: people.y.slice(),
    action: people.action.slice(),
    flags,
    camps: camps.map((camp) => ({ fireX: camp.fireX, fireY: camp.fireY, lit: camp.lit, huts: camp.huts.map((hut) => hut.tile) })),
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
  const knowledge = params.knowledge.flatMap((_, k) => ((people.knowledge[person]! & (1 << k)) !== 0 ? [k] : []));
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
    food: people.food[person]!,
    branches: people.branches[person]!,
    carryFood: params.body.carryFood,
    carryBranches: params.body.carryBranches,
    action: people.action[person]!,
    reason: INPUTS[action.reasonInput] ?? 'always',
    reasonValue: people.reasonValue[person]!,
    top,
    knowledge,
    rememberedWater: count(people.waterMemory, people.waterSlots),
    rememberedFood: count(people.foodMemory, people.foodSlots),
    feltCelsius: feltTemperature(humans, person),
    weather: simulation.weather.at(humans.tileOf(person)),
  };
}
