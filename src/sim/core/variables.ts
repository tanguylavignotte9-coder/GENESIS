/**
 * Catalog of the tunable variables, built from the documented schemas of the data files and the
 * current values: what the variables workshop lists, and how a variable is found again from its key.
 */
import type { ApplyMode, Schema } from './data-validation';
import { DATA_FILES, type DataFileInfo, type DataKey, type RawGameData } from './game-data';

export type PathSegment = string | number;
export type VariableValue = number | string | boolean;

/** One variable as shown in the workshop. */
export interface VariableInfo {
  /** Stable key inside its file: object keys and entry ids joined by dots ("species.wolf.hungerPerDay"). */
  key: string;
  file: string;
  dataKey: DataKey;
  system: string;
  /** Real path in the file's content (array entries by index). */
  path: PathSegment[];
  /** Where the variable sits, in French ("Espèces › Loup"). Empty at the top of the file. */
  section: string;
  kind: 'integer' | 'number' | 'string' | 'boolean' | 'enum';
  label: string;
  help: string;
  unit: string;
  apply: ApplyMode;
  min?: number;
  max?: number;
  /** Allowed values of a choice. */
  values?: readonly string[];
  value: VariableValue;
  defaultValue: VariableValue;
}

/** French titles of the sections of the data files (keys of the JSON objects that group variables). */
const SECTION_TITLES: Record<string, string> = {
  elevation: 'Relief',
  temperature: 'Température',
  humidity: 'Humidité',
  hydrology: 'Rivières et lacs',
  windBands: 'Vents dominants',
  latitudeFactors: 'Humidité selon la latitude',
  biomes: 'Biomes',
  seasonColors: 'Couleurs des saisons',
  water: 'Eaux douces',
  river: 'Rivières',
  lake: 'Lacs',
  resources: 'Ressources',
  daylight: 'Jour et nuit',
  deviationByLatitude: 'Durée du jour selon la latitude',
  seasonalTemperature: 'Saisons : température',
  seasonalHumidity: 'Saisons : humidité',
  amplitudeByLatitude: 'Selon la latitude',
  snow: 'Neige',
  anomalies: 'Années anormales',
  types: 'Types',
  seasons: 'Saisons',
  speeds: 'Vitesses',
  health: 'Santé',
  initialCoverByBiome: 'Couverture de départ par biome',
  shadeByKind: 'Ombre',
  grass: 'Herbe',
  coverByBiome: 'Couverture par biome',
  species: 'Espèces',
  produce: 'Récolte',
  materials: 'Matériaux',
  needs: 'Besoins',
  behavior: 'Comportement',
  fish: 'Poisson',
  capacityByWater: 'Poisson selon l’eau',
  carrion: 'Carcasses',
  stats: 'Statistiques',
  humanPrey: 'Prédateurs et humains',
  hunters: 'Prédateurs des humains',
  events: 'Journal',
  diet: 'Régime',
  prey: 'Proies',
  habitat: 'Habitat de départ',
  carcass: 'Dépouille',
  tribe: 'Tribu de départ',
  site: 'Emplacement du camp',
  names: 'Noms',
  syllables: 'Syllabes',
  knowledge: 'Savoirs',
  requires: 'Prérequis',
  skills: 'Compétences',
  skillLearning: 'Apprentissage',
  campMove: 'Déplacement du camp',
  items: 'Objets',
  recipes: 'Recettes',
  buildings: 'Bâtiments',
  source: 'Source',
  inputs: 'Entrées',
  outputs: 'Produits',
  tools: 'Outils',
  startingBuildings: 'Bâtiments de départ',
  stock: 'Stock',
  spoilage: 'Conservation',
  custom: 'Coutume',
  urgency: 'Urgence des besoins collectifs',
  foodReserveDaysBySeason: 'Réserve de nourriture par saison',
  quality: 'Qualité',
  work: 'Travail',
  hunting: 'Chasse',
  rangedTools: 'Armes de jet',
  crop: 'Champs',
  terrainSources: 'Sources du terrain',
  texts: 'Phrases du journal',
  reasons: 'Raisons',
  traits: 'Traits de caractère',
  body: 'Corps',
  edibleResources: 'Ressources comestibles',
  camp: 'Camp',
  memory: 'Mémoire',
  danger: 'Danger',
  predators: 'Animaux redoutés',
  terrain: 'Terrain',
  decision: 'Décision',
  actions: 'Actions',
  considerations: 'Considérations',
  deathTexts: 'Phrases de mort',
  childrenPerCouple: 'Enfants par couple',
  adultAge: 'Âge des adultes',
  relations: 'Relations',
  kin: 'Liens familiaux',
  spouse: 'Conjoint',
  parent: 'Parent',
  child: 'Enfant',
  sibling: 'Frère ou sœur',
  emotions: 'Émotions',
  joy: 'Joie',
  sadness: 'Tristesse',
  anger: 'Colère',
  fear: 'Peur',
  jealousy: 'Jalousie',
  loneliness: 'Solitude',
  memories: 'Souvenirs',
  kinds: 'Sortes',
  conversation: 'Conversations',
  listenerFeels: 'Ce que ressent l’interlocuteur',
  speakerFeels: 'Ce que ressent celui qui parle',
  receiverFeels: 'Ce que ressent celui qui reçoit',
  jealousyFeels: 'Ce que ressent le jaloux',
  frictionFeels: 'Accrochage',
  couples: 'Couples',
  news: 'Nouvelles',
  fuzzTiles: 'Imprécision des lieux racontés',
  sharing: 'Partage',
  ambitions: 'Ambitions',
  kinNames: 'Noms des liens',
  elderAge: 'Âge des anciens',
  childAge: 'Âge des enfants',
  // Groups (data/groups.json)
  levels: 'Niveaux',
  nameTemplates: 'Noms des groupes',
  factors: 'Situations',
  regimes: 'Régimes',
  weights: 'Accès au pouvoir',
  favors: 'Favorisé par',
  power: 'Pouvoir',
  property: 'Règles de propriété',
  inheritance: 'Règles d’héritage',
  strategies: 'Stratégies',
  duties: 'Obligations',
  opinion: 'Légitimité et mécontentement',
  obedience: 'Obéissance',
  politics: 'Vie politique',
  clans: 'Clans',
  families: 'Familles',
  scission: 'Scissions',
  fusion: 'Fusions',
  betrayal: 'Trahisons',
  contact: 'Relations entre tribus',
  moves: 'Déplacements et migrations',
  factorTexts: 'Phrases des situations',
  featureTexts: 'Phrases des atouts',
  dutyNames: 'Noms des obligations',
  causeTexts: 'Phrases des raisons',
  autosave: 'Sauvegarde automatique',
};

const PAIR_NAMES = ['min', 'max'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Name of an entry of a list: its "name", else its "id", else its rank. */
function entryName(item: unknown, index: number): string {
  if (isRecord(item)) {
    if (typeof item['name'] === 'string') return item['name'];
    if (typeof item['id'] === 'string') return item['id'];
  }
  return `n° ${index + 1}`;
}

/** Key segment of an entry: its id when it has one (stable when the list is reordered), else its index. */
function entryKey(item: unknown, index: number): string {
  return isRecord(item) && typeof item['id'] === 'string' ? item['id'] : String(index);
}

interface Walk {
  info: DataFileInfo;
  defaults: unknown;
  out: VariableInfo[];
}

function title(key: string): string {
  return SECTION_TITLES[key] ?? key;
}

function walk(schema: Schema, value: unknown, defaults: unknown, path: PathSegment[], keys: string[], sections: string[], labelSuffix: string, ctx: Walk): void {
  switch (schema.kind) {
    case 'object': {
      if (!isRecord(value)) return;
      const defaultsRecord = isRecord(defaults) ? defaults : {};
      for (const [key, field] of Object.entries(schema.fields)) {
        if (!(key in value)) continue;
        const leaf = field.kind !== 'object' && field.kind !== 'array' && field.kind !== 'record';
        walk(field, value[key], defaultsRecord[key], [...path, key], [...keys, key], leaf ? sections : [...sections, title(key)], '', ctx);
      }
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) return;
      const defaultsList = Array.isArray(defaults) ? defaults : [];
      const leafItems = schema.items.kind !== 'object' && schema.items.kind !== 'array' && schema.items.kind !== 'record';
      const pair = schema.minLength === 2 && schema.maxLength === 2;
      value.forEach((item, index) => {
        if (leafItems) {
          const suffix = pair ? ` (${PAIR_NAMES[index]})` : ` (${index + 1})`;
          walk(schema.items, item, defaultsList[index], [...path, index], [...keys, String(index)], sections, suffix, ctx);
        } else {
          walk(schema.items, item, defaultsList[index], [...path, index], [...keys, entryKey(item, index)], [...sections, entryName(item, index)], '', ctx);
        }
      });
      return;
    }
    case 'record': {
      if (!isRecord(value)) return;
      const defaultsRecord = isRecord(defaults) ? defaults : {};
      for (const [key, item] of Object.entries(value)) {
        walk(schema.values, item, defaultsRecord[key], [...path, key], [...keys, key], sections, ` : ${key}`, ctx);
      }
      return;
    }
    default: {
      if (!schema.doc || (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean')) return;
      const variable: VariableInfo = {
        key: keys.join('.'),
        file: ctx.info.file,
        dataKey: ctx.info.key,
        system: ctx.info.system,
        path,
        section: sections.join(' › '),
        kind: schema.kind,
        label: schema.doc.label + labelSuffix,
        help: schema.doc.help,
        unit: schema.doc.unit,
        apply: schema.doc.apply,
        value,
        defaultValue: typeof defaults === typeof value ? (defaults as VariableValue) : value,
      };
      if (schema.kind === 'integer' || schema.kind === 'number') {
        if (schema.min !== undefined) variable.min = schema.min;
        if (schema.max !== undefined) variable.max = schema.max;
      }
      if (schema.kind === 'enum') variable.values = schema.values;
      ctx.out.push(variable);
    }
  }
}

/** Every variable of every data file, with its current value (`raw`) and its default value. */
export function buildCatalog(raw: RawGameData, defaults: RawGameData): VariableInfo[] {
  const out: VariableInfo[] = [];
  for (const info of DATA_FILES) walk(info.schema, raw[info.key], defaults[info.key], [], [], [], '', { info, defaults: defaults[info.key], out });
  return out;
}

export function getAt(root: unknown, path: readonly PathSegment[]): unknown {
  let node: unknown = root;
  for (const segment of path) {
    if (Array.isArray(node) && typeof segment === 'number') node = node[segment];
    else if (isRecord(node) && typeof segment === 'string') node = node[segment];
    else return undefined;
  }
  return node;
}

/** Writes a value at a path that already exists (variables are edited, never added). */
export function setAt(root: unknown, path: readonly PathSegment[], value: unknown): void {
  const parent = getAt(root, path.slice(0, -1));
  const last = path[path.length - 1];
  if (Array.isArray(parent) && typeof last === 'number' && last < parent.length) parent[last] = value;
  else if (isRecord(parent) && typeof last === 'string' && last in parent) parent[last] = value;
  else throw new Error(`Variable introuvable : ${path.join('.')}`);
}

/** Real path of a variable from its key ("species.wolf.hungerPerDay"), or null if it does not exist. */
export function resolveKey(content: unknown, key: string): PathSegment[] | null {
  const path: PathSegment[] = [];
  let node: unknown = content;
  for (const segment of key.split('.')) {
    if (Array.isArray(node)) {
      const index = /^\d+$/.test(segment) ? Number(segment) : node.findIndex((item) => isRecord(item) && item['id'] === segment);
      if (index < 0 || index >= node.length) return null;
      path.push(index);
      node = node[index];
    } else if (isRecord(node) && segment in node) {
      path.push(segment);
      node = node[segment];
    } else return null;
  }
  return typeof node === 'object' && node !== null ? null : path;
}

export function cloneRaw(raw: RawGameData): RawGameData {
  return JSON.parse(JSON.stringify(raw)) as RawGameData;
}

/** Only the variables that differ from their default value, by file then key (the content of a preset). */
export function diffFromDefaults(catalog: readonly VariableInfo[]): Record<string, Record<string, VariableValue>> {
  const diff: Record<string, Record<string, VariableValue>> = {};
  for (const variable of catalog) {
    if (variable.value === variable.defaultValue) continue;
    (diff[variable.file] ??= {})[variable.key] = variable.value;
  }
  return diff;
}

/** "Faune › Loup › Faim" */
export function fullLabel(variable: VariableInfo): string {
  return [variable.system, variable.section, variable.label].filter((part) => part !== '').join(' › ');
}

/** Value written for the player ("0,8", "oui", "Loup"). */
export function formatValue(value: VariableValue): string {
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  if (typeof value === 'number') return String(Math.round(value * 1e6) / 1e6).replace('.', ',');
  return `« ${value} »`;
}
