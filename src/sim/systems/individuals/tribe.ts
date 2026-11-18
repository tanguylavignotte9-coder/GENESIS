import type { Rng } from '../../core/rng';
import { startingKnowledge } from '../../core/knowledge';
import { Camp } from './camp';
import type { IndividualsSystem } from './individuals-system';
import { NameGenerator } from './names';
import { People } from './people';
import { chooseSites } from './settlement';

const INITIAL_NEED_MAX = 30;
/** A parent is at least this many years older than the child. */
const MIN_PARENT_GAP = 16;

interface Member {
  female: boolean;
  age: number;
  mother: number;
  father: number;
  spouse: number;
  family: number;
}

/** Composition of a tribe: a few elders, couples with children, maybe a single adult. */
function composeTribe(size: number, sys: IndividualsSystem, rng: Rng): Member[] {
  const { tribe } = sys.params;
  const members: Member[] = [];
  let family = 0;
  const add = (member: Omit<Member, 'family'>, f: number): number => members.push({ ...member, family: f }) - 1;
  const age = (range: [number, number]): number => rng.nextRange(range[0], range[1]);
  let elders = Math.round(size * tribe.elderShare);
  while (elders > 0 && members.length < size) {
    const f = family++;
    const first = add({ female: rng.nextFloat() < 0.5, age: age(tribe.elderAge), mother: -1, father: -1, spouse: -1 }, f);
    elders--;
    if (elders > 0 && members.length < size) {
      const second = add({ female: !members[first]!.female, age: age(tribe.elderAge), mother: -1, father: -1, spouse: first }, f);
      members[first]!.spouse = second;
      elders--;
    }
  }
  while (size - members.length >= 2) {
    const f = family++;
    const children = Math.min(size - members.length - 2, rng.nextIntInclusive(tribe.childrenPerCouple[0], tribe.childrenPerCouple[1]));
    const kidAges = Array.from({ length: children }, () => age(tribe.childAge));
    const minParent = Math.max(tribe.adultAge[0], ...kidAges.map((a) => a + MIN_PARENT_GAP));
    const parentAge = (): number => rng.nextRange(Math.min(minParent, tribe.adultAge[1]), Math.max(minParent, tribe.adultAge[1]));
    const mother = add({ female: true, age: parentAge(), mother: -1, father: -1, spouse: -1 }, f);
    const father = add({ female: false, age: parentAge(), mother: -1, father: -1, spouse: mother }, f);
    members[mother]!.spouse = father;
    for (const kid of kidAges) add({ female: rng.nextFloat() < 0.5, age: kid, mother, father, spouse: -1 }, f);
  }
  if (members.length < size) add({ female: rng.nextFloat() < 0.5, age: age(tribe.adultAge), mother: -1, father: -1, spouse: -1 }, family++);
  return members;
}

/** Creates the starting tribes: camps at credible sites, families, names, traits and knowledge. */
export function createTribes(sys: IndividualsSystem, rng: Rng): { people: People; camps: Camp[]; families: number[][][] } {
  const { params } = sys;
  const sites = chooseSites(sys.world, sys.flora, sys.fauna, sys.terrain, params, sys.edibleResources, params.tribe.count, rng);
  const people = new People(sites.length * params.tribe.size, params.traits.length, params.skills.length, params.memory.waterSlots, params.memory.foodSlots);
  const names = new NameGenerator(params.names, rng);
  const knowledgeBits = startingKnowledge(sys.knowledge);
  const camps: Camp[] = [];
  const families: number[][][] = [];
  let next = 0;
  sites.forEach((site, campId) => {
    const camp = new Camp(campId, site.tile, sys.size, params.camp.homeRadiusTiles);
    camps.push(camp);
    const first = next;
    const members = composeTribe(params.tribe.size, sys, rng);
    const groups = new Map<number, number[]>();
    for (const member of members) {
      const p = next++;
      people.names[p] = names.next();
      people.female[p] = member.female ? 1 : 0;
      people.ageYears[p] = member.age;
      people.mother[p] = member.mother >= 0 ? first + member.mother : -1;
      people.father[p] = member.father >= 0 ? first + member.father : -1;
      people.spouse[p] = member.spouse >= 0 ? first + member.spouse : -1;
      people.camp[p] = campId;
      people.knowledge[p] = knowledgeBits;
      for (let t = 0; t < params.traits.length; t++) people.traits[p * params.traits.length + t] = (rng.nextFloat() + rng.nextFloat()) / 2;
      people.hunger[p] = rng.nextFloat() * INITIAL_NEED_MAX;
      people.thirst[p] = rng.nextFloat() * INITIAL_NEED_MAX;
      people.fatigue[p] = rng.nextFloat() * INITIAL_NEED_MAX;
      people.x[p] = camp.centerX;
      people.y[p] = camp.centerY;
      const group = groups.get(member.family) ?? [];
      group.push(p);
      groups.set(member.family, group);
    }
    families.push([...groups.values()]);
    sys.campRanges.push({ first, last: next });
  });
  return { people, camps, families };
}
