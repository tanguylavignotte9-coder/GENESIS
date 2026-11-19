import { fillTemplate } from '../../../core/text';
import { DeathCause } from '../people';
import { fertilityAt, perDay } from './aging';
import type { LifeCycle } from './life-cycle';
import { NEVER_DAY } from './state';
import { weakness } from './disease';

export const BIRTH = 'life.birth';
export const STILLBIRTH = 'life.stillbirth';

/**
 * How much a couple wants a child (0..~1.3): enough mutual affection, a taste for family life, not
 * too many small children already, no fresh memory of famine.
 */
export function desireForChild(life: LifeCycle, woman: number, man: number): number {
  const { people, params, sys } = life;
  const rules = params.fertility.desire;
  const social = sys.social;
  const affection = Math.min(social.affectionFor(woman, man), social.affectionFor(man, woman));
  if (affection <= rules.minAffection) return 0;
  const span = Math.max(1, rules.fullAffection - rules.minAffection);
  let desire = Math.min(1, (affection - rules.minAffection) / span);
  const sociability = (social.trait(woman, 'sociability') + social.trait(man, 'sociability')) / 2;
  desire *= 1 + rules.sociabilityEffect * (2 * sociability - 1);
  let young = 0;
  for (const child of sys.campMembers(people.camp[woman]!)) {
    if ((people.mother[child] === woman || people.father[child] === man) && people.ageYears[child]! < rules.youngChildAge) young++;
  }
  desire *= Math.pow(rules.perYoungChild, young);
  const famine = Math.max(social.memoryOf(woman, 'starving'), social.memoryOf(man, 'starving'));
  desire *= 1 - rules.famineFear * Math.min(1, famine);
  return Math.max(0, desire);
}

/**
 * What the body allows (0..1): both partners at a fertile age, the woman healthy and fed enough
 * (famine stops conception), less while she nurses a small child.
 */
export function fertility(life: LifeCycle, woman: number, man: number): number {
  const { people, params, state } = life;
  const rules = params.fertility;
  if (people.health[woman]! < rules.minHealth) return 0;
  let fertile = fertilityAt(rules.femaleAges, people.ageYears[woman]!) * fertilityAt(rules.maleAges, people.ageYears[man]!);
  const hunger = state.nourishment[woman]!;
  if (hunger >= rules.hungerNone) return 0;
  if (hunger > rules.hungerFull) fertile *= (rules.hungerNone - hunger) / Math.max(1, rules.hungerNone - rules.hungerFull);
  if (life.hasMilk(woman)) fertile *= rules.nursingFactor;
  return fertile;
}

/** Once a day, a woman living with her partner may conceive (body and desire both count). */
export function considerConception(life: LifeCycle, woman: number): void {
  const { people, params, state } = life;
  const man = people.spouse[woman]!;
  if (man < 0 || !life.alive(man) || people.female[man] === 1 || people.camp[man] !== people.camp[woman]) return;
  const d = Math.max(Math.abs(people.x[man]! - people.x[woman]!), Math.abs(people.y[man]! - people.y[woman]!));
  if (d > params.fertility.togetherTiles) return;
  const body = fertility(life, woman, man);
  if (body <= 0) return;
  const chance = perDay(params.fertility.conceptionPerYear * body * desireForChild(life, woman, man), life.yearDays);
  if (life.rng.nextFloat() >= chance) return;
  state.pregnantSince[woman] = life.day;
  state.pregnantBy[woman] = man;
  life.conceptions++;
}

/** Risk factor of a birth: a very young or old mother, weak or starving, is more at risk (and so is the child). */
function birthRisk(life: LifeCycle, mother: number): number {
  const { people, params, state } = life;
  const rules = params.birth;
  const age = people.ageYears[mother]!;
  let risk = 1;
  if (age < rules.youngMotherAge || age > rules.oldMotherAge) risk *= rules.ageRiskFactor;
  if (people.health[mother]! < rules.weakMotherHealth) risk *= rules.weakRiskFactor;
  if (state.nourishment[mother]! > rules.hungryMotherHunger) risk *= rules.hungerRiskFactor;
  return risk;
}

/** Every day of a pregnancy: the child may be lost (more often when the mother starves or is ill), or born at term. */
export function livePregnancy(life: LifeCycle, mother: number): void {
  const { people, params, state } = life;
  const rules = params.pregnancy;
  let risk = rules.miscarriagePerDay * (1 + rules.miscarriageHungerFactor * weakness(params.frailty.hungerFrom, state.nourishment[mother]!));
  if (state.disease[mother]! >= 0) risk *= 1 + rules.miscarriageSickFactor;
  if (life.rng.nextFloat() < risk) {
    state.pregnantSince[mother] = NEVER_DAY;
    life.miscarriages++;
    life.sys.social.lostBaby(mother, state.pregnantBy[mother]!);
    return;
  }
  if (life.day - state.pregnantSince[mother]! >= rules.days) giveBirth(life, mother);
}

/** Journal event of the couple's union (from their memory of it), to explain a birth. */
function coupleEvent(life: LifeCycle, mother: number, father: number): number {
  return father >= 0 ? life.sys.social.memoryEvent(mother, 'couple', father) : -1;
}

/** The birth: the child may be stillborn; the mother may die; otherwise a new person joins the tribe. */
function giveBirth(life: LifeCycle, mother: number): void {
  const { people, params, state, sys } = life;
  const father = state.pregnantBy[mother]!;
  state.pregnantSince[mother] = NEVER_DAY;
  state.lastBirthDay[mother] = life.day;
  const risk = birthRisk(life, mother);
  const texts = params.texts;
  const fatherName = father < 0 ? '?' : life.alive(father) ? people.names[father]! : fillTemplate(texts.fatherDead, { pere: people.names[father]! });
  const union = coupleEvent(life, mother, father);
  const x = people.x[mother]!;
  const y = people.y[mother]!;
  let event: number;
  if (life.rng.nextFloat() < Math.min(1, params.birth.stillbirth * risk)) {
    life.stillbirths++;
    event = life.journal.publish({
      tick: life.tick,
      type: STILLBIRTH,
      text: fillTemplate(texts.stillbirth, { mere: people.names[mother]!, pere: fatherName }),
      place: life.place(x, y),
      actors: father >= 0 ? [{ kind: 'human', id: mother }, { kind: 'human', id: father }] : [{ kind: 'human', id: mother }],
      causes: union >= 0 ? [union] : [],
      details: { mother, father },
    });
    sys.social.lostBaby(mother, father, event);
    state.lastBirthDay[mother] = NEVER_DAY;
  } else {
    const child = sys.bear(mother, father, life.rng.nextFloat() < params.birth.femaleChance);
    life.births++;
    const female = people.female[child] === 1;
    event = life.journal.publish({
      tick: life.tick,
      type: BIRTH,
      text: fillTemplate(texts.birth, { mere: people.names[mother]!, enfant: female ? texts.girl : texts.boy, nom: people.names[child]!, pere: fatherName }),
      place: life.place(x, y),
      actors: [{ kind: 'human', id: child }, { kind: 'human', id: mother }, ...(father >= 0 ? [{ kind: 'human', id: father }] : [])],
      causes: union >= 0 ? [union] : [],
      details: { child, mother, father },
    });
    state.birthEvent[child] = event;
    sys.social.childBorn(child, event);
  }
  if (life.rng.nextFloat() < Math.min(1, params.birth.motherDeath * risk)) {
    sys.die(mother, DeathCause.Childbirth, life.tick, { causes: [event] });
  }
}

/** Traits of a newborn: partly the mean of the parents', partly its own, with some variation. */
export function inheritTraits(life: LifeCycle, child: number, mother: number, father: number): void {
  const { people, params, rng } = life;
  const { parentShare, variation } = params.heredity;
  const n = people.traitCount;
  for (let t = 0; t < n; t++) {
    const m = mother >= 0 ? people.trait(mother, t) : 0.5;
    const f = father >= 0 ? people.trait(father, t) : m;
    const own = (rng.nextFloat() + rng.nextFloat()) / 2;
    const value = parentShare * ((m + f) / 2) + (1 - parentShare) * own + variation * (rng.nextFloat() * 2 - 1);
    people.traits[child * n + t] = Math.max(0, Math.min(1, value));
  }
}
