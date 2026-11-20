import { grownTo } from '../../core/columns';
import type { Journal } from '../../core/journal';
import type { Rng } from '../../core/rng';
import type { IndividualsSystem } from '../individuals/individuals-system';
import type { GroupView } from '../individuals/group-view';
import { Group } from './group';
import { LEVEL_COUNT, type GroupsParams } from './params';
import { assignNewcomers, foundStartingGroups, rebuildMembers, updateFamilies } from './membership';
import { formClans } from './clans';
import { updateOpinions, readJournal } from './opinion';
import { runPolitics } from './politics';
import { meetOtherTribes } from './tribes';
import { considerMove } from './moves';
import { stillWantsPower } from './ambitions';
import { groupName } from './texts';
import type { IdeasSystem } from '../ideas/ideas-system';
import { adoptIdeas } from './adoption';

/**
 * Groups, power and rules (step 9). Every person belongs to one tribe (level 0), at most one clan
 * (level 1) and one family (level 2). Each day the members' support for their leaders and their
 * grievances change with what they live; every few days the leaders decide (duties, strategy,
 * rules, moves of the camp) and the ambitious act when the gap between discontent and legitimacy
 * grows: reform, contest, overthrow, split. Tribes meet, judge each other, ally or merge.
 * The physical side of a decision (moving or founding a camp, joining another camp) is carried out
 * by the individuals system, through its own methods.
 */
export class GroupsSystem implements GroupView {
  readonly groups: Group[] = [];
  /** LEVEL_COUNT values per person: id of their group at each level (-1 none). */
  member = new Int32Array(0);
  /** LEVEL_COUNT values per person: support for the leaders of their group at that level (0..100). */
  approval = new Float32Array(0);
  /** What weighs on each person against the powers in place (0..100). */
  grievance = new Float32Array(0);
  /** 1 if the person follows the decisions and duties of their tribe's leaders. */
  obeys = new Uint8Array(0);
  /** Duty handed out by the tribe's leaders (index in DUTIES, -1 none). */
  duty = new Int8Array(0);
  /** Journal events already read. */
  journalRead = 0;
  day = 0;
  tick = 0;

  constructor(
    readonly humans: IndividualsSystem,
    public params: GroupsParams,
    readonly rng: Rng,
    readonly journal: Journal,
    day: number,
    tick: number,
    /** The ideas system (step 10): names of peoples, cultures, faiths and languages of the members. */
    readonly ideas: IdeasSystem | null = null,
  ) {
    this.day = day;
    this.tick = tick;
    this.journalRead = journal.size;
    this.ensureCapacity();
    foundStartingGroups(this);
    humans.attachGroups(this);
  }

  refreshParams(params: GroupsParams): void {
    this.params = params;
  }

  get people(): IndividualsSystem['people'] {
    return this.humans.people;
  }

  /** Room for the people born since. */
  ensureCapacity(): void {
    const capacity = this.humans.people.capacity;
    if (this.grievance.length >= capacity) return;
    this.member = grownTo(this.member, capacity * LEVEL_COUNT, -1);
    this.approval = grownTo(this.approval, capacity * LEVEL_COUNT, 50);
    this.grievance = grownTo(this.grievance, capacity, 0);
    this.obeys = grownTo(this.obeys, capacity, 1);
    this.duty = grownTo(this.duty, capacity, -1);
  }

  /** The day's group life (called once a day, after the plants and animals). */
  dailyUpdate(day: number, tick: number): void {
    this.day = day;
    this.tick = tick;
    this.ensureCapacity();
    assignNewcomers(this);
    updateFamilies(this);
    rebuildMembers(this);
    readJournal(this);
    updateOpinions(this);
    meetOtherTribes(this);
    for (const tribe of this.tribes()) considerMove(this, tribe);
    if (day % this.params.clans.everyDays === 0) formClans(this);
    adoptIdeas(this);
    runPolitics(this);
  }

  // ----- reading -----------------------------------------------------------------------------

  groupOf(person: number, level: number): Group | null {
    const id = this.member[person * LEVEL_COUNT + level]!;
    return id >= 0 ? this.groups[id]! : null;
  }

  tribeOf(person: number): Group | null {
    return this.groupOf(person, 0);
  }

  /** Living tribes. */
  tribes(): Group[] {
    return this.groups.filter((group) => group.level === 0 && group.alive);
  }

  /** Living groups of the level below `parent`. */
  childrenOf(parent: Group): Group[] {
    return this.groups.filter((group) => group.parent === parent.id && group.alive);
  }

  tribeOfCamp(camp: number): Group | null {
    return this.groups.find((group) => group.level === 0 && group.alive && group.camp === camp) ?? null;
  }

  isAdult(person: number): boolean {
    return this.people.ageYears[person]! >= this.params.adultAge;
  }

  adults(group: Group): number[] {
    return group.members.filter((person) => this.isAdult(person));
  }

  isLeader(person: number, group: Group): boolean {
    return group.leaders.includes(person);
  }

  // ----- GroupView (read by the individuals system) -----------------------------------------

  /** Factor on the urge to answer one of the camp's needs: the duty one was given, if one obeys. */
  dutyFactor(person: number, duty: number): number {
    if (person >= this.duty.length || this.obeys[person] === 0) return 1;
    const given = this.duty[person]!;
    if (given < 0) return 1;
    return given === duty ? this.params.duties.boost : this.params.duties.others;
  }

  /** Id of the inheritance rule of the person's tribe ("spouseChildren" when none). */
  inheritanceRule(person: number): string {
    const tribe = person < this.grievance.length ? this.tribeOf(person) : null;
    return tribe ? this.params.inheritance[tribe.inheritance]!.id : 'spouseChildren';
  }

  stillWants(person: number, ambition: string): boolean {
    return stillWantsPower(this, person, ambition);
  }

  // ----- writing -----------------------------------------------------------------------------

  /** A new group of `level` inside `parent`, named after its founder. */
  addGroup(level: number, parent: number, founder: number, regime: number, foundedEvent: number): Group {
    // A tribe takes a people's name in its founder's language; clans and families their founder's name.
    const name = groupName(this.params.nameTemplates[level]!, level === 0 && this.ideas ? this.ideas.tribeNameOf(founder) : (this.people.names[founder] ?? '?'));
    const group = new Group(this.groups.length, level, parent, name, founder, this.day, foundedEvent, regime);
    group.settledDay = this.day;
    this.groups.push(group);
    return group;
  }

  /** Puts the person in `group` at its level (and nowhere else at that level). */
  setMember(person: number, group: Group | null): void {
    this.member[person * LEVEL_COUNT + (group?.level ?? 0)] = group ? group.id : -1;
  }

  clearMember(person: number, level: number): void {
    this.member[person * LEVEL_COUNT + level] = -1;
  }

  /** The group ends (no members left, absorbed…). Its children end with it if `cascade`. */
  endGroup(group: Group, event: number): void {
    if (!group.alive) return;
    group.endedDay = this.day;
    group.endEvent = event;
    group.leaders = [];
  }
}
