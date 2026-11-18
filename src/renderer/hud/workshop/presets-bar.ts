import type { PresetFile } from '../../../sim/core/workshop';
import type { GenesisBridge } from '../../../shared/bridge';

export interface PresetElements {
  list: HTMLSelectElement;
  load: HTMLButtonElement;
  remove: HTMLButtonElement;
  name: HTMLInputElement;
  save: HTMLButtonElement;
}

export interface PresetRequests {
  /** Asks the simulation for the current values as a preset (answered by `onPreset`). */
  makePreset(name: string): void;
  load(preset: PresetFile): void;
  saved(name: string): void;
  message(messages: string[], ok: boolean): void;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error);
}

/** Presets: save the current values under a name, load one, delete one (files of presets/). */
export class PresetsBar {
  constructor(
    private readonly ui: PresetElements,
    private readonly bridge: GenesisBridge | undefined,
    private readonly requests: PresetRequests,
  ) {
    if (!bridge) {
      for (const control of [ui.list, ui.load, ui.remove, ui.name, ui.save]) control.disabled = true;
      ui.name.placeholder = 'presets indisponibles hors du jeu';
      return;
    }
    ui.save.addEventListener('click', () => {
      const name = ui.name.value.trim();
      if (name === '') requests.message(['Donnez un nom au preset avant de l’enregistrer.'], false);
      else requests.makePreset(name);
    });
    ui.name.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') ui.save.click();
    });
    ui.load.addEventListener('click', () => void this.load());
    ui.remove.addEventListener('click', () => void this.remove());
    void this.refresh();
  }

  /** The simulation built the preset: write it to presets/. */
  async onPreset(preset: PresetFile): Promise<void> {
    if (!this.bridge) return;
    try {
      const entry = await this.bridge.savePreset(preset);
      await this.bridge.setActivePreset(entry.file);
      this.requests.saved(entry.name);
      this.requests.message([`Preset « ${entry.name} » enregistré dans presets/${entry.file}.`], true);
      await this.refresh(entry.file);
    } catch (error) {
      this.requests.message([`Impossible d’enregistrer le preset : ${errorText(error)}`], false);
    }
  }

  /**
   * At startup: reloads the last active preset (loaded or saved during a previous game), before the
   * first world is created. Returns false if there is none (default values).
   */
  async reloadActive(): Promise<boolean> {
    if (!this.bridge) return false;
    try {
      const file = await this.bridge.activePreset();
      if (!file) return false;
      this.requests.load((await this.bridge.readPreset(file)) as PresetFile);
      await this.refresh(file);
      return true;
    } catch (error) {
      this.requests.message([`Impossible de recharger le dernier preset : ${errorText(error)}`], false);
      return false;
    }
  }

  /** Back to the default values: no preset to reload at the next launch. */
  forgetActive(): void {
    void this.bridge?.setActivePreset(null);
  }

  private async refresh(select?: string): Promise<void> {
    if (!this.bridge) return;
    const entries = await this.bridge.listPresets();
    const options = entries.map((entry) => {
      const option = document.createElement('option');
      option.value = entry.file;
      option.textContent = entry.name;
      option.selected = entry.file === select;
      return option;
    });
    if (options.length === 0) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'aucun preset';
      options.push(empty);
    }
    this.ui.list.replaceChildren(...options);
    this.ui.load.disabled = entries.length === 0;
    this.ui.remove.disabled = entries.length === 0;
  }

  private async load(): Promise<void> {
    const file = this.ui.list.value;
    if (!this.bridge || file === '') return;
    try {
      this.requests.load((await this.bridge.readPreset(file)) as PresetFile);
      await this.bridge.setActivePreset(file);
    } catch (error) {
      this.requests.message([`Impossible de lire le preset : ${errorText(error)}`], false);
    }
  }

  private async remove(): Promise<void> {
    const file = this.ui.list.value;
    const name = this.ui.list.selectedOptions[0]?.textContent ?? file;
    if (!this.bridge || file === '' || !window.confirm(`Supprimer le preset « ${name} » ?`)) return;
    await this.bridge.deletePreset(file);
    this.requests.message([`Preset « ${name} » supprimé.`], true);
    await this.refresh();
  }
}
