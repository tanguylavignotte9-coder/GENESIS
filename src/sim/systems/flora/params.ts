import { choice, color, DataFileError, identifier, int, num, pair, text, validateData, type Schema } from '../../core/data-validation';
import { unknownResources, type ResourceCatalog } from '../../core/resources';
import type { BiomeTable } from '../world/biomes';

export type PlantKind = 'tree' | 'shrub' | 'herb';

export interface ResourceAmount {
  resource: string;
  amount: number;
}

/** Seasonal harvest (berries, cereals…), available between two days of the LOCAL year. */
export interface Produce {
  resource: string;
  /** First day (0-based, local calendar: seasons are shifted by half a year in the south). */
  fromDay: number;
  /** Day after the last one. */
  toDay: number;
  /** Amount on a healthy mature plant. */
  amount: number;
}

export interface PlantSpecies {
  id: string;
  name: string;
  kind: PlantKind;
  color: string;
  /** Display only: how the plant is drawn, and an optional accent color (berries, flowers, birch bark). */
  shape: 'round' | 'conifer' | 'umbrella' | 'bush' | 'grass';
  accentColor?: string;
  /** Relative frequency when the map is first populated. */
  abundance: number;
  /** Comfortable range of the ANNUAL MEAN temperature (°C) and humidity (0..1). */
  temperature: [number, number];
  humidity: [number, number];
  /** Below this temperature right now, the plant suffers from frost. */
  frostCelsius: number;
  /** Below this humidity right now, the plant suffers from drought. */
  droughtHumidity: number;
  maxAgeYears: number;
  maturityYears: number;
  growthYears: number;
  seedsPerYear: number;
  seedRadius: number;
  germinationChance: number;
  /** 0..1: how well its seedlings bear the shade of a closed canopy (1 = not at all bothered). */
  shadeTolerance?: number;
  produce?: Produce;
  /** What the plant gives when it is cut down (at full size). */
  materials?: ResourceAmount[];
}

export interface FloraParams {
  /** Each plant (and each tile of grass) is updated once every this many days. */
  updateIntervalDays: number;
  /** How far outside its comfortable range a species can still live (fitness falls to 0). */
  fitnessToleranceCelsius: number;
  fitnessToleranceHumidity: number;
  growthMinCelsius: number;
  health: { regenPerDay: number; frostDamagePerDegreeDay: number; droughtDamagePerDay: number; misfitDamagePerDay: number };
  seedlingHealth: number;
  seedlingGrowth: number;
  initialCoverByBiome: Record<string, number>;
  /** Share of the grass capacity left under a plant of each kind (trees shade the ground). */
  shadeByKind: Record<PlantKind, number>;
  /**
   * Where a seedling takes root: in thick grass, young woody plants are choked (and burnt, grazed);
   * under a closed canopy, light-hungry plants do not come up.
   */
  establishment: {
    grassCompetitionByKind: Record<PlantKind, number>;
    canopyShadeByKind: Record<PlantKind, number>;
    /** Size (share of the adult size) from which a tree shades its neighbours. */
    canopyGrowth: number;
    /** Share of seedlings lost when all 8 neighbours are plants of their own species (pests and diseases of the species). */
    sameSpeciesCrowding: number;
    /** Chance that a herb dying of old age leaves a seedling of its own in its place (seeds fallen at its feet). */
    herbReseedChance: number;
  };
  /** Grazing animals bite off the young shoots of trees and shrubs on the tiles they graze. */
  browsing: { maxGrowth: number; damagePerGrassUnit: number };
  grass: {
    maxAmount: number;
    growthPerDay: number;
    minGrowthCelsius: number;
    /** Grass grows at full speed above this humidity. */
    idealHumidity: number;
    coverByBiome: Record<string, number>;
  };
  species: PlantSpecies[];
}

const byBiome = (label: string, help: string, apply: 'live' | 'newWorld'): Schema => ({ kind: 'record', values: num(0, 1, label, help, 'fraction', apply) });
const share = (label: string, help: string): Schema => num(0, 1, label, help, 'fraction');
const AMOUNTS: Schema = {
  kind: 'array',
  items: {
    kind: 'object',
    fields: {
      resource: text('Ressource', 'Identifiant d’une ressource de data/resources.json.'),
      amount: num(0, 1000, 'Quantité', 'Quantité de cette ressource pour une plante adulte.', 'unités'),
    },
  },
};

export const PLANTS_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    updateIntervalDays: int(1, 365, 'Rythme de mise à jour', 'Chaque plante (et l’herbe de chaque tuile) n’est mise à jour qu’une fois tous ces jours, les tuiles étant réparties sur les jours.', 'jours'),
    fitnessToleranceCelsius: num(0.1, 30, 'Tolérance au climat (température)', 'Jusqu’où, hors de sa plage idéale de température moyenne, une espèce peut encore vivre (sa vigueur tombe alors à zéro).', '°C'),
    fitnessToleranceHumidity: num(0.01, 1, 'Tolérance au climat (humidité)', 'Jusqu’où, hors de sa plage idéale d’humidité moyenne, une espèce peut encore vivre.', 'fraction'),
    growthMinCelsius: num(-30, 30, 'Température de croissance', 'En dessous de cette température, les plantes ne grandissent pas.', '°C'),
    health: {
      kind: 'object',
      fields: {
        regenPerDay: num(0, 1, 'Guérison', 'Santé regagnée par jour quand rien ne nuit à la plante.', 'fraction/jour'),
        frostDamagePerDegreeDay: num(0, 1, 'Dégâts du gel', 'Santé perdue par jour et par degré sous le seuil de gel de l’espèce.', 'fraction/(°C·jour)'),
        droughtDamagePerDay: num(0, 1, 'Dégâts de la sécheresse', 'Santé perdue par jour quand l’humidité est sous le seuil de sécheresse de l’espèce (au plus fort de la sécheresse).', 'fraction/jour'),
        misfitDamagePerDay: num(0, 1, 'Dégâts d’un climat inadapté', 'Santé perdue par jour par une plante qui pousse hors de son climat idéal.', 'fraction/jour'),
      },
    },
    seedlingHealth: share('Santé d’une pousse', 'Santé d’une plante qui vient de germer.'),
    seedlingGrowth: share('Taille d’une pousse', 'Taille (part de la taille adulte) d’une plante qui vient de germer.'),
    initialCoverByBiome: byBiome('Couverture de départ', 'Part des tuiles de ce biome couvertes d’une plante au début du monde.', 'newWorld'),
    shadeByKind: {
      kind: 'object',
      fields: {
        tree: share('Herbe sous un arbre', 'Part de l’herbe qui pousse encore à l’ombre d’un arbre.'),
        shrub: share('Herbe sous un arbuste', 'Part de l’herbe qui pousse encore sous un arbuste.'),
        herb: share('Herbe sous une plante basse', 'Part de l’herbe qui pousse encore sous une plante herbacée.'),
      },
    },
    establishment: {
      kind: 'object',
      fields: {
        grassCompetitionByKind: {
          kind: 'object',
          fields: {
            tree: share('Jeune arbre dans l’herbe', 'Part des graines d’arbre qui échouent sur une tuile couverte d’herbe haute (l’herbe étouffe la pousse) ; moins s’il y a moins d’herbe.'),
            shrub: share('Jeune arbuste dans l’herbe', 'Part des graines d’arbuste qui échouent sur une tuile couverte d’herbe haute.'),
            herb: share('Plante basse dans l’herbe', 'Part des graines de plante basse qui échouent sur une tuile couverte d’herbe haute.'),
          },
        },
        canopyShadeByKind: {
          kind: 'object',
          fields: {
            tree: share('Jeune arbre à l’ombre', 'Part des graines d’arbre qui échouent quand les 8 tuiles voisines portent de grands arbres (sous-bois sombre).'),
            shrub: share('Arbuste à l’ombre', 'Part des graines d’arbuste qui échouent sous un couvert d’arbres fermé.'),
            herb: share('Plante basse à l’ombre', 'Part des graines de plante basse qui échouent sous un couvert d’arbres fermé (elles ont besoin de lumière).'),
          },
        },
        herbReseedChance: share('Ressemis sur place', 'Chance qu’une plante basse qui meurt de vieillesse laisse une jeune pousse de son espèce à sa place (ses graines tombées à ses pieds), si le climat lui convient.'),
        sameSpeciesCrowding: share('Voisins de la même espèce', 'Part des graines qui échouent quand les 8 tuiles voisines portent déjà des plantes de leur espèce : parasites et maladies propres à une espèce s’accumulent là où elle est dense, ce qui laisse de la place aux autres.'),
        canopyGrowth: share('Arbre qui fait de l’ombre', 'Taille (part de la taille adulte) à partir de laquelle un arbre ombrage les tuiles voisines.'),
      },
    },
    browsing: {
      kind: 'object',
      fields: {
        maxGrowth: share('Pousses broutées', 'Les herbivores qui broutent une tuile abîment l’arbre ou l’arbuste qui y pousse tant qu’il est plus petit que cette part de sa taille adulte.'),
        damagePerGrassUnit: num(0, 1, 'Dégâts du broutage', 'Santé perdue par la jeune pousse pour chaque unité d’herbe broutée sur sa tuile.', 'fraction/unité'),
      },
    },
    grass: {
      kind: 'object',
      fields: {
        maxAmount: int(1, 255, 'Herbe maximale', 'Quantité d’herbe maximale sur une tuile entièrement couverte.', 'unités'),
        growthPerDay: num(0, 50, 'Pousse de l’herbe', 'Herbe gagnée par jour quand il fait assez chaud et assez humide.', 'unités/jour'),
        minGrowthCelsius: num(-30, 30, 'Température de pousse de l’herbe', 'En dessous, l’herbe ne pousse pas.', '°C'),
        idealHumidity: num(0.01, 1, 'Humidité idéale de l’herbe', 'Au-dessus de cette humidité, l’herbe pousse à pleine vitesse ; en dessous, plus lentement.', 'fraction'),
        coverByBiome: byBiome('Couverture d’herbe', 'Part de l’herbe maximale que peut porter une tuile de ce biome.', 'live'),
      },
    },
    species: {
      kind: 'array',
      minLength: 1,
      items: {
        kind: 'object',
        fields: {
          id: identifier('Identifiant', 'Nom technique de l’espèce.'),
          name: text('Nom', 'Nom affiché de l’espèce.'),
          kind: choice(['tree', 'shrub', 'herb'], 'Port', 'tree = arbre, shrub = arbuste, herb = plante basse (ombre, bois, coût de marche).'),
          color: color('Couleur', 'Couleur principale du dessin.'),
          shape: choice(['round', 'conifer', 'umbrella', 'bush', 'grass'], 'Forme du dessin', 'Silhouette dessinée sur la carte (affichage seulement).'),
          accentColor: color('Couleur secondaire', 'Baies, fleurs, écorce… (affichage seulement).'),
          abundance: num(0, 100, 'Abondance de départ', 'Fréquence relative de l’espèce quand la carte est peuplée au début du monde.', 'poids', 'newWorld'),
          temperature: pair(num(-60, 60, 'Température idéale [min, max]', 'Plage de température MOYENNE annuelle où l’espèce est à l’aise.', '°C')),
          humidity: pair(num(0, 1, 'Humidité idéale [min, max]', 'Plage d’humidité MOYENNE annuelle où l’espèce est à l’aise.', 'fraction')),
          frostCelsius: num(-80, 30, 'Seuil de gel', 'En dessous de cette température du moment, la plante souffre du gel.', '°C'),
          droughtHumidity: share('Seuil de sécheresse', 'En dessous de cette humidité du moment, la plante souffre de la sécheresse.'),
          maxAgeYears: num(0.1, 5000, 'Longévité', 'Âge à partir duquel la plante peut mourir de vieillesse.', 'ans'),
          maturityYears: num(0, 500, 'Maturité', 'Âge à partir duquel la plante produit des graines et des récoltes.', 'ans'),
          growthYears: num(0.01, 500, 'Croissance', 'Années pour atteindre la taille adulte dans un climat idéal.', 'ans'),
          seedsPerYear: num(0, 100, 'Graines par an', 'Graines lancées par an par une plante adulte en bonne santé.', 'graines/an'),
          seedRadius: int(1, 32, 'Portée des graines', 'Distance maximale à laquelle tombent les graines.', 'tuiles'),
          germinationChance: share('Germination', 'Chance qu’une graine tombée sur une tuile libre germe (dans un climat idéal).'),
          shadeTolerance: share('Tolérance à l’ombre', 'Plantes de sous-bois : part de la gêne due à l’ombre des grands arbres qu’elles ne subissent pas (0 = gênée comme les autres de son port).'),
          produce: {
            kind: 'object',
            fields: {
              resource: text('Récolte', 'Ressource produite chaque saison (identifiant de data/resources.json).'),
              fromDay: int(0, 399, 'Début de la récolte', 'Premier jour de l’année LOCALE où la récolte est disponible (les saisons du sud sont décalées).', 'jour'),
              toDay: int(1, 400, 'Fin de la récolte', 'Jour qui suit le dernier jour de récolte.', 'jour'),
              amount: int(1, 255, 'Quantité récoltable', 'Récolte d’une plante adulte en pleine santé.', 'unités'),
            },
          },
          materials: AMOUNTS,
        },
        optional: ['produce', 'materials', 'accentColor', 'shadeTolerance'],
      },
    },
  },
};

const FILE = 'data/plants.json';
/** Plant species are stored in a Uint8Array (0 = no plant). */
const MAX_SPECIES = 254;

export function parseFloraParams(raw: unknown, biomes: BiomeTable, resources: ResourceCatalog): FloraParams {
  const params = validateData<FloraParams>(FILE, raw, PLANTS_SCHEMA);
  const problems: string[] = [];
  const biomeIds = new Set(biomes.biomes.map((biome) => biome.id));
  for (const [table, key] of [
    [params.initialCoverByBiome, 'initialCoverByBiome'],
    [params.grass.coverByBiome, 'grass.coverByBiome'],
  ] as const) {
    for (const id of Object.keys(table)) if (!biomeIds.has(id)) problems.push(`« ${key} » : le biome « ${id} » n'existe pas.`);
  }
  if (params.species.length > MAX_SPECIES) problems.push(`au plus ${MAX_SPECIES} espèces de plantes sont possibles.`);
  for (const species of params.species) {
    const ids = [...(species.materials ?? []).map((m) => m.resource), ...(species.produce ? [species.produce.resource] : [])];
    problems.push(...unknownResources(resources, ids, `plante « ${species.id} »`));
    if (species.produce && species.produce.fromDay >= species.produce.toDay) {
      problems.push(`plante « ${species.id} » : « produce.fromDay » doit être avant « produce.toDay ».`);
    }
  }
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}
