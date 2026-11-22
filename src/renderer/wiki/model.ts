/**
 * What a page of the in-game Wiki is made of. Pure data (no DOM): written pages come from
 * data/wiki/*.json, generated pages from data/*.json, live pages from the running world.
 * Texts use the small markup of markup.ts ([[link]], {var:…}, **bold**).
 */

/** A button of a live page: centre the map, filter the journal, or open a tool. */
export type WikiAction =
  | { kind: 'map'; label: string; x: number; y: number }
  | { kind: 'journal'; label: string; tribe: number; search: string }
  | { kind: 'page'; label: string; page: string };

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'note'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  /** « Dans ta partie » box, filled from the running world when the page is shown. */
  | { kind: 'live'; id: string }
  | { kind: 'actions'; actions: WikiAction[] };

export interface WikiPage {
  id: string;
  title: string;
  /** Id of the chapter of the index it belongs to. */
  chapter: string;
  /** Order inside its chapter (then the title). */
  order: number;
  /** One sentence shown in the index and the search results. */
  summary: string;
  blocks: Block[];
  /** Extra words for the search. */
  keywords: string;
}

/** A chapter of the index. */
export interface WikiChapter {
  id: string;
  title: string;
  order: number;
  summary: string;
}

/** Lower case without accents, for the search and the ids. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
