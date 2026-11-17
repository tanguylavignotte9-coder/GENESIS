/** Display settings (not gameplay): chunking, camera limits and speeds. */
export const VIEW = {
  /** Tiles per side of a map chunk (one texture each). Power of two for mipmaps. */
  chunkTiles: 64,
  /** Chunks built per frame at most, so the window never freezes. */
  chunksPerFrame: 12,
  /** Closest zoom: pixels per tile. */
  maxPixelsPerTile: 48,
  /** Farthest zoom: the whole map fills this share of the window. */
  minZoomFillRatio: 0.9,
  /** Zoom change per wheel "notch" (deltaY = 100). */
  wheelZoomFactor: 1.2,
  wheelDeltaPerNotch: 100,
  /** Keyboard panning speed, in screen pixels per second. */
  keyboardPanPixelsPerSecond: 700,
  /** Tooltip offset from the mouse cursor, in pixels. */
  tooltipOffset: 16,
} as const;
