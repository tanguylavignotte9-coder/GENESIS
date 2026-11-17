import { Water } from '../../sim/systems/world/hydrology';
import type { ClimateSnapshot, WorldSnapshot } from '../../shared/messages';
import { VIEW } from '../view-settings';

const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const PERCENT = 100;

/** Floating box describing the tile under the mouse. */
export class Tooltip {
  constructor(private readonly element: HTMLElement) {}

  hide(): void {
    this.element.hidden = true;
  }

  show(world: WorldSnapshot, climate: ClimateSnapshot | null, tileX: number, tileY: number, screenX: number, screenY: number): void {
    const x = Math.floor(tileX);
    const y = Math.floor(tileY);
    if (x < 0 || y < 0 || x >= world.size || y >= world.size) {
      this.hide();
      return;
    }
    this.element.replaceChildren(...describeTile(world, climate, x, y).map(toLine));
    this.element.hidden = false;
    const offset = VIEW.tooltipOffset;
    const flipX = screenX + offset + this.element.offsetWidth > window.innerWidth;
    const flipY = screenY + offset + this.element.offsetHeight > window.innerHeight;
    this.element.style.left = `${flipX ? screenX - offset - this.element.offsetWidth : screenX + offset}px`;
    this.element.style.top = `${flipY ? screenY - offset - this.element.offsetHeight : screenY + offset}px`;
  }
}

function toLine(text: string, index: number): HTMLElement {
  const line = document.createElement('div');
  line.textContent = text;
  if (index === 0) line.className = 'tooltip-title';
  return line;
}

/** Lines shown for a tile, in French. */
export function describeTile(world: WorldSnapshot, climate: ClimateSnapshot | null, x: number, y: number): string[] {
  const index = y * world.size + x;
  const biome = world.biomes.biomes[world.biome[index] ?? 0]?.name ?? '?';
  const water = world.water[index];
  const title =
    water === Water.Lake
      ? world.biomes.water.lake.name
      : water === Water.River
        ? `${biome} · ${world.biomes.water.river.name}`
        : biome;
  const elevation = world.elevation[index] ?? 0;
  const meanTemperature = fr.format(world.temperature[index] ?? 0);
  const meanHumidity = fr.format((world.humidity[index] ?? 0) * PERCENT);
  const lines = [title, world.ocean[index] === 1 ? `Profondeur : ${fr.format(-elevation)} m` : `Altitude : ${fr.format(elevation)} m`];
  if (climate) {
    lines.push(`Température : ${fr.format(climate.temperature[index] ?? 0)} °C (moyenne annuelle : ${meanTemperature} °C)`);
    lines.push(`Humidité : ${fr.format(climate.humidity[index] ?? 0)} % (moyenne : ${meanHumidity} %)`);
    const snow = climate.snow[index] ?? 0;
    if (snow > 0) lines.push(`Neige : ${fr.format(snow)} %`);
    const anomaly = climate.anomalyNames[(climate.anomaly[index] ?? 0) - 1];
    if (anomaly) lines.push(`Année anormale : ${anomaly}`);
  } else {
    lines.push(`Température : ${meanTemperature} °C (moyenne annuelle)`, `Humidité : ${meanHumidity} %`);
  }
  lines.push(`Position : ${x}, ${y}`);
  return lines;
}
