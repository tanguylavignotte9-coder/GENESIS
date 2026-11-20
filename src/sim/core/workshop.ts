/**
 * The variables workshop, on the simulation side: the values of the next world, the values of the
 * running world, live changes, defaults and presets. Every change made while a world runs is written
 * in the journal, so that the history stays explainable.
 */
import { DataFileError } from './data-validation';
import { DATA_FILES, defaultRawData, parseGameData, type GameData, type RawGameData } from './game-data';
import type { Simulation } from './simulation';
import type { WorkshopState } from './save/save';
import {
  buildCatalog,
  cloneRaw,
  diffFromDefaults,
  formatValue,
  fullLabel,
  getAt,
  resolveKey,
  setAt,
  type VariableInfo,
  type VariableValue,
} from './variables';

export const VARIABLE_CHANGED = 'workshop.variable';

/** A preset: a name and only the values that differ from the defaults, by file then variable key. */
export interface PresetFile {
  nom: string;
  valeurs: Record<string, Record<string, VariableValue>>;
}

/** A variable of the workshop, with its value in the running world when it differs (a "new world" change). */
export interface WorkshopVariable extends VariableInfo {
  worldValue?: VariableValue;
}

export interface WorkshopResult {
  ok: boolean;
  /** French explanation when a change is refused, or warnings after loading a preset. */
  messages: string[];
}

interface Change {
  variable: VariableInfo;
  value: VariableValue;
}

const UNITLESS = new Set(['texte', 'choix', 'oui / non', 'sans unité', 'facteur', 'fraction', 'probabilité', 'poids']);

function errorText(error: unknown): string {
  return error instanceof DataFileError || error instanceof Error ? error.message : String(error);
}

export class Workshop {
  private readonly defaults: RawGameData = defaultRawData();
  /** Values for the next world (every change). */
  private pending: RawGameData = cloneRaw(this.defaults);
  /** Values the running world uses (live changes only). */
  private running: RawGameData | null = null;
  private simulation: Simulation | null = null;
  /** Name of the last loaded or saved preset (null = default values). */
  presetName: string | null = null;
  /** Changed since the preset was loaded or saved. */
  modified = false;

  /** Validated data for a new world: every change, "new world" ones included. */
  dataForNewWorld(): GameData {
    const data = parseGameData(cloneRaw(this.pending));
    this.running = cloneRaw(this.pending);
    return data;
  }

  /** What a save keeps of the workshop: the values the world runs with and the active preset. */
  state(): WorkshopState {
    return { raw: this.running ? cloneRaw(this.running) : null, presetName: this.presetName, modified: this.modified };
  }

  /** After loading a save: its values become those of the running world and of the next one. */
  restore(state: WorkshopState, simulation: Simulation): void {
    this.pending = cloneRaw(state.raw ?? this.defaults);
    this.running = cloneRaw(this.pending);
    this.presetName = state.presetName;
    this.modified = state.modified;
    this.simulation = simulation;
  }

  /** The world that live changes apply to (created from dataForNewWorld()). */
  attach(simulation: Simulation): void {
    this.simulation = simulation;
  }

  variables(): WorkshopVariable[] {
    const catalog: WorkshopVariable[] = buildCatalog(this.pending, this.defaults);
    if (this.running) {
      for (const variable of catalog) {
        const inWorld = getAt(this.running[variable.dataKey], variable.path);
        if (inWorld !== variable.value && (typeof inWorld === 'number' || typeof inWorld === 'string' || typeof inWorld === 'boolean')) variable.worldValue = inWorld;
      }
    }
    return catalog;
  }

  set(file: string, key: string, value: VariableValue): WorkshopResult {
    const variable = this.find(file, key);
    if (!variable) return { ok: false, messages: [`Variable inconnue : ${file} › ${key}.`] };
    return this.change([{ variable, value }], null);
  }

  reset(file: string, key: string): WorkshopResult {
    const variable = this.find(file, key);
    if (!variable) return { ok: false, messages: [`Variable inconnue : ${file} › ${key}.`] };
    return this.change([{ variable, value: variable.defaultValue }], null);
  }

  resetAll(): WorkshopResult {
    const changes = buildCatalog(this.pending, this.defaults)
      .filter((variable) => variable.value !== variable.defaultValue)
      .map((variable) => ({ variable, value: variable.defaultValue }));
    const result = this.change(changes, null);
    if (result.ok) {
      this.presetName = null;
      this.modified = false;
    }
    return result;
  }

  /** The current values as a preset (only the differences with the defaults). */
  toPreset(name: string): PresetFile {
    return { nom: name, valeurs: diffFromDefaults(buildCatalog(this.pending, this.defaults)) };
  }

  /** After the display saved the preset to a file. */
  markSaved(name: string): void {
    this.presetName = name;
    this.modified = false;
  }

  /** Every variable back to its default, then the preset's values; unknown or invalid entries are skipped. */
  loadPreset(preset: PresetFile): WorkshopResult {
    const warnings: string[] = [];
    const wanted = new Map<string, VariableValue>();
    for (const [file, values] of Object.entries(preset.valeurs ?? {})) {
      for (const [key, value] of Object.entries(values ?? {})) {
        const info = DATA_FILES.find((candidate) => candidate.file === file);
        if (!info || !resolveKey(this.defaults[info.key], key)) warnings.push(`Variable inconnue ignorée : ${file} › ${key}.`);
        else wanted.set(`${file}:${key}`, value);
      }
    }
    const changes: Change[] = [];
    for (const variable of buildCatalog(this.pending, this.defaults)) {
      const target = wanted.get(`${variable.file}:${variable.key}`) ?? variable.defaultValue;
      if (target !== variable.value) changes.push({ variable, value: target });
    }
    const origin = preset.nom;
    let result = this.change(changes, origin);
    if (!result.ok) {
      // Some values are no longer valid (older preset): apply the others one by one.
      result = { ok: true, messages: [] };
      for (const change of changes) {
        const single = this.change([change], origin);
        if (!single.ok) warnings.push(`Valeur refusée pour ${fullLabel(change.variable)} : ${single.messages.join(' ')}`);
      }
    }
    this.presetName = preset.nom;
    this.modified = false;
    return { ok: true, messages: [...warnings, ...result.messages] };
  }

  private find(file: string, key: string): VariableInfo | undefined {
    return buildCatalog(this.pending, this.defaults).find((variable) => variable.file === file && variable.key === key);
  }

  /** Validates the changes together, records them for the next world, writes them in the journal, applies the live ones. */
  private change(changes: readonly Change[], preset: string | null): WorkshopResult {
    if (changes.length === 0) return { ok: true, messages: [] };
    const candidate = cloneRaw(this.pending);
    for (const { variable, value } of changes) {
      if (typeof value !== typeof variable.value) return { ok: false, messages: [`${fullLabel(variable)} : valeur du mauvais type (${formatValue(value)}).`] };
      setAt(candidate[variable.dataKey], variable.path, value);
    }
    try {
      parseGameData(cloneRaw(candidate));
    } catch (error) {
      return { ok: false, messages: [errorText(error)] };
    }
    this.pending = candidate;
    this.modified = true;
    const messages = this.syncLive();
    this.writeJournal(changes, preset);
    return { ok: true, messages };
  }

  /** Brings every live variable of the running world to its workshop value. */
  private syncLive(): string[] {
    const simulation = this.simulation;
    const running = this.running;
    if (!simulation || !running) return [];
    const candidate = cloneRaw(running);
    const live: { dataKey: VariableInfo['dataKey']; path: VariableInfo['path']; value: VariableValue }[] = [];
    for (const variable of buildCatalog(this.pending, this.defaults)) {
      if (variable.apply !== 'live' || getAt(running[variable.dataKey], variable.path) === variable.value) continue;
      setAt(candidate[variable.dataKey], variable.path, variable.value);
      live.push({ dataKey: variable.dataKey, path: variable.path, value: variable.value });
    }
    if (live.length === 0) return [];
    try {
      parseGameData(cloneRaw(candidate));
    } catch (error) {
      return [`Ces valeurs ne peuvent pas s’appliquer au monde en cours (elles le seront au prochain monde) : ${errorText(error)}`];
    }
    simulation.applyLiveChanges(live);
    this.running = candidate;
    return [];
  }

  private writeJournal(changes: readonly Change[], preset: string | null): void {
    const simulation = this.simulation;
    if (!simulation) return;
    for (const { variable, value } of changes) {
      const unit = UNITLESS.has(variable.unit) ? '' : ` ${variable.unit}`;
      const when = variable.apply === 'live' ? '' : ' (au prochain monde)';
      const from = preset ? ` — préréglage « ${preset} »` : '';
      simulation.journal.publish({
        tick: simulation.clock.tick,
        type: VARIABLE_CHANGED,
        text: `Variable modifiée${when} : ${fullLabel(variable)} : ${formatValue(variable.value)} → ${formatValue(value)}${unit}${from}.`,
        place: null,
        actors: [],
        causes: [],
        details: { file: variable.file, key: variable.key, value: String(value) },
      });
    }
  }
}
