import type { HistorySample } from '../../shared/messages';
import { tribeColorCss } from '../art/tribe';

const PADDING = { left: 44, right: 10, top: 10, bottom: 22 };
const GRID_LINES = 4;
/** Samples kept (one every 10 game days: about 1 000 years). */
const MAX_SAMPLES = 4000;

const METRICS = [
  { id: 'population', label: 'Population' },
  { id: 'food', label: 'Réserves de nourriture' },
  { id: 'knowledge', label: 'Savoirs connus' },
  { id: 'herd', label: 'Bêtes domestiques' },
] as const;
type Metric = (typeof METRICS)[number]['id'];

/**
 * Statistics of the world and of each tribe: curves over time (population, food in store,
 * knowledge known, domestic animals), for the world (one line per tribe and the total) or for one
 * tribe, and a table of the tribes now (with their regime). Camps of a lone exile are not tribes.
 */
export class HistoryView {
  private samples: HistorySample[] = [];
  private metric: Metric = 'population';
  private tribe = -1;
  private daysPerYear = 40;
  private readonly metricSelect: HTMLSelectElement;
  private readonly tribeSelect: HTMLSelectElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly table: HTMLElement;
  private tribeKey = '';

  constructor(private readonly block: HTMLElement, private readonly visible: () => boolean) {
    const controls = document.createElement('div');
    controls.className = 'history-controls';
    this.metricSelect = document.createElement('select');
    this.metricSelect.append(...METRICS.map((m) => new Option(m.label, m.id)));
    this.tribeSelect = document.createElement('select');
    this.tribeSelect.append(new Option('Le monde', '-1'));
    this.metricSelect.addEventListener('change', () => {
      this.metric = this.metricSelect.value as Metric;
      this.draw();
    });
    this.tribeSelect.addEventListener('change', () => {
      this.tribe = Number(this.tribeSelect.value);
      this.draw();
    });
    controls.append(this.metricSelect, this.tribeSelect);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'history-chart';
    this.table = document.createElement('div');
    this.table.className = 'history-table';
    block.append(controls, this.canvas, this.table);
  }

  reset(daysPerYear: number): void {
    this.daysPerYear = Math.max(1, daysPerYear);
    this.samples = [];
    this.tribe = -1;
    this.tribeKey = '';
    this.tribeSelect.replaceChildren(new Option('Le monde', '-1'));
    this.draw();
  }

  add(sample: HistorySample): void {
    this.samples.push(sample);
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    this.updateTribes();
    if (this.visible()) this.draw();
  }

  private updateTribes(): void {
    const names = new Map<number, string>();
    for (const sample of this.samples) for (const t of sample.perTribe) names.set(t.id, t.name);
    const key = [...names.keys()].join(',');
    if (key === this.tribeKey) return;
    this.tribeKey = key;
    this.tribeSelect.replaceChildren(new Option('Le monde', '-1'), ...[...names.entries()].sort((a, b) => a[0] - b[0]).map(([id, name]) => new Option(name, String(id))));
    this.tribeSelect.value = String(this.tribe);
  }

  /** Lines to draw: [colour, values per sample (NaN where the tribe did not exist)]. */
  private series(): { color: string; label: string; values: number[] }[] {
    const metric = this.metric;
    const value = (sample: HistorySample, id: number): number => {
      const t = sample.perTribe.find((x) => x.id === id);
      return t ? t[metric] : Number.NaN;
    };
    const ids = new Set<number>();
    for (const sample of this.samples) for (const t of sample.perTribe) ids.add(t.id);
    if (this.tribe >= 0) return [{ color: tribeColorCss(this.tribe), label: this.tribeSelect.selectedOptions[0]?.text ?? '', values: this.samples.map((s) => value(s, this.tribe)) }];
    const lines = [...ids].sort((a, b) => a - b).map((id) => ({ color: tribeColorCss(id), label: '', values: this.samples.map((s) => value(s, id)) }));
    lines.push({ color: '#ffffff', label: 'Monde', values: this.samples.map((s) => s[metric]) });
    return lines;
  }

  draw(): void {
    if (!this.visible()) return;
    this.drawChart();
    this.drawTable();
  }

  private drawChart(): void {
    const canvas = this.canvas;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 440;
    const height = canvas.clientHeight || 170;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const lines = this.series();
    const firstDay = this.samples[0]?.day ?? 0;
    const lastDay = Math.max(firstDay + this.daysPerYear, this.samples.at(-1)?.day ?? 0);
    const max = Math.max(1, ...lines.flatMap((line) => line.values.filter((v) => Number.isFinite(v))));
    const plotW = width - PADDING.left - PADDING.right;
    const plotH = height - PADDING.top - PADDING.bottom;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#9aa3b2';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let g = 0; g <= GRID_LINES; g++) {
      const y = PADDING.top + plotH - (g / GRID_LINES) * plotH;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(width - PADDING.right, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round((g / GRID_LINES) * max)), PADDING.left - 6, y + 4);
    }
    ctx.textAlign = 'center';
    ctx.fillText(`An ${Math.floor(firstDay / this.daysPerYear) + 1}`, PADDING.left + 14, height - 6);
    ctx.fillText(`An ${Math.floor(lastDay / this.daysPerYear) + 1}`, width - PADDING.right - 14, height - 6);
    const toX = (day: number): number => PADDING.left + ((day - firstDay) / Math.max(1, lastDay - firstDay)) * plotW;
    const toY = (v: number): number => PADDING.top + plotH - (v / max) * plotH;
    for (const line of lines) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.label === 'Monde' ? 2 : 1.4;
      ctx.beginPath();
      let drawing = false;
      line.values.forEach((v, i) => {
        if (!Number.isFinite(v)) {
          drawing = false;
          return;
        }
        const x = toX(this.samples[i]!.day);
        if (!drawing) ctx.moveTo(x, toY(v));
        else ctx.lineTo(x, toY(v));
        drawing = true;
      });
      ctx.stroke();
    }
  }

  private drawTable(): void {
    const last = this.samples.at(-1);
    this.table.replaceChildren();
    if (!last) return;
    const summary = document.createElement('div');
    summary.className = 'muted';
    summary.textContent = `Monde : ${last.population} habitants, ${last.tribes} tribu(s)${last.exileCamps > 0 ? ` et ${last.exileCamps} camp(s) d’exilé` : ''}, ${last.knowledge} savoir(s) connu(s) quelque part, ${last.herd} bête(s) domestique(s).`;
    const table = document.createElement('table');
    table.className = 'political-table';
    const head = document.createElement('tr');
    for (const title of ['Tribu', 'Pop.', 'Réserves', 'Savoirs', 'Bêtes', 'Régime']) {
      const th = document.createElement('th');
      th.textContent = title;
      head.append(th);
    }
    table.append(head);
    for (const t of [...last.perTribe].sort((a, b) => b.population - a.population)) {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      const swatch = document.createElement('span');
      swatch.className = 'relation-swatch';
      swatch.style.background = tribeColorCss(t.id);
      name.append(swatch, document.createTextNode(t.name));
      row.append(name);
      for (const value of [t.population, t.food, t.knowledge, t.herd, t.regime]) {
        const td = document.createElement('td');
        td.textContent = String(value);
        row.append(td);
      }
      table.append(row);
    }
    this.table.append(summary, table);
  }
}
