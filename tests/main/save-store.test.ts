import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SaveStore, saveSlug, type StoredMeta } from '../../src/main/save-store';

const meta = (label: string, savedAt: string): StoredMeta => ({
  formatVersion: 1,
  seed: 7,
  tick: 100,
  date: 'Jour 1 · Printemps · An 1',
  year: 1,
  population: 30,
  presetName: null,
  label,
  savedAt,
});

let dir = '';
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('save files', () => {
  it('writes, lists (newest first), reads back, shares and rotates the automatic slots', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'genesis-saves-'));
    const store = new SaveStore(dir);
    const body = Uint8Array.from({ length: 5000 }, (_, i) => i % 7);
    await store.write('auto-1.genesis', meta('Auto 1', '2026-01-01T10:00:00Z'), body);
    await store.write('auto-2.genesis', meta('Auto 2', '2026-01-01T09:00:00Z'), body);
    expect(await store.nextAutoFile(3)).toBe('auto-3.genesis');
    expect(await store.nextAutoFile(2)).toBe('auto-2.genesis');
    const read = await store.read('auto-1.genesis');
    expect(read.meta.label).toBe('Auto 1');
    expect([...read.body]).toEqual([...body]);
    expect(await store.share('auto-1.genesis')).toBe('partage/auto-1.genesis');
    await writeFile(path.join(dir, 'abime.genesis'), 'pas une sauvegarde');
    const list = await store.list();
    expect(list.map((entry) => entry.file)).toContain('partage/auto-1.genesis');
    expect(list.find((entry) => entry.file === 'abime.genesis')?.problem).toMatch(/pas une sauvegarde de GENESIS/);
    expect(list[0]!.meta?.label).toBe('Auto 1');
    await expect(store.read('../secret.genesis')).rejects.toThrow(/Nom de sauvegarde invalide/);
  });

  it('turns a name into a file name', () => {
    expect(saveSlug('Avant la famine !')).toBe('avant-la-famine');
    expect(saveSlug('???')).toBe('monde');
  });
});
