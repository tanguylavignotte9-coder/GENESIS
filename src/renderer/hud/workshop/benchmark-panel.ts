import type { GenesisBridge, RenderTestResult } from '../../../shared/bridge';

/** Lines of the benchmark output kept on screen. */
const MAX_LINES = 40;
const OVERLAY_LINES = 6;
/** After an automatic benchmark (Benchmark-GENESIS.bat), the window closes after this delay. */
const AUTO_QUIT_MS = 8000;

export interface BenchmarkActions {
  /** The in-game render test (the map must be visible). */
  renderTest(print: (line: string) => void): Promise<RenderTestResult>;
  pause(): void;
  /** Hides the workshop page so that the map is drawn during the render test. */
  showMap(): void;
  /** A new ordinary world once the benchmark is over (the benchmark world uses default values). */
  newWorld(): void;
}

/**
 * Runs the benchmark from the workshop or automatically (Benchmark-GENESIS.bat): first the render
 * test in the game, then the load test (game paused), then the dated report in rapports/.
 */
export class BenchmarkPanel {
  private lines: string[] = [];
  private running = false;

  constructor(
    private readonly button: HTMLButtonElement,
    private readonly log: HTMLElement,
    private readonly overlay: HTMLElement,
    private readonly bridge: GenesisBridge | undefined,
    private readonly actions: BenchmarkActions,
  ) {
    if (!bridge) {
      button.disabled = true;
      button.title = 'Disponible dans le jeu (ou avec Benchmark-GENESIS.bat)';
      return;
    }
    bridge.onBenchmarkLine((line) => this.print(line));
    button.addEventListener('click', () => void this.run(false));
  }

  /** When the game was launched by Benchmark-GENESIS.bat, runs the whole benchmark at once. */
  async startIfAuto(): Promise<void> {
    if (this.bridge && (await this.bridge.isAutoBenchmark())) await this.run(true);
  }

  private print(line: string): void {
    this.lines.push(line);
    if (this.lines.length > MAX_LINES) this.lines.shift();
    this.log.hidden = false;
    this.log.textContent = this.lines.join('\n');
    this.log.scrollTop = this.log.scrollHeight;
    this.overlay.textContent = this.lines.slice(-OVERLAY_LINES).join('\n');
  }

  private async run(auto: boolean): Promise<void> {
    if (!this.bridge || this.running) return;
    const question =
      'Le banc d’essai mesure d’abord l’affichage (environ 3 minutes : un monde de test remplace le monde actuel, ne touchez à rien), puis la simulation de 100 à 5 000 humains (quelques minutes, jeu en pause). Lancer ?';
    if (!auto && !window.confirm(question)) return;
    this.running = true;
    this.button.disabled = true;
    this.lines = [];
    this.overlay.hidden = false;
    this.actions.showMap();
    this.print('Banc d’essai en cours…');
    let ok = false;
    try {
      let render: RenderTestResult | null = null;
      try {
        render = await this.actions.renderTest((line) => this.print(line));
      } catch (error) {
        this.print(`Test de rendu impossible : ${error instanceof Error ? error.message : String(error)}`);
      }
      this.actions.pause();
      const result = await this.bridge.runBenchmark(render);
      this.print(result.message);
      ok = result.ok;
      if (result.reports.length > 0) this.print('Pour transmettre les résultats : validez (commit) le dossier rapports/ avec GitHub Desktop.');
    } finally {
      this.running = false;
      this.button.disabled = false;
      this.actions.newWorld();
      if (auto && ok) {
        this.print('La fenêtre va se fermer.');
        setTimeout(() => void this.bridge?.quit(), AUTO_QUIT_MS);
      } else setTimeout(() => (this.overlay.hidden = true), AUTO_QUIT_MS);
    }
  }
}
