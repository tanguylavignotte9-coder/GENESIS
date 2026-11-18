import { DataFileError, identifier, text, validateData, type Schema } from './data-validation';

/** Catalog of resources (data/resources.json): what plants and animals provide. */
export interface ResourceDef {
  id: string;
  /** Shown to the player. */
  name: string;
}

export interface ResourceCatalog {
  resources: ResourceDef[];
}

export const RESOURCES_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    resources: {
      kind: 'array',
      minLength: 1,
      items: {
        kind: 'object',
        fields: {
          id: identifier('Identifiant', 'Nom technique de la ressource (utilisé par les plantes, les animaux et les humains).'),
          name: text('Nom', 'Nom affiché de la ressource.', 'newWorld'),
        },
      },
    },
  },
};

const FILE = 'data/resources.json';

export function parseResourceCatalog(raw: unknown): ResourceCatalog {
  const catalog = validateData<ResourceCatalog>(FILE, raw, RESOURCES_SCHEMA);
  const ids = catalog.resources.map((resource) => resource.id);
  if (new Set(ids).size !== ids.length) throw new DataFileError(FILE, ['deux ressources ont le même « id ».']);
  return catalog;
}

/** French problem descriptions for every unknown resource id (cross-file check). */
export function unknownResources(catalog: ResourceCatalog, ids: readonly string[], where: string): string[] {
  const known = new Set(catalog.resources.map((resource) => resource.id));
  return ids.filter((id) => !known.has(id)).map((id) => `${where} : la ressource « ${id} » n'existe pas dans data/resources.json.`);
}
