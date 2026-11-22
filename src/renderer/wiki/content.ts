/**
 * The written content of the Wiki (data/wiki/*.json), validated like the other data files: a clear
 * French message names the file and the problem when one is invalid.
 *
 * - sommaire.json: the home page and the chapters of the index;
 * - libelles.json: the French words of the generated and live pages (never written in the code);
 * - every other file: written pages ({ "pages": [ … ] }).
 */
import { DataFileError, validateData, type Schema } from '../../sim/core/data-validation';
import { parseBody } from './markup';
import type { WikiChapter, WikiPage } from './model';

export type Labels = Readonly<Record<string, string>>;

/** A written page, with what it covers (systems of src/sim/systems, data files of the workshop). */
export interface WrittenPage extends WikiPage {
  systems: string[];
  dataFiles: string[];
  file: string;
}

export interface WikiContent {
  home: string;
  chapters: WikiChapter[];
  labels: Labels;
  pages: WrittenPage[];
}

export interface WikiFile {
  /** "monde.json" */
  name: string;
  content: unknown;
}

const PAGE_ID = { kind: 'string', pattern: /^[a-z0-9][a-z0-9._:-]*$/, patternHint: 'un identifiant en minuscules (a-z, 0-9, « - », « : », « . »)' } as const;
const TEXT: Schema = { kind: 'string' };
const TEXTS: Schema = { kind: 'array', items: TEXT };

const SUMMARY_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    home: PAGE_ID,
    chapters: {
      kind: 'array',
      minLength: 1,
      items: { kind: 'object', fields: { id: PAGE_ID, title: TEXT, order: { kind: 'number' }, summary: TEXT } },
    },
  },
};

const LABELS_SCHEMA: Schema = { kind: 'object', fields: { labels: { kind: 'record', values: TEXT } } };

const PAGES_SCHEMA: Schema = {
  kind: 'object',
  fields: {
    pages: {
      kind: 'array',
      minLength: 1,
      items: {
        kind: 'object',
        fields: { id: PAGE_ID, title: TEXT, chapter: PAGE_ID, order: { kind: 'number' }, summary: TEXT, keywords: TEXT, systems: TEXTS, dataFiles: TEXTS, body: { kind: 'array', minLength: 1, items: TEXT } },
        optional: ['keywords', 'systems', 'dataFiles', 'order'],
      },
    },
  },
};

interface RawPage {
  id: string;
  title: string;
  chapter: string;
  order?: number;
  summary: string;
  keywords?: string;
  systems?: string[];
  dataFiles?: string[];
  body: string[];
}

export const SUMMARY_FILE = 'sommaire.json';
export const LABELS_FILE = 'libelles.json';

/** Validates every file of data/wiki and returns the content. Throws a DataFileError (French) on a problem. */
export function parseWikiFiles(files: readonly WikiFile[]): WikiContent {
  const summaryFile = files.find((file) => file.name === SUMMARY_FILE);
  const labelsFile = files.find((file) => file.name === LABELS_FILE);
  if (!summaryFile) throw new DataFileError(`wiki/${SUMMARY_FILE}`, ['le fichier est introuvable.']);
  if (!labelsFile) throw new DataFileError(`wiki/${LABELS_FILE}`, ['le fichier est introuvable.']);
  const summary = validateData<{ home: string; chapters: WikiChapter[] }>(`wiki/${SUMMARY_FILE}`, summaryFile.content, SUMMARY_SCHEMA);
  const labels = validateData<{ labels: Record<string, string> }>(`wiki/${LABELS_FILE}`, labelsFile.content, LABELS_SCHEMA).labels;
  const chapterIds = new Set(summary.chapters.map((chapter) => chapter.id));
  const pages: WrittenPage[] = [];
  const seen = new Map<string, string>();
  for (const file of files) {
    if (file === summaryFile || file === labelsFile) continue;
    const raw = validateData<{ pages: RawPage[] }>(`wiki/${file.name}`, file.content, PAGES_SCHEMA);
    const problems: string[] = [];
    for (const page of raw.pages) {
      const other = seen.get(page.id);
      if (other !== undefined) problems.push(`la page « ${page.id} » existe déjà (dans ${other}).`);
      if (!chapterIds.has(page.chapter)) problems.push(`la page « ${page.id} » range sous le chapitre « ${page.chapter} », qui n’est pas dans ${SUMMARY_FILE}.`);
      seen.set(page.id, file.name);
      pages.push({
        id: page.id,
        title: page.title,
        chapter: page.chapter,
        order: page.order ?? 0,
        summary: page.summary,
        keywords: page.keywords ?? '',
        blocks: parseBody(page.body),
        systems: page.systems ?? [],
        dataFiles: page.dataFiles ?? [],
        file: file.name,
      });
    }
    if (problems.length > 0) throw new DataFileError(`wiki/${file.name}`, problems);
  }
  if (!seen.has(summary.home)) throw new DataFileError(`wiki/${SUMMARY_FILE}`, [`la page d’accueil « ${summary.home} » n’existe pas.`]);
  return { home: summary.home, chapters: summary.chapters, labels, pages };
}
