/**
 * What the generated pages are built from: the content of the data files with the values of the
 * workshop (modifications included), the list of variables, the French labels of data/wiki, and
 * the titles of every page (to write links).
 */
import type { RawGameData } from '../../../sim/core/game-data';
import type { WorkshopVariable } from '../../../sim/core/workshop';
import type { Labels } from '../content';

export type Entry = Record<string, unknown>;

export interface CatalogContext {
  raw: RawGameData;
  variables: readonly WorkshopVariable[];
  labels: Labels;
  /** Page id -> title, for every generated page (filled before relations are written). */
  titles: Map<string, string>;
  /** Variables shown by a generated page ("fichier.json:clé"): filled by the generation (coverage test). */
  covered: Set<string>;
}

export function isRecord(value: unknown): value is Entry {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value at a path of dotted keys ("species", "memories.kinds") inside a data file's content. */
export function at(root: unknown, path: string): unknown {
  let node = root;
  for (const key of path.split('.')) {
    if (!isRecord(node)) return undefined;
    node = node[key];
  }
  return node;
}

export function list(root: unknown, path: string): Entry[] {
  const value = at(root, path);
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function str(entry: Entry, key: string): string {
  const value = entry[key];
  return typeof value === 'string' ? value : '';
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A label of data/wiki/libelles.json, with its {placeholders} replaced. */
export function label(ctx: { labels: Labels }, key: string, values: Record<string, string> = {}): string {
  const text = ctx.labels[key];
  if (text === undefined) throw new Error(`Libellé du Wiki manquant : ${key}`);
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
}

/** A link to a page if it exists, else the plain text. */
export function link(ctx: CatalogContext, page: string, text?: string): string {
  const title = ctx.titles.get(page);
  if (title === undefined) return text ?? page;
  return text === undefined ? `[[${page}]]` : `[[${page}|${text}]]`;
}

/** Links to pages of one kind, joined by commas ("—" when there are none). */
export function links(ctx: CatalogContext, prefix: string, ids: readonly string[]): string {
  const unique = [...new Set(ids)];
  return unique.length === 0 ? '—' : unique.map((id) => link(ctx, `${prefix}:${id}`, ctx.titles.get(`${prefix}:${id}`) ?? id)).join(', ');
}
