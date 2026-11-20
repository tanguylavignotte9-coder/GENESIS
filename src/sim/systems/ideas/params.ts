import { DataFileError, int, num, text, validateData, type Schema } from '../../core/data-validation';

/**
 * Parameters of the ideas system (data/ideas.json): how knowledge is discovered, taught and lost;
 * how cultures, languages and religions are carried, drift apart and split; how barter goes and how
 * a good of exchange appears. Every variable is documented for the variables workshop.
 */

/** Cultural values carried by every person (their meaning and effects are in data/ideas.json → values). */
export interface ValueDef {
  id: string;
  name: string;
  /** What a low and a high value mean (sheet, ideas panel). */
  low: string;
  high: string;
  /** Action id (data/humans.json) → strength: the action's score × (1 + strength × (2 × value − 1)). */
  actions: Record<string, number>;
}

export interface DriftParams {
  /** Random drift of each person's idea per year (innovation, oddities). */
  noisePerYear: number;
  /** Share of the gap closed with the other at each conversation. */
  conformityPerTalk: number;
  /** Variation of a child from the mean of its parents. */
  childNoise: number;
  /** Mean distance between two populations of the same idea beyond which a new one is recognized. */
  splitDistance: number;
  /** Members a population needs to found a new culture, language or religion. */
  minMembers: number;
}

export interface IdeasParams {
  everyDays: number;
  knowledge: {
    discoveryPerDay: number;
    minDiscoverAge: number;
    aptitudeTraits: Record<string, number>;
    skillWeight: number;
    environmentTiles: number;
    environmentEveryDays: number;
    minLearnAge: number;
    teachPerDay: number;
    observePerDay: number;
    contactPerDay: number;
    childLearning: number;
    winterCelsius: number;
    famineMembers: number;
    prestigeMembers: number;
  };
  values: ValueDef[];
  culture: DriftParams & { experiencePerYear: number; startSpread: number; personSpread: number };
  language: DriftParams & {
    dims: number;
    consonants: string[];
    vowels: string[];
    femaleEndings: string[];
    pluralEndings: string[];
    consonantCount: [number, number];
    vowelCount: [number, number];
    nameSyllables: [number, number];
    soundChangesPerSplit: number;
    contactLearnPerDay: number;
    homeLearnPerDay: number;
    childFluencyYears: number;
    speaksAbove: number;
    kinshipIntelligibility: number;
  };
  religion: DriftParams & {
    beliefs: { id: string; name: string; rite: string }[];
    griefChance: number;
    catastropheChance: number;
    prophetChance: number;
    prophetTraits: number;
    spreadPerTalk: number;
    childPiety: number;
    pietyDecayPerYear: number;
    clergyMembers: number;
    worshipMembers: number;
    faithAffection: number;
  };
  trade: {
    encountersPerDay: number;
    encounterTiles: number;
    tradeChance: number;
    misunderstanding: number;
    tradeFeels: number;
    tokenItems: string[];
    tokenAcceptChance: number;
    tokenGain: number;
    tokenSpreadPerTalk: number;
    tokenDecayPerYear: number;
    currencyShare: number;
    currencyStrength: number;
  };
  texts: Record<(typeof TEXT_KEYS)[number], string>;
  needTexts: Record<(typeof NEEDS)[number], string>;
  environmentTexts: Record<(typeof ENVIRONMENTS)[number], string>;
}

/** What pushes someone to find a piece of knowledge (measured by the ideas system). */
export const NEEDS = ['hunger', 'cold', 'meat', 'tools', 'carry', 'winter', 'crossing', 'famine', 'shelter', 'drought', 'accounting', 'game_scarce', 'sickness', 'prestige', 'comfort'] as const;
export type NeedId = (typeof NEEDS)[number];

/** What the surroundings of the camp must offer for a discovery (measured by the ideas system). */
export const ENVIRONMENTS = ['flint', 'stone', 'clay', 'game', 'domesticable', 'water', 'river', 'big_trees', 'wild_cereals', 'fibers', 'flax', 'hides', 'sinew'] as const;
export type EnvironmentId = (typeof ENVIRONMENTS)[number];

const TEXT_KEYS = [
  'discovery',
  'discoveryAgain',
  'learnedAbroad',
  'lost',
  'lostHere',
  'cultureBorn',
  'languageBorn',
  'religionBorn',
  'religionAdopted',
  'schism',
  'clergy',
  'currency',
  'firstTrade',
  'misunderstanding',
  'interpreter',
] as const;

const share = (label: string, help: string, apply: 'live' | 'newWorld' = 'live'): Schema => num(0, 1, label, help, 'fraction', apply);
const traitWeights = (help: string): Schema => ({ kind: 'record', values: num(-3, 3, 'Effet d’un trait', help, 'poids') });
const strings = (label: string, help: string): Schema => ({ kind: 'array', minLength: 1, items: text(label, help, 'newWorld') });
const range = (item: Schema): Schema => ({ kind: 'array', minLength: 2, maxLength: 2, items: item });
const fixed = (keys: readonly string[], item: () => Schema): Schema => ({ kind: 'object', fields: Object.fromEntries(keys.map((key) => [key, item()])) });

function driftFields(what: string, unit: string): Record<string, Schema> {
  return {
    noisePerYear: num(0, 1, `Dérive ${unit}`, `Changement au hasard ${what} de chacun en un an (innovations, manies, oublis).`, 'par an'),
    conformityPerTalk: share(`Influence des conversations ${unit}`, `Part de l’écart que deux personnes qui parlent ensemble comblent ${what}.`),
    childNoise: num(0, 1, `Écart d’un enfant ${unit}`, `Différence au hasard ${what} d’un enfant par rapport à ses parents.`, 'écart'),
    splitDistance: num(0.01, 2, `Seuil de séparation ${unit}`, `Écart moyen entre deux populations au-delà duquel une nouvelle entité est reconnue (${what}).`, 'écart'),
    minMembers: int(2, 500, `Population minimale ${unit}`, `Nombre de porteurs qu’il faut à une population pour fonder une nouvelle entité (${what}).`, 'personnes'),
  };
}

const VALUE_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    id: text('Identifiant', 'Identifiant de la valeur (ne pas changer).', 'newWorld'),
    name: text('Nom', 'Nom affiché de la valeur culturelle.'),
    low: text('Valeur basse', 'Ce que veut dire une valeur basse (affiché).'),
    high: text('Valeur haute', 'Ce que veut dire une valeur haute (affiché).'),
    actions: { kind: 'record', values: num(-3, 3, 'Effet sur une action', 'Effet de la valeur sur l’envie de faire une action de data/humans.json (score × (1 + effet × (2 × valeur − 1))).', 'poids') },
  },
};

export const IDEAS_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    everyDays: int(1, 40, 'Rythme des cultures', 'Jours entre deux examens des cultures, langues et religions (écarts entre populations, adoption par les groupes).', 'jours'),
    knowledge: {
      kind: 'object',
      fields: {
        discoveryPerDay: num(0, 0.1, 'Chance de découverte', 'Chance par jour qu’un adulte fasse une découverte quand le besoin est pressant, le milieu s’y prête et qu’il est doué (multipliée par la chance propre au savoir).', 'par jour'),
        minDiscoverAge: int(5, 60, 'Âge des découvertes', 'Âge à partir duquel on peut découvrir un savoir.', 'ans'),
        aptitudeTraits: traitWeights('Effet d’un trait sur l’aptitude à découvrir et à apprendre (+ : aide).'),
        skillWeight: num(0, 5, 'Savoir-faire et découverte', 'Poids du savoir-faire dans le domaine du savoir (compétence) sur la chance de le découvrir.', 'poids'),
        environmentTiles: int(2, 100, 'Milieu observé', 'Rayon autour du camp où l’on regarde ce que le milieu offre (silex, argile, gibier…).', 'tuiles'),
        environmentEveryDays: int(1, 400, 'Rythme du milieu', 'Jours entre deux examens de ce qu’offre le milieu autour d’un camp.', 'jours'),
        minLearnAge: int(1, 30, 'Âge d’apprendre', 'Âge à partir duquel on peut apprendre un savoir.', 'ans'),
        teachPerDay: share('Enseignement', 'Progrès par jour d’un élève qui a un maître (parent, tuteur, ou quelqu’un qui lui a parlé ce jour-là) qui sait.'),
        observePerDay: share('Observation', 'Progrès par jour de qui a vu quelqu’un du camp pratiquer le savoir ce jour-là.'),
        contactPerDay: share('Observation d’étrangers', 'Progrès par jour de qui a croisé un étranger qui sait (une autre tribu).'),
        childLearning: num(0.1, 5, 'Apprentissage des enfants', 'Facteur sur la vitesse d’apprendre d’un enfant.', 'facteur'),
        winterCelsius: num(-40, 30, 'Hiver qu’on redoute', 'Température moyenne du mois le plus froid en dessous de laquelle on a besoin de conserver pour l’hiver.', '°C', 'live'),
        famineMembers: int(5, 1000, 'Tribu à l’étroit', 'Taille de tribu à partir de laquelle la nourriture sauvage ne suffit plus (besoin de cultiver).', 'personnes'),
        prestigeMembers: int(5, 1000, 'Tribu puissante', 'Taille de tribu à partir de laquelle on veut impressionner (monuments).', 'personnes'),
      },
    },
    values: { kind: 'array', minLength: 1, items: VALUE_SCHEMA },
    culture: {
      kind: 'object',
      fields: {
        ...driftFields('des valeurs', '(cultures)'),
        experiencePerYear: share('Poids du vécu', 'Part du chemin, en un an, que fait une valeur de chacun vers ce que lui apprend sa vie (famines, chasse, chefs, étrangers…).'),
        startSpread: share('Diversité des cultures de départ', 'Écart des valeurs entre deux tribus de départ.', 'newWorld'),
        personSpread: share('Diversité des personnes', 'Écart des valeurs entre les membres d’une tribu de départ.', 'newWorld'),
      },
    },
    language: {
      kind: 'object',
      fields: {
        ...driftFields('de la façon de parler', '(langues)'),
        dims: int(1, 8, 'Traits de prononciation', 'Nombre de traits de prononciation suivis pour mesurer l’écart entre parlers.', 'traits', 'newWorld'),
        consonants: strings('Consonne', 'Consonnes (ou groupes) dans lesquelles les langues puisent leurs sons.'),
        vowels: strings('Voyelle', 'Voyelles dans lesquelles les langues puisent leurs sons.'),
        femaleEndings: strings('Finale féminine', 'Finales que certaines langues donnent aux noms de femmes.'),
        pluralEndings: strings('Finale d’un peuple', 'Finales que les langues donnent au nom d’un peuple (« les Tamuki »).'),
        consonantCount: range(int(2, 30, 'Consonnes d’une langue', 'Nombre de consonnes d’une langue (au plus, au moins).', 'consonnes', 'newWorld')),
        vowelCount: range(int(1, 10, 'Voyelles d’une langue', 'Nombre de voyelles d’une langue.', 'voyelles', 'newWorld')),
        nameSyllables: range(int(1, 5, 'Syllabes d’un nom', 'Nombre de syllabes d’un nom de personne.', 'syllabes', 'newWorld')),
        soundChangesPerSplit: int(1, 10, 'Changements de sons', 'Changements de prononciation d’une langue fille par rapport à sa langue mère.', 'changements'),
        contactLearnPerDay: share('Apprendre au contact', 'Progrès par jour dans une langue étrangère de qui a croisé quelqu’un qui la parle.'),
        homeLearnPerDay: share('Apprendre au foyer', 'Progrès par jour dans la langue de son compagnon ou de ses parents.'),
        childFluencyYears: num(1, 20, 'Langue maternelle', 'Âge auquel un enfant parle sa langue maternelle couramment.', 'ans'),
        speaksAbove: share('Parler une langue', 'Aisance à partir de laquelle on parle une langue (bilingue, interprète).'),
        kinshipIntelligibility: share('Langues sœurs', 'Compréhension entre deux langues qui ont une mère commune (divisée d’autant à chaque génération de plus).'),
      },
    },
    religion: {
      kind: 'object',
      fields: {
        ...driftFields('des croyances', '(religions)'),
        beliefs: {
          kind: 'array',
          minLength: 1,
          items: {
            kind: 'object',
            fields: {
              id: text('Identifiant', 'Identifiant de la croyance (ne pas changer).', 'newWorld'),
              name: text('Croyance', 'Ce que l’on vénère (affiché).'),
              rite: text('Rite', 'Le rite qui l’accompagne (affiché).'),
            },
          },
        },
        griefChance: num(0, 1, 'Naissance par le deuil', 'Chance qu’une personne très spirituelle, sans religion, qui perd un proche, se mette à croire (avant traits).', 'chance'),
        catastropheChance: num(0, 1, 'Naissance par la catastrophe', 'Chance par jour de catastrophe (épidémie, famine, année terrible) qu’une personne très spirituelle se mette à croire.', 'chance'),
        prophetChance: num(0, 0.01, 'Prophète', 'Chance par jour qu’une personne charismatique et très spirituelle ait une révélation.', 'par jour'),
        prophetTraits: share('Trait de prophète', 'Spiritualité et sociabilité qu’il faut pour être un prophète ou se mettre à croire seul.'),
        spreadPerTalk: share('Conversion', 'Chance de gagner à sa foi quelqu’un à qui l’on parle (selon la ferveur de l’un, la spiritualité de l’autre).'),
        childPiety: share('Foi des enfants', 'Part de la ferveur de ses parents qu’un enfant reçoit.'),
        pietyDecayPerYear: share('Tiédeur', 'Part de la ferveur qui s’éteint en un an quand personne autour ne la partage.'),
        clergyMembers: int(2, 500, 'Clergé', 'Fidèles qu’il faut dans une tribu pour qu’un chaman ou un prêtre apparaisse.', 'personnes'),
        worshipMembers: int(2, 500, 'Lieu de culte', 'Fidèles qu’il faut dans un camp pour vouloir un sanctuaire ou une tombe.', 'personnes'),
        faithAffection: num(0, 50, 'Liens de la foi', 'Affection gagnée entre deux fidèles d’une même religion qui se parlent.', 'points'),
      },
    },
    trade: {
      kind: 'object',
      fields: {
        encountersPerDay: int(0, 24, 'Rencontres', 'Nombre de fois par jour où l’on regarde qui croise qui (échanges, langues, savoirs entre tribus).', 'fois'),
        encounterTiles: num(1, 40, 'Distance d’une rencontre', 'Distance à laquelle deux personnes de tribus différentes se croisent.', 'tuiles'),
        tradeChance: share('Envie d’échanger', 'Chance qu’une rencontre tourne au troc quand chacun a ce que l’autre veut (avant confiance et langue).'),
        misunderstanding: share('Malentendu', 'Chance qu’un troc entre personnes qui se comprennent mal tourne mal (méfiance).'),
        tradeFeels: num(0, 50, 'Bon échange', 'Affection et confiance gagnées par un échange réussi (perdues par un malentendu).', 'points'),
        tokenItems: strings('Bien d’échange possible', 'Objets durables et légers qui peuvent devenir un bien d’échange accepté de tous.'),
        tokenAcceptChance: share('Accepter un bien d’échange', 'Chance d’accepter un objet dont on n’a pas besoin, parce que d’autres l’acceptent (multipliée par l’acceptation qu’on en a).'),
        tokenGain: share('Confiance dans un bien', 'Acceptation gagnée par un échange réussi avec cet objet.'),
        tokenSpreadPerTalk: share('Réputation d’un bien', 'Part de l’acceptation d’un bien qui passe à l’autre dans une conversation.'),
        tokenDecayPerYear: share('Oubli d’un bien', 'Part de l’acceptation d’un bien qui s’efface en un an.'),
        currencyShare: share('Bien accepté de tous', 'Part des adultes d’une tribu qui doivent accepter un même objet pour qu’il devienne son bien d’échange.'),
        currencyStrength: share('Acceptation forte', 'Acceptation à partir de laquelle on compte quelqu’un comme acceptant un bien.'),
      },
    },
    texts: fixed(TEXT_KEYS, () => text('Texte du journal', 'Texte du journal (remplacements entre accolades).')),
    needTexts: fixed(NEEDS, () => text('Besoin', 'Ce que dit le journal du besoin qui a poussé à une découverte.')),
    environmentTexts: fixed(ENVIRONMENTS, () => text('Milieu', 'Ce que dit le journal du milieu qui a permis une découverte.')),
  },
};

export function parseIdeasParams(raw: unknown): IdeasParams {
  const params = validateData<IdeasParams>('data/ideas.json', raw, IDEAS_SCHEMA);
  const problems: string[] = [];
  if (params.language.consonantCount[0] > params.language.consonantCount[1]) problems.push('language.consonantCount : le minimum dépasse le maximum.');
  if (params.language.vowelCount[1] > params.language.vowels.length) problems.push('language.vowelCount : plus de voyelles demandées que la liste n’en contient.');
  if (params.language.consonantCount[1] > params.language.consonants.length) problems.push('language.consonantCount : plus de consonnes demandées que la liste n’en contient.');
  if (problems.length > 0) throw new DataFileError('data/ideas.json', problems);
  return params;
}

/** Cross-file checks: actions named by the values, items that can become goods of exchange, traits. */
export function checkIdeaLinks(params: IdeasParams, actionIds: readonly string[], itemIds: readonly string[], traitIds: readonly string[]): void {
  const problems: string[] = [];
  for (const value of params.values) {
    for (const id of Object.keys(value.actions)) if (!actionIds.includes(id)) problems.push(`valeur « ${value.id} » : l’action « ${id} » n’existe pas (data/humans.json).`);
  }
  for (const id of params.trade.tokenItems) if (!itemIds.includes(id)) problems.push(`trade.tokenItems : l’objet « ${id} » n’existe pas (data/items.json).`);
  for (const id of Object.keys(params.knowledge.aptitudeTraits)) if (!traitIds.includes(id)) problems.push(`knowledge.aptitudeTraits : trait inconnu « ${id} ».`);
  if (problems.length > 0) throw new DataFileError('data/ideas.json', problems);
}
