import type { Phonology } from './phonology';

/** The families of ideas (design: « Le système d'idées »). One mechanism carries them all. */
export const Family = { Knowledge: 0, Culture: 1, Language: 2, Religion: 3, Currency: 4 } as const;
export type FamilyId = (typeof Family)[keyof typeof Family];

/**
 * An idea: a piece of knowledge discovered by someone, a culture, a language, a religion, a good
 * of exchange. It is carried by people (see PersonIdeas), born of someone or of a population that
 * drifted apart, and lost when nobody carries it any more. Its origin is kept for the journal and
 * the ideas panel: who, when, where (tribe), why (journal event).
 */
export class Idea {
  /** Day it was lost (-1 while carried), and the event that tells it. */
  endedDay = -1;
  endEvent = -1;
  /** Living people who carry it (recounted every few days). */
  holders = 0;
  /** Tribes (group ids) where it is carried, recounted with the holders. */
  tribes: number[] = [];
  /** Knowledge: index in data/knowledge.json. */
  knowledge = -1;
  /** Culture (values), religion (beliefs), language (way of speaking): the mean of its carriers when last counted. */
  mean: number[] = [];
  /** Languages: sounds, generation since the first language, and the plural ending of peoples' names. */
  phonology: Phonology | null = null;
  generation = 0;
  /** Cultures and religions: language their name was made in. */
  language = -1;
  /** Religions: has a shaman or priest in these tribes (group id → person). */
  readonly clergy = new Map<number, number>();
  /** Goods of exchange: item index. */
  item = -1;
  /** Why it appeared, for the panel ("après la mort de Mi"). */
  reason = '';

  constructor(
    readonly id: number,
    readonly family: FamilyId,
    public name: string,
    /** The idea it comes from (mother language, culture before a split, religion before a schism), -1 if none. */
    readonly parent: number,
    /** Who found or founded it (-1 for what peoples always knew or what a population became). */
    readonly founder: number,
    readonly day: number,
    /** Journal event of its birth (-1 for the ideas of the starting tribes). */
    public event: number,
    /** Tribe (group id) where it was born (-1 at the start of the world). */
    readonly tribe: number,
  ) {}

  get alive(): boolean {
    return this.endedDay < 0;
  }
}
