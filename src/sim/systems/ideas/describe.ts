import type { IdeasSystem } from './ideas-system';
import { LANGUAGE_SLOTS } from './holdings';
import { Family, type Idea } from './idea';
import { doubt, religionLabel } from './religion';

/** An idea as the Ideas panel shows it: who carries it, which tribes, where it comes from. */
export interface IdeaFacts {
  id: number;
  family: number;
  /** "le tamuk", "la culture Soran", "le culte d’Aruk", "Poterie", "Coquillages". */
  label: string;
  alive: boolean;
  holders: number;
  tribes: string[];
  /** Who found or founded it (person, -1 for what peoples always knew), when (absolute day), why. */
  founder: number;
  founderName: string;
  day: number;
  /** Year it was born (1 = first year), year it was lost (0 while carried). */
  year: number;
  endYear: number;
  origin: string;
  /** Idea it comes from (mother language, culture or religion before a split), as a label. */
  parent: string;
  /** Details of the family: values of a culture, beliefs and rite of a religion, sounds of a language… */
  details: string[];
  /** Religions: their shamans or priests (person, name). */
  clergy: { person: number; name: string }[];
}

export interface IdeasFacts {
  ideas: IdeaFacts[];
  /** Places peoples named: name, what it is, language. */
  places: { name: string; kind: string; language: string }[];
}

/** The ideas a person carries (character sheet). */
export interface PersonIdeasFacts {
  knowledge: { name: string; origin: string }[];
  learning: { name: string; progress: number }[];
  culture: string;
  values: { name: string; value: number; meaning: string }[];
  languages: { name: string; fluency: number }[];
  religion: string;
  piety: number;
  /** Why someone is without religion, or how much one doubts ("a perdu la foi", "doute du sacré"). */
  faithNote: string;
  token: string;
  tokenTrust: number;
}

const PERCENT = 100;
const PLACE_KINDS: Record<string, string> = { r: 'région', m: 'montagnes', v: 'rivière', i: 'île' };

/** How the panel names an idea. */
export function ideaLabel(sys: IdeasSystem, idea: Idea): string {
  switch (idea.family) {
    case Family.Language:
      return `le ${idea.name}`;
    case Family.Culture:
      return `la culture ${idea.name}`;
    case Family.Religion:
      return religionLabel(idea);
    case Family.Knowledge:
      return idea.name;
    default:
      return idea.name;
  }
}

function yearOf(sys: IdeasSystem, day: number): number {
  return Math.floor(day / sys.yearDays) + 1;
}

function originOf(sys: IdeasSystem, idea: Idea): string {
  const names = sys.humans.people.names;
  const year = yearOf(sys, idea.day);
  const tribe = idea.tribe >= 0 ? sys.groups?.groups[idea.tribe]?.name : undefined;
  if (idea.family === Family.Knowledge) {
    if (idea.founder < 0) return 'connu de tout temps';
    return `découvert par ${names[idea.founder] ?? '?'} en l’an ${year}${idea.reason ? ` (${idea.reason.replace(/^, /, '')})` : ''}`;
  }
  if (idea.family === Family.Religion && idea.founder >= 0) return `fondée par ${names[idea.founder] ?? '?'} en l’an ${year}, ${idea.reason}`;
  if (idea.family === Family.Currency) return `adopté en l’an ${year}${tribe ? ` par ${tribe}` : ''}`;
  if (idea.parent < 0) return 'celle des premiers peuples';
  return `née en l’an ${year}${tribe ? ` chez ${tribe}` : ''}, qui vivait à part`;
}

function detailsOf(sys: IdeasSystem, idea: Idea): string[] {
  const params = sys.params;
  switch (idea.family) {
    case Family.Culture:
      return params.values.map((value, v) => {
        const level = idea.mean[v] ?? 0.5;
        return `${value.name} : ${Math.round(level * PERCENT)} (${level >= 0.5 ? value.high : value.low})`;
      });
    case Family.Religion: {
      const main = idea.mean.length > 0 ? idea.mean.indexOf(Math.max(...idea.mean)) : 0;
      const belief = params.religion.beliefs[main];
      return belief ? [`Vénère ${belief.name}`, `Rite : ${belief.rite}`] : [];
    }
    case Family.Language: {
      const phonology = idea.phonology;
      if (!phonology) return [];
      const sounds = `Sons : ${phonology.consonants.join(' ')} · ${phonology.vowels.join(' ')}`;
      const speakers = sys.humans.people.names.filter((_, p) => sys.humans.people.alive[p] === 1 && p < sys.holdings.count && sys.holdings.motherTongue(p) === idea.id).slice(0, 4);
      return [sounds, `Génération : ${idea.generation}`, ...(speakers.length > 0 ? [`Noms : ${speakers.join(', ')}`] : [])];
    }
    default:
      return [];
  }
}

export function describeIdeas(sys: IdeasSystem): IdeasFacts {
  const groups = sys.groups;
  const names = sys.humans.people.names;
  const ideas = sys.ideas
    .filter((idea) => idea.alive ? idea.holders > 0 || idea.family === Family.Currency : idea.family !== Family.Knowledge || idea.founder >= 0)
    .map((idea) => ({
      id: idea.id,
      family: idea.family,
      label: ideaLabel(sys, idea),
      alive: idea.alive && (idea.holders > 0 || idea.family === Family.Currency),
      holders: idea.holders,
      tribes: idea.tribes.map((id) => groups?.groups[id]?.name ?? '?'),
      founder: idea.founder,
      founderName: idea.founder >= 0 ? (names[idea.founder] ?? '?') : '',
      day: idea.day,
      year: yearOf(sys, idea.day),
      endYear: idea.endedDay >= 0 ? yearOf(sys, idea.endedDay) : 0,
      origin: originOf(sys, idea),
      parent: idea.parent >= 0 ? ideaLabel(sys, sys.ideas[idea.parent]!) : '',
      details: detailsOf(sys, idea),
      clergy: [...idea.clergy.values()].filter((p) => sys.humans.people.alive[p] === 1).map((person) => ({ person, name: names[person] ?? '?' })),
    }));
  const places = [...sys.toponyms.names.entries()].map(([key, place]) => ({
    name: place.name,
    kind: PLACE_KINDS[key.charAt(0)] ?? 'lieu',
    language: sys.ideas[place.language] ? `le ${sys.ideas[place.language]!.name}` : '',
  }));
  return { ideas, places };
}

export function describePersonIdeas(sys: IdeasSystem, person: number): PersonIdeasFacts | null {
  const h = sys.holdings;
  if (person < 0 || person >= h.count || h.ready[person] === 0) return null;
  const names = sys.humans.people.names;
  const catalog = sys.catalog.knowledge;
  const knowledge: PersonIdeasFacts['knowledge'] = [];
  const learning: PersonIdeasFacts['learning'] = [];
  catalog.forEach((item, k) => {
    const at = person * h.knowledgeCount + k;
    if (h.knows(person, k)) {
      const teacher = h.teacher[at]!;
      const source = sys.ideas[h.source[at]!];
      const origin = teacher >= 0 ? `appris de ${names[teacher] ?? '?'}` : source && source.founder === person ? 'découvert par lui-même' : 'connu de tout temps';
      knowledge.push({ name: item.name, origin: source && source.founder === person && sys.humans.people.female[person] === 1 ? 'découvert par elle-même' : origin });
    } else if (h.learning[at]! > 0) learning.push({ name: item.name, progress: Math.round(h.learning[at]! * PERCENT) });
  });
  const culture = sys.ideas[h.culture[person]!];
  const religion = sys.ideas[h.religion[person]!];
  const languages: PersonIdeasFacts['languages'] = [];
  for (let s = person * LANGUAGE_SLOTS; s < (person + 1) * LANGUAGE_SLOTS; s++) {
    const language = sys.ideas[h.language[s]!];
    if (language && h.fluency[s]! > 0.01) languages.push({ name: `le ${language.name}`, fluency: Math.round(h.fluency[s]! * PERCENT) });
  }
  const token = h.token[person]!;
  return {
    knowledge,
    learning,
    culture: culture ? ideaLabel(sys, culture) : '',
    values: sys.params.values.map((value, v) => {
      const level = h.values[person * h.valueCount + v]!;
      return { name: value.name, value: Math.round(level * PERCENT), meaning: level >= 0.5 ? value.high : value.low };
    }),
    languages,
    religion: religion ? ideaLabel(sys, religion) : '',
    piety: Math.round(h.piety[person]! * PERCENT),
    faithNote: faithNote(sys, person),
    token: token >= 0 ? sys.humans.production.catalog.items[token]!.name : '',
    tokenTrust: Math.round(h.tokenTrust[person]! * PERCENT),
  };
}

/** What the sheet says of someone's faith beside the religion: a lost faith, a doubting mind. */
function faithNote(sys: IdeasSystem, person: number): string {
  const h = sys.holdings;
  const doubting = doubt(sys, person);
  const female = sys.humans.people.female[person] === 1;
  const notes: string[] = [];
  if (h.religion[person]! < 0) notes.push(h.lostFaith[person] === 1 ? 'a perdu la foi' : `n’a jamais été gagné${female ? 'e' : ''} par une foi`);
  if (doubting >= 0.5) notes.push('doute profondément du sacré');
  else if (doubting >= 0.2) notes.push('doute un peu du sacré');
  return notes.join(', ');
}
