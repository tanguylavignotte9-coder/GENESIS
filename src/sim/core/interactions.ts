/**
 * Common mechanism for one living being acting physically on another (an attack today; hunting,
 * herding and fighting later). Systems never write into each other's data: each system registers
 * the beings it owns, publishes a read-only view of where they are (the "state of the world" other
 * systems perceive), and applies to ITS OWN beings the effects of an interaction.
 *
 * An attack is resolved in two halves: the target's owner applies the blow (injury, death, journal),
 * then the attacker's owner applies the outcome to the attacker (a predator eats its kill).
 */
import type { Journal } from './journal';

export type BodyKind = 'animal' | 'human';

/** A living being, whatever system owns it. */
export interface BodyRef {
  kind: BodyKind;
  /** Index of the being in its owner's storage. */
  id: number;
}

/** Read-only view of the beings of one kind, for the others to perceive them. */
export interface BodyView {
  /** Calls `visit` for every living being in the cells around (x, y) (filter by distance yourself). */
  forEachNear(x: number, y: number, radius: number, visit: (id: number) => void): void;
  /** Calls `visit` for every living being, in index order. */
  forEachAlive(visit: (id: number) => void): void;
  x(id: number): number;
  y(id: number): number;
  alive(id: number): boolean;
  /** True while the being is out hunting (game is warier of a hunter than of a passer-by). */
  hunting(id: number): boolean;
}

export interface Attack {
  attacker: BodyRef;
  target: BodyRef;
  /** Health points the blow removes (the target's owner decides what it means). */
  damage: number;
  /** French name of the attacker, for the journal ("loup"). */
  attackerName: string;
  tick: number;
}

export interface AttackOutcome {
  killed: boolean;
  /** Meat the dead body leaves on the ground (0 if the target survived). */
  remains: number;
  /** Tile of the target when it was hit. */
  x: number;
  y: number;
  /** Journal event that told what happened (-1 if none). */
  eventId: number;
}

/** What a system offers for the beings it owns. */
export interface InteractionParty {
  /** Applies a blow to one of the party's beings. */
  sufferAttack?(id: number, attack: Attack, journal: Journal): AttackOutcome;
  /** Applies the outcome of an attack to the attacker (e.g. it eats). */
  attackDone?(id: number, attack: Attack, outcome: AttackOutcome, journal: Journal): void;
}

export class Interactions {
  private readonly views = new Map<BodyKind, BodyView>();
  private readonly parties = new Map<BodyKind, InteractionParty>();

  constructor(private readonly journal: Journal) {}

  /** A system declares the beings it owns: how to see them, and how they react. */
  register(kind: BodyKind, view: BodyView, party: InteractionParty): void {
    this.views.set(kind, view);
    this.parties.set(kind, party);
  }

  /** The beings of a kind, as the world shows them (null if nobody of that kind exists). */
  view(kind: BodyKind): BodyView | null {
    return this.views.get(kind) ?? null;
  }

  /** Resolves an attack: the target's owner applies the blow, then the attacker's owner the outcome. */
  attack(attack: Attack): AttackOutcome {
    const target = this.parties.get(attack.target.kind);
    if (!target?.sufferAttack) throw new Error(`Interactions : les êtres de type « ${attack.target.kind} » ne peuvent pas être attaqués.`);
    const outcome = target.sufferAttack(attack.target.id, attack, this.journal);
    this.parties.get(attack.attacker.kind)?.attackDone?.(attack.attacker.id, attack, outcome, this.journal);
    return outcome;
  }
}
