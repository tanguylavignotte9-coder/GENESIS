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
  /** Zoom used when the camera jumps to a journal event. */
  focusPixelsPerTile: 3,
  /** Plants are drawn from this zoom (pixels per tile) on. */
  plantMinPixelsPerTile: 7,
  /** Animals are drawn from this zoom on. */
  animalMinPixelsPerTile: 3,
  /** Plant chunks built per frame at most. */
  plantChunksPerFrame: 3,
  /** Mouse distance (tiles) under which a building is "under the cursor". */
  buildingPickTiles: 0.7,
  /** Mouse distance (tiles) under which an animal is "under the cursor". */
  animalPickTiles: 0.8,
  /** Click = pointer released within this many pixels of where it was pressed. */
  clickMaxPixels: 5,
  /** How often the tooltip asks the simulation for fresh details (ms). */
  inspectEveryMs: 400,
  /** Tooltip offset from the mouse cursor, in pixels. */
  tooltipOffset: 16,
  /** Smooth movement: below this real duration of a simulation step, beings jump from tile to tile. */
  glideMinStepMs: 40,
  /** A move longer than this (tiles) is a jump, not a walk. */
  glideMaxTiles: 4,
  /** Longest glide (ms): one step at x1 for the slowest beings (animals step once a game hour). */
  glideMaxStepMs: 25000,
  /** Weight of each new measure of the simulation's pace (0..1). */
  paceSmoothing: 0.2,
  /** Walking animation: duration of one stride frame (ms) and height of the bounce (tiles). */
  walkFrameMs: 200,
  walkBounceTiles: 0.04,
} as const;
