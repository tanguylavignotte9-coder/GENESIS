import { Water } from '../../sim/systems/world/hydrology';
import type { WorldSnapshot } from '../../shared/messages';
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
} as const;

/** Precomputed palette for one world. */
export interface Palette {
  biomes: Rgb[];
  river: Rgb;
  lake: Rgb;
}

export function buildPalette(world: WorldSnapshot): Palette {
  return {
    biomes: world.biomes.biomes.map((biome) => parseHexColor(biome.color)),
    river: parseHexColor(world.biomes.water.river.color),
    lake: parseHexColor(world.biomes.water.lake.color),
  };
}

/** Writes the RGBA color of tile (x, y) into `out` at `offset`. */
export function writeTileColor(world: WorldSnapshot, palette: Palette, x: number, y: number, out: Uint8Array, offset: number): void {
  const size = world.size;
  const index = y * size + x;
  const water = world.water[index];
  const base =
    water === Water.River ? palette.river : water === Water.Lake ? palette.lake : (palette.biomes[world.biome[index] ?? 0] ?? palette.lake);

  let brightness = 1 + (tileHash(x, y, 1) * 2 - 1) * SHADING.tileNoise;
  if (world.ocean[index] === 1) {
    const depth = Math.min(1, -(world.elevation[index] ?? 0) / SHADING.oceanDepthForDarkest);
    brightness *= 1 - depth * (1 - SHADING.deepestOceanFactor);
  } else if (water !== Water.Lake) {
    brightness *= 1 + relief(world, x, y);
  }
  const tint = (tileHash(x, y, 2) * 2 - 1) * SHADING.tintNoise;
  out[offset] = clampByte(base[0] * brightness + tint);
  out[offset + 1] = clampByte(base[1] * brightness + tint);
  out[offset + 2] = clampByte(base[2] * brightness - tint);
  out[offset + 3] = 255;
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
