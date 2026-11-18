import type { Container } from 'pixi.js';
import { VIEW } from '../view-settings';
import type { TileRect } from './map-view';

const MS_PER_SECOND = 1000;
const PAN_KEYS: Record<string, [number, number]> = {
  // event.code is the physical key: KeyW/KeyA are Z/Q on an AZERTY keyboard (W/A on QWERTY).
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/**
 * 2D camera over the map: drag with the mouse, ZQSD / arrow keys, zoom with the wheel
 * (around the cursor). Coordinates: tiles; zoom = screen pixels per tile.
 */
export class Camera {
  private centerX = 0;
  private centerY = 0;
  private zoom = 1;
  private mapSize = 1;
  private dragging: { x: number; y: number } | null = null;
  private dragStart = { x: 0, y: 0 };
  private readonly pressed = new Set<string>();
  /** When set, the camera stays centered on what it returns (null = target gone). */
  private follow: (() => { x: number; y: number } | null) | null = null;
  onFollowEnd: () => void = () => undefined;

  constructor(
    private readonly element: HTMLElement,
    private readonly target: Container,
  ) {
    element.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    window.addEventListener('pointermove', (event) => this.onPointerMove(event));
    window.addEventListener('pointerup', () => (this.dragging = null));
    element.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    window.addEventListener('keydown', (event) => this.onKey(event, true));
    window.addEventListener('keyup', (event) => this.onKey(event, false));
    window.addEventListener('blur', () => this.pressed.clear());
  }

  get pixelsPerTile(): number {
    return this.zoom;
  }

  /** Keeps the view centered on a moving target until the player moves the camera. */
  startFollowing(target: () => { x: number; y: number } | null): void {
    this.follow = target;
  }

  stopFollowing(): void {
    if (!this.follow) return;
    this.follow = null;
    this.onFollowEnd();
  }

  get isDragging(): boolean {
    return this.dragging !== null && Math.hypot(this.dragging.x - this.dragStart.x, this.dragging.y - this.dragStart.y) > VIEW.clickMaxPixels;
  }

  /** Shows the whole map, centered. */
  reset(mapSize: number): void {
    this.mapSize = mapSize;
    this.centerX = mapSize / 2;
    this.centerY = mapSize / 2;
    this.zoom = this.minZoom();
    this.apply();
  }

  /** Centers the view on a tile, zooming in to at least `VIEW.focusPixelsPerTile`. */
  focusOn(x: number, y: number): void {
    this.centerX = x + 0.5;
    this.centerY = y + 0.5;
    this.zoom = Math.max(this.zoom, VIEW.focusPixelsPerTile);
    this.apply();
  }

  /** Moves with the keyboard; call every frame. */
  update(elapsedMs: number): void {
    let dx = 0;
    let dy = 0;
    for (const code of this.pressed) {
      const direction = PAN_KEYS[code];
      if (direction) {
        dx += direction[0];
        dy += direction[1];
      }
    }
    if (dx !== 0 || dy !== 0) this.stopFollowing();
    if (this.follow) {
      const target = this.follow();
      if (target) {
        this.centerX = target.x;
        this.centerY = target.y;
      } else {
        this.stopFollowing();
      }
    }
    if (dx !== 0 || dy !== 0) {
      const step = (VIEW.keyboardPanPixelsPerSecond * elapsedMs) / MS_PER_SECOND / this.zoom;
      this.centerX += dx * step;
      this.centerY += dy * step;
    }
    this.apply();
  }

  /** Tile coordinates (fractional) under a screen point. */
  screenToTile(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: this.centerX + (screenX - this.width() / 2) / this.zoom,
      y: this.centerY + (screenY - this.height() / 2) / this.zoom,
    };
  }

  visibleTiles(): TileRect {
    const topLeft = this.screenToTile(0, 0);
    const bottomRight = this.screenToTile(this.width(), this.height());
    return { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y };
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.dragging = { x: event.clientX, y: event.clientY };
    this.dragStart = { x: event.clientX, y: event.clientY };
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    if (event.clientX !== this.dragging.x || event.clientY !== this.dragging.y) {
      if (Math.hypot(event.clientX - this.dragStart.x, event.clientY - this.dragStart.y) > VIEW.clickMaxPixels) this.stopFollowing();
      else return;
    }
    this.centerX -= (event.clientX - this.dragging.x) / this.zoom;
    this.centerY -= (event.clientY - this.dragging.y) / this.zoom;
    this.dragging = { x: event.clientX, y: event.clientY };
    this.apply();
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.element.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const before = this.screenToTile(sx, sy);
    const factor = Math.pow(VIEW.wheelZoomFactor, -event.deltaY / VIEW.wheelDeltaPerNotch);
    this.zoom = clamp(this.zoom * factor, this.minZoom(), VIEW.maxPixelsPerTile);
    // Keep the tile under the cursor in place.
    this.centerX = before.x - (sx - this.width() / 2) / this.zoom;
    this.centerY = before.y - (sy - this.height() / 2) / this.zoom;
    this.apply();
  }

  private onKey(event: KeyboardEvent, down: boolean): void {
    if (event.target instanceof HTMLInputElement) return;
    if (!(event.code in PAN_KEYS)) return;
    if (down) this.pressed.add(event.code);
    else this.pressed.delete(event.code);
    event.preventDefault();
  }

  private minZoom(): number {
    return (Math.min(this.width(), this.height()) * VIEW.minZoomFillRatio) / this.mapSize;
  }

  /** Clamps the camera to the map and moves the target container. */
  private apply(): void {
    this.zoom = clamp(this.zoom, this.minZoom(), VIEW.maxPixelsPerTile);
    this.centerX = clamp(this.centerX, 0, this.mapSize);
    this.centerY = clamp(this.centerY, 0, this.mapSize);
    this.target.scale.set(this.zoom);
    this.target.position.set(this.width() / 2 - this.centerX * this.zoom, this.height() / 2 - this.centerY * this.zoom);
  }

  private width(): number {
    return this.element.clientWidth;
  }

  private height(): number {
    return this.element.clientHeight;
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
