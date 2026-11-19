import type { HumanStats } from '../../shared/messages';

const PADDING = { left: 36, right: 10, top: 8, bottom: 20 };
const GRID_LINES = 4;
const LINE_COLOR = '#ffd27a';
const MEN_COLOR = '#7fb2ff';
const WOMEN_COLOR = '#ff9fc4';
const BAR_GAP = 1;

function canvas2d(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.font = '11px system-ui, sans-serif';
  return { ctx, width, height };
}

/**
 * Statistics of the humans: the population curve (every census), the age pyramid of the living
 * (men left, women right) and the causes of death since the beginning.
 */
export class HumanStatsView {
  private samples: { day: number; humans: number }[] = [];
  private latest: HumanStats | null = null;
  private daysPerYear = 1;

  constructor(
    private readonly curve: HTMLCanvasElement,
    private readonly pyramid: HTMLCanvasElement,
    private readonly causes: HTMLElement,
    private readonly muted: () => string,
  ) {}

  reset(daysPerYear: number): void {
    this.daysPerYear = daysPerYear;
    this.samples = [];
    this.latest = null;
  }

  add(stats: HumanStats): void {
    this.samples.push(...stats.samples);
    this.latest = stats;
  }

  draw(): void {
    this.drawCurve();
    this.drawPyramid();
    this.drawCauses();
  }

  private drawCurve(): void {
    const area = canvas2d(this.curve);
    if (!area) return;
    const { ctx, width, height } = area;
    const plotW = width - PADDING.left - PADDING.right;
    const plotH = height - PADDING.top - PADDING.bottom;
    const lastDay = Math.max(this.daysPerYear, this.samples.at(-1)?.day ?? 0);
    const max = Math.max(1, ...this.samples.map((sample) => sample.humans));
    ctx.fillStyle = this.muted();
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
    ctx.fillText('An 1', PADDING.left, height - 5);
    ctx.fillText(`An ${Math.floor(lastDay / this.daysPerYear) + 1}`, width - PADDING.right - 12, height - 5);
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    this.samples.forEach((sample, i) => {
      const x = PADDING.left + (sample.day / lastDay) * plotW;
      const y = PADDING.top + plotH - (sample.humans / max) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  private drawPyramid(): void {
    const area = canvas2d(this.pyramid);
    const stats = this.latest;
    if (!area || !stats) return;
    const { ctx, width, height } = area;
    const bands = Math.max(stats.men.length, stats.women.length, 1);
    const max = Math.max(1, ...stats.men, ...stats.women);
    const label = 30;
    const half = (width - label) / 2;
    const rowH = height / bands;
    ctx.textAlign = 'center';
    for (let band = 0; band < bands; band++) {
      const y = height - (band + 1) * rowH;
      const men = stats.men[band] ?? 0;
      const women = stats.women[band] ?? 0;
      ctx.fillStyle = MEN_COLOR;
      ctx.fillRect(half - (men / max) * half, y + BAR_GAP, (men / max) * half, rowH - 2 * BAR_GAP);
      ctx.fillStyle = WOMEN_COLOR;
      ctx.fillRect(half + label, y + BAR_GAP, (women / max) * half, rowH - 2 * BAR_GAP);
      if (rowH >= 9 && band % Math.max(1, Math.ceil(10 / rowH)) === 0) {
        ctx.fillStyle = this.muted();
        ctx.fillText(String(band * stats.bandYears), half + label / 2, y + rowH - 1);
      }
    }
  }

  private drawCauses(): void {
    const stats = this.latest;
    if (!stats) return;
    const total = stats.deaths.reduce((sum, line) => sum + line.count, 0);
    const max = Math.max(1, ...stats.deaths.map((line) => line.count));
    const rows = stats.deaths
      .slice()
      .sort((a, b) => b.count - a.count)
      .map((line) => {
        const row = document.createElement('div');
        row.className = 'cause-row';
        const name = document.createElement('span');
        name.className = 'cause-name';
        name.textContent = line.cause;
        const bar = document.createElement('span');
        bar.className = 'cause-bar';
        bar.style.width = `${Math.max(2, (line.count / max) * 70)}px`;
        row.append(name, bar, document.createTextNode(` ${line.count}`));
        return row;
      });
    const summary = document.createElement('div');
    summary.className = 'muted';
    summary.textContent = `${total} mort(s), ${stats.births} naissance(s)`;
    this.causes.replaceChildren(summary, ...rows);
  }
}
