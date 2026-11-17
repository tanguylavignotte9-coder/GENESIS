import { Water } from '../../sim/systems/world/hydrology';
import type { ClimateSnapshot, WorldSnapshot } from '../../shared/messages';
import { parseHexColor, tileHash, type Rgb } from '../color';

/** Visual tuning of the map colors (display only). */
const SHADING = {
  /** Brightness change per meter of slope between neighbours (light from the north-west). */
  reliefPerMeter: 1 / 350,
  maxRelief: 0.35,
  /** Ocean gets darker with depth, down to this factor. */
  deepestOceanFactor: 0.65,
  oceanDepthForDarkest: 5000,
  /** Random brightness variation per tile (± this). */
  tileNoise: 0.05,
  /** Random per-channel tint per tile (± this, 0..255 scale). */
  tintNoise: 4,
  /** How far vegetation turns to the "dry" color when it is much drier than usual. */
  dryStrength: 0.85,
  /** Humidity below which a tile counts as fully dry, relative to its yearly mean. */
  dryRange: 0.6,
  /** Opacity of a full snow cover. */
  snowOpacity: 0.92,
  /** Snow is shown with a slightly uneven edge: ± this share of cover per tile. */
  snowNoise: 0.15,
} as const;

const PERCENT = 100;

/** Precomputed palette for one world. */
export interface Palette {
  biomes: Rgb[];
  vegetation: boolean[];
  river: Rgb;
  lake: Rgb;
  snow: Rgb;
  dry: Rgb;
}

export function buildPalette(world: WorldSnapshot): Palette {
  return {
    biomes: world.biomes.biomes.map((biome) => parseHexColor(biome.color)),
    vegetation: world.biomes.biomes.map((biome) => biome.vegetation === true),
    snow: parseHexColor(world.biomes.seasonColors.snow),
    dry: parseHexColor(world.biomes.seasonColors.dryVegetation),
    river: parseHexColor(world.biomes.water.river.color),
    lake: parseHexColor(world.biomes.water.lake.color),
  };
}

/** Writes the RGBA color of tile (x, y) into `out` at `offset`, with today's season if `climate` is given. */
export function writeTileColor(
  world: WorldSnapshot,
  climate: ClimateSnapshot | null,
  palette: Palette,
  x: number,
  y: number,
  out: Uint8Array,
  offset: number,
): void {
  const index = y * world.size + x;
  const water = world.water[index];
  const biome = world.biome[index] ?? 0;
  let [r, g, b] =
    water === Water.River ? palette.river : water === Water.Lake ? palette.lake : (palette.biomes[biome] ?? palette.lake);

  if (climate && world.ocean[index] === 0) {
    if (water === Water.None && palette.vegetation[biome]) {
      const dry = dryness(world.humidity[index] ?? 0, (climate.humidity[index] ?? 0) / PERCENT) * SHADING.dryStrength;
      [r, g, b] = mix([r, g, b], palette.dry, dry);
    }
    const snow = (climate.snow[index] ?? 0) / PERCENT;
    if (snow > 0) {
      const edge = 1 + (tileHash(x, y, 3) * 2 - 1) * SHADING.snowNoise;
      [r, g, b] = mix([r, g, b], palette.snow, Math.min(1, snow * edge) * SHADING.snowOpacity);
    }
  }

  let brightness = 1 + (tileHash(x, y, 1) * 2 - 1) * SHADING.tileNoise;
  if (world.ocean[index] === 1) {
    const depth = Math.min(1, -(world.elevation[index] ?? 0) / SHADING.oceanDepthForDarkest);
    brightness *= 1 - depth * (1 - SHADING.deepestOceanFactor);
  } else if (water !== Water.Lake) {
    brightness *= 1 + relief(world, x, y);
  }
  const tint = (tileHash(x, y, 2) * 2 - 1) * SHADING.tintNoise;
  out[offset] = clampByte(r * brightness + tint);
  out[offset + 1] = clampByte(g * brightness + tint);
  out[offset + 2] = clampByte(b * brightness - tint);
  out[offset + 3] = 255;
}

/** 0 when the tile is as humid as usual (or more), up to 1 when it is much drier. */
function dryness(mean: number, now: number): number {
  if (now >= mean || mean <= 0) return 0;
  return Math.min(1, (mean - now) / (mean * SHADING.dryRange));
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Hill shading: slopes facing the north-west are lit, the others are shadowed. */
function relief(world: WorldSnapshot, x: number, y: number): number {
  const size = world.size;
  const at = (tx: number, ty: number): number => {
    const cx = Math.min(size - 1, Math.max(0, tx));
    const cy = Math.min(size - 1, Math.max(0, ty));
    return Math.max(0, world.elevation[cy * size + cx] ?? 0);
  };
  const slope = at(x - 1, y - 1) - at(x + 1, y + 1);
  return Math.max(-SHADING.maxRelief, Math.min(SHADING.maxRelief, slope * SHADING.reliefPerMeter));
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}
