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

/** One horizontal row; large text can grow the copy without moving the controls. */
export const miniPlayerHeight = (fontScale: number) =>
  18 + Math.max(44, Math.ceil((18 * (fontScale > 1.3 ? 2 : 1) + 16) * Math.max(1, fontScale)));
export const miniPlayerClearance = (fontScale: number) => miniPlayerHeight(fontScale) + 24;
