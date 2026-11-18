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

/**
 * "Aucun système ne modifie directement les données d'un autre" (CLAUDE.md, rule 5): inside a system
 * folder, the objects of the other systems may be read or asked through their own methods, never
 * written (no assignment into their arrays, no call to their storage mutators).
 */
const SYSTEMS_DIR = join(SIM_DIR, 'systems');
const FOREIGN_NAMES: Record<string, string[]> = {
  world: ['fauna', 'flora', 'humans', 'people'],
  flora: ['fauna', 'humans', 'people', 'world', 'climate', 'weather'],
  fauna: ['flora', 'humans', 'people', 'world', 'climate', 'weather'],
  individuals: ['fauna', 'flora', 'world', 'climate', 'weather', 'production'],
  production: ['fauna', 'flora', 'humans', 'people', 'world', 'climate', 'weather'],
};
const MUTATORS = 'place|kill|spawn|add|remove|insert|clear|fill|set|push|splice';

describe('system boundaries', () => {
  it('every system folder is covered by this check', () => {
    expect(readdirSync(SYSTEMS_DIR).sort()).toEqual(Object.keys(FOREIGN_NAMES).sort());
  });
  for (const [system, names] of Object.entries(FOREIGN_NAMES)) {
    for (const file of listTsFiles(join(SYSTEMS_DIR, system))) {
      it(`${system}/${relative(join(SYSTEMS_DIR, system), file)} never writes into another system's data`, () => {
        const source = readFileSync(file, 'utf8');
        const found: string[] = [];
        for (const name of names) {
          const write = new RegExp(`\\b${name}\\.[\\w.]+\\[[^\\]]*\\]!?\\s*[-+*/]?=(?!=)`, 'g');
          const mutate = new RegExp(`\\b${name}\\.(?:\\w+\\.)*(?:${MUTATORS})\\(`, 'g');
          found.push(...(source.match(write) ?? []), ...(source.match(mutate) ?? []));
        }
        expect(found).toEqual([]);
      });
    }
  }
});
