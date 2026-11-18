import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { undocumentedVariables } from '../../../src/sim/core/data-validation';
import { DATA_FILES } from '../../../src/sim/core/game-data';

const DATA_DIR = join(__dirname, '..', '..', '..', 'data');

describe('variables documentation (workshop)', () => {
  it('every data/*.json file is registered for the variables workshop', () => {
    const files = readdirSync(DATA_DIR).filter((name) => name.endsWith('.json')).sort();
    expect(DATA_FILES.map((info) => info.file).sort()).toEqual(files);
  });

  for (const info of DATA_FILES) {
    it(`every variable of ${info.file} has a label, help, unit, apply mode (and bounds for numbers)`, () => {
      expect(undocumentedVariables(info.schema)).toEqual([]);
    });
  }
});
