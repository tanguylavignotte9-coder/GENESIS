import { fillTemplate } from '../../../core/text';
import type { LifeCycle } from './life-cycle';

export const ADOPTION = 'life.adoption';
const FULL = 100;

type Tie = keyof LifeCycle['params']['texts']['ties'] | null;

/** Two people who share a parent. */
function siblings(life: LifeCycle, a: number, b: number): boolean {
  const { people } = life;
  if (a < 0 || b < 0 || a === b) return false;
  return (people.mother[a]! >= 0 && people.mother[a] === people.mother[b]) || (people.father[a]! >= 0 && people.father[a] === people.father[b]);
}

/** Blood tie of a would-be guardian with the child (grandparent, aunt or uncle, elder sibling), or null. */
function bloodTie(life: LifeCycle, adult: number, child: number): Tie {
  const { people } = life;
  const female = people.female[adult] === 1;
  for (const parent of [people.mother[child]!, people.father[child]!]) {
    if (parent < 0) continue;
    if (people.mother[parent] === adult || people.father[parent] === adult) return female ? 'grandmother' : 'grandfather';
    if (siblings(life, parent, adult)) return female ? 'aunt' : 'uncle';
  }
  if (siblings(life, adult, child)) return female ? 'sister' : 'brother';
  if (people.mother[child] === adult) return 'mother';
  if (people.father[child] === adult) return 'father';
  return null;
}

/**
 * A guardian dies: the other parent takes over if alive and there; otherwise the child is an orphan
 * waiting for someone to take it in. A small child who loses its mother also needs a woman with milk.
 */
export function onGuardianDeath(life: LifeCycle, dead: number, event: number): void {
  const { people, state, params, sys } = life;
  for (const child of sys.campMembers(people.camp[dead]!)) {
    if (child === dead || !life.isChild(child)) continue;
    const isMother = people.mother[child] === dead;
    if (state.guardian[child] !== dead && !isMother) continue;
    const needsNurse = isMother && people.ageYears[child]! < params.stages.weaningAge;
    if (state.guardian[child] === dead) {
      const other = people.mother[child] === dead ? people.father[child]! : people.mother[child]!;
      const parent = other !== dead && life.alive(other) && people.camp[other] === people.camp[child] ? other : -1;
      state.guardian[child] = parent;
      if (parent >= 0 && !needsNurse) continue;
    }
    life.orphans.push({ child, parent: dead, event, needsNurse });
  }
}

/**
 * How much an adult wants to take the orphan in: family first, then those who loved the child or
 * its dead parent; the generous more, those who already have many children in their care less.
 */
function willingness(life: LifeCycle, adult: number, child: number, parent: number): number {
  const { params, sys } = life;
  const rules = params.orphans;
  const social = sys.social;
  const tie = bloodTie(life, adult, child);
  let want = tie !== null ? rules.kinBonus : 0;
  want += rules.bondWeight * ((Math.max(0, social.affectionFor(adult, child)) + Math.max(0, social.affectionFor(adult, parent))) / FULL);
  want *= 1 + rules.generosityEffect * (2 * social.trait(adult, 'generosity') - 1);
  want -= rules.burdenPerChild * life.dependants(adult);
  return want;
}

/** Every day: for each orphan, whoever knows of the death and wants it most (if anyone wants it enough) takes the child in. */
export function lookForGuardians(life: LifeCycle): void {
  const { people, params, state, sys } = life;
  const rules = params.orphans;
  for (let k = life.orphans.length - 1; k >= 0; k--) {
    const orphan = life.orphans[k]!;
    const { child, parent } = orphan;
    if (!life.alive(child) || !life.isChild(child) || (orphan.needsNurse && people.ageYears[child]! >= params.stages.weaningAge)) {
      life.orphans.splice(k, 1);
      continue;
    }
    let best = -1;
    let bestWant = rules.minWillingness;
    for (const adult of sys.campMembers(people.camp[child]!)) {
      if (adult === child || state.guardian[child] === adult) continue;
      const age = people.ageYears[adult]!;
      if (age < rules.minGuardianAge || age > rules.maxGuardianAge) continue;
      if (orphan.needsNurse && !life.hasMilk(adult)) continue;
      // One takes in only the child of a death one knows about.
      if (!sys.social.knowsDeathOf(adult, parent)) continue;
      const want = willingness(life, adult, child, parent);
      if (want > bestWant) {
        bestWant = want;
        best = adult;
      }
    }
    if (best < 0) continue;
    adopt(life, child, best, parent, orphan.event, orphan.needsNurse);
    life.orphans.splice(k, 1);
  }
}

function adopt(life: LifeCycle, child: number, guardian: number, parent: number, deathEvent: number, nurse: boolean): void {
  const { people, params, state, sys } = life;
  state.guardian[child] = guardian;
  life.adoptions++;
  const ties = params.texts.ties;
  const tie = bloodTie(life, guardian, child);
  const female = people.female[guardian] === 1;
  const lien = tie !== null ? ties[tie] : fillTemplate(female ? ties.closeToFemale : ties.closeTo, { parent: people.names[parent]! });
  const x = people.x[guardian]!;
  const y = people.y[guardian]!;
  const event = life.journal.publish({
    tick: life.tick,
    type: ADOPTION,
    text: fillTemplate(nurse ? params.texts.wetNurse : params.texts.adoption, {
      tuteur: people.names[guardian]!,
      enfant: people.names[child]!,
      e: people.female[child] === 1 ? 'e' : '',
      lien,
      parent: people.names[parent]!,
    }),
    place: life.place(x, y),
    actors: [
      { kind: 'human', id: guardian },
      { kind: 'human', id: child },
      { kind: 'human', id: parent },
    ],
    causes: life.journal.get(deathEvent) ? [deathEvent] : [],
    details: { child, guardian, parent },
  });
  state.adoptionEvent[child] = event;
  sys.social.adopted(child, guardian, event);
  sys.production.shareBed(child, guardian);
}
