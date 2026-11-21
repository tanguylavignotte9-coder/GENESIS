import type { AnimalSpecies } from '../../sim/systems/fauna/params';
import type { HistorySample, HumanStats } from '../../shared/messages';
import { HistoryView } from './history-view';
import { HumanStatsView } from './human-stats';

const PADDING = { left: 44, right: 10, top: 10, bottom: 22 };
const GRID_LINES = 4;
/** Distinct line colors (display only), one per species in data order. */
const PALETTE = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#dcbeff', '#9a6324', '#aaffc3'];
const lineColor = (k: number): string => PALETTE[k % PALETTE.length]!;

/** The elements of the human tab. */
export interface HumanStatsElements {
  tab: HTMLButtonElement;
  block: HTMLElement;
  curve: HTMLCanvasElement;
  pyramid: HTMLCanvasElement;
  causes: HTMLElement;
}

/**
 * Statistics panel, three tabs: the humans (population curve, age pyramid, causes of death), the
 * animals (population of each species over time, one line per species), and the world and its
 * tribes (population, food, knowledge, domestic animals, regimes).
 */
export class StatsPanel {
  private species: readonly AnimalSpecies[] = [];
  private samples: { day: number; animals: number[] }[] = [];
  private daysPerYear = 1;
  private readonly humans: HumanStatsView;
  private showHumans = true;
  private readonly history: HistoryView;
  private tab: 'humans' | 'animals' | 'world' = 'humans';

  constructor(
    private readonly panel: HTMLElement,
    toggle: HTMLButtonElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly legend: HTMLElement,
    private readonly animalTab: { tab: HTMLButtonElement; block: HTMLElement },
    private readonly humanTab: HumanStatsElements,
    private readonly worldTab: { tab: HTMLButtonElement; block: HTMLElement },
  ) {
    this.history = new HistoryView(worldTab.block, () => !panel.hidden && this.tab === 'world');
    this.humans = new HumanStatsView(humanTab.curve, humanTab.pyramid, humanTab.causes, () => getComputedStyle(panel).getPropertyValue('--hud-muted') || '#999');
    toggle.addEventListener('click', () => {
      toggle.blur();
      panel.hidden = !panel.hidden;
      this.draw();
    });
    const choose = (tab: 'humans' | 'animals' | 'world'): void => {
      this.tab = tab;
      this.showHumans = tab === 'humans';
      humanTab.block.hidden = tab !== 'humans';
      animalTab.block.hidden = tab !== 'animals';
      worldTab.block.hidden = tab !== 'world';
      humanTab.tab.classList.toggle('active', tab === 'humans');
      animalTab.tab.classList.toggle('active', tab === 'animals');
      worldTab.tab.classList.toggle('active', tab === 'world');
      this.draw();
    };
    humanTab.tab.addEventListener('click', () => choose('humans'));
    animalTab.tab.addEventListener('click', () => choose('animals'));
    worldTab.tab.addEventListener('click', () => choose('world'));
  }

  /** New human statistics (once a game day). */
  addHumans(stats: HumanStats): void {
    this.humans.add(stats);
    if (!this.panel.hidden && this.showHumans) this.humans.draw();
  }

  /** Statistics of the world and of each tribe at a moment (every few game days). */
  addHistory(sample: HistorySample): void {
    this.history.add(sample);
  }

  reset(species: readonly AnimalSpecies[], daysPerYear: number): void {
    this.history.reset(daysPerYear);
    this.species = species;
    this.daysPerYear = daysPerYear;
    this.humans.reset(daysPerYear);
    this.samples = [];
    this.legend.replaceChildren(
      ...species.map((animal, k) => {
        const item = document.createElement('span');
        item.className = 'legend-item';
        item.dataset['index'] = String(k);
        const swatch = document.createElement('i');
        swatch.style.background = lineColor(k);
        item.append(swatch, document.createTextNode(animal.name));
        return item;
      }),
    );
    this.draw();
  }

  add(samples: readonly { day: number; animals: number[] }[]): void {
    this.samples.push(...samples);
    this.legend.querySelectorAll<HTMLElement>('.legend-item').forEach((item) => {
      const k = Number(item.dataset['index']);
      const last = this.samples.at(-1)?.animals[k] ?? 0;
      item.title = `${this.species[k]?.name ?? ''} : ${last}`;
      item.lastChild!.textContent = `${this.species[k]?.name ?? ''} ${last}`;
    });
    this.draw();
  }

  private draw(): void {
    if (this.panel.hidden) return;
    if (this.tab === 'world') {
      this.history.draw();
      return;
    }
    if (this.showHumans) {
      this.humans.draw();
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const plotW = width - PADDING.left - PADDING.right;
    const plotH = height - PADDING.top - PADDING.bottom;
    const lastDay = Math.max(this.daysPerYear, this.samples.at(-1)?.day ?? 0);
    const maxCount = Math.max(1, ...this.samples.flatMap((sample) => sample.animals));
    const style = getComputedStyle(this.panel);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = style.getPropertyValue('--hud-muted') || '#999';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let g = 0; g <= GRID_LINES; g++) {
      const y = PADDING.top + plotH - (g / GRID_LINES) * plotH;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(width - PADDING.right, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round((g / GRID_LINES) * maxCount)), PADDING.left - 6, y + 4);
    }
    ctx.textAlign = 'center';
    const years = lastDay / this.daysPerYear;
    ctx.fillText('An 1', PADDING.left, height - 6);
    ctx.fillText(`An ${Math.floor(years) + 1}`, width - PADDING.right - 12, height - 6);
    const toX = (day: number): number => PADDING.left + (day / lastDay) * plotW;
    const toY = (count: number): number => PADDING.top + plotH - (count / maxCount) * plotH;
    this.species.forEach((_animal, k) => {
      ctx.strokeStyle = lineColor(k);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      this.samples.forEach((sample, i) => {
        const x = toX(sample.day);
        const y = toY(sample.animals[k] ?? 0);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }
}
