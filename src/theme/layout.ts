/** Shared page rhythm and space reserved for the native bottom safe area. */
export const layout = {
  contentWidth: 640,
  gutter: 20,
  sectionGap: 24,
  cardRadius: 18,
  controlRadius: 12,
} as const;

export const tabBarHeight = (bottomInset: number) =>
  60 + Math.max(bottomInset, 12);

export const stackedMiniPlayer = (width: number, fontScale: number) =>
  width < 480 || fontScale > 1.2;
export const miniPlayerClearance = (width: number, fontScale: number) =>
  (stackedMiniPlayer(width, fontScale) ? 128 : 88) * Math.max(1, fontScale) +
  16;
