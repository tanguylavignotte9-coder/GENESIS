/**
 * What the individuals (and production, through them) read of the ideas system (step 10): the
 * knowledge a person carries, how their culture weighs on what they want to do, and the names their
 * language gives. Implemented by IdeasSystem; the individuals never write into it.
 */
export interface IdeaView {
  /** Bit field of the knowledge the person carries (bit k = knowledge k of data/knowledge.json). */
  knowledge(person: number): number;
  /** Factor on the score of action `action` (index in data/humans.json → actions) for this person's culture. */
  actionFactor(person: number, action: number): number;
  /** Name of a person of a starting tribe (camp index), in that tribe's language. */
  startingName(camp: number, female: boolean): string;
  /** Name of a newborn, in its mother's language. */
  childName(mother: number, female: boolean): string;
  /** What the person is trying to discover, or null (shown in her sheet and her brain). */
  pondering(person: number): PonderingFacts | null;
}

/** A discovery in progress: the knowledge, how far (0..1), for how many days, and each condition (value 0..1, -1 = a fact). */
export interface PonderingFacts {
  knowledge: string;
  progress: number;
  days: number;
  conditions: { label: string; ok: boolean; value: number }[];
}
