import { fillTemplate } from '../../../core/text';
import { DeathCause } from '../people';
import { perDay, vulnerabilityAt } from './aging';
import type { Epidemic, LifeCycle } from './life-cycle';

export const EPIDEMIC_START = 'life.epidemic';
export const EPIDEMIC_END = 'life.epidemicEnd';
/** Share (0..1) of the way from "the body weakens" to the worst: hunger or cold that makes diseases worse. */
export function weakness(from: number, value: number): number {
  return value <= from ? 0 : Math.min(1, (value - from) / Math.max(1, 100 - from));
}

/** Weakness that the journal mentions (", affaibli par la faim"). */
const TOLD_WEAKNESS = 0.3;

function key(camp: number, disease: number): string {
  return `${camp}:${disease}`;
}

function susceptible(life: LifeCycle, person: number, disease: number): boolean {
  const { state } = life;
  return life.alive(person) && state.disease[person]! < 0 && state.immuneUntil[person * state.diseaseCount + disease]! <= life.day;
}

/** Health lost per hour to the disease: the very young and the old, the starving and the frozen suffer most. */
export function diseaseDamagePerHour(life: LifeCycle, person: number): number {
  const { people, state, params } = life;
  const code = state.disease[person]!;
  if (code < 0) return 0;
  const disease = params.diseases[code];
  if (!disease) return 0;
  const { hungerFrom, coldFrom } = params.frailty;
  const aggravation = 1 + disease.hungerEffect * weakness(hungerFrom, people.hunger[person]!) + disease.coldEffect * weakness(coldFrom, people.cold[person]!);
  return disease.damagePerHour * vulnerabilityAt(params, people.ageYears[person]!) * aggravation;
}

/** The person falls ill (from someone, or from the world when `source` is -1). */
export function infect(life: LifeCycle, person: number, disease: number, source: number): void {
  const { state, params, rng } = life;
  const def = params.diseases[disease]!;
  state.disease[person] = disease;
  state.diseaseSince[person] = life.day;
  state.diseaseEnds[person] = life.day + Math.max(1, Math.round(def.durationDays[0] + rng.nextFloat() * (def.durationDays[1] - def.durationDays[0])));
  state.diseaseSource[person] = source;
  state.diseaseEvent[person] = -1;
  life.sys.people.nextThink[person] = life.sys.step;
  noteCase(life, person, disease);
}

/** Every day: a healthy person may catch a disease from the world (cold and hunger make it likelier). */
export function catchDiseases(life: LifeCycle, person: number): void {
  const { people, params, rng, state } = life;
  if (state.disease[person]! >= 0) return;
  const cold = weakness(params.frailty.coldFrom, people.cold[person]!);
  const hunger = weakness(params.frailty.hungerFrom, state.nourishment[person]!);
  const frailty = Math.sqrt(vulnerabilityAt(params, people.ageYears[person]!));
  for (let d = 0; d < params.diseases.length; d++) {
    const def = params.diseases[d]!;
    if (def.onsetPerYear <= 0 || !susceptible(life, person, d)) continue;
    const perYear = def.onsetPerYear * (1 + def.coldOnsetEffect * cold) * (1 + def.hungerOnsetEffect * hunger) * frailty;
    if (rng.nextFloat() < perDay(perYear, life.yearDays)) {
      infect(life, person, d, -1);
      return;
    }
  }
}

/** Every hour of a sick person: those close by may catch a contagious disease (the frail and the hungry more easily). */
export function spreadDisease(life: LifeCycle, sick: number): void {
  const { people, params, state, rng, sys } = life;
  const code = state.disease[sick]!;
  const def = params.diseases[code];
  if (!def || !def.contagious || def.transmitPerHour <= 0) return;
  const reach = def.contagionTiles;
  const x = people.px[sick]!;
  const y = people.py[sick]!;
  const caught: number[] = [];
  sys.grid.forEachNear(x, y, reach, (other) => {
    if (other === sick || !susceptible(life, other, code)) return;
    if (people.distance(other, sick) > reach) return;
    const chance = def.transmitPerHour * Math.sqrt(vulnerabilityAt(params, people.ageYears[other]!)) * (1 + def.hungerOnsetEffect * weakness(params.frailty.hungerFrom, people.hunger[other]!));
    if (rng.nextFloat() < chance) caught.push(other);
  });
  for (const other of caught) infect(life, other, code, sick);
}

/** Every day: the sick whose illness has run its course recover, and cannot catch it again for a while. */
export function healDiseases(life: LifeCycle, person: number): void {
  const { state, params } = life;
  const code = state.disease[person]!;
  if (code < 0 || life.day < state.diseaseEnds[person]!) return;
  const def = params.diseases[code];
  state.immuneUntil[person * state.diseaseCount + code] = life.day + Math.round((def?.immunityYears ?? 0) * life.yearDays);
  state.disease[person] = -1;
  state.diseaseSource[person] = -1;
  state.diseaseEvent[person] = -1;
  life.sys.people.nextThink[person] = life.sys.step;
}

/** Sick people of a camp with this disease. */
function cases(life: LifeCycle, camp: number, disease: number): number[] {
  return life.sys.campMembers(camp).filter((person) => life.state.disease[person] === disease);
}

/** Hunger or cold that weakens the bodies, in the journal's words (", affaiblis par la faim"). */
export function aggravationText(life: LifeCycle, people: readonly number[], female: boolean): string {
  if (people.length === 0) return '';
  const { hungerFrom, coldFrom } = life.params.frailty;
  const hunger = people.reduce((sum, p) => sum + weakness(hungerFrom, life.people.hunger[p]!), 0) / people.length;
  const cold = people.reduce((sum, p) => sum + weakness(coldFrom, life.people.cold[p]!), 0) / people.length;
  const e = people.length > 1 ? 's' : female ? 'e' : '';
  if (hunger >= TOLD_WEAKNESS && hunger >= cold) return fillTemplate(life.params.texts.weakenedByHunger, { e });
  if (cold >= TOLD_WEAKNESS) return fillTemplate(life.params.texts.weakenedByCold, { e });
  return '';
}

/**
 * A new case: if an epidemic of this disease is under way in the camp, the case belongs to it;
 * otherwise, once enough people are ill at the same time, the journal tells of an epidemic, with
 * what made it possible (a hard year, a famine).
 */
function noteCase(life: LifeCycle, person: number, disease: number): void {
  const camp = life.people.camp[person]!;
  const id = key(camp, disease);
  const running = life.epidemics.get(id);
  if (running) {
    running.cases++;
    life.state.diseaseEvent[person] = running.event;
    return;
  }
  const sick = cases(life, camp, disease);
  const { minCases, minShare } = life.params.epidemic;
  if (sick.length < Math.max(minCases, Math.ceil(minShare * life.sys.campMembers(camp).length))) return;
  const x = life.people.x[person]!;
  const y = life.people.y[person]!;
  const hardship = life.hardshipAt(life.sys.tileOf(person));
  const famine = life.famineEvent(camp);
  const name = life.params.diseases[disease]!.name;
  const event = life.journal.publish({
    tick: life.tick,
    type: EPIDEMIC_START,
    text: fillTemplate(life.params.texts.epidemicStart, {
      maladie: name,
      lieu: life.place(x, y).label,
      malades: String(sick.length),
      aggravation: aggravationText(life, sick, false),
    }),
    place: life.place(x, y),
    actors: sick.map((p) => ({ kind: 'human', id: p })),
    causes: [...(hardship >= 0 ? [hardship] : []), ...(famine >= 0 ? [famine] : [])],
    details: { camp, disease: life.params.diseases[disease]!.id },
  });
  const epidemic: Epidemic = { camp, disease, event, cases: sick.length, deaths: 0 };
  life.epidemics.set(id, epidemic);
  for (const p of sick) life.state.diseaseEvent[p] = event;
}

/** Every day: an epidemic with no sick left is over (told with its toll). */
export function endEpidemics(life: LifeCycle): void {
  for (const [id, epidemic] of [...life.epidemics.entries()]) {
    if (cases(life, epidemic.camp, epidemic.disease).length > 0) continue;
    life.epidemics.delete(id);
    life.epidemicCount++;
    const start = life.journal.get(epidemic.event);
    life.journal.publish({
      tick: life.tick,
      type: EPIDEMIC_END,
      text: fillTemplate(life.params.texts.epidemicEnd, {
        maladie: life.params.diseases[epidemic.disease]!.name,
        malades: String(epidemic.cases),
        morts: String(epidemic.deaths),
      }),
      place: start?.place ?? null,
      actors: [],
      causes: [epidemic.event],
      details: { camp: epidemic.camp, deaths: epidemic.deaths, cases: epidemic.cases },
    });
  }
}

/** A sick person died: one more victim of the epidemic (if the disease killed them); the disease dies with them. */
export function onDiseaseDeath(life: LifeCycle, person: number, cause: number): void {
  const { state } = life;
  const event = state.diseaseEvent[person]!;
  if (cause === DeathCause.Disease && event >= 0) {
    for (const epidemic of life.epidemics.values()) if (epidemic.event === event) epidemic.deaths++;
  }
  state.disease[person] = -1;
}

/** A person weakened by hunger or cold (", affaibli par la faim") and the famine under way, if any. */
export function weakenedInfo(life: LifeCycle, person: number): { text: string; causes: number[] } {
  const { people } = life;
  const text = aggravationText(life, [person], people.female[person] === 1);
  const famine = life.famineEvent(people.camp[person]!);
  const hungry = weakness(life.params.frailty.hungerFrom, people.hunger[person]!) >= TOLD_WEAKNESS;
  return { text, causes: famine >= 0 && hungry ? [famine] : [] };
}

/** Words and causes of a death by disease ("de fièvre à 2 ans, affaibli par la faim"), for the journal. */
export function diseaseDeathInfo(life: LifeCycle, person: number): { vars: Record<string, string>; causes: number[] } {
  const { state, people } = life;
  const code = state.disease[person]!;
  const name = life.params.diseases[code]?.name ?? '?';
  const causes: number[] = [];
  if (state.diseaseEvent[person]! >= 0) causes.push(state.diseaseEvent[person]!);
  const hardship = life.hardshipAt(life.sys.tileOf(person));
  if (hardship >= 0) causes.push(hardship);
  const aggravation = aggravationText(life, [person], people.female[person] === 1);
  const famine = life.famineEvent(people.camp[person]!);
  if (famine >= 0 && weakness(life.params.frailty.hungerFrom, people.hunger[person]!) >= TOLD_WEAKNESS) causes.push(famine);
  return { vars: { maladie: name, aggravation, age: String(Math.floor(people.ageYears[person]!)) }, causes };
}
