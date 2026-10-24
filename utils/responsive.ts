// utils/responsive.ts
// Shared sizing rules so screens look right from small phones to tablets.
// Phones use the full width. On wide screens (tablets, foldables) content stays in a readable column.

export const MAX_CONTENT_WIDTH = 560;

/** Add to a screen's outer style: full width on phones, a centered column on wide screens. */
export const contentColumn = {
  width: "100%",
  maxWidth: MAX_CONTENT_WIDTH,
  alignSelf: "center",
} as const;