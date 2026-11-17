/**
 * Minimal schema validation for data/*.json files.
 * Errors are written in French because the player may edit these files.
 */

export interface IntegerRule {
  kind: 'integer';
  min: number;
}

export type ObjectSchema = Readonly<Record<string, IntegerRule>>;

export class DataFileError extends Error {
  constructor(fileName: string, problems: readonly string[]) {
    super(`Le fichier de données « ${fileName} » est invalide :\n- ${problems.join('\n- ')}`);
    this.name = 'DataFileError';
  }
}

/** Checks `raw` against `schema` and returns it typed, or throws a DataFileError listing every problem. */
export function validateObject<T>(fileName: string, raw: unknown, schema: ObjectSchema): T {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new DataFileError(fileName, ['le contenu doit être un objet JSON { … }.']);
  }
  const record = raw as Record<string, unknown>;
  const problems: string[] = [];

  for (const [key, rule] of Object.entries(schema)) {
    if (!(key in record)) {
      problems.push(`la clé « ${key} » est manquante.`);
      continue;
    }
    const problem = checkRule(record[key], rule);
    if (problem) problems.push(`« ${key} » ${problem}`);
  }
  for (const key of Object.keys(record)) {
    if (!(key in schema)) problems.push(`la clé « ${key} » est inconnue (faute de frappe ?).`);
  }

  if (problems.length > 0) throw new DataFileError(fileName, problems);
  return record as T;
}

function checkRule(value: unknown, rule: IntegerRule): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < rule.min) {
    return `doit être un nombre entier supérieur ou égal à ${rule.min} (valeur trouvée : ${JSON.stringify(value)}).`;
  }
  return null;
}
