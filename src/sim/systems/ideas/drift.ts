import type { Rng } from '../../core/rng';
import type { Group } from '../groups/group';
import type { IdeasSystem } from './ideas-system';
import type { FamilyId } from './idea';
import type { DriftParams } from './params';

/**
 * The one mechanism shared by cultures, languages and religions: each carrier holds the idea with
 * a small vector of their own (values, way of speaking, beliefs). Children start from their
 * parents with a little variation, everyone drifts a little at random, and talking pulls two
 * people's vectors together. Populations that talk keep together; populations that no longer
 * talk drift apart, and beyond a threshold a new idea is recognized (a culture, a language, a
 * religion through a schism).
 */
export interface VectorFamily {
  family: FamilyId;
  params: DriftParams;
  dims: number;
  /** Idea held by a person (-1 none). */
  holderOf: (person: number) => number;
  /** `dims` values per person, 0..1. */
  vector: Float32Array;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** A centred random number with standard deviation ~1 (sum of uniforms: no trigonometry). */
export function noise(rng: Rng): number {
  return (rng.nextFloat() + rng.nextFloat() + rng.nextFloat() - 1.5) * 2;
}

/** A child's vector: the mean of its parents' (or one parent's), with a little variation. */
export function inheritVector(family: VectorFamily, child: number, parents: readonly number[], rng: Rng): void {
  const { dims, vector } = family;
  for (let d = 0; d < dims; d++) {
    let sum = 0;
    for (const parent of parents) sum += vector[parent * dims + d]!;
    const mean = parents.length > 0 ? sum / parents.length : 0.5;
    vector[child * dims + d] = clamp01(mean + family.params.childNoise * noise(rng));
  }
}

/** Two people talked: each moves a little toward the other (more if they share the idea). */
export function conform(family: VectorFamily, a: number, b: number, strength = 1): void {
  const { dims, vector } = family;
  const rate = (family.params.conformityPerTalk * strength) / 2;
  for (let d = 0; d < dims; d++) {
    const va = vector[a * dims + d]!;
    const vb = vector[b * dims + d]!;
    vector[a * dims + d] = va + (vb - va) * rate;
    vector[b * dims + d] = vb + (va - vb) * rate;
  }
}

/** A day of random drift for one person (innovations, oddities, forgetting). */
export function wander(family: VectorFamily, person: number, yearDays: number, rng: Rng): void {
  const { dims, vector } = family;
  const step = family.params.noisePerYear / Math.sqrt(yearDays);
  for (let d = 0; d < dims; d++) vector[person * dims + d] = clamp01(vector[person * dims + d]! + step * noise(rng));
}

/** Mean vector of some people. */
export function meanOf(family: VectorFamily, people: readonly number[]): number[] {
  const { dims, vector } = family;
  const mean = new Array<number>(dims).fill(0);
  for (const person of people) for (let d = 0; d < dims; d++) mean[d] = mean[d]! + vector[person * dims + d]!;
  return mean.map((sum) => (people.length > 0 ? sum / people.length : 0));
}

/** Root-mean-square gap between two vectors. */
export function gap(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let d = 0; d < a.length; d++) sum += (a[d]! - (b[d] ?? 0)) ** 2;
  return Math.sqrt(sum / Math.max(1, a.length));
}

/**
 * Populations that drifted apart: for each tribe, the carriers of each idea there are compared with
 * the carriers elsewhere. Beyond the threshold, `split` is called with the tribe, the old idea and
 * the tribe's carriers (it founds the new idea). Carriers are counted on the way (idea.holders, means).
 */
export function findSplits(sys: IdeasSystem, family: VectorFamily, split: (tribe: Group, idea: number, carriers: number[], gapValue: number) => void): void {
  const people = sys.humans.people;
  const byIdea = new Map<number, number[]>();
  for (let p = 0; p < people.count; p++) {
    if (people.alive[p] === 0) continue;
    const idea = family.holderOf(p);
    if (idea < 0) continue;
    const list = byIdea.get(idea);
    if (list) list.push(p);
    else byIdea.set(idea, [p]);
  }
  for (const idea of sys.ideas) {
    if (idea.family !== family.family || !idea.alive) continue;
    const carriers = byIdea.get(idea.id) ?? [];
    idea.holders = carriers.length;
    if (carriers.length > 0) idea.mean = meanOf(family, carriers);
  }
  if (!sys.groups) return;
  for (const [ideaId, carriers] of [...byIdea.entries()].sort((a, b) => a[0] - b[0])) {
    const byTribe = new Map<number, number[]>();
    for (const p of carriers) {
      const tribe = sys.groups.member[p * 3]!;
      const list = byTribe.get(tribe);
      if (list) list.push(p);
      else byTribe.set(tribe, [p]);
    }
    const idea = sys.ideas[ideaId]!;
    idea.tribes = [...byTribe.keys()].filter((id) => id >= 0).sort((a, b) => a - b);
    if (byTribe.size < 2) continue;
    // The population that drifted away is the one farthest from what the idea is on the whole.
    let chosen: { tribe: number; here: number[]; distance: number; away: number } | null = null;
    for (const [tribeId, here] of [...byTribe.entries()].sort((a, b) => a[0] - b[0])) {
      if (tribeId < 0 || here.length < family.params.minMembers || here.length === carriers.length) continue;
      const elsewhere = carriers.filter((p) => sys.groups!.member[p * 3] !== tribeId);
      const mean = meanOf(family, here);
      const distance = gap(mean, meanOf(family, elsewhere));
      const away = gap(mean, idea.mean);
      if (distance > family.params.splitDistance && (!chosen || away > chosen.away)) chosen = { tribe: tribeId, here, distance, away };
    }
    if (chosen) split(sys.groups.groups[chosen.tribe]!, ideaId, chosen.here, chosen.distance);
  }
}
