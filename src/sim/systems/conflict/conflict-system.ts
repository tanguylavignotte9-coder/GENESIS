import { grownTo } from '../../core/columns';
import type { Journal } from '../../core/journal';
import type { Rng } from '../../core/rng';
import type { Group } from '../groups/group';
import type { GroupsSystem } from '../groups/groups-system';
import type { IdeasSystem } from '../ideas/ideas-system';
import type { ConflictView } from '../individuals/conflict-view';
import type { IndividualsSystem } from '../individuals/individuals-system';
import { brawls } from './brawl';
import { feudDay, readKillings } from './feud';
import { civilWars } from './civil-war';
import { diplomacyDay, envoysHour } from './diplomacy';
import { expeditionsHour, warDecisions } from './war';
import type { ConflictParams } from './params';
import { Envoy, Expedition, ExpeditionState, Feud, TribeRelation, type BattleMark } from './state';

/** Battles kept for the map (the most recent ones). */
const KEPT_BATTLES = 24;

/**
 * Conflict and diplomacy (step 11). Violence follows the same logic as the rest: individuals decide
 * to fight, groups decide to make war. A quarrel may turn to blows (brawl), a murder may start a
 * feud between families that lasts for generations, a hungry, envious or ambitious tribe may raid
 * another, its leaders may declare war (conquest, tribute, peace or collapse follow), a tribe whose
 * power lost its legitimacy may tear itself apart. Treaties are carried by emissaries who walk,
 * may not be understood, and may arrive too late; betrayals are remembered. Every blow goes through
 * the common interaction mechanism; wounds and deaths are the individuals' business.
 */
export class ConflictSystem implements ConflictView {
  readonly relations = new Map<string, TribeRelation>();
  readonly expeditions: Expedition[] = [];
  readonly feuds: Feud[] = [];
  readonly envoys: Envoy[] = [];
  readonly battles: BattleMark[] = [];
  /** Per person: war party (expedition id, -1 none), envoy (index, -1), morale (0..100). */
  mission = new Int32Array(0);
  envoyOf = new Int32Array(0);
  morale = new Float32Array(0);
  /** Who killed whom (killer → victims), for the character sheet. */
  readonly kills = new Map<number, number[]>();
  /** What kind of fight is going on now, and how each victim of the day died (read with the journal). */
  currentFight: 'brawl' | 'revenge' | 'battle' | 'civil' = 'brawl';
  readonly killKinds = new Map<number, 'brawl' | 'revenge' | 'battle' | 'civil'>();
  /** Last day each avenger tried their revenge. */
  readonly lastRevenge = new Map<number, number>();
  /** Counters for the summaries (brawls, killings, feuds, raids, wars, battles…). */
  readonly counts = { brawls: 0, murders: 0, exiles: 0, feuds: 0, revenges: 0, raids: 0, wars: 0, battles: 0, conquests: 0, tributes: 0, peaces: 0, truces: 0, civilWars: 0, captives: 0, deserters: 0, betrayals: 0, marriages: 0 };
  journalRead = 0;
  day = 0;
  tick = 0;
  hour = -1;
  /** People counted for the feuds' families (newborns join their parents' side). */
  knownPeople = 0;

  constructor(
    public params: ConflictParams,
    readonly humans: IndividualsSystem,
    readonly groups: GroupsSystem,
    readonly ideas: IdeasSystem,
    readonly rng: Rng,
    readonly journal: Journal,
  ) {
    this.journalRead = journal.size;
    this.knownPeople = humans.people.count;
    this.ensureCapacity();
    humans.attachConflict(this);
  }

  refreshParams(params: ConflictParams): void {
    this.params = params;
  }

  ensureCapacity(): void {
    const capacity = this.humans.people.capacity;
    if (this.mission.length >= capacity) return;
    this.mission = grownTo(this.mission, capacity, -1);
    this.envoyOf = grownTo(this.envoyOf, capacity, -1);
    this.morale = grownTo(this.morale, capacity, 0);
  }

  // ----- relations between tribes ------------------------------------------------------------

  relation(a: number, b: number): TribeRelation {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    let relation = this.relations.get(key);
    if (!relation) {
      relation = new TribeRelation(Math.min(a, b), Math.max(a, b));
      this.relations.set(key, relation);
    }
    return relation;
  }

  /** The relation if it exists (read only). */
  findRelation(a: number, b: number): TribeRelation | undefined {
    return this.relations.get(a < b ? `${a}:${b}` : `${b}:${a}`);
  }

  /** Side of a tribe in a relation (0 or 1). */
  side(relation: TribeRelation, tribe: number): number {
    return relation.a === tribe ? 0 : 1;
  }

  atWar(a: number, b: number): boolean {
    return this.findRelation(a, b)?.state === 'war';
  }

  // ----- ConflictView (read by the individuals) ----------------------------------------------

  warCall(person: number): number {
    if (person >= this.mission.length || this.mission[person]! < 0) return 0;
    const expedition = this.expeditions[this.mission[person]!];
    if (!expedition || expedition.state === ExpeditionState.Done) return 0;
    // The call of the war party holds as long as one stays in it (morale decides whether one deserts).
    return expedition.state === ExpeditionState.Returning ? 0.9 : 1;
  }

  envoyCall(person: number): number {
    if (person >= this.envoyOf.length || this.envoyOf[person]! < 0) return 0;
    const envoy = this.envoys[this.envoyOf[person]!];
    return envoy && envoy.stage < 2 ? 1 : 0;
  }

  missionTarget(person: number): number {
    if (person >= this.mission.length) return -1;
    const index = this.envoyOf[person]!;
    if (index >= 0) {
      const envoy = this.envoys[index];
      if (!envoy || envoy.stage >= 2) return -1;
      return this.campCenter(envoy.stage === 0 ? envoy.to : envoy.from);
    }
    const id = this.mission[person]!;
    if (id < 0) return -1;
    const expedition = this.expeditions[id];
    if (!expedition) return -1;
    switch (expedition.state) {
      case ExpeditionState.Gathering:
        return this.campCenter(expedition.tribe);
      case ExpeditionState.Marching:
        return this.campCenter(expedition.target);
      case ExpeditionState.Returning:
        return this.campCenter(this.groups.tribeOf(person)?.id ?? expedition.tribe);
      default:
        return -1;
    }
  }

  /** Center tile of a tribe's camp (-1 if it has none). */
  campCenter(tribe: number): number {
    const group = this.groups.groups[tribe];
    if (!group || !group.alive || group.camp < 0) return -1;
    return this.humans.camps[group.camp]?.center ?? -1;
  }

  // ----- daily and hourly life ---------------------------------------------------------------

  /** Every step of the humans: quarrels that turn to blows; every hour, the war parties and emissaries walk. */
  runStep(hour: number, tick: number): void {
    this.tick = tick;
    this.ensureCapacity();
    brawls(this);
    const whole = Math.floor(hour);
    if (whole === this.hour) return;
    this.hour = whole;
    expeditionsHour(this);
    envoysHour(this);
  }

  /** Once a day (after the groups): killings read in the journal, feuds, decisions of war, diplomacy, threats. */
  dailyUpdate(day: number, tick: number): void {
    this.day = day;
    this.tick = tick;
    this.ensureCapacity();
    const events = this.journal.since(this.journalRead);
    this.journalRead = this.journal.size;
    readKillings(this, events);
    civilWars(this, events);
    feudDay(this);
    warDecisions(this);
    diplomacyDay(this);
    this.updateThreats();
  }

  /** A camp that knows a threat (a war, a recent raid, a feud of its people) wants walls; war favours chiefs. */
  private updateThreats(): void {
    const threatDays = this.params.diplomacy.threatDays;
    for (const tribe of this.groups.tribes()) {
      let threat = 0;
      for (const relation of this.relations.values()) {
        if (relation.a !== tribe.id && relation.b !== tribe.id) continue;
        if (relation.state === 'war') threat = 1;
        const other = relation.a === tribe.id ? 1 : 0;
        if (this.day - relation.lastExpedition[other]! <= threatDays) threat = Math.max(threat, 0.8);
      }
      if (threat < 0.5) {
        for (const feud of this.feuds) {
          if (feud.ended || this.day - feud.lastBlood > threatDays) continue;
          if (tribe.members.some((p) => feud.sides[0].has(p)) && tribe.members.some((p) => feud.sides[1].has(p))) continue;
          if (tribe.members.some((p) => feud.sides[0].has(p) || feud.sides[1].has(p))) threat = Math.max(threat, 0.5);
        }
      }
      if (tribe.camp >= 0) this.humans.production.setThreat(tribe.camp, threat);
      this.groups.setWar(tribe, threat >= 1 ? 1 : threat * 0.5);
    }
  }

  // ----- bookkeeping -------------------------------------------------------------------------

  noteKill(killer: number, victim: number): void {
    const list = this.kills.get(killer) ?? [];
    list.push(victim);
    this.kills.set(killer, list);
    this.killKinds.set(victim, this.currentFight);
  }

  noteBattle(x: number, y: number, attackers: number, defenders: number): void {
    this.battles.push({ x, y, tick: this.tick, attackers, defenders });
    if (this.battles.length > KEPT_BATTLES) this.battles.shift();
  }

  /** Name of a group, or "?" */
  nameOf(group: number): string {
    return this.groups.groups[group]?.name ?? '?';
  }

  tribe(id: number): Group | null {
    const group = this.groups.groups[id];
    return group && group.alive && group.level === 0 ? group : null;
  }

  isFighter(person: number): boolean {
    const [young, old] = this.params.raid.fighterAge;
    const age = this.humans.people.ageYears[person]!;
    return this.humans.people.alive[person] === 1 && age >= young && age <= old && !this.humans.life.state.pregnant(person) && this.humans.people.health[person]! > 40;
  }

  /** Ends a person's mission (deserted, back home, dead). */
  release(person: number): void {
    if (person < this.mission.length) this.mission[person] = -1;
  }
}
