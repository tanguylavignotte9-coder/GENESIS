import type { Rng } from '../../core/rng';
import type { IdeasParams } from './params';

/**
 * The sounds of a language and the words it makes: its consonants and vowels, how its syllables are
 * built, how its women's names end. A daughter language inherits them through a few sound changes,
 * so related languages sound alike ("Tamuk" → "Tamug"). Only the arithmetic of the seeded generator.
 */
export interface Phonology {
  consonants: string[];
  vowels: string[];
  /** Chance that a syllable closes with a consonant (CVC), and that a word starts with a vowel. */
  closed: number;
  initialVowel: number;
  /** Ending of women's names ("" = none), and of a people's name ("les Tamuk-i"). */
  femaleEnding: string;
  plural: string;
  /** Sound changes since the first ancestor language: replaced sound → new sound. */
  shifts: [string, string][];
}

type LanguageParams = IdeasParams['language'];
/** Shortest name (letters): shorter ones get one more syllable. */
const MIN_NAME = 3;

function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[rng.nextIntInclusive(0, list.length - 1)]!;
}

/** `count` distinct entries of `list`, in the order they were drawn. */
function sample(rng: Rng, list: readonly string[], count: number): string[] {
  const pool = [...list];
  const chosen: string[] = [];
  while (chosen.length < count && pool.length > 0) chosen.push(pool.splice(rng.nextIntInclusive(0, pool.length - 1), 1)[0]!);
  return chosen;
}

/** A first language: its own sounds, drawn from the human palette of data/ideas.json. */
export function newPhonology(params: LanguageParams, rng: Rng): Phonology {
  const consonants = sample(rng, params.consonants, rng.nextIntInclusive(params.consonantCount[0], params.consonantCount[1]));
  const vowels = sample(rng, params.vowels, rng.nextIntInclusive(params.vowelCount[0], params.vowelCount[1]));
  return {
    consonants,
    vowels,
    closed: rng.nextFloat() * 0.35,
    initialVowel: rng.nextFloat() * 0.3,
    femaleEnding: rng.nextFloat() < 0.6 ? pick(rng, params.femaleEndings) : '',
    plural: pick(rng, params.pluralEndings),
    shifts: [],
  };
}

/** A daughter language: the same sounds after a few changes (one sound replaced, a vowel shifted, endings worn…). */
export function daughterPhonology(mother: Phonology, params: LanguageParams, rng: Rng): Phonology {
  const child: Phonology = { ...mother, consonants: [...mother.consonants], vowels: [...mother.vowels], shifts: [...mother.shifts] };
  for (let k = 0; k < params.soundChangesPerSplit; k++) {
    const roll = rng.nextFloat();
    if (roll < 0.45) {
      const at = rng.nextIntInclusive(0, child.consonants.length - 1);
      const free = params.consonants.filter((sound) => !child.consonants.includes(sound));
      if (free.length === 0) continue;
      const next = pick(rng, free);
      child.shifts.push([child.consonants[at]!, next]);
      child.consonants[at] = next;
    } else if (roll < 0.8) {
      const at = rng.nextIntInclusive(0, child.vowels.length - 1);
      const free = params.vowels.filter((sound) => !child.vowels.includes(sound));
      if (free.length === 0) continue;
      const next = pick(rng, free);
      child.shifts.push([child.vowels[at]!, next]);
      child.vowels[at] = next;
    } else if (roll < 0.9) {
      child.closed = Math.max(0, Math.min(0.7, child.closed + (rng.nextFloat() - 0.5) * 0.3));
    } else if (roll < 0.95) {
      child.plural = pick(rng, params.pluralEndings);
    } else {
      child.femaleEnding = rng.nextFloat() < 0.5 ? '' : pick(rng, params.femaleEndings);
    }
  }
  return child;
}

/** One syllable of the language. */
function syllable(phonology: Phonology, rng: Rng, first: boolean): string {
  const onset = first && rng.nextFloat() < phonology.initialVowel ? '' : pick(rng, phonology.consonants);
  const coda = rng.nextFloat() < phonology.closed ? pick(rng, phonology.consonants) : '';
  return onset + pick(rng, phonology.vowels) + coda;
}

/** A word of `count` syllables, written with a capital. */
export function word(phonology: Phonology, rng: Rng, count: number): string {
  let text = '';
  for (let k = 0; k < count; k++) text += syllable(phonology, rng, k === 0);
  return capitalize(text);
}

/** A person's name in the language (women's names take the language's feminine ending). */
export function personName(phonology: Phonology, rng: Rng, female: boolean, syllables: [number, number]): string {
  let name = word(phonology, rng, rng.nextIntInclusive(syllables[0], syllables[1]));
  // A name of one or two letters is too thin: one more syllable.
  if (name.length < MIN_NAME) name += syllable(phonology, rng, false);
  if (female && phonology.femaleEnding !== '' && !name.endsWith(phonology.femaleEnding)) {
    name = /[aeiouéy]$/.test(name) ? name.slice(0, -1) + phonology.femaleEnding : name + phonology.femaleEnding;
  }
  return name;
}

/** A word of the mother language as the daughter now says it (its sound changes applied in order). */
export function shifted(text: string, phonology: Phonology, since: number): string {
  let out = text.toLowerCase();
  for (const [from, to] of phonology.shifts.slice(since)) out = out.split(from).join(to);
  return capitalize(out);
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A people's name: a word of the language with its plural ending ("Tamuki"). */
export function peopleName(phonology: Phonology, rng: Rng): string {
  let root = word(phonology, rng, 2);
  if (root.length < MIN_NAME) root += syllable(phonology, rng, false);
  return /[aeiouéy]$/.test(root) && /^[aeiouéy]/.test(phonology.plural) ? root + phonology.plural.slice(1) : root + phonology.plural;
}
