import type { Rng } from '../../core/rng';
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

/** Huts placed around the fire, on walkable tiles, ring after ring. */
function placeHuts(sys: IndividualsSystem, camp: Camp, count: number): void {
  const { size } = sys;
  const r = sys.params.tribe.campRadius;
  for (let ring = 2; ring <= r && camp.huts.length < count; ring++) {
    for (let dy = -ring; dy <= ring && camp.huts.length < count; dy += ring) {
      for (let dx = -ring; dx <= ring && camp.huts.length < count; dx += ring) {
        if (dx === 0 && dy === 0) continue;
        const x = camp.fireX + dx;
        const y = camp.fireY + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const tile = y * size + x;
        if (sys.terrain.walkable(tile) && !camp.huts.some((hut) => hut.tile === tile)) camp.huts.push({ tile, residents: [] });
      }
    }
  }
}

/** Creates the starting tribes: camps at credible sites, families, names, traits and knowledge. */
export function createTribes(sys: IndividualsSystem, rng: Rng): { people: People; camps: Camp[] } {
  const { params } = sys;
  const sites = chooseSites(sys.world, sys.flora, sys.fauna, sys.terrain, params, params.tribe.count, rng);
  const people = new People(sites.length * params.tribe.size, params.traits.length, params.memory.waterSlots, params.memory.foodSlots);
  const names = new NameGenerator(params.names, rng);
  const knowledgeBits = params.startingKnowledge.reduce((bits, id) => bits | (1 << params.knowledge.findIndex((k) => k.id === id)), 0);
  const camps: Camp[] = [];
  let next = 0;
  sites.forEach((site, campId) => {
    const camp = new Camp(campId, site.tile, sys.size, params.camp.homeRadiusTiles, params.camp.maxFuelHours);
    placeHuts(sys, camp, params.tribe.huts);
    camps.push(camp);
    const first = next;
    const members = composeTribe(params.tribe.size, sys, rng);
    const families = new Map<number, number>();
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
      people.x[p] = camp.fireX;
      people.y[p] = camp.fireY;
      // Families share a hut while there is room; the others sleep by the fire.
      let hut = families.get(member.family);
      if (hut === undefined) {
        hut = camp.huts.findIndex((h) => h.residents.length === 0);
        families.set(member.family, hut);
      }
      const home = camp.huts[hut];
      if (home && home.residents.length < params.camp.hutCapacity) {
        home.residents.push(p);
        people.hut[p] = hut;
      }
    }
    sys.campRanges.push({ first, last: next });
  });
  return { people, camps };
}
