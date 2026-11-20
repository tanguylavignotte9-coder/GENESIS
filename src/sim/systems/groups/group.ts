import type { DecisionRecord } from './decisions';

/**
 * A group: people who live or act together. One concept for every level (pillar 5): level 0 the
 * tribe, level 1 the clans inside it, level 2 the families (households). Every group carries the
 * same parts: a regime and its leaders, their legitimacy, the discontent of the members, rules of
 * property and inheritance, a strategy, and the slots for its culture, religion and currency.
 */
export class Group {
  /** Living members (rebuilt every day). */
  members: number[] = [];
  /** Regime (index in data/groups.json → regimes). */
  regime: number;
  leaders: number[] = [];
  /** Everyone who led the group (lineage). */
  readonly formerLeaders: number[] = [];
  /** What the members think of the power in place, and how unhappy they are (0..100). */
  legitimacy = 50;
  discontent = 0;
  /** Rules (indexes in data/groups.json → property, inheritance, strategies). */
  property = 0;
  inheritance = 0;
  strategy = 0;
  /** Ideas the group adopted (step 10): culture, language, religion, currency (idea ids, -1 = none). */
  culture = -1;
  language = -1;
  religion = -1;
  currency = -1;
  /** Tribes only: their camp (index of the camp of the individuals and production systems). */
  camp = -1;
  /** Day the group ended (-1 while it exists), and why (journal event). */
  endedDay = -1;
  endEvent = -1;
  /** Journal events that explain the current leaders and regime (causes of what follows). */
  leaderEvent = -1;
  regimeEvent = -1;
  /** Day of the last designation of leaders (bands and councils are reviewed). */
  leadersSince = 0;
  /** Recent deaths of members by hunger, cold or disease: day, cause, journal event (one year kept). */
  readonly sufferings: { day: number; cause: number; event: number }[] = [];
  /** Tribes only: what this tribe knows of the others, by group id. */
  readonly known = new Map<number, { opinion: number; since: number; allied: boolean }>();
  /** Day the tribe settled its camp where it is (founding or last move). */
  settledDay = 0;
  /** The latest collective decisions of the leaders, with the options weighed (visual governance). */
  readonly decisions: DecisionRecord[] = [];

  constructor(
    readonly id: number,
    readonly level: number,
    /** Group of the level above (-1 for a tribe). */
    public parent: number,
    public name: string,
    public founder: number,
    readonly foundedDay: number,
    readonly foundedEvent: number,
    regime: number,
  ) {
    this.regime = regime;
  }

  get alive(): boolean {
    return this.endedDay < 0;
  }
}
