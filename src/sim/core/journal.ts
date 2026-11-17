/**
 * Causal event journal (pillar 3). Every notable event records when, where, who and WHY:
 * the ids of the events that caused it, so the HUD can explain the chain of causes.
 */

/** Reference to an actor (individual, group…). No actor kinds exist yet: the world itself acts. */
export interface ActorRef {
  kind: string;
  id: number;
}

export interface EventPlace {
  /** Tile coordinates of the event's center. */
  x: number;
  y: number;
  /** Human-readable place, in French ("le sud du grand continent"). */
  label: string;
}

export interface JournalEvent {
  id: number;
  /** Simulation tick at which the event happened. */
  tick: number;
  /** Machine-readable type, e.g. "climate.anomaly.start". */
  type: string;
  /** Sentence shown to the player, in French. */
  text: string;
  place: EventPlace | null;
  actors: ActorRef[];
  /** Ids of the events that caused this one (empty for natural, uncaused events). */
  causes: number[];
  /** Extra machine-readable facts (e.g. { anomaly: "drought" }). */
  details: Record<string, string | number>;
}

export type NewEvent = Omit<JournalEvent, 'id'>;

export class Journal {
  private readonly list: JournalEvent[] = [];

  /** Records an event and returns its id. Causes must be ids of events already in the journal. */
  publish(event: NewEvent): number {
    for (const cause of event.causes) {
      if (!this.get(cause)) throw new Error(`Journal : cause inconnue (${cause}) pour « ${event.type} ».`);
    }
    const id = this.list.length;
    this.list.push({ ...event, id });
    return id;
  }

  get(id: number): JournalEvent | undefined {
    return this.list[id];
  }

  get size(): number {
    return this.list.length;
  }

  /** Events with id >= `fromId`, oldest first. */
  since(fromId: number): JournalEvent[] {
    return this.list.slice(fromId);
  }

  all(): readonly JournalEvent[] {
    return this.list;
  }
}
