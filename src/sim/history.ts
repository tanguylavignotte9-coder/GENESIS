import type { Simulation } from './core/simulation';
import { isExileCamp } from './systems/groups/describe';
import { herdOf } from './systems/production/husbandry';

/** One tribe at a sample (statistics panel: curves per tribe). */
export interface TribeSample {
  id: number;
  name: string;
  population: number;
  /** Food value in the camp's common stock. */
  food: number;
  /** Knowledge known by at least one member. */
  knowledge: number;
  regime: string;
  /** Domestic animals kept by the camp. */
  herd: number;
}

/** The world at one moment: totals and every living tribe (camps of a lone exile apart). */
export interface HistorySample {
  day: number;
  population: number;
  tribes: number;
  exileCamps: number;
  food: number;
  knowledge: number;
  herd: number;
  perTribe: TribeSample[];
}

function bits(mask: number): number {
  let n = 0;
  for (let m = mask >>> 0; m !== 0; m &= m - 1) n++;
  return n;
}

/** Reads the world as it is now (nothing is changed, nothing is drawn at random). */
export function sampleHistory(sim: Simulation): HistorySample {
  const { groups, humans, production } = sim;
  const perTribe: TribeSample[] = [];
  let exileCamps = 0;
  let known = 0;
  for (const tribe of groups.tribes()) {
    if (tribe.members.length === 0) continue;
    if (isExileCamp(tribe)) {
      exileCamps++;
      continue;
    }
    let mask = 0;
    for (const person of tribe.members) mask = (mask | humans.ideas.knowledge(person)) >>> 0;
    known = (known | mask) >>> 0;
    perTribe.push({
      id: tribe.id,
      name: tribe.name,
      population: tribe.members.length,
      food: tribe.camp >= 0 ? Math.round(production.stockFood(tribe.camp)) : 0,
      knowledge: bits(mask),
      regime: groups.params.regimes[tribe.regime]?.name ?? '?',
      herd: tribe.camp >= 0 ? herdOf(production, tribe.camp).length : 0,
    });
  }
  return {
    day: sim.date.absoluteDay,
    population: humans.people.living,
    tribes: perTribe.length,
    exileCamps,
    food: perTribe.reduce((sum, t) => sum + t.food, 0),
    knowledge: bits(known),
    herd: perTribe.reduce((sum, t) => sum + t.herd, 0),
    perTribe,
  };
}
