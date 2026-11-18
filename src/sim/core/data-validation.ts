/**
 * Minimal schema validation for data/*.json files.
 * Errors are written in French because the player may edit these files.
 */

/**
 * Documentation of a tunable variable, for the future "Atelier des variables" page:
 * French label and help text, unit, and whether a change applies live or needs a new world.
 */
export interface VariableDoc {
  label: string;
  help: string;
  unit: string;
  apply: 'live' | 'newWorld';
}

export type Schema =
  | { kind: 'integer'; min?: number; max?: number; doc?: VariableDoc }
  | { kind: 'number'; min?: number; max?: number; doc?: VariableDoc }
  | { kind: 'string'; pattern?: RegExp; patternHint?: string }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'array'; items: Schema; minLength?: number; maxLength?: number }
  /** Object with free keys (e.g. biome ids), all values following `values`. */
  | { kind: 'record'; values: Schema }
  | { kind: 'object'; fields: Readonly<Record<string, Schema>>; optional?: readonly string[] };

export class DataFileError extends Error {
  constructor(fileName: string, problems: readonly string[]) {
    super(`Le fichier de données « ${fileName} » est invalide :\n- ${problems.join('\n- ')}`);
    this.name = 'DataFileError';
  }
}

/** Checks `raw` against `schema` and returns it typed, or throws a DataFileError listing every problem. */
export function validateData<T>(fileName: string, raw: unknown, schema: Schema): T {
  const problems: string[] = [];
  check(raw, schema, '', problems);
  if (problems.length > 0) throw new DataFileError(fileName, problems);
  return raw as T;
}

function label(path: string): string {
  return path === '' ? 'le contenu' : `« ${path} »`;
}

function found(value: unknown): string {
  return `(valeur trouvée : ${JSON.stringify(value)})`;
}

function check(value: unknown, schema: Schema, path: string, problems: string[]): void {
  switch (schema.kind) {
    case 'integer':
    case 'number':
      checkNumber(value, schema, path, problems);
      return;
    case 'string':
      if (typeof value !== 'string') problems.push(`${label(path)} doit être un texte ${found(value)}.`);
      else if (schema.pattern && !schema.pattern.test(value)) {
        problems.push(`${label(path)} doit être ${schema.patternHint ?? 'un texte valide'} ${found(value)}.`);
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') problems.push(`${label(path)} doit valoir true ou false ${found(value)}.`);
      return;
    case 'enum':
      if (typeof value !== 'string' || !schema.values.includes(value)) {
        problems.push(`${label(path)} doit valoir l'une de ces valeurs : ${schema.values.join(', ')} ${found(value)}.`);
      }
      return;
    case 'array':
      checkArray(value, schema, path, problems);
      return;
    case 'object':
      checkObject(value, schema, path, problems);
      return;
    case 'record':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        problems.push(`${label(path)} doit être un objet JSON { … }.`);
        return;
      }
      for (const [key, item] of Object.entries(value)) check(item, schema.values, path === '' ? key : `${path}.${key}`, problems);
      return;
  }
}

function checkNumber(
  value: unknown,
  schema: { kind: 'integer' | 'number'; min?: number; max?: number; doc?: VariableDoc },
  path: string,
  problems: string[],
): void {
  const what = schema.kind === 'integer' ? 'un nombre entier' : 'un nombre';
  const bounds =
    schema.min !== undefined && schema.max !== undefined
      ? ` compris entre ${schema.min} et ${schema.max}`
      : schema.min !== undefined
        ? ` supérieur ou égal à ${schema.min}`
        : schema.max !== undefined
          ? ` inférieur ou égal à ${schema.max}`
          : '';
  const valid =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (schema.kind === 'number' || Number.isInteger(value)) &&
    (schema.min === undefined || value >= schema.min) &&
    (schema.max === undefined || value <= schema.max);
  if (!valid) problems.push(`${label(path)} doit être ${what}${bounds} ${found(value)}.`);
}

function checkArray(
  value: unknown,
  schema: { kind: 'array'; items: Schema; minLength?: number; maxLength?: number },
  path: string,
  problems: string[],
): void {
  if (!Array.isArray(value)) {
    problems.push(`${label(path)} doit être une liste [ … ].`);
    return;
  }
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    problems.push(`${label(path)} doit contenir au moins ${schema.minLength} élément(s).`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    problems.push(`${label(path)} doit contenir au plus ${schema.maxLength} élément(s).`);
  }
  value.forEach((item, index) => check(item, schema.items, `${path}[${index}]`, problems));
}

function checkObject(
  value: unknown,
  schema: { kind: 'object'; fields: Readonly<Record<string, Schema>>; optional?: readonly string[] },
  path: string,
  problems: string[],
): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push(`${label(path)} doit être un objet JSON { … }.`);
    return;
  }
  const record = value as Record<string, unknown>;
  const prefix = path === '' ? '' : `${path}.`;
  for (const [key, fieldSchema] of Object.entries(schema.fields)) {
    if (!(key in record)) {
      if (!schema.optional?.includes(key)) problems.push(`la clé « ${prefix}${key} » est manquante.`);
      continue;
    }
    check(record[key], fieldSchema, `${prefix}${key}`, problems);
  }
  for (const key of Object.keys(record)) {
    if (!(key in schema.fields)) problems.push(`la clé « ${prefix}${key} » est inconnue (faute de frappe ?).`);
  }
}

/** A documented numeric variable (min and max are required: the workshop page needs bounds). */
export function variable(kind: 'integer' | 'number', min: number, max: number, doc: VariableDoc): Schema {
  return { kind, min, max, doc };
}

/** Paths of the numeric variables of a schema that lack documentation or bounds. */
export function undocumentedVariables(schema: Schema, path = ''): string[] {
  switch (schema.kind) {
    case 'integer':
    case 'number':
      return schema.doc && schema.min !== undefined && schema.max !== undefined ? [] : [path || '(racine)'];
    case 'array':
      return undocumentedVariables(schema.items, `${path}[]`);
    case 'record':
      return undocumentedVariables(schema.values, `${path}.*`);
    case 'object':
      return Object.entries(schema.fields).flatMap(([key, field]) => undocumentedVariables(field, path ? `${path}.${key}` : key));
    default:
      return [];
  }
}
