import { DataFileError, validateData, variable, type Schema } from '../../core/data-validation';

/** Inputs an action's score can depend on (all normalized to 0..1). */
export const INPUTS = [
  'hunger',
  'thirst',
  'fatigue',
  'cold',
  'danger',
  'night',
  'day',
  'hasFood',
  'foodCarried',
  'hasBranches',
  'branchesCarried',
  'fireLow',
  'fireLit',
  'awayFromCamp',
  'isolation',
  'always',
] as const;
export type Input = (typeof INPUTS)[number];

/** Built-in behaviours; each data action must name one of them. */
export const ACTIONS = ['drink', 'eat', 'gather', 'collect_wood', 'tend_fire', 'warm_up', 'sleep', 'return_camp', 'flee', 'stay_with_group', 'rest'] as const;
export type ActionId = (typeof ACTIONS)[number];

export interface Consideration {
  input: Input;
  /** linear: a·x + b · power: x^a · logistic: 1 / (1 + e^(−b·(x − a))) */
  curve: 'linear' | 'power' | 'logistic';
  a: number;
  b: number;
}

export interface ActionDef {
  id: ActionId;
  name: string;
  /** Shown in the character sheet ("Va boire"). */
  label: string;
  weight: number;
  /** Input shown as the reason of the action ("soif 72 %"). */
  reason: Input;
  considerations: Consideration[];
  /** Trait id → strength: the score is multiplied by 1 + strength × (2 × trait − 1). */
  traits: Record<string, number>;
  /** Knowledge needed to perform the action. */
  requires?: string;
}

export interface HumanParams {
  tribe: {
    count: number;
    size: number;
    elderShare: number;
    childrenPerCouple: [number, number];
    adultAge: [number, number];
    elderAge: [number, number];
    childAge: [number, number];
    huts: number;
    campRadius: number;
    campSpacingTiles: number;
  };
  site: { candidates: number; minCelsius: number; maxCelsius: number; waterMaxTiles: number; foodRadius: number; minFoodPlants: number };
  names: { syllables: string[]; minSyllables: number; maxSyllables: number };
  knowledge: { id: string; name: string }[];
  startingKnowledge: string[];
  traits: { id: string; name: string }[];
  stepsPerHour: number;
  thinkEveryMinutes: number;
  needs: {
    hungerPerHour: number;
    thirstPerHour: number;
    fatiguePerHour: number;
    restPerHour: number;
    comfortCelsius: number;
    coldPerDegreeHour: number;
    warmingPerHour: number;
    dangerDecayPerHour: number;
    starvationDamagePerHour: number;
    thirstDamagePerHour: number;
    coldDamagePerHour: number;
    regenPerHour: number;
  };
  body: {
    walkTilesPerHour: number;
    fleeSpeedFactor: number;
    childSpeedFactor: number;
    perceptionTiles: number;
    exploreTiles: number;
    carryFood: number;
    carryBranches: number;
    hungerPerFoodUnit: number;
    eatUnitsPerHour: number;
    drinkPerHour: number;
    gatherUnitsPerHour: number;
    branchesPerHour: number;
    branchHarmToPlant: number;
  };
  /** Plant resource id → food value of one unit (1 = normal). */
  edibleResources: Record<string, number>;
  camp: {
    maxFuelHours: number;
    fuelHoursPerBranch: number;
    fireWarmthCelsius: number;
    fireWarmthTiles: number;
    hutWarmthCelsius: number;
    shelterMaxCelsius: number;
    hutCapacity: number;
    homeRadiusTiles: number;
  };
  memory: { waterSlots: number; foodSlots: number; forgetDays: number };
  danger: {
    predators: string[];
    alertTiles: number;
    isolationTiles: number;
    groupFearShare: number;
    corpseMeat: number;
  };
  terrain: { forestCost: number; shrubCost: number; riverCost: number; slopeCostPer100m: number; maxPathNodes: number; heuristicWeight: number };
  decision: { randomness: number; keepCurrentBonus: number };
  actions: ActionDef[];
  deathTexts: { hunger: string; thirst: string; cold: string; predator: string };
  settlementText: string;
}

type Apply = 'live' | 'newWorld';
const v = (kind: 'integer' | 'number', min: number, max: number, label: string, help: string, unit: string, apply: Apply = 'live'): Schema =>
  variable(kind, min, max, { label, help, unit, apply });
const pair = (min: number, max: number, label: string, help: string, unit: string, apply: Apply = 'live'): Schema => ({
  kind: 'array',
  minLength: 2,
  maxLength: 2,
  items: v('number', min, max, label, help, unit, apply),
});
const ID: Schema = { kind: 'string', pattern: /^[a-z_]+$/, patternHint: 'un identifiant en minuscules (a-z, _)' };
const NAMED_LIST: Schema = { kind: 'array', minLength: 1, items: { kind: 'object', fields: { id: ID, name: { kind: 'string' } } } };
const TEXT: Schema = { kind: 'string' };

export const HUMANS_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    tribe: {
      kind: 'object',
      fields: {
        count: v('integer', 1, 500, 'Nombre de tribus', 'Tribus créées au début (1 dans le jeu ; davantage pour les tests de charge).', 'tribus', 'newWorld'),
        size: v('integer', 2, 200, 'Taille de la tribu', 'Nombre de personnes dans chaque tribu de départ.', 'personnes', 'newWorld'),
        elderShare: v('number', 0, 0.5, 'Part d’anciens', 'Part des adultes de la tribu de départ qui sont des anciens.', 'fraction', 'newWorld'),
        childrenPerCouple: pair(0, 10, 'Enfants par couple', 'Nombre d’enfants d’un couple de départ [min, max].', 'enfants', 'newWorld'),
        adultAge: pair(14, 60, 'Âge des adultes', 'Âge des adultes de départ [min, max].', 'ans', 'newWorld'),
        elderAge: pair(40, 90, 'Âge des anciens', 'Âge des anciens de départ [min, max].', 'ans', 'newWorld'),
        childAge: pair(0, 17, 'Âge des enfants', 'Âge des enfants de départ [min, max].', 'ans', 'newWorld'),
        huts: v('integer', 0, 50, 'Huttes de départ', 'Huttes déjà construites dans le camp de départ.', 'huttes', 'newWorld'),
        campRadius: v('integer', 1, 10, 'Rayon du camp', 'Distance maximale entre le feu et les huttes.', 'tuiles', 'newWorld'),
        campSpacingTiles: v('integer', 5, 300, 'Écart entre camps', 'Distance minimale entre deux camps de départ (tests de charge).', 'tuiles', 'newWorld'),
      },
    },
    site: {
      kind: 'object',
      fields: {
        candidates: v('integer', 100, 100000, 'Lieux examinés', 'Nombre de lieux tirés au hasard parmi lesquels on choisit le meilleur emplacement de camp.', 'lieux', 'newWorld'),
        minCelsius: v('number', -20, 30, 'Température minimale du site', 'Température moyenne annuelle minimale d’un emplacement de camp.', '°C', 'newWorld'),
        maxCelsius: v('number', -10, 40, 'Température maximale du site', 'Température moyenne annuelle maximale d’un emplacement de camp.', '°C', 'newWorld'),
        waterMaxTiles: v('integer', 1, 30, 'Distance de l’eau', 'Distance maximale entre le camp et l’eau douce.', 'tuiles', 'newWorld'),
        foodRadius: v('integer', 2, 40, 'Rayon de cueillette', 'Rayon dans lequel on compte les plantes nourricières autour du site.', 'tuiles', 'newWorld'),
        minFoodPlants: v('integer', 0, 500, 'Plantes nourricières', 'Nombre minimal de plantes nourricières autour du site.', 'plantes', 'newWorld'),
      },
    },
    names: {
      kind: 'object',
      fields: {
        syllables: { kind: 'array', minLength: 4, items: { kind: 'string' } },
        minSyllables: v('integer', 1, 5, 'Syllabes minimum', 'Nombre minimal de syllabes d’un nom.', 'syllabes', 'newWorld'),
        maxSyllables: v('integer', 1, 6, 'Syllabes maximum', 'Nombre maximal de syllabes d’un nom.', 'syllabes', 'newWorld'),
      },
    },
    knowledge: NAMED_LIST,
    startingKnowledge: { kind: 'array', items: ID },
    traits: NAMED_LIST,
    stepsPerHour: v('integer', 1, 12, 'Pas par heure', 'Nombre de fois par heure de jeu où chaque humain agit.', 'pas', 'newWorld'),
    thinkEveryMinutes: v('integer', 10, 600, 'Réflexion', 'Sans raison particulière, un humain remet sa décision en question au plus une fois tous ces minutes.', 'minutes de jeu'),
    needs: {
      kind: 'object',
      fields: {
        hungerPerHour: v('number', 0, 20, 'Faim', 'Points de faim gagnés par heure (100 = affamé).', 'points/heure'),
        thirstPerHour: v('number', 0, 30, 'Soif', 'Points de soif gagnés par heure (100 = assoiffé).', 'points/heure'),
        fatiguePerHour: v('number', 0, 20, 'Fatigue', 'Points de fatigue gagnés par heure d’éveil.', 'points/heure'),
        restPerHour: v('number', 0, 50, 'Récupération', 'Points de fatigue perdus par heure de sommeil.', 'points/heure'),
        comfortCelsius: v('number', -10, 30, 'Température de confort', 'En dessous de cette température ressentie, on a de plus en plus froid.', '°C'),
        coldPerDegreeHour: v('number', 0, 5, 'Refroidissement', 'Points de froid gagnés par heure et par degré sous la température de confort.', 'points/(°C·heure)'),
        warmingPerHour: v('number', 0, 100, 'Réchauffement', 'Points de froid perdus par heure quand on est au chaud.', 'points/heure'),
        dangerDecayPerHour: v('number', 0, 200, 'Apaisement', 'Points de danger perdus par heure quand aucun prédateur n’est en vue.', 'points/heure'),
        starvationDamagePerHour: v('number', 0, 20, 'Dégâts de la faim', 'Santé perdue par heure quand la faim est à 100.', 'points/heure'),
        thirstDamagePerHour: v('number', 0, 20, 'Dégâts de la soif', 'Santé perdue par heure quand la soif est à 100.', 'points/heure'),
        coldDamagePerHour: v('number', 0, 20, 'Dégâts du froid', 'Santé perdue par heure quand le froid est à 100.', 'points/heure'),
        regenPerHour: v('number', 0, 20, 'Guérison', 'Santé regagnée par heure quand aucun besoin n’est critique.', 'points/heure'),
      },
    },
    body: {
      kind: 'object',
      fields: {
        walkTilesPerHour: v('number', 0.5, 20, 'Vitesse de marche', 'Tuiles parcourues par heure sur terrain plat, par beau temps.', 'tuiles/heure'),
        fleeSpeedFactor: v('number', 1, 3, 'Course', 'Facteur de vitesse quand on fuit.', 'facteur'),
        childSpeedFactor: v('number', 0.1, 1, 'Vitesse des enfants', 'Facteur de vitesse des enfants.', 'facteur'),
        perceptionTiles: v('integer', 2, 40, 'Perception', 'Distance à laquelle on repère eau, plantes et prédateurs.', 'tuiles'),
        exploreTiles: v('integer', 2, 100, 'Exploration', 'Distance à laquelle on part chercher quand rien n’est en vue ni en mémoire.', 'tuiles'),
        carryFood: v('number', 1, 100, 'Nourriture portée', 'Unités de nourriture qu’on peut porter.', 'unités'),
        carryBranches: v('number', 1, 100, 'Branches portées', 'Branches qu’on peut porter.', 'branches'),
        hungerPerFoodUnit: v('number', 0.5, 50, 'Valeur nutritive', 'Points de faim apaisés par une unité de nourriture.', 'points/unité'),
        eatUnitsPerHour: v('number', 1, 100, 'Vitesse du repas', 'Unités de nourriture mangées par heure.', 'unités/heure'),
        drinkPerHour: v('number', 10, 1000, 'Vitesse pour boire', 'Points de soif apaisés par heure en buvant.', 'points/heure'),
        gatherUnitsPerHour: v('number', 0.5, 50, 'Vitesse de cueillette', 'Unités récoltées par heure sur une plante.', 'unités/heure'),
        branchesPerHour: v('number', 0.5, 50, 'Ramassage du bois', 'Branches ramassées par heure.', 'branches/heure'),
        branchHarmToPlant: v('number', 0, 1, 'Dégâts aux arbres', 'Santé perdue par une plante pour chaque branche prise.', 'fraction/branche'),
      },
    },
    edibleResources: {
      kind: 'record',
      values: v('number', 0, 5, 'Valeur d’une ressource comestible', 'Valeur nutritive relative d’une unité de cette ressource.', 'facteur'),
    },
    camp: {
      kind: 'object',
      fields: {
        maxFuelHours: v('number', 1, 200, 'Réserve du feu', 'Heures de combustion au maximum dans le foyer.', 'heures'),
        fuelHoursPerBranch: v('number', 0.1, 20, 'Valeur d’une branche', 'Heures de feu apportées par une branche.', 'heures/branche'),
        fireWarmthCelsius: v('number', 0, 40, 'Chaleur du feu', 'Degrés ressentis en plus près d’un feu allumé.', '°C'),
        fireWarmthTiles: v('integer', 1, 10, 'Portée du feu', 'Distance jusqu’à laquelle le feu réchauffe.', 'tuiles'),
        hutWarmthCelsius: v('number', 0, 30, 'Abri de la hutte', 'Degrés ressentis en plus à l’intérieur d’une hutte.', '°C'),
        shelterMaxCelsius: v('number', 0, 40, 'Chaleur d’un abri', 'Un feu ou une hutte réchauffe jusqu’à cette température ressentie, pas au-delà.', '°C'),
        hutCapacity: v('integer', 1, 20, 'Places par hutte', 'Nombre de dormeurs par hutte.', 'personnes'),
        homeRadiusTiles: v('integer', 10, 200, 'Territoire du camp', 'Distance jusqu’à laquelle le chemin du retour au camp est connu.', 'tuiles', 'newWorld'),
      },
    },
    memory: {
      kind: 'object',
      fields: {
        waterSlots: v('integer', 0, 16, 'Points d’eau retenus', 'Nombre de points d’eau qu’une personne garde en mémoire.', 'lieux', 'newWorld'),
        foodSlots: v('integer', 0, 32, 'Coins de cueillette retenus', 'Nombre d’endroits nourriciers qu’une personne garde en mémoire.', 'lieux', 'newWorld'),
        forgetDays: v('integer', 1, 400, 'Oubli', 'Un souvenir d’endroit non revisité s’efface après ce nombre de jours.', 'jours'),
      },
    },
    danger: {
      kind: 'object',
      fields: {
        predators: { kind: 'array', items: ID },
        alertTiles: v('integer', 1, 30, 'Vigilance', 'Distance à laquelle on repère un prédateur.', 'tuiles'),
        isolationTiles: v('integer', 1, 30, 'Isolement', 'Une personne sans personne d’autre à cette distance est isolée (et vulnérable).', 'tuiles'),
        groupFearShare: v('number', 0, 1, 'Peur en groupe', 'Part de la peur ressentie face à un prédateur quand on n’est pas seul.', 'fraction'),
        corpseMeat: v('number', 0, 200, 'Dépouille', 'Viande laissée pour les charognards par un humain tué.', 'unités'),
      },
    },
    terrain: {
      kind: 'object',
      fields: {
        forestCost: v('number', 1, 10, 'Forêt', 'Coût de marche d’une tuile avec un arbre (1 = terrain dégagé).', 'facteur'),
        shrubCost: v('number', 1, 10, 'Broussailles', 'Coût de marche d’une tuile avec un arbuste.', 'facteur'),
        riverCost: v('number', 1, 20, 'Gué', 'Coût de traversée d’une rivière à gué.', 'facteur'),
        slopeCostPer100m: v('number', 0, 10, 'Pente', 'Coût ajouté par 100 m de dénivelé entre deux tuiles.', 'coût/100 m'),
        maxPathNodes: v('integer', 500, 1000000, 'Recherche de chemin', 'Tuiles examinées au plus pour trouver un chemin (au-delà, on avance au jugé).', 'tuiles'),
        heuristicWeight: v('number', 1, 5, 'Hâte du calcul de chemin', 'Au-dessus de 1, les chemins sont trouvés plus vite mais sont un peu moins courts.', 'facteur'),
      },
    },
    decision: {
      kind: 'object',
      fields: {
        randomness: v('number', 0, 1, 'Part de hasard', 'Écart aléatoire ajouté aux scores des actions.', 'fraction'),
        keepCurrentBonus: v('number', 0, 1, 'Persévérance', 'Bonus de score de l’action en cours (évite de changer d’avis sans arrêt).', 'fraction'),
      },
    },
    actions: {
      kind: 'array',
      minLength: 1,
      items: {
        kind: 'object',
        fields: {
          id: { kind: 'enum', values: ACTIONS },
          name: TEXT,
          label: TEXT,
          weight: v('number', 0, 10, 'Poids de l’action', 'Importance de base de l’action dans le choix.', 'facteur'),
          reason: { kind: 'enum', values: INPUTS },
          considerations: {
            kind: 'array',
            minLength: 1,
            items: {
              kind: 'object',
              fields: {
                input: { kind: 'enum', values: INPUTS },
                curve: { kind: 'enum', values: ['linear', 'power', 'logistic'] },
                a: v('number', -100, 100, 'Paramètre a', 'Pente (linéaire), exposant (puissance) ou point milieu (logistique).', 'sans unité'),
                b: v('number', -100, 100, 'Paramètre b', 'Décalage (linéaire) ou raideur (logistique).', 'sans unité'),
              },
            },
          },
          traits: { kind: 'record', values: v('number', -2, 2, 'Influence d’un trait', 'Effet d’un trait de caractère sur le score de l’action.', 'facteur') },
          requires: ID,
        },
        optional: ['requires'],
      },
    },
    deathTexts: { kind: 'object', fields: { hunger: TEXT, thirst: TEXT, cold: TEXT, predator: TEXT } },
    settlementText: TEXT,
  },
};

const FILE = 'data/humans.json';

export function parseHumanParams(raw: unknown, plantResources: readonly string[], animalIds: readonly string[]): HumanParams {
  const params = validateData<HumanParams>(FILE, raw, HUMANS_SCHEMA);
  const problems: string[] = [];
  const knowledge = new Set(params.knowledge.map((item) => item.id));
  const traits = new Set(params.traits.map((item) => item.id));
  for (const id of params.startingKnowledge) if (!knowledge.has(id)) problems.push(`« startingKnowledge » : le savoir « ${id} » n'existe pas.`);
  for (const id of Object.keys(params.edibleResources)) {
    if (!plantResources.includes(id)) problems.push(`« edibleResources » : aucune plante ne produit « ${id} ».`);
  }
  for (const id of params.danger.predators) if (!animalIds.includes(id)) problems.push(`« danger.predators » : l'animal « ${id} » n'existe pas.`);
  for (const action of params.actions) {
    for (const id of Object.keys(action.traits)) if (!traits.has(id)) problems.push(`action « ${action.id} » : le trait « ${id} » n'existe pas.`);
    if (action.requires && !knowledge.has(action.requires)) problems.push(`action « ${action.id} » : le savoir « ${action.requires} » n'existe pas.`);
  }
  if (params.names.minSyllables > params.names.maxSyllables) problems.push('« names.minSyllables » doit être inférieur ou égal à « names.maxSyllables ».');
  if (params.site.minCelsius > params.site.maxCelsius) problems.push('« site.minCelsius » doit être inférieur ou égal à « site.maxCelsius ».');
  if (new Set(params.actions.map((action) => action.id)).size !== params.actions.length) problems.push('deux actions ont le même « id ».');
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}
