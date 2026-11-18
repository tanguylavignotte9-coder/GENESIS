import { choice, flag, identifier, int, num, text, validateData, DataFileError, type Schema } from '../../core/data-validation';

/** Families of items (for the display and a few rules: food is eaten, clothing is worn). */
export const ITEM_CATEGORIES = ['food', 'material', 'tool', 'clothing'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export interface ItemDef {
  id: string;
  name: string;
  /** Grammatical gender of the name (for the journal: « une lance », « un panier »). */
  feminine: boolean;
  category: ItemCategory;
  /** Room taken in a person's load or in a store, per unit. */
  bulk: number;
  /** Food value of one unit (0 = not edible). */
  food: number;
  /** Days for half a pile to spoil at the reference temperature (0 = never spoils). */
  halfLifeDays: number;
  /** Degrees of warmth felt when wearing it (clothing). */
  warmthCelsius: number;
  /** Extra load a person can carry with it (basket). */
  carryBonus: number;
  /** Hours of fire one unit gives. */
  fuelHours: number;
  /** Custom: how many the camp wants per member (0 = none); a shortfall is a collective need. */
  wantPerMember: number;
}

/** Where a harvest takes place. */
export const SOURCE_KINDS = ['plantProduce', 'plantBranches', 'tree', 'terrain', 'prey', 'fish', 'field', 'livestock'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const RECIPE_EFFECTS = ['none', 'fuel', 'sow'] as const;
export type RecipeEffect = (typeof RECIPE_EFFECTS)[number];

/** `qty` units of any one of `items`. */
export interface Ingredient {
  items: string[];
  qty: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  /** What the worker does, for the map and the character sheet ("Taille un couteau de pierre"). */
  label: string;
  knowledge?: string;
  skill?: string;
  /** Hours of work for one batch (a harvest batch is one unit). */
  hours: number;
  /** Special effect on the station instead of (or besides) outputs: feed a fire, sow a field. */
  effect: RecipeEffect;
  /** A harvest takes from the world; without a source, the recipe transforms inputs. */
  source?: { kind: SourceKind; species: string[] };
  /** Building needed (a lit fire, a smokehouse…). */
  station?: string;
  inputs: Ingredient[];
  /** Any one of these items is needed as a tool (not consumed). */
  tools: string[];
  /** For a harvest: the items it can give (the source decides which one). */
  outputs: { item: string; qty: number }[];
}

export const BUILDING_FUNCTIONS = ['fire', 'shelter', 'storage', 'workshop', 'field', 'pen', 'irrigation', 'defense', 'monument', 'worship'] as const;
export type BuildingFunction = (typeof BUILDING_FUNCTIONS)[number];

/** Why a camp wants a building (custom): one of the collective needs, or never for now. */
export const BUILDING_WANTS = ['fire', 'shelter', 'storage', 'station', 'perMember', 'none'] as const;
export type BuildingWant = (typeof BUILDING_WANTS)[number];

export interface BuildingDef {
  id: string;
  name: string;
  feminine: boolean;
  function: BuildingFunction;
  /** Any one of these knowledge is needed (empty = none). */
  knowledge: string[];
  materials: Ingredient[];
  workHours: number;
  want: BuildingWant;
  wantPerMember: number;
  sleeps: number;
  warmthCelsius: number;
  warmthTiles: number;
  fuelMaxHours: number;
  storage: number;
  spoilFactor: number;
  requiresReligion: boolean;
  description: string;
}

export interface TerrainSource {
  item: string;
  river: boolean;
  lakeShore: boolean;
  biomes: string[];
  minElevation: number;
}

export interface ProductionParams {
  startingBuildings: { building: string; count: number }[];
  stock: { openPileSpoilFactor: number; minQuantity: number };
  spoilage: { referenceCelsius: number; doublingCelsius: number; minFactor: number; maxFactor: number };
  custom: {
    foodReserveDaysBySeason: number[];
    firewoodReserveHours: number;
    storageFullShare: number;
    urgency: { fire: number; shelter: number; openSite: number; storage: number; station: number; perMember: number; craft: number };
  };
  quality: { base: number; skillWeight: number; toolWeight: number; randomness: number };
  work: { skillSpeedBonus: number; branchHarmToPlant: number; keepingPreference: number; keepingDays: number; searchTiles: number; campTiles: number; buildRingMin: number; buildRingMax: number };
  hunting: {
    searchTiles: number;
    strikeTiles: number;
    rangedTools: string[];
    rangedStrikeTiles: number;
    successChance: number;
    skillBonus: number;
    meatPerCarcass: number;
    giveUpHours: number;
  };
  crop: { growthDays: number; minCelsius: number; grainPerSeed: number; strawPerSeed: number };
  terrainSources: TerrainSource[];
  texts: {
    siteStarted: string;
    buildingDone: string;
    firstItem: string;
    reasons: { shelter: string; storage: string; fire: string; station: string; perMember: string };
  };
}

const ID = { pattern: /^[a-z_]+$/, hint: 'un identifiant en minuscules (a-z, _)' };
const idText = (label: string, help: string): Schema => text(label, help, 'live', ID);
const idList = (label: string, help: string): Schema => ({ kind: 'array', items: idText(label, help) });
const ingredients = (what: string): Schema => ({
  kind: 'array',
  items: {
    kind: 'object',
    fields: {
      items: { kind: 'array', minLength: 1, items: idText('Objet', `Objet accepté (${what}) ; si plusieurs sont listés, l’un d’eux suffit.`) },
      qty: num(0.1, 500, 'Quantité', `Quantité nécessaire (${what}).`, 'unités'),
    },
  },
});

export const ITEMS_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    items: {
      kind: 'array',
      minLength: 1,
      items: {
        kind: 'object',
        fields: {
          id: identifier('Identifiant', 'Nom technique de l’objet (les ressources des plantes et des animaux portent le même).'),
          name: text('Nom', 'Nom affiché de l’objet.', 'newWorld'),
          feminine: flag('Nom féminin', 'Le nom est féminin (« une lance ») : sert aux phrases du journal.'),
          category: choice(ITEM_CATEGORIES, 'Catégorie', 'food : nourriture · material : matériau · tool : outil ou récipient · clothing : vêtement.'),
          bulk: num(0.05, 50, 'Encombrement', 'Place prise par une unité dans la charge d’une personne ou dans un stock.', 'charge/unité'),
          food: num(0, 5, 'Valeur nutritive', 'Valeur d’une unité comme nourriture (0 = non comestible ; 1 = une poignée de baies).', 'facteur'),
          halfLifeDays: num(0, 1000, 'Conservation', 'Jours pour que la moitié d’une pile se gâte à la température de référence (0 = ne se gâte pas). Le froid ralentit, la chaleur accélère.', 'jours'),
          warmthCelsius: num(0, 30, 'Chaleur du vêtement', 'Degrés ressentis en plus quand on le porte.', '°C'),
          carryBonus: num(0, 50, 'Aide au transport', 'Charge supplémentaire qu’on peut porter avec cet objet (panier).', 'charge'),
          fuelHours: num(0, 50, 'Combustible', 'Heures de feu que donne une unité (0 = ne brûle pas).', 'heures/unité'),
          wantPerMember: num(0, 20, 'Besoin coutumier', 'Nombre d’unités que le camp veut avoir par membre ; en dessous, fabriquer devient un besoin collectif (0 = aucun).', 'unités/personne'),
        },
      },
    },
  },
};

export const RECIPES_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    recipes: {
      kind: 'array',
      minLength: 1,
      items: {
        kind: 'object',
        fields: {
          id: identifier('Identifiant', 'Nom technique de la recette.'),
          name: text('Nom', 'Nom de la recette.', 'newWorld'),
          label: text('Libellé', 'Ce que fait la personne (« Taille un couteau de pierre »), affiché dans sa fiche.'),
          knowledge: idText('Savoir requis', 'Savoir qu’il faut connaître pour utiliser la recette.'),
          skill: idText('Compétence', 'Compétence utilisée : elle rend le travail plus rapide et le produit meilleur, et progresse avec la pratique.'),
          hours: num(0.01, 200, 'Durée', 'Heures de travail pour une fournée (pour une récolte : par unité récoltée), pour une personne sans compétence.', 'heures'),
          effect: choice(RECIPE_EFFECTS, 'Effet', 'none : produit des objets · fuel : alimente un feu · sow : ensemence un champ.'),
          source: {
            kind: 'object',
            fields: {
              kind: choice(SOURCE_KINDS, 'Source', 'Où l’on récolte : plantes, branches, arbres, terrain (pierres, argile, eau), gibier, poisson, champ mûr, bêtes d’élevage.'),
              species: idList('Espèce', 'Espèces animales concernées (gibier).'),
            },
          },
          station: idText('Lieu ou atelier', 'Bâtiment nécessaire (feu de camp, fumoir, four…).'),
          inputs: ingredients('entrée consommée'),
          tools: idList('Outil', 'Outil nécessaire (non consommé) ; si plusieurs sont listés, l’un d’eux suffit.'),
          outputs: {
            kind: 'array',
            items: {
              kind: 'object',
              fields: {
                item: idText('Produit', 'Objet produit (pour une récolte : l’un des objets que la source peut donner).'),
                qty: num(0.01, 500, 'Quantité produite', 'Quantité produite par fournée.', 'unités'),
              },
            },
          },
        },
        optional: ['knowledge', 'skill', 'source', 'station'],
      },
    },
  },
};

export const BUILDINGS_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    buildings: {
      kind: 'array',
      minLength: 1,
      items: {
        kind: 'object',
        fields: {
          id: identifier('Identifiant', 'Nom technique du bâtiment.'),
          name: text('Nom', 'Nom affiché du bâtiment.', 'newWorld'),
          feminine: flag('Nom féminin', 'Le nom est féminin (« une hutte ») : sert aux phrases du journal.'),
          function: choice(BUILDING_FUNCTIONS, 'Fonction', 'fire : feu · shelter : abri pour dormir · storage : stock · workshop : atelier · field : champ · pen : enclos · irrigation · defense · monument · worship : culte.'),
          knowledge: idList('Savoir requis', 'L’un de ces savoirs suffit pour construire (liste vide : aucun).'),
          materials: ingredients('matériau de construction'),
          workHours: num(0.5, 1000, 'Travail', 'Heures de travail nécessaires une fois les matériaux apportés (plusieurs personnes peuvent travailler ensemble).', 'heures'),
          want: choice(BUILDING_WANTS, 'Besoin coutumier', 'Quand le camp le veut : fire (pas de feu), shelter (pas assez de places pour dormir), storage (stock à protéger), station (atelier d’une recette voulue), perMember (un pour tant de membres), none (jamais pour l’instant).'),
          wantPerMember: num(0, 5, 'Nombre par membre', 'Pour « perMember » : nombre voulu par membre du camp.', 'bâtiments/personne'),
          sleeps: int(0, 50, 'Places pour dormir', 'Personnes qui peuvent y dormir.', 'personnes'),
          warmthCelsius: num(0, 40, 'Chaleur', 'Degrés ressentis en plus (dans l’abri pour un abri, autour pour un feu allumé).', '°C'),
          warmthTiles: int(0, 10, 'Portée de la chaleur', 'Distance jusqu’à laquelle un feu réchauffe.', 'tuiles'),
          fuelMaxHours: num(0, 500, 'Réserve de combustible', 'Heures de combustion au maximum (feu).', 'heures'),
          storage: num(0, 10000, 'Capacité de stockage', 'Encombrement total protégé par ce bâtiment.', 'charge'),
          spoilFactor: num(0.05, 3, 'Conservation au stock', 'Vitesse à laquelle les aliments se gâtent dans ce stock (1 = à l’air libre ordinaire).', 'facteur'),
          requiresReligion: flag('Exige une religion', 'Ne peut être bâti que par un groupe qui partage une religion (système d’idées, plus tard).'),
          description: text('Description', 'Fonction et capacité, pour la fiche du bâtiment.'),
        },
      },
    },
  },
};

const urgency = (what: string): Schema =>
  num(0, 1, `Urgence : ${what.split(' (')[0]}`, `Force du besoin collectif quand ${what} ; chacun décide d’y répondre selon son caractère.`, 'fraction');
const SPOIL_DAYS_HELP = 'Jours de nourriture pour tout le camp que la coutume veut garder en réserve pendant cette saison (locale).';

export const PRODUCTION_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    startingBuildings: {
      kind: 'array',
      items: {
        kind: 'object',
        fields: {
          building: text('Bâtiment de départ', 'Bâtiment déjà construit dans le camp de la tribu de départ.', 'newWorld', ID),
          count: int(0, 50, 'Nombre', 'Nombre de bâtiments de ce type au départ.', 'bâtiments', 'newWorld'),
        },
      },
    },
    stock: {
      kind: 'object',
      fields: {
        openPileSpoilFactor: num(0.1, 5, 'Tas à l’air libre', 'Vitesse à laquelle se gâte ce qui dépasse la capacité des caches (bêtes, pluie).', 'facteur'),
        minQuantity: num(0, 1, 'Restes', 'Une pile plus petite que ceci disparaît.', 'unités'),
      },
    },
    spoilage: {
      kind: 'object',
      fields: {
        referenceCelsius: num(-20, 40, 'Température de référence', 'Température à laquelle les durées de conservation des objets s’appliquent telles quelles.', '°C'),
        doublingCelsius: num(1, 50, 'Effet de la chaleur', 'Chaque fois que la température monte de ceci, les aliments se gâtent deux fois plus vite.', '°C'),
        minFactor: num(0, 1, 'Froid maximal', 'Vitesse minimale de dégradation (grand froid).', 'facteur'),
        maxFactor: num(1, 20, 'Chaleur maximale', 'Vitesse maximale de dégradation (grande chaleur).', 'facteur'),
      },
    },
    custom: {
      kind: 'object',
      fields: {
        foodReserveDaysBySeason: { kind: 'array', minLength: 1, items: num(0, 60, 'Réserve de nourriture', SPOIL_DAYS_HELP, 'jours') },
        firewoodReserveHours: num(0, 500, 'Réserve de bois', 'Heures de feu que la coutume veut garder en bois au stock.', 'heures'),
        storageFullShare: num(0.1, 1, 'Stock à l’étroit', 'Part de la capacité des caches au-delà de laquelle on veut un stockage de plus.', 'fraction'),
        urgency: {
          kind: 'object',
          fields: {
            fire: urgency('pas de feu au camp'),
            shelter: urgency('tout le monde sans abri (proportionnel à la part de personnes sans place)'),
            openSite: urgency('un chantier commencé à finir'),
            storage: urgency('des provisions sans cache'),
            station: urgency('un atelier qui manque pour une recette voulue'),
            perMember: urgency('un bâtiment voulu par la coutume (champ…)'),
            craft: urgency('il manque tous les objets voulus par la coutume (proportionnel au manque)'),
          },
        },
      },
    },
    quality: {
      kind: 'object',
      fields: {
        base: num(0, 1, 'Qualité de base', 'Qualité d’un produit fait par un débutant avec de mauvais outils.', 'fraction'),
        skillWeight: num(0, 1, 'Effet de la compétence', 'Qualité ajoutée par une compétence parfaite.', 'fraction'),
        toolWeight: num(0, 1, 'Effet des outils', 'Qualité ajoutée par un outil parfait.', 'fraction'),
        randomness: num(0, 0.5, 'Part de hasard', 'Écart aléatoire de la qualité (±).', 'fraction'),
      },
    },
    work: {
      kind: 'object',
      fields: {
        skillSpeedBonus: num(0, 5, 'Rapidité des experts', 'Une compétence parfaite fait travailler (1 + ceci) fois plus vite.', 'facteur'),
        branchHarmToPlant: num(0, 1, 'Dégâts aux arbres', 'Santé perdue par une plante pour chaque branche prise.', 'fraction/branche'),
        keepingPreference: num(0, 5, 'Goût pour ce qui se garde', 'Quand on cueille pour le camp, une nourriture qui se conserve bien vaut jusqu’à (1 + ceci) fois plus qu’une qui pourrit vite.', 'facteur'),
        keepingDays: num(1, 365, 'Bonne conservation', 'Durée de conservation (demi-vie) à partir de laquelle une nourriture compte comme « se garde bien ».', 'jours'),
        searchTiles: int(5, 100, 'Recherche de matériaux', 'Distance jusqu’à laquelle on cherche pierres, argile ou arbres autour de soi.', 'tuiles'),
        campTiles: int(1, 20, 'Abords du camp', 'Distance au feu en deçà de laquelle on est « au camp » (pour déposer, fabriquer).', 'tuiles'),
        buildRingMin: int(1, 10, 'Distance minimale des constructions', 'Distance minimale entre le feu et un nouveau bâtiment.', 'tuiles'),
        buildRingMax: int(2, 30, 'Distance maximale des constructions', 'Distance maximale entre le feu et un nouveau bâtiment.', 'tuiles'),
      },
    },
    hunting: {
      kind: 'object',
      fields: {
        searchTiles: int(2, 60, 'Repérage du gibier', 'Distance à laquelle un chasseur repère une proie.', 'tuiles'),
        strikeTiles: int(1, 5, 'Portée de la lance', 'Distance à laquelle on peut frapper une proie à la lance.', 'tuiles'),
        rangedTools: idList('Arme de jet', 'Outils qui permettent de tirer de loin.'),
        rangedStrikeTiles: int(1, 15, 'Portée de l’arc', 'Distance de tir avec une arme de jet.', 'tuiles'),
        successChance: num(0, 1, 'Réussite d’un coup', 'Chance qu’un débutant tue sa proie à chaque tentative (une par heure de traque à portée).', 'probabilité'),
        skillBonus: num(0, 1, 'Effet de l’expérience', 'Chance de réussite ajoutée par une compétence de chasse parfaite.', 'probabilité'),
        meatPerCarcass: num(1, 100, 'Taille d’une carcasse', 'Viande d’animal par unité de carcasse rapportée (un cerf de 30 donne 3 carcasses).', 'unités'),
        giveUpHours: num(0.5, 48, 'Patience', 'Heures de traque sans succès avant d’abandonner.', 'heures'),
      },
    },
    crop: {
      kind: 'object',
      fields: {
        growthDays: num(1, 60, 'Croissance', 'Jours de temps doux nécessaires pour qu’un champ semé soit mûr.', 'jours'),
        minCelsius: num(-10, 30, 'Température de pousse', 'En dessous de cette température, les céréales semées ne poussent pas.', '°C'),
        grainPerSeed: num(0, 50, 'Rendement', 'Céréales récoltées par unité semée.', 'unités'),
        strawPerSeed: num(0, 50, 'Paille', 'Paille récoltée par unité semée.', 'unités'),
      },
    },
    terrainSources: {
      kind: 'array',
      items: {
        kind: 'object',
        fields: {
          item: idText('Objet', 'Objet que le terrain fournit.'),
          river: flag('Dans les rivières', 'On en trouve dans le lit des rivières.'),
          lakeShore: flag('Au bord des lacs', 'On en trouve au bord des lacs.'),
          biomes: idList('Biome', 'Biome où l’on en trouve partout.'),
          minElevation: num(0, 99999, 'Altitude', 'On en trouve partout au-dessus de cette altitude.', 'm'),
        },
      },
    },
    texts: {
      kind: 'object',
      fields: {
        siteStarted: text('Chantier commencé', 'Phrase du journal. Remplacements : {nom}, {un_batiment}, {raison}.'),
        buildingDone: text('Construction terminée', 'Phrase du journal. Remplacements : {le_batiment}, {e}, {lieu}, {noms}.'),
        firstItem: text('Premier objet', 'Phrase du journal quand la tribu fabrique pour la première fois un objet. Remplacements : {nom}, {un_objet}.'),
        reasons: {
          kind: 'object',
          fields: {
            shelter: text('Raison : abri', 'Raison d’un chantier d’abri.'),
            storage: text('Raison : stockage', 'Raison d’un chantier de stockage.'),
            fire: text('Raison : feu', 'Raison d’un chantier de feu de camp.'),
            station: text('Raison : atelier', 'Raison d’un chantier d’atelier. Remplacement : {recette}.'),
            perMember: text('Raison : coutume', 'Raison d’un chantier voulu par la coutume. Remplacement : {n}.'),
          },
        },
      },
    },
  },
};

/** Parsed data files keep the shape of the files (the variables workshop edits them by path). */
export interface ItemCatalog {
  items: ItemDef[];
}
export interface RecipeBook {
  recipes: RecipeDef[];
}
export interface BuildingCatalog {
  buildings: BuildingDef[];
}

export function parseItems(raw: unknown): ItemCatalog {
  const file = 'data/items.json';
  const catalog = validateData<ItemCatalog>(file, raw, ITEMS_SCHEMA);
  if (new Set(catalog.items.map((item) => item.id)).size !== catalog.items.length) throw new DataFileError(file, ['deux objets ont le même « id ».']);
  return catalog;
}

export function parseRecipes(raw: unknown): RecipeBook {
  const file = 'data/recipes.json';
  const book = validateData<RecipeBook>(file, raw, RECIPES_SCHEMA);
  const { recipes } = book;
  const problems: string[] = [];
  if (new Set(recipes.map((recipe) => recipe.id)).size !== recipes.length) problems.push('deux recettes ont le même « id ».');
  for (const recipe of recipes) {
    if (!recipe.source && recipe.outputs.length === 0 && recipe.effect === 'none') problems.push(`recette « ${recipe.id} » : elle ne produit rien.`);
    if (recipe.source && recipe.outputs.length === 0) problems.push(`recette « ${recipe.id} » : une récolte doit indiquer ce qu'elle peut donner (« outputs »).`);
    if (recipe.effect !== 'none' && !recipe.station) problems.push(`recette « ${recipe.id} » : l'effet « ${recipe.effect} » exige un lieu (« station »).`);
  }
  if (problems.length > 0) throw new DataFileError(file, problems);
  return book;
}

export function parseBuildings(raw: unknown): BuildingCatalog {
  const file = 'data/buildings.json';
  const catalog = validateData<BuildingCatalog>(file, raw, BUILDINGS_SCHEMA);
  const ids = catalog.buildings.map((building) => building.id);
  if (new Set(ids).size !== ids.length) throw new DataFileError(file, ['deux bâtiments ont le même « id ».']);
  return catalog;
}

export function parseProductionParams(raw: unknown): ProductionParams {
  const file = 'data/production.json';
  const params = validateData<ProductionParams>(file, raw, PRODUCTION_SCHEMA);
  if (params.work.buildRingMin > params.work.buildRingMax) throw new DataFileError(file, ['« work.buildRingMin » doit être inférieur ou égal à « work.buildRingMax ».']);
  return params;
}
