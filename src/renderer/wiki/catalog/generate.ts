/**
 * Generated pages (the catalog): one page per species, plant, biome, knowledge, recipe, item,
 * building, trait, regime… built from the data files, plus one page per data file for the variables
 * that belong to no entry. Values are cited as {var:…}: the Wiki shows them live, with their unit.
 */
import type { WorkshopVariable } from '../../../sim/core/workshop';
import type { Block, WikiPage } from '../model';
import { at, capitalize, isRecord, label, str, type CatalogContext, type Entry } from './context';
import { catalogChapter, ENTRY_KINDS, type EntryKind } from './kinds';
import { relationsOf } from './relations';

/** Chapter of the pages of the data files' variables. */
export const VARIABLES_CHAPTER = 'catalogue-variables';

interface Found {
  kind: EntryKind;
  key: string;
  entry: Entry;
  page: string;
  title: string;
}

/** Every entry of every kind, with its page id and title. */
function entries(ctx: CatalogContext): Found[] {
  const out: Found[] = [];
  for (const kind of ENTRY_KINDS) {
    const container = at(ctx.raw[kind.dataKey], kind.path);
    const pairs: [string, Entry][] = kind.record
      ? isRecord(container)
        ? Object.entries(container).filter((pair): pair is [string, Entry] => isRecord(pair[1]))
        : []
      : Array.isArray(container)
        ? container.filter(isRecord).map((entry) => [str(entry, 'id'), entry])
        : [];
    for (const [key, entry] of pairs) {
      if (key === '') continue;
      const name = str(entry, 'name') || key;
      out.push({ kind, key, entry, page: `${kind.prefix}:${key}`, title: capitalize(name) });
    }
  }
  return out;
}

/** Catalog key prefix of an entry's variables ("species.wolf."). */
function keyPrefix(found: Pick<Found, 'kind' | 'key'>): string {
  return `${found.kind.path}.${found.key}.`;
}

/** Words of a variable key that tell which kind of page an id names, when several kinds share it. */
const KIND_HINTS: readonly [RegExp, string][] = [
  [/knowledge|requires/i, 'savoir'],
  [/skill/i, 'competence'],
  [/station|building/i, 'batiment'],
  [/items?\b|item\.|tools|feed/i, 'objet'],
  [/resource/i, 'ressource'],
  [/species|prey|hunters|predators/i, 'animal'],
  [/biome|habitat/i, 'biome'],
];

/** A value cell: a link when a text value names a generated page (the key tells which kind if needed), else the live value. */
function valueCell(ctx: CatalogContext, variable: WorkshopVariable, byId: Map<string, string[]>): string {
  ctx.covered.add(`${variable.file}:${variable.key}`);
  if (variable.kind === 'string' && typeof variable.value === 'string') {
    const pages = byId.get(variable.value) ?? [];
    if (pages.length === 1) return `[[${pages[0]}]]`;
    // The end of the key ("make_spear.knowledge", "prey.0") says what the value is.
    const end = variable.key.split('.').slice(-2).join('.');
    for (const [pattern, prefix] of KIND_HINTS) {
      const page = pages.find((id) => id.startsWith(`${prefix}:`));
      if (page && pattern.test(end)) return `[[${page}]]`;
    }
  }
  return `{var:${variable.file}:${variable.key}}`;
}

function propertyTable(ctx: CatalogContext, variables: readonly WorkshopVariable[], byId: Map<string, string[]>): Block[] {
  for (const variable of variables) ctx.covered.add(`${variable.file}:${variable.key}`);
  const rows = variables.filter((variable) => !variable.key.endsWith('.id')).map((variable) => [variable.label, valueCell(ctx, variable, byId)]);
  if (rows.length === 0) return [];
  return [
    { kind: 'heading', text: label(ctx, 'heading.properties') },
    { kind: 'table', head: [label(ctx, 'table.variable'), label(ctx, 'table.value')], rows },
  ];
}

function entryPage(ctx: CatalogContext, found: Found, variables: readonly WorkshopVariable[], byId: Map<string, string[]>): WikiPage {
  const description = str(found.entry, 'description');
  const kindName = label(ctx, `kind.${found.kind.prefix}`);
  const blocks: Block[] = [];
  if (description) blocks.push({ kind: 'paragraph', text: description });
  blocks.push(...relationsOf(ctx, found.kind.prefix, found.entry));
  blocks.push(...propertyTable(ctx, variables, byId));
  blocks.push({ kind: 'note', text: label(ctx, 'note.generated', { fichier: found.kind.file, chapitre: `[[${catalogChapter(found.kind)}]]` }) });
  return {
    id: found.page,
    title: found.title,
    chapter: catalogChapter(found.kind),
    order: 0,
    summary: description || kindName,
    blocks,
    keywords: `${found.key} ${kindName}`,
  };
}

/** One page per data file: its variables that belong to no entry, by section, and its entries. */
function filePage(ctx: CatalogContext, file: string, variables: readonly WorkshopVariable[], children: readonly Found[]): WikiPage {
  const blocks: Block[] = [{ kind: 'paragraph', text: label(ctx, 'file.intro', { fichier: file }) }];
  const kinds = [...new Set(children.map((child) => child.kind))];
  for (const kind of kinds) {
    blocks.push({ kind: 'heading', text: label(ctx, `kind.${kind.prefix}.plural`) });
    blocks.push({ kind: 'paragraph', text: children.filter((child) => child.kind === kind).map((child) => `[[${child.page}]]`).join(' · ') });
  }
  let section: string | null = null;
  let rows: string[][] = [];
  const flush = (): void => {
    if (section !== null && rows.length > 0) {
      blocks.push({ kind: 'heading', text: section === '' ? label(ctx, 'file.general') : section });
      blocks.push({ kind: 'table', head: [label(ctx, 'table.variable'), label(ctx, 'table.value'), label(ctx, 'table.meaning')], rows });
    }
    rows = [];
  };
  for (const variable of variables) {
    if (variable.section !== section) {
      flush();
      section = variable.section;
    }
    ctx.covered.add(`${variable.file}:${variable.key}`);
    rows.push([variable.label, `{var:${variable.file}:${variable.key}}`, variable.help]);
  }
  flush();
  return {
    id: `fichier:${file}`,
    title: label(ctx, 'file.title', { fichier: file }),
    chapter: VARIABLES_CHAPTER,
    order: 0,
    summary: label(ctx, 'file.summary', { systeme: variables[0]?.system ?? children[0]?.kind.file ?? '' }),
    blocks,
    keywords: file,
  };
}

/** Every generated page. `ctx.titles` is filled on the way (links need every title). */
export function generateCatalog(ctx: CatalogContext): WikiPage[] {
  const found = entries(ctx);
  const byId = new Map<string, string[]>();
  for (const item of found) {
    ctx.titles.set(item.page, item.title);
    byId.set(item.key, [...(byId.get(item.key) ?? []), item.page]);
  }
  const byFile = new Map<string, WorkshopVariable[]>();
  for (const variable of ctx.variables) byFile.set(variable.file, [...(byFile.get(variable.file) ?? []), variable]);
  for (const file of byFile.keys()) ctx.titles.set(`fichier:${file}`, label(ctx, 'file.title', { fichier: file }));
  const pages: WikiPage[] = [];
  const claimed = new Set<string>();
  for (const item of found) {
    const prefix = keyPrefix(item);
    const own = (byFile.get(item.kind.file) ?? []).filter((variable) => variable.key.startsWith(prefix));
    for (const variable of own) claimed.add(`${variable.file}:${variable.key}`);
    pages.push(entryPage(ctx, item, own, byId));
  }
  for (const [file, variables] of byFile) {
    const rest = variables.filter((variable) => !claimed.has(`${variable.file}:${variable.key}`));
    pages.push(filePage(ctx, file, rest, found.filter((item) => item.kind.file === file)));
  }
  return pages;
}
