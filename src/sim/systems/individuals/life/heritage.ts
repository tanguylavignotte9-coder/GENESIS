import { fillTemplate } from '../../../core/text';
import type { LifeCycle } from './life-cycle';

/** "Ka", "Ka et Lo", "Ka, Lo et Mi". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} et ${names.at(-1)!}`;
}

export const INHERITANCE = 'life.inheritance';

/**
 * Who inherits the personal objects of the dead, by the default custom (to be replaced by the
 * property rules of the groups, step 9): the living partner, otherwise the children; with no heir,
 * the camp's common stock. Objects stay with a body that lies far from the camp.
 */
export function heirsOf(life: LifeCycle, dead: number): number[] {
  const { people, sys } = life;
  const camp = people.camp[dead]!;
  const spouse = people.spouse[dead]!;
  if (life.alive(spouse) && people.camp[spouse] === camp) return [spouse];
  return sys.campMembers(camp).filter((child) => people.mother[child] === dead || people.father[child] === dead);
}

/** The objects of the dead go to the heirs (told in the journal with the main objects). */
export function bequeath(life: LifeCycle, dead: number, deathEvent: number): void {
  const { people, sys } = life;
  const camp = sys.camps[people.camp[dead]!];
  if (!camp || camp.distanceTo(people.x[dead]!, people.y[dead]!) > sys.params.body.perceptionTiles) return;
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
