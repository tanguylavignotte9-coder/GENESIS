import { choice, color, DataFileError, flag, identifier, num, text, validateData, type Schema } from '../../core/data-validation';

/**
 * Biome definitions, read from data/biomes.json.
 * A tile takes the FIRST biome of its domain (ocean or land) whose conditions all match;
 * the last biome of each domain should have no condition (catch-all).
 */
export interface BiomeDef {
  id: string;
  /** Name shown to the player (French). */
  name: string;
  /** Map color, "#rrggbb". */
  color: string;
  domain: 'ocean' | 'land';
  minAltitude?: number;
  maxAltitude?: number;
  minTemperature?: number;
  maxTemperature?: number;
  minHumidity?: number;
  maxHumidity?: number;
  /** If true, the tile must be within `beachMaxDistance` tiles of the ocean. */
  coastal?: boolean;
  /** Plant cover that dries out (yellows) in the dry season. Display only, not a condition. */
  vegetation?: boolean;
}

export interface WaterDef {
  name: string;
  color: string;
}

export interface BiomeTable {
  biomes: BiomeDef[];
  /** Map colors of seasonal effects. */
  seasonColors: { snow: string; dryVegetation: string };
  water: { river: WaterDef; lake: WaterDef };
}

const CONDITIONS = ['minAltitude', 'maxAltitude', 'minTemperature', 'maxTemperature', 'minHumidity', 'maxHumidity'];
/** Biomes are decided when the world is generated: every change needs a new world. */
const W = 'newWorld';
const mapColor = (label: string, help: string): Schema => color(label, help, W);

export const BIOMES_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    biomes: {
      kind: 'array',
      minLength: 2,
      items: {
        kind: 'object',
        fields: {
          id: identifier('Identifiant', 'Nom technique du biome (utilisé par la flore et la faune).'),
          name: text('Nom', 'Nom affiché du biome.', W),
          color: mapColor('Couleur', 'Couleur du biome sur la carte.'),
          domain: choice(['ocean', 'land'], 'Domaine', 'ocean = sous la mer, land = sur la terre ferme.', W),
          minAltitude: num(-11000, 9000, 'Altitude minimale', 'Condition : altitude d’au moins cette valeur.', 'm', W),
          maxAltitude: num(-11000, 9000, 'Altitude maximale', 'Condition : altitude d’au plus cette valeur.', 'm', W),
          minTemperature: num(-60, 60, 'Température minimale', 'Condition : température moyenne annuelle d’au moins cette valeur.', '°C', W),
          maxTemperature: num(-60, 60, 'Température maximale', 'Condition : température moyenne annuelle d’au plus cette valeur.', '°C', W),
          minHumidity: num(0, 1, 'Humidité minimale', 'Condition : humidité moyenne d’au moins cette valeur.', 'fraction', W),
          maxHumidity: num(0, 1, 'Humidité maximale', 'Condition : humidité moyenne d’au plus cette valeur.', 'fraction', W),
          coastal: flag('Côtier', 'Condition : la tuile doit être (ou ne pas être) près de la mer.', W),
          vegetation: flag('Végétation saisonnière', 'La végétation de ce biome jaunit en saison sèche (affichage seulement).', W),
        },
        optional: [...CONDITIONS, 'coastal', 'vegetation'],
      },
    },
    seasonColors: {
      kind: 'object',
      fields: {
        snow: mapColor('Couleur de la neige', 'Couleur de la neige sur la carte.'),
        dryVegetation: mapColor('Couleur de la végétation sèche', 'Couleur de la végétation jaunie en saison sèche.'),
      },
    },
    water: {
      kind: 'object',
      fields: {
        river: { kind: 'object', fields: { name: text('Nom des rivières', 'Nom affiché des rivières.', W), color: mapColor('Couleur des rivières', 'Couleur des rivières sur la carte.') } },
        lake: { kind: 'object', fields: { name: text('Nom des lacs', 'Nom affiché des lacs.', W), color: mapColor('Couleur des lacs', 'Couleur des lacs sur la carte.') } },
      },
    },
  },
};

/** Biome indices are stored in a Uint8Array. */
const MAX_BIOMES = 255;
const FILE = 'data/biomes.json';

export function parseBiomeTable(raw: unknown): BiomeTable {
  const table = validateData<BiomeTable>(FILE, raw, BIOMES_SCHEMA);
  const problems: string[] = [];
  const ids = table.biomes.map((biome) => biome.id);
  if (new Set(ids).size !== ids.length) problems.push('deux biomes ont le même « id ».');
  if (table.biomes.length > MAX_BIOMES) problems.push(`au plus ${MAX_BIOMES} biomes sont possibles.`);
  for (const domain of ['ocean', 'land'] as const) {
    const last = table.biomes.filter((biome) => biome.domain === domain).at(-1);
    if (!last) problems.push(`il faut au moins un biome de domaine « ${domain} ».`);
    else if (!isCatchAll(last)) {
      problems.push(`le dernier biome « ${domain} » (« ${last.id} ») ne doit avoir aucune condition : il sert de biome par défaut.`);
    }
  }
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return table;
}

function isCatchAll(biome: BiomeDef): boolean {
  return biome.coastal === undefined && CONDITIONS.every((key) => !(key in biome));
}

/** Climate of one tile, as seen by the biome rules. */
export interface TileClimate {
  altitude: number;
  temperature: number;
  humidity: number;
  coastal: boolean;
}

export function biomeMatches(biome: BiomeDef, tile: TileClimate): boolean {
  return (
    (biome.minAltitude === undefined || tile.altitude >= biome.minAltitude) &&
    (biome.maxAltitude === undefined || tile.altitude <= biome.maxAltitude) &&
    (biome.minTemperature === undefined || tile.temperature >= biome.minTemperature) &&
    (biome.maxTemperature === undefined || tile.temperature <= biome.maxTemperature) &&
    (biome.minHumidity === undefined || tile.humidity >= biome.minHumidity) &&
    (biome.maxHumidity === undefined || tile.humidity <= biome.maxHumidity) &&
    (biome.coastal === undefined || tile.coastal === biome.coastal)
  );
}

/** Returns the index (in `biomes`) of the biome of a tile. */
export function classifyBiome(biomes: readonly BiomeDef[], isOcean: boolean, tile: TileClimate): number {
  const domain = isOcean ? 'ocean' : 'land';
  let fallback = -1;
  for (let i = 0; i < biomes.length; i++) {
    const biome = biomes[i];
    if (!biome || biome.domain !== domain) continue;
    fallback = i;
    if (biomeMatches(biome, tile)) return i;
  }
  return fallback;
}
