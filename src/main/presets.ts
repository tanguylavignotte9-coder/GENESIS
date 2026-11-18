/** Presets of the variables workshop: JSON files in presets/ (kept in the repository). */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface PresetEntry {
  file: string;
  name: string;
}

interface PresetContent {
  nom: string;
  valeurs: Record<string, Record<string, unknown>>;
}

const PRESET_FILE = /^[a-z0-9-]+\.json$/;

/** "Loups affamés !" → "loups-affames" */
export function slug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base === '' ? 'preset' : base.slice(0, 60);
}

function checkedFile(file: string): string {
  if (!PRESET_FILE.test(file)) throw new Error(`Nom de fichier de preset invalide : « ${file} ».`);
  return file;
}

function isPreset(value: unknown): value is PresetContent {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['nom'] === 'string' && typeof record['valeurs'] === 'object' && record['valeurs'] !== null;
}

export class PresetStore {
  constructor(private readonly dir: string) {}

  async list(): Promise<PresetEntry[]> {
    await mkdir(this.dir, { recursive: true });
    const files = (await readdir(this.dir)).filter((file) => PRESET_FILE.test(file)).sort();
    const entries: PresetEntry[] = [];
    for (const file of files) {
      try {
        const content: unknown = JSON.parse(await readFile(path.join(this.dir, file), 'utf8'));
        entries.push({ file, name: isPreset(content) ? content.nom : file });
      } catch {
        entries.push({ file, name: `${file} (illisible)` });
      }
    }
    return entries;
  }

  async read(file: string): Promise<PresetContent> {
    const content: unknown = JSON.parse(await readFile(path.join(this.dir, checkedFile(file)), 'utf8'));
    if (!isPreset(content)) throw new Error(`Le preset « ${file} » doit contenir « nom » (texte) et « valeurs » (objet).`);
    return content;
  }

  async save(preset: unknown): Promise<PresetEntry> {
    if (!isPreset(preset) || preset.nom.trim() === '') throw new Error('Preset invalide : il faut un nom.');
    await mkdir(this.dir, { recursive: true });
    const file = `${slug(preset.nom)}.json`;
    await writeFile(path.join(this.dir, file), `${JSON.stringify({ nom: preset.nom.trim(), valeurs: preset.valeurs }, null, 2)}\n`, 'utf8');
    return { file, name: preset.nom.trim() };
  }

  async remove(file: string): Promise<void> {
    await rm(path.join(this.dir, checkedFile(file)), { force: true });
  }
}
