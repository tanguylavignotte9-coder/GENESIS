import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Guards the non-negotiable rules of CLAUDE.md on src/sim/. */
const SIM_DIR = join(__dirname, '..', 'src', 'sim');

function listTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listTsFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const FORBIDDEN: ReadonlyArray<[RegExp, string]> = [
  [/Math\.random\s*\(/, 'Math.random() (utiliser le générateur à graine)'],
  [/Date\.now\s*\(/, 'Date.now()'],
  [/performance\.now\s*\(/, 'performance.now()'],
  [/new Date\s*\(/, 'new Date()'],
  [/from\s+['"](electron|pixi\.js)/, 'import Electron/PixiJS'],
  [/from\s+['"]node:/, 'import de modules Node'],
  [/from\s+['"][./]*\/(renderer|main|worker)\//, 'import de renderer/, main/ ou worker/'],
  [/\b(document|window)\./, 'accès au DOM'],
];

describe('architecture rules for src/sim', () => {
  for (const file of listTsFiles(SIM_DIR)) {
    it(`${relative(SIM_DIR, file)} uses no forbidden API`, () => {
      const source = readFileSync(file, 'utf8');
      const violations = FORBIDDEN.filter(([pattern]) => pattern.test(source)).map(([, label]) => label);
      expect(violations).toEqual([]);
    });
  }
});
