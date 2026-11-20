/**
 * Save files of the game, in sauvegardes/ (ignored by git) and sauvegardes/partage/ (kept in the
 * repository, to hand a world over to Claude Code). Plain Node: used by the game's main process,
 * by `npm run sim` and by the tests.
 *
 * File: the line "GENESIS-SAUVEGARDE", a u32 (little endian) length, the description in JSON
 * (readable without loading the world), then the world's bytes compressed with gzip.
 */
import { mkdir, readdir, readFile, rename, rm, stat, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const MAGIC = Buffer.from('GENESIS-SAUVEGARDE\n', 'ascii');
const LENGTH_BYTES = 4;
/** Fast compression: a 80 MB world takes about 0.5 s and 15 MB on disk. */
const GZIP_LEVEL = 1;
export const SAVE_EXTENSION = '.genesis';
export const SHARE_FOLDER = 'partage';
const FILE_PATTERN = /^[a-z0-9-]+\.genesis$/;

/** Description of a save written by the simulation. */
export interface WorldMeta {
  formatVersion: number;
  seed: number;
  tick: number;
  date: string;
  year: number;
  population: number;
  presetName: string | null;
}

/** Description of a save file: the simulation's, completed here. */
export interface StoredMeta extends WorldMeta {
  /** Name shown in the menu ("Auto 2", "Fermeture", or the player's name). */
  label: string;
  /** Real date of the save (ISO). */
  savedAt: string;
}

export interface SaveEntry {
  /** Path relative to sauvegardes/ ("auto-1.genesis", "partage/loups.genesis"). */
  file: string;
  meta: StoredMeta | null;
  /** French reason when the file cannot be read. */
  problem: string | null;
  bytes: number;
}

/** "Avant la famine !" → "avant-la-famine" */
export function saveSlug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base === '' ? 'monde' : base.slice(0, 60);
}

/** Compressed in the background: the game's window does not freeze while saving. */
export async function encodeSaveFile(meta: StoredMeta, body: Uint8Array): Promise<Buffer> {
  const json = Buffer.from(JSON.stringify(meta), 'utf8');
  const length = Buffer.alloc(LENGTH_BYTES);
  length.writeUInt32LE(json.length, 0);
  return Buffer.concat([MAGIC, length, json, await gzipAsync(body, { level: GZIP_LEVEL })]);
}

function headerOf(file: Buffer): { meta: StoredMeta; bodyStart: number } {
  if (file.length < MAGIC.length + LENGTH_BYTES || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Ce fichier n’est pas une sauvegarde de GENESIS.');
  }
  const length = file.readUInt32LE(MAGIC.length);
  const start = MAGIC.length + LENGTH_BYTES;
  if (start + length > file.length) throw new Error('Sauvegarde tronquée.');
  const meta = JSON.parse(file.subarray(start, start + length).toString('utf8')) as StoredMeta;
  return { meta, bodyStart: start + length };
}

export async function decodeSaveFile(file: Buffer): Promise<{ meta: StoredMeta; body: Uint8Array }> {
  const { meta, bodyStart } = headerOf(file);
  let body: Buffer;
  try {
    body = await gunzipAsync(file.subarray(bodyStart));
  } catch {
    throw new Error('Sauvegarde abîmée : le monde ne peut pas être décompressé.');
  }
  return { meta, body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength) };
}

export async function writeSaveFile(filePath: string, meta: StoredMeta, body: Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  // Written next to it then renamed: a crash while writing never destroys the previous save.
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, await encodeSaveFile(meta, body));
  await rename(temporary, filePath);
}

export async function readSaveFile(filePath: string): Promise<{ meta: StoredMeta; body: Uint8Array }> {
  return decodeSaveFile(await readFile(filePath));
}

/** The saves of a folder and its share sub-folder. */
export class SaveStore {
  constructor(readonly dir: string) {}

  private resolve(file: string): string {
    const parts = file.split('/');
    const valid = (parts.length === 1 && FILE_PATTERN.test(parts[0]!)) || (parts.length === 2 && parts[0] === SHARE_FOLDER && FILE_PATTERN.test(parts[1]!));
    if (!valid) throw new Error(`Nom de sauvegarde invalide : « ${file} ».`);
    return path.join(this.dir, ...parts);
  }

  async list(): Promise<SaveEntry[]> {
    const entries: SaveEntry[] = [];
    for (const folder of ['', SHARE_FOLDER]) {
      let names: string[];
      try {
        names = (await readdir(path.join(this.dir, folder))).filter((name) => FILE_PATTERN.test(name));
      } catch {
        continue;
      }
      for (const name of names.sort()) {
        const file = folder ? `${folder}/${name}` : name;
        const full = path.join(this.dir, folder, name);
        const bytes = (await stat(full)).size;
        try {
          entries.push({ file, meta: headerOf(await readFile(full)).meta, problem: null, bytes });
        } catch (error) {
          entries.push({ file, meta: null, problem: error instanceof Error ? error.message : String(error), bytes });
        }
      }
    }
    return entries.sort((a, b) => (b.meta?.savedAt ?? '').localeCompare(a.meta?.savedAt ?? ''));
  }

  async write(file: string, meta: StoredMeta, body: Uint8Array): Promise<SaveEntry> {
    const full = this.resolve(file);
    await writeSaveFile(full, meta, body);
    return { file, meta, problem: null, bytes: (await stat(full)).size };
  }

  async read(file: string): Promise<{ meta: StoredMeta; body: Uint8Array }> {
    return readSaveFile(this.resolve(file));
  }

  async remove(file: string): Promise<void> {
    await rm(this.resolve(file), { force: true });
  }

  /** Copies a save into partage/ (kept in the repository) and returns its new name. */
  async share(file: string): Promise<string> {
    const name = path.basename(file);
    const target = `${SHARE_FOLDER}/${name}`;
    if (target !== file) {
      await mkdir(path.join(this.dir, SHARE_FOLDER), { recursive: true });
      await copyFile(this.resolve(file), this.resolve(target));
    }
    return target;
  }

  /** File for the next automatic save: an empty slot, or the oldest of `slots`. */
  async nextAutoFile(slots: number): Promise<string> {
    const saves = await this.list();
    let oldest = '';
    let oldestAt = '￿';
    for (let k = 1; k <= slots; k++) {
      const file = `auto-${k}${SAVE_EXTENSION}`;
      const found = saves.find((entry) => entry.file === file);
      if (!found) return file;
      const at = found.meta?.savedAt ?? '';
      if (at < oldestAt) {
        oldestAt = at;
        oldest = file;
      }
    }
    return oldest;
  }
}
