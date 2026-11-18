import type { PerfSnapshot } from '../../shared/messages';

const fr = new Intl.NumberFormat('fr-FR');
const PERCENT = 100;

/** Performance indicator (F3): frames per second, cost of a game day, budget, speeds, populations. */
export class PerfPanel {
  private perf: PerfSnapshot | null = null;

  constructor(private readonly panel: HTMLElement) {
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'F3') return;
      event.preventDefault();
      panel.hidden = !panel.hidden;
    });
  }

  setPerf(perf: PerfSnapshot): void {
    this.perf = perf;
  }

  update(fps: number): void {
    if (this.panel.hidden || !this.perf) return;
    const p = this.perf;
    const speed = p.paused ? 'en pause' : `x${fr.format(p.requestedSpeed)}`;
    const reached = p.paused ? '—' : `x${fr.format(Math.round(p.actualSpeed * 10) / 10)}`;
    const late = !p.paused && p.actualSpeed < p.requestedSpeed * 0.95;
    this.panel.innerHTML = '';
    const lines: [string, string, boolean?][] = [
      ['Images par seconde', fr.format(Math.round(fps))],
      ['Calcul d’un jour de jeu', `${fr.format(Math.round(p.msPerDay))} ms`],
      ['Part du budget utilisée', `${Math.round(p.busyShare * PERCENT)} %`],
      ['Vitesse demandée', speed],
      ['Vitesse atteinte', reached, late],
      ['Humains', fr.format(p.humans)],
      ['Animaux', fr.format(p.animals)],
      ['Plantes', fr.format(p.plants)],
    ];
    const title = document.createElement('div');
    title.className = 'stats-title';
    title.textContent = 'Performances (F3)';
    this.panel.append(title);
    for (const [label, value, warn] of lines) {
      const row = document.createElement('div');
      row.className = warn ? 'perf-row late' : 'perf-row';
      const name = document.createElement('span');
      name.textContent = label;
      const number = document.createElement('b');
      number.textContent = value;
      row.append(name, number);
      this.panel.append(row);
    }
    if (late) {
      const note = document.createElement('div');
      note.className = 'perf-note';
      note.textContent = 'Le PC ne suit pas cette vitesse : le jeu ralentit.';
      this.panel.append(note);
    }
  }
}
