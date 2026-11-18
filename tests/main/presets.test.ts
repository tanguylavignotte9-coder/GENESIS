import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PresetStore, slug } from '../../src/main/presets';

describe('presets folder', () => {
  it('names the file after the preset, without accents or spaces', () => {
    expect(slug('Loups affamés !')).toBe('loups-affames');
    expect(slug('   ')).toBe('preset');
  });

  it('saves, lists, reads and deletes presets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'genesis-presets-'));
    const store = new PresetStore(dir);
    const entry = await store.save({ nom: 'Hivers rudes', valeurs: { 'climate.json': { 'snow.startCelsius': 3 } } });
    expect(entry).toEqual({ file: 'hivers-rudes.json', name: 'Hivers rudes' });
    expect(JSON.parse(readFileSync(join(dir, entry.file), 'utf8'))).toEqual({ nom: 'Hivers rudes', valeurs: { 'climate.json': { 'snow.startCelsius': 3 } } });
    writeFileSync(join(dir, 'casse.json'), '{ pas du json');
    expect(await store.list()).toEqual([
      { file: 'casse.json', name: 'casse.json (illisible)' },
      { file: 'hivers-rudes.json', name: 'Hivers rudes' },
    ]);
    expect((await store.read('hivers-rudes.json')).nom).toBe('Hivers rudes');
    await expect(store.read('../package.json')).rejects.toThrow(/invalide/);
    await store.remove('hivers-rudes.json');
    expect((await store.list()).map((preset) => preset.file)).toEqual(['casse.json']);
  });

  it('remembers the last active preset, forgotten when it is deleted or reset', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'genesis-presets-'));
    const store = new PresetStore(dir);
    expect(await store.active()).toBeNull();
    const entry = await store.save({ nom: 'Chasseurs', valeurs: {} });
    await store.setActive(entry.file);
    expect(await store.active()).toBe('chasseurs.json');
    expect((await store.list()).map((preset) => preset.file)).toEqual(['chasseurs.json']);
    await store.setActive(null);
    expect(await store.active()).toBeNull();
    await store.setActive(entry.file);
    await store.remove(entry.file);
    expect(await store.active()).toBeNull();
  });
});
