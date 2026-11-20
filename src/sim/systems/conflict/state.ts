/**
 * What the conflict system remembers: the state of the relations between tribes (peace, war,
 * truce, tribute) with the memory of betrayals and the weariness of war; the war parties under way;
 * the feuds between families; the emissaries on the road; the recent battles (for the map).
 */

export type RelationState = 'peace' | 'war' | 'truce';

/** Two tribes (a < b, group ids). Sides of the arrays: 0 = a, 1 = b. */
export class TribeRelation {
  state: RelationState = 'peace';
  since = 0;
  /** Truce: last day. */
  until = -1;
  /** Event that started the current state (declaration, peace…). */
  event = -1;
  /** Weariness of the current war (deaths and captives, for the size of each tribe). */
  readonly weariness: [number, number] = [0, 0];
  /** How many times each side betrayed the other (a peace, a truce or an alliance broken). */
  readonly betrayals: [number, number] = [0, 0];
  /** Tribute: who pays (0 or 1, -1 none), until which day, next payment. */
  tributePayer = -1;
  tributeUntil = -1;
  tributeNext = -1;
  /** Last day each side sent a war party against the other. */
  readonly lastExpedition: [number, number] = [-1000, -1000];
  /** Wars fought, peaces made. */
  wars = 0;

  constructor(
    readonly a: number,
    readonly b: number,
  ) {}
}

export const ExpeditionState = { Gathering: 0, Marching: 1, Returning: 2, Done: 3 } as const;

/** A war party: a raid or an expedition of a war. */
export class Expedition {
  state: number = ExpeditionState.Gathering;
  readonly members: number[] = [];
  /** Who left the party on the way (deserted). */
  readonly deserters: number[] = [];
  /** Hours since it was formed. */
  hours = 0;
  /** An agreement concluded at home while the party was away (it does not know): "trêve", "paix". */
  unaware = '';
  fought = false;

  constructor(
    readonly id: number,
    readonly kind: 'raid' | 'war',
    readonly tribe: number,
    readonly target: number,
    readonly leader: number,
    readonly day: number,
    /** Journal event that launched it (the decision). */
    readonly event: number,
  ) {}
}

/** A feud between two families: the kin of a victim and those of the killer, and their descendants. */
export class Feud {
  readonly sides: [Set<number>, Set<number>] = [new Set(), new Set()];
  /** Names that the journal gives the two families (the first victim's and the first killer's). */
  readonly names: [string, string];
  lastBlood: number;
  readonly events: number[] = [];
  ended = false;

  constructor(
    readonly id: number,
    readonly day: number,
    victim: string,
    killer: string,
  ) {
    this.names = [victim, killer];
    this.lastBlood = day;
  }
}

/** An emissary on the road: what they bring (an offer of peace, truce or tribute) and where they are. */
export class Envoy {
  /** 0 going, 1 coming back, 2 over. */
  stage = 0;

  constructor(
    readonly person: number,
    readonly from: number,
    readonly to: number,
    readonly offer: 'peace' | 'truce' | 'tribute',
    readonly day: number,
    readonly reason: string,
    readonly event: number,
  ) {}
}

/** A battle, for the map (where, when, who). */
export interface BattleMark {
  x: number;
  y: number;
  tick: number;
  attackers: number;
  defenders: number;
}
