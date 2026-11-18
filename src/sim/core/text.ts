/** Small helpers for French sentences built from data templates. */

/** Replaces every "{key}" of the template by its value. */
export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([^{}]+)\}/g, (match, key: string) => values[key] ?? match);
}

/** "de" + a plural noun, with elision: "de cerfs", "d'aurochs", "d'ours". */
export function deNoun(noun: string): string {
  return /^[aeiouyhâéèêëîïôûAEIOUYH]/.test(noun) ? `d'${noun}` : `de ${noun}`;
}
