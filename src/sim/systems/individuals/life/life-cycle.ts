import type { Journal } from '../../../core/journal';
import type { Rng } from '../../../core/rng';
import { fillTemplate } from '../../../core/text';
import { daysPerYear, type TimeParams } from '../../../core/time-params';
import { describeLocation } from '../../world/places';
import type { IndividualsSystem } from '../individuals-system';
import { DeathCause, type People } from '../people';
import { appetiteAt, oldAgeDeathPerDay, vigorAt } from './aging';
import { considerConception, livePregnancy } from './birth';
import { catchDiseases, diseaseDamagePerHour, endEpidemics, healDiseases, onDiseaseDeath, spreadDisease } from './disease';
import { bequeath, findBelongings } from './heritage';
import { lookForGuardians, onGuardianDeath } from './orphans';
import type { LifeParams } from './params';
import { LifeState, NEVER_DAY } from './state';
export { LIFE_INPUTS } from './inputs';

export const FAMINE = 'life.famine';
const FULL = 100;
const HOURS_PER_DAY = 24;

/** An epidemic under way in a camp (one disease). */
export interface Epidemic {
  camp: number;
  disease: number;
  event: number;
  cases: number;
  deaths: number;
}

/**
 * The life cycle of the humans (step 8), owned by the individuals system: ageing and the strength
 * of the body, couples who want and may have children, pregnancy and birth, nursing, childhood
 * (learning by watching, play, a guardian), diseases and epidemics, death of old age, orphans
 * taken in, and the inheritance of personal objects.
 */
export class LifeCycle {
  readonly state: LifeState;
  readonly people: People;
  readonly yearDays: number;
  /** Population counts over time (statistics). */
  readonly census: { day: number; humans: number }[] = [];
  /** Epidemics under way, by "camp:disease". */
  readonly epidemics = new Map<string, Epidemic>();
  /** Epidemics that ended (kept for the summary). */
  epidemicCount = 0;
  famineCount = 0;
  births = 0;
  stillbirths = 0;
  conceptions = 0;
  miscarriages = 0;
  adoptions = 0;
  /** Children who lost their guardian and wait for someone to take them in. */
  readonly orphans: { child: number; parent: number; event: number; needsNurse: boolean }[] = [];
  /** Recent deaths by hunger in each camp, and the famine under way (journal event, -1 none). */
  readonly hungerDeaths: { day: number; event: number }[][] = [];
  readonly famine: { event: number; lastDay: number }[] = [];
  day = 0;
  tick = 0;

  constructor(
    readonly sys: IndividualsSystem,
    public params: LifeParams,
    readonly time: TimeParams,
    readonly rng: Rng,
    readonly journal: Journal,
  ) {
    this.people = sys.people;
    this.yearDays = daysPerYear(time);
    this.state = new LifeState(this.people.capacity, params.diseases.length);
    const { people, state } = this;
    for (let p = 0; p < people.count; p++) {
      state.birthDay[p] = -Math.round(people.ageYears[p]! * this.yearDays);
      state.nourishment[p] = people.hunger[p]!;
      if (people.ageYears[p]! < params.stages.adultAge) state.guardian[p] = people.mother[p]! >= 0 ? people.mother[p]! : people.father[p]!;
    }
    // A mother of a small child of the starting tribe is still nursing it.
    for (let p = 0; p < people.count; p++) {
      const mother = people.mother[p]!;
      if (mother >= 0) state.lastBirthDay[mother] = Math.max(state.lastBirthDay[mother]!, state.birthDay[p]!);
    }
  }

  refreshParams(params: LifeParams): void {
    this.params = params;
  }

  // ----- facts ------------------------------------------------------------------------------

  alive(person: number): boolean {
    return person >= 0 && this.people.alive[person] === 1;
  }

  isChild(person: number): boolean {
    return this.people.ageYears[person]! < this.params.stages.adultAge;
  }

  isInfant(person: number): boolean {
    return this.people.ageYears[person]! < this.params.stages.carriedUntilAge;
  }

  /** Who carries a small child (its guardian, if alive and in the camp), or -1. */
  carrier(person: number): number {
    if (!this.isInfant(person)) return -1;
    const guardian = this.state.guardian[person]!;
    return this.alive(guardian) && this.people.camp[guardian] === this.people.camp[person] ? guardian : -1;
  }

  /** A woman who gave birth less than the weaning age ago still has milk (unless she starves). */
  hasMilk(woman: number): boolean {
    const { people, state, params } = this;
    // Milk dries up only after days of famine (the body keeps nursing through a hard day).
    if (!this.alive(woman) || people.female[woman] !== 1 || state.nourishment[woman]! >= params.infancy.milkFailsHunger) return false;
    return this.day - state.lastBirthDay[woman]! < params.stages.weaningAge * this.yearDays;
  }

  /** Who nurses a small child right now (its mother or its guardian, if she has milk and is near), or -1. */
  nurse(person: number): number {
    const { people, params } = this;
    if (people.ageYears[person]! >= params.stages.weaningAge) return -1;
    for (const woman of [people.mother[person]!, this.state.guardian[person]!]) {
      if (woman < 0 || !this.hasMilk(woman)) continue;
      const d = people.distance(woman, person);
      if (d <= params.infancy.nurseTiles) return woman;
    }
    return -1;
  }

  /** Strength of the body now: age, then disease and pregnancy weaken it. */
  vigor(person: number): number {
    const { state, params } = this;
    let vigor = vigorAt(params, this.people.ageYears[person]!);
    const disease = state.disease[person]!;
    if (disease >= 0) vigor *= params.diseases[disease]?.vigorWhileSick ?? 1;
    if (state.pregnant(person)) vigor *= params.pregnancy.vigorFactor;
    return vigor;
  }

  /** Hunger per hour of the body: an adult's (`base`) scaled by age, plus what a pregnancy costs. */
  hungerPerHour(person: number, base: number): number {
    const pregnancy = this.state.pregnant(person) ? this.params.pregnancy.hungerPerHour : 0;
    return base * appetiteAt(this.params, this.people.ageYears[person]!) + pregnancy;
  }

  /** Health lost per hour to a disease (0 if healthy). */
  diseaseDamage(person: number): number {
    return diseaseDamagePerHour(this, person);
  }

  /** Children (alive, under adult age) a person takes care of. */
  dependants(person: number): number {
    let n = 0;
    for (const child of this.sys.campMembers(this.people.camp[person]!)) if (this.state.guardian[child] === person && this.isChild(child)) n++;
    return n;
  }

  place(x: number, y: number): { x: number; y: number; label: string } {
    const world = this.sys.world;
    return { x, y, label: describeLocation(world, x, y) };
  }

  /** Journal event of the regional hardship (drought, harsh winter) at a tile, if any. */
  hardshipAt(tile: number): number {
    const climate = this.sys.climate;
    const anomaly = climate.anomalies[climate.anomalyIndex[tile]! - 1];
    return anomaly && climate.params.anomalies.types[anomaly.type]?.hardshipName !== undefined ? anomaly.startEventId : -1;
  }

  // ----- the passing of time ---------------------------------------------------------------

  /** Every day: one day older, pregnancies, couples, old age, diseases, orphans, the census. */
  newDay(day: number, tick: number): void {
    this.day = day;
    this.tick = tick;
    const { people, state } = this;
    const yearPart = 1 / this.yearDays;
    for (let p = 0; p < people.count; p++) if (people.alive[p] === 1) people.ageYears[p] = people.ageYears[p]! + yearPart;
    // Index order (deterministic); the people born today are not visited again.
    const count = people.count;
    for (let p = 0; p < count; p++) {
      if (people.alive[p] === 0) continue;
      if (state.pregnant(p)) livePregnancy(this, p);
      else if (people.female[p] === 1) considerConception(this, p);
      if (people.alive[p] === 0) continue;
      if (this.rng.nextFloat() < oldAgeDeathPerDay(this.params, people.ageYears[p]!, people.health[p]!, this.yearDays)) {
        this.sys.die(p, DeathCause.OldAge, tick, { vars: { age: String(Math.floor(people.ageYears[p]!)) } });
        continue;
      }
      healDiseases(this, p);
      catchDiseases(this, p);
    }
    endEpidemics(this);
    lookForGuardians(this);
    this.endFamines();
    if (day % this.yearDays === 0) this.eldersEarnRespect();
    if (day % this.params.census.everyDays === 0) this.census.push({ day, humans: people.living });
  }

  /** Every hour of a person: the body remembers hunger, a sick person spreads the disease, a child watches the adults. */
  liveHour(person: number): void {
    const { people, state } = this;
    const memory = 1 / (this.params.fertility.nourishmentDays * HOURS_PER_DAY);
    state.nourishment[person] = state.nourishment[person]! + (people.hunger[person]! - state.nourishment[person]!) * memory;
    if (state.disease[person]! >= 0) spreadDisease(this, person);
    if (this.isChild(person) && !this.sys.isSleeping(person)) this.watchAdults(person);
    else if (!this.sys.isSleeping(person)) findBelongings(this, person);
  }

  /**
   * A small child at the breast is fed by the milk of its mother (or nurse), who pays for it in
   * hunger. Returns true if the child was nursed this step.
   */
  nurseStep(person: number, hours: number): boolean {
    const nurse = this.nurse(person);
    if (nurse < 0) return false;
    const { people } = this;
    const relief = this.sys.params.body.eatUnitsPerHour * this.sys.params.body.hungerPerFoodUnit * hours;
    people.hunger[person] = Math.max(0, people.hunger[person]! - relief);
    people.thirst[person] = Math.max(0, people.thirst[person]! - this.sys.params.body.drinkPerHour * hours);
    people.hunger[nurse] = Math.min(FULL, people.hunger[nurse]! + this.params.infancy.milkHungerPerHour * hours);
    return true;
  }

  /** A child near an adult at work learns a little of that skill (slowly: watching is not doing). */
  private watchAdults(child: number): void {
    const { people, state, params, sys } = this;
    if (people.ageYears[child]! < params.childhood.observeMinAge) return;
    const recent = sys.step - sys.params.stepsPerHour;
    const reach = params.childhood.observeTiles;
    const working = (adult: number): boolean =>
      this.alive(adult) && !this.isChild(adult) && state.lastSkill[adult]! >= 0 && state.lastSkillStep[adult]! >= recent && people.distance(adult, child) <= reach;
    // The guardian first; otherwise any adult at work nearby.
    let teacher = working(state.guardian[child]!) ? state.guardian[child]! : -1;
    if (teacher < 0) {
      sys.grid.forEachNear(people.px[child]!, people.py[child]!, reach, (adult) => {
        if (teacher < 0 && adult !== child && working(adult)) teacher = adult;
      });
    }
    if (teacher >= 0) sys.practise(child, state.lastSkill[teacher]!, params.childhood.observeShare, false);
  }

  /** Every year, those who know an elder respect them a little more (more so when skilled). */
  private eldersEarnRespect(): void {
    const { people, params, sys } = this;
    const s = sys.social.state;
    const rules = params.aging;
    for (let p = 0; p < people.count; p++) {
      if (people.alive[p] === 0) continue;
      for (let slot = p * s.relationSlots; slot < (p + 1) * s.relationSlots; slot++) {
        const elder = s.relOther[slot]!;
        if (elder < 0 || !this.alive(elder) || people.ageYears[elder]! < params.stages.elderAge) continue;
        let best = 0;
        for (let k = 0; k < people.skillCount; k++) best = Math.max(best, people.skill(elder, k));
        const gain = rules.respectPerYear * (1 - rules.respectSkillShare + rules.respectSkillShare * best);
        sys.social.respectElder(p, elder, gain);
      }
    }
  }

  // ----- deaths ----------------------------------------------------------------------------

  /** After a death: the unborn child is lost, guardianship passes on, objects are inherited, famines and epidemics are told. */
  onDeath(person: number, cause: number, event: number): void {
    const { state } = this;
    state.deathDay[person] = this.day;
    state.pregnantSince[person] = NEVER_DAY;
    this.milkDriesUp(person);
    if (state.disease[person]! >= 0) onDiseaseDeath(this, person, cause);
    onGuardianDeath(this, person, event);
    bequeath(this, person, event);
    if (cause === DeathCause.Hunger) this.onHungerDeath(person, event);
    this.orphansGone(person);
  }

  /** A nursling died: unless its mother nurses another, her milk dries up (and she can conceive again). */
  private milkDriesUp(child: number): void {
    const { people, state, params } = this;
    const mother = people.mother[child]!;
    if (!this.alive(mother) || people.ageYears[child]! >= params.stages.weaningAge) return;
    for (const other of this.sys.campMembers(people.camp[mother]!)) {
      if (people.ageYears[other]! < params.stages.weaningAge && (people.mother[other] === mother || state.guardian[other] === mother)) return;
    }
    state.lastBirthDay[mother] = NEVER_DAY;
  }

  private orphansGone(person: number): void {
    for (let k = this.orphans.length - 1; k >= 0; k--) if (this.orphans[k]!.child === person) this.orphans.splice(k, 1);
  }

  /** Several deaths by hunger in a short time: the journal tells of a famine (once while it lasts). */
  private onHungerDeath(person: number, event: number): void {
    const camp = this.people.camp[person]!;
    const rules = this.params.famine;
    const recent = (this.hungerDeaths[camp] ??= []);
    recent.push({ day: this.day, event });
    while (recent.length > 0 && this.day - recent[0]!.day > rules.windowDays) recent.shift();
    const famine = (this.famine[camp] ??= { event: -1, lastDay: NEVER_DAY });
    famine.lastDay = this.day;
    if (famine.event >= 0 || recent.length < rules.minDeaths) return;
    const x = this.people.x[person]!;
    const y = this.people.y[person]!;
    const days = this.day - recent[0]!.day + 1;
    const hardship = this.hardshipAt(this.sys.tileOf(person));
    famine.event = this.journal.publish({
      tick: this.tick,
      type: FAMINE,
      text: fillTemplate(this.params.texts.famine, { lieu: this.place(x, y).label, morts: String(recent.length), jours: String(days) }),
      place: this.place(x, y),
      actors: [],
      causes: [...(hardship >= 0 ? [hardship] : []), ...recent.map((death) => death.event)],
      details: { camp },
    });
    this.famineCount++;
  }

  /** A famine is over once nobody died of hunger for a while. */
  private endFamines(): void {
    for (const famine of this.famine) {
      if (famine && famine.event >= 0 && this.day - famine.lastDay > this.params.famine.windowDays) famine.event = -1;
    }
  }

  /** Deaths that left a child without anyone to care for it (or to nurse it), for the journal's causes. */
  orphanCauses(person: number): number[] {
    return this.orphans.filter((orphan) => orphan.child === person).map((orphan) => orphan.event);
  }

  /** The famine under way in a camp (-1 none). */
  famineEvent(camp: number): number {
    return this.famine[camp]?.event ?? -1;
  }

  // ----- the brain -------------------------------------------------------------------------

  /** What the life cycle brings to a decision (written in `inputs` from `offset`, in the order of LIFE_INPUTS). */
  fillInputs(person: number, inputs: Float64Array, offset: number): void {
    const { people, params, state } = this;
    const age = people.ageYears[person]!;
    const infant = this.carrier(person) >= 0;
    const child = !infant && age < params.stages.adultAge;
    let k = offset;
    inputs[k++] = infant ? 1 : 0;
    inputs[k++] = child ? 1 : 0;
    inputs[k++] = !infant && age < params.stages.playUntilAge ? 1 : 0;
    const guardian = state.guardian[person]!;
    let away = 0;
    if (child && this.alive(guardian)) {
      const d = people.distance(guardian, person);
      away = Math.min(1, d / (2 * params.childhood.followTiles));
    }
    inputs[k++] = away;
    inputs[k++] = child || age < params.stages.playUntilAge ? this.playmates(person) : 0;
    inputs[k] = state.disease[person]! >= 0 ? 1 : 0;
  }

  /** Other children awake nearby to play with (0..1: two or more is plenty). */
  private playmates(person: number): number {
    const { people, params, sys } = this;
    const reach = params.childhood.play.playmateTiles;
    let n = 0;
    sys.grid.forEachNear(people.x[person]!, people.y[person]!, reach, (other) => {
      if (other === person || people.alive[other] !== 1 || people.ageYears[other]! >= params.stages.playUntilAge || this.isInfant(other) || sys.isSleeping(other)) return;
      if (people.distance(other, person) <= reach) n++;
    });
    return Math.min(1, n / 2);
  }

  /** One hour of play: joy, company, and friendship with the children playing nearby. */
  play(person: number, hours: number): void {
    const { people, params, sys } = this;
    const rules = params.childhood.play;
    const social = sys.social;
    social.cheer(person, rules.joyPerHour * hours, 0);
    const reach = rules.playmateTiles;
    sys.grid.forEachNear(people.x[person]!, people.y[person]!, reach, (other) => {
      if (other === person || people.alive[other] !== 1 || this.isInfant(other) || people.ageYears[other]! >= params.stages.playUntilAge || sys.isSleeping(other)) return;
      if (people.distance(other, person) > reach) return;
      social.cheer(person, 0, rules.lonelinessReliefPerHour * hours);
      social.playedWith(person, other, rules.affectionPerHour * hours);
    });
  }
}
