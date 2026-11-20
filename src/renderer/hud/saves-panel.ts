import type { GenesisBridge, SaveEntry } from '../../shared/bridge';
import type { SaveReason } from '../../shared/messages';
import { incompatibility, type SaveMeta } from '../../sim/core/save/save';

const fr = new Intl.NumberFormat('fr-FR');
const MEGABYTE = 1_000_000;
const realDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export interface SavesPanelElements {
  panel: HTMLElement;
  toggle: HTMLButtonElement;
  name: HTMLInputElement;
  save: HTMLButtonElement;
  list: HTMLElement;
  message: HTMLElement;
}

/** What the panel asks of the simulation thread. */
export interface SavesPanelActions {
  /** Asks the worker for the world's bytes (answered through onSaveData). */
  requestSave(requestId: number, reason: SaveReason): void;
  load(body: Uint8Array, label: string): void;
}

/**
 * "Sauvegardes" panel (F5): save the running world under a name, and list every save (automatic,
 * at closing, named, shared) with its game date, seed and population, to load, share or delete it.
 * Also carries out the automatic saves and the save made when the game closes.
 */
export class SavesPanel {
  private nextRequest = 1;
  private readonly waiting = new Map<number, { label: string; done: () => void }>();
  private quitting = false;

  constructor(
    private readonly ui: SavesPanelElements,
    private readonly bridge: GenesisBridge | undefined,
    private readonly actions: SavesPanelActions,
  ) {
    ui.toggle.addEventListener('click', () => {
      ui.toggle.blur();
      this.toggle();
    });
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'F5') return;
      event.preventDefault();
      this.toggle();
    });
    ui.save.addEventListener('click', () => this.saveNow());
    ui.name.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') this.saveNow();
    });
    if (!bridge) {
      ui.save.disabled = true;
      this.show('Les sauvegardes ne sont possibles que dans le jeu lancé par Lancer-GENESIS.bat.', false);
    }
    bridge?.onBeforeQuit(() => this.quit());
  }

  /** The window closes: the world is saved in « fermeture » (if wanted), then the game may close. */
  private quit(): void {
    if (this.quitting || !this.bridge) return;
    this.quitting = true;
    const requestId = this.nextRequest++;
    this.waiting.set(requestId, { label: '', done: () => void this.bridge?.quitReady() });
    this.actions.requestSave(requestId, 'quit');
  }

  /** The worker sent the world's bytes (asked for, or an automatic save). */
  async onSaveData(requestId: number, reason: SaveReason, meta: SaveMeta, body: Uint8Array, autosaveSlots: number): Promise<void> {
    const request = this.waiting.get(requestId);
    this.waiting.delete(requestId);
    const bridge = this.bridge;
    if (!bridge) {
      request?.done();
      return;
    }
    try {
      const entry = await bridge.writeSave({ reason, label: request?.label ?? '', meta, body, autosaveSlots });
      if (reason !== 'quit') this.show(`${reason === 'auto' ? 'Sauvegarde automatique' : 'Monde sauvegardé'} : « ${entry.meta?.label ?? entry.file} » (${meta.date}).`, true);
    } catch (error) {
      this.show(`La sauvegarde a échoué : ${errorText(error)}`, false);
    }
    request?.done();
    if (!this.ui.panel.hidden) await this.refresh();
  }

  onSaveFailed(requestId: number, message: string): void {
    const request = this.waiting.get(requestId);
    this.waiting.delete(requestId);
    this.show(message, false);
    request?.done();
  }

  /** A loaded world is running. */
  onLoaded(label: string): void {
    this.show(`Monde chargé : « ${label} ».`, true);
  }

  private toggle(): void {
    this.ui.panel.hidden = !this.ui.panel.hidden;
    if (!this.ui.panel.hidden) void this.refresh();
  }

  private saveNow(): void {
    if (!this.bridge) return;
    const requestId = this.nextRequest++;
    this.waiting.set(requestId, { label: this.ui.name.value, done: () => undefined });
    this.ui.name.value = '';
    this.show('Sauvegarde en cours…', true);
    this.actions.requestSave(requestId, 'manual');
  }

  private async refresh(): Promise<void> {
    const bridge = this.bridge;
    if (!bridge) return;
    let entries: SaveEntry[];
    try {
      entries = await bridge.listSaves();
    } catch (error) {
      this.show(`Impossible de lire le dossier des sauvegardes : ${errorText(error)}`, false);
      return;
    }
    this.ui.list.replaceChildren(...entries.map((entry) => this.row(entry)));
    if (entries.length === 0) this.ui.list.textContent = 'Aucune sauvegarde pour l’instant.';
  }

  private row(entry: SaveEntry): HTMLElement {
    const row = document.createElement('li');
    const meta = entry.meta;
    const refusal = meta ? incompatibility(meta.formatVersion) : entry.problem;
    const title = document.createElement('div');
    title.className = 'save-title';
    title.textContent = meta ? `${meta.label}${entry.file.startsWith('partage/') ? ' · partagée' : ''}` : entry.file;
    const facts = document.createElement('div');
    facts.className = 'muted';
    facts.textContent = meta
      ? `${meta.date} · graine ${meta.seed} · ${fr.format(meta.population)} humain${meta.population > 1 ? 's' : ''}${meta.presetName ? ` · preset « ${meta.presetName} »` : ''} · ${realDate.format(new Date(meta.savedAt))} · ${(entry.bytes / MEGABYTE).toFixed(0)} Mo`
      : '';
    row.append(title, facts);
    if (refusal) {
      const problem = document.createElement('div');
      problem.className = 'form-error';
      problem.textContent = refusal;
      row.append(problem);
    }
    const buttons = document.createElement('div');
    buttons.className = 'save-buttons';
    buttons.append(
      button('Charger', refusal !== null, () => void this.load(entry)),
      button('Partager', entry.file.startsWith('partage/') || meta === null, () => void this.share(entry)),
      button('Supprimer', false, () => void this.remove(entry)),
    );
    row.append(buttons);
    return row;
  }

  private async load(entry: SaveEntry): Promise<void> {
    const bridge = this.bridge;
    if (!bridge) return;
    this.show('Chargement…', true);
    try {
      const { body } = await bridge.readSave(entry.file);
      this.actions.load(body, entry.meta?.label ?? entry.file);
    } catch (error) {
      this.show(`Impossible de charger « ${entry.file} » : ${errorText(error)}`, false);
    }
  }

  private async share(entry: SaveEntry): Promise<void> {
    try {
      const file = await this.bridge?.shareSave(entry.file);
      this.show(`Copiée dans sauvegardes/${file ?? ''} : elle sera envoyée avec le dépôt (GitHub Desktop) pour Claude Code.`, true);
    } catch (error) {
      this.show(`Partage impossible : ${errorText(error)}`, false);
    }
    await this.refresh();
  }

  private async remove(entry: SaveEntry): Promise<void> {
    if (!window.confirm(`Supprimer la sauvegarde « ${entry.meta?.label ?? entry.file} » ?`)) return;
    try {
      await this.bridge?.deleteSave(entry.file);
    } catch (error) {
      this.show(`Suppression impossible : ${errorText(error)}`, false);
    }
    await this.refresh();
  }

  private show(text: string, ok: boolean): void {
    this.ui.message.hidden = false;
    this.ui.message.textContent = text;
    this.ui.message.classList.toggle('error', !ok);
  }
}

function button(label: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.disabled = disabled;
  element.addEventListener('click', onClick);
  return element;
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  // Electron prefixes the errors of the main process: keep only the French message.
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
