import type { GenesisBridge } from '../../../shared/bridge';

/** Lines of the benchmark output kept on screen. */
const MAX_LINES = 40;

/** Runs the benchmark from the workshop (the game is paused meanwhile) and shows its progress. */
export class BenchmarkPanel {
  private lines: string[] = [];
  private running = false;

  constructor(
    private readonly button: HTMLButtonElement,
    private readonly log: HTMLElement,
    private readonly bridge: GenesisBridge | undefined,
    private readonly pause: () => void,
  ) {
    if (!bridge) {
      button.disabled = true;
      button.title = 'Disponible dans le jeu (ou avec Benchmark-GENESIS.bat)';
      return;
    }
    bridge.onBenchmarkLine((line) => this.print(line));
    button.addEventListener('click', () => void this.run());
  }

  private print(line: string): void {
    this.lines.push(line);
    if (this.lines.length > MAX_LINES) this.lines.shift();
    this.log.hidden = false;
    this.log.textContent = this.lines.join('\n');
    this.log.scrollTop = this.log.scrollHeight;
  }

  private async run(): Promise<void> {
    if (!this.bridge || this.running) return;
    if (!window.confirm('Le banc d’essai rejoue le test de charge (100 à 5 000 humains) et dure quelques minutes. Le jeu est mis en pause pendant ce temps. Lancer ?')) return;
    this.running = true;
    this.button.disabled = true;
    this.lines = [];
    this.pause();
    this.print('Banc d’essai en cours…');
    try {
      const result = await this.bridge.runBenchmark();
      this.print(result.message);
      if (result.reports.length > 0) this.print('Pour transmettre les résultats : validez (commit) le dossier rapports/ avec GitHub Desktop.');
    } finally {
      this.running = false;
      this.button.disabled = false;
    }
  }
}
