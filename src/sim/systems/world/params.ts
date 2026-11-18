import { choice, DataFileError, int as intVar, num as numVar, validateData, type Schema } from '../../core/data-validation';
import { latitudeCurveProblem, type LatitudePoint } from './latitude-curve';

/** World generation settings, read from data/worldgen.json. Distances are fractions of the map size. */
export interface WorldgenParams {
  size: number;
  elevation: ElevationParams;
  temperature: TemperatureParams;
  humidity: HumidityParams;
  hydrology: HydrologyParams;
  /** Max distance (tiles) from the ocean for a tile to count as coastal (beaches). */
  beachMaxDistance: number;
  /** Land masses smaller than this (tiles) are ignored in statistics. */
  landmassMinTiles: number;
  /** A land mass holding at least this share of all land is a continent; smaller ones are islands. */
  continentMinShare: number;
}

export interface ElevationParams {
  continentCountMin: number;
  continentCountMax: number;
  continentRadiusMin: number;
  continentRadiusMax: number;
  continentMargin: number;
  /** Minimum distance between continent centers, as a multiple of the sum of their radii. */
  continentSpacing: number;
  /** Outer share of a continent's radius over which the land rises from the sea floor to the plateau. */
  continentShelf: number;
  islandCountMin: number;
  islandCountMax: number;
  islandRadiusMin: number;
  islandRadiusMax: number;
  islandStrength: number;
  coastWarpFrequency: number;
  coastWarpStrength: number;
  detailFrequency: number;
  detailOctaves: number;
  detailWeight: number;
  edgeFalloffWidth: number;
  oceanFraction: number;
  lowlandMaxMeters: number;
  lowlandExponent: number;
  /** Mountain belts: low-frequency noise above `mountainBeltThreshold` hosts mountain chains. */
  mountainBeltFrequency: number;
  mountainBeltThreshold: number;
  mountainBeltWidth: number;
  ridgeFrequency: number;
  ridgeOctaves: number;
  /** Exponent applied to the ridged noise: higher = thinner, sharper chains. */
  ridgeSharpness: number;
  mountainMaxMeters: number;
  /** Inland distance (0..1 of the land shape) over which mountains rise from nothing near the coast. */
  mountainCoastRamp: number;
  maxOceanDepthMeters: number;
  oceanDepthExponent: number;
}

export interface TemperatureParams {
  equatorCelsius: number;
  poleCelsius: number;
  latitudeExponent: number;
  lapseRateCelsiusPerKm: number;
  noiseFrequency: number;
  noiseCelsius: number;
}

export type WindDirection = 'fromEast' | 'fromWest';

export interface HumidityParams {
  /** Prevailing wind per latitude band (0 = equator, 1 = pole), in increasing order. */
  windBands: { untilLatitude: number; direction: WindDirection }[];
  /** Latitude distance over which two neighbouring wind bands blend (avoids sharp lines). */
  windBandBlend: number;
  /** Share of missing moisture the air picks up over each water tile. */
  oceanEvaporation: number;
  /** Share of carried moisture that falls as rain on each flat land tile. */
  landRainPerTile: number;
  /** Extra rain share per meter of climb (mountains wring out the air). */
  orographicRainPerMeter: number;
  /** Share of fallen rain that evaporates back into the air (vegetation, soil). */
  rainRecycling: number;
  /** Large-scale circulation: humidity multiplier by latitude (interpolated). */
  latitudeFactors: LatitudePoint[];
  /** Blur radius (tiles) of the relief seen by the winds: only large landforms cause rain shadows. */
  reliefSmoothing: number;
  blurRadius: number;
  noiseFrequency: number;
  noiseAmplitude: number;
}

export interface HydrologyParams {
  fillEpsilonMeters: number;
  /** Extra runoff per km of altitude (mountains catch more rain and snow): runoff = humidity² × (1 + this × km). */
  runoffPerKmOfAltitude: number;
  /** Accumulated runoff (sum over all upstream tiles) needed for a tile to carry a river. */
  riverMinFlow: number;
  lakeMinDepthMeters: number;
  /** Accumulated runoff needed for a basin to hold a lake (otherwise it stays a dry basin). */
  lakeMinInflow: number;
}

/** Every world generation setting only changes the next generated world. */
const num = (min: number, max: number, label: string, help: string, unit: string): Schema => numVar(min, max, label, help, unit, 'newWorld');
const int = (min: number, max: number, label: string, help: string, unit: string): Schema => intVar(min, max, label, help, unit, 'newWorld');
const MAP = 'fraction de la carte';

const ELEVATION_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    continentCountMin: int(1, 12, 'Continents (minimum)', 'Nombre minimal de continents ; le nombre réel est tiré au hasard entre le minimum et le maximum.', 'continents'),
    continentCountMax: int(1, 12, 'Continents (maximum)', 'Nombre maximal de continents.', 'continents'),
    continentRadiusMin: num(0.01, 1, 'Taille des continents (minimum)', 'Rayon minimal d’un continent.', MAP),
    continentRadiusMax: num(0.01, 1, 'Taille des continents (maximum)', 'Rayon maximal d’un continent.', MAP),
    continentMargin: num(0, 0.5, 'Marge des continents', 'Distance minimale entre le centre d’un continent et le bord de la carte.', MAP),
    continentSpacing: num(0, 3, 'Écart entre continents', 'Distance minimale entre deux centres de continents, en multiple de la somme de leurs rayons (plus grand = continents mieux séparés).', 'facteur'),
    continentShelf: num(0.01, 1, 'Plateau continental', 'Part extérieure du rayon d’un continent sur laquelle le sol remonte du fond marin jusqu’au plateau.', 'fraction du rayon'),
    islandCountMin: int(0, 500, 'Îles (minimum)', 'Nombre minimal d’îles.', 'îles'),
    islandCountMax: int(0, 500, 'Îles (maximum)', 'Nombre maximal d’îles.', 'îles'),
    islandRadiusMin: num(0.001, 0.2, 'Taille des îles (minimum)', 'Rayon minimal d’une île.', MAP),
    islandRadiusMax: num(0.001, 0.2, 'Taille des îles (maximum)', 'Rayon maximal d’une île.', MAP),
    islandStrength: num(0, 3, 'Relief des îles', 'Hauteur des îles par rapport aux continents (plus grand = îles plus hautes et plus grandes).', 'facteur'),
    coastWarpFrequency: num(0, 20, 'Finesse du découpage des côtes', 'Taille des golfes et des caps : plus grand = découpage plus fin.', 'fréquence'),
    coastWarpStrength: num(0, 1, 'Découpage des côtes', 'Force de la déformation des côtes : plus grand = côtes plus déchiquetées.', MAP),
    detailFrequency: num(0, 50, 'Finesse du relief', 'Taille des petites variations du relief : plus grand = détails plus fins.', 'fréquence'),
    detailOctaves: int(1, 12, 'Couches de détail', 'Nombre de couches de bruit superposées pour le relief (plus = plus de détails, plus lent).', 'couches'),
    detailWeight: num(0, 2, 'Poids des détails', 'Importance des petites variations du relief par rapport à la forme des continents.', 'facteur'),
    edgeFalloffWidth: num(0, 0.5, 'Bord de la carte', 'Largeur de la bande près du bord où le sol s’enfonce sous la mer (pas de terre coupée par le bord).', MAP),
    oceanFraction: num(0.05, 0.95, 'Part d’océan', 'Part de la carte sous la mer (0,66 = deux tiers d’océan).', 'fraction'),
    lowlandMaxMeters: num(0, 5000, 'Altitude des plaines', 'Altitude maximale des plaines et collines (hors montagnes).', 'm'),
    lowlandExponent: num(0.1, 5, 'Platitude des plaines', 'Au-dessus de 1, les terres basses sont plus plates et les collines plus rares.', 'exposant'),
    mountainBeltFrequency: num(0, 20, 'Nombre de chaînes de montagnes', 'Fréquence des zones de montagnes : plus grand = chaînes plus nombreuses et plus courtes.', 'fréquence'),
    mountainBeltThreshold: num(-1, 1, 'Seuil des montagnes', 'Plus bas = plus de surface couverte de montagnes.', 'seuil'),
    mountainBeltWidth: num(0.001, 1, 'Largeur des chaînes', 'Largeur des zones de montagnes.', 'seuil'),
    ridgeFrequency: num(0, 50, 'Finesse des crêtes', 'Taille des crêtes à l’intérieur des chaînes : plus grand = crêtes plus fines.', 'fréquence'),
    ridgeOctaves: int(1, 12, 'Couches des crêtes', 'Nombre de couches de bruit des crêtes.', 'couches'),
    ridgeSharpness: num(0.1, 10, 'Netteté des crêtes', 'Plus grand = crêtes plus étroites et plus pointues.', 'exposant'),
    mountainMaxMeters: num(0, 9000, 'Altitude des sommets', 'Altitude maximale des montagnes.', 'm'),
    mountainCoastRamp: num(0.001, 1, 'Montagnes près des côtes', 'Distance depuis la côte sur laquelle les montagnes montent progressivement (pas de falaise au bord de la mer).', 'fraction des terres'),
    maxOceanDepthMeters: num(1, 11000, 'Profondeur des océans', 'Profondeur maximale de la mer.', 'm'),
    oceanDepthExponent: num(0.1, 5, 'Pente des fonds marins', 'Forme de la descente vers les grands fonds (plus petit = les fonds sont vite profonds).', 'exposant'),
  },
};

const LATITUDE = num(0, 1, 'Latitude', '0 = équateur (milieu de la carte), 1 = pôle (haut ou bas).', 'fraction');

export const WORLDGEN_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    size: int(64, 4096, 'Taille de la carte', 'Côté de la carte carrée (1024 = 1024 × 1024 tuiles). Une grande carte est plus lente à générer et à simuler.', 'tuiles'),
    elevation: ELEVATION_SCHEMA,
    temperature: {
      kind: 'object',
      fields: {
        equatorCelsius: num(-20, 50, 'Température à l’équateur', 'Température moyenne annuelle au niveau de la mer à l’équateur.', '°C'),
        poleCelsius: num(-60, 20, 'Température aux pôles', 'Température moyenne annuelle au niveau de la mer aux pôles.', '°C'),
        latitudeExponent: num(0.1, 5, 'Forme du gradient de température', 'Au-dessus de 1, il fait chaud loin de l’équateur puis froid rapidement près des pôles.', 'exposant'),
        lapseRateCelsiusPerKm: num(0, 15, 'Refroidissement avec l’altitude', 'Degrés perdus par kilomètre d’altitude.', '°C/km'),
        noiseFrequency: num(0, 50, 'Finesse des variations locales', 'Taille des zones un peu plus chaudes ou plus froides que la normale.', 'fréquence'),
        noiseCelsius: num(0, 20, 'Variations locales de température', 'Écart maximal de température dû aux variations locales.', '°C'),
      },
    },
    humidity: {
      kind: 'object',
      fields: {
        windBands: {
          kind: 'array',
          minLength: 1,
          items: {
            kind: 'object',
            fields: {
              untilLatitude: num(0, 1, 'Limite de la bande de vent', 'Latitude jusqu’à laquelle souffle ce vent dominant (la dernière bande doit aller jusqu’à 1).', 'fraction'),
              direction: choice(['fromEast', 'fromWest'], 'Direction du vent', 'fromEast = vent d’est (alizés), fromWest = vent d’ouest.', 'newWorld'),
            },
          },
        },
        windBandBlend: num(0, 0.5, 'Transition entre vents', 'Largeur de la zone où deux bandes de vent voisines se mélangent.', 'fraction de latitude'),
        oceanEvaporation: num(0, 1, 'Évaporation de la mer', 'Part de l’humidité manquante que l’air reprend au-dessus de chaque tuile d’eau.', 'fraction'),
        landRainPerTile: num(0, 1, 'Pluie sur les terres', 'Part de l’humidité de l’air qui tombe en pluie sur chaque tuile de terre plate traversée.', 'fraction/tuile'),
        orographicRainPerMeter: num(0, 0.1, 'Pluie due au relief', 'Pluie supplémentaire par mètre de montée : les montagnes arrosent leur versant au vent et assèchent l’autre.', 'fraction/m'),
        rainRecycling: num(0, 1, 'Recyclage de la pluie', 'Part de la pluie tombée qui s’évapore de nouveau (sols, végétation) et continue avec le vent.', 'fraction'),
        latitudeFactors: {
          kind: 'array',
          minLength: 1,
          items: {
            kind: 'object',
            fields: {
              latitude: LATITUDE,
              value: num(0, 3, 'Humidité selon la latitude', 'Multiplicateur d’humidité à cette latitude (équateur humide, tropiques secs…).', 'facteur'),
            },
          },
        },
        reliefSmoothing: int(0, 64, 'Relief vu par les vents', 'Rayon de lissage du relief : seules les grandes formes du relief créent des ombres de pluie.', 'tuiles'),
        blurRadius: int(0, 64, 'Lissage de l’humidité', 'Rayon de lissage de la carte d’humidité finale.', 'tuiles'),
        noiseFrequency: num(0, 50, 'Finesse des variations d’humidité', 'Taille des zones un peu plus sèches ou humides que la normale.', 'fréquence'),
        noiseAmplitude: num(0, 1, 'Variations locales d’humidité', 'Écart maximal d’humidité dû aux variations locales.', 'fraction'),
      },
    },
    hydrology: {
      kind: 'object',
      fields: {
        fillEpsilonMeters: num(0.001, 1, 'Pente minimale de l’écoulement', 'Petite pente ajoutée pour que l’eau s’écoule toujours vers la mer (technique).', 'm'),
        runoffPerKmOfAltitude: num(0, 50, 'Ruissellement en montagne', 'Les montagnes alimentent davantage les rivières (pluie et neige) : bonus par kilomètre d’altitude.', 'facteur/km'),
        riverMinFlow: num(1, 100000, 'Débit d’une rivière', 'Quantité d’eau accumulée nécessaire pour qu’une rivière apparaisse (plus bas = plus de rivières).', 'unités d’eau'),
        lakeMinDepthMeters: num(0, 500, 'Profondeur d’un lac', 'Profondeur minimale d’une cuvette pour former un lac.', 'm'),
        lakeMinInflow: num(0, 100000, 'Alimentation d’un lac', 'Eau accumulée nécessaire pour qu’une cuvette se remplisse (sinon elle reste sèche).', 'unités d’eau'),
      },
    },
    beachMaxDistance: int(1, 16, 'Largeur des plages', 'Distance maximale à la mer pour qu’une tuile soit côtière (plages).', 'tuiles'),
    landmassMinTiles: int(1, 100000, 'Taille minimale d’une terre', 'Les terres plus petites sont ignorées dans les statistiques.', 'tuiles'),
    continentMinShare: num(0, 1, 'Seuil des continents', 'Une terre qui réunit au moins cette part de toutes les terres est un continent ; les autres sont des îles.', 'fraction'),
  },
};

const FILE = 'data/worldgen.json';

export function parseWorldgenParams(raw: unknown): WorldgenParams {
  const params = validateData<WorldgenParams>(FILE, raw, WORLDGEN_SCHEMA);
  const problems = crossFieldProblems(params);
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return params;
}

function crossFieldProblems(params: WorldgenParams): string[] {
  const e = params.elevation;
  const h = params.humidity;
  const problems: string[] = [];
  const minMax = (min: number, max: number, name: string): void => {
    if (min > max) problems.push(`« elevation.${name}Min » doit être inférieur ou égal à « elevation.${name}Max ».`);
  };
  minMax(e.continentCountMin, e.continentCountMax, 'continentCount');
  minMax(e.continentRadiusMin, e.continentRadiusMax, 'continentRadius');
  minMax(e.islandCountMin, e.islandCountMax, 'islandCount');
  minMax(e.islandRadiusMin, e.islandRadiusMax, 'islandRadius');

  if (!isIncreasing(h.windBands.map((band) => band.untilLatitude)) || h.windBands.at(-1)?.untilLatitude !== 1) {
    problems.push('« humidity.windBands » : les latitudes doivent être croissantes et la dernière doit valoir 1.');
  }
  const curve = latitudeCurveProblem(h.latitudeFactors, 'humidity.latitudeFactors');
  if (curve) problems.push(curve);
  return problems;
}

function isIncreasing(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value > (values[index - 1] ?? value));
}
