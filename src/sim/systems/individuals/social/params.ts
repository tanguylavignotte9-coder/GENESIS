import { DataFileError, flag, int, num, text, validateData, type Schema } from '../../../core/data-validation';

/** Short-lived emotions (fixed concepts; their names and fading speed are data). */
export const EMOTIONS = ['joy', 'sadness', 'anger', 'fear', 'jealousy'] as const;
export type EmotionId = (typeof EMOTIONS)[number];

/** Kinds of memories the code records (their strength, fading, effect on personality and text are data). */
export const MEMORY_KINDS = [
  'grief',
  'witnessedDeath',
  'attacked',
  'danger',
  'starving',
  'fed',
  'comforted',
  'quarrel',
  'rejected',
  'couple',
  'separation',
  'friendship',
  'jealous',
  'childBorn',
  'lostBaby',
  'adopted',
  'lostOne',
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const CONVERSATIONS = ['chat', 'confide', 'console', 'seduce', 'argue'] as const;
export type ConversationKind = (typeof CONVERSATIONS)[number];

/** Why a relation is what it is (the main reasons are kept with it). */
export const REASONS = ['chat', 'confided', 'comforted', 'courted', 'quarrel', 'fed', 'gave', 'jealousy', 'kin', 'spouse', 'tribe', 'adopted', 'elder', 'played', 'contested', 'rallied', 'blamed', 'taught', 'traded', 'faith'] as const;
export type ReasonId = (typeof REASONS)[number];

export const NEWS_KINDS = ['death', 'couple', 'food', 'danger'] as const;
export type NewsKind = (typeof NEWS_KINDS)[number];

/** The last three are political: the groups system offers and judges them (data/groups.json). */
export const AMBITIONS = ['makeFriends', 'findPartner', 'excelSkill', 'regainEsteem', 'becomeChief', 'foundClan', 'foundTribe'] as const;
export type AmbitionId = (typeof AMBITIONS)[number];

export interface Feelings {
  affection: number;
  trust: number;
  respect: number;
}

export interface MemoryKindParams {
  name: string;
  emotion: EmotionId;
  intensity: number;
  halfLifeDays: number;
  traits: Record<string, number>;
  text: string;
}

export interface ConversationParams {
  name: string;
  listenerFeels: Feelings;
  speakerFeels: Feelings;
  lonelinessRelief: number;
  joy: number;
  reason: ReasonId;
}

export interface SocialParams {
  reachTiles: number;
  scanEveryMinutes: number;
  relations: {
    slots: number;
    decayPerDay: number;
    forgetBelow: number;
    startingSpread: number;
    startingMean: number;
    kin: { spouse: Feelings; parent: Feelings; child: Feelings; sibling: Feelings };
    friendAffection: number;
    greatFriendAffection: number;
    rivalAffection: number;
    fallingOutDrop: number;
    reasonHalfLifeDays: number;
    negativityBias: number;
  };
  emotions: Record<EmotionId, { name: string; decayPerHour: number }>;
  loneliness: { perHour: number; sociabilityEffect: number; name: string };
  memories: { slots: number; forgetBelow: number; feelShare: number; maxTraitDrift: number; kinds: Record<MemoryKind, MemoryKindParams> };
  conversation: {
    durationHours: number;
    newsPerTalk: number;
    kinds: Record<ConversationKind, ConversationParams>;
    confideSadnessRelief: number;
    consoleSadnessRelief: number;
    argueAngerRelief: number;
    argueAngerCaused: number;
    chatOverheardJealousyTiles: number;
    charmEffect: number;
    temperEffect: number;
    jealousyFeels: Feelings;
    jealousyAnger: number;
    frictionChance: number;
    frictionFeels: Feelings;
    frictionAnger: number;
    frictionHungerEffect: number;
    frictionMismatchEffect: number;
    partnerRandomness: number;
    likeMindedEffect: number;
  };
  couples: {
    minAge: number;
    maxAgeGap: number;
    sameSexShare: number;
    acceptAffection: number;
    courtMinAffection: number;
    takenTargetFactor: number;
    breakupAffection: number;
    mourningMemoryBelow: number;
  };
  news: {
    slots: number;
    detailLossChance: number;
    witnessTiles: number;
    discoveryDays: number;
    foodFactMinTiles: number;
    fuzzTiles: [number, number, number];
    kinds: Record<NewsKind, { importance: number; forgetDays: number }>;
  };
  sharing: { askHunger: number; keepHunger: number; foodUnitsPerGift: number; receiverFeels: Feelings; giverJoy: number; itemGiftWeight: number };
  ambitions: {
    max: number;
    friendsGoal: number;
    masteryLevel: number;
    skillBonus: number;
    lonelyFriends: number;
    dailyChance: number;
    kinds: Record<AmbitionId, { name: string; weight: number; traits: Record<string, number> }>;
  };
  texts: {
    couple: string;
    friendship: string;
    fallingOut: string;
    separation: string;
    mourning: string;
    mourningWitness: string;
    noReason: string;
    dated: string;
    toldBy: string;
  };
  reasons: Record<ReasonId, { text: string; dated: boolean }>;
  kinNames: Record<KinName, string>;
  newsTexts: {
    death: string;
    causes: string[];
    unknownCause: string;
    couple: string;
    food: string;
    danger: string;
    around: string;
    nearby: string;
    secondHand: string;
    farHand: string;
  };
}

export const KIN_NAMES = ['mother', 'father', 'son', 'daughter', 'brother', 'sister', 'husband', 'wife', 'friend', 'friendFemale', 'acquaintance', 'rival', 'rivalFemale'] as const;
export type KinName = (typeof KIN_NAMES)[number];

type Apply = 'live' | 'newWorld';
const feelings = (who: string): Schema => ({
  kind: 'object',
  fields: {
    affection: num(-100, 100, 'Affection', `Affection (${who}).`, 'points'),
    trust: num(-100, 100, 'Confiance', `Confiance (${who}).`, 'points'),
    respect: num(-100, 100, 'Respect', `Respect (${who}).`, 'points'),
  },
});
const traitEffects = (help: string): Schema => ({ kind: 'record', values: num(-1, 1, 'Effet sur un trait', help, 'fraction') });
const fixed = (keys: readonly string[], item: Schema): Schema => ({ kind: 'object', fields: Object.fromEntries(keys.map((key) => [key, item])) });
const choice = (values: readonly string[], label: string, help: string, apply: Apply = 'live'): Schema => ({ kind: 'enum', values, doc: { label, help, unit: 'choix', apply } });
const TEXT_HELP = 'Remplacements : {a}, {b}, {raisons}, {nom}, {mort}, {lien}, {par}, {texte}, {saison}, {an}.';

const MEMORY_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    name: text('Nom', 'Nom du souvenir (fiche personnage).'),
    emotion: choice(EMOTIONS, 'Émotion', 'Émotion que ravive ce souvenir tant qu’il reste fort.'),
    intensity: num(0, 100, 'Force', 'Poids émotionnel du souvenir quand il se forme (100 = bouleversant).', 'points'),
    halfLifeDays: num(1, 4000, 'Estompage', 'Jours au bout desquels le poids du souvenir a diminué de moitié.', 'jours'),
    traits: traitEffects('Changement d’un trait de caractère quand le souvenir se forme à pleine force (personnalité évolutive).'),
    text: text('Texte', 'Phrase de la fiche personnage. Remplacements : {autre}, {e}.'),
  },
};

const CONVERSATION_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    name: text('Nom', 'Nom de la conversation.'),
    listenerFeels: feelings('changement de ce que l’interlocuteur ressent pour celui qui parle'),
    speakerFeels: feelings('changement de ce que celui qui parle ressent pour son interlocuteur'),
    lonelinessRelief: num(0, 100, 'Fin de la solitude', 'Points de solitude effacés chez les deux.', 'points'),
    joy: num(0, 100, 'Joie', 'Joie ressentie par les deux.', 'points'),
    reason: choice(REASONS, 'Raison retenue', 'Raison inscrite dans la relation (« longues conversations »).'),
  },
};

export const SOCIAL_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    reachTiles: int(1, 40, 'Portée de la vie sociale', 'Distance à laquelle on va trouver quelqu’un pour lui parler ou lui donner à manger.', 'tuiles'),
    scanEveryMinutes: int(0, 600, 'Regard sur les autres', 'Une personne revoit qui est autour d’elle (à qui parler, qui consoler, qui nourrir) au plus une fois tous ces minutes ; entre-temps, elle garde ce qu’elle a vu (ses émotions, elles, sont toujours à jour).', 'minutes de jeu'),
    relations: {
      kind: 'object',
      fields: {
        slots: int(4, 64, 'Relations retenues', 'Nombre de relations qu’une personne garde (seules celles qui comptent le plus).', 'relations', 'newWorld'),
        decayPerDay: num(0, 10, 'Usure des relations', 'Points perdus par jour par une relation vers sa valeur de base (0, ou celle du lien familial).', 'points/jour'),
        forgetBelow: num(0, 50, 'Oubli d’une relation', 'Une relation hors famille dont toutes les valeurs sont plus faibles que ceci est oubliée.', 'points'),
        startingSpread: num(0, 100, 'Diversité des liens de départ', 'Écart des relations entre les membres de la tribu de départ.', 'points', 'newWorld'),
        startingMean: num(-50, 50, 'Liens de départ', 'Valeur moyenne des relations entre les membres de la tribu de départ.', 'points', 'newWorld'),
        kin: {
          kind: 'object',
          fields: {
            spouse: feelings('envers son conjoint'),
            parent: feelings('envers un parent'),
            child: feelings('envers son enfant'),
            sibling: feelings('envers un frère ou une sœur'),
          },
        },
        friendAffection: num(0, 100, 'Amitié', 'Affection à partir de laquelle on considère quelqu’un comme un ami.', 'points'),
        greatFriendAffection: num(0, 100, 'Grande amitié', 'Affection mutuelle à partir de laquelle deux personnes sont de grands amis (journal).', 'points'),
        rivalAffection: num(-100, 0, 'Rivalité', 'Affection en dessous de laquelle quelqu’un est un rival.', 'points'),
        negativityBias: num(1, 10, 'Ce qui blesse marque', 'Une dispute ou une jalousie compte ce nombre de fois plus qu’un bon moment parmi les raisons retenues d’une relation.', 'facteur'),
        reasonHalfLifeDays: num(1, 4000, 'Mémoire des raisons', 'Les raisons d’une relation s’effacent avec le temps (demi-vie) : les plus récentes et les plus fortes restent.', 'jours'),
        fallingOutDrop: num(0, 200, 'Brouille', 'Chute d’affection depuis la meilleure valeur atteinte qui fait parler de brouille entre amis.', 'points'),
      },
    },
    emotions: fixed(EMOTIONS, {
      kind: 'object',
      fields: {
        name: text('Nom', 'Nom affiché de l’émotion.'),
        decayPerHour: num(0, 100, 'Apaisement', 'Points d’émotion perdus par heure.', 'points/heure'),
      },
    }),
    loneliness: {
      kind: 'object',
      fields: {
        perHour: num(0, 50, 'Solitude', 'Points de solitude gagnés par heure d’éveil sans conversation (personne de sociabilité moyenne).', 'points/heure'),
        sociabilityEffect: num(0, 1, 'Effet de la sociabilité', 'Les sociables se sentent seuls plus vite, les autres plus lentement (effet maximal).', 'fraction'),
        name: text('Nom', 'Nom affiché du besoin de compagnie.'),
      },
    },
    memories: {
      kind: 'object',
      fields: {
        slots: int(2, 64, 'Souvenirs retenus', 'Nombre de souvenirs marquants qu’une personne garde (les plus forts).', 'souvenirs', 'newWorld'),
        forgetBelow: num(0, 50, 'Oubli', 'Un souvenir dont le poids tombe sous ce seuil est oublié.', 'points'),
        feelShare: num(0, 1, 'Souvenirs et émotions', 'Une émotion ne retombe pas sous cette part du poids du souvenir qui la ravive.', 'fraction'),
        maxTraitDrift: num(0, 1, 'Évolution de la personnalité', 'Écart maximal d’un trait de caractère par rapport à la naissance.', 'fraction'),
        kinds: fixed(MEMORY_KINDS, MEMORY_SCHEMA),
      },
    },
    conversation: {
      kind: 'object',
      fields: {
        durationHours: num(0.1, 4, 'Durée d’une conversation', 'Temps passé à parler.', 'heures'),
        newsPerTalk: int(0, 10, 'Nouvelles échangées', 'Nombre de nouvelles qu’on raconte au plus pendant une conversation.', 'nouvelles'),
        kinds: fixed(CONVERSATIONS, CONVERSATION_SCHEMA),
        confideSadnessRelief: num(0, 100, 'Soulagement', 'Tristesse effacée chez celui qui se confie.', 'points'),
        consoleSadnessRelief: num(0, 100, 'Consolation', 'Tristesse effacée chez celui qu’on console.', 'points'),
        argueAngerRelief: num(0, 100, 'Défoulement', 'Colère effacée chez celui qui provoque la dispute.', 'points'),
        argueAngerCaused: num(0, 100, 'Colère de l’autre', 'Colère ressentie par celui qu’on prend à partie.', 'points'),
        chatOverheardJealousyTiles: int(0, 40, 'Jalousie', 'Distance à laquelle un conjoint voit quelqu’un courtiser l’être aimé.', 'tuiles'),
        charmEffect: num(0, 1, 'Charme', 'Les sociables font meilleure impression quand ils parlent, les autres moins bonne (effet maximal).', 'fraction'),
        temperEffect: num(0, 1, 'Susceptibilité', 'Les colériques s’emportent davantage quand on les prend à partie (effet maximal).', 'fraction'),
        jealousyFeels: feelings('changement de ce qu’un conjoint jaloux ressent pour celui qui courtise l’être aimé'),
        jealousyAnger: num(0, 100, 'Colère du jaloux', 'Colère ressentie par un conjoint qui voit courtiser l’être aimé.', 'points'),
        frictionChance: num(0, 1, 'Accrochage', 'Chance qu’une conversation entre deux personnes de caractère moyen tourne mal (plus fréquent entre colériques et entre gens qui ne s’aiment pas).', 'probabilité'),
        frictionFeels: feelings('changement des sentiments de chacun quand une conversation tourne mal'),
        frictionAnger: num(0, 100, 'Colère d’un accrochage', 'Colère ressentie par chacun quand une conversation tourne mal.', 'points'),
        frictionHungerEffect: num(0, 10, 'Faim et irritabilité', 'Hausse de la chance d’accrochage quand les deux meurent de faim (la moitié si l’un des deux).', 'facteur'),
        likeMindedEffect: num(0, 5, 'Qui se ressemble s’assemble', 'Les conversations rapprochent davantage deux personnes de caractères proches (effet maximal pour des caractères identiques, nul à mi-chemin, inverse pour des opposés).', 'facteur'),
        partnerRandomness: num(0, 200, 'Hasard des rencontres', 'On parle d’abord à ceux qu’on aime, mais pas toujours : écart aléatoire ajouté à l’affection pour choisir à qui parler.', 'points'),
        frictionMismatchEffect: num(0, 10, 'Caractères opposés', 'Hausse de la chance d’accrochage entre deux personnes de caractères opposés en tout.', 'facteur'),
      },
    },
    couples: {
      kind: 'object',
      fields: {
        minAge: num(10, 40, 'Âge du couple', 'Âge minimal pour courtiser et former un couple.', 'ans'),
        maxAgeGap: num(0, 60, 'Écart d’âge', 'Au-delà de cet écart d’âge, on ne se courtise pas.', 'ans'),
        sameSexShare: num(0, 1, 'Attirance pour le même sexe', 'Part des personnes attirées par leur propre sexe (tirée à la création du monde).', 'fraction', 'newWorld'),
        acceptAffection: num(0, 100, 'Oui', 'Affection pour son prétendant à partir de laquelle on accepte de former un couple.', 'points'),
        courtMinAffection: num(-100, 100, 'Premier pas', 'Affection minimale pour courtiser quelqu’un.', 'points'),
        takenTargetFactor: num(0, 1, 'Courtiser une personne en couple', 'Envie de courtiser une personne déjà en couple, par rapport à une personne libre.', 'fraction'),
        breakupAffection: num(-100, 50, 'Séparation', 'Un couple se sépare quand l’affection de l’un pour l’autre tombe sous ce seuil.', 'points'),
        mourningMemoryBelow: num(0, 100, 'Fin du deuil', 'Un veuf ou une veuve ne courtise pas tant que son deuil pèse plus que ceci.', 'points'),
      },
    },
    news: {
      kind: 'object',
      fields: {
        slots: int(2, 64, 'Nouvelles retenues', 'Nombre de nouvelles qu’une personne garde en tête (les plus importantes).', 'nouvelles', 'newWorld'),
        detailLossChance: num(0, 1, 'Perte de détails', 'Chance qu’une nouvelle perde des détails (cause, lieu précis) chaque fois qu’on la raconte (jamais de mensonge).', 'probabilité'),
        witnessTiles: int(0, 40, 'Témoins', 'Distance à laquelle on voit ce qui arrive (une mort, un couple, une attaque).', 'tuiles'),
        discoveryDays: int(0, 100, 'Corps retrouvé', 'Pendant ces jours, quelqu’un qui passe près d’un mort découvre ce qui est arrivé.', 'jours'),
        foodFactMinTiles: int(0, 100, 'Coin à signaler', 'Distance au camp à partir de laquelle un coin de nourriture trouvé devient une nouvelle à raconter.', 'tuiles'),
        fuzzTiles: { kind: 'array', minLength: 3, maxLength: 3, items: int(0, 50, 'Imprécision du lieu', 'Imprécision d’un lieu raconté : de première main, de deuxième main, rapporté de loin.', 'tuiles') },
        kinds: fixed(NEWS_KINDS, {
          kind: 'object',
          fields: {
            importance: num(0, 1, 'Importance', 'Ordre dans lequel on raconte et retient les nouvelles.', 'poids'),
            forgetDays: int(1, 4000, 'Oubli', 'Jours au bout desquels on oublie cette nouvelle.', 'jours'),
          },
        }),
      },
    },
    sharing: {
      kind: 'object',
      fields: {
        askHunger: num(0, 100, 'Faim qui se voit', 'Faim à partir de laquelle les autres pensent à vous donner à manger.', 'points'),
        keepHunger: num(0, 100, 'Garder pour soi', 'Au-dessus de cette faim, on ne donne plus sa nourriture.', 'points'),
        foodUnitsPerGift: num(0.5, 50, 'Part donnée', 'Unités de nourriture données en une fois au plus.', 'unités'),
        receiverFeels: feelings('changement de ce que ressent celui qui reçoit pour celui qui donne'),
        giverJoy: num(0, 100, 'Joie de donner', 'Joie ressentie par celui qui donne.', 'points'),
        itemGiftWeight: num(0, 1, 'Donner un objet', 'Envie de donner un objet en double à un ami qui n’en a pas, par rapport à nourrir quelqu’un qui a faim.', 'fraction'),
      },
    },
    ambitions: {
      kind: 'object',
      fields: {
        max: int(1, 3, 'Ambitions actives', 'Nombre maximal d’ambitions actives par personne (1 à 3).', 'ambitions'),
        friendsGoal: int(1, 20, 'Assez d’amis', 'Nombre d’amis qui comble l’envie de se faire des amis.', 'amis'),
        masteryLevel: num(0, 1, 'Maîtrise', 'Niveau d’une compétence qui comble l’envie d’exceller.', 'fraction'),
        skillBonus: num(0, 3, 'Ardeur de l’ambitieux', 'Bonus de score des actions qui exercent la compétence qu’on veut maîtriser.', 'fraction'),
        lonelyFriends: int(0, 20, 'Peu d’amis', 'Avec au plus ce nombre d’amis, une personne sociable veut s’en faire.', 'amis'),
        dailyChance: num(0, 1, 'Nouvelle ambition', 'Chance par jour qu’une nouvelle ambition naisse (si la personne en a moins que le maximum ; sans ambition, la première naît aussitôt).', 'probabilité'),
        kinds: fixed(AMBITIONS, {
          kind: 'object',
          fields: {
            name: text('Nom', 'Nom affiché de l’ambition.'),
            weight: num(0, 5, 'Fréquence', 'Poids de cette ambition dans le choix des ambitions.', 'poids'),
            traits: traitEffects('Effet d’un trait de caractère sur l’envie de cette ambition.'),
          },
        }),
      },
    },
    texts: fixed(['couple', 'friendship', 'fallingOut', 'separation', 'mourning', 'mourningWitness', 'noReason', 'dated', 'toldBy'], text('Texte du journal', TEXT_HELP)),
    reasons: fixed(REASONS, {
      kind: 'object',
      fields: {
        text: text('Raison', 'Raison d’une relation. Remplacements : {nom} (celui qui ressent), {autre}, {e}.'),
        dated: flag('Datée', 'Ajoute la saison et l’année (« hiver de l’an 3 »).'),
      },
    }),
    kinNames: fixed(KIN_NAMES, text('Lien', 'Nom d’un lien entre deux personnes, dans les phrases du journal et la fiche (« sa mère »).')),
    newsTexts: {
      kind: 'object',
      fields: {
        death: text('Une mort', 'Nouvelle d’une mort (fiche personnage). Remplacements : {nom}, {e}, {cause}.'),
        causes: { kind: 'array', minLength: 8, maxLength: 8, items: text('Cause de mort', 'Fin de phrase selon la cause : aucune, faim, soif, froid, fauve, vieillesse, maladie, en couches. Remplacement : {e}.') },
        unknownCause: text('Cause inconnue', 'Quand la nouvelle a perdu la cause en route.'),
        couple: text('Un couple', 'Nouvelle d’un couple. Remplacements : {a}, {b}.'),
        food: text('Un coin de nourriture', 'Remplacements : {distance}, {direction}.'),
        danger: text('Un danger', 'Remplacements : {distance}, {direction}.'),
        around: text('Distance approximative', 'Distance d’un lieu entendu dire. Remplacement : {distance}.'),
        nearby: text('Tout près', 'Un lieu tout proche.'),
        secondHand: text('De deuxième main', 'Ajouté à une nouvelle entendue d’un témoin.'),
        farHand: text('Rapporté de loin', 'Ajouté à une nouvelle passée par plusieurs bouches.'),
      },
    },
  },
};

const FILE = 'data/social.json';

export function parseSocialParams(raw: unknown, traitIds: readonly string[]): SocialParams {
  const params = validateData<SocialParams>(FILE, raw, SOCIAL_SCHEMA);
  const problems: string[] = [];
  const traits = new Set(traitIds);
  for (const kind of MEMORY_KINDS) {
    for (const id of Object.keys(params.memories.kinds[kind].traits)) if (!traits.has(id)) problems.push(`souvenir « ${kind} » : le trait « ${id} » n'existe pas.`);
  }
  for (const kind of AMBITIONS) {
    for (const id of Object.keys(params.ambitions.kinds[kind].traits)) if (!traits.has(id)) problems.push(`ambition « ${kind} » : le trait « ${id} » n'existe pas.`);
  }
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}
