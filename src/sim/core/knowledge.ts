import { DataFileError, flag, identifier, int, text, validateData, type Schema } from './data-validation';

/**
 * Knowledge (data/knowledge.json). For now a simple list: who knows what is a bit field per person.
 * The ideas system (step 10) will make knowledge appear, spread and be forgotten.
 */
export interface KnowledgeDef {
  id: string;
  name: string;
  /** Era it belongs to (a landmark for the display, never a lock). */
  era: number;
  /** Knowledge needed before this one can be discovered (used by the ideas system later). */
  requires: string[];
  /** Known by the starting tribe. */
  startsKnown: boolean;
}

export interface KnowledgeCatalog {
  knowledge: KnowledgeDef[];
}

/** A person's knowledge is a 32-bit field: at most 32 knowledge entries for now. */
export const MAX_KNOWLEDGE = 32;
const ID_PATTERN = { pattern: /^[a-z_]+$/, hint: 'un identifiant en minuscules (a-z, _)' };

export const KNOWLEDGE_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    knowledge: {
      kind: 'array',
      minLength: 1,
      maxLength: MAX_KNOWLEDGE,
      items: {
        kind: 'object',
        fields: {
          id: identifier('Identifiant', 'Nom technique du savoir (utilisé par les recettes, les bâtiments et les actions).'),
          name: text('Nom', 'Nom affiché du savoir.', 'newWorld'),
          era: int(0, 8, 'Ère', 'Ère de repère du savoir (0 = paléolithique, 1 = néolithique…) : sert à l’affichage, ne bloque rien.', 'ère'),
          requires: { kind: 'array', items: text('Savoir prérequis', 'Savoir qu’il faut connaître avant de pouvoir découvrir celui-ci (utilisé à partir du système d’idées).', 'live', ID_PATTERN) },
          startsKnown: flag(
            'Connu au départ',
            'La tribu de départ connaît ce savoir. Permet de tester une tribu qui sait déjà chasser, pêcher ou faire de la poterie.',
            'newWorld',
          ),
        },
      },
    },
  },
};

const FILE = 'data/knowledge.json';

export function parseKnowledge(raw: unknown): KnowledgeCatalog {
  const catalog = validateData<KnowledgeCatalog>(FILE, raw, KNOWLEDGE_SCHEMA);
  const ids = catalog.knowledge.map((item) => item.id);
  const problems: string[] = [];
  if (new Set(ids).size !== ids.length) problems.push('deux savoirs ont le même « id ».');
  for (const item of catalog.knowledge) {
    for (const id of item.requires) if (!ids.includes(id)) problems.push(`savoir « ${item.id} » : le prérequis « ${id} » n'existe pas.`);
  }
  if (problems.length > 0) throw new DataFileError(FILE, problems);
  return catalog;
}

/** Bit of a knowledge id in a person's knowledge field (0 if unknown id). */
export function knowledgeBit(catalog: KnowledgeCatalog, id: string): number {
  const index = catalog.knowledge.findIndex((item) => item.id === id);
  return index < 0 ? 0 : (1 << index) >>> 0;
}

/** Bit field of the knowledge any of `ids` (0 = nothing required). */
export function anyKnowledgeMask(catalog: KnowledgeCatalog, ids: readonly string[]): number {
  return ids.reduce((mask, id) => (mask | knowledgeBit(catalog, id)) >>> 0, 0);
}

/** Bit field of the knowledge of the starting tribe. */
export function startingKnowledge(catalog: KnowledgeCatalog): number {
  return catalog.knowledge.reduce((mask, item, k) => (item.startsKnown ? (mask | (1 << k)) >>> 0 : mask), 0);
}

/** Does a knowledge field satisfy a requirement mask (any of its bits; 0 = no requirement)? */
export function satisfies(known: number, required: number): boolean {
  return required === 0 || (known & required) !== 0;
}
