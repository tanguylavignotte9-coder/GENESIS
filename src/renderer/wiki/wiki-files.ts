/** The files of data/wiki, bundled by Vite (the display reads them at start, then validates them). */
import type { WikiFile } from './content';

const modules = import.meta.glob<{ default: unknown }>('../../../data/wiki/*.json', { eager: true });

export const WIKI_FILES: readonly WikiFile[] = Object.entries(modules).map(([path, module]) => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  content: module.default,
}));
