/**
 * The kinds of generated pages: one page per entry of a list (or record) of a data file. The page
 * id is "<prefix>:<id of the entry>" and it belongs to the chapter "catalogue-<prefix>".
 */
import type { DataKey } from '../../../sim/core/game-data';

export interface EntryKind {
  prefix: string;
  dataKey: DataKey;
  file: string;
  /** Path of the list (or record) inside the file ("species", "memories.kinds"). */
  path: string;
  /** Record: entries keyed by their key; list: entries keyed by their "id". */
  record: boolean;
}

export const ENTRY_KINDS: readonly EntryKind[] = [
  { prefix: 'biome', dataKey: 'biomes', file: 'biomes.json', path: 'biomes', record: false },
  { prefix: 'ressource', dataKey: 'resources', file: 'resources.json', path: 'resources', record: false },
  { prefix: 'meteo', dataKey: 'weather', file: 'weather.json', path: 'types', record: false },
  { prefix: 'anomalie', dataKey: 'climate', file: 'climate.json', path: 'anomalies.types', record: false },
  { prefix: 'plante', dataKey: 'flora', file: 'plants.json', path: 'species', record: false },
  { prefix: 'animal', dataKey: 'fauna', file: 'animals.json', path: 'species', record: false },
  { prefix: 'trait', dataKey: 'humans', file: 'humans.json', path: 'traits', record: false },
  { prefix: 'competence', dataKey: 'humans', file: 'humans.json', path: 'skills', record: false },
  { prefix: 'action', dataKey: 'humans', file: 'humans.json', path: 'actions', record: false },
  { prefix: 'emotion', dataKey: 'social', file: 'social.json', path: 'emotions', record: true },
  { prefix: 'souvenir', dataKey: 'social', file: 'social.json', path: 'memories.kinds', record: true },
  { prefix: 'conversation', dataKey: 'social', file: 'social.json', path: 'conversation.kinds', record: true },
  { prefix: 'ambition', dataKey: 'social', file: 'social.json', path: 'ambitions.kinds', record: true },
  { prefix: 'maladie', dataKey: 'life', file: 'life.json', path: 'diseases', record: false },
  { prefix: 'regime', dataKey: 'groups', file: 'groups.json', path: 'regimes', record: false },
  { prefix: 'propriete', dataKey: 'groups', file: 'groups.json', path: 'property', record: false },
  { prefix: 'heritage', dataKey: 'groups', file: 'groups.json', path: 'inheritance', record: false },
  { prefix: 'strategie', dataKey: 'groups', file: 'groups.json', path: 'strategies', record: false },
  { prefix: 'valeur', dataKey: 'ideas', file: 'ideas.json', path: 'values', record: false },
  { prefix: 'croyance', dataKey: 'ideas', file: 'ideas.json', path: 'religion.beliefs', record: false },
  { prefix: 'savoir', dataKey: 'knowledge', file: 'knowledge.json', path: 'knowledge', record: false },
  { prefix: 'recette', dataKey: 'recipes', file: 'recipes.json', path: 'recipes', record: false },
  { prefix: 'objet', dataKey: 'items', file: 'items.json', path: 'items', record: false },
  { prefix: 'batiment', dataKey: 'buildings', file: 'buildings.json', path: 'buildings', record: false },
];

/** Chapter of the index of a kind's pages. */
export function catalogChapter(kind: EntryKind): string {
  return `catalogue-${kind.prefix}`;
}
