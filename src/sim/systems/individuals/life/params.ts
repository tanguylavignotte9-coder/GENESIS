import { DataFileError, flag, identifier, int, num, text, validateData, type Schema } from '../../../core/data-validation';

/** Ages of life: [starts, full from, declines from, ends] of a fertility curve. */
export type AgeCurve = [number, number, number, number];

export interface DiseaseDef {
  id: string;
  name: string;
  contagious: boolean;
  onsetPerYear: number;
  coldOnsetEffect: number;
  hungerOnsetEffect: number;
  transmitPerHour: number;
  contagionTiles: number;
  durationDays: [number, number];
  damagePerHour: number;
  hungerEffect: number;
  coldEffect: number;
  immunityYears: number;
  vigorWhileSick: number;
}

export interface LifeParams {
  stages: { adultAge: number; carriedUntilAge: number; weaningAge: number; playUntilAge: number; elderAge: number };
  fertility: {
    conceptionPerYear: number;
    femaleAges: AgeCurve;
    maleAges: AgeCurve;
    nursingFactor: number;
    togetherTiles: number;
    hungerFull: number;
    hungerNone: number;
    minHealth: number;
    nourishmentDays: number;
    desire: { minAffection: number; fullAffection: number; sociabilityEffect: number; youngChildAge: number; perYoungChild: number; famineFear: number };
  };
  pregnancy: { days: number; hungerPerHour: number; vigorFactor: number; miscarriagePerDay: number; miscarriageHungerFactor: number; miscarriageSickFactor: number };
  birth: {
    femaleChance: number;
    motherDeath: number;
    stillbirth: number;
    youngMotherAge: number;
    oldMotherAge: number;
    ageRiskFactor: number;
    weakMotherHealth: number;
    weakRiskFactor: number;
    hungryMotherHunger: number;
    hungerRiskFactor: number;
    newbornHealth: number;
  };
  heredity: { parentShare: number; variation: number };
  infancy: { milkHungerPerHour: number; milkFailsHunger: number; feedAboveHunger: number; nurseTiles: number };
  childhood: {
    followTiles: number;
    observeTiles: number;
    observeMinAge: number;
    observeShare: number;
    searchTiles: number;
    shapingFactor: number;
    extraDrift: number;
    play: { joyPerHour: number; lonelinessReliefPerHour: number; affectionPerHour: number; playmateTiles: number };
  };
  aging: {
    childVigor: number;
    declineFromAge: number;
    declinePerYear: number;
    minVigor: number;
    enduranceEffect: number;
    workEffect: number;
    childAppetite: number;
    elderAppetite: number;
    respectPerYear: number;
    respectSkillShare: number;
  };
  oldAge: { fromAge: number; referenceAge: number; deathPerYearAtReference: number; doublingYears: number; frailtyEffect: number };
  diseases: DiseaseDef[];
  frailty: { hungerFrom: number; coldFrom: number };
  ageVulnerability: [number, number][];
  epidemic: { minCases: number; minShare: number };
  famine: { minDeaths: number; windowDays: number };
  orphans: { minGuardianAge: number; maxGuardianAge: number; kinBonus: number; bondWeight: number; generosityEffect: number; burdenPerChild: number; minWillingness: number };
  census: { everyDays: number };
  texts: {
    birth: string;
    stillbirth: string;
    boy: string;
    girl: string;
    fatherDead: string;
    epidemicStart: string;
    epidemicEnd: string;
    famine: string;
    adoption: string;
    wetNurse: string;
    inheritance: string;
    inheritanceShared: string;
    weakenedByHunger: string;
    weakenedByCold: string;
    ties: {
      grandmother: string;
      grandfather: string;
      aunt: string;
      uncle: string;
      sister: string;
      brother: string;
      father: string;
      mother: string;
      closeTo: string;
      closeToFemale: string;
    };
  };
}

const ageCurve = (who: string): Schema => ({
  kind: 'array',
  minLength: 4,
  maxLength: 4,
  items: num(0, 100, `Âges de fécondité (${who})`, `[début, pleine fécondité, début du déclin, fin] de la fécondité ${who === 'femmes' ? 'des femmes' : 'des hommes'}.`, 'ans'),
});

const DISEASE_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    id: identifier('Identifiant', 'Nom technique de la maladie.'),
    name: text('Nom', 'Nom de la maladie (journal, fiche personnage).'),
    contagious: flag('Contagieuse', 'La maladie se transmet aux personnes proches.'),
    onsetPerYear: num(0, 1, 'Apparition', 'Chance par an qu’une personne en bonne santé l’attrape d’elle-même (eau, blessure, gibier…), avant les effets du froid et de la faim.', 'chance/an'),
    coldOnsetEffect: num(0, 20, 'Froid et apparition', 'Le froid ressenti multiplie la chance d’apparition jusqu’à (1 + ceci) quand on a très froid.', 'facteur'),
    hungerOnsetEffect: num(0, 20, 'Faim et apparition', 'La faim multiplie la chance d’apparition et de contagion jusqu’à (1 + ceci) quand on est affamé.', 'facteur'),
    transmitPerHour: num(0, 1, 'Contagion', 'Chance par heure qu’une personne proche d’un malade l’attrape (avant l’effet de l’âge et de la faim).', 'chance/heure'),
    contagionTiles: int(0, 10, 'Distance de contagion', 'Distance à laquelle un malade peut contaminer quelqu’un.', 'tuiles'),
    durationDays: { kind: 'array', minLength: 2, maxLength: 2, items: num(0.5, 100, 'Durée', 'Durée de la maladie [min, max] avant la guérison.', 'jours') },
    damagePerHour: num(0, 10, 'Gravité', 'Santé perdue par heure de maladie (avant les effets de l’âge, de la faim et du froid).', 'points/heure'),
    hungerEffect: num(0, 20, 'Aggravée par la faim', 'Une personne affamée perd jusqu’à (1 + ceci) fois plus de santé.', 'facteur'),
    coldEffect: num(0, 20, 'Aggravée par le froid', 'Une personne transie perd jusqu’à (1 + ceci) fois plus de santé.', 'facteur'),
    immunityYears: num(0, 100, 'Immunité', 'Années pendant lesquelles un guéri ne peut plus l’attraper.', 'ans'),
    vigorWhileSick: num(0.1, 1, 'Faiblesse', 'Forces d’un malade (vitesse, endurance, travail) par rapport à la normale.', 'fraction'),
  },
};

export const LIFE_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    stages: {
      kind: 'object',
      fields: {
        adultAge: num(8, 25, 'Fin de l’enfance', 'Âge auquel on devient adulte : avant, on dépend des adultes, on joue et on apprend en les regardant.', 'ans'),
        carriedUntilAge: num(0, 5, 'Bébé porté', 'Jusqu’à cet âge, un bébé est porté par sa mère (ou son tuteur) et ne se déplace pas seul.', 'ans'),
        weaningAge: num(0, 6, 'Sevrage', 'Jusqu’à cet âge, un enfant est allaité par sa mère (ou une nourrice) quand elle est près de lui.', 'ans'),
        playUntilAge: num(0, 20, 'Âge du jeu', 'Jusqu’à cet âge, un enfant joue volontiers avec les autres.', 'ans'),
        elderAge: num(30, 90, 'Vieillesse', 'Âge à partir duquel on est un ancien : le respect des autres grandit avec la sagesse.', 'ans'),
      },
    },
    fertility: {
      kind: 'object',
      fields: {
        conceptionPerYear: num(0, 1, 'Fécondité', 'Chance par an qu’un couple en pleine forme, qui le désire et sans bébé au sein, attende un enfant.', 'chance/an'),
        femaleAges: ageCurve('femmes'),
        maleAges: ageCurve('hommes'),
        nursingFactor: num(0, 1, 'Allaitement', 'Fécondité d’une mère qui allaite encore (par rapport à la normale) : espace les naissances.', 'fraction'),
        togetherTiles: int(0, 50, 'Ensemble', 'Les deux membres du couple doivent être à moins de cette distance (le soir, au camp).', 'tuiles'),
        hungerFull: num(0, 100, 'Faim sans effet', 'Sous cette faim moyenne des derniers jours, la mère est pleinement féconde.', 'points'),
        hungerNone: num(0, 100, 'Faim stérile', 'Au-dessus de cette faim moyenne des derniers jours, une femme ne conçoit plus (famine).', 'points'),
        minHealth: num(0, 100, 'Santé minimale', 'Sous cette santé, une femme ne conçoit pas.', 'points'),
        nourishmentDays: num(0.5, 40, 'Mémoire du corps', 'Nombre de jours sur lesquels le corps « retient » la faim (moyenne glissante).', 'jours'),
        desire: {
          kind: 'object',
          fields: {
            minAffection: num(-100, 100, 'Affection minimale', 'Sous cette affection mutuelle, le couple ne veut pas d’enfant.', 'points'),
            fullAffection: num(-100, 100, 'Affection pleine', 'À partir de cette affection mutuelle, l’envie d’enfant est entière.', 'points'),
            sociabilityEffect: num(0, 1, 'Goût de la famille', 'Effet de la sociabilité du couple sur l’envie d’enfant (± cette part).', 'fraction'),
            youngChildAge: num(0, 20, 'Jeunes enfants', 'Âge en dessous duquel un enfant vivant compte comme « petit » pour l’envie d’un autre.', 'ans'),
            perYoungChild: num(0, 1, 'Assez d’enfants', 'L’envie est multipliée par ceci pour chaque petit enfant vivant du couple.', 'facteur'),
            famineFear: num(0, 1, 'Peur de la faim', 'Un souvenir de famine réduit l’envie d’enfant jusqu’à cette part.', 'fraction'),
          },
        },
      },
    },
    pregnancy: {
      kind: 'object',
      fields: {
        days: num(1, 200, 'Grossesse', 'Durée d’une grossesse (calendrier compressé : 30 jours = 9 mois d’une année de 40 jours).', 'jours'),
        hungerPerHour: num(0, 10, 'Faim de la grossesse', 'Points de faim gagnés en plus par heure par une femme enceinte.', 'points/heure'),
        vigorFactor: num(0.1, 1, 'Fatigue de la grossesse', 'Forces d’une femme enceinte par rapport à la normale.', 'fraction'),
        miscarriagePerDay: num(0, 0.1, 'Fausse couche', 'Chance par jour de perdre l’enfant, mère en bonne santé et nourrie.', 'chance/jour'),
        miscarriageHungerFactor: num(0, 50, 'Faim et fausse couche', 'Une mère affamée a jusqu’à (1 + ceci) fois plus de risque.', 'facteur'),
        miscarriageSickFactor: num(0, 50, 'Maladie et fausse couche', 'Une mère malade a (1 + ceci) fois plus de risque.', 'facteur'),
      },
    },
    birth: {
      kind: 'object',
      fields: {
        femaleChance: num(0, 1, 'Filles', 'Chance qu’un nouveau-né soit une fille.', 'fraction'),
        motherDeath: num(0, 0.5, 'Mort en couches', 'Chance que la mère meure à l’accouchement, sans facteur aggravant.', 'chance'),
        stillbirth: num(0, 0.5, 'Mort-né', 'Chance que l’enfant naisse mort, sans facteur aggravant.', 'chance'),
        youngMotherAge: num(10, 30, 'Mère très jeune', 'Avant cet âge, l’accouchement est plus risqué.', 'ans'),
        oldMotherAge: num(25, 60, 'Mère âgée', 'Après cet âge, l’accouchement est plus risqué.', 'ans'),
        ageRiskFactor: num(1, 10, 'Risque de l’âge', 'Multiplicateur des risques pour une mère très jeune ou âgée.', 'facteur'),
        weakMotherHealth: num(0, 100, 'Mère affaiblie', 'Sous cette santé, l’accouchement est plus risqué.', 'points'),
        weakRiskFactor: num(1, 10, 'Risque de la faiblesse', 'Multiplicateur des risques pour une mère affaiblie.', 'facteur'),
        hungryMotherHunger: num(0, 100, 'Mère affamée', 'Au-dessus de cette faim moyenne, l’accouchement est plus risqué.', 'points'),
        hungerRiskFactor: num(1, 10, 'Risque de la faim', 'Multiplicateur des risques pour une mère affamée.', 'facteur'),
        newbornHealth: num(1, 100, 'Santé du nouveau-né', 'Santé d’un bébé à la naissance (il la regagne en grandissant s’il est nourri).', 'points'),
      },
    },
    heredity: {
      kind: 'object',
      fields: {
        parentShare: num(0, 1, 'Hérédité', 'Part des traits de caractère venue de la moyenne des deux parents (le reste est propre à l’enfant).', 'fraction'),
        variation: num(0, 0.5, 'Variation', 'Écart aléatoire ajouté à chaque trait à la naissance.', 'fraction'),
      },
    },
    infancy: {
      kind: 'object',
      fields: {
        milkHungerPerHour: num(0, 10, 'Coût de l’allaitement', 'Points de faim gagnés en plus par heure par une femme qui allaite.', 'points/heure'),
        milkFailsHunger: num(0, 100, 'Lait tari', 'Au-dessus de cette faim moyenne des derniers jours (famine), la mère n’a plus de lait.', 'points'),
        feedAboveHunger: num(0, 100, 'Faim d’un bébé', 'Un petit qui n’est pas allaité est nourri par son porteur (ou au stock) quand sa faim dépasse ceci.', 'points'),
        nurseTiles: int(0, 20, 'Près de sa mère', 'Un enfant est allaité quand sa mère (ou sa nourrice) est à moins de cette distance.', 'tuiles'),
      },
    },
    childhood: {
      kind: 'object',
      fields: {
        followTiles: int(1, 30, 'Suivre ses parents', 'Un jeune enfant plus loin que ceci de son parent (ou tuteur) veut le rejoindre.', 'tuiles'),
        observeTiles: int(0, 20, 'Observer', 'Un enfant apprend en regardant un adulte qui travaille à moins de cette distance.', 'tuiles'),
        observeMinAge: num(0, 14, 'Âge d’observer', 'Âge à partir duquel un enfant apprend en observant.', 'ans'),
        observeShare: num(0, 1, 'Apprendre en regardant', 'Une heure à regarder vaut cette part d’une heure de pratique (progression lente).', 'fraction'),
        searchTiles: int(1, 40, 'Rayon d’un enfant', 'Un enfant ne cherche à cueillir ou ramasser qu’à cette distance autour de lui (ou aux endroits qu’il connaît), et ne part jamais explorer.', 'tuiles'),
        shapingFactor: num(1, 10, 'Enfance qui forme', 'Les grands événements changent la personnalité d’un enfant ce nombre de fois plus que celle d’un adulte.', 'facteur'),
        extraDrift: num(0, 1, 'Marge de l’enfance', 'Écart supplémentaire permis depuis les traits de naissance quand l’événement est vécu enfant.', 'fraction'),
        play: {
          kind: 'object',
          fields: {
            joyPerHour: num(0, 100, 'Joie du jeu', 'Joie gagnée par heure de jeu.', 'points/heure'),
            lonelinessReliefPerHour: num(0, 100, 'Jeu et solitude', 'Solitude effacée par heure de jeu avec d’autres enfants.', 'points/heure'),
            affectionPerHour: num(0, 20, 'Camarades de jeu', 'Affection gagnée par heure entre enfants qui jouent ensemble.', 'points/heure'),
            playmateTiles: int(1, 20, 'Distance de jeu', 'Distance jusqu’à laquelle d’autres enfants comptent comme camarades de jeu.', 'tuiles'),
          },
        },
      },
    },
    aging: {
      kind: 'object',
      fields: {
        childVigor: num(0.1, 1, 'Forces d’un petit', 'Forces d’un enfant d’un an ; elles grandissent jusqu’à 1 à l’âge adulte.', 'fraction'),
        declineFromAge: num(20, 90, 'Déclin', 'Âge à partir duquel les forces déclinent (vitesse, endurance, travail physique).', 'ans'),
        declinePerYear: num(0, 0.1, 'Vitesse du déclin', 'Forces perdues par année après l’âge du déclin.', 'fraction/an'),
        minVigor: num(0.05, 1, 'Forces minimales', 'Forces les plus faibles qu’atteint un très vieil individu.', 'fraction'),
        enduranceEffect: num(0, 3, 'Endurance', 'La fatigue vient jusqu’à (1 + ceci) fois plus vite quand les forces manquent.', 'facteur'),
        workEffect: num(0, 1, 'Travail physique', 'Part de la vitesse de travail qui dépend des forces.', 'fraction'),
        childAppetite: num(0.05, 1, 'Appétit d’un petit', 'Un enfant sevré mange cette part de ce que mange un adulte à un an, puis de plus en plus jusqu’à l’âge adulte.', 'fraction'),
        elderAppetite: num(0, 1, 'Appétit des anciens', 'Un corps qui a perdu ses forces mange moins : l’appétit baisse de cette part des forces perdues avec l’âge.', 'fraction'),
        respectPerYear: num(0, 20, 'Respect des anciens', 'Respect gagné chaque année auprès de ceux qui le connaissent par un ancien (au plus, selon sa sagesse).', 'points/an'),
        respectSkillShare: num(0, 1, 'Sagesse et savoir-faire', 'Part du respect des anciens qui dépend de leur meilleure compétence (le reste vient de l’âge seul).', 'fraction'),
      },
    },
    oldAge: {
      kind: 'object',
      fields: {
        fromAge: num(20, 100, 'Mort de vieillesse', 'Âge à partir duquel on peut mourir de vieillesse.', 'ans'),
        referenceAge: num(20, 100, 'Âge de référence', 'Âge auquel la chance de mourir de vieillesse vaut la valeur suivante.', 'ans'),
        deathPerYearAtReference: num(0, 1, 'Mortalité à l’âge de référence', 'Chance par an de mourir de vieillesse à l’âge de référence.', 'chance/an'),
        doublingYears: num(1, 30, 'Doublement', 'Tous les ce nombre d’années, la chance de mourir de vieillesse double.', 'ans'),
        frailtyEffect: num(0, 10, 'Fragilité', 'Une santé basse multiplie la chance de mourir de vieillesse jusqu’à (1 + ceci).', 'facteur'),
      },
    },
    diseases: { kind: 'array', minLength: 0, items: DISEASE_SCHEMA },
    frailty: {
      kind: 'object',
      fields: {
        hungerFrom: num(0, 99, 'Faim qui affaiblit', 'Au-dessus de cette faim, le corps s’affaiblit : les maladies s’attrapent plus et frappent plus fort (effet croissant jusqu’à 100).', 'points'),
        coldFrom: num(0, 99, 'Froid qui affaiblit', 'Au-dessus de ce froid ressenti, le corps s’affaiblit face aux maladies (effet croissant jusqu’à 100).', 'points'),
      },
    },
    ageVulnerability: {
      kind: 'array',
      minLength: 1,
      items: {
        kind: 'array',
        minLength: 2,
        maxLength: 2,
        items: num(0, 120, 'Fragilité selon l’âge', '[âge, facteur] : les maladies frappent plus fort les tout-petits et les vieillards (valeurs interpolées entre les âges).', 'ans / facteur'),
      },
    },
    epidemic: {
      kind: 'object',
      fields: {
        minCases: int(2, 100, 'Épidémie', 'Nombre de malades en même temps d’une même maladie dans une tribu pour que le journal parle d’épidémie.', 'malades'),
        minShare: num(0, 1, 'Part de malades', 'Il faut aussi au moins cette part de la tribu malade en même temps pour parler d’épidémie (une grande tribu a toujours quelques malades).', 'fraction'),
      },
    },
    famine: {
      kind: 'object',
      fields: {
        minDeaths: int(1, 100, 'Famine', 'Nombre de morts de faim dans une tribu, en peu de temps, pour que le journal parle de famine.', 'morts'),
        windowDays: int(1, 200, 'Durée d’une famine', 'Les morts de faim comptent ensemble s’ils sont séparés de moins de ce nombre de jours.', 'jours'),
      },
    },
    orphans: {
      kind: 'object',
      fields: {
        minGuardianAge: num(10, 40, 'Âge pour recueillir', 'Âge minimal pour recueillir un orphelin.', 'ans'),
        maxGuardianAge: num(30, 120, 'Âge limite', 'Au-delà de cet âge, on ne recueille plus d’orphelin.', 'ans'),
        kinBonus: num(0, 3, 'Famille d’abord', 'Envie supplémentaire d’un grand-parent, d’un oncle, d’une tante ou d’un frère ou d’une sœur aînés.', 'fraction'),
        bondWeight: num(0, 3, 'Proches du défunt', 'Poids de l’affection pour l’enfant et pour le parent mort dans l’envie de recueillir.', 'fraction'),
        generosityEffect: num(0, 2, 'Générosité', 'Effet de la générosité sur l’envie de recueillir (± cette part).', 'fraction'),
        burdenPerChild: num(0, 1, 'Charge de famille', 'L’envie diminue de cette part pour chaque enfant dont on a déjà la charge.', 'fraction'),
        minWillingness: num(0, 3, 'Envie minimale', 'En dessous de cette envie, personne ne recueille l’enfant.', 'fraction'),
      },
    },
    census: {
      kind: 'object',
      fields: {
        everyDays: int(1, 400, 'Recensement', 'Jours entre deux points de la courbe de population humaine (statistiques).', 'jours'),
      },
    },
    texts: {
      kind: 'object',
      fields: {
        birth: text('Naissance', 'Journal. Remplacements : {mere}, {enfant} (« une fille » / « un garçon »), {nom}, {pere}.'),
        stillbirth: text('Mort-né', 'Journal. Remplacements : {mere}, {pere}.'),
        boy: text('Un garçon', 'Mot pour un garçon dans le texte de naissance.'),
        girl: text('Une fille', 'Mot pour une fille dans le texte de naissance.'),
        fatherDead: text('Père mort', 'Ajouté au père quand il est mort avant la naissance. Remplacement : {pere}.'),
        epidemicStart: text('Épidémie', 'Journal. Remplacements : {maladie}, {lieu}, {malades}, {aggravation}.'),
        epidemicEnd: text('Fin d’épidémie', 'Journal. Remplacements : {maladie}, {morts}, {malades}.'),
        famine: text('Famine', 'Journal. Remplacements : {lieu}, {morts}, {jours}.'),
        adoption: text('Orphelin recueilli', 'Journal. Remplacements : {tuteur}, {enfant}, {e} (« e » pour une fille), {lien}, {parent}.'),
        wetNurse: text('Nourrice', 'Journal : une femme qui allaite prend le bébé d’une morte. Remplacements : {tuteur}, {enfant}, {lien}, {parent}.'),
        inheritance: text('Héritage', 'Journal, un seul héritier. Remplacements : {heritier}, {mort}, {objets}.'),
        inheritanceShared: text('Héritage partagé', 'Journal, plusieurs héritiers (les enfants). Remplacements : {heritier} (« Ka et Lo »), {mort}, {objets}.'),
        weakenedByHunger: text('Affaibli par la faim', 'Fin de phrase d’une mort de maladie ou d’une épidémie. Remplacement : {e}.'),
        weakenedByCold: text('Affaibli par le froid', 'Fin de phrase d’une mort de maladie ou d’une épidémie. Remplacement : {e}.'),
        ties: {
          kind: 'object',
          fields: {
            grandmother: text('Grand-mère', 'Lien du tuteur avec l’orphelin.'),
            grandfather: text('Grand-père', 'Lien du tuteur avec l’orphelin.'),
            aunt: text('Tante', 'Lien du tuteur avec l’orphelin.'),
            uncle: text('Oncle', 'Lien du tuteur avec l’orphelin.'),
            sister: text('Sœur', 'Lien du tuteur avec l’orphelin.'),
            brother: text('Frère', 'Lien du tuteur avec l’orphelin.'),
            father: text('Père', 'Lien du tuteur avec l’orphelin.'),
            mother: text('Mère', 'Lien du tuteur avec l’orphelin.'),
            closeTo: text('Un proche', 'Tuteur sans lien de sang. Remplacement : {parent}.'),
            closeToFemale: text('Une proche', 'Tutrice sans lien de sang. Remplacement : {parent}.'),
          },
        },
      },
    },
  },
};

const FILE = 'data/life.json';

export function parseLifeParams(raw: unknown): LifeParams {
  const params = validateData<LifeParams>(FILE, raw, LIFE_SCHEMA);
  const problems: string[] = [];
  const sorted = (values: number[]): boolean => values.every((value, k) => k === 0 || value >= values[k - 1]!);
  if (!sorted(params.fertility.femaleAges)) problems.push('« fertility.femaleAges » : les quatre âges doivent être croissants.');
  if (!sorted(params.fertility.maleAges)) problems.push('« fertility.maleAges » : les quatre âges doivent être croissants.');
  if (!sorted(params.ageVulnerability.map(([age]) => age))) problems.push('« ageVulnerability » : les âges doivent être croissants.');
  if (params.fertility.hungerFull > params.fertility.hungerNone) problems.push('« fertility.hungerFull » doit être inférieur ou égal à « fertility.hungerNone ».');
  if (params.orphans.minGuardianAge > params.orphans.maxGuardianAge) problems.push('« orphans.minGuardianAge » doit être inférieur ou égal à « orphans.maxGuardianAge ».');
  if (params.stages.carriedUntilAge > params.stages.adultAge) problems.push('« stages.carriedUntilAge » doit être inférieur à « stages.adultAge ».');
  for (const disease of params.diseases) {
    if (disease.durationDays[0] > disease.durationDays[1]) problems.push(`maladie « ${disease.id} » : la durée minimale dépasse la durée maximale.`);
  }
  if (new Set(params.diseases.map((disease) => disease.id)).size !== params.diseases.length) problems.push('deux maladies ont le même « id ».');
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}
