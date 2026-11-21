import { dateAtTick, formatDate } from '../../../core/calendar';
import type { LifeCycle } from './life-cycle';
import { NEVER_DAY } from './state';

/** Facts of the life cycle shown in a character sheet (the display writes the sentences). */
export interface LifeFacts {
  born: string;
  died: string;
  disease: { name: string; days: number; source: number; epidemic: boolean } | null;
  pregnancy: { days: number; total: number; father: number } | null;
  nursedBy: number;
  nursing: boolean;
  carriedBy: number;
  guardian: number;
  adopted: boolean;
  orphan: boolean;
  vigor: number;
  /** Strength now (1 = an average man in his prime), build at birth (1 = average) and training (0..1). */
  strength: { now: number; build: number; training: number };
  stage: 'baby' | 'child' | 'adult' | 'elder';
}

function dayText(life: LifeCycle, day: number): string {
  return formatDate(dateAtTick(day * life.time.ticksPerDay, life.time), life.time);
}

export function describeLife(life: LifeCycle, person: number): LifeFacts {
  const { state, people, params } = life;
  const alive = life.alive(person);
  const code = state.disease[person]!;
  const age = people.ageYears[person]!;
  let nursing = false;
  if (alive && life.hasMilk(person)) {
    for (const child of life.sys.campMembers(people.camp[person]!)) if (life.nurse(child) === person) nursing = true;
  }
  return {
    born: state.birthDay[person]! >= 0 && person >= life.sys.startingCount ? dayText(life, state.birthDay[person]!) : '',
    died: state.deathDay[person] !== NEVER_DAY ? dayText(life, state.deathDay[person]!) : '',
    disease:
      alive && code >= 0
        ? { name: params.diseases[code]?.name ?? '?', days: life.day - state.diseaseSince[person]!, source: state.diseaseSource[person]!, epidemic: state.diseaseEvent[person]! >= 0 }
        : null,
    pregnancy: alive && state.pregnant(person) ? { days: life.day - state.pregnantSince[person]!, total: params.pregnancy.days, father: state.pregnantBy[person]! } : null,
    nursedBy: alive ? life.nurse(person) : -1,
    nursing,
    carriedBy: alive ? life.carrier(person) : -1,
    guardian: life.isChild(person) ? state.guardian[person]! : -1,
    adopted: state.adoptionEvent[person]! >= 0,
    orphan: alive && life.orphans.some((orphan) => orphan.child === person) && !life.alive(state.guardian[person]!),
    vigor: life.vigor(person),
    strength: { now: life.strength(person), build: state.build[person]!, training: state.training[person]! },
    stage: life.isInfant(person) ? 'baby' : life.isChild(person) ? 'child' : age >= params.stages.elderAge ? 'elder' : 'adult',
  };
}
