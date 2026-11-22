/**
 * Saving and loading a whole world: the simulation (map, plants, animals, people, relations,
 * objects, buildings, random generator, clock…), its journal, and the variables workshop's state
 * (active preset, changed variables). A loaded world continues exactly as if it had never stopped.
 *
 * Bytes of a save body: [u32 format version][graph of the world (see graph.ts)]. The host (game or
 * command line) compresses it and writes it with its description (SaveMeta) in front.
 */
import { formatDate } from '../calendar';
import { DataFileError } from '../data-validation';
import { cloneRaw } from '../variables';
import { parseGameData, type RawGameData } from '../game-data';
import { Simulation } from '../simulation';
import { SAVED_CLASSES } from './classes';
import { readGraph, SaveError, writeGraph } from './graph';

export { SaveError } from './graph';

/**
 * Version of the save format. Change it whenever the simulation's state changes shape (new field,
 * new class, new data variable): older saves are then refused with a clear message.
 */
export const SAVE_FORMAT_VERSION = 8;

const VERSION_BYTES = 4;

/** What the variables workshop knew when the world was saved. */
export interface WorkshopState {
  /** Raw values of the data files the world runs with (null: the bundled defaults). */
  raw: RawGameData | null;
  presetName: string | null;
  modified: boolean;
}

/** Description of a save, readable without loading the world (menu of saves). */
export interface SaveMeta {
  formatVersion: number;
  seed: number;
  tick: number;
  /** "Jour 3 · Été · An 12" */
  date: string;
  year: number;
  /** Living humans. */
  population: number;
  presetName: string | null;
}

interface SavedRoot {
  simulation: Simulation;
  workshop: WorkshopState;
}

export function describeSave(simulation: Simulation, presetName: string | null): SaveMeta {
  const date = simulation.date;
  return {
    formatVersion: SAVE_FORMAT_VERSION,
    seed: simulation.seed,
    tick: simulation.clock.tick,
    date: formatDate(date, simulation.data.time),
    year: date.year,
    population: simulation.humans.people.living,
    presetName,
  };
}

/** The world as bytes. Does not change the world. */
export function saveWorld(simulation: Simulation, workshop: WorkshopState = { raw: null, presetName: null, modified: false }): { meta: SaveMeta; body: Uint8Array } {
  const root: SavedRoot = { simulation, workshop };
  const graph = writeGraph(root, SAVED_CLASSES);
  const body = new Uint8Array(VERSION_BYTES + graph.length);
  new DataView(body.buffer).setUint32(0, SAVE_FORMAT_VERSION, true);
  body.set(graph, VERSION_BYTES);
  return { meta: describeSave(simulation, workshop.presetName), body };
}

/** French refusal for a save of another format version, or null if it can be loaded. */
export function incompatibility(formatVersion: number): string | null {
  if (formatVersion === SAVE_FORMAT_VERSION) return null;
  return formatVersion < SAVE_FORMAT_VERSION
    ? `Sauvegarde incompatible : elle a été faite par une version plus ancienne du jeu (format ${formatVersion}, ce jeu lit le format ${SAVE_FORMAT_VERSION}). Le monde ne peut pas être repris.`
    : `Sauvegarde incompatible : elle a été faite par une version plus récente du jeu (format ${formatVersion}, ce jeu lit le format ${SAVE_FORMAT_VERSION}). Mettez le jeu à jour.`;
}

/** Rebuilds a saved world. Throws a SaveError (French message) if the save cannot be loaded. */
export function loadWorld(body: Uint8Array): { simulation: Simulation; workshop: WorkshopState } {
  if (body.length < VERSION_BYTES) throw new SaveError('Sauvegarde illisible : fichier tronqué.');
  const version = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, true);
  const refusal = incompatibility(version);
  if (refusal) throw new SaveError(refusal);
  const root = readGraph(body.subarray(VERSION_BYTES), SAVED_CLASSES) as Partial<SavedRoot> | null;
  if (!root || !(root.simulation instanceof Simulation) || !root.workshop) throw new SaveError('Sauvegarde illisible : ce n’est pas un monde de GENESIS.');
  if (root.workshop.raw) {
    try {
      parseGameData(cloneRaw(root.workshop.raw));
    } catch (error) {
      const detail = error instanceof DataFileError || error instanceof Error ? error.message : String(error);
      throw new SaveError(`Sauvegarde incompatible : ses variables ne sont plus valides pour cette version du jeu. ${detail}`);
    }
  }
  return { simulation: root.simulation, workshop: root.workshop };
}
