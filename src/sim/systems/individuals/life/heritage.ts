import { fillTemplate } from '../../../core/text';
import type { LifeCycle } from './life-cycle';

/** "Ka", "Ka et Lo", "Ka, Lo et Mi". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} et ${names.at(-1)!}`;
}

export const INHERITANCE = 'life.inheritance';
export const BELONGINGS_FOUND = 'life.belongingsFound';

/**
 * Who inherits the personal objects of the dead, by the inheritance rule of their tribe (groups
 * system; the default custom before it): the living partner then the children, the children
 * only, the eldest child, or the group. With no heir, the camp's common stock. Far from the camp,
 * the objects stay on the ground where the body lies.
 */
export function heirsOf(life: LifeCycle, dead: number): number[] {
  const { people, sys } = life;
  const camp = people.camp[dead]!;
  const rule = sys.groups?.inheritanceRule(dead) ?? 'spouseChildren';
  if (rule === 'group') return [];
  const spouse = people.spouse[dead]!;
  if (rule === 'spouseChildren' && life.alive(spouse) && people.camp[spouse] === camp) return [spouse];
  const children = sys.campMembers(camp).filter((child) => people.mother[child] === dead || people.father[child] === dead);
  if (rule === 'eldestChild' && children.length > 1) {
    const eldest = children.reduce((best, child) => (people.ageYears[child]! > people.ageYears[best]! ? child : best));
    return [eldest];
  }
  return children;
}

/** The objects of the dead go to the heirs (told in the journal with the main objects). */
export function bequeath(life: LifeCycle, dead: number, deathEvent: number): void {
  const { people, sys } = life;
  const camp = sys.camps[people.camp[dead]!];
  if (!camp || camp.distanceTo(people.x[dead]!, people.y[dead]!) > sys.params.body.perceptionTiles) {
    sys.production.leaveBelongings(dead, people.px[dead]!, people.py[dead]!, deathEvent);
    return;
  }
  const heirs = heirsOf(life, dead);
  const names = sys.production.bequeath(dead, heirs, people.camp[dead]!);
  if (names.length === 0 || heirs.length === 0) return;
  const x = people.x[dead]!;
  const y = people.y[dead]!;
  life.journal.publish({
    tick: life.tick,
    type: INHERITANCE,
    text: fillTemplate(heirs.length > 1 ? life.params.texts.inheritanceShared : life.params.texts.inheritance, {
      heritier: listNames(heirs.map((heir) => people.names[heir]!)),
      mort: people.names[dead]!,
      objets: names.join(', '),
    }),
    place: life.place(x, y),
    actors: [{ kind: 'human', id: dead }, ...heirs.map((heir) => ({ kind: 'human', id: heir }))],
    causes: life.journal.get(deathEvent) ? [deathEvent] : [],
    details: { dead, heirs: heirs.length },
  });
}

/**
 * Passing by the belongings of someone who died far from the camp, one finds them and takes what
 * one can carry (told in the journal, caused by the death).
 */
export function findBelongings(life: LifeCycle, person: number): void {
  const { people, sys } = life;
  if (sys.production.ground.length === 0 || life.carrier(person) >= 0) return;
  const found = sys.production.findBelongings(person);
  if (!found) return;
  const female = people.female[found.dead] === 1;
  life.journal.publish({
    tick: life.tick,
    type: BELONGINGS_FOUND,
    text: fillTemplate(life.params.texts.belongingsFound, {
      trouveur: people.names[person]!,
      mort: people.names[found.dead]!,
      il_elle: female ? 'elle' : 'il',
      e: female ? 'e' : '',
      objets: found.names.join(', '),
    }),
    place: life.place(people.x[person]!, people.y[person]!),
    actors: [{ kind: 'human', id: person }, { kind: 'human', id: found.dead }],
    causes: life.journal.get(found.deathEvent) ? [found.deathEvent] : [],
    details: { person, dead: found.dead },
  });
}
