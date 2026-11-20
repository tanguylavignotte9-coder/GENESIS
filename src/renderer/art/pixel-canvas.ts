import { BufferImageSource, Texture } from 'pixi.js';
import { parseHexColor, type Rgb } from '../color';

/** A tiny RGBA image drawn pixel by pixel, turned into a crisp (nearest-neighbour) texture. */
export class PixelCanvas {
  readonly pixels: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8Array(width * height * 4);
  }

  set(x: number, y: number, color: Rgb, shade = 1): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const at = (y * this.width + x) * 4;
    this.pixels[at] = clamp(color[0] * shade);
    this.pixels[at + 1] = clamp(color[1] * shade);
    this.pixels[at + 2] = clamp(color[2] * shade);
    this.pixels[at + 3] = 255;
  }

  isSet(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && this.pixels[(y * this.width + x) * 4 + 3] !== 0;
  }

  /** Copies the drawn pixels of another canvas at (dx, dy). */
  blit(other: PixelCanvas, dx: number, dy: number): void {
    for (let y = 0; y < other.height; y++) {
      for (let x = 0; x < other.width; x++) {
        const from = (y * other.width + x) * 4;
        if (other.pixels[from + 3] === 0) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
        const to = (ty * this.width + tx) * 4;
        for (let c = 0; c < 4; c++) this.pixels[to + c] = other.pixels[from + c]!;
      }
    }
  }

  toTexture(): Texture {
    const source = new BufferImageSource({ resource: this.pixels, width: this.width, height: this.height, format: 'rgba8unorm' });
    source.scaleMode = 'nearest';
    return new Texture({ source });
  }
}

export function color(hex: string): Rgb {
  return parseHexColor(hex);
}

function clamp(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}
